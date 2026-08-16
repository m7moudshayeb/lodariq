import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProductStyleProposalConflictError,
  createDrizzleControlPlaneRepository,
  createWorkspaceThemeDraftPreviewSnapshot,
  hashCanonicalJson,
  productStyleProposalRequestHash,
  type ApplyProductStyleProposalInput,
  type ControlPlaneRepository,
  type LodariqDatabase,
  type ProductStyleProposalApplicationResult,
} from '@lodariq/database';
import * as databaseSchema from '@lodariq/database/schema';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
  type BrandThemeDefinition,
  type ProductStyleProposal,
  type ReleaseRecoveryResult,
} from '@lodariq/schema';
import { listCheckedInSqlPaths } from './migration-test-utils.js';

const VERIFY_WORKFLOW_PATH = fileURLToPath(
  new URL('../../../../.github/workflows/verify.yml', import.meta.url),
);
const TURBO_CONFIG_PATH = fileURLToPath(new URL('../../../../turbo.json', import.meta.url));
const ADMIN_DATABASE_URL = process.env.LODARIQ_TEST_POSTGRES_ADMIN_URL?.trim() ?? '';
const DISPOSABLE_POSTGRES_ENABLED =
  process.env.LODARIQ_DISPOSABLE_POSTGRES === '1' && ADMIN_DATABASE_URL.length > 0;
const CREATED_AT = '2026-08-09T08:00:00.000Z';
const WORKSPACE_A = 'wk_pg16_a';
const WORKSPACE_B = 'wk_pg16_b';
const DEVELOPMENT_ENVIRONMENT_A = 'env_pg16_development_a';
const ENVIRONMENT_A = 'env_pg16_a';
const ENVIRONMENT_B = 'env_pg16_b';
const PRODUCTION_ENVIRONMENT_A = 'env_pg16_production_a';
const USER_A = 'user_pg16_a';
const USER_B = 'user_pg16_b';
const APPROVER_A = 'user_pg16_approver_a';
const RECOVERY_DOCUMENT_ID = 'doc_pg16_release_recovery';
const PROMOTION_DOCUMENT_ID = 'doc_pg16_approval_promotion';
const RECOVERY_ARTIFACT_FIRST = 'artifact_pg16_recovery_first';
const RECOVERY_ARTIFACT_CURRENT = 'artifact_pg16_recovery_current';
const PROMOTION_ARTIFACT = 'artifact_pg16_promotion_source';
const RECOVERY_PUBLICATION_FIRST = 'pub_pg16_recovery_first';
const RECOVERY_PUBLICATION_CURRENT = 'pub_pg16_recovery_current';
const PROMOTION_SOURCE_PUBLICATION = 'pub_pg16_promotion_source';
const STAGING_RELEASE_POLICY = {
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
} as const;
const PRODUCTION_RELEASE_POLICY = {
  allowDirectPublish: false,
  requireSourceVerification: true,
  requiredApprovalCount: 1,
  publisherRoles: ['owner', 'admin'],
  rollbackRoles: ['owner', 'admin'],
  unpublishRoles: ['owner', 'admin'],
  separationOfDuties: {
    requireSeparateVerifier: false,
    requireSeparateApprover: false,
  },
} as const;
const THEME_IDS = {
  rlsA: 'theme_pg16_rls_a',
  rlsB: 'theme_pg16_rls_b',
  identical: 'theme_pg16_identical',
  conflict: 'theme_pg16_conflict',
  rollback: 'theme_pg16_rollback',
} as const;
const TEST_SUFFIX = randomBytes(6).toString('hex');
const TEST_DATABASE_NAME = `lodariq_ci_${TEST_SUFFIX}`;
const RUNTIME_ROLE = `lodariq_ci_app_${TEST_SUFFIX}`;
const RUNTIME_PASSWORD = `lodariq_ci_runtime_${TEST_SUFFIX}_password`;
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

interface ProductMatchApplicationFixture {
  applicationId: string;
  workspaceId: string;
  themeId: string;
  environmentId: string;
  proposalId: string;
  requestHash: string;
  sourceSetHash: string;
  previewTheme: unknown;
  previewThemeHash: string;
  sourceReceipts: Array<{ sourceId: string; sourceHash: string }>;
  proposal: ProductStyleProposal;
  draft: BrandThemeDefinition;
  actorUserId: string;
}

describe('disposable PostgreSQL 16 CI wiring', () => {
  it('runs the unit-test job against an isolated PostgreSQL 16 service', () => {
    const workflow = readFileSync(VERIFY_WORKFLOW_PATH, 'utf8');
    const turboConfig = JSON.parse(readFileSync(TURBO_CONFIG_PATH, 'utf8')) as {
      tasks?: { test?: { env?: string[] } };
    };

    expect(workflow).toContain('unit-tests:');
    expect(workflow).toContain('image: postgres:16');
    expect(workflow).toContain("LODARIQ_DISPOSABLE_POSTGRES: '1'");
    expect(workflow).toContain(
      'LODARIQ_TEST_POSTGRES_ADMIN_URL: postgresql://lodariq_ci_owner:lodariq_ci_password@127.0.0.1:5432/postgres',
    );
    expect(workflow).toContain('pg_isready -U lodariq_ci_owner -d postgres');
    expect(workflow.indexOf('services:')).toBeLessThan(workflow.indexOf('run: pnpm run test'));
    expect(turboConfig.tasks?.test?.env).toEqual(
      expect.arrayContaining(['LODARIQ_DISPOSABLE_POSTGRES', 'LODARIQ_TEST_POSTGRES_ADMIN_URL']),
    );
  });
});

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'Product Match application semantics on disposable PostgreSQL 16',
  () => {
    beforeAll(async () => {
      assertDisposableAdminDatabase(ADMIN_DATABASE_URL);
      const serverVersionNumber = Number(
        runPsqlSync(ADMIN_DATABASE_URL, 'show server_version_num;'),
      );
      if (Math.trunc(serverVersionNumber / 10_000) !== 16) {
        throw new Error(
          `Product Match integration coverage requires PostgreSQL 16, got ${serverVersionNumber}`,
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
      runtimePool = new Pool({ connectionString: runtimeDatabaseUrl, max: 10 });
      const nodePgDatabase = createNodePgDatabase(runtimePool, { schema: databaseSchema });
      repository = createDrizzleControlPlaneRepository(nodePgDatabase as LodariqDatabase);
      await requireRepository().applyProductStyleProposal(applicationInput(createRlsFixture('a')));
      await requireRepository().applyProductStyleProposal(applicationInput(createRlsFixture('b')));
    }, 60_000);

    afterAll(async () => {
      await runtimePool?.end();
      cleanupDisposableDatabase();
    }, 30_000);

    it('applies the clean baseline with the receipt identity and forced RLS contract', () => {
      const tableContract = queryJson<{
        serverMajor: number;
        receiptTable: string;
        identityIndex: string;
        rowSecurity: boolean;
        forcedRowSecurity: boolean;
      }>(
        ownerDatabaseUrl,
        `select json_build_object(
          'serverMajor', current_setting('server_version_num')::integer / 10000,
          'receiptTable', to_regclass('public.product_style_applications')::text,
          'identityIndex', to_regclass('public.product_style_applications_proposal_idx')::text,
          'rowSecurity', relrowsecurity,
          'forcedRowSecurity', relforcerowsecurity
        )
        from pg_class
        where oid = 'public.product_style_applications'::regclass;`,
      );

      expect(tableContract).toEqual({
        serverMajor: 16,
        receiptTable: 'product_style_applications',
        identityIndex: 'product_style_applications_proposal_idx',
        rowSecurity: true,
        forcedRowSecurity: true,
      });

      const roleContract = runPsqlSync(
        ownerDatabaseUrl,
        `select rolsuper, rolbypassrls
         from pg_roles
         where rolname = ${sqlLiteral(RUNTIME_ROLE)};`,
      );
      expect(roleContract).toBe('f|f');
    });

    it('keeps persisted renderer evidence version-agnostic after application admission', () => {
      const constraintDefinition = runPsqlSync(
        ownerDatabaseUrl,
        `select pg_get_constraintdef(oid)
         from pg_constraint
         where conname = 'publication_verifications_report_json_check';`,
      );
      expect(constraintDefinition).toContain("'rendererContractVersion'::text) ~");
      expect(constraintDefinition).not.toContain("'rendererContractVersion'::text) = ANY");

      runPsqlSync(
        ownerDatabaseUrl,
        `begin;
         insert into publication_verifications (
           id, workspace_id, environment_id, document_id, publication_id,
           result, report_json, verified_origin, verified_by_user_id, created_at
         ) values (
           'verification_pg16_future_renderer', ${sqlLiteral(WORKSPACE_A)},
           ${sqlLiteral(ENVIRONMENT_A)}, ${sqlLiteral(PROMOTION_DOCUMENT_ID)},
           ${sqlLiteral(PROMOTION_SOURCE_PUBLICATION)}, 'passed',
           ${jsonbLiteral({
             schemaVersion: '1',
             checkedAt: CREATED_AT,
             sdkVersion: 'pg16-test',
             rendererContractVersion: '99',
             status: 'passed',
             checks: [{ code: 'artifact_integrity', status: 'passed' }],
           })},
           'https://a.example.test', ${sqlLiteral(APPROVER_A)}, ${sqlLiteral(CREATED_AT)}
         );
         rollback;`,
      );
    });

    it('forces tenant isolation and keeps application receipts append-only for the runtime role', async () => {
      const unscopedCount = runPsqlSync(
        runtimeDatabaseUrl,
        `select count(*) from product_style_applications
         where proposal_id like 'proposal.pg16.rls.%';`,
      );
      expect(unscopedCount).toBe('0');

      const workspaceAIds = runPsqlSync(
        runtimeDatabaseUrl,
        scopedSql(
          WORKSPACE_A,
          `select string_agg(proposal_id, ',' order by proposal_id)
           from product_style_applications
           where proposal_id like 'proposal.pg16.rls.%';`,
        ),
      );
      const workspaceBIds = runPsqlSync(
        runtimeDatabaseUrl,
        scopedSql(
          WORKSPACE_B,
          `select string_agg(proposal_id, ',' order by proposal_id)
           from product_style_applications
           where proposal_id like 'proposal.pg16.rls.%';`,
        ),
      );
      expect(workspaceAIds).toBe('proposal.pg16.rls.a');
      expect(workspaceBIds).toBe('proposal.pg16.rls.b');

      const runtimeMutationPrivileges = runPsqlSync(
        runtimeDatabaseUrl,
        `select
           has_table_privilege(current_user, 'product_style_applications', 'UPDATE'),
           has_table_privilege(current_user, 'product_style_applications', 'DELETE');`,
      );
      expect(runtimeMutationPrivileges).toBe('f|f');

      const crossTenantFixture = createApplicationFixture({
        workspaceId: WORKSPACE_B,
        themeId: THEME_IDS.rlsB,
        environmentId: ENVIRONMENT_B,
        actorUserId: USER_B,
        proposalId: 'proposal.pg16.rls.cross-tenant',
        accent: '#c026d3',
      });
      await expect(
        runPsqlAsync(
          runtimeDatabaseUrl,
          scopedSql(WORKSPACE_A, applicationInsertSql(crossTenantFixture)),
        ),
      ).rejects.toThrow(/row-level security/iu);
    });

    it('serializes concurrent identical attempts into one stored receipt and deterministic replay', async () => {
      const fixture = createApplicationFixture({
        workspaceId: WORKSPACE_A,
        themeId: THEME_IDS.identical,
        environmentId: ENVIRONMENT_A,
        actorUserId: USER_A,
        proposalId: 'proposal.pg16.concurrent.identical',
        accent: '#2458ff',
      });
      const input = applicationInput(fixture);
      const attempts = await Promise.allSettled([
        requireRepository().applyProductStyleProposal(input),
        requireRepository().applyProductStyleProposal(input),
      ]);

      expect(attempts.every((attempt) => attempt.status === 'fulfilled')).toBe(true);
      const applied = fulfilledApplicationResults(attempts);
      const original = requireApplicationResult(applied.find((result) => !result.replayed));
      const replay = requireApplicationResult(applied.find((result) => result.replayed));
      expect(replay.application).toEqual(original.application);
      const storedBeforeReplay = readApplicationState(fixture);
      expect(storedBeforeReplay).toMatchObject({
        applicationCount: 1,
        sourceCount: 2,
        themeRevision: 2,
        requestHash: original.application.requestHash,
        sourceSetHash: original.application.sourceSetHash,
        previewThemeHash: original.application.receipt.previewTheme.contentHash,
        sourceReceipts: original.application.receipt.sources,
      });

      const laterDraft = structuredClone(original.theme.draft);
      laterDraft.tokens.radii.md += 1;
      const laterTheme = await requireRepository().updateWorkspaceThemeDraft({
        workspaceId: fixture.workspaceId,
        themeId: fixture.themeId,
        draft: laterDraft,
        actorUserId: fixture.actorUserId,
        expectedRevision: original.theme.revision,
        expectedUpdatedAt: original.theme.updatedAt,
      });
      expect(laterTheme?.revision).toBe(original.theme.revision + 1);

      const laterReplay = requireApplicationResult(
        await requireRepository().applyProductStyleProposal(input),
      );
      expect(laterReplay.replayed).toBe(true);
      expect(laterReplay.application).toEqual(original.application);
      expect(laterReplay.sources).toEqual(original.sources);
      expect(laterReplay.theme).toEqual(laterTheme);
      expect(readApplicationState(fixture)).toEqual(storedBeforeReplay);
    });

    it('allows one concurrent request hash to win and rejects the conflicting proposal identity', async () => {
      const first = createApplicationFixture({
        workspaceId: WORKSPACE_A,
        themeId: THEME_IDS.conflict,
        environmentId: ENVIRONMENT_A,
        actorUserId: USER_A,
        proposalId: 'proposal.pg16.concurrent.conflict',
        accent: '#2563eb',
      });
      const second = createApplicationFixture({
        workspaceId: WORKSPACE_A,
        themeId: THEME_IDS.conflict,
        environmentId: ENVIRONMENT_A,
        actorUserId: USER_A,
        proposalId: 'proposal.pg16.concurrent.conflict',
        accent: '#dc2626',
      });
      const attempts = await Promise.allSettled([
        requireRepository().applyProductStyleProposal(applicationInput(first)),
        requireRepository().applyProductStyleProposal(applicationInput(second)),
      ]);
      const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const rejected = attempts.filter((attempt) => attempt.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        reason: expect.any(ProductStyleProposalConflictError),
      });

      const winner = requireApplicationResult(fulfilledApplicationResults(attempts)[0]);
      const stored = readApplicationState(first);
      expect(stored.applicationCount).toBe(1);
      expect(stored.sourceCount).toBe(2);
      expect(stored.themeRevision).toBe(2);
      expect(stored.requestHash).toBe(winner.application.requestHash);
      expect([first.requestHash, second.requestHash]).toContain(winner.application.requestHash);
    });

    it('rolls back theme, receipt, and all provenance when source insertion fails mid-transaction', async () => {
      const fixture = createApplicationFixture({
        workspaceId: WORKSPACE_A,
        themeId: THEME_IDS.rollback,
        environmentId: ENVIRONMENT_A,
        actorUserId: USER_A,
        proposalId: 'proposal.pg16.rollback',
        accent: '#7c3aed',
      });
      const before = readThemeState(fixture);

      runPsqlSync(ownerDatabaseUrl, failureTriggerSql(fixture.proposalId));
      let injectedFailure: unknown;
      try {
        await requireRepository().applyProductStyleProposal(applicationInput(fixture));
      } catch (error) {
        injectedFailure = error;
      } finally {
        runPsqlSync(ownerDatabaseUrl, dropFailureTriggerSql());
      }

      expect(errorChainMessages(injectedFailure)).toMatch(/lodariq_ci_injected_source_failure/iu);
      expect(readThemeState(fixture)).toEqual(before);
      const persistedCounts = runPsqlSync(
        ownerDatabaseUrl,
        `select
           (select count(*) from product_style_applications
            where workspace_id = ${sqlLiteral(fixture.workspaceId)}
              and theme_id = ${sqlLiteral(fixture.themeId)}
              and proposal_id = ${sqlLiteral(fixture.proposalId)}),
           (select count(*) from style_sources
            where workspace_id = ${sqlLiteral(fixture.workspaceId)}
              and theme_id = ${sqlLiteral(fixture.themeId)}
              and proposal_id = ${sqlLiteral(fixture.proposalId)});`,
      );
      expect(persistedCounts).toBe('0|0');
    });

    it('completes an approval-required promotion under the terminal-only runtime RLS policy', async () => {
      const targetEnvironment = (await requireRepository().listEnvironments(WORKSPACE_A)).find(
        (environment) => environment.id === PRODUCTION_ENVIRONMENT_A,
      );
      if (!targetEnvironment) throw new Error('production environment fixture missing');
      const input = {
        workspaceId: WORKSPACE_A,
        sourceEnvironmentId: ENVIRONMENT_A,
        targetEnvironmentId: PRODUCTION_ENVIRONMENT_A,
        documentId: PROMOTION_DOCUMENT_ID,
        expectedSourcePublicationId: PROMOTION_SOURCE_PUBLICATION,
        correlationId: 'correlation:pg16:promotion:approval',
        actorUserId: USER_A,
        idempotencyKey: 'promotion:pg16:approval:required',
        requestHash: `sha256-${'9'.repeat(64)}`,
        expectedGeneration: 0,
        expectedEnvironmentPolicyUpdatedAt: targetEnvironment.updatedAt,
      };

      const pending = await requireRepository().promoteVerifiedPublication(input);
      expect(pending).toMatchObject({
        operation: { status: 'awaiting_approval' },
        publication: null,
        deployment: null,
        approvalCount: 0,
        requiredApprovalCount: 1,
      });

      await expect(
        runPsqlAsync(
          runtimeDatabaseUrl,
          scopedSql(
            WORKSPACE_A,
            `update release_operations
             set status = 'awaiting_approval'
             where id = ${sqlLiteral(pending.operation.id)};`,
          ),
        ),
      ).rejects.toThrow(/row-level security/iu);

      await requireRepository().createReleaseApproval({
        workspaceId: WORKSPACE_A,
        releaseOperationId: pending.operation.id,
        decision: 'approved',
        reason: 'Approved in the PostgreSQL runtime-role regression',
        actorUserId: APPROVER_A,
        expectedEnvironmentPolicyUpdatedAt: targetEnvironment.updatedAt,
      });
      const completed = await requireRepository().promoteVerifiedPublication(input);
      expect(completed).toMatchObject({
        operation: { id: pending.operation.id, status: 'completed' },
        publication: {
          action: 'promote',
          sourcePublicationId: PROMOTION_SOURCE_PUBLICATION,
          compiledArtifactId: PROMOTION_ARTIFACT,
        },
        deployment: { state: 'active', generation: 1 },
        approvalCount: 1,
        requiredApprovalCount: 1,
      });
    });

    it('serializes recovery, preserves exact replay, isolates tenants, and leaves no orphan evidence', async () => {
      const request = {
        action: 'rollback' as const,
        targetPublicationId: RECOVERY_PUBLICATION_FIRST,
        reason: 'Restore the prior PostgreSQL release',
        expectedGeneration: 2,
        expectedActivePublicationId: RECOVERY_PUBLICATION_CURRENT,
        idempotencyKey: 'recovery:pg16:concurrent:replay',
        correlationId: 'correlation:pg16:concurrent:replay',
      };
      const scope = {
        workspaceId: WORKSPACE_A,
        environmentId: PRODUCTION_ENVIRONMENT_A,
        documentId: RECOVERY_DOCUMENT_ID,
        actorUserId: USER_A,
      };
      const attempts = await Promise.all([
        requireRepository().recoverDocumentRelease({ ...scope, request }),
        requireRepository().recoverDocumentRelease({ ...scope, request }),
      ]);
      const firstAttempt = attempts.find((result) => result?.ok && !result.replayed);
      const replayAttempt = attempts.find((result) => result?.ok && result.replayed);
      if (!firstAttempt || !replayAttempt) {
        throw new Error(`Unexpected concurrent recovery results: ${JSON.stringify(attempts)}`);
      }
      const first = requireRollbackRecoveryResult(firstAttempt);
      const replay = requireRollbackRecoveryResult(replayAttempt);
      expect(replay).toEqual({ ...first, replayed: true });

      const race = await Promise.all([
        requireRepository().recoverDocumentRelease({
          ...scope,
          request: {
            action: 'rollback',
            targetPublicationId: RECOVERY_PUBLICATION_FIRST,
            reason: 'Race a second exact rollback',
            expectedGeneration: first.generation,
            expectedActivePublicationId: first.publicationId,
            idempotencyKey: 'recovery:pg16:race:rollback',
            correlationId: 'correlation:pg16:race:rollback',
          },
        }),
        requireRepository().recoverDocumentRelease({
          ...scope,
          request: {
            action: 'unpublish',
            reason: 'Race an exact deactivation',
            expectedGeneration: first.generation,
            expectedActivePublicationId: first.publicationId,
            idempotencyKey: 'recovery:pg16:race:unpublish',
            correlationId: 'correlation:pg16:race:unpublish',
          },
        }),
      ]);
      expect(race.filter((result) => result?.ok)).toHaveLength(1);
      const closedRaceFailures = race.filter(
        (result): result is Extract<ReleaseRecoveryResult, { ok: false }> => result?.ok === false,
      );
      expect(closedRaceFailures).toHaveLength(1);
      const [closedRaceFailure] = closedRaceFailures;
      expect(closedRaceFailure).toMatchObject({ ok: false, state: 'failed' });
      expect(['deployment_changed', 'already_inactive']).toContain(closedRaceFailure?.code);

      const evidence = queryJson<{
        replayOperationCount: number;
        orphanRollbackCount: number;
        terminalRecoveryCount: number;
      }>(
        ownerDatabaseUrl,
        `select json_build_object(
          'replayOperationCount', (
            select count(*)::integer from release_operations
            where workspace_id = ${sqlLiteral(WORKSPACE_A)}
              and idempotency_key = ${sqlLiteral(request.idempotencyKey)}
          ),
          'orphanRollbackCount', (
            select count(*)::integer
            from publications publication
            left join release_operations operation
              on operation.id = publication.release_operation_id
            where publication.workspace_id = ${sqlLiteral(WORKSPACE_A)}
              and publication.document_id = ${sqlLiteral(RECOVERY_DOCUMENT_ID)}
              and publication.action = 'rollback'
              and (operation.id is null or operation.status <> 'completed')
          ),
          'terminalRecoveryCount', (
            select count(*)::integer from release_operations
            where workspace_id = ${sqlLiteral(WORKSPACE_A)}
              and document_id = ${sqlLiteral(RECOVERY_DOCUMENT_ID)}
              and action in ('rollback', 'unpublish')
              and status in ('completed', 'failed')
          )
        );`,
      );
      expect(evidence).toEqual({
        replayOperationCount: 1,
        orphanRollbackCount: 0,
        terminalRecoveryCount: 3,
      });

      expect(
        runPsqlSync(
          runtimeDatabaseUrl,
          'select count(*) from release_operations where document_id = ' +
            `${sqlLiteral(RECOVERY_DOCUMENT_ID)};`,
        ),
      ).toBe('0');
      expect(
        runPsqlSync(
          runtimeDatabaseUrl,
          scopedSql(
            WORKSPACE_B,
            `select count(*) from release_operations
             where document_id = ${sqlLiteral(RECOVERY_DOCUMENT_ID)};`,
          ),
        ),
      ).toBe('0');

      for (const statement of [
        `update compiled_artifacts set compiler_version = compiler_version
         where id = ${sqlLiteral(RECOVERY_ARTIFACT_FIRST)};`,
        `delete from publications where id = ${sqlLiteral(RECOVERY_PUBLICATION_FIRST)};`,
        `delete from release_operations where idempotency_key = ${sqlLiteral(request.idempotencyKey)};`,
      ]) {
        await expect(
          runPsqlAsync(runtimeDatabaseUrl, scopedSql(WORKSPACE_A, statement)),
        ).rejects.toThrow(/permission denied/iu);
      }
    });
  },
);

function createRlsFixture(tenant: 'a' | 'b'): ProductMatchApplicationFixture {
  if (tenant === 'a') {
    return createApplicationFixture({
      workspaceId: WORKSPACE_A,
      themeId: THEME_IDS.rlsA,
      environmentId: ENVIRONMENT_A,
      actorUserId: USER_A,
      proposalId: 'proposal.pg16.rls.a',
      accent: '#0369a1',
    });
  }
  return createApplicationFixture({
    workspaceId: WORKSPACE_B,
    themeId: THEME_IDS.rlsB,
    environmentId: ENVIRONMENT_B,
    actorUserId: USER_B,
    proposalId: 'proposal.pg16.rls.b',
    accent: '#15803d',
  });
}

function createApplicationFixture(input: {
  workspaceId: string;
  themeId: string;
  environmentId: string;
  actorUserId: string;
  proposalId: string;
  accent: string;
}): ProductMatchApplicationFixture {
  const draft = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition);
  draft.tokens.modes.light.colors.accent = input.accent;
  const sources = [
    {
      sourceId: `${input.proposalId}.selected`,
      source: {
        sourceId: `${input.proposalId}.selected`,
        kind: 'selected_element',
        confidence: 94,
        fingerprintHash: `sha256-${'a'.repeat(64)}`,
        capturedAt: CREATED_AT,
      },
    },
    {
      sourceId: `${input.proposalId}.page`,
      source: {
        sourceId: `${input.proposalId}.page`,
        kind: 'page_typography',
        confidence: 72,
        fingerprintHash: `sha256-${'b'.repeat(64)}`,
        capturedAt: CREATED_AT,
      },
    },
  ].map((source) => ({
    ...source,
    sourceHash: hashCanonicalJson(source.source),
  }));
  const sourceReceipts = sources.map(({ sourceId, sourceHash }) => ({ sourceId, sourceHash }));
  const proposal: ProductStyleProposal = {
    schemaVersion: '1',
    proposalId: input.proposalId,
    sources: sources.map(({ source }) => source) as ProductStyleProposal['sources'],
    samples: [],
    tokens: {
      modes: { light: { colors: { accent: input.accent } } },
    },
    confidence: 94,
    requiresConfirmation: false,
    createdAt: CREATED_AT,
  };
  const previewTheme = createWorkspaceThemeDraftPreviewSnapshot({
    id: input.themeId,
    name: themeName(input.themeId),
    draft,
    revision: 2,
  });
  const requestHash = productStyleProposalRequestHash({
    environmentId: input.environmentId,
    proposal,
  });

  return {
    applicationId: `product_style_application_${input.proposalId}`,
    ...input,
    requestHash,
    sourceSetHash: hashCanonicalJson(sourceReceipts),
    previewTheme,
    previewThemeHash: previewTheme.contentHash,
    sourceReceipts,
    proposal,
    draft,
  };
}

function applicationInput(fixture: ProductMatchApplicationFixture): ApplyProductStyleProposalInput {
  return {
    workspaceId: fixture.workspaceId,
    themeId: fixture.themeId,
    environmentId: fixture.environmentId,
    proposal: fixture.proposal,
    draft: fixture.draft,
    actorUserId: fixture.actorUserId,
    expectedRevision: 1,
    expectedUpdatedAt: CREATED_AT,
  };
}

function requireRepository(): ControlPlaneRepository {
  if (!repository) throw new Error('disposable PostgreSQL repository was not initialized');
  return repository;
}

function requireApplicationResult(
  result: ProductStyleProposalApplicationResult | null | undefined,
): ProductStyleProposalApplicationResult {
  if (!result) throw new Error('Product Match application unexpectedly returned null');
  return result;
}

function requireRollbackRecoveryResult(
  result: ReleaseRecoveryResult | null | undefined,
): Extract<ReleaseRecoveryResult, { ok: true; action: 'rollback' }> {
  if (!result?.ok || result.action !== 'rollback') {
    throw new Error(
      `PostgreSQL rollback recovery unexpectedly failed: ${JSON.stringify(result ?? null)}`,
    );
  }
  return result;
}

function fulfilledApplicationResults(
  attempts: Array<PromiseSettledResult<ProductStyleProposalApplicationResult | null>>,
): ProductStyleProposalApplicationResult[] {
  const results: ProductStyleProposalApplicationResult[] = [];
  for (const attempt of attempts) {
    if (attempt.status === 'fulfilled') {
      results.push(requireApplicationResult(attempt.value));
    }
  }
  return results;
}

function applicationInsertSql(
  fixture: ProductMatchApplicationFixture,
  draftRevision = '2',
  draftUpdatedAt = `${sqlLiteral(CREATED_AT)}::timestamptz`,
): string {
  return `insert into product_style_applications (
    id,
    workspace_id,
    theme_id,
    environment_id,
    proposal_id,
    request_hash,
    source_set_hash,
    draft_revision,
    draft_updated_at,
    preview_theme_json,
    preview_theme_hash,
    source_receipts_json,
    draft_changed,
    created_by_user_id,
    created_at
  ) values (
    ${sqlLiteral(fixture.applicationId)},
    ${sqlLiteral(fixture.workspaceId)},
    ${sqlLiteral(fixture.themeId)},
    ${sqlLiteral(fixture.environmentId)},
    ${sqlLiteral(fixture.proposalId)},
    ${sqlLiteral(fixture.requestHash)},
    ${sqlLiteral(fixture.sourceSetHash)},
    ${draftRevision},
    ${draftUpdatedAt},
    ${jsonbLiteral(fixture.previewTheme)},
    ${sqlLiteral(fixture.previewThemeHash)},
    ${jsonbLiteral(fixture.sourceReceipts)},
    true,
    ${sqlLiteral(fixture.actorUserId)},
    clock_timestamp()
  );`;
}

function readApplicationState(fixture: ProductMatchApplicationFixture): {
  applicationCount: number;
  sourceCount: number;
  themeRevision: number;
  requestHash: string;
  sourceSetHash: string;
  previewThemeHash: string;
  draftUpdatedAt: string;
  previewTheme: unknown;
  sourceReceipts: unknown;
} {
  return queryJson(
    runtimeDatabaseUrl,
    scopedSql(
      fixture.workspaceId,
      `select json_build_object(
        'applicationCount', count(*)::integer,
        'sourceCount', (
          select count(*)::integer
          from style_sources source
          where source.workspace_id = ${sqlLiteral(fixture.workspaceId)}
            and source.theme_id = ${sqlLiteral(fixture.themeId)}
            and source.proposal_id = ${sqlLiteral(fixture.proposalId)}
        ),
        'themeRevision', max(application.draft_revision),
        'requestHash', max(application.request_hash),
        'sourceSetHash', max(application.source_set_hash),
        'previewThemeHash', max(application.preview_theme_hash),
        'draftUpdatedAt', max(application.draft_updated_at)::text,
        'previewTheme', (array_agg(application.preview_theme_json))[1],
        'sourceReceipts', (array_agg(application.source_receipts_json))[1]
      )
      from product_style_applications application
      where application.workspace_id = ${sqlLiteral(fixture.workspaceId)}
        and application.theme_id = ${sqlLiteral(fixture.themeId)}
        and application.proposal_id = ${sqlLiteral(fixture.proposalId)};`,
    ),
  );
}

function readThemeState(fixture: ProductMatchApplicationFixture): unknown {
  return queryJson(
    ownerDatabaseUrl,
    `select json_build_object(
      'revision', revision,
      'updatedAt', updated_at,
      'draft', draft_json
    )
    from themes
    where workspace_id = ${sqlLiteral(fixture.workspaceId)}
      and id = ${sqlLiteral(fixture.themeId)};`,
  );
}

function runtimeRoleGrantsSql(): string {
  const role = quoteIdentifier(RUNTIME_ROLE);
  return `
    grant usage on schema public to ${role};
    grant usage on type lodariq_environment to ${role};
    grant usage on type lodariq_document_deployment_state to ${role};
    grant usage on type lodariq_release_action to ${role};
    grant usage on type lodariq_release_operation_status to ${role};
    grant select, insert, update, delete on all tables in schema public to ${role};
    grant execute on function public.lodariq_current_workspace_role(text) to ${role};
    grant execute on function public.lodariq_workspace_is_empty(text) to ${role};
    grant execute on function public.lodariq_user_is_workspace_member(text, text) to ${role};
    grant execute on function public.lodariq_accept_workspace_invitation(text, text, text, timestamptz) to ${role};
    grant execute on function public.lodariq_schedule_account_deletion(text, timestamptz, timestamptz) to ${role};
    revoke update, delete on compiled_artifacts, publications,
      product_style_applications, style_sources from ${role};
    revoke update, delete on release_operations from ${role};
    grant update (
      status,
      requested_artifact_id,
      source_publication_id,
      actual_active_publication_id,
      result_publication_id,
      result_generation,
      error_code,
      completed_at
    ) on release_operations to ${role};
  `;
}

function seedSql(): string {
  const recoveryFirst = createPgReleaseArtifact(
    RECOVERY_DOCUMENT_ID,
    RECOVERY_ARTIFACT_FIRST,
    'first',
    ['staging'],
  );
  const recoveryCurrent = createPgReleaseArtifact(
    RECOVERY_DOCUMENT_ID,
    RECOVERY_ARTIFACT_CURRENT,
    'current',
    ['production'],
  );
  const promotionSource = createPgReleaseArtifact(
    PROMOTION_DOCUMENT_ID,
    PROMOTION_ARTIFACT,
    'promotion',
    ['staging', 'production'],
  );
  const themes: ReadonlyArray<readonly [string, string, string]> = [
    [THEME_IDS.rlsA, WORKSPACE_A, USER_A],
    [THEME_IDS.rlsB, WORKSPACE_B, USER_B],
    [THEME_IDS.identical, WORKSPACE_A, USER_A],
    [THEME_IDS.conflict, WORKSPACE_A, USER_A],
    [THEME_IDS.rollback, WORKSPACE_A, USER_A],
  ];
  const themeRows = themes
    .map(
      ([themeId, workspaceId, userId]) => `(
        ${sqlLiteral(themeId)},
        ${sqlLiteral(workspaceId)},
        ${sqlLiteral(themeName(themeId))},
        ${jsonbLiteral(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition)},
        1,
        false,
        ${sqlLiteral(userId)},
        ${sqlLiteral(userId)},
        ${sqlLiteral(CREATED_AT)}::timestamptz,
        ${sqlLiteral(CREATED_AT)}::timestamptz
      )`,
    )
    .join(',\n');

  return `
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_A)}, 'PostgreSQL tenant A', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(WORKSPACE_B)}, 'PostgreSQL tenant B', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into users (id, email, name, created_at) values
      (${sqlLiteral(USER_A)}, 'pg16-a@lodariq.test', 'PostgreSQL A', ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(USER_B)}, 'pg16-b@lodariq.test', 'PostgreSQL B', ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(APPROVER_A)}, 'pg16-approver@lodariq.test', 'PostgreSQL Approver', ${sqlLiteral(CREATED_AT)});

    insert into workspace_memberships (workspace_id, user_id, role, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(USER_A)}, 'admin', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(WORKSPACE_B)}, ${sqlLiteral(USER_B)}, 'admin', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(APPROVER_A)}, 'admin', ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into environments (
      id,
      workspace_id,
      kind,
      name,
      origin_allowlist,
      required_approval_count,
      pipeline_position,
      authoring_enabled,
      promotion_source_environment_id,
      release_policy_json,
      created_at,
      updated_at
    ) values
      (${sqlLiteral(DEVELOPMENT_ENVIRONMENT_A)}, ${sqlLiteral(WORKSPACE_A)}, 'development', 'Development A', '["http://localhost:5175"]', 0, 0, true, null, ${jsonbLiteral(STAGING_RELEASE_POLICY)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(ENVIRONMENT_A)}, ${sqlLiteral(WORKSPACE_A)}, 'staging', 'Staging A', '["https://a.example.test"]', 0, 1, true, null, ${jsonbLiteral(STAGING_RELEASE_POLICY)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(ENVIRONMENT_B)}, ${sqlLiteral(WORKSPACE_B)}, 'staging', 'Staging B', '["https://b.example.test"]', 0, 1, true, null, ${jsonbLiteral(STAGING_RELEASE_POLICY)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(PRODUCTION_ENVIRONMENT_A)}, ${sqlLiteral(WORKSPACE_A)}, 'production', 'Production A', '["https://production-a.example.test"]', 1, 2, false, ${sqlLiteral(ENVIRONMENT_A)}, ${jsonbLiteral(PRODUCTION_RELEASE_POLICY)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into themes (
      id,
      workspace_id,
      name,
      draft_json,
      revision,
      is_default,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) values
    ${themeRows};

    insert into documents (
      id, workspace_id, type, status, title, schema_version, canonical,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) values
      (${sqlLiteral(RECOVERY_DOCUMENT_ID)}, ${sqlLiteral(WORKSPACE_A)}, 'tour', 'draft',
       'PostgreSQL recovery', '1.0.0',
       ${jsonbLiteral({ id: RECOVERY_DOCUMENT_ID, workspaceId: WORKSPACE_A, type: 'tour' })},
       ${sqlLiteral(USER_A)}, ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(PROMOTION_DOCUMENT_ID)}, ${sqlLiteral(WORKSPACE_A)}, 'tour', 'draft',
       'PostgreSQL promotion', '1.0.0',
       ${jsonbLiteral({ id: PROMOTION_DOCUMENT_ID, workspaceId: WORKSPACE_A, type: 'tour' })},
       ${sqlLiteral(USER_A)}, ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}, ${sqlLiteral(CREATED_AT)});

    insert into document_versions (
      id, workspace_id, document_id, version, canonical, created_by_user_id, created_at
    ) values
      ('docv_pg16_recovery_first', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 1,
       ${jsonbLiteral({ id: RECOVERY_DOCUMENT_ID, workspaceId: WORKSPACE_A, type: 'tour', version: 1 })},
       ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}),
      ('docv_pg16_recovery_current', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 2,
       ${jsonbLiteral({ id: RECOVERY_DOCUMENT_ID, workspaceId: WORKSPACE_A, type: 'tour', version: 2 })},
       ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}),
      ('docv_pg16_promotion_source', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PROMOTION_DOCUMENT_ID)}, 1,
       ${jsonbLiteral({ id: PROMOTION_DOCUMENT_ID, workspaceId: WORKSPACE_A, type: 'tour', version: 1 })},
       ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)});

    insert into compiled_artifacts (
      id, workspace_id, document_id, document_version_id, content_hash,
      compiler_version, theme_version_id, theme_content_hash,
      renderer_contract_version, compiled, created_at
    ) values
      (${sqlLiteral(RECOVERY_ARTIFACT_FIRST)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(RECOVERY_DOCUMENT_ID)},
       'docv_pg16_recovery_first', ${sqlLiteral(recoveryFirst.contentHash)}, ${sqlLiteral(COMPILER_VERSION)},
       ${sqlLiteral(recoveryFirst.theme.themeVersionId)}, ${sqlLiteral(recoveryFirst.theme.contentHash)},
       ${sqlLiteral(RENDERER_CONTRACT_VERSION)}, ${jsonbLiteral(recoveryFirst)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(RECOVERY_ARTIFACT_CURRENT)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(RECOVERY_DOCUMENT_ID)},
       'docv_pg16_recovery_current', ${sqlLiteral(recoveryCurrent.contentHash)}, ${sqlLiteral(COMPILER_VERSION)},
       ${sqlLiteral(recoveryCurrent.theme.themeVersionId)}, ${sqlLiteral(recoveryCurrent.theme.contentHash)},
       ${sqlLiteral(RENDERER_CONTRACT_VERSION)}, ${jsonbLiteral(recoveryCurrent)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(PROMOTION_ARTIFACT)}, ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PROMOTION_DOCUMENT_ID)},
       'docv_pg16_promotion_source', ${sqlLiteral(promotionSource.contentHash)}, ${sqlLiteral(COMPILER_VERSION)},
       ${sqlLiteral(promotionSource.theme.themeVersionId)}, ${sqlLiteral(promotionSource.theme.contentHash)},
       ${sqlLiteral(RENDERER_CONTRACT_VERSION)}, ${jsonbLiteral(promotionSource)}, ${sqlLiteral(CREATED_AT)});

    insert into release_operations (
      id, workspace_id, environment_id, document_id, action,
      requested_artifact_id, requested_source_publication_id,
      requested_active_publication_id, actual_active_publication_id,
      source_publication_id, result_publication_id, expected_generation,
      result_generation, idempotency_key, request_hash, status, correlation_id,
      requested_by_user_id, reason, error_code, created_at, completed_at
    ) values
      ('relop_pg16_recovery_first', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PRODUCTION_ENVIRONMENT_A)},
       ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 'publish', ${sqlLiteral(RECOVERY_ARTIFACT_FIRST)},
       null, null, null, null, null, 0, null, 'publish:pg16:recovery:first',
       ${sqlLiteral(recoveryFirst.contentHash)}, 'activating', 'correlation:pg16:recovery:first',
       ${sqlLiteral(USER_A)}, null, null, ${sqlLiteral(CREATED_AT)}, null),
      ('relop_pg16_recovery_current', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PRODUCTION_ENVIRONMENT_A)},
       ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 'publish', ${sqlLiteral(RECOVERY_ARTIFACT_CURRENT)},
       null, null, null, null, null, 1, null, 'publish:pg16:recovery:current',
       ${sqlLiteral(recoveryCurrent.contentHash)}, 'activating', 'correlation:pg16:recovery:current',
       ${sqlLiteral(USER_A)}, null, null, ${sqlLiteral(CREATED_AT)}, null),
      ('relop_pg16_promotion_source', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(ENVIRONMENT_A)},
       ${sqlLiteral(PROMOTION_DOCUMENT_ID)}, 'publish', ${sqlLiteral(PROMOTION_ARTIFACT)},
       null, null, null, null, null, 0, null, 'publish:pg16:promotion:source',
       ${sqlLiteral(promotionSource.contentHash)}, 'activating', 'correlation:pg16:promotion:source',
       ${sqlLiteral(USER_A)}, null, null, ${sqlLiteral(CREATED_AT)}, null);

    insert into publications (
      id, workspace_id, correlation_id, environment_id, document_id,
      document_version_id, compiled_artifact_id, content_hash, action,
      source_publication_id, previous_publication_id, release_operation_id,
      published_by_user_id, published_at
    ) values
      (${sqlLiteral(RECOVERY_PUBLICATION_FIRST)}, ${sqlLiteral(WORKSPACE_A)},
       'correlation:pg16:recovery:first', ${sqlLiteral(PRODUCTION_ENVIRONMENT_A)},
       ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 'docv_pg16_recovery_first',
       ${sqlLiteral(RECOVERY_ARTIFACT_FIRST)}, ${sqlLiteral(recoveryFirst.contentHash)}, 'publish',
       null, null, 'relop_pg16_recovery_first', ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(RECOVERY_PUBLICATION_CURRENT)}, ${sqlLiteral(WORKSPACE_A)},
       'correlation:pg16:recovery:current', ${sqlLiteral(PRODUCTION_ENVIRONMENT_A)},
       ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 'docv_pg16_recovery_current',
       ${sqlLiteral(RECOVERY_ARTIFACT_CURRENT)}, ${sqlLiteral(recoveryCurrent.contentHash)}, 'publish',
       null, ${sqlLiteral(RECOVERY_PUBLICATION_FIRST)}, 'relop_pg16_recovery_current',
       ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(PROMOTION_SOURCE_PUBLICATION)}, ${sqlLiteral(WORKSPACE_A)},
       'correlation:pg16:promotion:source', ${sqlLiteral(ENVIRONMENT_A)},
       ${sqlLiteral(PROMOTION_DOCUMENT_ID)}, 'docv_pg16_promotion_source',
       ${sqlLiteral(PROMOTION_ARTIFACT)}, ${sqlLiteral(promotionSource.contentHash)}, 'publish',
       null, null, 'relop_pg16_promotion_source', ${sqlLiteral(USER_A)}, ${sqlLiteral(CREATED_AT)});

    update release_operations
    set status = 'completed', result_publication_id = ${sqlLiteral(RECOVERY_PUBLICATION_FIRST)},
      result_generation = 1, completed_at = ${sqlLiteral(CREATED_AT)}
    where id = 'relop_pg16_recovery_first';
    update release_operations
    set status = 'completed', result_publication_id = ${sqlLiteral(RECOVERY_PUBLICATION_CURRENT)},
      result_generation = 2, completed_at = ${sqlLiteral(CREATED_AT)}
    where id = 'relop_pg16_recovery_current';
    update release_operations
    set status = 'completed', result_publication_id = ${sqlLiteral(PROMOTION_SOURCE_PUBLICATION)},
      result_generation = 1, completed_at = ${sqlLiteral(CREATED_AT)}
    where id = 'relop_pg16_promotion_source';

    insert into document_deployments (
      workspace_id, environment_id, document_id, state, active_publication_id,
      pending_release_operation_id, generation, updated_at
    ) values
      (${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(PRODUCTION_ENVIRONMENT_A)},
       ${sqlLiteral(RECOVERY_DOCUMENT_ID)}, 'active', ${sqlLiteral(RECOVERY_PUBLICATION_CURRENT)},
       null, 2, ${sqlLiteral(CREATED_AT)}),
      (${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(ENVIRONMENT_A)},
       ${sqlLiteral(PROMOTION_DOCUMENT_ID)}, 'active', ${sqlLiteral(PROMOTION_SOURCE_PUBLICATION)},
       null, 1, ${sqlLiteral(CREATED_AT)});

    insert into publication_verifications (
      id, workspace_id, environment_id, document_id, publication_id,
      result, report_json, verified_origin, verified_by_user_id, created_at
    ) values (
      'verification_pg16_promotion_source', ${sqlLiteral(WORKSPACE_A)}, ${sqlLiteral(ENVIRONMENT_A)},
      ${sqlLiteral(PROMOTION_DOCUMENT_ID)}, ${sqlLiteral(PROMOTION_SOURCE_PUBLICATION)}, 'passed',
      ${jsonbLiteral({
        schemaVersion: '1',
        checkedAt: CREATED_AT,
        sdkVersion: 'pg16-test',
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        status: 'passed',
        checks: [{ code: 'artifact_integrity', status: 'passed' }],
      })},
      'https://a.example.test', ${sqlLiteral(APPROVER_A)}, ${sqlLiteral(CREATED_AT)}
    );
  `;
}

function failureTriggerSql(proposalId: string): string {
  return `
    create function lodariq_ci_fail_product_match_source()
    returns trigger
    language plpgsql
    as $failure$
    begin
      if new.proposal_id = ${sqlLiteral(proposalId)} and new.source_ordinal = 1 then
        raise exception 'lodariq_ci_injected_source_failure';
      end if;
      return new;
    end
    $failure$;

    create trigger lodariq_ci_fail_product_match_source
    before insert on style_sources
    for each row execute function lodariq_ci_fail_product_match_source();
  `;
}

function dropFailureTriggerSql(): string {
  return `
    drop trigger if exists lodariq_ci_fail_product_match_source on style_sources;
    drop function if exists lodariq_ci_fail_product_match_source();
  `;
}

function scopedSql(workspaceId: string, statement: string): string {
  return `
    begin;
    set local lodariq.workspace_id = ${sqlLiteral(workspaceId)};
    ${statement}
    rollback;
  `;
}

function themeName(themeId: string): string {
  return `Product Match ${themeId}`;
}

function queryJson<T>(databaseUrl: string, statement: string): T {
  const output = runPsqlSync(databaseUrl, statement);
  return JSON.parse(output) as T;
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

function errorChainMessages(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) messages.push(current.message);
    current = 'cause' in current ? current.cause : undefined;
  }
  return messages.join('\n');
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
  const allowedProtocols = new Set(['postgres:', 'postgresql:']);
  const allowedHosts = new Set(['127.0.0.1', 'localhost']);
  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error('disposable PostgreSQL URL must use the postgres protocol');
  }
  if (!allowedHosts.has(parsed.hostname) || parsed.pathname !== '/postgres') {
    throw new Error('refusing Product Match integration tests outside local disposable PostgreSQL');
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
      // Preserve the original test failure; the PostgreSQL service is disposable.
    }
  }
  if (runtimeRoleCreated) {
    try {
      runPsqlSync(ADMIN_DATABASE_URL, `drop role if exists ${quoteIdentifier(RUNTIME_ROLE)};`);
    } catch {
      // Preserve the original test failure; the PostgreSQL service is disposable.
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

function createPgReleaseArtifact(
  documentId: string,
  _artifactId: string,
  _label: string,
  environments: Array<'staging' | 'production'>,
): NewCompiledDocument {
  const contentWithoutHash = {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId,
    type: 'tour' as const,
    schemaVersion: '1.0.0' as const,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' as const },
    audience: { environments },
    theme: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    localization: {
      defaultLocale: 'en',
      defaultTitle: 'PostgreSQL recovery fixture',
      variants: [],
    },
    targets: [],
    steps: [],
  };
  return {
    ...contentWithoutHash,
    contentHash: pgReleaseContentHash(contentWithoutHash),
  };
}

function pgReleaseContentHash(value: unknown): string {
  return `sha256-${createHash('sha256')
    .update(JSON.stringify(sortCanonicalKeys(value)))
    .digest('hex')}`;
}

function sortCanonicalKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortCanonicalKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
