import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDrizzleControlPlaneRepository,
  type ControlPlaneRepository,
  type LodariqDatabase,
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

const USER_ID = 'usr_pg_account';
const OTHER_USER_ID = 'usr_pg_account_other';
const NOW_DATE = new Date();
const NOW = NOW_DATE.toISOString();
const EMAIL_EXPIRY = new Date(NOW_DATE.getTime() + 30 * 60_000).toISOString();
const SESSION_IDLE_EXPIRY = new Date(NOW_DATE.getTime() + 6 * 60 * 60_000).toISOString();
const SESSION_ABSOLUTE_EXPIRY = new Date(NOW_DATE.getTime() + 24 * 60 * 60_000).toISOString();
const ACCOUNT_RETENTION_EXPIRY = new Date(
  NOW_DATE.getTime() + 30 * 24 * 60 * 60_000,
).toISOString();
const OLD_PASSWORD_HASH = `$argon2id$v=19$m=65536,p=1,t=3$${'A'.repeat(22)}$${'B'.repeat(43)}`;
const NEW_PASSWORD_HASH = `$argon2id$v=19$m=65536,p=1,t=3$${'C'.repeat(22)}$${'D'.repeat(43)}`;
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'account management under the restricted PostgreSQL 16 runtime role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('account');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedSql());
        runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl, max: 4 });
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

    it('lists only self sessions and atomically revokes old sessions on password change', async () => {
      await expect(requireRepository().listAccountSessions(USER_ID, NOW)).resolves.toHaveLength(2);
      await expect(requireRepository().listAccountSessions(OTHER_USER_ID, NOW)).resolves.toHaveLength(
        1,
      );
      const result = await requireRepository().changeAccountPassword({
        userId: USER_ID,
        currentSessionId: accountSessionId('current'),
        expectedPasswordHash: OLD_PASSWORD_HASH,
        credential: {
          algorithm: 'argon2id-v1',
          passwordHash: NEW_PASSWORD_HASH,
          createdAt: NOW,
          updatedAt: NOW,
        },
        nextSession: sessionRecord('replacement', sha256('replacement-token')),
        eventId: accountEventId('password'),
        changedAt: NOW,
      });
      expect(result).toMatchObject({ status: 'changed' });
      await expect(requireRepository().listAccountSessions(USER_ID, NOW)).resolves.toEqual([
        expect.objectContaining({ id: accountSessionId('replacement') }),
      ]);
      expect(ownerScalar("select count(*) from account_security_events where event_type = 'password_changed'"))
        .toBe('1');
    });

    it('requires both non-replayable email proofs and rejects cross-account token use', async () => {
      const challenge = emailChallenge();
      const queued = await requireRepository().beginAccountEmailChange({
        challenge,
        outbox: [emailOutbox(challenge.id, 'current_email'), emailOutbox(challenge.id, 'new_email')],
        expectedPasswordHash: NEW_PASSWORD_HASH,
        event: {
          id: accountEventId('email-start'),
          userId: USER_ID,
          actorUserId: USER_ID,
          eventType: 'email_change_started',
          targetId: challenge.id,
          occurredAt: NOW,
        },
      });
      expect(queued).toMatchObject({ status: 'queued' });

      await expect(
        requireRepository().verifyAccountEmailChange({
          userId: OTHER_USER_ID,
          currentSessionId: accountSessionId('other'),
          challengeId: challenge.id,
          proof: 'current_email',
          tokenHash: challenge.currentTokenHash,
          verifiedAt: NOW,
          eventId: accountEventId('wrong-user'),
          completionEventId: accountEventId('wrong-user-complete'),
        }),
      ).resolves.toEqual({ status: 'invalid_or_expired' });

      const first = await verifyProof(challenge, 'current_email', 'current');
      expect(first).toMatchObject({ status: 'proof_recorded' });
      await expect(verifyProof(challenge, 'current_email', 'replay')).resolves.toEqual({
        status: 'invalid_or_expired',
      });
      await expect(verifyProof(challenge, 'new_email', 'new')).resolves.toEqual({
        status: 'completed',
        email: 'new-account@example.com',
      });
      expect(ownerScalar("select email from users where id = 'usr_pg_account'"))
        .toBe('new-account@example.com');
    });

    it('soft-deletes with retention through the scoped function and keeps audit rows append-only', async () => {
      const result = await requireRepository().scheduleAccountDeletion({
        userId: USER_ID,
        currentSessionId: accountSessionId('replacement'),
        expectedPasswordHash: NEW_PASSWORD_HASH,
        deletedAt: NOW,
        retentionExpiresAt: ACCOUNT_RETENTION_EXPIRY,
        event: {
          id: accountEventId('delete'),
          userId: USER_ID,
          actorUserId: USER_ID,
          eventType: 'account_deletion_scheduled',
          targetId: accountSessionId('replacement'),
          occurredAt: NOW,
        },
      });
      expect(result).toMatchObject({ status: 'scheduled' });
      await expect(requireRepository().getIdentityUser(USER_ID)).resolves.toBeNull();
      expect(
        ownerScalar("select (deleted_at is not null)::text from users where id = 'usr_pg_account'"),
      ).toBe('true');

      const runtime = requireRuntimePool();
      await expect(
        runtime.query("update account_security_events set event_type = 'session_revoked'"),
      ).rejects.toThrow();
      await expect(
        runtime.query(
          "select public.lodariq_schedule_account_deletion('usr_pg_account_other', now(), now() + interval '30 days')",
        ),
      ).resolves.toMatchObject({ rows: [{ lodariq_schedule_account_deletion: 'conflict' }] });
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL runtime pool is unavailable');
  return runtimePool;
}

function verifyProof(
  challenge: ReturnType<typeof emailChallenge>,
  proof: 'current_email' | 'new_email',
  suffix: string,
) {
  return requireRepository().verifyAccountEmailChange({
    userId: USER_ID,
    currentSessionId: accountSessionId('replacement'),
    challengeId: challenge.id,
    proof,
    tokenHash: proof === 'current_email' ? challenge.currentTokenHash : challenge.newTokenHash,
    verifiedAt: NOW,
    eventId: accountEventId(`proof-${suffix}`),
    completionEventId: accountEventId(`complete-${suffix}`),
  });
}

function emailChallenge() {
  return {
    id: `emailchange_pg_${'c'.repeat(20)}`,
    userId: USER_ID,
    currentEmailNormalized: 'account@example.com',
    newEmailNormalized: 'new-account@example.com',
    newEmailLookupHash: sha256('new-account@example.com'),
    currentTokenHash: sha256('current-email-proof'),
    newTokenHash: sha256('new-email-proof'),
    keyId: 'test',
    currentVerifiedAt: null,
    newVerifiedAt: null,
    expiresAt: EMAIL_EXPIRY,
    consumedAt: null,
    revokedAt: null,
    createdAt: NOW,
  } as const;
}

function emailOutbox(challengeId: string, proof: 'current_email' | 'new_email') {
  return {
    id: `outbox_pg_${proof}_${'o'.repeat(20)}`,
    type: 'account_email_change' as const,
    userId: USER_ID,
    challengeId,
    recipientEmail: proof === 'current_email' ? 'account@example.com' : 'new-account@example.com',
    proof,
    keyId: 'test',
    changePath: '/account/email-change',
    availableAt: NOW,
    processedAt: null,
    attempts: 0,
    leaseVersion: 0,
    lastError: null,
    terminalAt: null,
    createdAt: NOW,
  } as const;
}

function sessionRecord(suffix: string, tokenHash: string) {
  return {
    id: accountSessionId(suffix),
    userId: USER_ID,
    tokenHash,
    activeWorkspaceId: 'wk_pg_account',
    identityId: `ident_pg_account_${'i'.repeat(20)}`,
    authenticationMethod: 'password' as const,
    assuranceLevel: 'aal1' as const,
    authenticatedAt: NOW,
    durationPolicy: 'standard' as const,
    deviceLabel: 'PostgreSQL test client',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: SESSION_IDLE_EXPIRY,
    absoluteExpiresAt: SESSION_ABSOLUTE_EXPIRY,
    revokedAt: null,
  };
}

function accountSessionId(suffix: string): string {
  return `authsess_pg_account_${suffix}_${'s'.repeat(20)}`;
}

function accountEventId(suffix: string): string {
  return `acctevt_pg_${suffix.replace(/[^a-z0-9]/gu, '')}_${'e'.repeat(20)}`;
}

function ownerScalar(statement: string): string {
  if (!fixture) throw new Error('PostgreSQL fixture is unavailable');
  return fixture.runOwnerSql(statement);
}

function seedSql(): string {
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      ('${USER_ID}', 'account@example.com', 'Account', '${NOW}', '${NOW}'),
      ('${OTHER_USER_ID}', 'other@example.com', 'Other', '${NOW}', '${NOW}'),
      ('usr_pg_account_owner', 'owner@example.com', 'Owner', '${NOW}', '${NOW}');
    insert into user_emails (id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at) values
      ('email_pg_account_${'a'.repeat(20)}', '${USER_ID}', 'account@example.com', true, '${NOW}', '${NOW}', '${NOW}'),
      ('email_pg_other_${'b'.repeat(20)}', '${OTHER_USER_ID}', 'other@example.com', true, '${NOW}', '${NOW}', '${NOW}'),
      ('email_pg_owner_${'c'.repeat(20)}', 'usr_pg_account_owner', 'owner@example.com', true, '${NOW}', '${NOW}', '${NOW}');
    insert into auth_identities (id, user_id, kind, issuer, subject, provider_tenant_id, created_at) values
      ('ident_pg_account_${'i'.repeat(20)}', '${USER_ID}', 'password', 'https://lodariq.io', 'user:${USER_ID}', null, '${NOW}'),
      ('ident_pg_other_${'j'.repeat(20)}', '${OTHER_USER_ID}', 'password', 'https://lodariq.io', 'user:${OTHER_USER_ID}', null, '${NOW}');
    insert into password_credentials (user_id, email_normalized, email_lookup_hash, algorithm, password_hash, created_at, updated_at) values
      ('${USER_ID}', 'account@example.com', '${sha256('account@example.com')}', 'argon2id-v1', '${OLD_PASSWORD_HASH}', '${NOW}', '${NOW}'),
      ('${OTHER_USER_ID}', 'other@example.com', '${sha256('other@example.com')}', 'argon2id-v1', '${OLD_PASSWORD_HASH}', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      ('wk_pg_account', 'Account', '${NOW}', '${NOW}');
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      ('wk_pg_account', '${USER_ID}', 'member', '${NOW}', '${NOW}'),
      ('wk_pg_account', 'usr_pg_account_owner', 'owner', '${NOW}', '${NOW}');
    insert into auth_sessions (
      id, user_id, token_hash, active_workspace_id, identity_id, authentication_method,
      assurance_level, authenticated_at, duration_policy, device_label, created_at,
      last_seen_at, idle_expires_at, absolute_expires_at
    ) values
      ('${accountSessionId('current')}', '${USER_ID}', '${sha256('current-token')}', 'wk_pg_account', 'ident_pg_account_${'i'.repeat(20)}', 'password', 'aal1', '${NOW}', 'standard', 'Current', '${NOW}', '${NOW}', '${SESSION_IDLE_EXPIRY}', '${SESSION_ABSOLUTE_EXPIRY}'),
      ('${accountSessionId('other-active')}', '${USER_ID}', '${sha256('other-active-token')}', 'wk_pg_account', 'ident_pg_account_${'i'.repeat(20)}', 'password', 'aal1', '${NOW}', 'remembered', 'Other', '${NOW}', '${NOW}', '${SESSION_IDLE_EXPIRY}', '${SESSION_ABSOLUTE_EXPIRY}'),
      ('${accountSessionId('other')}', '${OTHER_USER_ID}', '${sha256('other-token')}', null, 'ident_pg_other_${'j'.repeat(20)}', 'password', 'aal1', '${NOW}', 'standard', 'Other user', '${NOW}', '${NOW}', '${SESSION_IDLE_EXPIRY}', '${SESSION_ABSOLUTE_EXPIRY}');
  `;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
