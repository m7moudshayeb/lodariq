import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  DashboardApiError,
  loadDocumentReleaseRecoveryState,
  recoverDocumentRelease,
} from '../../../../apps/dashboard/src/lib/api';

const DOCUMENT_ID = 'doc.release:api';
const ENVIRONMENT_ID = 'env.production:api';
const API_BASE_URL = 'https://api.dashboard.test';
const originalEnvironment = {
  apiBaseUrl: process.env.LODARIQ_API_BASE_URL,
  workspaceId: process.env.LODARIQ_WORKSPACE_ID,
  userId: process.env.LODARIQ_DASHBOARD_USER_ID,
};

describe('@lodariq/dashboard release recovery API client', () => {
  beforeEach(() => {
    process.env.LODARIQ_API_BASE_URL = API_BASE_URL;
    process.env.LODARIQ_WORKSPACE_ID = 'wk.dashboard:api';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user.dashboard:api';
  });

  afterEach(() => {
    restoreEnvironment('LODARIQ_API_BASE_URL', originalEnvironment.apiBaseUrl);
    restoreEnvironment('LODARIQ_WORKSPACE_ID', originalEnvironment.workspaceId);
    restoreEnvironment('LODARIQ_DASHBOARD_USER_ID', originalEnvironment.userId);
    vi.unstubAllGlobals();
  });

  it('authenticates and validates the exact nested recovery read scope', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse(recoveryState()),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadDocumentReleaseRecoveryState({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
      }),
    ).resolves.toEqual(recoveryState());

    const [request, init] = fetch.mock.calls[0]!;
    expect(new URL(request.toString()).pathname).toBe(
      `/v1/documents/${encodeURIComponent(DOCUMENT_ID)}/environments/${encodeURIComponent(ENVIRONMENT_ID)}/release-recovery`,
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('x-lodariq-workspace-id')).toBe('wk.dashboard:api');
    expect(headers.get('x-lodariq-user-id')).toBe('user.dashboard:api');
    expect(init?.cache).toBe('no-store');
  });

  it('fails closed when a valid response carries a different nested workspace scope', async () => {
    const state = recoveryState();
    if (!state.deployment) throw new Error('recovery deployment fixture missing');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({
          ...state,
          deployment: { ...state.deployment, workspaceId: 'wk.cross-scope' },
        }),
      ),
    );

    await expect(
      loadDocumentReleaseRecoveryState({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
      }),
    ).rejects.toMatchObject({
      name: 'DashboardApiError',
      statusCode: 502,
      message: 'Invalid release recovery state response.',
    });
  });

  it('returns schema-owned non-2xx results without converting them to transport failures', async () => {
    const request = rollbackRequest();
    const failure = {
      ok: false,
      action: 'rollback',
      state: 'failed',
      replayed: false,
      code: 'deployment_changed',
      message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
      releaseOperationId: 'relop.release:failed',
      expectedGeneration: request.expectedGeneration,
      actualGeneration: 3,
      expectedActivePublicationId: request.expectedActivePublicationId,
      actualActivePublicationId: 'pub.release:changed',
    } as const;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(failure, 409));
    vi.stubGlobal('fetch', fetch);

    await expect(
      recoverDocumentRelease({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request,
      }),
    ).resolves.toEqual(failure);
    const [, init] = fetch.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it('rejects wrong-action or malformed gateway payloads instead of widening the contract', async () => {
    const request = rollbackRequest();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            action: 'unpublish',
            state: 'failed',
            replayed: false,
            code: 'internal_error',
            message: RELEASE_RECOVERY_FAILURE_MESSAGES.internal_error,
          },
          500,
        ),
      ),
    );

    await expect(
      recoverDocumentRelease({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request,
      }),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });

  it('rejects a schema-valid result carried by the wrong HTTP status', async () => {
    const request = rollbackRequest();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            action: 'rollback',
            state: 'failed',
            replayed: false,
            code: 'capability_denied',
            message: RELEASE_RECOVERY_FAILURE_MESSAGES.capability_denied,
          },
          409,
        ),
      ),
    );

    await expect(
      recoverDocumentRelease({
        documentId: DOCUMENT_ID,
        environmentId: ENVIRONMENT_ID,
        request,
      }),
    ).rejects.toMatchObject({ name: 'DashboardApiError', statusCode: 409 });
  });
});

function recoveryState(): ReleaseRecoveryStateResponse {
  const scope = {
    workspaceId: 'wk.dashboard:api',
    environmentId: ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
  };
  return {
    ...scope,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      ...scope,
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

function rollbackRequest(): Extract<ReleaseRecoveryRequest, { action: 'rollback' }> {
  return {
    action: 'rollback',
    targetPublicationId: 'pub.release:prior',
    reason: 'Restore the previous stable release',
    expectedGeneration: 2,
    expectedActivePublicationId: 'pub.release:current',
    idempotencyKey: 'dashboard.rollback.request:api',
    correlationId: 'dashboard.rollback.correlation:api',
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
