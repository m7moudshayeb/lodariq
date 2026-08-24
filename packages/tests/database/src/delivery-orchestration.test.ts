import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  BROWSER_VERIFICATION_CHECK_CODES,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type EnvironmentReleasePolicy,
  type BrowserVerificationReport,
  type LodariqDocument,
} from '@lodariq/schema';
import type { WorkspaceEnvironment } from '@lodariq/database';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { createGrandfatheredInMemoryControlPlaneRepository } from '../../fixtures/commercial.js';

const WORKSPACE_ID = 'wk_a';
const USER_ID = 'user_admin';
const NOW = '2026-08-21T10:00:00.000Z';
const START = '2026-08-21T10:01:00.000Z';
const END = '2026-08-21T10:02:00.000Z';

describe('delivery orchestration', () => {
  it('pins a verified artifact, applies each boundary once, and records append-only history', async () => {
    const fixture = await createFixture();
    const schedule = await fixture.repository.createDeploymentSchedule({
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION.id,
      documentId: fixture.document.id,
      publicationId: fixture.stagingPublicationId,
      startAt: START,
      endAt: END,
      expectedGeneration: 0,
      idempotencyKey: 'schedule:boundary:once',
      requestHash: `sha256-${'c'.repeat(64)}`,
      actorUserId: USER_ID,
    });

    await expect(
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_a', now: NOW }),
    ).resolves.toEqual([]);
    const started = await Promise.all([
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_a', now: START }),
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_b', now: START }),
    ]);
    expect(started.flat().filter((result) => result.outcome === 'applied')).toHaveLength(1);

    const active = await fixture.repository.getDocumentDeployment(
      WORKSPACE_ID,
      PRODUCTION.id,
      fixture.document.id,
    );
    const publication = await fixture.repository.getPublicationById(
      WORKSPACE_ID,
      active?.state === 'active' ? active.activePublicationId : '',
    );
    expect(active).toMatchObject({ state: 'active', generation: 1 });
    expect(publication?.compiledArtifactId).toBe(fixture.artifactId);
    expect(schedule.artifactId).toBe(fixture.artifactId);

    await expect(
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_a', now: END }),
    ).resolves.toMatchObject([{ transition: 'end', outcome: 'applied', generation: 2 }]);
    await expect(
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_b', now: END }),
    ).resolves.toEqual([]);
    await expect(
      fixture.repository.listDeliveryTransitionHistory(
        WORKSPACE_ID,
        PRODUCTION.id,
        fixture.document.id,
      ),
    ).resolves.toMatchObject([
      { transition: 'end', outcome: 'applied', fromGeneration: 1, toGeneration: 2 },
      { transition: 'start', outcome: 'applied', fromGeneration: 0, toGeneration: 1 },
    ]);
  });

  it('fails closed when a manual release changes the target generation first', async () => {
    const fixture = await createFixture();
    await fixture.repository.createDeploymentSchedule({
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION.id,
      documentId: fixture.document.id,
      publicationId: fixture.stagingPublicationId,
      startAt: START,
      expectedGeneration: 0,
      idempotencyKey: 'schedule:cas:conflict',
      requestHash: `sha256-${'d'.repeat(64)}`,
      actorUserId: USER_ID,
    });
    await fixture.repository.activateCompiledArtifact({
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION.id,
      correlationId: 'corr_manual_release',
      artifact: fixture.artifact,
      actorUserId: USER_ID,
      idempotencyKey: 'publish:manual:before-schedule',
      requestHash: fixture.artifact.contentHash,
      expectedGeneration: 0,
      expectedEnvironmentPolicyUpdatedAt: PRODUCTION.updatedAt,
    });

    await expect(
      fixture.repository.runDueDeliveryScheduleJobs({ workerId: 'worker_conflict', now: START }),
    ).resolves.toMatchObject([
      { transition: 'start', outcome: 'conflict', reasonCode: 'deployment_changed' },
    ]);
    await expect(
      fixture.repository.getDocumentDeployment(WORKSPACE_ID, PRODUCTION.id, fixture.document.id),
    ).resolves.toMatchObject({ state: 'active', generation: 1 });
  });

  it('does not let scheduling bypass a production approval policy', async () => {
    const approvalProduction: WorkspaceEnvironment = {
      ...PRODUCTION,
      requiredApprovalCount: 1,
      releasePolicy: { ...RELEASE_POLICY, requiredApprovalCount: 1 },
    };
    const fixture = await createFixture(approvalProduction);
    await expect(
      fixture.repository.createDeploymentSchedule({
        workspaceId: WORKSPACE_ID,
        environmentId: approvalProduction.id,
        documentId: fixture.document.id,
        publicationId: fixture.stagingPublicationId,
        startAt: START,
        expectedGeneration: 0,
        idempotencyKey: 'schedule:approval:required',
        requestHash: `sha256-${'e'.repeat(64)}`,
        actorUserId: USER_ID,
      }),
    ).rejects.toThrow('requires an approved release');
  });

  it('versions a value-free catalog across environments', async () => {
    const fixture = await createFixture();
    const catalog = await fixture.repository.observeWorkspaceDataCatalog({
      workspaceId: WORKSPACE_ID,
      environmentId: STAGING.id,
      observations: [
        {
          source: 'identify_trait',
          key: 'account.plan',
          valueType: 'string',
          observedAt: NOW,
        },
        { source: 'track_event', key: 'checkout_completed', valueType: 'unknown', observedAt: NOW },
      ],
    });

    expect(catalog).toMatchObject({
      schemaVersion: '1',
      version: 1,
      entries: [
        { source: 'identify_trait', key: 'account.plan', environments: ['staging'] },
        { source: 'track_event', key: 'checkout_completed', environments: ['staging'] },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain('enterprise-customer-value');
  });
});

async function createFixture(production: WorkspaceEnvironment = PRODUCTION) {
  const repository = createGrandfatheredInMemoryControlPlaneRepository({
    environments: [STAGING, production],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'admin', createdAt: NOW },
    ],
  });
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = 'doc_delivery_orchestration';
  document.workspaceId = WORKSPACE_ID;
  const compiled = await compileDocument({
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const saved = await repository.saveDocument({
    workspaceId: WORKSPACE_ID,
    actorUserId: USER_ID,
    document,
    artifact: compiled,
  });
  if (!saved.latestArtifact) throw new Error('fixture artifact missing');
  const staging = await repository.activateCompiledArtifact({
    workspaceId: WORKSPACE_ID,
    environmentId: STAGING.id,
    correlationId: 'corr_delivery_staging',
    artifact: saved.latestArtifact,
    actorUserId: USER_ID,
    idempotencyKey: 'publish:delivery:staging',
    requestHash: saved.latestArtifact.contentHash,
    expectedGeneration: 0,
    expectedEnvironmentPolicyUpdatedAt: STAGING.updatedAt,
  });
  await repository.createPublicationVerification({
    workspaceId: WORKSPACE_ID,
    environmentId: STAGING.id,
    documentId: document.id,
    expectedPublicationId: staging.publication.id,
    report: VERIFICATION_REPORT,
    verifiedOrigin: 'https://staging.example.com',
    actorUserId: USER_ID,
  });
  return {
    repository,
    document,
    artifact: saved.latestArtifact,
    artifactId: saved.latestArtifact.id,
    stagingPublicationId: staging.publication.id,
  };
}

const RELEASE_POLICY: EnvironmentReleasePolicy = {
  allowDirectPublish: true,
  requireSourceVerification: false,
  requiredApprovalCount: 0,
  publisherRoles: ['owner', 'admin'],
  rollbackRoles: ['owner', 'admin'],
  unpublishRoles: ['owner', 'admin'],
  separationOfDuties: {
    requireSeparateVerifier: false,
    requireSeparateApprover: false,
  },
};

const STAGING: WorkspaceEnvironment = {
  id: 'env_staging',
  workspaceId: WORKSPACE_ID,
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.example.com'],
  requiredApprovalCount: 0,
  releasePolicy: RELEASE_POLICY,
  createdAt: NOW,
  updatedAt: NOW,
};

const PRODUCTION: WorkspaceEnvironment = {
  id: 'env_production',
  workspaceId: WORKSPACE_ID,
  kind: 'production',
  name: 'Production',
  originAllowlist: ['https://example.com'],
  requiredApprovalCount: 0,
  releasePolicy: RELEASE_POLICY,
  createdAt: NOW,
  updatedAt: NOW,
};

const VERIFICATION_REPORT: BrowserVerificationReport = {
  schemaVersion: '1',
  checkedAt: NOW,
  sdkVersion: '0.3.0',
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  status: 'passed',
  checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({ code, status: 'passed' as const })),
};
