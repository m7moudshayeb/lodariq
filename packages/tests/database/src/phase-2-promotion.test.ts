import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  ActivePublicationChangedError,
  EnvironmentReleasePolicyChangedError,
  createInMemoryControlPlaneRepository,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  BROWSER_VERIFICATION_CHECK_CODES,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type BrowserVerificationReport,
  type LodariqDocument,
  type ProductStyleSource,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { readInitialBaseline } from './migration-test-utils.js';

const STAGING_ORIGIN = 'https://staging.example.com';
const CREATED_AT = '2026-08-08T00:00:00.000Z';
const STAGING: WorkspaceEnvironment = {
  id: 'env_staging',
  workspaceId: 'wk_a',
  kind: 'staging',
  name: 'Staging',
  originAllowlist: [STAGING_ORIGIN],
  requiredApprovalCount: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};
const PRODUCTION: WorkspaceEnvironment = {
  id: 'env_production',
  workspaceId: 'wk_a',
  kind: 'production',
  name: 'Production',
  originAllowlist: ['https://example.com'],
  requiredApprovalCount: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};
const VERIFICATION_REPORT: BrowserVerificationReport = {
  schemaVersion: '1',
  checkedAt: CREATED_AT,
  sdkVersion: '0.3.0',
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  status: 'passed',
  checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
    code,
    status: 'passed' as const,
  })),
};
const MEMBERSHIPS = [
  {
    workspaceId: 'wk_a',
    userId: 'user_admin',
    role: 'admin' as const,
    createdAt: CREATED_AT,
  },
  {
    workspaceId: 'wk_a',
    userId: 'user_owner',
    role: 'owner' as const,
    createdAt: CREATED_AT,
  },
];

describe('Phase 2 style and promotion persistence', () => {
  it('updates environment approval policy behind an updatedAt guard', async () => {
    const repository = createInMemoryControlPlaneRepository({ environments: [PRODUCTION] });
    const updated = await repository.updateEnvironmentReleasePolicy({
      workspaceId: 'wk_a',
      environmentId: PRODUCTION.id,
      requiredApprovalCount: 0,
      expectedUpdatedAt: PRODUCTION.updatedAt,
      actorUserId: 'user_admin',
    });
    expect(updated?.requiredApprovalCount).toBe(0);
    await expect(
      repository.updateEnvironmentReleasePolicy({
        workspaceId: 'wk_a',
        environmentId: PRODUCTION.id,
        requiredApprovalCount: 1,
        expectedUpdatedAt: PRODUCTION.updatedAt,
        actorUserId: 'user_admin',
      }),
    ).rejects.toBeInstanceOf(EnvironmentReleasePolicyChangedError);
  });

  it('persists only schema-owned product-style sources and scopes their history', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [STAGING],
      workspaceMemberships: MEMBERSHIPS,
    });
    const theme = await repository.createWorkspaceTheme({
      workspaceId: 'wk_a',
      name: 'Product match',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: 'user_admin',
    });
    const source: ProductStyleSource = {
      sourceId: 'registered.brand.v1',
      kind: 'registered_tokens',
      revision: 'revision.1',
      confidence: 100,
      fingerprintHash: `sha256-${'a'.repeat(64)}`,
      capturedAt: CREATED_AT,
    };

    const created = await repository.createStyleSource({
      workspaceId: 'wk_a',
      themeId: theme.id,
      environmentId: STAGING.id,
      source,
      actorUserId: 'user_admin',
    });

    expect(created.source).toEqual(source);
    expect(created.sourceHash).toMatch(/^sha256-[0-9a-f]{64}$/u);
    await expect(repository.listStyleSources('wk_a', theme.id)).resolves.toEqual([created]);
    await expect(repository.listStyleSources('wk_b')).resolves.toEqual([]);
  });

  it('verifies the exact active staging publication, awaits approval, then reuses its artifact', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [STAGING, PRODUCTION],
      workspaceMemberships: MEMBERSHIPS,
    });
    const document = documentFixture('doc_verified_promotion');
    const artifact = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    const saved = await repository.saveDocument({
      workspaceId: 'wk_a',
      document,
      artifact,
      actorUserId: 'user_admin',
    });
    if (!saved.latestArtifact) throw new Error('test artifact missing');
    const stagingActivation = await repository.activateCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: STAGING.id,
      correlationId: 'corr.stage.verified',
      artifact: saved.latestArtifact,
      actorUserId: 'user_admin',
      idempotencyKey: 'publish:verified:1',
      requestHash: saved.latestArtifact.contentHash,
      expectedGeneration: 0,
    });

    const verification = await repository.createPublicationVerification({
      workspaceId: 'wk_a',
      environmentId: STAGING.id,
      documentId: document.id,
      expectedPublicationId: stagingActivation.publication.id,
      report: VERIFICATION_REPORT,
      verifiedOrigin: STAGING_ORIGIN,
      actorUserId: 'user_admin',
    });
    expect(verification).toMatchObject({
      publicationId: stagingActivation.publication.id,
      result: 'passed',
      verifiedOrigin: STAGING_ORIGIN,
    });

    const promotionInput = {
      workspaceId: 'wk_a',
      sourceEnvironmentId: STAGING.id,
      targetEnvironmentId: PRODUCTION.id,
      documentId: document.id,
      expectedSourcePublicationId: stagingActivation.publication.id,
      correlationId: 'corr.promote.verified',
      actorUserId: 'user_admin',
      idempotencyKey: 'promote:verified:1',
      requestHash: `sha256-${'d'.repeat(64)}`,
      expectedGeneration: 0,
    } as const;
    const pending = await repository.promoteVerifiedPublication(promotionInput);
    expect(pending).toMatchObject({
      operation: { status: 'awaiting_approval' },
      publication: null,
      deployment: null,
      approvalCount: 0,
      requiredApprovalCount: 1,
      replayed: false,
    });
    await expect(
      repository.getDocumentDeployment('wk_a', PRODUCTION.id, document.id),
    ).resolves.toMatchObject({
      state: 'inactive',
      pendingReleaseOperationId: pending.operation.id,
      generation: 0,
    });
    await repository.createReleaseApproval({
      workspaceId: 'wk_a',
      releaseOperationId: pending.operation.id,
      decision: 'approved',
      reason: 'Ready for production',
      actorUserId: 'user_owner',
    });

    const completed = await repository.promoteVerifiedPublication(promotionInput);
    expect(completed).toMatchObject({
      operation: { id: pending.operation.id, status: 'completed' },
      sourcePublication: { id: stagingActivation.publication.id },
      publication: {
        action: 'promote',
        sourcePublicationId: stagingActivation.publication.id,
        compiledArtifactId: stagingActivation.publication.compiledArtifactId,
        contentHash: stagingActivation.publication.contentHash,
      },
      deployment: { state: 'active', generation: 1 },
      approvalCount: 1,
      requiredApprovalCount: 1,
      replayed: false,
    });
    await expect(repository.promoteVerifiedPublication(promotionInput)).resolves.toMatchObject({
      operation: { id: pending.operation.id, status: 'completed' },
      replayed: true,
    });
    await expect(
      repository.getReleaseOperationById('wk_a', pending.operation.id),
    ).resolves.toMatchObject({ sourcePublicationId: stagingActivation.publication.id });
    await expect(
      repository.getPublicationById('wk_a', stagingActivation.publication.id),
    ).resolves.toMatchObject({
      compiledArtifactId: stagingActivation.publication.compiledArtifactId,
    });
  });

  it('rejects verification if the explicit publication is not the current pointer', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [STAGING],
      workspaceMemberships: MEMBERSHIPS,
    });
    await expect(
      repository.createPublicationVerification({
        workspaceId: 'wk_a',
        environmentId: STAGING.id,
        documentId: 'doc_missing',
        expectedPublicationId: 'pub_stale',
        report: VERIFICATION_REPORT,
        verifiedOrigin: STAGING_ORIGIN,
        actorUserId: 'user_admin',
      }),
    ).rejects.toBeInstanceOf(ActivePublicationChangedError);
  });
});

describe('Phase 2 match and promotion baseline', () => {
  it('adds forced-RLS append-only evidence tables and scoped foreign keys', () => {
    const migration = readInitialBaseline();
    expect(migration).toContain('required_approval_count integer not null default 0');
    expect(migration).toContain('environments_required_approval_count_check');
    for (const table of ['style_sources', 'publication_verifications', 'release_approvals']) {
      expect(migration).toContain(`create table if not exists ${table}`);
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`alter table ${table} force row level security`);
      expect(migration).toContain(`create policy ${table}_workspace_isolation on ${table}`);
      expect(migration).toContain(`create policy ${table}_workspace_insert on ${table}`);
      expect(migration).not.toContain(`create policy ${table}_workspace_update`);
      expect(migration).not.toContain(`create policy ${table}_workspace_delete`);
    }
    expect(migration).toContain('style_sources_theme_scope_fk');
    expect(migration).toContain('publication_verifications_publication_scope_fk');
    expect(migration).toContain('publication_verifications_origin_check');
    expect(migration).toContain('release_approvals_operation_scope_fk');
    expect(migration).toContain('release_approvals_operation_actor_idx');
  });
});

function documentFixture(id: string): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = id;
  document.workspaceId = 'wk_a';
  document.title = id;
  return document;
}
