import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createPublicSdkInstallationAction,
  setPublicSdkInstallationSuspensionAction,
} from '../../../../apps/dashboard/src/app/actions';
import { initialSdkInstallationActionState } from '../../../../apps/dashboard/src/app/sdk-installation-action-state';

// The thin wrapper around next/cache exists so tests can stand in for it:
// revalidatePath needs a Next request context these actions do not have here.
vi.mock('../../../../apps/dashboard/src/lib/revalidation', () => ({
  revalidatePath: () => undefined,
}));

/**
 * The dashboard half of the kill switch (ADR-0027).
 *
 * The control only earns its place if an admin can reach it and reverse it, so
 * these tests drive the real server action against a real API rather than
 * asserting on rendered markup.
 */

const dashboardSrc = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/dashboard/src',
);
const envKeys = ['LODARIQ_API_BASE_URL', 'LODARIQ_WORKSPACE_ID', 'LODARIQ_DASHBOARD_USER_ID'];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

describe('SDK kill switch server action', () => {
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

  it('pauses and resumes an installation, preserving its origins and snippet', async () => {
    app = createApiApp({
      defaultWorkspaceId: 'wk_dashboard',
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    vi.stubGlobal('fetch', createDashboardFetch(app));
    process.env.LODARIQ_API_BASE_URL = 'http://api.lodariq.test';
    process.env.LODARIQ_WORKSPACE_ID = 'wk_dashboard';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user_dashboard';

    const createForm = new FormData();
    createForm.set('name', 'Kill switch');
    const created = await createPublicSdkInstallationAction(
      initialSdkInstallationActionState,
      createForm,
    );
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('installation was not created');
    const installationId = created.installation.installationId;
    expect(created.installation.suspendedAt).toBeNull();

    const paused = await setPublicSdkInstallationSuspensionAction(
      initialSdkInstallationActionState,
      suspensionForm(installationId, true),
    );
    expect(paused.status).toBe('success');
    if (paused.status !== 'success') throw new Error('installation was not paused');
    expect(paused.installation.suspendedAt).toBeTruthy();
    // Pausing must not look like revoking: the identity, its origins, and the
    // snippet already pasted into the customer's page all survive untouched.
    expect(paused.installation.revokedAt).toBeNull();
    expect(paused.installation.sdkSnippet).toBe(created.installation.sdkSnippet);
    expect(paused.installation.origins).toEqual(created.installation.origins);

    const resumed = await setPublicSdkInstallationSuspensionAction(
      initialSdkInstallationActionState,
      suspensionForm(installationId, false),
    );
    expect(resumed.status).toBe('success');
    if (resumed.status !== 'success') throw new Error('installation was not resumed');
    expect(resumed.installation.suspendedAt).toBeNull();
  }, 20_000);

  it('reports a clear error for an installation that does not exist', async () => {
    app = createApiApp({ defaultWorkspaceId: 'wk_dashboard' });
    vi.stubGlobal('fetch', createDashboardFetch(app));
    process.env.LODARIQ_API_BASE_URL = 'http://api.lodariq.test';
    process.env.LODARIQ_WORKSPACE_ID = 'wk_dashboard';
    process.env.LODARIQ_DASHBOARD_USER_ID = 'user_dashboard';

    const result = await setPublicSdkInstallationSuspensionAction(
      initialSdkInstallationActionState,
      suspensionForm('ins_pub_does_not_exist_at_all', true),
    );

    expect(result.status).toBe('error');
  }, 20_000);

  it('rejects a request with no installation', async () => {
    const result = await setPublicSdkInstallationSuspensionAction(
      initialSdkInstallationActionState,
      new FormData(),
    );

    expect(result.status).toBe('error');
  });
});

describe('SDK kill switch control', () => {
  it('sits in the primary action row, not behind Advanced', () => {
    const panel = readFileSync(resolve(dashboardSrc, 'components/sdk-snippet-panel.tsx'), 'utf8');
    const suspensionForm = panel.indexOf('action={suspensionAction}');
    const advanced = panel.indexOf('COPY.advanced');

    expect(suspensionForm).toBeGreaterThan(-1);
    // Someone reaches for this while their page is misbehaving. A control you
    // have to go looking for is not one you can rely on in that moment.
    expect(suspensionForm).toBeLessThan(advanced);
  });

  it('submits the intended state rather than a toggle', () => {
    const panel = readFileSync(resolve(dashboardSrc, 'components/sdk-snippet-panel.tsx'), 'utf8');

    // Idempotent by construction: two clicks racing on a slow connection settle
    // on what the user asked for, not on whatever they toggled past.
    expect(panel).toContain(`value={selectedInstallation.suspendedAt ? 'false' : 'true'}`);
  });

  it('surfaces the paused state in the panel badge', () => {
    const panel = readFileSync(resolve(dashboardSrc, 'components/sdk-snippet-panel.tsx'), 'utf8');

    expect(panel).toContain('COPY.pausedNotice');
    expect(panel).toContain('installationBadgeVariant');
    expect(panel).toContain('COPY.paused');
  });
});

function suspensionForm(installationId: string, suspended: boolean): FormData {
  const formData = new FormData();
  formData.set('installationId', installationId);
  formData.set('suspended', suspended ? 'true' : 'false');
  return formData;
}

function createDashboardFetch(app: ReturnType<typeof createApiApp>): typeof fetch {
  type InjectResponse = {
    body: string;
    statusCode: number;
    headers: Record<string, string | string[] | number | undefined>;
  };
  // Called as a method, not a detached reference: Fastify's inject needs its
  // own `this` to reach the boot state.
  const inject = (options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    payload?: string;
  }): Promise<InjectResponse> =>
    (app.inject as unknown as (o: typeof options) => Promise<InjectResponse>).call(app, options);

  return async (input, init) => {
    const requestUrl = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url,
    );
    const response = await inject({
      method: init?.method ?? 'GET',
      url: `${requestUrl.pathname}${requestUrl.search}`,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      payload: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: toFetchHeaders(response.headers),
    });
  };
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
