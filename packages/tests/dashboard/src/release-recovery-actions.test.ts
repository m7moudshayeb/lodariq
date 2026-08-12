import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';

const mocks = vi.hoisted(() => ({
  loadDocumentReleaseRecoveryState: vi.fn(),
  loadControlPlaneContext: vi.fn(async () => ({
    userId: 'user_a',
    workspaceId: 'wk_a',
    role: 'owner',
  })),
  recoverDocumentRelease: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/lib/revalidation', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('../../../../apps/dashboard/src/lib/api', () => ({
  loadDocumentReleaseRecoveryState: mocks.loadDocumentReleaseRecoveryState,
  loadControlPlaneContext: mocks.loadControlPlaneContext,
  recoverDocumentRelease: mocks.recoverDocumentRelease,
  DashboardApiError: class DashboardApiError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'DashboardApiError';
      this.statusCode = statusCode;
    }
  },
}));

import {
  loadReleaseRecoveryStateAction,
  recoverDocumentReleaseAction,
} from '../../../../apps/dashboard/src/app/release-recovery-actions';
import { DashboardApiError } from '../../../../apps/dashboard/src/lib/api';

const DOCUMENT_ID = 'doc.release:dashboard';
const ENVIRONMENT_ID = 'env.production:opaque';

describe('@lodariq/dashboard release recovery actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an exact dotted/colon scope without rewriting opaque IDs', async () => {
    const state = recoveryState();
    mocks.loadDocumentReleaseRecoveryState.mockResolvedValue(state);

    await expect(
      loadReleaseRecoveryStateAction({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
      }),
    ).resolves.toEqual({ status: 'success', state });
    expect(mocks.loadDocumentReleaseRecoveryState).toHaveBeenCalledWith({
      documentId: DOCUMENT_ID,
      environmentId: ENVIRONMENT_ID,
      workspaceId: 'wk_a',
    });
  });

  it('accepts a bounded document route identifier without applying environment-ID syntax', async () => {
    const documentId = 'customer checkout/v2';
    const state = { ...recoveryState(), documentId };
    mocks.loadDocumentReleaseRecoveryState.mockResolvedValue(state);

    await expect(
      loadReleaseRecoveryStateAction({ documentId, environmentId: ENVIRONMENT_ID }),
    ).resolves.toEqual({ status: 'success', state });
    expect(mocks.loadDocumentReleaseRecoveryState).toHaveBeenCalledWith({
      documentId,
      environmentId: ENVIRONMENT_ID,
      workspaceId: 'wk_a',
    });
  });

  it('rejects malformed scope and request fields before the authenticated client runs', async () => {
    await expect(
      loadReleaseRecoveryStateAction({
        documentId: 'x'.repeat(257),
        environmentId: ENVIRONMENT_ID,
      }),
    ).resolves.toEqual({
      status: 'error',
      error: 'Choose a valid document and release environment.',
    });
    await expect(
      recoverDocumentReleaseAction({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request: { ...rollbackRequest(), reason: ' outer space ' },
      }),
    ).resolves.toEqual({
      status: 'error',
      error: 'The release recovery request is invalid.',
      retryExact: false,
    });
    expect(mocks.loadDocumentReleaseRecoveryState).not.toHaveBeenCalled();
    expect(mocks.recoverDocumentRelease).not.toHaveBeenCalled();
  });

  it('submits the complete CAS request and revalidates only a typed success', async () => {
    const request = rollbackRequest();
    const success = {
      ok: true,
      action: 'rollback',
      state: 'active',
      replayed: false,
      releaseOperationId: 'relop.dashboard:rollback',
      publicationId: 'pub.dashboard:rollback',
      targetPublicationId: request.targetPublicationId,
      previousPublicationId: request.expectedActivePublicationId!,
      generation: 3,
      artifact: artifactPins(),
      completedAt: '2026-08-09T12:03:00.000Z',
    } as const;
    mocks.recoverDocumentRelease.mockResolvedValue(success);

    await expect(
      recoverDocumentReleaseAction({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request,
      }),
    ).resolves.toEqual({ status: 'result', result: success });
    expect(mocks.recoverDocumentRelease).toHaveBeenCalledWith({
      documentId: DOCUMENT_ID,
      environmentId: ENVIRONMENT_ID,
      request,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/');

    vi.clearAllMocks();
    const failure = {
      ok: false,
      action: 'rollback',
      state: 'failed',
      replayed: false,
      code: 'deployment_changed',
      message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
      expectedGeneration: 2,
      actualGeneration: 3,
    } as const;
    mocks.recoverDocumentRelease.mockResolvedValue(failure);
    await expect(
      recoverDocumentReleaseAction({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request,
      }),
    ).resolves.toEqual({ status: 'result', result: failure });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('distinguishes denied access from an uncertain result that requires exact retry', async () => {
    const input = {
      documentId: DOCUMENT_ID,
      environmentId: ENVIRONMENT_ID,
      request: rollbackRequest(),
    };
    mocks.recoverDocumentRelease.mockRejectedValueOnce(new DashboardApiError(403, 'forbidden'));
    await expect(recoverDocumentReleaseAction(input)).resolves.toEqual({
      status: 'error',
      error: 'Your current workspace access cannot perform this release recovery action.',
      retryExact: false,
    });

    mocks.recoverDocumentRelease.mockRejectedValueOnce(new Error('connection reset'));
    await expect(recoverDocumentReleaseAction(input)).resolves.toEqual({
      status: 'error',
      error:
        'The recovery result is uncertain. Retry the exact request or refresh release history.',
      retryExact: true,
    });
  });
});

function rollbackRequest(): Extract<ReleaseRecoveryRequest, { action: 'rollback' }> {
  return {
    action: 'rollback',
    targetPublicationId: 'pub.release:prior',
    reason: 'Restore the previous stable release',
    expectedGeneration: 2,
    expectedActivePublicationId: 'pub.release:current',
    idempotencyKey: 'dashboard.rollback.request:stable',
    correlationId: 'dashboard.rollback.correlation:stable',
  };
}

function recoveryState(): ReleaseRecoveryStateResponse {
  return {
    workspaceId: 'wk.dashboard:opaque',
    environmentId: ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      workspaceId: 'wk.dashboard:opaque',
      environmentId: ENVIRONMENT_ID,
      documentId: DOCUMENT_ID,
      state: 'active',
      generation: 2,
      activePublicationId: 'pub.release:current',
      pendingReleaseOperationId: null,
      updatedAt: '2026-08-09T12:02:00.000Z',
    },
    history: [],
    rollbackTargetPublicationIds: ['pub.release:prior'],
  };
}

function artifactPins() {
  return {
    compiledArtifactId: 'artifact.release:prior',
    artifactSchemaVersion: '2',
    contentHash: `sha256-${'a'.repeat(64)}`,
    compilerVersion: '0.3.0',
    rendererContractVersion: '2',
    themeContractVersion: '1',
    themeVersionId: 'themev.release:prior',
    themeContentHash: `sha256-${'b'.repeat(64)}`,
  } as const;
}
