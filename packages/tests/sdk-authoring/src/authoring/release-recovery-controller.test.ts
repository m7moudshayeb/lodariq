// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LodariqDocument,
  ReleaseArtifactPins,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import { RELEASE_RECOVERY_FAILURE_MESSAGES } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type {
  AuthoringReleaseWorkflowState,
  LocalAuthoringFrameServices,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-types';
import {
  createAuthoringReleaseRecoveryIntent,
  prepareAuthoringReleaseRecoveryRequest,
} from '../../../../../packages/sdk-authoring/src/authoring/release-recovery-model';

const WORKSPACE_ID = 'workspace_recovery_controller';
const DOCUMENT_ID = 'document_recovery_controller';
const STAGING_ENVIRONMENT_ID = 'environment_staging';
const PRODUCTION_ENVIRONMENT_ID = 'environment_production';
const OCCURRED_AT = '2026-08-09T12:00:00.000Z';

describe('release recovery controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('freezes one request identity across an uncertain retry and refreshes every typed result', async () => {
    const scopedState = recoveryState(PRODUCTION_ENVIRONMENT_ID);
    const invalidRefresh = {
      ...recoveryState(PRODUCTION_ENVIRONMENT_ID),
      history: recoveryState(PRODUCTION_ENVIRONMENT_ID).history.map((entry) => ({
        ...entry,
        environmentId: 'environment_other',
      })),
    } satisfies ReleaseRecoveryStateResponse;
    const getReleaseRecoveryState = vi
      .fn<NonNullable<LocalAuthoringFrameServices['getReleaseRecoveryState']>>()
      .mockResolvedValueOnce(scopedState)
      .mockResolvedValueOnce(invalidRefresh);
    const recoverRelease = vi
      .fn<NonNullable<LocalAuthoringFrameServices['recoverRelease']>>()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({
        ok: false,
        action: 'rollback',
        state: 'failed',
        replayed: false,
        code: 'deployment_changed',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
        expectedGeneration: 5,
        actualGeneration: 6,
        expectedActivePublicationId: 'publication_current_5',
        actualActivePublicationId: 'publication_changed_6',
      });
    const { controller } = createController({ getReleaseRecoveryState, recoverRelease });
    controller.start();
    await waitForWorkflow(controller);

    controller.openReleaseHistoryMode(PRODUCTION_ENVIRONMENT_ID);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.releaseRecovery.model?.canRollback).toBe(true),
    );
    const model = controller.getSnapshot().panelWorkflow.releaseRecovery.model!;
    const intent = createAuthoringReleaseRecoveryIntent(model, 'rollback')!;
    controller.startReleaseRecovery(intent);
    const firstIdentity = controller.getSnapshot().panelWorkflow.releaseRecovery.requestIdentity!;
    expect(controller.getSnapshot().panelWorkflow.releaseRecovery.requestIdentity).toEqual(
      firstIdentity,
    );
    const prepared = prepareAuthoringReleaseRecoveryRequest(intent, {
      reason: 'Restore the prior verified publication',
      targetPublicationId: 'publication_prior_3',
      identity: firstIdentity,
    });
    if (!prepared.ok) throw new Error(`request preparation failed: ${prepared.code}`);

    await controller.confirmReleaseRecovery(prepared.request);
    expect(controller.getSnapshot().panelWorkflow.mode).toBe('release-recovery-confirmation');
    expect(controller.getSnapshot().panelWorkflow.releaseRecovery.requestIdentity).toEqual(
      firstIdentity,
    );
    expect(controller.getSnapshot().panelWorkflow.error).toContain(
      'reuse the same request identity',
    );

    await controller.confirmReleaseRecovery(prepared.request);
    await vi.waitFor(() => expect(getReleaseRecoveryState).toHaveBeenCalledTimes(2));
    expect(recoverRelease).toHaveBeenNthCalledWith(1, PRODUCTION_ENVIRONMENT_ID, prepared.request);
    expect(recoverRelease).toHaveBeenNthCalledWith(2, PRODUCTION_ENVIRONMENT_ID, prepared.request);
    const refreshed = controller.getSnapshot().panelWorkflow.releaseRecovery;
    expect(refreshed.requestIdentity).toBeNull();
    expect(refreshed.intent).toBeNull();
    expect(refreshed.model).toMatchObject({
      deploymentState: 'unavailable',
      canRollback: false,
      canUnpublish: false,
    });
    controller.destroy();
  });

  it('refreshes release truth after success, exposes the inactive pointer, and never compiles', async () => {
    const active = recoveryState(PRODUCTION_ENVIRONMENT_ID);
    const inactive = inactiveRecoveryState(PRODUCTION_ENVIRONMENT_ID);
    const getReleaseRecoveryState = vi
      .fn<NonNullable<LocalAuthoringFrameServices['getReleaseRecoveryState']>>()
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(inactive);
    const success: ReleaseRecoveryResult = {
      ok: true,
      action: 'unpublish',
      state: 'inactive',
      replayed: false,
      releaseOperationId: 'operation_unpublish_6',
      previousPublicationId: 'publication_current_5',
      generation: 6,
      deactivatedArtifact: artifact('5'),
      completedAt: OCCURRED_AT,
    };
    const recoverRelease = vi.fn(async () => structuredClone(success));
    const getReleaseState = vi.fn(async () => unreleasedState());
    const getReleaseWorkflowState = vi.fn(async () => releaseWorkflow());
    const compilePreview = vi.fn();
    const { controller } = createController({
      getReleaseRecoveryState,
      recoverRelease,
      getReleaseState,
      getReleaseWorkflowState,
      compilePreview,
    });
    controller.start();
    await waitForWorkflow(controller);
    const initialReleaseStateReads = getReleaseState.mock.calls.length;
    const initialWorkflowReads = getReleaseWorkflowState.mock.calls.length;
    const initialCompileCalls = compilePreview.mock.calls.length;

    controller.openReleaseHistoryMode(PRODUCTION_ENVIRONMENT_ID);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.releaseRecovery.model?.canUnpublish).toBe(true),
    );
    const model = controller.getSnapshot().panelWorkflow.releaseRecovery.model!;
    const intent = createAuthoringReleaseRecoveryIntent(model, 'unpublish')!;
    controller.startReleaseRecovery(intent);
    const identity = controller.getSnapshot().panelWorkflow.releaseRecovery.requestIdentity!;
    const prepared = prepareAuthoringReleaseRecoveryRequest(intent, {
      reason: 'Pause delivery while the incident is reviewed',
      identity,
    });
    if (!prepared.ok) throw new Error(`request preparation failed: ${prepared.code}`);

    await controller.confirmReleaseRecovery(prepared.request);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.releaseRecovery.model).toMatchObject({
        deploymentState: 'inactive',
        deploymentGeneration: 6,
        canRollback: false,
        canUnpublish: false,
      }),
    );
    expect(getReleaseRecoveryState).toHaveBeenCalledTimes(2);
    expect(getReleaseState.mock.calls.length).toBeGreaterThan(initialReleaseStateReads);
    expect(getReleaseWorkflowState.mock.calls.length).toBeGreaterThan(initialWorkflowReads);
    expect(compilePreview).toHaveBeenCalledTimes(initialCompileCalls);
    expect(controller.getSnapshot().panelWorkflow.notice).toContain('inactive at generation 6');
    controller.destroy();
  });

  it('keeps both exact environment scopes visible without active artifacts and restores exact focus', async () => {
    const { controller } = createController({
      getReleaseRecoveryState: vi.fn(async (environmentId) => recoveryState(environmentId)),
      recoverRelease: vi.fn(),
      getReleaseWorkflowState: vi.fn(async () => ({
        ...releaseWorkflow(),
        staging: null,
        production: null,
      })),
    });
    controller.start();
    await waitForWorkflow(controller);
    expect(controller.getSnapshot().panelWorkflow.release?.environments).toEqual([
      { environment: 'staging', environmentId: STAGING_ENVIRONMENT_ID },
      { environment: 'production', environmentId: PRODUCTION_ENVIRONMENT_ID },
    ]);

    controller.openReleaseHistoryMode(PRODUCTION_ENVIRONMENT_ID);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.releaseRecovery.environmentId).toBe(
        PRODUCTION_ENVIRONMENT_ID,
      ),
    );
    controller.closePanelMode();
    expect(controller.getSnapshot().panelWorkflow).toMatchObject({
      mode: 'release-verification',
      focusTarget: 'release-history-production',
    });
    controller.destroy();
  });
});

function createController(overrides: {
  getReleaseRecoveryState: NonNullable<LocalAuthoringFrameServices['getReleaseRecoveryState']>;
  recoverRelease: NonNullable<LocalAuthoringFrameServices['recoverRelease']>;
  getReleaseState?: NonNullable<LocalAuthoringFrameServices['getReleaseState']>;
  getReleaseWorkflowState?: NonNullable<LocalAuthoringFrameServices['getReleaseWorkflowState']>;
  compilePreview?: LocalAuthoringFrameServices['compilePreview'];
}): { controller: LocalAuthoringFrameController } {
  const authoringDocument = documentFixture();
  const root = document.createElement('div');
  document.body.appendChild(root);
  const services: LocalAuthoringFrameServices = {
    loadDocument: () => structuredClone(authoringDocument),
    saveDocument: vi.fn(),
    exportDocument: (value) => JSON.stringify(value),
    importDocument: (value) => JSON.parse(value) as LodariqDocument,
    resetDocuments: vi.fn(),
    compilePreview: overrides.compilePreview ?? vi.fn(),
    getReleaseRecoveryState: overrides.getReleaseRecoveryState,
    recoverRelease: overrides.recoverRelease,
    getReleaseWorkflowState:
      overrides.getReleaseWorkflowState ?? vi.fn(async () => releaseWorkflow()),
    ...(overrides.getReleaseState ? { getReleaseState: overrides.getReleaseState } : {}),
    recordMetric: vi.fn(),
    getMetricsSummary: vi.fn(() => ({})),
    exportMetricsReport: vi.fn(() => '{}'),
  };
  return {
    controller: new LocalAuthoringFrameController({
      root,
      baseDocument: structuredClone(authoringDocument),
      services,
      frameMode: 'panel',
      sessionId: 'session_recovery_controller',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    }),
  };
}

async function waitForWorkflow(controller: LocalAuthoringFrameController): Promise<void> {
  await vi.waitFor(() =>
    expect(controller.getSnapshot().panelWorkflow.release?.environments).toHaveLength(2),
  );
}

function releaseWorkflow(): AuthoringReleaseWorkflowState {
  return {
    draft: { version: 7, contentHash: hash('7'), dirty: false },
    staging: null,
    production: null,
    environments: [
      { environment: 'staging', environmentId: STAGING_ENVIRONMENT_ID },
      { environment: 'production', environmentId: PRODUCTION_ENVIRONMENT_ID },
    ],
    canVerify: false,
    canPromote: false,
    canApprove: false,
    approval: 'not-required',
  };
}

function recoveryState(environmentId: string): ReleaseRecoveryStateResponse {
  return {
    workspaceId: WORKSPACE_ID,
    environmentId,
    documentId: DOCUMENT_ID,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      workspaceId: WORKSPACE_ID,
      environmentId,
      documentId: DOCUMENT_ID,
      state: 'active',
      generation: 5,
      activePublicationId: 'publication_current_5',
      updatedAt: OCCURRED_AT,
    },
    history: [
      publishHistory(environmentId, 'publication_current_5', 5, '5'),
      publishHistory(environmentId, 'publication_prior_3', 3, '3'),
    ],
    rollbackTargetPublicationIds: ['publication_prior_3'],
  };
}

function inactiveRecoveryState(environmentId: string): ReleaseRecoveryStateResponse {
  const state = recoveryState(environmentId);
  return {
    ...state,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      workspaceId: WORKSPACE_ID,
      environmentId,
      documentId: DOCUMENT_ID,
      state: 'inactive',
      generation: 6,
      activePublicationId: null,
      updatedAt: OCCURRED_AT,
    },
    rollbackTargetPublicationIds: [],
  };
}

function publishHistory(
  environmentId: string,
  publicationId: string,
  generation: number,
  version: string,
) {
  return {
    id: `history_${publicationId}`,
    workspaceId: WORKSPACE_ID,
    environmentId,
    documentId: DOCUMENT_ID,
    releaseOperationId: `operation_${publicationId}`,
    generation,
    idempotencyKey: `idempotency.${publicationId}`,
    correlationId: `correlation.${publicationId}`,
    actorUserId: 'user_recovery_controller',
    occurredAt: OCCURRED_AT,
    action: 'publish' as const,
    state: 'active' as const,
    publicationId,
    previousPublicationId: null,
    artifact: artifact(version),
  };
}

function artifact(version: string): ReleaseArtifactPins {
  return {
    compiledArtifactId: `artifact_${version}`,
    artifactSchemaVersion: '2',
    contentHash: hash(version),
    compilerVersion: '0.1.0',
    rendererContractVersion: '1',
    themeContractVersion: '1',
    themeVersionId: `theme_version_${version}`,
    themeContentHash: hash(version),
  };
}

function unreleasedState() {
  return {
    available: false,
    environment: 'staging' as const,
    environmentId: STAGING_ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
    expectedGeneration: 0,
    draftArtifactId: null,
    draftContentHash: null,
    activeContentHash: null,
    state: 'no_saved_artifact' as const,
    findings: [],
  };
}

function documentFixture(): LodariqDocument {
  return {
    id: DOCUMENT_ID,
    workspaceId: WORKSPACE_ID,
    type: 'tour',
    status: 'draft',
    title: 'Release recovery controller',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [],
  };
}

function hash(version: string): string {
  return `sha256-${version.repeat(64)}`;
}
