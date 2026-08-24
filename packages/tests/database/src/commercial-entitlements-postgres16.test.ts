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
import { AI_CREDIT_METER_VERSION } from '@lodariq/schema';
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

const NOW = '2026-08-21T05:00:00.000Z';
const WORKSPACE_DEDUPE = 'wk_commercial_pg_dedupe';
const WORKSPACE_AI = 'wk_commercial_pg_ai';
const WORKSPACE_THEME = 'wk_commercial_pg_theme';
const WORKSPACE_RLS_A = 'wk_commercial_pg_rls_a';
const WORKSPACE_RLS_B = 'wk_commercial_pg_rls_b';
const WORKSPACE_SEATS = 'wk_commercial_pg_seats';
const WORKSPACE_ASSET = 'wk_commercial_pg_asset';
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'commercial entitlements under the restricted PostgreSQL 16 role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('commercial');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedSql());
        runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl, max: 24 });
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

    it('deduplicates 24 simultaneous engagement writes to one ledger row', async () => {
      const results = await Promise.all(
        Array.from({ length: 24 }, () =>
          requireRepository().recordWorkspaceUsage({
            workspaceId: WORKSPACE_DEDUPE,
            environmentId: 'env_commercial_pg_dedupe',
            metric: 'engaged-users',
            quantity: 1,
            dedupeKey: 'same-user-month',
            occurredAt: NOW,
          }),
        ),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      await expect(
        requireRepository().readWorkspaceCommercialUsage(WORKSPACE_DEDUPE),
      ).resolves.toMatchObject({
        planId: 'free',
        engagedUsers: { used: 1, limit: 1_000, enforcement: 'soft' },
      });
    });

    it('serializes concurrent AI and theme-generation hard caps', async () => {
      const aiResults = await Promise.allSettled(
        Array.from({ length: 10 }, (_, index) =>
          requireRepository().debitAiCredits({
            workspaceId: WORKSPACE_AI,
            operationId: `aiop_concurrent_${String(index).padStart(20, '0')}`,
            provider: 'stress-provider',
            meterVersion: AI_CREDIT_METER_VERSION,
            usageUnit: 'tokens',
            inputUnits: 100,
            outputUnits: 50,
            providerCostMicros: 100,
            credits: 10,
            occurredAt: NOW,
          }),
        ),
      );
      expect(aiResults.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
      expect(aiResults.filter((result) => result.status === 'rejected')).toHaveLength(5);
      await expect(
        requireRepository().readWorkspaceCommercialUsage(WORKSPACE_AI),
      ).resolves.toMatchObject({
        aiCredits: { used: 50, limit: 50, status: 'near' },
      });

      const themeResults = await Promise.allSettled(
        Array.from({ length: 8 }, (_, index) =>
          requireRepository().consumeThemeGenerationRun({
            workspaceId: WORKSPACE_THEME,
            operationId: `proposal-concurrent-${index}`,
            occurredAt: NOW,
          }),
        ),
      );
      expect(themeResults.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(themeResults.filter((result) => result.status === 'rejected')).toHaveLength(7);
      await expect(
        requireRepository().readWorkspaceCommercialUsage(WORKSPACE_THEME),
      ).resolves.toMatchObject({ themeGenerationRuns: { used: 1, limit: 1 } });
    });

    it('isolates tenant ledgers and denies mutation of append-only commercial history', async () => {
      await requireRepository().recordWorkspaceUsage({
        workspaceId: WORKSPACE_RLS_A,
        metric: 'engaged-users',
        quantity: 1,
        dedupeKey: 'tenant-a',
        occurredAt: NOW,
      });
      await requireRepository().recordWorkspaceUsage({
        workspaceId: WORKSPACE_RLS_B,
        metric: 'engaged-users',
        quantity: 1,
        dedupeKey: 'tenant-b',
        occurredAt: NOW,
      });

      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        await client.query("select set_config('lodariq.workspace_id', $1, true)", [
          WORKSPACE_RLS_A,
        ]);
        const scoped = await client.query<{ workspace_id: string }>(
          'select workspace_id from workspace_usage_ledger order by workspace_id',
        );
        expect(scoped.rows).toEqual([{ workspace_id: WORKSPACE_RLS_A }]);
        await expect(
          client.query('update workspace_usage_ledger set quantity = quantity + 1'),
        ).rejects.toThrow(/permission denied/iu);
        await client.query('rollback');
      } finally {
        client.release();
      }

      await expect(
        requireRuntimePool().query('select workspace_id from workspace_usage_ledger'),
      ).resolves.toMatchObject({ rows: [] });
    });

    it('admits only one creator when two invitations race for the final Free seat', async () => {
      const results = await Promise.all([
        requireRepository().acceptWorkspaceInvitation(invitationAcceptance('one')),
        requireRepository().acceptWorkspaceInvitation(invitationAcceptance('two')),
      ]);
      expect(results).toEqual(
        expect.arrayContaining([
          { status: 'accepted', workspaceId: WORKSPACE_SEATS, role: 'member' },
          { status: 'seat_limit_reached' },
        ]),
      );
      expect(
        fixture?.runOwnerSql(
          `select count(*) from workspace_memberships where workspace_id = ${sqlLiteral(WORKSPACE_SEATS)};`,
        ),
      ).toBe('1');
    });

    it('stores paid-plan media above the legacy 5 MiB limit in the additive asset table', async () => {
      await requireRepository().readWorkspaceEntitlementSnapshot(WORKSPACE_ASSET);
      await requireRepository().changeWorkspaceSubscription({
        workspaceId: WORKSPACE_ASSET,
        planId: 'scale',
        expectedRevision: 1,
        changeActorId: 'usr_commercial_pg_inviter',
        changedAt: NOW,
      });
      const asset = await requireRepository().createAuthoringMediaAsset({
        workspaceId: WORKSPACE_ASSET,
        actorUserId: 'usr_commercial_pg_inviter',
        kind: 'video',
        filename: 'large-demo.mp4',
        contentType: 'video/mp4',
        contentBase64: 'AA==',
        byteLength: 6 * 1_048_576,
        contentHash: `sha256-${'a'.repeat(64)}`,
        savedToLibrary: true,
      });

      expect(asset.byteLength).toBe(6 * 1_048_576);
      expect(
        fixture?.runOwnerSql(
          `select count(*) from authoring_media_assets_v2 where id = ${sqlLiteral(asset.id)};`,
        ),
      ).toBe('1');
      expect(
        fixture?.runOwnerSql(
          `select count(*) from authoring_media_assets where id = ${sqlLiteral(asset.id)};`,
        ),
      ).toBe('0');
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL commercial repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL commercial pool is unavailable');
  return runtimePool;
}

function invitationAcceptance(suffix: 'one' | 'two') {
  return {
    invitationId: `invite_commercial_pg_${suffix}_${'x'.repeat(20)}`,
    tokenHash: suffix === 'one' ? '1'.repeat(64) : '2'.repeat(64),
    userId: `usr_commercial_pg_${suffix}`,
    acceptedAt: NOW,
    eventId: `tenevt_commercial_pg_${suffix}_${'x'.repeat(20)}`,
  };
}

function seedSql(): string {
  const workspaces = [
    WORKSPACE_DEDUPE,
    WORKSPACE_AI,
    WORKSPACE_THEME,
    WORKSPACE_RLS_A,
    WORKSPACE_RLS_B,
    WORKSPACE_SEATS,
    WORKSPACE_ASSET,
  ];
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      ('usr_commercial_pg_inviter', 'inviter@example.com', 'Inviter', '${NOW}', '${NOW}'),
      ('usr_commercial_pg_one', 'one@example.com', 'One', '${NOW}', '${NOW}'),
      ('usr_commercial_pg_two', 'two@example.com', 'Two', '${NOW}', '${NOW}');
    insert into user_emails
      (id, user_id, normalized_email, is_primary, verified_at, created_at, updated_at) values
      ('email_commercial_pg_inviter_${'x'.repeat(20)}', 'usr_commercial_pg_inviter', 'inviter@example.com', true, '${NOW}', '${NOW}', '${NOW}'),
      ('email_commercial_pg_one_${'x'.repeat(20)}', 'usr_commercial_pg_one', 'one@example.com', true, '${NOW}', '${NOW}', '${NOW}'),
      ('email_commercial_pg_two_${'x'.repeat(20)}', 'usr_commercial_pg_two', 'two@example.com', true, '${NOW}', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      ${workspaces.map((workspaceId) => `(${sqlLiteral(workspaceId)}, ${sqlLiteral(workspaceId)}, '${NOW}', '${NOW}')`).join(',\n      ')};
    insert into environments
      (id, workspace_id, kind, name, origin_allowlist, required_approval_count, enabled,
       pipeline_position, authoring_enabled, release_policy_json, created_at, updated_at)
      values ('env_commercial_pg_dedupe', '${WORKSPACE_DEDUPE}', 'development', 'Development',
        '["http://localhost:3000"]'::jsonb, 0, true, 0, true,
        '{"allowDirectPublish":true,"requireSourceVerification":false,"requiredApprovalCount":0,"publisherRoles":["owner","admin","member"],"rollbackRoles":["owner","admin"],"unpublishRoles":["owner","admin"],"separationOfDuties":{"requireSeparateVerifier":false,"requireSeparateApprover":false}}'::jsonb,
        '${NOW}', '${NOW}');
    insert into workspace_invitations
      (id, workspace_id, email_normalized, email_lookup_hash, token_hash, role,
       invited_by_user_id, expires_at, accepted_at, revoked_at, created_at) values
      ('invite_commercial_pg_one_${'x'.repeat(20)}', '${WORKSPACE_SEATS}', 'one@example.com',
       '${'a'.repeat(64)}', '${'1'.repeat(64)}', 'member', 'usr_commercial_pg_inviter',
       '2026-09-01T00:00:00.000Z', null, null, '${NOW}'),
      ('invite_commercial_pg_two_${'x'.repeat(20)}', '${WORKSPACE_SEATS}', 'two@example.com',
       '${'b'.repeat(64)}', '${'2'.repeat(64)}', 'member', 'usr_commercial_pg_inviter',
       '2026-09-01T00:00:00.000Z', null, null, '${NOW}');
  `;
}
