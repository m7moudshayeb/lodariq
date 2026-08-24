import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDrizzleControlPlaneRepository,
  type ControlPlaneRepository,
  type LodariqDatabase,
} from '@lodariq/database';
import * as databaseSchema from '@lodariq/database/schema';
import { listCheckedInSqlPaths } from './migration-test-utils.js';
import {
  businessWorkspaceSubscriptionSql,
  createDisposablePostgresFixture,
  DISPOSABLE_POSTGRES_ENABLED,
  runtimeRoleGrantsSql,
  sqlLiteral,
  type DisposablePostgresFixture,
} from './postgres16-test-harness.js';

const requireFromDatabase = createRequire(
  fileURLToPath(new URL('../../../database/package.json', import.meta.url)),
);
const { drizzle: createNodePgDatabase } = requireFromDatabase('drizzle-orm/node-postgres') as {
  drizzle(client: Pool, config: { schema: typeof databaseSchema }): unknown;
};

const NOW = '2026-08-22T12:00:00.000Z';
const WORKSPACE_A = 'wk_governance_pg_a';
const WORKSPACE_B = 'wk_governance_pg_b';
const USER_A = 'usr_governance_pg_a';
const USER_B = 'usr_governance_pg_b';
let fixture: DisposablePostgresFixture | undefined;
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'governance platform under the restricted PostgreSQL 16 role',
  () => {
    beforeAll(async () => {
      fixture = createDisposablePostgresFixture('governance');
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

    it('serializes event fanout and gives one worker each delivery lease', async () => {
      const endpointId = opaque('whep', 'governance-pg');
      await expect(
        requireRepository().createWebhookEndpoint({
          endpoint: {
            id: endpointId,
            workspaceId: WORKSPACE_A,
            url: 'https://hooks.example.com/governance',
            eventTypes: ['release.activated'],
            secretVersion: 1,
            enabled: true,
            createdByUserId: USER_A,
            createdAt: NOW,
            updatedAt: NOW,
          },
          actorUserId: USER_A,
          auditEventId: opaque('tenevt', 'endpoint'),
        }),
      ).resolves.toMatchObject({ status: 'completed' });
      const event = {
        schemaVersion: '1' as const,
        id: opaque('whevt', 'governance-pg'),
        workspaceId: WORKSPACE_A,
        type: 'release.activated' as const,
        occurredAt: NOW,
        data: { documentId: 'doc_governance_pg' },
      };
      const fanout = await Promise.all(
        Array.from({ length: 16 }, () =>
          requireRepository().enqueueWebhookEvent({
            event,
            deliveryIdForEndpoint: () => opaque('whdel', 'governance-pg'),
          }),
        ),
      );
      expect(new Set(fanout.flat().map(({ id }) => id)).size).toBe(1);
      const leases = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          requireRepository().leaseWebhookDeliveries(
            `worker_${index}`,
            NOW,
            '2026-08-22T12:00:30.000Z',
            1,
          ),
        ),
      );
      expect(leases.flat()).toHaveLength(1);
    });

    it('isolates governance and residency rows and protects append-only histories', async () => {
      await expect(
        requireRepository().requestDataResidencyMigration({
          migrationId: opaque('drmig', 'eu'),
          historyId: opaque('drhist', 'requested'),
          workspaceId: WORKSPACE_A,
          targetRegion: 'eu',
          expectedPlacementGeneration: 0,
          idempotencyKey: 'governance-pg-eu',
          actorUserId: USER_A,
          requestedAt: NOW,
          auditEventId: opaque('tenevt', 'residency'),
        }),
      ).resolves.toMatchObject({ status: 'completed' });

      const client = await requireRuntimePool().connect();
      try {
        await client.query('begin');
        try {
          await client.query("select set_config('lodariq.workspace_id', $1, true)", [WORKSPACE_B]);
          await expect(client.query('select id from webhook_events')).resolves.toMatchObject({
            rows: [],
          });
          await expect(
            client.query('select id from data_residency_migrations'),
          ).resolves.toMatchObject({ rows: [] });
        } finally {
          await client.query('rollback');
        }

        await expectWorkspaceMutationDenied(
          client,
          "update webhook_events set event_type = 'release.unpublished'",
        );
        await expectWorkspaceMutationDenied(
          client,
          "update data_residency_migration_history set next_status = 'failed'",
        );
      } finally {
        client.release();
      }
    });
  },
);

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('PostgreSQL governance repository is unavailable');
  return repository;
}

function requireRuntimePool(): Pool {
  if (!runtimePool) throw new Error('PostgreSQL governance pool is unavailable');
  return runtimePool;
}

async function expectWorkspaceMutationDenied(client: PoolClient, statement: string): Promise<void> {
  await client.query('begin');
  try {
    await client.query("select set_config('lodariq.workspace_id', $1, true)", [WORKSPACE_A]);
    await expect(client.query(statement)).rejects.toThrow(/permission denied/iu);
  } finally {
    await client.query('rollback');
  }
}

function seedSql(): string {
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      (${sqlLiteral(USER_A)}, 'governance-a@example.com', 'Governance A', '${NOW}', '${NOW}'),
      (${sqlLiteral(USER_B)}, 'governance-b@example.com', 'Governance B', '${NOW}', '${NOW}');
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_A)}, 'Governance A', '${NOW}', '${NOW}'),
      (${sqlLiteral(WORKSPACE_B)}, 'Governance B', '${NOW}', '${NOW}');
    ${businessWorkspaceSubscriptionSql(WORKSPACE_A, NOW)}
    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(USER_A)}, 'owner', '${NOW}', '${NOW}'),
      (${sqlLiteral(WORKSPACE_B)}, ${sqlLiteral(USER_B)}, 'owner', '${NOW}', '${NOW}');
  `;
}

function opaque(prefix: string, suffix: string): string {
  return `${prefix}_${suffix.replace(/[^A-Za-z0-9_-]/gu, '_')}_${'x'.repeat(24)}`;
}
