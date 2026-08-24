import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDrizzleControlPlaneRepository,
  type ControlPlaneRepository,
  type LodariqDatabase,
} from '@lodariq/database';
import * as databaseSchema from '@lodariq/database/schema';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';
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

const NOW = '2026-08-21T11:00:00.000Z';
const WORKSPACE_ID = 'wk_exports_pg';
const USER_ID = 'usr_exports_pg';
const ENVIRONMENT_ID = 'env_exports_pg';
const DOCUMENT_ID = 'doc_exports_pg';
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'analytics exports under the restricted PostgreSQL 16 role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('exports');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedSql());
        runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl, max: 32 });
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

    it('serializes idempotent creation and gives one worker the lease', async () => {
      const input = {
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: DOCUMENT_ID,
        operationId: `anxop_${'a'.repeat(20)}`,
        requestHash: `sha256-${'b'.repeat(64)}`,
        kind: 'summary-csv' as const,
        actorUserId: USER_ID,
        requestedAt: NOW,
      };
      const created = await Promise.all(
        Array.from({ length: 24 }, () => requireRepository().createAnalyticsExportJob(input)),
      );
      expect(new Set(created.map((job) => job.id)).size).toBe(1);

      const claims = await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          requireRepository().claimAnalyticsExportJobs({
            workerId: `analytics_export_pg_${index}`,
            now: NOW,
            limit: 1,
          }),
        ),
      );
      const winningIndex = claims.findIndex((jobs) => jobs.length === 1);
      expect(claims.flat()).toHaveLength(1);
      expect(winningIndex).toBeGreaterThanOrEqual(0);

      const job = claims[winningIndex]![0]!;
      const content = '"metric","value"\r\n"shown","1"\r\n';
      const completed = await requireRepository().completeAnalyticsExportJob({
        workspaceId: WORKSPACE_ID,
        jobId: job.id,
        workerId: `analytics_export_pg_${winningIndex}`,
        filename: 'lodariq-export.csv',
        contentType: 'text/csv; charset=utf-8',
        contentBase64: Buffer.from(content).toString('base64'),
        byteLength: Buffer.byteLength(content),
        contentHash: `sha256-${createHash('sha256').update(content).digest('hex')}`,
        completedAt: '2026-08-21T11:00:01.000Z',
      });
      expect(completed).toMatchObject({ status: 'completed', attemptCount: 1 });
      await expect(
        requireRepository().markAnalyticsExportDownloaded(
          WORKSPACE_ID,
          job.id,
          USER_ID,
          '2026-08-21T11:00:02.000Z',
        ),
      ).resolves.toBe(true);
      await expect(
        requireRepository().expireAnalyticsExportJobs('2026-08-22T11:00:01.000Z'),
      ).resolves.toBe(1);
      const expired = await requireRepository().getAnalyticsExportJob(WORKSPACE_ID, job.id);
      expect(expired).toMatchObject({ status: 'expired' });
      expect(expired).not.toHaveProperty('contentBase64');
      await expect(
        requireRepository().listAnalyticsExportAuditEvents({
          workspaceId: WORKSPACE_ID,
          environmentId: ENVIRONMENT_ID,
          documentId: DOCUMENT_ID,
        }),
      ).resolves.toMatchObject([
        { eventType: 'requested' },
        { eventType: 'completed' },
        { eventType: 'downloaded' },
        { eventType: 'expired' },
      ]);
    });

    it('forces tenant scope and keeps audit history append-only', async () => {
      await expect(
        requireRuntimePool().query('select id from analytics_export_jobs'),
      ).resolves.toMatchObject({ rows: [] });
      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        await client.query("select set_config('lodariq.workspace_id', $1, true)", [WORKSPACE_ID]);
        const jobs = await client.query('select id, status from analytics_export_jobs');
        expect(jobs.rows).toHaveLength(1);
        const audit = await client.query('select id from analytics_export_audit_events');
        expect(audit.rows).toHaveLength(4);
        await expect(
          client.query("update analytics_export_audit_events set event_type = 'failed'"),
        ).rejects.toThrow(/permission denied/iu);
        await client.query('rollback');
      } finally {
        client.release();
      }
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL analytics export repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL analytics export pool is unavailable');
  return runtimePool;
}

function seedSql(): string {
  const policy = {
    allowDirectPublish: true,
    requireSourceVerification: false,
    requiredApprovalCount: 0,
    publisherRoles: ['owner', 'admin', 'member'],
    rollbackRoles: ['owner', 'admin'],
    unpublishRoles: ['owner', 'admin'],
    separationOfDuties: {
      requireSeparateVerifier: false,
      requireSeparateApprover: false,
    },
  };
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      (${sqlLiteral(USER_ID)}, 'exports-pg@example.com', 'Export worker', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'Exports PostgreSQL', '${NOW}', '${NOW}');
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(USER_ID)}, 'admin', '${NOW}', '${NOW}');
    insert into environments
      (id, workspace_id, kind, name, origin_allowlist, required_approval_count, enabled,
       pipeline_position, authoring_enabled, release_policy_json, created_at, updated_at)
    values
      (${sqlLiteral(ENVIRONMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'staging', 'Staging', '[]', 0,
       true, 1, true, ${jsonbLiteral(policy)}, '${NOW}', '${NOW}');
    insert into workspace_subscriptions
      (workspace_id, plan_id, plan_version, status, entitlement_overrides_json,
       current_period_start, current_period_end, revision, created_at, updated_at)
    values
      (${sqlLiteral(WORKSPACE_ID)}, 'business', ${sqlLiteral(COMMERCIAL_PLAN_VERSION)}, 'active', '{}',
       '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 1, '${NOW}', '${NOW}');
    insert into documents
      (id, workspace_id, type, status, title, schema_version, canonical,
       created_by_user_id, updated_by_user_id, created_at, updated_at)
    values
      (${sqlLiteral(DOCUMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'tour', 'draft', 'Analytics export',
       '1.0.0', ${jsonbLiteral({ id: DOCUMENT_ID, workspaceId: WORKSPACE_ID, type: 'tour' })},
       ${sqlLiteral(USER_ID)}, ${sqlLiteral(USER_ID)}, '${NOW}', '${NOW}');
  `;
}

function jsonbLiteral(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}
