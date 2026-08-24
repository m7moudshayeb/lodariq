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
const WORKSPACE_ID = 'wk_experiment_pg';
const ENVIRONMENT_ID = 'env_experiment_pg';
const DOCUMENT_ID = 'doc_experiment_pg';
const USER_ID = 'usr_experiment_pg';
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'experiment assignment under the restricted PostgreSQL 16 role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('experiment');
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

    it('deduplicates assignment races and preserves the assigned allocation revision', async () => {
      const experiment = await requireRepository().createExperiment({
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        varies: 'copy',
        successEventName: 'project_created',
        arms: [
          { id: 'A', label: 'Control', trafficPercent: 50, overrides: [] },
          {
            id: 'B',
            label: 'Variant',
            trafficPercent: 50,
            overrides: [{ type: 'copy', blockId: 'copy_1', text: 'Variant' }],
          },
        ],
        actorUserId: USER_ID,
      });
      await requireRepository().updateExperiment({
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        experimentId: experiment.id,
        status: 'running',
      });
      const input = {
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: DOCUMENT_ID,
        experimentId: experiment.id,
        assignmentKey: `lqv_${'4'.repeat(32)}`,
      };
      const assignments = await Promise.all(
        Array.from({ length: 16 }, () =>
          requireRepository().getOrCreateExperimentAssignment(input),
        ),
      );
      expect(new Set(assignments.map((assignment) => assignment?.armId)).size).toBe(1);
      expect(assignments.every((assignment) => assignment?.allocationRevision === 1)).toBe(true);
      expect(
        fixture?.runOwnerSql(
          `select count(*) from experience_experiment_assignments where experiment_id = ${sqlLiteral(experiment.id)};`,
        ),
      ).toBe('1');
      await expect(
        requireRuntimePool().query('select assignment_key_hash from experience_experiment_assignments'),
      ).resolves.toMatchObject({ rows: [] });
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL experiment repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL experiment pool is unavailable');
  return runtimePool;
}

function seedSql(): string {
  const releasePolicy = {
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
      (${sqlLiteral(USER_ID)}, 'experiment-pg@example.com', 'Experiment owner', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'Experiment PostgreSQL', '${NOW}', '${NOW}');
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(USER_ID)}, 'admin', '${NOW}', '${NOW}');
    insert into environments
      (id, workspace_id, kind, name, origin_allowlist, required_approval_count, enabled,
       pipeline_position, authoring_enabled, release_policy_json, created_at, updated_at)
    values
      (${sqlLiteral(ENVIRONMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'development', 'Development',
       '[]', 0, true, 0, true, ${jsonbLiteral(releasePolicy)}, '${NOW}', '${NOW}');
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
      (${sqlLiteral(DOCUMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)}, 'tour', 'draft', 'Experiment tour',
       '1.0.0', ${jsonbLiteral({ id: DOCUMENT_ID, workspaceId: WORKSPACE_ID, type: 'tour' })},
       ${sqlLiteral(USER_ID)}, ${sqlLiteral(USER_ID)}, '${NOW}', '${NOW}');
  `;
}

function jsonbLiteral(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}
