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

const WORKSPACE_ID = 'wk_pg_tenant_admin';
const OTHER_WORKSPACE_ID = 'wk_pg_tenant_other';
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'tenant administration under the restricted PostgreSQL 16 runtime role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('tenant');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedTenantSql());
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

    it('enforces the capability matrix without trusting cross-workspace claims', async () => {
      for (const actor of ['usr_pg_owner', 'usr_pg_admin', 'usr_pg_member', 'usr_pg_viewer']) {
        await expect(
          requireRepository().listWorkspaceMembers(WORKSPACE_ID, actor),
        ).resolves.toMatchObject({
          status: 'ok',
        });
      }
      await expect(
        requireRepository().listWorkspaceMembers(WORKSPACE_ID, 'usr_pg_removed'),
      ).resolves.toEqual({ status: 'forbidden' });
      await expect(
        requireRepository().listWorkspaceMembers(WORKSPACE_ID, 'usr_pg_cross'),
      ).resolves.toEqual({ status: 'forbidden' });
      await expect(
        requireRepository().createWorkspaceInvitation(
          invitationInput('member-denied', 'usr_pg_member', 'denied@example.com'),
        ),
      ).resolves.toEqual({ status: 'forbidden' });
      await expect(
        requireRepository().createWorkspaceInvitation(
          invitationInput('admin-escalation', 'usr_pg_admin', 'escalation@example.com', 'admin'),
        ),
      ).resolves.toEqual({ status: 'forbidden' });
    });

    it('issues and accepts one verified-email invitation exactly once under forced RLS', async () => {
      const rawToken = `lq_invite_${'z'.repeat(43)}`;
      const tokenHash = sha256(rawToken);
      const input = invitationInput(
        'accepted',
        'usr_pg_owner',
        'invitee@example.com',
        'member',
        tokenHash,
      );
      await expect(requireRepository().createWorkspaceInvitation(input)).resolves.toEqual({
        status: 'created',
        invitationId: input.invitation.id,
      });
      await expect(
        attemptInvitationFunctionUse(
          input.invitation.id,
          tokenHash,
          'usr_pg_cross',
          input.invitation.createdAt,
        ),
      ).resolves.toBe(false);
      expect(
        ownerScalar(
          `select count(*) from workspace_invitations where id = ${sqlLiteral(input.invitation.id)} and accepted_at is not null;`,
        ),
      ).toBe('0');
      await expect(
        requireRepository().acceptWorkspaceInvitation({
          invitationId: input.invitation.id,
          tokenHash,
          userId: 'usr_pg_invitee',
          acceptedAt: input.invitation.createdAt,
          eventId: tenantEventId('accepted'),
        }),
      ).resolves.toEqual({ status: 'accepted', workspaceId: WORKSPACE_ID, role: 'member' });
      await expect(
        requireRepository().acceptWorkspaceInvitation({
          invitationId: input.invitation.id,
          tokenHash,
          userId: 'usr_pg_invitee',
          acceptedAt: new Date().toISOString(),
          eventId: tenantEventId('replay'),
        }),
      ).resolves.toEqual({ status: 'invalid_or_expired' });
      expect(
        ownerScalar(
          `select count(*) from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_ID)} and user_id = 'usr_pg_invitee';`,
        ),
      ).toBe('1');
      expect(
        ownerScalar(
          `select count(*) from workspace_invitations where id = ${sqlLiteral(input.invitation.id)} and accepted_at is not null;`,
        ),
      ).toBe('1');
      expect(
        ownerScalar(
          `select count(*) from workspace_invitations where token_hash = ${sqlLiteral(tokenHash)};`,
        ),
      ).toBe('1');
      expect(fixtureOwnerDump('workspace_invitations')).not.toContain(rawToken);
    });

    it('revokes downgraded sessions and preserves the final-owner invariant', async () => {
      const inviteeSessionHash = sha256('pg-invitee-session');
      await expect(
        requireRepository().updateWorkspaceMemberRole({
          workspaceId: WORKSPACE_ID,
          targetUserId: 'usr_pg_invitee',
          actorUserId: 'usr_pg_owner',
          nextRole: 'viewer',
          changedAt: new Date().toISOString(),
          eventId: tenantEventId('downgrade'),
        }),
      ).resolves.toBe('completed');
      await expect(
        requireRepository().resolveAuthSession(inviteeSessionHash, new Date().toISOString()),
      ).resolves.toBeNull();
      await expect(
        requireRepository().removeWorkspaceMember({
          workspaceId: WORKSPACE_ID,
          targetUserId: 'usr_pg_owner',
          actorUserId: 'usr_pg_owner',
          removedAt: new Date().toISOString(),
          eventId: tenantEventId('final-owner'),
        }),
      ).resolves.toBe('final_owner');
      expect(
        ownerScalar(
          `select count(*) from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_ID)} and role = 'owner';`,
        ),
      ).toBe('1');
    });

    it('transfers ownership, schedules retention, and preserves append-only history', async () => {
      const transferredAt = new Date();
      await expect(
        requireRepository().transferWorkspaceOwnership({
          workspaceId: WORKSPACE_ID,
          actorUserId: 'usr_pg_owner',
          targetUserId: 'usr_pg_invitee',
          transferredAt: transferredAt.toISOString(),
          eventId: tenantEventId('transfer'),
        }),
      ).resolves.toBe('completed');
      const deletedAt = new Date(transferredAt.getTime() + 1_000);
      const retentionExpiresAt = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
      await expect(
        requireRepository().scheduleWorkspaceDeletion({
          workspaceId: WORKSPACE_ID,
          actorUserId: 'usr_pg_invitee',
          changedAt: deletedAt.toISOString(),
          retentionExpiresAt: retentionExpiresAt.toISOString(),
          eventId: tenantEventId('delete'),
        }),
      ).resolves.toMatchObject({ status: 'completed' });
      await expect(
        requireRepository().listIdentityWorkspaces('usr_pg_invitee'),
      ).resolves.not.toContainEqual(expect.objectContaining({ id: WORKSPACE_ID }));
      await expect(
        requireRepository().cancelWorkspaceDeletion({
          workspaceId: WORKSPACE_ID,
          actorUserId: 'usr_pg_invitee',
          changedAt: new Date(deletedAt.getTime() + 2_000).toISOString(),
          eventId: tenantEventId('cancel'),
        }),
      ).resolves.toBe('completed');
      const history = await requireRepository().listTenantAuditEvents(
        WORKSPACE_ID,
        'usr_pg_invitee',
      );
      expect(history).toMatchObject({ status: 'ok' });
      if (history.status !== 'ok') throw new Error('Expected tenant audit history');
      expect(history.value.map(({ eventType }) => eventType)).toEqual(
        expect.arrayContaining([
          'invitation_created',
          'invitation_accepted',
          'membership_role_changed',
          'ownership_transferred',
          'workspace_deletion_scheduled',
          'workspace_deletion_cancelled',
        ]),
      );
      await expect(
        requireRuntimePool().query('update tenant_audit_events set event_type = $1', [
          'membership_removed',
        ]),
      ).rejects.toThrow(/permission denied/iu);
    });

    it('rejects direct membership injection without an owner bootstrap or bound invitation', async () => {
      await expect(attemptMembershipInjection(WORKSPACE_ID, 'usr_pg_cross')).rejects.toThrow(
        /row-level security/iu,
      );
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('Tenant PostgreSQL repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('Tenant PostgreSQL runtime pool is unavailable');
  return runtimePool;
}

async function attemptMembershipInjection(workspaceId: string, userId: string): Promise<void> {
  const client = await requireRuntimePool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lodariq.workspace_id', $1, true)", [workspaceId]);
    await client.query("select set_config('lodariq.auth_user_id', $1, true)", [userId]);
    await client.query(
      `insert into workspace_memberships (workspace_id, user_id, role)
       values ($1, $2, 'owner')`,
      [workspaceId, userId],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function attemptInvitationFunctionUse(
  invitationId: string,
  tokenHash: string,
  userId: string,
  acceptedAt: string,
): Promise<boolean> {
  const client = await requireRuntimePool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lodariq.auth_user_id', $1, true)", [userId]);
    await client.query(
      "select set_config('lodariq.workspace_invitation_token_hash', $1, true)",
      [tokenHash],
    );
    const result = await client.query<{ accepted: boolean }>(
      `select public.lodariq_accept_workspace_invitation($1, $2, $3, $4::timestamptz) as accepted`,
      [invitationId, tokenHash, userId, acceptedAt],
    );
    await client.query('commit');
    return result.rows[0]?.accepted === true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function ownerScalar(statement: string): string {
  return requireFixture().runOwnerSql(statement).trim();
}

function fixtureOwnerDump(table: string): string {
  if (!/^[a-z_]+$/u.test(table)) throw new Error('Unsafe fixture table');
  return requireFixture().runOwnerSql(`select row_to_json(row) from ${table} row;`);
}

function requireFixture(): DisposablePostgresFixture {
  if (!fixture) throw new Error('Tenant PostgreSQL fixture is unavailable');
  return fixture;
}

function invitationInput(
  suffix: string,
  actorUserId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member',
  tokenHash = sha256(`pg-invitation-${suffix}`),
) {
  const now = new Date();
  return {
    invitation: {
      id: `invite_${safeSuffix(suffix)}_${'i'.repeat(20)}`,
      workspaceId: WORKSPACE_ID,
      emailNormalized: email,
      emailLookupHash: sha256(email),
      tokenHash,
      role,
      invitedByUserId: actorUserId,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
      acceptedAt: null,
      revokedAt: null,
      createdAt: now.toISOString(),
    },
    outbox: {
      id: `outbox_${safeSuffix(suffix)}_${'o'.repeat(20)}`,
      keyId: 'test',
      acceptancePath: '/accept-invitation',
    },
    eventId: tenantEventId(`created-${suffix}`),
  } as const;
}

function tenantEventId(suffix: string): string {
  return `tenevt_${safeSuffix(suffix)}_${'e'.repeat(20)}`;
}

function safeSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, '_');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function seedTenantSql(): string {
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const absoluteExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      ('usr_pg_owner', 'owner@example.com', 'Owner', now(), now()),
      ('usr_pg_admin', 'admin@example.com', 'Admin', now(), now()),
      ('usr_pg_member', 'member@example.com', 'Member', now(), now()),
      ('usr_pg_viewer', 'viewer@example.com', 'Viewer', now(), now()),
      ('usr_pg_removed', 'removed@example.com', 'Removed', now(), now()),
      ('usr_pg_cross', 'cross@example.com', 'Cross', now(), now()),
      ('usr_pg_invitee', 'invitee@example.com', 'Invitee', now(), now());
    insert into user_emails (
      id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at
    ) values
      ('email_pg_owner_${'x'.repeat(20)}', 'usr_pg_owner', 'owner@example.com', true, now(), now(), now()),
      ('email_pg_admin_${'x'.repeat(20)}', 'usr_pg_admin', 'admin@example.com', true, now(), now(), now()),
      ('email_pg_member_${'x'.repeat(20)}', 'usr_pg_member', 'member@example.com', true, now(), now(), now()),
      ('email_pg_viewer_${'x'.repeat(20)}', 'usr_pg_viewer', 'viewer@example.com', true, now(), now(), now()),
      ('email_pg_removed_${'x'.repeat(20)}', 'usr_pg_removed', 'removed@example.com', true, now(), now(), now()),
      ('email_pg_cross_${'x'.repeat(20)}', 'usr_pg_cross', 'cross@example.com', true, now(), now(), now()),
      ('email_pg_invitee_${'x'.repeat(20)}', 'usr_pg_invitee', 'invitee@example.com', true, now(), now(), now());
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'Tenant RLS', now(), now()),
      (${sqlLiteral(OTHER_WORKSPACE_ID)}, 'Other tenant RLS', now(), now());
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'usr_pg_owner', 'owner', now(), now()),
      (${sqlLiteral(WORKSPACE_ID)}, 'usr_pg_admin', 'admin', now(), now()),
      (${sqlLiteral(WORKSPACE_ID)}, 'usr_pg_member', 'member', now(), now()),
      (${sqlLiteral(WORKSPACE_ID)}, 'usr_pg_viewer', 'viewer', now(), now()),
      (${sqlLiteral(OTHER_WORKSPACE_ID)}, 'usr_pg_cross', 'owner', now(), now());
    insert into auth_sessions (
      id, user_id, token_hash, active_workspace_id, authentication_method,
      assurance_level, authenticated_at, duration_policy, created_at,
      last_seen_at, idle_expires_at, absolute_expires_at
    ) values (
      'authsess_pg_invitee_${'s'.repeat(20)}', 'usr_pg_invitee',
      ${sqlLiteral(sha256('pg-invitee-session'))}, ${sqlLiteral(WORKSPACE_ID)}, 'password',
      'aal1', now(), 'standard', now(), now(), ${sqlLiteral(idleExpiresAt)}::timestamptz,
      ${sqlLiteral(absoluteExpiresAt)}::timestamptz
    );
  `;
}
