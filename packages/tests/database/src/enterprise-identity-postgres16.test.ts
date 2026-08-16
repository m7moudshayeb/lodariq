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
  sqlLiteral,
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

const NOW_DATE = new Date();
const NOW = NOW_DATE.toISOString();
const LATER = new Date(NOW_DATE.getTime() + 60_000).toISOString();
const SESSION_EXPIRY = new Date(NOW_DATE.getTime() + 24 * 60 * 60_000).toISOString();
const WORKSPACE_ID = 'wk_pg_enterprise';
const OWNER_ID = 'usr_pg_enterprise_owner';
const MANAGED_ID = 'usr_pg_enterprise_managed';
const CONNECTION_ID = `sso_pg_enterprise_${'c'.repeat(20)}`;
const SCIM_ID = `scim_pg_enterprise_${'s'.repeat(20)}`;
const SCIM_TOKEN_HASH = sha256('pg-enterprise-scim-token');
const MANAGED_IDENTITY_ID = `ident_pg_enterprise_${'i'.repeat(20)}`;
const MANAGED_SESSION_HASH = sha256('pg-enterprise-managed-session');
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'enterprise identity under the restricted PostgreSQL 16 runtime role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('enterprise');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedSql());
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

    it('discovers validated domains while unscoped enterprise rows fail closed', async () => {
      await expect(requireRepository().discoverEnterpriseSso('example.com')).resolves.toEqual({
        connectionId: CONNECTION_ID,
        protocol: 'oidc',
        provider: 'okta',
      });
      await expect(
        requireRuntimePool().query('select id from enterprise_principals'),
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        requireRuntimePool().query('select id from enterprise_scim_connections'),
      ).resolves.toMatchObject({ rows: [] });
    });

    it('does not let the runtime role forge external validation with a mutable GUC', async () => {
      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        await client.query("select set_config('lodariq.workspace_id', $1, true)", [WORKSPACE_ID]);
        await client.query(
          "select set_config('lodariq.enterprise_validation_worker', 'true', true)",
        );
        await expect(
          client.query(
            `insert into enterprise_validation_evidence
              (id, connection_id, workspace_id, target, protocol, evidence_reference,
               validated_by, validated_at)
             values ($1, $2, $3, 'entra', 'oidc', 'forged-evidence', 'runtime-role', $4)`,
            [`ssoevidence_pg_forged_${'f'.repeat(20)}`, CONNECTION_ID, WORKSPACE_ID, NOW],
          ),
        ).rejects.toThrow(/row-level security/iu);
        await client.query('rollback');
      } finally {
        client.release();
      }
    });

    it('provisions and deprovisions SCIM atomically with immediate session revocation', async () => {
      const userId = 'usr_pg_enterprise_scim';
      const principalId = `ssoprincipal_pg_scim_${'p'.repeat(20)}`;
      const provisioned = await requireRepository().provisionEnterpriseScimUser({
        scimConnectionId: SCIM_ID,
        scimTokenHash: SCIM_TOKEN_HASH,
        user: {
          id: userId,
          legacyIdentityId: null,
          email: 'scim-managed@example.com',
          name: 'SCIM Managed',
          emailVerifiedAt: NOW,
          deletedAt: null,
          retentionExpiresAt: null,
          createdAt: NOW,
        },
        email: {
          id: `email_pg_scim_${'e'.repeat(20)}`,
          userId,
          normalizedEmail: 'scim-managed@example.com',
          isPrimary: true,
          verifiedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
        principal: {
          id: principalId,
          workspaceId: WORKSPACE_ID,
          connectionId: CONNECTION_ID,
          userId,
          externalId: 'external-scim-user',
          issuer: 'https://tenant.okta.com/oauth2/default',
          subject: null,
          active: true,
          createdAt: NOW,
          updatedAt: NOW,
          deprovisionedAt: null,
        },
        role: 'viewer',
        groupIds: ['engineering'],
        occurredAt: NOW,
        auditEvent: event('scim_user_provisioned', userId, 'provision'),
      });
      expect(provisioned.status).toBe('created');
      expect(
        ownerScalar(
          `select role from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_ID)} and user_id = ${sqlLiteral(userId)}`,
        ),
      ).toBe('admin');
      const found = await requireRepository().findEnterpriseScimUser({
        scimConnectionId: SCIM_ID,
        scimTokenHash: SCIM_TOKEN_HASH,
        emailNormalized: 'scim-managed@example.com',
      });
      expect(found).toMatchObject({ id: principalId, active: true });
      await expect(
        requireRepository().updateEnterpriseScimUser({
          scimConnectionId: SCIM_ID,
          scimTokenHash: SCIM_TOKEN_HASH,
          principalId,
          active: false,
          occurredAt: LATER,
          auditEvent: event('scim_user_deprovisioned', userId, 'deprovision'),
        }),
      ).resolves.toBe('completed');
      expect(
        ownerScalar(
          `select count(*) from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_ID)} and user_id = ${sqlLiteral(userId)}`,
        ),
      ).toBe('0');
    });

    it('reconciles IdP group mappings for an existing enterprise principal under RLS', async () => {
      const candidateIdentityId = `ident_pg_candidate_${'c'.repeat(20)}`;
      const sessionHash = sha256('pg-enterprise-reconciled-session');
      const result = await requireRepository().authenticateEnterpriseSso({
        connectionId: CONNECTION_ID,
        externalId: 'managed-external',
        issuer: 'https://tenant.okta.com/oauth2/default',
        subject: 'managed-subject',
        emailNormalized: 'managed@example.com',
        emailVerified: true,
        displayName: 'Managed',
        groupIds: ['engineering'],
        occurredAt: LATER,
        candidateUser: {
          id: MANAGED_ID,
          legacyIdentityId: null,
          email: 'managed@example.com',
          name: 'Managed',
          emailVerifiedAt: NOW,
          deletedAt: null,
          retentionExpiresAt: null,
          createdAt: NOW,
        },
        candidateEmail: {
          id: `email_pg_candidate_${'e'.repeat(20)}`,
          userId: MANAGED_ID,
          normalizedEmail: 'managed@example.com',
          isPrimary: true,
          verifiedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        },
        candidateIdentity: {
          id: candidateIdentityId,
          userId: MANAGED_ID,
          kind: 'oidc',
          issuer: 'https://tenant.okta.com/oauth2/default',
          subject: 'managed-subject',
          providerTenantId: 'okta-tenant',
          createdAt: NOW,
          lastAuthenticatedAt: LATER,
          disabledAt: null,
        },
        candidatePrincipal: {
          id: `ssoprincipal_pg_candidate_${'p'.repeat(20)}`,
          workspaceId: WORKSPACE_ID,
          connectionId: CONNECTION_ID,
          userId: MANAGED_ID,
          externalId: 'managed-external',
          issuer: 'https://tenant.okta.com/oauth2/default',
          subject: 'managed-subject',
          active: true,
          createdAt: NOW,
          updatedAt: LATER,
          deprovisionedAt: null,
        },
        candidateSession: {
          id: `authsess_pg_reconciled_${'a'.repeat(20)}`,
          userId: MANAGED_ID,
          tokenHash: sessionHash,
          activeWorkspaceId: WORKSPACE_ID,
          identityId: candidateIdentityId,
          authenticationMethod: 'oidc',
          assuranceLevel: 'aal2',
          authenticatedAt: LATER,
          durationPolicy: 'managed',
          deviceLabel: 'PostgreSQL test',
          createdAt: LATER,
          lastSeenAt: LATER,
          idleExpiresAt: SESSION_EXPIRY,
          absoluteExpiresAt: SESSION_EXPIRY,
          revokedAt: null,
        },
        auditEvent: event('enterprise_sso_authenticated', MANAGED_ID, 'reconcile'),
      });
      expect(result.status).toBe('authenticated');
      expect(
        ownerScalar(
          `select role from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_ID)} and user_id = ${sqlLiteral(MANAGED_ID)}`,
        ),
      ).toBe('admin');
    });

    it('disables a connection and invalidates its bound identity and active sessions', async () => {
      await expect(
        requireRepository().identitySatisfiesWorkspaceSso(WORKSPACE_ID, MANAGED_IDENTITY_ID),
      ).resolves.toBe(true);
      await expect(
        requireRepository().disableEnterpriseSsoConnection({
          workspaceId: WORKSPACE_ID,
          connectionId: CONNECTION_ID,
          actorUserId: OWNER_ID,
          disabledAt: LATER,
          auditEvent: event('sso_connection_disabled', null, 'disable'),
        }),
      ).resolves.toBe('completed');
      await expect(
        requireRepository().identitySatisfiesWorkspaceSso(WORKSPACE_ID, MANAGED_IDENTITY_ID),
      ).resolves.toBe(false);
      await expect(
        requireRepository().resolveAuthSession(MANAGED_SESSION_HASH, LATER),
      ).resolves.toBeNull();
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

function event(
  eventType:
    | 'enterprise_sso_authenticated'
    | 'scim_user_provisioned'
    | 'scim_user_deprovisioned'
    | 'sso_connection_disabled',
  targetUserId: string | null,
  suffix: string,
) {
  return {
    id: `ssoevt_pg_${suffix}_${'e'.repeat(20)}`,
    workspaceId: WORKSPACE_ID,
    actorUserId: eventType === 'sso_connection_disabled' ? OWNER_ID : null,
    eventType,
    connectionId: CONNECTION_ID,
    targetUserId,
    correlationId: `pg_enterprise_${suffix}`,
    metadata: {},
    occurredAt: eventType === 'scim_user_provisioned' ? NOW : LATER,
  } as const;
}

function seedSql(): string {
  const future = SESSION_EXPIRY;
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      ('${OWNER_ID}', 'owner@example.com', 'Owner', '${NOW}', '${NOW}'),
      ('${MANAGED_ID}', 'managed@example.com', 'Managed', '${NOW}', '${NOW}');
    insert into user_emails
      (id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at) values
      ('email_pg_enterprise_owner_${'o'.repeat(20)}', '${OWNER_ID}', 'owner@example.com', true, '${NOW}', '${NOW}', '${NOW}'),
      ('email_pg_enterprise_managed_${'m'.repeat(20)}', '${MANAGED_ID}', 'managed@example.com', true, '${NOW}', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at)
      values ('${WORKSPACE_ID}', 'PostgreSQL Enterprise', '${NOW}', '${NOW}');
    insert into workspace_memberships (workspace_id, user_id, role, created_at) values
      ('${WORKSPACE_ID}', '${OWNER_ID}', 'owner', '${NOW}'),
      ('${WORKSPACE_ID}', '${MANAGED_ID}', 'member', '${NOW}');
    insert into workspace_auth_policies
      (workspace_id, sso_required, minimum_assurance, password_allowed, created_at, updated_at)
      values ('${WORKSPACE_ID}', true, 'aal1', false, '${NOW}', '${NOW}');
    insert into sso_connections
      (id, workspace_id, protocol, issuer, provider, client_id, provisioning_mode,
       status, validated_at, created_at, updated_at)
      values ('${CONNECTION_ID}', '${WORKSPACE_ID}', 'oidc',
       'https://tenant.okta.com/oauth2/default', 'okta', 'pg-client', 'jit',
       'verified', '${NOW}', '${NOW}', '${NOW}');
    insert into enterprise_validation_evidence
      (id, connection_id, workspace_id, target, protocol, evidence_reference,
       validated_by, validated_at)
      values ('ssoevidence_pg_${'v'.repeat(20)}', '${CONNECTION_ID}', '${WORKSPACE_ID}',
       'okta', 'oidc', 'ticket://pg-validation', 'ci-owner', '${NOW}');
    insert into workspace_verified_domains
      (id, workspace_id, connection_id, domain, status, verification_token_hash,
       verification_record_name, verified_at, created_at, updated_at)
      values ('ssodomain_pg_${'d'.repeat(20)}', '${WORKSPACE_ID}', '${CONNECTION_ID}',
       'example.com', 'verified', '${'d'.repeat(64)}', '_lodariq.example.com',
       '${NOW}', '${NOW}', '${NOW}');
    insert into sso_group_role_mappings
      (id, workspace_id, connection_id, group_id, role, created_at, updated_at)
      values ('ssogroup_pg_${'g'.repeat(20)}', '${WORKSPACE_ID}', '${CONNECTION_ID}',
       'engineering', 'admin', '${NOW}', '${NOW}');
    insert into enterprise_scim_connections
      (id, workspace_id, connection_id, token_hash, token_prefix, status,
       created_by_user_id, created_at, updated_at)
      values ('${SCIM_ID}', '${WORKSPACE_ID}', '${CONNECTION_ID}', '${SCIM_TOKEN_HASH}',
       'lq_scim_pgvalid', 'active', '${OWNER_ID}', '${NOW}', '${NOW}');
    insert into auth_identities
      (id, user_id, kind, issuer, subject, provider_tenant_id, created_at,
       last_authenticated_at)
      values ('${MANAGED_IDENTITY_ID}', '${MANAGED_ID}', 'oidc',
       'https://tenant.okta.com/oauth2/default', 'managed-subject', 'okta-tenant',
       '${NOW}', '${NOW}');
    insert into enterprise_principals
      (id, workspace_id, connection_id, user_id, external_id, issuer, subject,
       active, created_at, updated_at)
      values ('ssoprincipal_pg_${'p'.repeat(20)}', '${WORKSPACE_ID}', '${CONNECTION_ID}',
       '${MANAGED_ID}', 'managed-external', 'https://tenant.okta.com/oauth2/default',
       'managed-subject', true, '${NOW}', '${NOW}');
    insert into auth_sessions
      (id, user_id, token_hash, active_workspace_id, identity_id,
       authentication_method, assurance_level, authenticated_at, duration_policy,
       created_at, last_seen_at, idle_expires_at, absolute_expires_at)
      values ('authsess_pg_enterprise_${'a'.repeat(20)}', '${MANAGED_ID}',
       '${MANAGED_SESSION_HASH}', '${WORKSPACE_ID}', '${MANAGED_IDENTITY_ID}', 'oidc',
       'aal2', '${NOW}', 'managed', '${NOW}', '${NOW}', '${future}', '${future}');
  `;
}

function ownerScalar(statement: string): string {
  if (!fixture) throw new Error('PostgreSQL fixture is unavailable');
  return fixture.runOwnerSql(statement);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
