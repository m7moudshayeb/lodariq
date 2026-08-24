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

const NOW = '2026-08-21T10:00:00.000Z';
const WORKSPACE_ID = 'wk_delivery_pg';
const USER_ID = 'usr_delivery_pg';
const STAGING_ID = 'env_delivery_pg_staging';
const PRODUCTION_ID = 'env_delivery_pg_production';
const DOCUMENT_ID = 'doc_delivery_pg';
const ARTIFACT_ID = 'artifact_delivery_pg';
const PUBLICATION_ID = 'pub_delivery_pg';
const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'delivery orchestration under the restricted PostgreSQL 16 role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('delivery');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(runtimeRoleGrantsSql(fixture.runtimeDatabaseUrl));
        fixture.runOwnerSql(seedSql());
        runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl, max: 20 });
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

    it('claims one due transition across concurrent workers and appends one result', async () => {
      const schedule = await requireRepository().createDeploymentSchedule({
        workspaceId: WORKSPACE_ID,
        environmentId: PRODUCTION_ID,
        documentId: DOCUMENT_ID,
        publicationId: PUBLICATION_ID,
        startAt: NOW,
        expectedGeneration: 0,
        idempotencyKey: 'schedule:delivery:pg16',
        requestHash: `sha256-${'b'.repeat(64)}`,
        actorUserId: USER_ID,
      });
      const attempts = await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          requireRepository().runDueDeliveryScheduleJobs({
            workerId: `delivery_worker_${index}`,
            now: NOW,
          }),
        ),
      );

      expect(attempts.flat().filter((result) => result.outcome === 'applied')).toHaveLength(1);
      await expect(
        requireRepository().getDocumentDeployment(WORKSPACE_ID, PRODUCTION_ID, DOCUMENT_ID),
      ).resolves.toMatchObject({
        state: 'active',
        activePublicationId: PUBLICATION_ID,
        generation: 1,
      });
      await expect(
        requireRepository().listDeliveryTransitionHistory(WORKSPACE_ID, PRODUCTION_ID, DOCUMENT_ID),
      ).resolves.toMatchObject([
        {
          scheduleId: schedule.id,
          transition: 'start',
          outcome: 'applied',
          fromGeneration: 0,
          toGeneration: 1,
        },
      ]);
    });

    it('forces tenant scope and denies changes to transition history', async () => {
      await expect(
        requireRuntimePool().query('select id from delivery_transition_history'),
      ).resolves.toMatchObject({ rows: [] });
      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        await client.query("select set_config('lodariq.workspace_id', $1, true)", [WORKSPACE_ID]);
        const scoped = await client.query('select id from delivery_transition_history');
        expect(scoped.rows).toHaveLength(1);
        await expect(
          client.query("update delivery_transition_history set reason_code = 'rewritten'"),
        ).rejects.toThrow(/permission denied/iu);
        await client.query('rollback');
      } finally {
        client.release();
      }
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL delivery repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL delivery pool is unavailable');
  return runtimePool;
}

function seedSql(): string {
  const stagingPolicy = {
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
  const productionPolicy = {
    ...stagingPolicy,
    allowDirectPublish: false,
    requireSourceVerification: true,
    publisherRoles: ['owner', 'admin'],
  };
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      (${sqlLiteral(USER_ID)}, 'delivery-pg@example.com', 'Delivery worker', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'Delivery PostgreSQL', '${NOW}', '${NOW}');
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(USER_ID)}, 'admin', '${NOW}', '${NOW}');
    insert into environments
      (id, workspace_id, kind, name, origin_allowlist, required_approval_count, enabled,
       pipeline_position, authoring_enabled, promotion_source_environment_id,
       release_policy_json, created_at, updated_at)
    values
      (${sqlLiteral(STAGING_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'staging', 'Staging', '[]', 0,
       true, 1, true, null, ${jsonbLiteral(stagingPolicy)}, '${NOW}', '${NOW}'),
      (${sqlLiteral(PRODUCTION_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'production', 'Production', '[]', 0,
       true, 2, false, ${sqlLiteral(STAGING_ID)}, ${jsonbLiteral(productionPolicy)}, '${NOW}', '${NOW}');
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
      (${sqlLiteral(DOCUMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'tour', 'draft', 'Scheduled tour',
       '1.0.0', ${jsonbLiteral({ id: DOCUMENT_ID, workspaceId: WORKSPACE_ID, type: 'tour' })},
       ${sqlLiteral(USER_ID)}, ${sqlLiteral(USER_ID)}, '${NOW}', '${NOW}');
    insert into compiled_artifacts
      (id, workspace_id, document_id, content_hash, compiler_version, compiled, created_at)
    values
      (${sqlLiteral(ARTIFACT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(DOCUMENT_ID)},
       ${sqlLiteral(CONTENT_HASH)}, 'pg16-test',
       ${jsonbLiteral({ documentId: DOCUMENT_ID, contentHash: CONTENT_HASH })}, '${NOW}');
    insert into publications
      (id, workspace_id, environment_id, document_id, compiled_artifact_id,
       content_hash, published_at, correlation_id, action, published_by_user_id)
    values
      (${sqlLiteral(PUBLICATION_ID)}, ${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(PRODUCTION_ID)},
       ${sqlLiteral(DOCUMENT_ID)}, ${sqlLiteral(ARTIFACT_ID)}, ${sqlLiteral(CONTENT_HASH)}, '${NOW}',
       'correlation:delivery:pg16', 'publish', ${sqlLiteral(USER_ID)});
  `;
}

function jsonbLiteral(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}
