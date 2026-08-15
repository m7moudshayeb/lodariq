import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDrizzleControlPlaneRepository,
  type ControlPlaneRepository,
  type LodariqDatabase,
  type RequestEmailVerificationChallengeInput,
  type RequestSetPasswordChallengeInput,
} from '@lodariq/database';
import * as databaseSchema from '@lodariq/database/schema';
import { listCheckedInSqlPaths } from './migration-test-utils.js';
import {
  createDisposablePostgresFixture,
  DISPOSABLE_POSTGRES_ENABLED,
  runtimeRoleGrantsSql,
  type DisposablePostgresFixture,
} from './postgres16-test-harness.js';

const requireFromDatabase = createRequire(
  fileURLToPath(new URL('../../../database/package.json', import.meta.url)),
);
const { drizzle: createNodePgDatabase } = requireFromDatabase(
  'drizzle-orm/node-postgres',
) as NodePgDrizzleModule;

interface NodePgDrizzleModule {
  drizzle(client: Pool, config: { schema: typeof databaseSchema }): unknown;
}

let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'owned-auth recovery under the restricted PostgreSQL 16 runtime role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('auth');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedIdentitySql());
        runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl, max: 6 });
        const database = createNodePgDatabase(runtimePool, { schema: databaseSchema });
        repository = createDrizzleControlPlaneRepository(database as LodariqDatabase);
      } catch (error) {
        await runtimePool?.end();
        fixture.cleanup();
        throw error;
      }
    }, 60_000);

    afterAll(async () => {
      await runtimePool?.end();
      fixture?.cleanup();
    }, 30_000);

    it('atomically replaces a prior challenge and outbox row under forced RLS', async () => {
      const first = requestInput('first', 'recovery@example.com', '2026-08-15T10:00:00.000Z');
      const second = requestInput('second', 'recovery@example.com', '2026-08-15T10:01:00.000Z');

      await expect(requireRepository().requestSetPasswordChallenge(first)).resolves.toEqual({
        status: 'queued',
      });
      await expect(requireRepository().requestSetPasswordChallenge(second)).resolves.toEqual({
        status: 'queued',
      });

      expect(ownerScalar('select count(*) from set_password_challenges;')).toBe('2');
      expect(
        ownerScalar('select count(*) from set_password_challenges where used_at is null;'),
      ).toBe('1');
      expect(ownerScalar('select count(*) from set_password_outbox;')).toBe('2');
      expect(
        ownerScalar(
          "select count(*) from set_password_outbox where terminal_at is not null and last_error = 'superseded';",
        ),
      ).toBe('1');
      await expect(
        requireRepository().resolveSetPasswordChallenge(
          first.challenge.id,
          first.challenge.tokenHash,
          '2026-08-15T10:02:00.000Z',
        ),
      ).resolves.toBeNull();
      await expect(
        requireRepository().resolveSetPasswordChallenge(
          second.challenge.id,
          second.challenge.tokenHash,
          '2026-08-15T10:02:00.000Z',
        ),
      ).resolves.toEqual({ userId: 'usr_auth_recovery', emailNormalized: 'recovery@example.com' });
    });

    it('serializes concurrent replacements and leaves exactly one active challenge', async () => {
      const third = requestInput('third', 'recovery@example.com', '2026-08-15T10:03:00.000Z');
      const fourth = requestInput('fourth', 'recovery@example.com', '2026-08-15T10:03:00.000Z');

      const results = await Promise.all([
        requireRepository().requestSetPasswordChallenge(third),
        requireRepository().requestSetPasswordChallenge(fourth),
      ]);

      expect(results).toEqual([{ status: 'queued' }, { status: 'queued' }]);
      expect(
        ownerScalar(
          "select count(*) from set_password_outbox where user_id = 'usr_auth_recovery';",
        ),
      ).toBe('4');
      expect(
        ownerScalar(
          "select count(*) from set_password_challenges where user_id = 'usr_auth_recovery' and used_at is null;",
        ),
      ).toBe('1');
      expect(
        ownerScalar(
          "select count(*) from set_password_outbox where user_id = 'usr_auth_recovery' and processed_at is null and terminal_at is null;",
        ),
      ).toBe('1');
    });

    it('distinguishes internal no-match and ambiguous-match outcomes without writes', async () => {
      const before = ownerScalar('select count(*) from set_password_outbox;');
      await expect(
        requireRepository().requestSetPasswordChallenge(
          requestInput('missing', 'missing@example.com', '2026-08-15T10:04:00.000Z'),
        ),
      ).resolves.toEqual({ status: 'no_match' });
      await expect(
        requireRepository().requestSetPasswordChallenge(
          requestInput('duplicate', 'duplicate@example.com', '2026-08-15T10:04:00.000Z'),
        ),
      ).resolves.toEqual({ status: 'ambiguous_match' });
      expect(ownerScalar('select count(*) from set_password_outbox;')).toBe(before);
    });

    it('consumes immediately and invalidates verification/outbox state under forced RLS', async () => {
      const request = requestInput('consume', 'consume@example.com', '2026-08-15T10:05:00.000Z');
      await expect(requireRepository().requestSetPasswordChallenge(request)).resolves.toEqual({
        status: 'queued',
      });
      requireFixture().runOwnerSql(seedPendingVerificationSql());

      await expect(
        requireRepository().consumeSetPasswordChallenge({
          challengeId: request.challenge.id,
          tokenHash: request.challenge.tokenHash,
          usedAt: '2026-08-15T10:05:01.000Z',
          credential: credentialMaterial('2026-08-15T10:05:01.000Z'),
          passwordIdentity: passwordIdentity(
            'usr_auth_consume',
            'consume',
            '2026-08-15T10:05:01.000Z',
          ),
        }),
      ).resolves.toMatchObject({
        id: 'usr_auth_consume',
        emailVerifiedAt: '2026-08-15T10:05:01.000Z',
      });

      expect(
        ownerScalar(
          "select count(*) from email_verification_challenges where user_id = 'usr_auth_consume' and used_at is null;",
        ),
      ).toBe('0');
      expect(
        ownerScalar(
          "select count(*) from auth_outbox where user_id = 'usr_auth_consume' and terminal_at is null;",
        ),
      ).toBe('0');
      expect(
        ownerScalar(
          "select count(*) from set_password_outbox where user_id = 'usr_auth_consume' and terminal_at is null;",
        ),
      ).toBe('0');
    });

    it('keeps only the latest link usable and rejects replay under forced RLS', async () => {
      const superseded = requestInput(
        'lifecycle_old',
        'recovery@example.com',
        '2026-08-15T10:06:00.000Z',
      );
      const latest = requestInput(
        'lifecycle_latest',
        'recovery@example.com',
        '2026-08-15T10:07:00.000Z',
      );
      await expect(requireRepository().requestSetPasswordChallenge(superseded)).resolves.toEqual({
        status: 'queued',
      });
      await expect(requireRepository().requestSetPasswordChallenge(latest)).resolves.toEqual({
        status: 'queued',
      });

      await expect(
        requireRepository().resolveSetPasswordChallenge(
          superseded.challenge.id,
          superseded.challenge.tokenHash,
          '2026-08-15T10:07:01.000Z',
        ),
      ).resolves.toBeNull();
      await expect(
        requireRepository().resolveSetPasswordChallenge(
          latest.challenge.id,
          latest.challenge.tokenHash,
          '2026-08-15T10:07:01.000Z',
        ),
      ).resolves.toEqual({
        userId: 'usr_auth_recovery',
        emailNormalized: 'recovery@example.com',
      });

      const consumeInput = {
        challengeId: latest.challenge.id,
        tokenHash: latest.challenge.tokenHash,
        usedAt: '2026-08-15T10:07:01.000Z',
        credential: credentialMaterial('2026-08-15T10:07:01.000Z'),
        passwordIdentity: passwordIdentity(
          'usr_auth_recovery',
          'recovery',
          '2026-08-15T10:07:01.000Z',
        ),
      };
      await expect(
        requireRepository().consumeSetPasswordChallenge(consumeInput),
      ).resolves.toMatchObject({ id: 'usr_auth_recovery' });
      await expect(
        requireRepository().consumeSetPasswordChallenge(consumeInput),
      ).resolves.toBeNull();
    });

    it('round-trips UTC instants through timestamptz and rejects the exact expiry boundary', async () => {
      const nodeBefore = Date.now();
      const databaseTime = Date.parse(await requireRepository().readDatabaseTime());
      const nodeAfter = Date.now();
      expect(databaseTime).toBeGreaterThanOrEqual(nodeBefore - 5_000);
      expect(databaseTime).toBeLessThanOrEqual(nodeAfter + 5_000);

      const expiring = requestInput(
        'expiry_boundary',
        'recovery@example.com',
        '2026-08-15T10:08:00.000Z',
      );
      await expect(requireRepository().requestSetPasswordChallenge(expiring)).resolves.toEqual({
        status: 'queued',
      });
      const createdEpoch = Number(
        ownerScalar(
          `select extract(epoch from created_at) from set_password_challenges where id = '${expiring.challenge.id}';`,
        ),
      );
      const expiresEpoch = Number(
        ownerScalar(
          `select extract(epoch from expires_at) from set_password_challenges where id = '${expiring.challenge.id}';`,
        ),
      );
      expect(createdEpoch * 1_000).toBe(Date.parse(expiring.challenge.createdAt));
      expect(expiresEpoch * 1_000).toBe(Date.parse(expiring.challenge.expiresAt));
      await expect(
        requireRepository().resolveSetPasswordChallenge(
          expiring.challenge.id,
          expiring.challenge.tokenHash,
          expiring.challenge.expiresAt,
        ),
      ).resolves.toBeNull();
    });

    it('uses provider-neutral password identities and keeps username lookup RLS-scoped', async () => {
      const repository = requireRepository();
      const authentication =
        await repository.findPasswordAuthenticationByUserId('usr_auth_recovery');
      expect(authentication).toMatchObject({
        identity: {
          kind: 'password',
          issuer: 'https://lodariq.io',
          subject: 'user:usr_auth_recovery',
          providerTenantId: null,
        },
      });
      if (!authentication) throw new Error('Expected recovery password identity');

      await expect(
        repository.setAuthUsername({
          userId: 'usr_auth_recovery',
          normalizedUsername: 'recovery.owner',
          displayUsername: 'Recovery.Owner',
          expectedPasswordHash: authentication.credential.passwordHash,
          changedAt: '2026-08-15T10:08:30.000Z',
          minimumPreviousChangeAt: '2026-07-16T10:08:30.000Z',
          usernameId: 'uname_recovery_owner_xxxxxxxxx',
        }),
      ).resolves.toMatchObject({ status: 'updated' });
      await expect(
        repository.findPasswordAuthenticationByIdentifier(
          { kind: 'username', value: 'recovery.owner' },
          null,
        ),
      ).resolves.toMatchObject({ credential: { userId: 'usr_auth_recovery' } });

      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        const unscoped = await client.query<{ count: string }>('select count(*) from usernames');
        expect(unscoped.rows[0]?.count).toBe('0');
        const unscopedEmails = await client.query<{ count: string }>(
          'select count(*) from user_emails',
        );
        expect(unscopedEmails.rows[0]?.count).toBe('0');
        const unscopedIdentities = await client.query<{ count: string }>(
          'select count(*) from auth_identities',
        );
        expect(unscopedIdentities.rows[0]?.count).toBe('0');
        const unscopedPolicies = await client.query<{ count: string }>(
          'select count(*) from workspace_auth_policies',
        );
        expect(unscopedPolicies.rows[0]?.count).toBe('0');
        await client.query(
          "select set_config('lodariq.auth_identifier_normalized', 'recovery.owner', true)",
        );
        const scoped = await client.query<{ normalized_username: string }>(
          'select normalized_username from usernames',
        );
        expect(scoped.rows).toEqual([{ normalized_username: 'recovery.owner' }]);
        await client.query("select set_config('lodariq.auth_user_id', 'usr_auth_recovery', true)");
        const scopedEmail = await client.query<{ normalized_email: string }>(
          'select normalized_email from user_emails',
        );
        expect(scopedEmail.rows).toEqual([{ normalized_email: 'recovery@example.com' }]);
        const scopedIdentity = await client.query<{ subject: string }>(
          "select subject from auth_identities where kind = 'password'",
        );
        expect(scopedIdentity.rows).toEqual([{ subject: 'user:usr_auth_recovery' }]);
        await client.query("select set_config('lodariq.workspace_id', 'wk_auth_policy', true)");
        const policy = await client.query<{ minimum_assurance: string }>(
          'select minimum_assurance from workspace_auth_policies',
        );
        expect(policy.rows).toEqual([{ minimum_assurance: 'aal1' }]);
        const connection = await client.query<{ protocol: string }>(
          'select protocol from sso_connections',
        );
        expect(connection.rows).toEqual([{ protocol: 'oidc' }]);
        await client.query('rollback');
      } finally {
        client.release();
      }

      const externalIdentity = {
        id: 'ident_auth_external_xxxxxxxxxxxx',
        userId: 'usr_auth_recovery',
        kind: 'oidc' as const,
        issuer: 'https://identity.example.test/tenant',
        subject: 'provider-subject-recovery',
        providerTenantId: 'tenant',
        createdAt: '2026-08-15T10:08:31.000Z',
        lastAuthenticatedAt: null,
      };
      await expect(repository.createAuthIdentity(externalIdentity)).resolves.toBe(true);
      await expect(
        repository.findAuthIdentityByProviderSubject(
          externalIdentity.issuer,
          externalIdentity.subject,
        ),
      ).resolves.toMatchObject(externalIdentity);
      await expect(repository.listAuthIdentities('usr_auth_recovery')).resolves.toHaveLength(2);
    });

    it('keeps onboarding resumable and identity security history append-only under forced RLS', async () => {
      const repository = requireRepository();
      const registration = onboardingRegistrationInput();
      await expect(repository.registerIdentityAccount(registration)).resolves.toBe(true);
      await expect(repository.listIdentityWorkspaces(registration.user.id)).resolves.toEqual([]);
      await expect(
        repository.getCurrentIdentityOnboarding(registration.user.id),
      ).resolves.toMatchObject({
        status: 'pending_identity',
        targetWorkspaceId: registration.onboarding.targetWorkspaceId,
      });

      const verifiedAt = '2026-08-16T10:00:00.000Z';
      await expect(
        repository.consumeEmailVerificationChallenge({
          challengeId: registration.emailVerificationChallenge.id,
          tokenHash: registration.emailVerificationChallenge.tokenHash,
          usedAt: verifiedAt,
          credential: credentialMaterial(verifiedAt),
        }),
      ).resolves.toMatchObject({ id: registration.user.id, emailVerifiedAt: verifiedAt });
      await expect(
        repository.getCurrentIdentityOnboarding(registration.user.id),
      ).resolves.toMatchObject({
        status: 'pending_destination',
      });

      const completedAt = '2026-08-30T10:00:00.000Z';
      const completion = {
        onboardingId: registration.onboarding.id,
        userId: registration.user.id,
        targetWorkspaceId: registration.onboarding.targetWorkspaceId!,
        environments: onboardingEnvironments(
          registration.onboarding.targetWorkspaceId!,
          completedAt,
        ),
        completedAt,
      };
      await expect(repository.completeIdentityOnboarding(completion)).resolves.toMatchObject({
        onboarding: { status: 'completed' },
        workspace: { id: registration.onboarding.targetWorkspaceId, role: 'owner' },
      });
      await expect(repository.completeIdentityOnboarding(completion)).resolves.toMatchObject({
        onboarding: { status: 'completed' },
      });

      const linkedIdentity = {
        id: 'ident_auth_onboarding_oidc_xxxxx',
        userId: registration.user.id,
        kind: 'oidc' as const,
        issuer: 'https://accounts.example.test',
        subject: 'stable-onboarding-subject',
        providerTenantId: 'example-tenant',
        createdAt: completedAt,
        lastAuthenticatedAt: null,
      };
      await expect(
        repository.linkAuthIdentity({
          identity: linkedIdentity,
          actorUserId: registration.user.id,
          authorization: 'authenticated_session',
          eventId: 'authevt_auth_link_xxxxxxxxxxxxx',
          occurredAt: completedAt,
        }),
      ).resolves.toBe(true);
      await expect(
        repository.unlinkAuthIdentity({
          userId: registration.user.id,
          identityId: linkedIdentity.id,
          actorUserId: registration.user.id,
          authorization: 'authenticated_session',
          eventId: 'authevt_auth_unlink_xxxxxxxxxxx',
          occurredAt: '2026-08-30T10:01:00.000Z',
        }),
      ).resolves.toBe('unlinked');
      await expect(
        repository.unlinkAuthIdentity({
          userId: registration.user.id,
          identityId: registration.passwordIdentity.id,
          actorUserId: registration.user.id,
          authorization: 'strong_recovery',
          eventId: 'authevt_auth_final_xxxxxxxxxxxx',
          occurredAt: '2026-08-30T10:02:00.000Z',
        }),
      ).resolves.toBe('final_method');
      await expect(repository.listAuthSecurityEvents(registration.user.id)).resolves.toMatchObject([
        { eventType: 'identity_linked' },
        { eventType: 'identity_unlinked' },
        { eventType: 'identity_unlink_rejected_final_method' },
      ]);

      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        const unscopedOnboarding = await client.query<{ count: string }>(
          'select count(*) from identity_onboarding_states',
        );
        const unscopedEvents = await client.query<{ count: string }>(
          'select count(*) from auth_security_events',
        );
        expect(unscopedOnboarding.rows[0]?.count).toBe('0');
        expect(unscopedEvents.rows[0]?.count).toBe('0');
        await client.query(
          `select set_config('lodariq.auth_user_id', '${registration.user.id}', true)`,
        );
        await expect(
          client.query("update auth_security_events set authorization_source = 'strong_recovery'"),
        ).rejects.toThrow(/permission denied/u);
        await client.query('rollback');
      } finally {
        client.release();
      }
    });

    it('enforces resend cooldown and serializes verification replacement under forced RLS', async () => {
      await expect(
        requireRepository().requestEmailVerificationChallenge(
          verificationRequestInput('cooldown', '2026-08-15T10:00:10.000Z'),
        ),
      ).resolves.toEqual({ status: 'cooldown' });

      const replacement = verificationRequestInput('replacement', '2026-08-15T10:00:31.000Z');
      await expect(
        requireRepository().requestEmailVerificationChallenge(replacement),
      ).resolves.toEqual({ status: 'queued' });
      expect(
        ownerScalar(
          "select count(*) from email_verification_challenges where user_id = 'usr_auth_resend' and used_at is null;",
        ),
      ).toBe('1');
      expect(
        ownerScalar(
          "select count(*) from auth_outbox where user_id = 'usr_auth_resend' and processed_at is null and terminal_at is null;",
        ),
      ).toBe('1');

      const concurrent = await Promise.all([
        requireRepository().requestEmailVerificationChallenge(
          verificationRequestInput('concurrent_a', '2026-08-15T10:01:02.000Z'),
        ),
        requireRepository().requestEmailVerificationChallenge(
          verificationRequestInput('concurrent_b', '2026-08-15T10:01:02.000Z'),
        ),
      ]);
      expect(concurrent.map(({ status }) => status).sort()).toEqual(['cooldown', 'queued']);
      expect(
        ownerScalar(
          "select count(*) from email_verification_challenges where user_id = 'usr_auth_resend' and used_at is null;",
        ),
      ).toBe('1');
      expect(
        ownerScalar(
          "select count(*) from auth_outbox where user_id = 'usr_auth_resend' and processed_at is null and terminal_at is null;",
        ),
      ).toBe('1');
    });

    it('diagnoses an exact delivery row and performs bounded cleanup under forced RLS', async () => {
      requireFixture().runOwnerSql(seedLifecycleCleanupSql());
      await expect(
        requireRepository().getAuthDeliveryStatus(
          'email_verification',
          'outbox_auth_cleanup_xxxxxxxx',
        ),
      ).resolves.toMatchObject({
        state: 'provider_accepted',
        attempts: 1,
        challengeId: 'verify_auth_cleanup_xxxxxxx',
      });

      const result = await requireRepository().cleanupAuthLifecycle({
        now: '2026-08-15T12:00:00.000Z',
        abandonedUnverifiedBefore: '2026-07-01T00:00:00.000Z',
        challengeBefore: '2026-07-01T00:00:00.000Z',
        sessionBefore: '2026-07-01T00:00:00.000Z',
        rateLimitBefore: '2026-07-01T00:00:00.000Z',
        outboxBefore: '2026-07-01T00:00:00.000Z',
        limit: 10,
      });
      expect(result).toMatchObject({
        abandonedUsers: 1,
        emptyWorkspaces: 1,
        verificationChallenges: 1,
        verificationOutboxRows: 1,
      });
      expect(ownerScalar("select count(*) from users where id = 'usr_auth_cleanup';")).toBe('0');
      expect(ownerScalar("select count(*) from workspaces where id = 'wk_auth_cleanup';")).toBe(
        '0',
      );
      expect(ownerScalar("select count(*) from workspaces where id = 'wk_auth_invited';")).toBe(
        '1',
      );
    });
  },
);

function requestInput(
  suffix: string,
  emailNormalized: string,
  createdAt: string,
): RequestSetPasswordChallengeInput {
  const padded = suffix.replace(/[^A-Za-z0-9_-]/gu, '_').padEnd(24, 'x');
  const challengeId = `reset_${padded}`;
  return {
    emailNormalized,
    emailLookupHash: sha256Fixture(emailNormalized),
    challenge: {
      id: challengeId,
      keyId: 'legacy',
      tokenHash: sha256Fixture(`token:${suffix}`),
      emailNormalized,
      emailLookupHash: sha256Fixture(emailNormalized),
      expiresAt: new Date(Date.parse(createdAt) + 30 * 60_000).toISOString(),
      usedAt: null,
      createdAt,
    },
    outboxMessage: {
      id: `outbox_${padded}`,
      type: 'set_password',
      payload: {
        purpose: 'set_password',
        challengeId,
        resetPath: `/reset-password?challenge=${challengeId}`,
        keyId: 'legacy',
      },
      availableAt: createdAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt,
    },
  };
}

function credentialMaterial(timestamp: string) {
  return {
    algorithm: 'argon2id-v1' as const,
    passwordHash: `$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function passwordIdentity(userId: string, suffix: string, timestamp: string) {
  return {
    id: `ident_${suffix.padEnd(24, 'x')}`,
    userId,
    kind: 'password' as const,
    issuer: 'https://lodariq.io',
    subject: `user:${userId}`,
    providerTenantId: null,
    createdAt: timestamp,
    lastAuthenticatedAt: null,
  };
}

function onboardingRegistrationInput() {
  const createdAt = '2026-08-15T10:00:00.000Z';
  const userId = 'usr_auth_onboarding';
  const email = 'onboarding@example.com';
  const challengeId = 'verify_auth_onboarding_xxxxxxx';
  return {
    user: {
      id: userId,
      legacyIdentityId: null,
      email,
      name: 'Onboarding',
      emailVerifiedAt: null,
      createdAt,
    },
    userEmail: {
      id: 'email_auth_onboarding_xxxxxxxxx',
      userId,
      normalizedEmail: email,
      isPrimary: true,
      verifiedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    passwordIdentity: {
      id: 'ident_auth_onboarding_xxxxxxxx',
      userId,
      kind: 'password' as const,
      issuer: 'https://lodariq.io',
      subject: `user:${userId}`,
      providerTenantId: null,
      createdAt,
      lastAuthenticatedAt: null,
    },
    credential: {
      userId,
      emailNormalized: email,
      emailLookupHash: sha256Fixture(email),
      ...credentialMaterial(createdAt),
    },
    onboarding: {
      id: 'onboard_auth_onboarding_xxxxxxx',
      userId,
      intent: 'create_workspace' as const,
      status: 'pending_identity' as const,
      targetWorkspaceId: 'wk_auth_onboarding',
      targetWorkspaceName: 'Onboarding workspace',
      invitationId: null,
      requestedWorkspaceId: null,
      completedWorkspaceId: null,
      version: 1,
      expiresAt: '2026-08-16T00:00:00.000Z',
      createdAt,
      updatedAt: createdAt,
    },
    emailVerificationChallenge: {
      id: challengeId,
      userId,
      keyId: 'legacy',
      tokenHash: sha256Fixture('onboarding-verification-token'),
      expiresAt: '2026-08-16T12:00:00.000Z',
      usedAt: null,
      createdAt,
    },
    outboxMessage: {
      id: 'outbox_auth_onboarding_xxxxxxxxx',
      type: 'email_verification' as const,
      userId,
      recipientEmail: email,
      payload: {
        challengeId,
        verificationPath: `/verify-email?challenge=${challengeId}`,
        keyId: 'legacy',
      },
      availableAt: createdAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt,
    },
  };
}

function onboardingEnvironments(workspaceId: string, timestamp: string) {
  return [
    {
      id: `${workspaceId}_development`,
      workspaceId,
      kind: 'development' as const,
      name: 'Development',
      originAllowlist: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: `${workspaceId}_staging`,
      workspaceId,
      kind: 'staging' as const,
      name: 'Staging',
      originAllowlist: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: `${workspaceId}_production`,
      workspaceId,
      kind: 'production' as const,
      name: 'Production',
      originAllowlist: [],
      promotionSourceEnvironmentId: `${workspaceId}_staging`,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function verificationRequestInput(
  suffix: string,
  createdAt: string,
): RequestEmailVerificationChallengeInput {
  const padded = suffix.replace(/[^A-Za-z0-9_-]/gu, '_').padEnd(24, 'x');
  const challengeId = `verify_${padded}`;
  const emailNormalized = 'resend@example.com';
  return {
    emailNormalized,
    emailLookupHash: sha256Fixture(emailNormalized),
    now: createdAt,
    cooldownMs: 30_000,
    challenge: {
      id: challengeId,
      keyId: 'legacy',
      tokenHash: sha256Fixture(`verification:${suffix}`),
      expiresAt: new Date(Date.parse(createdAt) + 24 * 60 * 60_000).toISOString(),
      usedAt: null,
      createdAt,
    },
    outboxMessage: {
      id: `outbox_verify_${padded}`,
      type: 'email_verification',
      payload: {
        challengeId,
        verificationPath: `/verify-email?challenge=${challengeId}`,
        keyId: 'legacy',
      },
      availableAt: createdAt,
      processedAt: null,
      attempts: 0,
      lastError: null,
      createdAt,
    },
  };
}

function seedIdentitySql(): string {
  return `
    insert into users (id, clerk_user_id, email, name, email_verified_at, created_at) values
      ('usr_auth_recovery', null, 'recovery@example.com', 'Recovery', now(), now()),
      ('usr_auth_consume', null, 'consume@example.com', 'Consume', null, now()),
      ('usr_auth_resend', null, 'resend@example.com', 'Resend', null, '2026-08-15T09:00:00.000Z'),
      ('usr_auth_duplicate_a', null, 'Duplicate@Example.com', 'Duplicate A', null, now()),
      ('usr_auth_duplicate_b', null, ' duplicate@example.com ', 'Duplicate B', null, now());

    insert into workspaces (id, name, created_at, updated_at)
      values ('wk_auth_policy', 'Auth policy', now(), now());
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at)
      values ('wk_auth_policy', 'usr_auth_recovery', 'owner', now(), now());
    insert into workspace_auth_policies
      (workspace_id, sso_required, minimum_assurance, password_allowed, created_at, updated_at)
      values ('wk_auth_policy', false, 'aal1', true, now(), now());
    insert into sso_connections
      (id, workspace_id, protocol, issuer, status, created_at, updated_at)
      values ('sso_auth_policy_xxxxxxxxxxx', 'wk_auth_policy', 'oidc',
        'https://identity.example.test/tenant', 'draft', now(), now());

    insert into user_emails
      (id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at)
    values
      ('email_auth_recovery_xxxxxxxx', 'usr_auth_recovery', 'recovery@example.com', true, now(), now(), now()),
      ('email_auth_consume_xxxxxxxxx', 'usr_auth_consume', 'consume@example.com', true, null, now(), now()),
      ('email_auth_resend_xxxxxxxxxx', 'usr_auth_resend', 'resend@example.com', true, null,
       '2026-08-15T09:00:00.000Z', '2026-08-15T09:00:00.000Z');

    insert into password_credentials
      (user_id, email_normalized, email_lookup_hash, algorithm, password_hash, created_at, updated_at)
    values
      ('usr_auth_resend', 'resend@example.com', '${sha256Fixture('resend@example.com')}',
       'argon2id-v1', '$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}',
       '2026-08-15T09:00:00.000Z', '2026-08-15T09:00:00.000Z');

    insert into auth_identities
      (id, user_id, kind, issuer, subject, provider_tenant_id, created_at, last_authenticated_at)
    values
      ('ident_auth_resend_xxxxxxxxxx', 'usr_auth_resend', 'password', 'https://lodariq.io',
       'user:usr_auth_resend', null, '2026-08-15T09:00:00.000Z', null);

    insert into email_verification_challenges
      (id, user_id, key_id, token_hash, expires_at, used_at, created_at)
    values
      ('verify_auth_resend_xxxxxxxxx', 'usr_auth_resend', 'legacy', '${'d'.repeat(64)}',
       '2026-08-16T10:00:00.000Z', null, '2026-08-15T10:00:00.000Z');

    insert into auth_outbox
      (id, type, user_id, recipient_email, payload, available_at, processed_at,
       attempts, lease_version, last_error, terminal_at, created_at)
    values
      ('outbox_auth_resend_xxxxxxxxx', 'email_verification', 'usr_auth_resend',
       'resend@example.com',
       '{"challengeId":"verify_auth_resend_xxxxxxxxx","verificationPath":"/verify-email?challenge=verify_auth_resend_xxxxxxxxx","keyId":"legacy"}'::jsonb,
       '2026-08-15T10:00:00.000Z', null, 0, 0, null, null,
       '2026-08-15T10:00:00.000Z');
  `;
}

function seedPendingVerificationSql(): string {
  return `
    insert into email_verification_challenges
      (id, user_id, key_id, token_hash, expires_at, used_at, created_at)
    values
      ('verify_auth_consume_xxxxxxxxx', 'usr_auth_consume', 'legacy', '${'c'.repeat(64)}',
       '2026-08-16T10:00:00.000Z', null, '2026-08-15T10:00:00.000Z');

    insert into auth_outbox
      (id, type, user_id, recipient_email, payload, available_at, processed_at,
       attempts, lease_version, last_error, terminal_at, created_at)
    values
      ('outbox_auth_consume_xxxxxxxxx', 'email_verification', 'usr_auth_consume',
       'consume@example.com',
       '{"challengeId":"verify_auth_consume_xxxxxxxxx","verificationPath":"/verify-email?challenge=verify_auth_consume_xxxxxxxxx","keyId":"legacy"}'::jsonb,
       '2026-08-15T10:00:00.000Z', null, 0, 0, null, null,
       '2026-08-15T10:00:00.000Z');
  `;
}

function seedLifecycleCleanupSql(): string {
  return `
    insert into users (id, clerk_user_id, email, name, email_verified_at, created_at)
    values
      ('usr_auth_cleanup', null, 'cleanup@example.com', 'Cleanup', null, '2026-06-01T00:00:00.000Z'),
      ('usr_auth_invited', null, 'invited@example.com', 'Invited', null, '2026-06-01T00:00:00.000Z');
    insert into workspaces (id, name, created_at, updated_at)
    values
      ('wk_auth_cleanup', 'Cleanup', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('wk_auth_invited', 'Invited', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at)
    values
      ('wk_auth_cleanup', 'usr_auth_cleanup', 'owner', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('wk_auth_invited', 'usr_auth_invited', 'owner', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    insert into workspace_invitations
      (id, workspace_id, email_normalized, email_lookup_hash, token_hash, role,
       invited_by_user_id, expires_at, accepted_at, revoked_at, created_at)
    values
      ('invite_auth_pending_xxxxxxxxx', 'wk_auth_invited', 'future@example.com',
       '${sha256Fixture('future@example.com')}', '${'f'.repeat(64)}', 'member',
       'usr_auth_invited', '2026-09-01T00:00:00.000Z', null, null,
       '2026-06-01T00:00:00.000Z');
    insert into password_credentials
      (user_id, email_normalized, email_lookup_hash, algorithm, password_hash, created_at, updated_at)
    values
      ('usr_auth_cleanup', 'cleanup@example.com', '${sha256Fixture('cleanup@example.com')}',
       'argon2id-v1', '$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}',
       '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    insert into email_verification_challenges
      (id, user_id, key_id, token_hash, expires_at, used_at, created_at)
    values
      ('verify_auth_cleanup_xxxxxxx', 'usr_auth_cleanup', 'legacy', '${'e'.repeat(64)}',
       '2026-06-02T00:00:00.000Z', null, '2026-06-01T00:00:00.000Z');
    insert into auth_outbox
      (id, type, user_id, recipient_email, payload, available_at, processed_at,
       attempts, lease_version, last_error, terminal_at, created_at)
    values
      ('outbox_auth_cleanup_xxxxxxxx', 'email_verification', 'usr_auth_cleanup',
       'cleanup@example.com',
       '{"challengeId":"verify_auth_cleanup_xxxxxxx","verificationPath":"/verify-email?challenge=verify_auth_cleanup_xxxxxxx","keyId":"legacy"}'::jsonb,
       '2026-06-01T00:00:00.000Z', '2026-06-01T00:01:00.000Z', 1, 1, null, null,
       '2026-06-01T00:00:00.000Z');
  `;
}

function ownerScalar(statement: string): string {
  return requireFixture().runOwnerSql(statement);
}

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL auth repository fixture is unavailable');
  return repository;
}

function requireFixture(): DisposablePostgresFixture {
  if (!fixture) throw new Error('PostgreSQL auth fixture is unavailable');
  return fixture;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL runtime pool is unavailable');
  return runtimePool;
}

function sha256Fixture(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
