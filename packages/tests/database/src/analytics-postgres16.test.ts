import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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
import type { AuthoritativeAnalyticsEvent } from '@lodariq/schema';
import { listCheckedInSqlPaths } from './migration-test-utils.js';

const ADMIN_DATABASE_URL = process.env.LODARIQ_TEST_POSTGRES_ADMIN_URL?.trim() ?? '';
const DISPOSABLE_POSTGRES_ENABLED =
  process.env.LODARIQ_DISPOSABLE_POSTGRES === '1' && ADMIN_DATABASE_URL.length > 0;
const CREATED_AT = '2026-08-09T08:00:00.000Z';
const WORKSPACE_A = 'wk_analytics_pg16_a';
const WORKSPACE_B = 'wk_analytics_pg16_b';
const STAGING_A = 'env_analytics_pg16_staging_a';
const PRODUCTION_A = 'env_analytics_pg16_production_a';
const STAGING_B = 'env_analytics_pg16_staging_b';
const DOCUMENT_A = 'doc_analytics_pg16_a';
const DOCUMENT_B = 'doc_analytics_pg16_b';
const ARTIFACT_A_FIRST = 'artifact_analytics_pg16_a_first';
const ARTIFACT_A_CURRENT = 'artifact_analytics_pg16_a_current';
const ARTIFACT_B = 'artifact_analytics_pg16_b';
const PUBLICATION_A_STAGING = 'pub_analytics_pg16_a_staging';
const PUBLICATION_A_CURRENT = 'pub_analytics_pg16_a_current';
const PUBLICATION_A_ROLLBACK = 'pub_analytics_pg16_a_rollback';
const PUBLICATION_B_STAGING = 'pub_analytics_pg16_b_staging';
const HASH_A_FIRST = `sha256-${'a'.repeat(64)}`;
const HASH_A_CURRENT = `sha256-${'b'.repeat(64)}`;
const HASH_B = `sha256-${'c'.repeat(64)}`;
const TEST_SUFFIX = randomBytes(6).toString('hex');
const TEST_DATABASE_NAME = `lodariq_analytics_ci_${TEST_SUFFIX}`;
const RUNTIME_ROLE = `lodariq_analytics_app_${TEST_SUFFIX}`;
const RUNTIME_PASSWORD = `lodariq_analytics_runtime_${TEST_SUFFIX}_password`;
const requireFromDatabase = createRequire(
  fileURLToPath(new URL('../../../database/package.json', import.meta.url)),
);
const { drizzle: createNodePgDatabase } = requireFromDatabase(
  'drizzle-orm/node-postgres',
) as NodePgDrizzleModule;

let databaseCreated = false;
let runtimeRoleCreated = false;
let ownerDatabaseUrl = '';
let runtimeDatabaseUrl = '';
let runtimePool: Pool | undefined;
let repository: ControlPlaneRepository | undefined;

interface NodePgDrizzleModule {
  drizzle(client: Pool, config: { schema: typeof databaseSchema }): unknown;
}

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'authoritative analytics on disposable PostgreSQL 16',
  () => {
    beforeAll(async () => {
      assertDisposableAdminDatabase(ADMIN_DATABASE_URL);
      const serverVersionNumber = Number(
        runPsqlSync(ADMIN_DATABASE_URL, 'show server_version_num;'),
      );
      if (Math.trunc(serverVersionNumber / 10_000) !== 16) {
        throw new Error(
          `Authoritative analytics coverage requires PostgreSQL 16, got ${serverVersionNumber}`,
        );
      }

      runPsqlSync(ADMIN_DATABASE_URL, `create database ${quoteIdentifier(TEST_DATABASE_NAME)};`);
      databaseCreated = true;
      ownerDatabaseUrl = databaseUrlFor(ADMIN_DATABASE_URL, TEST_DATABASE_NAME);
      for (const migrationPath of listCheckedInSqlPaths()) {
        runPsqlFileSync(ownerDatabaseUrl, migrationPath);
      }

      runPsqlSync(
        ADMIN_DATABASE_URL,
        [
          `create role ${quoteIdentifier(RUNTIME_ROLE)}`,
          `  login password ${sqlLiteral(RUNTIME_PASSWORD)}`,
          '  nosuperuser nocreatedb nocreaterole noinherit nobypassrls;',
          `grant connect on database ${quoteIdentifier(TEST_DATABASE_NAME)} to ${quoteIdentifier(RUNTIME_ROLE)};`,
        ].join('\n'),
      );
      runtimeRoleCreated = true;
      runtimeDatabaseUrl = databaseUrlWithCredentials(
        ownerDatabaseUrl,
        RUNTIME_ROLE,
        RUNTIME_PASSWORD,
      );

      runPsqlSync(ownerDatabaseUrl, runtimeRoleGrantsSql());
      runPsqlSync(ownerDatabaseUrl, seedSql());
      runtimePool = new Pool({ connectionString: runtimeDatabaseUrl, max: 4 });
      const nodePgDatabase = createNodePgDatabase(runtimePool, { schema: databaseSchema });
      repository = createDrizzleControlPlaneRepository(nodePgDatabase as LodariqDatabase);

      await ingestAnalyticsFixtures(requireRepository());
    }, 60_000);

    afterAll(async () => {
      await runtimePool?.end();
      cleanupDisposableDatabase();
    }, 30_000);

    it('persists exact authoritative dimensions and isolates staging from production', async () => {
      const stagingEvents = await requireRepository().listAnalyticsEvents({
        workspaceId: WORKSPACE_A,
        query: { environmentId: STAGING_A },
      });
      expect(stagingEvents).toHaveLength(1);
      expect(stagingEvents[0]).toMatchObject({
        workspaceId: WORKSPACE_A,
        environmentId: STAGING_A,
        documentId: DOCUMENT_A,
        publicationId: PUBLICATION_A_STAGING,
        contentHash: HASH_A_FIRST,
        pointerGeneration: 2,
        name: 'tour.opened',
      });

      const stagingAggregates = await requireRepository().aggregateAnalyticsEvents({
        workspaceId: WORKSPACE_A,
        query: { environmentId: STAGING_A },
      });
      expect(stagingAggregates).toEqual([
        expect.objectContaining({
          workspaceId: WORKSPACE_A,
          environmentId: STAGING_A,
          publicationId: PUBLICATION_A_STAGING,
          contentHash: HASH_A_FIRST,
          pointerGeneration: 2,
          name: 'tour.opened',
          count: 1,
        }),
      ]);

      const productionAggregates = await requireRepository().aggregateAnalyticsEvents({
        workspaceId: WORKSPACE_A,
        query: { environmentId: PRODUCTION_A },
      });
      expect(
        productionAggregates.every((aggregate) => aggregate.environmentId === PRODUCTION_A),
      ).toBe(true);
      const tourOpened = productionAggregates.filter(
        (aggregate) => aggregate.name === 'tour.opened',
      );
      expect(tourOpened).toHaveLength(2);
      expect(tourOpened).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            publicationId: PUBLICATION_A_CURRENT,
            contentHash: HASH_A_CURRENT,
            pointerGeneration: 7,
            count: 1,
          }),
          expect.objectContaining({
            publicationId: PUBLICATION_A_ROLLBACK,
            contentHash: HASH_A_FIRST,
            pointerGeneration: 8,
            count: 2,
          }),
        ]),
      );
      expect(tourOpened.every((aggregate) => aggregate.documentId === DOCUMENT_A)).toBe(true);
      expect(productionAggregates.some((aggregate) => aggregate.environmentId === STAGING_A)).toBe(
        false,
      );
    });

    it('groups target resolution by the closed verdict and maps client inventions to unknown', async () => {
      const productionAggregates = await requireRepository().aggregateAnalyticsEvents({
        workspaceId: WORKSPACE_A,
        query: {
          environmentId: PRODUCTION_A,
          publicationId: PUBLICATION_A_ROLLBACK,
          contentHash: HASH_A_FIRST,
        },
      });
      const statusCounts = Object.fromEntries(
        productionAggregates
          .filter(
            (aggregate) =>
              aggregate.name === 'target_resolution' && 'targetResolutionStatus' in aggregate,
          )
          .map((aggregate) => [aggregate.targetResolutionStatus, aggregate.count]),
      );
      expect(statusCounts).toEqual({
        found: 2,
        ambiguous: 1,
        missing: 1,
        needs_review: 1,
        unknown: 1,
      });
      expect(statusCounts).not.toHaveProperty('failure');
      expect(
        productionAggregates.every(
          (aggregate) =>
            aggregate.publicationId === PUBLICATION_A_ROLLBACK &&
            aggregate.contentHash === HASH_A_FIRST &&
            aggregate.pointerGeneration === 8,
        ),
      ).toBe(true);
    });

    it('keeps two tenants isolated through Drizzle and forced runtime-role RLS', async () => {
      const tenantB = await requireRepository().listAnalyticsEvents({
        workspaceId: WORKSPACE_B,
        query: { environmentId: STAGING_B },
      });
      expect(tenantB).toHaveLength(1);
      expect(tenantB[0]).toMatchObject({
        workspaceId: WORKSPACE_B,
        environmentId: STAGING_B,
        documentId: DOCUMENT_B,
        publicationId: PUBLICATION_B_STAGING,
        contentHash: HASH_B,
        pointerGeneration: 3,
      });
      await expect(
        requireRepository().aggregateAnalyticsEvents({
          workspaceId: WORKSPACE_A,
          query: { environmentId: STAGING_B },
        }),
      ).resolves.toEqual([]);

      expect(runPsqlSync(runtimeDatabaseUrl, 'select count(*) from analytics_events;')).toBe('0');
      expect(
        runPsqlSync(
          runtimeDatabaseUrl,
          scopedSql(WORKSPACE_A, 'select count(*) from analytics_events;'),
        ),
      ).toBe('10');
      expect(
        runPsqlSync(
          runtimeDatabaseUrl,
          scopedSql(WORKSPACE_B, 'select count(*) from analytics_events;'),
        ),
      ).toBe('1');

      await expect(
        runPsqlAsync(
          runtimeDatabaseUrl,
          scopedSql(
            WORKSPACE_A,
            analyticsInsertSql(
              'aevt_analytics_pg16_cross_tenant',
              analyticsEvent({
                workspaceId: WORKSPACE_B,
                environmentId: STAGING_B,
                documentId: DOCUMENT_B,
                publicationId: PUBLICATION_B_STAGING,
                contentHash: HASH_B,
                pointerGeneration: 3,
              }),
            ),
          ),
        ),
      ).rejects.toThrow(/row-level security/iu);
    });

    it('keeps authoritative analytics append-only for the runtime role', async () => {
      const tableContract = queryJson<{
        rowSecurity: boolean;
        forcedRowSecurity: boolean;
        canUpdate: boolean;
        canDelete: boolean;
      }>(
        ownerDatabaseUrl,
        `select json_build_object(
          'rowSecurity', class.relrowsecurity,
          'forcedRowSecurity', class.relforcerowsecurity,
          'canUpdate', has_table_privilege(${sqlLiteral(RUNTIME_ROLE)}, 'analytics_events', 'UPDATE'),
          'canDelete', has_table_privilege(${sqlLiteral(RUNTIME_ROLE)}, 'analytics_events', 'DELETE')
        )
        from pg_class class
        where class.oid = 'public.analytics_events'::regclass;`,
      );
      expect(tableContract).toEqual({
        rowSecurity: true,
        forcedRowSecurity: true,
        canUpdate: false,
        canDelete: false,
      });

      for (const statement of [
        `update analytics_events set sdk_version = sdk_version
         where workspace_id = ${sqlLiteral(WORKSPACE_A)};`,
        `delete from analytics_events where workspace_id = ${sqlLiteral(WORKSPACE_A)};`,
      ]) {
        await expect(
          runPsqlAsync(runtimeDatabaseUrl, scopedSql(WORKSPACE_A, statement)),
        ).rejects.toThrow(/permission denied/iu);
      }
      expect(runPsqlSync(ownerDatabaseUrl, 'select count(*) from analytics_events;')).toBe('11');
    });
  },
);

async function ingestAnalyticsFixtures(target: ControlPlaneRepository): Promise<void> {
  await target.ingestAuthoritativeEvents({
    workspaceId: WORKSPACE_A,
    environmentId: STAGING_A,
    events: [
      analyticsEvent({
        environmentId: STAGING_A,
        publicationId: PUBLICATION_A_STAGING,
        contentHash: HASH_A_FIRST,
        pointerGeneration: 2,
        timestamp: '2026-08-09T08:00:00.000Z',
      }),
    ],
  });
  await target.ingestAuthoritativeEvents({
    workspaceId: WORKSPACE_A,
    environmentId: PRODUCTION_A,
    events: [
      analyticsEvent({
        environmentId: PRODUCTION_A,
        publicationId: PUBLICATION_A_CURRENT,
        contentHash: HASH_A_CURRENT,
        pointerGeneration: 7,
        timestamp: '2026-08-09T09:00:00.000Z',
      }),
      analyticsEvent({
        environmentId: PRODUCTION_A,
        publicationId: PUBLICATION_A_ROLLBACK,
        contentHash: HASH_A_FIRST,
        pointerGeneration: 8,
        timestamp: '2026-08-09T09:10:00.000Z',
      }),
      analyticsEvent({
        environmentId: PRODUCTION_A,
        publicationId: PUBLICATION_A_ROLLBACK,
        contentHash: HASH_A_FIRST,
        pointerGeneration: 8,
        timestamp: '2026-08-09T09:11:00.000Z',
      }),
      ...targetResolutionEvents(),
    ],
  });
  await target.ingestAuthoritativeEvents({
    workspaceId: WORKSPACE_B,
    environmentId: STAGING_B,
    events: [
      analyticsEvent({
        workspaceId: WORKSPACE_B,
        environmentId: STAGING_B,
        documentId: DOCUMENT_B,
        publicationId: PUBLICATION_B_STAGING,
        contentHash: HASH_B,
        pointerGeneration: 3,
        timestamp: '2026-08-09T10:00:00.000Z',
      }),
    ],
  });
}

function targetResolutionEvents(): AuthoritativeAnalyticsEvent[] {
  const statuses = ['found', 'found', 'ambiguous', 'missing', 'needs_review', 'invented-status'];
  return statuses.map((result, index) =>
    analyticsEvent({
      environmentId: PRODUCTION_A,
      publicationId: PUBLICATION_A_ROLLBACK,
      contentHash: HASH_A_FIRST,
      pointerGeneration: 8,
      name: 'target_resolution',
      timestamp: new Date(Date.UTC(2026, 7, 9, 9, 20 + index)).toISOString(),
      props: { result },
    }),
  );
}

function analyticsEvent(
  overrides: Partial<AuthoritativeAnalyticsEvent> = {},
): AuthoritativeAnalyticsEvent {
  return {
    workspaceId: WORKSPACE_A,
    environmentId: STAGING_A,
    documentId: DOCUMENT_A,
    publicationId: PUBLICATION_A_STAGING,
    contentHash: HASH_A_FIRST,
    pointerGeneration: 2,
    name: 'tour.opened',
    sdkVersion: '2.0.0-pg16',
    correlationId: 'correlation:analytics:pg16',
    timestamp: CREATED_AT,
    props: { source: 'launcher' },
    ...overrides,
  };
}

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('disposable PostgreSQL repository was not initialized');
  return repository;
}

function runtimeRoleGrantsSql(): string {
  const role = quoteIdentifier(RUNTIME_ROLE);
  return `
    grant usage on schema public to ${role};
    grant select, insert, update, delete on all tables in schema public to ${role};
    revoke update, delete on analytics_events from ${role};
  `;
}

function seedSql(): string {
  return `
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_A)}, 'Analytics tenant A', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(WORKSPACE_B)}, 'Analytics tenant B', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into environments (
      id, workspace_id, kind, name, origin_allowlist, required_approval_count,
      enabled, pipeline_position, authoring_enabled, promotion_source_environment_id,
      release_policy_json, created_at, updated_at
    ) values
      (${sqlLiteral(STAGING_A)}, ${sqlLiteral(WORKSPACE_A)}, 'staging', 'Staging A', '[]', 0,
       true, 1, true, null, ${jsonbLiteral(stagingReleasePolicy())}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(PRODUCTION_A)}, ${sqlLiteral(WORKSPACE_A)}, 'production', 'Production A', '[]', 0,
       true, 2, false, ${sqlLiteral(STAGING_A)}, ${jsonbLiteral(productionReleasePolicy())}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(STAGING_B)}, ${sqlLiteral(WORKSPACE_B)}, 'staging', 'Staging B', '[]', 0,
       true, 1, true, null, ${jsonbLiteral(stagingReleasePolicy())}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into documents (
      id, workspace_id, type, status, title, schema_version, canonical, created_at, updated_at
    ) values
      (${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(WORKSPACE_A)}, 'tour', 'draft', 'Analytics A', '1.0.0', '{}', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(DOCUMENT_B)}, ${sqlLiteral(WORKSPACE_B)}, 'tour', 'draft', 'Analytics B', '1.0.0', '{}', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into compiled_artifacts (
      id, workspace_id, document_id, content_hash, compiler_version, compiled, created_at
    ) values
      (${sqlLiteral(ARTIFACT_A_FIRST)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(HASH_A_FIRST)}, 'pg16-test', ${jsonbLiteral({ documentId: DOCUMENT_A, contentHash: HASH_A_FIRST })}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(ARTIFACT_A_CURRENT)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(HASH_A_CURRENT)}, 'pg16-test', ${jsonbLiteral({ documentId: DOCUMENT_A, contentHash: HASH_A_CURRENT })}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(ARTIFACT_B)}, ${sqlLiteral(WORKSPACE_B)}, ${sqlLiteral(DOCUMENT_B)}, ${sqlLiteral(HASH_B)}, 'pg16-test', ${jsonbLiteral({ documentId: DOCUMENT_B, contentHash: HASH_B })}, ${sqlLiteral(CREATED_AT)});

    insert into publications (
      id, workspace_id, environment_id, document_id, compiled_artifact_id,
      content_hash, published_at, correlation_id, action, source_publication_id,
      previous_publication_id, release_operation_id
    ) values
      (${sqlLiteral(PUBLICATION_A_STAGING)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(STAGING_A)}, ${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(ARTIFACT_A_FIRST)}, ${sqlLiteral(HASH_A_FIRST)}, ${sqlLiteral(CREATED_AT)}, 'correlation:analytics:staging', null, null, null, null),
      (${sqlLiteral(PUBLICATION_A_CURRENT)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PRODUCTION_A)}, ${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(ARTIFACT_A_CURRENT)}, ${sqlLiteral(HASH_A_CURRENT)}, ${sqlLiteral(CREATED_AT)}, 'correlation:analytics:current', null, null, null, null),
      (${sqlLiteral(PUBLICATION_A_ROLLBACK)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PRODUCTION_A)}, ${sqlLiteral(DOCUMENT_A)}, ${sqlLiteral(ARTIFACT_A_FIRST)}, ${sqlLiteral(HASH_A_FIRST)}, ${sqlLiteral(CREATED_AT)}, 'correlation:analytics:rollback', null, null, null, null),
      (${sqlLiteral(PUBLICATION_B_STAGING)}, ${sqlLiteral(WORKSPACE_B)}, ${sqlLiteral(STAGING_B)}, ${sqlLiteral(DOCUMENT_B)}, ${sqlLiteral(ARTIFACT_B)}, ${sqlLiteral(HASH_B)}, ${sqlLiteral(CREATED_AT)}, 'correlation:analytics:tenant-b', null, null, null, null);
  `;
}

function stagingReleasePolicy() {
  return {
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
}

function productionReleasePolicy() {
  return {
    ...stagingReleasePolicy(),
    allowDirectPublish: false,
    requireSourceVerification: true,
    publisherRoles: ['owner', 'admin'],
  };
}

function analyticsInsertSql(id: string, event: AuthoritativeAnalyticsEvent): string {
  return `insert into analytics_events (
    id, workspace_id, environment_id, document_id, publication_id, content_hash,
    pointer_generation, name, step_id, sdk_version, correlation_id, occurred_at, props
  ) values (
    ${sqlLiteral(id)}, ${sqlLiteral(event.workspaceId)}, ${sqlLiteral(event.environmentId)},
    ${sqlLiteral(event.documentId)}, ${sqlLiteral(event.publicationId)},
    ${sqlLiteral(event.contentHash)}, ${String(event.pointerGeneration)}, ${sqlLiteral(event.name)},
    null, ${sqlLiteral(event.sdkVersion)}, null, ${sqlLiteral(event.timestamp)},
    ${event.props ? jsonbLiteral(event.props) : 'null'}
  );`;
}

function scopedSql(workspaceId: string, statement: string): string {
  return `
    begin;
    set local lodariq.workspace_id = ${sqlLiteral(workspaceId)};
    ${statement}
    rollback;
  `;
}

function queryJson<T>(databaseUrl: string, statement: string): T {
  return JSON.parse(runPsqlSync(databaseUrl, statement)) as T;
}

function runPsqlSync(databaseUrl: string, statement: string): string {
  try {
    return execFileSync('psql', psqlArguments(databaseUrl), {
      encoding: 'utf8',
      env: psqlEnvironment(),
      input: statement,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw psqlError(error);
  }
}

function runPsqlFileSync(databaseUrl: string, path: string): void {
  try {
    execFileSync('psql', [...psqlArguments(databaseUrl), '--file', path], {
      encoding: 'utf8',
      env: psqlEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw psqlError(error);
  }
}

function runPsqlAsync(databaseUrl: string, statement: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', psqlArguments(databaseUrl), {
      env: psqlEnvironment(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `psql exited with status ${String(code)}`));
    });
    child.stdin.end(statement);
  });
}

function psqlArguments(databaseUrl: string): string[] {
  return [
    '-X',
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--dbname',
    databaseUrl,
  ];
}

function psqlEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, PGCONNECT_TIMEOUT: '5' };
}

function psqlError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error(String(error));
  const stderr = 'stderr' in error ? String(error.stderr) : '';
  const stdout = 'stdout' in error ? String(error.stdout) : '';
  const message = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n');
  return new Error(message || (error instanceof Error ? error.message : 'psql failed'));
}

function databaseUrlFor(adminDatabaseUrl: string, databaseName: string): string {
  const parsed = new URL(adminDatabaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function databaseUrlWithCredentials(
  databaseUrl: string,
  username: string,
  password: string,
): string {
  const parsed = new URL(databaseUrl);
  parsed.username = username;
  parsed.password = password;
  return parsed.toString();
}

function assertDisposableAdminDatabase(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  if (!new Set(['postgres:', 'postgresql:']).has(parsed.protocol)) {
    throw new Error('disposable PostgreSQL URL must use the postgres protocol');
  }
  if (
    !new Set(['127.0.0.1', 'localhost']).has(parsed.hostname) ||
    parsed.pathname !== '/postgres'
  ) {
    throw new Error('refusing analytics integration tests outside local disposable PostgreSQL');
  }
  if (parsed.username !== 'lodariq_ci_owner') {
    throw new Error('disposable PostgreSQL must use the dedicated lodariq_ci_owner fixture role');
  }
}

function cleanupDisposableDatabase(): void {
  if (databaseCreated) {
    try {
      runPsqlSync(
        ADMIN_DATABASE_URL,
        `drop database if exists ${quoteIdentifier(TEST_DATABASE_NAME)} with (force);`,
      );
    } catch {
      // Preserve the original failure; the PostgreSQL service is disposable.
    }
  }
  if (runtimeRoleCreated) {
    try {
      runPsqlSync(ADMIN_DATABASE_URL, `drop role if exists ${quoteIdentifier(RUNTIME_ROLE)};`);
    } catch {
      // Preserve the original failure; the PostgreSQL service is disposable.
    }
  }
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
    throw new Error(`unsafe PostgreSQL fixture identifier: ${value}`);
  }
  return `"${value}"`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

function jsonbLiteral(value: unknown): string {
  return `${sqlLiteral(JSON.stringify(value))}::jsonb`;
}
