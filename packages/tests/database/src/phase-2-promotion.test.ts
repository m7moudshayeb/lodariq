import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  ActivePublicationChangedError,
  EnvironmentReleasePolicyChangedError,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  ReleaseApprovalRejectedError,
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
const DEVELOPMENT: WorkspaceEnvironment = {
  id: 'env_development',
  workspaceId: 'wk_a',
  kind: 'development',
  name: 'Development',
  originAllowlist: ['http://localhost:5175'],
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
  releasePolicy: {
    allowDirectPublish: false,
    requireSourceVerification: true,
    requiredApprovalCount: 1,
    publisherRoles: ['owner', 'admin'],
    rollbackRoles: ['owner', 'admin'],
    unpublishRoles: ['owner', 'admin'],
    separationOfDuties: {
      requireSeparateVerifier: false,
      requireSeparateApprover: true,
    },
  },
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
      expectedEnvironmentPolicyUpdatedAt: STAGING.updatedAt,
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
      expectedEnvironmentPolicyUpdatedAt: PRODUCTION.updatedAt,
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
    const productionBeforePolicyChange = (await repository.listEnvironments('wk_a')).find(
      (environment) => environment.id === PRODUCTION.id,
    );
    if (!productionBeforePolicyChange) throw new Error('production policy fixture missing');
    await expect(
      repository.createReleaseApproval({
        workspaceId: 'wk_a',
        releaseOperationId: pending.operation.id,
        decision: 'approved',
        actorUserId: 'user_admin',
        expectedEnvironmentPolicyUpdatedAt: productionBeforePolicyChange.updatedAt,
      }),
    ).rejects.toMatchObject({
      decisionCode: 'separation_of_duties_required',
    });
    await expect(repository.listReleaseApprovals('wk_a', pending.operation.id)).resolves.toEqual(
      [],
    );

    await repository.updateEnvironmentReleasePolicy({
      workspaceId: 'wk_a',
      environmentId: PRODUCTION.id,
      requiredApprovalCount: 1,
      expectedUpdatedAt: productionBeforePolicyChange.updatedAt,
      actorUserId: 'user_admin',
    });
    await expect(
      repository.createReleaseApproval({
        workspaceId: 'wk_a',
        releaseOperationId: pending.operation.id,
        decision: 'approved',
        actorUserId: 'user_owner',
        expectedEnvironmentPolicyUpdatedAt: productionBeforePolicyChange.updatedAt,
      }),
    ).rejects.toBeInstanceOf(EnvironmentReleasePolicyChangedError);
    await expect(repository.listReleaseApprovals('wk_a', pending.operation.id)).resolves.toEqual(
      [],
    );
    const currentProduction = (await repository.listEnvironments('wk_a')).find(
      (environment) => environment.id === PRODUCTION.id,
    );
    if (!currentProduction) throw new Error('current production policy fixture missing');
    const approvalInput = {
      workspaceId: 'wk_a',
      releaseOperationId: pending.operation.id,
      decision: 'approved' as const,
      reason: 'Ready for production',
      actorUserId: 'user_owner',
      expectedEnvironmentPolicyUpdatedAt: currentProduction.updatedAt,
    };
    const approval = await repository.createReleaseApproval(approvalInput);
    await expect(repository.createReleaseApproval(approvalInput)).resolves.toEqual(approval);
    await expect(repository.listReleaseApprovals('wk_a', pending.operation.id)).resolves.toEqual([
      approval,
    ]);

    const currentPromotionInput = {
      ...promotionInput,
      expectedEnvironmentPolicyUpdatedAt: currentProduction.updatedAt,
    };
    const completed = await repository.promoteVerifiedPublication(currentPromotionInput);
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
    await expect(
      repository.promoteVerifiedPublication(currentPromotionInput),
    ).resolves.toMatchObject({
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

  it.each([
    {
      name: 'the rejecting admin is excluded from publisher roles',
      enabled: true,
      publisherRoles: ['owner'] as const,
    },
    {
      name: 'the production target was disabled after the request',
      enabled: false,
      publisherRoles: ['owner', 'admin'] as const,
    },
  ])('atomically clears a rejected pending promotion when $name', async (policyChange) => {
    const fixture = await createPendingPromotionFixture(
      `doc_rejected_${String(policyChange.enabled)}`,
    );
    const currentProduction = (await fixture.repository.listEnvironments('wk_a')).find(
      (environment) => environment.id === PRODUCTION.id,
    );
    if (
      !currentProduction?.releasePolicy ||
      currentProduction.pipelinePosition !== 2 ||
      currentProduction.authoringEnabled === undefined
    ) {
      throw new Error('production policy fixture missing');
    }
    const updated = await fixture.repository.updateWorkspaceEnvironmentPolicy({
      workspaceId: 'wk_a',
      environmentId: currentProduction.id,
      name: currentProduction.name,
      originAllowlist: currentProduction.originAllowlist,
      enabled: policyChange.enabled,
      pipelinePosition: currentProduction.pipelinePosition,
      authoringEnabled: currentProduction.authoringEnabled,
      promotionSourceEnvironmentId: STAGING.id,
      releasePolicy: {
        ...currentProduction.releasePolicy,
        publisherRoles: [...policyChange.publisherRoles],
      },
      expectedUpdatedAt: currentProduction.updatedAt,
      actorUserId: 'user_admin',
    });
    if (!updated) throw new Error('updated production policy fixture missing');

    const rejectionInput = {
      workspaceId: 'wk_a',
      releaseOperationId: fixture.pending.operation.id,
      decision: 'rejected' as const,
      reason: 'Stop this release',
      actorUserId: 'user_admin',
      expectedEnvironmentPolicyUpdatedAt: updated.updatedAt,
    };
    const rejection = await fixture.repository.createReleaseApproval(rejectionInput);
    await expect(fixture.repository.createReleaseApproval(rejectionInput)).resolves.toEqual(
      rejection,
    );
    await expect(
      fixture.repository.listReleaseApprovals('wk_a', fixture.pending.operation.id),
    ).resolves.toEqual([rejection]);
    await expect(
      fixture.repository.getReleaseOperationById('wk_a', fixture.pending.operation.id),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
    });
    await expect(
      fixture.repository.getDocumentDeployment('wk_a', PRODUCTION.id, fixture.document.id),
    ).resolves.toMatchObject({ pendingReleaseOperationId: null });
    await expect(
      fixture.repository.promoteVerifiedPublication({
        ...fixture.promotionInput,
        expectedEnvironmentPolicyUpdatedAt: updated.updatedAt,
      }),
    ).rejects.toBeInstanceOf(ReleaseApprovalRejectedError);
    await expect(
      fixture.repository.getReleaseOperationById('wk_a', fixture.pending.operation.id),
    ).resolves.toMatchObject({
      status: 'failed',
      errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
    });
    await expect(
      fixture.repository.getDocumentDeployment('wk_a', PRODUCTION.id, fixture.document.id),
    ).resolves.toMatchObject({ pendingReleaseOperationId: null });
  });

  it.each([
    { name: 'requester identity is missing', requestedByUserId: null },
    { name: 'requester membership was removed', requestedByUserId: 'user_removed' },
  ])('allows an authorized admin to reject when $name', async ({ requestedByUserId }) => {
    const documentId = `doc_orphaned_${requestedByUserId ?? 'null'}`;
    const operationId = `relop_orphaned_${requestedByUserId ?? 'null'}`;
    const repository = createInMemoryControlPlaneRepository({
      environments: [PRODUCTION],
      workspaceMemberships: MEMBERSHIPS,
      documentDeployments: [
        {
          workspaceId: 'wk_a',
          environmentId: PRODUCTION.id,
          documentId,
          state: 'inactive',
          activePublicationId: null,
          pendingReleaseOperationId: operationId,
          generation: 0,
          updatedAt: CREATED_AT,
        },
      ],
      releaseOperations: [
        {
          id: operationId,
          workspaceId: 'wk_a',
          environmentId: PRODUCTION.id,
          documentId,
          action: 'promote',
          requestedArtifactId: 'artifact_orphaned',
          requestedSourcePublicationId: null,
          requestedActivePublicationId: null,
          actualActivePublicationId: null,
          sourcePublicationId: 'publication_orphaned',
          reason: null,
          expectedGeneration: 0,
          resultGeneration: null,
          idempotencyKey: `promote:${documentId}:1`,
          requestHash: `sha256-${'f'.repeat(64)}`,
          status: 'awaiting_approval',
          correlationId: `corr.${documentId}`,
          requestedByUserId,
          resultPublicationId: null,
          errorCode: null,
          createdAt: CREATED_AT,
          completedAt: null,
        },
      ],
    });

    await expect(
      repository.createReleaseApproval({
        workspaceId: 'wk_a',
        releaseOperationId: operationId,
        decision: 'rejected',
        reason: 'Cancel orphaned release',
        actorUserId: 'user_admin',
        expectedEnvironmentPolicyUpdatedAt: PRODUCTION.updatedAt,
      }),
    ).resolves.toMatchObject({ decision: 'rejected', decidedByUserId: 'user_admin' });
    await expect(repository.getReleaseOperationById('wk_a', operationId)).resolves.toMatchObject({
      status: 'failed',
      errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
    });
    await expect(
      repository.getDocumentDeployment('wk_a', PRODUCTION.id, documentId),
    ).resolves.toMatchObject({ pendingReleaseOperationId: null });
  });
});

async function createPendingPromotionFixture(documentId: string) {
  const repository = createInMemoryControlPlaneRepository({
    environments: [DEVELOPMENT, STAGING, PRODUCTION],
    workspaceMemberships: MEMBERSHIPS,
  });
  const document = documentFixture(documentId);
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
  const staging = await repository.activateCompiledArtifact({
    workspaceId: 'wk_a',
    environmentId: STAGING.id,
    correlationId: `corr.${documentId}.staging`,
    artifact: saved.latestArtifact,
    actorUserId: 'user_admin',
    idempotencyKey: `publish:${documentId}:1`,
    requestHash: saved.latestArtifact.contentHash,
    expectedGeneration: 0,
    expectedEnvironmentPolicyUpdatedAt: STAGING.updatedAt,
  });
  await repository.createPublicationVerification({
    workspaceId: 'wk_a',
    environmentId: STAGING.id,
    documentId,
    expectedPublicationId: staging.publication.id,
    report: VERIFICATION_REPORT,
    verifiedOrigin: STAGING_ORIGIN,
    actorUserId: 'user_admin',
  });
  const promotionInput = {
    workspaceId: 'wk_a',
    sourceEnvironmentId: STAGING.id,
    targetEnvironmentId: PRODUCTION.id,
    documentId,
    expectedSourcePublicationId: staging.publication.id,
    correlationId: `corr.${documentId}.production`,
    actorUserId: 'user_admin',
    idempotencyKey: `promote:${documentId}:1`,
    requestHash: `sha256-${'e'.repeat(64)}`,
    expectedGeneration: 0,
    expectedEnvironmentPolicyUpdatedAt: PRODUCTION.updatedAt,
  } as const;
  const pending = await repository.promoteVerifiedPublication(promotionInput);
  return { repository, document, pending, promotionInput };
}

describe('Phase 2 match and promotion baseline', () => {
  it('locks current policy and membership while Drizzle authoring sessions are issued', () => {
    const sessionSource = readDrizzleModule('authoring-sessions.ts');
    const createSession = methodSource(
      sessionSource,
      '  async createAuthoringSession(',
      '  async resolveAuthoringSession(',
    );
    expect(createSession).toContain(
      'this.hasAuthoringMembership(tx, input.workspaceId, input.actorUserId)',
    );
    expect(createSession).toMatch(/from\(environments\)[\s\S]*?\.for\('share'\)/u);
    expect(createSession.indexOf('this.hasAuthoringMembership(')).toBeLessThan(
      createSession.indexOf('.insert(authoringSessions)'),
    );
    const helperSource = readDrizzleModule('generic-helpers.ts');
    const membershipHelper = methodSource(
      helperSource,
      '  protected async hasAuthoringMembership(',
      '  protected async hasActiveAuthoringScope(',
    );
    expect(membershipHelper).toMatch(/from\(workspaceMemberships\)[\s\S]*?\.for\('share'\)/u);

    const hostedSession = methodSource(
      readDrizzleModule('authoring-activation.ts'),
      '  async createAuthoringDocumentSessionFromActivation(',
    );
    expect(hostedSession.indexOf('this.hasActiveAuthoringScope(')).toBeLessThan(
      hostedSession.indexOf('.insert(authoringSessions)'),
    );
    expect(hostedSession.indexOf('this.hasAuthoringMembership(')).toBeLessThan(
      hostedSession.indexOf('.insert(authoringSessions)'),
    );
    const activeScopeHelper = methodSource(
      helperSource,
      '  protected async hasActiveAuthoringScope(',
      '  protected activeAuthorizationRequestScopeCondition(',
    );
    expect(activeScopeHelper).toMatch(
      /from\(publicSdkInstallationOrigins\)[\s\S]*?innerJoin\([\s\S]*?environments[\s\S]*?\.for\('share'\)/u,
    );
  });

  it('locks release-authority membership rows before transactional mutations', () => {
    const membershipLock = /from\(workspaceMemberships\)[\s\S]{0,500}?\.for\('share'\)/gu;
    const directPublish = methodSource(
      readDrizzleModule('activation.ts'),
      '  async activateCompiledArtifact(',
    );
    const releaseChecks = readDrizzleModule('release-checks.ts');
    const verification = methodSource(
      releaseChecks,
      '  async createPublicationVerification(',
      '  async listPublicationVerifications(',
    );
    const approval = methodSource(
      releaseChecks,
      '  async createReleaseApproval(',
      '  async listReleaseApprovals(',
    );
    const promotion = methodSource(
      readDrizzleModule('promotion.ts'),
      '  async promoteVerifiedPublication(',
    );

    expect(directPublish.match(membershipLock)).toHaveLength(1);
    expect(verification.match(membershipLock)).toHaveLength(1);
    expect(approval.match(membershipLock)).toHaveLength(2);
    expect(promotion.match(membershipLock)).toHaveLength(1);
  });

  it('serializes approval and promotion through the same sorted document lock protocol', () => {
    const approval = methodSource(
      readDrizzleModule('release-checks.ts'),
      '  async createReleaseApproval(',
      '  async listReleaseApprovals(',
    );
    const promotion = methodSource(
      readDrizzleModule('promotion.ts'),
      '  async promoteVerifiedPublication(',
    );
    const lockHelper = methodSource(
      readDrizzleModule('generic-helpers.ts'),
      '  protected async lockSortedReleaseDocumentEnvironments(',
      '  protected async setWorkspaceScope(',
    );

    expect(approval).toContain('this.lockSortedReleaseDocumentEnvironments(');
    expect(promotion).toContain('this.lockSortedReleaseDocumentEnvironments(');
    expect(approval.indexOf('this.lockSortedReleaseDocumentEnvironments(')).toBeLessThan(
      approval.indexOf(".for('update')"),
    );
    expect(promotion.indexOf('this.lockSortedReleaseDocumentEnvironments(')).toBeLessThan(
      promotion.indexOf('this.findPromotionOperation('),
    );
    expect(lockHelper).toContain('[...new Set(environmentIds)].sort()');
    expect(lockHelper).toContain('select pg_advisory_xact_lock(');
    expect(lockHelper).toContain('hashtext(${`${workspaceId}:${environmentId}`})');
    expect(lockHelper).toContain('hashtext(${documentId})');
  });

  it('adds forced-RLS append-only evidence tables and scoped foreign keys', () => {
    const migration = readInitialBaseline();
    expect(migration).toContain('required_approval_count integer not null default 0');
    expect(migration).toContain('environments_required_approval_count_check');
    expect(migration).toContain('pipeline_position integer not null');
    expect(migration).toContain('authoring_enabled boolean not null');
    expect(migration).toContain('release_policy_json jsonb not null');
    expect(migration).toContain('lodariq_is_valid_origin_allowlist(candidate jsonb)');
    expect(migration).toContain('count(*) = count(distinct entry.value');
    expect(migration).toContain('(release_policy_json - array[');
    expect(migration).toContain(") = '{}'::jsonb");
    expect(migration).toContain("release_policy_json->'publisherRoles' <@");
    expect(migration).toContain("jsonb_array_length(release_policy_json->'publisherRoles') =");
    expect(migration).toContain(
      "kind = 'production' and promotion_source_environment_id is not null",
    );
    expect(migration).toContain("kind <> 'production' and promotion_source_environment_id is null");
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

function readDrizzleModule(fileName: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../database/src/drizzle/${fileName}`, import.meta.url)),
    'utf8',
  );
}

function methodSource(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
  return source.slice(startIndex, endIndex < 0 ? source.length : endIndex);
}
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
