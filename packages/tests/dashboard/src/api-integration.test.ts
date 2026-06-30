import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '@lodariq/api';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  createAuthoringLaunchAction,
  createEnvironmentTokenAction,
  loadDocumentDebugAction,
  revokeEnvironmentTokenAction,
} from '../../../../apps/dashboard/src/app/actions';
import { initialDocumentDebugActionState } from '../../../../apps/dashboard/src/app/document-debug-action-state';
import { initialAuthoringLaunchActionState } from '../../../../apps/dashboard/src/app/authoring-launch-action-state';
import { initialTokenActionState } from '../../../../apps/dashboard/src/app/token-action-state';
import { initialTokenRevokeActionState } from '../../../../apps/dashboard/src/app/token-revoke-action-state';
import {
  buildDashboardApiHeaders,
  loadDashboardData,
} from '../../../../apps/dashboard/src/lib/api';

const baseDocument = tourFixture as LodariqDocument;
const envKeys = ['LODARIQ_API_BASE_URL', 'LODARIQ_WORKSPACE_ID', 'LODARIQ_DASHBOARD_USER_ID'];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

describe('@lodariq/dashboard API integration', () => {
  let app: ReturnType<typeof createApiApp> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.unstubAllGlobals();
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('renders API-backed documents and creates a copyable SDK snippet through the server action', async () => {
    app = createApiApp({
      defaultWorkspaceId: 'wk_dashboard',
      publicApiBaseUrl: 'https://api.lodariq.com',
      loaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-loader.js',
      creatorLoaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-creator.js',
    });
    const document = withWorkspace(baseDocument, 'wk_dashboard');

    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: dashboardHeaders(),
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);

    vi.stubGlobal('fetch', createDashboardFetch(app));
    process.env.LODARIQ_API_BASE_URL = 'http://api.lodariq.test';
    process.env.LODARIQ_WORKSPACE_ID = 'wk_dashboard';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user_dashboard';

    const dashboardData = await loadDashboardData();

    expect(dashboardData.documents).toHaveLength(1);
    expect(dashboardData.documents[0]).toMatchObject({
      id: document.id,
      workspaceId: 'wk_dashboard',
      title: document.title,
      createdByUserId: 'user_dashboard',
      updatedByUserId: 'user_dashboard',
      publications: [],
    });
    expect(dashboardData.documents[0]?.latestContentHash).toMatch(/^sha256-/);
    expect(dashboardData.environments.map((environment) => environment.kind)).toEqual([
      'development',
      'staging',
    ]);
    expect(dashboardData.tokens).toHaveLength(0);

    const formData = new FormData();
    formData.set('environmentId', 'env_staging');
    formData.set('name', 'Dashboard integration');
    const state = await createEnvironmentTokenAction(initialTokenActionState, formData);

    expect(state.status).toBe('success');
    expect(state.token).toMatchObject({
      workspaceId: 'wk_dashboard',
      environmentId: 'env_staging',
      environment: 'staging',
      name: 'Dashboard integration',
    });
    expect(state.sdkSnippet).toContain('<script type="module" async crossorigin="anonymous"');
    expect(state.sdkSnippet).toContain('data-lodariq-loader');
    expect(state.sdkSnippet).toContain('data-lodariq-environment="staging"');
    expect(state.sdkSnippet).toContain('data-lodariq-token="lod_staging_');
    expect(state.sdkSnippet).toContain('data-lodariq-api="https://api.lodariq.com"');
    const clientToken = state.sdkSnippet?.match(/data-lodariq-token="([^"]+)"/)?.[1];
    expect(clientToken).toMatch(/^lod_staging_/);

    const refreshedData = await loadDashboardData();
    expect(refreshedData.tokens).toHaveLength(1);
    expect(refreshedData.tokens[0]?.tokenPrefix).toBe(state.token?.tokenPrefix);
    expect(JSON.stringify(refreshedData)).not.toContain(clientToken);

    const revokeFormData = new FormData();
    revokeFormData.set('tokenId', state.token?.id ?? '');
    const revokeState = await revokeEnvironmentTokenAction(
      initialTokenRevokeActionState,
      revokeFormData,
    );
    if (revokeState.status !== 'success') {
      throw new Error('error' in revokeState ? revokeState.error : 'revoke action did not run');
    }
    expect(revokeState.token).toMatchObject({
      id: state.token?.id,
      revokedAt: expect.any(String),
    });
    expect(JSON.stringify(revokeState)).not.toContain(clientToken);

    const revokedData = await loadDashboardData();
    expect(revokedData.tokens[0]).toMatchObject({
      id: state.token?.id,
      revokedAt: expect.any(String),
    });

    const debugFormData = new FormData();
    debugFormData.set('documentId', document.id);
    const debugState = await loadDocumentDebugAction(
      initialDocumentDebugActionState,
      debugFormData,
    );

    expect(debugState.status).toBe('success');
    if (debugState.status !== 'success') throw new Error('debug action failed');
    expect(debugState.documentId).toBe(document.id);
    expect(debugState.canonicalJson).toContain(`"id": "${document.id}"`);
    expect(debugState.compiledJson).toContain('"contentHash": "sha256-');
    expect(debugState.latestContentHash).toMatch(/^sha256-/);
    expect(debugState.versionCount).toBe(1);
    expect(debugState.latestVersionLabel).toBe('v1');

    const launchFormData = new FormData();
    launchFormData.set('environmentId', 'env_staging');
    launchFormData.set('documentId', document.id);
    launchFormData.set('name', 'Dashboard creator launch');
    const launchState = await createAuthoringLaunchAction(
      initialAuthoringLaunchActionState,
      launchFormData,
    );

    expect(launchState.status).toBe('success');
    expect(launchState.authoringSession).toMatchObject({
      documentId: document.id,
      environment: 'staging',
    });
    expect(launchState.bootstrapHeaderName).toBe('x-lodariq-authoring-session');
    expect(launchState.sdkSnippet).toContain('data-lodariq-authoring-session="lod_authoring_');
    expect(launchState.sdkSnippet).toContain('data-lodariq-token="lod_staging_');
    expect(launchState.sdkSnippet).toContain(
      'src="https://cdn.lodariq.com/sdk/lodariq-creator.js"',
    );

    const publishedData = await loadDashboardData();
    expect(publishedData.documents[0]?.publications).toEqual([
      expect.objectContaining({
        environmentId: 'env_staging',
        environment: 'staging',
        contentHash: publishedData.documents[0]?.latestContentHash,
      }),
    ]);
  });

  it('forwards Clerk session credentials instead of trusting dev workspace headers', () => {
    const headers = buildDashboardApiHeaders(
      {
        apiBaseUrl: 'https://api.lodariq.com',
        devWorkspaceId: 'wk_dev_should_not_win',
        devUserId: 'user_dev_should_not_win',
        useDevHeaderFallback: true,
      },
      { authorization: 'Bearer session.jwt' },
    );

    expect(headers.get('authorization')).toBe('Bearer session.jwt');
    expect(headers.has('x-lodariq-workspace-id')).toBe(false);
    expect(headers.has('x-lodariq-user-id')).toBe(false);
  });

  it('redacts sensitive debug JSON before returning dashboard action state', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const requestUrl = new URL(
        typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
      );
      expect(requestUrl.pathname).toBe('/v1/debug/documents/doc_sensitive');

      return new Response(
        JSON.stringify({
          canonical: {
            id: 'doc_sensitive',
            title: 'Sensitive document',
            safeLabel: 'visible canonical value',
            props: {
              token: 'lod_staging_secret_token',
              nested: {
                authorization: 'Bearer live-secret',
                password: 'plaintext-password',
                label: 'visible nested value',
              },
            },
          },
          latestArtifact: {
            id: 'artifact_sensitive',
            workspaceId: 'wk_dashboard',
            documentId: 'doc_sensitive',
            documentVersionId: 'version_sensitive',
            contentHash: `sha256-${'a'.repeat(64)}`,
            compilerVersion: 'test',
            createdAt: '2026-06-30T00:00:00.000Z',
            compiled: {
              documentId: 'doc_sensitive',
              safeLabel: 'visible compiled value',
              steps: [
                {
                  id: 'step_sensitive',
                  sessionToken: 'lod_authoring_secret_session',
                  cookie: '__session=secret-cookie',
                  label: 'visible step value',
                },
              ],
            },
          },
          versions: [
            {
              id: 'version_sensitive',
              workspaceId: 'wk_dashboard',
              documentId: 'doc_sensitive',
              version: 1,
              canonical: {
                apiSecret: 'version-secret',
              },
              createdByUserId: 'user_dashboard',
              createdAt: '2026-06-30T00:00:00.000Z',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetch);
    process.env.LODARIQ_API_BASE_URL = 'http://api.lodariq.test';
    process.env.LODARIQ_WORKSPACE_ID = 'wk_dashboard';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user_dashboard';

    const formData = new FormData();
    formData.set('documentId', 'doc_sensitive');
    const state = await loadDocumentDebugAction(initialDocumentDebugActionState, formData);

    expect(fetch).toHaveBeenCalledOnce();
    expect(state.status).toBe('success');
    if (state.status !== 'success') throw new Error('debug action failed');
    expect(state.canonicalJson).toContain('"token": "<redacted>"');
    expect(state.canonicalJson).toContain('"authorization": "<redacted>"');
    expect(state.canonicalJson).toContain('"password": "<redacted>"');
    expect(state.canonicalJson).toContain('"safeLabel": "visible canonical value"');
    expect(state.canonicalJson).toContain('"label": "visible nested value"');
    expect(state.canonicalJson).not.toContain('lod_staging_secret_token');
    expect(state.canonicalJson).not.toContain('Bearer live-secret');
    expect(state.canonicalJson).not.toContain('plaintext-password');
    expect(state.compiledJson).toContain('"sessionToken": "<redacted>"');
    expect(state.compiledJson).toContain('"cookie": "<redacted>"');
    expect(state.compiledJson).toContain('"safeLabel": "visible compiled value"');
    expect(state.compiledJson).toContain('"label": "visible step value"');
    expect(state.compiledJson).not.toContain('lod_authoring_secret_session');
    expect(state.compiledJson).not.toContain('__session=secret-cookie');
  });

  it('uses dev workspace headers only when no Clerk session is available', () => {
    const headers = buildDashboardApiHeaders(
      {
        apiBaseUrl: 'http://api.lodariq.test',
        devWorkspaceId: 'wk_dashboard',
        devUserId: 'user_dashboard',
        useDevHeaderFallback: true,
      },
      {},
    );

    expect(headers.get('x-lodariq-workspace-id')).toBe('wk_dashboard');
    expect(headers.get('x-lodariq-user-id')).toBe('user_dashboard');
  });

  it('does not synthesize workspace headers when production auth is missing', () => {
    const headers = buildDashboardApiHeaders(
      {
        apiBaseUrl: 'https://api.lodariq.com',
        devWorkspaceId: 'wk_dev_should_not_win',
        devUserId: 'user_dev_should_not_win',
        useDevHeaderFallback: false,
      },
      {},
    );

    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('x-lodariq-workspace-id')).toBe(false);
    expect(headers.has('x-lodariq-user-id')).toBe(false);
  });

  it('can forward a Clerk __session cookie without exposing workspace headers', () => {
    const headers = buildDashboardApiHeaders(
      {
        apiBaseUrl: 'https://api.lodariq.com',
        devWorkspaceId: 'wk_dev_should_not_win',
        devUserId: 'user_dev_should_not_win',
        useDevHeaderFallback: true,
      },
      { sessionToken: 'session token' },
    );

    expect(headers.get('cookie')).toBe('__session=session%20token');
    expect(headers.has('x-lodariq-workspace-id')).toBe(false);
    expect(headers.has('x-lodariq-user-id')).toBe(false);
  });
});

function dashboardHeaders(): Record<string, string> {
  return {
    'x-lodariq-workspace-id': 'wk_dashboard',
    'x-lodariq-user-id': 'user_dashboard',
  };
}

function withWorkspace(document: LodariqDocument, workspaceId: string): LodariqDocument {
  return { ...structuredClone(document), workspaceId };
}

function createDashboardFetch(app: ReturnType<typeof createApiApp>): typeof fetch {
  type InjectResponse = {
    body: string;
    statusCode: number;
    headers: Record<string, string | string[] | number | undefined>;
  };
  const inject = app.inject as unknown as (options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    payload?: string;
  }) => Promise<InjectResponse>;

  return async (input, init) => {
    const requestUrl = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
    );
    const response = await inject({
      method: init?.method ?? 'GET',
      url: `${requestUrl.pathname}${requestUrl.search}`,
      headers: headersFrom(init?.headers),
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });

    return new Response(response.body, {
      status: response.statusCode,
      headers: toFetchHeaders(response.headers),
    });
  };
}

function headersFrom(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function toFetchHeaders(headers: Record<string, string | string[] | number | undefined>): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else {
      result.set(key, String(value));
    }
  }
  return result;
}
