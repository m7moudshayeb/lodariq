import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDrizzleControlPlaneRepository,
  type AuthSessionRecord,
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

const USER_ID = 'usr_pg_assurance';
const NOW_DATE = new Date();
const NOW = NOW_DATE.toISOString();
const CHALLENGE_EXPIRY = new Date(NOW_DATE.getTime() + 5 * 60_000).toISOString();
const SESSION_IDLE_EXPIRY = new Date(NOW_DATE.getTime() + 6 * 60 * 60_000).toISOString();
const SESSION_ABSOLUTE_EXPIRY = new Date(NOW_DATE.getTime() + 24 * 60 * 60_000).toISOString();
const REGISTRATION_CHALLENGE_ID = `authchal_pg_registration_${'r'.repeat(20)}`;
const AUTHENTICATION_CHALLENGE_ID = `authchal_pg_authentication_${'a'.repeat(20)}`;
const PASSKEY_ID = `passkey_pg_assurance_${'p'.repeat(20)}`;
const IDENTITY_ID = `ident_pg_assurance_${'i'.repeat(20)}`;
const CREDENTIAL_ID = 'credential_pg_assurance_1234567890';
const RECOVERY_SET_ID = `recoveryset_pg_${'s'.repeat(20)}`;
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'assurance under the restricted PostgreSQL 16 runtime role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('assurance');
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

    it('registers and authenticates a passkey with one-time challenge and counter CAS', async () => {
      expect(
        await requireRepository().createWebAuthnChallenge(
          challenge(REGISTRATION_CHALLENGE_ID, 'passkey_registration', USER_ID, 'registration'),
        ),
      ).toBe(true);
      expect(
        await requireRepository().completePasskeyRegistration({
          challengeId: REGISTRATION_CHALLENGE_ID,
          challengeHash: sha256('registration'),
          userId: USER_ID,
          consumedAt: NOW,
          credential: {
            id: PASSKEY_ID,
            userId: USER_ID,
            identityId: IDENTITY_ID,
            credentialId: CREDENTIAL_ID,
            publicKey: Uint8Array.from({ length: 32 }, (_, index) => index + 1),
            counter: 3,
            transports: ['internal'],
            deviceType: 'multiDevice',
            backedUp: true,
            aaguid: '00000000-0000-0000-0000-000000000000',
            name: 'PostgreSQL passkey',
            createdAt: NOW,
            lastUsedAt: null,
          },
          identity: {
            id: IDENTITY_ID,
            userId: USER_ID,
            kind: 'passkey',
            issuer: 'https://lodariq.io',
            subject: `passkey:${CREDENTIAL_ID}`,
            providerTenantId: null,
            createdAt: NOW,
            lastAuthenticatedAt: NOW,
          },
          event: event('passkey_registered', PASSKEY_ID, 'registered'),
        }),
      ).toBe(true);

      expect(
        await requireRepository().createWebAuthnChallenge(
          challenge(AUTHENTICATION_CHALLENGE_ID, 'passkey_authentication', null, 'authentication'),
        ),
      ).toBe(true);
      const authenticated = await requireRepository().completePasskeyAuthentication({
        challengeId: AUTHENTICATION_CHALLENGE_ID,
        challengeHash: sha256('authentication'),
        credentialId: CREDENTIAL_ID,
        expectedCounter: 3,
        nextCounter: 4,
        authenticatedAt: NOW,
        nextSession: session('passkey'),
        currentSessionTokenHash: null,
        event: event('passkey_authenticated', CREDENTIAL_ID, 'authenticated'),
      });
      expect(authenticated).toMatchObject({ assuranceLevel: 'aal2' });
      await expect(requireRepository().findPasskeyCredential(CREDENTIAL_ID)).resolves.toMatchObject(
        {
          counter: 4,
        },
      );

      await expect(
        requireRepository().completePasskeyAuthentication({
          challengeId: AUTHENTICATION_CHALLENGE_ID,
          challengeHash: sha256('authentication'),
          credentialId: CREDENTIAL_ID,
          expectedCounter: 3,
          nextCounter: 4,
          authenticatedAt: NOW,
          nextSession: session('replay'),
          currentSessionTokenHash: null,
          event: event('passkey_authenticated', CREDENTIAL_ID, 'replay'),
        }),
      ).resolves.toBeNull();
      expect(
        ownerScalar(
          "select count(*) from account_security_events where event_type = 'passkey_authenticated'",
        ),
      ).toBe('1');
    });

    it('confirms and consumes each hash-only recovery code once', async () => {
      const codeHashes = Array.from({ length: 10 }, (_, index) => sha256(`recovery:${index}`));
      expect(
        await requireRepository().createRecoveryCodeSet({
          set: {
            id: RECOVERY_SET_ID,
            userId: USER_ID,
            confirmedAt: null,
            revokedAt: null,
            createdAt: NOW,
          },
          codes: codeHashes.map((codeHash, index) => ({
            id: `recoverycode_pg_${index}_${'c'.repeat(20)}`,
            setId: RECOVERY_SET_ID,
            userId: USER_ID,
            codeHash,
            usedAt: null,
            createdAt: NOW,
          })),
          event: event('recovery_codes_generated', RECOVERY_SET_ID, 'recovery-generated'),
        }),
      ).toBe(true);
      expect(
        await requireRepository().confirmRecoveryCodeSet(
          USER_ID,
          RECOVERY_SET_ID,
          codeHashes[0]!,
          NOW,
          event('recovery_codes_confirmed', RECOVERY_SET_ID, 'recovery-confirmed'),
        ),
      ).toBe(true);
      await expect(
        requireRepository().consumeRecoveryCode({
          userId: USER_ID,
          codeHash: codeHashes[0]!,
          usedAt: NOW,
          session: session('recovery', 'recovery'),
          event: event('recovery_code_used', RECOVERY_SET_ID, 'recovery-used'),
        }),
      ).resolves.toMatchObject({ authenticationMethod: 'recovery', assuranceLevel: 'aal1' });
      await expect(
        requireRepository().consumeRecoveryCode({
          userId: USER_ID,
          codeHash: codeHashes[0]!,
          usedAt: NOW,
          session: session('recovery-replay', 'recovery'),
          event: event('recovery_code_used', RECOVERY_SET_ID, 'recovery-replay'),
        }),
      ).resolves.toBeNull();
      expect(ownerScalar('select count(*) from recovery_codes where code_hash is not null')).toBe(
        '10',
      );
      expect(ownerScalar('select count(*) from recovery_codes where used_at is not null')).toBe(
        '1',
      );
    });

    it('does not expose assurance rows without an explicit RLS scope', async () => {
      const runtime = requireRuntimePool();
      await expect(runtime.query('select id from passkey_credentials')).resolves.toMatchObject({
        rows: [],
      });
      await expect(runtime.query('select id from recovery_codes')).resolves.toMatchObject({
        rows: [],
      });
    });

    it('consumes OIDC callback state once and hides it without its exact RLS binding', async () => {
      const attempt = {
        id: `oidcattempt_pg_${'o'.repeat(20)}`,
        providerId: 'google',
        action: 'sign_in' as const,
        userId: null,
        stateHash: sha256('oidc-state'),
        encryptedVerifier: 'v'.repeat(64),
        nonceHash: sha256('oidc-nonce'),
        returnTo: '/',
        workspaceName: null,
        durationPolicy: 'standard' as const,
        expiresAt: CHALLENGE_EXPIRY,
        consumedAt: null,
        createdAt: NOW,
      };
      await expect(requireRepository().createOidcAuthorizationAttempt(attempt)).resolves.toBe(true);
      await expect(
        requireRepository().getOidcAuthorizationAttempt(attempt.stateHash, NOW),
      ).resolves.toMatchObject({ id: attempt.id, providerId: 'google' });
      await expect(
        requireRepository().consumeOidcAuthorizationAttempt(attempt.id, attempt.stateHash, NOW),
      ).resolves.toBe(true);
      await expect(
        requireRepository().consumeOidcAuthorizationAttempt(attempt.id, attempt.stateHash, NOW),
      ).resolves.toBe(false);
      await expect(
        requireRuntimePool().query('select id from oidc_authorization_attempts'),
      ).resolves.toMatchObject({ rows: [] });
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

function challenge(
  id: string,
  purpose: 'passkey_registration' | 'passkey_authentication',
  userId: string | null,
  secret: string,
) {
  return {
    id,
    purpose,
    userId,
    challengeHash: sha256(secret),
    rpId: 'lodariq.io',
    origin: 'https://app.lodariq.io',
    expiresAt: CHALLENGE_EXPIRY,
    consumedAt: null,
    createdAt: NOW,
  } as const;
}

function session(suffix: string, method: 'passkey' | 'recovery' = 'passkey'): AuthSessionRecord {
  return {
    id: `authsess_pg_assurance_${suffix.replace(/[^a-z]/gu, '')}_${'s'.repeat(20)}`,
    userId: USER_ID,
    tokenHash: sha256(`session:${suffix}`),
    activeWorkspaceId: null,
    identityId: method === 'passkey' ? IDENTITY_ID : null,
    authenticationMethod: method,
    assuranceLevel: method === 'passkey' ? 'aal2' : 'aal1',
    authenticatedAt: NOW,
    durationPolicy: 'standard',
    deviceLabel: 'PostgreSQL authenticator',
    createdAt: NOW,
    lastSeenAt: NOW,
    idleExpiresAt: SESSION_IDLE_EXPIRY,
    absoluteExpiresAt: SESSION_ABSOLUTE_EXPIRY,
    revokedAt: null,
  };
}

function event(
  eventType:
    | 'passkey_registered'
    | 'passkey_authenticated'
    | 'recovery_codes_generated'
    | 'recovery_codes_confirmed'
    | 'recovery_code_used',
  targetId: string,
  suffix: string,
) {
  return {
    id: `acctevt_pg_${suffix.replace(/[^a-z]/gu, '')}_${'e'.repeat(20)}`,
    userId: USER_ID,
    actorUserId: USER_ID,
    eventType,
    targetId,
    occurredAt: NOW,
  };
}

function seedSql(): string {
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      ('${USER_ID}', 'pg-assurance@example.com', 'Assurance', '${NOW}', '${NOW}');
  `;
}

function ownerScalar(statement: string): string {
  if (!fixture) throw new Error('PostgreSQL fixture is unavailable');
  return fixture.runOwnerSql(statement);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
