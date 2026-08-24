import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  COMMERCIAL_PLAN_VERSION,
  SdkEligibilityDigest,
  validate,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

/**
 * Page scoping and the kill switch (ADR-0027).
 *
 * The behaviour under test is what a customer's page pays when Lodariq has
 * nothing to show it, so the assertions are mostly about absence: no delivery
 * descriptor, no manifest, no artifact pointer.
 */

const CUSTOMER_ORIGIN = 'https://staging.customer.example';

const authHeaders = {
  'x-lodariq-workspace-id': 'wk_eligibility',
  'x-lodariq-user-id': 'user_eligibility',
};

const baseDocument = tourFixture as LodariqDocument;

describe('page-scoped SDK bootstrap', () => {
  it('reports delivery only on pages the document targets', async () => {
    const { app, installationId } = await setup({
      trigger: { type: 'urlMatch', config: { pattern: '/settings', mode: 'prefix' } },
    });

    const onTarget = await bootstrap(app, installationId, `${CUSTOMER_ORIGIN}/settings/billing`);
    expect(onTarget.delivery.state).toBe('available');

    const elsewhere = await bootstrap(app, installationId, `${CUSTOMER_ORIGIN}/dashboard`);
    // The whole point: a page with nothing on it gets nothing to load.
    expect(elsewhere.delivery).toEqual({ state: 'unavailable' });
    expect(JSON.stringify(elsewhere)).not.toContain('artifact');

    await app.close();
  });

  it('keeps every page eligible for a manually triggered document', async () => {
    // A manual document is played by the customer's own code through
    // playTourById, so no URL can rule it out and none is allowed to try.
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });

    const anywhere = await bootstrap(app, installationId, `${CUSTOMER_ORIGIN}/literally/anywhere`);
    expect(anywhere.delivery.state).toBe('available');

    await app.close();
  });

  it('falls open to the full active set when page intent is missing or foreign', async () => {
    const { app, installationId } = await setup({
      trigger: { type: 'urlMatch', config: { pattern: '/settings', mode: 'prefix' } },
    });

    // No href at all: the server cannot know where the visitor is, so it must
    // not guess them out of a live experience.
    const noIntent = await bootstrap(app, installationId, undefined);
    expect(noIntent.delivery.state).toBe('available');

    await app.close();
  });
});

describe('SDK eligibility digest', () => {
  it('narrows to patterns, and is cacheable', async () => {
    const { app, installationId } = await setup({
      trigger: { type: 'urlMatch', config: { pattern: '/settings', mode: 'prefix' } },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN },
    });

    expect(response.statusCode).toBe(200);
    const digest = response.json();
    expect(validate(SdkEligibilityDigest, digest).valid).toBe(true);
    expect(digest).toMatchObject({
      enabled: true,
      scope: { kind: 'patterns', patterns: [{ pattern: '/settings', mode: 'prefix' }] },
    });
    // Cacheable is the entire reason this route exists rather than reusing the
    // bootstrap POST.
    expect(response.headers['cache-control']).toContain('public');
    expect(response.headers['cache-control']).toContain('max-age=300');
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(response.headers['etag']).toBeTruthy();
    expect(response.headers['vary']).toBe('Origin');

    await app.close();
  });

  it('widens to every page as soon as one document can fire anywhere', async () => {
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN },
    });

    expect(response.json().scope).toEqual({ kind: 'all' });
    await app.close();
  }, 15_000);

  it('reports no scope when nothing is published', async () => {
    const { app, installationId } = await setup({ publish: false });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN },
    });

    expect(response.json()).toMatchObject({ enabled: true, scope: { kind: 'none' } });
    await app.close();
  });

  it('refuses an origin the installation is not configured for', async () => {
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: 'https://attacker.example' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('revalidates with a matching ETag', async () => {
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });
    const first = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN },
    });
    const second = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN, 'if-none-match': String(first.headers['etag']) },
    });

    expect(second.statusCode).toBe(304);
    await app.close();
  });
});

describe('SDK kill switch', () => {
  it('stops delivery in both the digest and the bootstrap, and is reversible', async () => {
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });

    const suspend = await app.inject({
      method: 'POST',
      url: `/v1/sdk-installations/${installationId}/suspension`,
      headers: authHeaders,
      payload: { suspended: true },
    });
    expect(suspend.statusCode).toBe(200);
    expect(suspend.json().installation.suspendedAt).toBeTruthy();

    const digest = await app.inject({
      method: 'GET',
      url: `/v1/sdk/installations/${installationId}/eligibility`,
      headers: { origin: CUSTOMER_ORIGIN },
    });
    expect(digest.json()).toMatchObject({ enabled: false, scope: { kind: 'none' } });

    // A visitor holding a digest cached from before the pause must still be
    // refused by the authoritative path.
    const context = await bootstrap(app, installationId, `${CUSTOMER_ORIGIN}/anywhere`);
    expect(context.delivery).toEqual({ state: 'unavailable' });

    const resume = await app.inject({
      method: 'POST',
      url: `/v1/sdk-installations/${installationId}/suspension`,
      headers: authHeaders,
      payload: { suspended: false },
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().installation.suspendedAt).toBeNull();

    const resumed = await bootstrap(app, installationId, `${CUSTOMER_ORIGIN}/anywhere`);
    expect(resumed.delivery.state).toBe('available');

    await app.close();
  });

  it('requires an admin', async () => {
    const { app, installationId } = await setup({ trigger: { type: 'manual' } });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/sdk-installations/${installationId}/suspension`,
      headers: { ...authHeaders, 'x-lodariq-user-id': 'user_eligibility_member' },
      payload: { suspended: true },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

interface SetupOptions {
  trigger?: LodariqDocument['trigger'];
  publish?: boolean;
}

async function setup(
  options: SetupOptions = {},
): Promise<{ app: ReturnType<typeof createApiApp>; installationId: string }> {
  const repository = createRepository({ environments: [stagingEnvironment()] });
  const app = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.io' });

  if (options.publish !== false) {
    const document: LodariqDocument = {
      ...structuredClone(baseDocument),
      id: 'doc_eligibility',
      workspaceId: 'wk_eligibility',
      trigger: options.trigger ?? { type: 'manual' },
    };
    const saved = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(saved.statusCode).toBe(201);
    const artifact = saved.json<{ latestArtifact: { id: string; contentHash: string } | null }>()
      .latestArtifact;
    if (!artifact) throw new Error('eligibility fixture artifact missing');
    const published = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:eligibility:0',
        'x-lodariq-correlation-id': 'corr_eligibility_0',
      },
      payload: {
        environmentId: 'env_staging',
        expectedGeneration: 0,
        expectedArtifactId: artifact.id,
        expectedContentHash: artifact.contentHash,
      },
    });
    if (published.statusCode !== 201) throw new Error(published.body);
  }

  const created = await app.inject({
    method: 'POST',
    url: '/v1/sdk-installations',
    headers: authHeaders,
    payload: { name: 'Eligibility' },
  });
  expect(created.statusCode).toBe(201);
  const installationId = created.json<{ installation: { installationId: string } }>().installation
    .installationId;

  const mapped = await app.inject({
    method: 'PUT',
    url: `/v1/sdk-installations/${installationId}/origins`,
    headers: authHeaders,
    payload: {
      environmentId: 'env_staging',
      origin: CUSTOMER_ORIGIN,
      authoringEnabled: false,
    },
  });
  expect(mapped.statusCode).toBe(200);

  return { app, installationId };
}

async function bootstrap(
  app: ReturnType<typeof createApiApp>,
  installationId: string,
  href: string | undefined,
): Promise<{ delivery: { state: string } }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sdk/bootstrap',
    headers: { origin: CUSTOMER_ORIGIN },
    payload: href
      ? { installationId, href, origin: CUSTOMER_ORIGIN }
      : { installationId, origin: CUSTOMER_ORIGIN },
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function createRepository(seed: InMemoryControlPlaneSeed) {
  const now = '2026-08-07T00:00:00.000Z';
  return createInMemoryControlPlaneRepository({
    ...seed,
    workspaceSubscriptions: [
      {
        workspaceId: 'wk_eligibility',
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    workspaceMemberships: [
      {
        workspaceId: 'wk_eligibility',
        userId: 'user_eligibility',
        role: 'owner',
        createdAt: now,
      },
      {
        workspaceId: 'wk_eligibility',
        userId: 'user_eligibility_member',
        role: 'member',
        createdAt: now,
      },
    ],
  });
}

function stagingEnvironment(): WorkspaceEnvironment {
  return {
    id: 'env_staging',
    workspaceId: 'wk_eligibility',
    kind: 'staging',
    name: 'staging',
    originAllowlist: [CUSTOMER_ORIGIN],
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}
