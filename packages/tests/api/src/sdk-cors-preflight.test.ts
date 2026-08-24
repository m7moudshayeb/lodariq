import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

/**
 * Every cross-origin route needs a preflight, and the lists that answer them
 * were hand-maintained beside the routes they cover. That is a list that goes
 * stale silently: a browser gets an unmatched OPTIONS, no
 * `access-control-allow-origin`, and the fetch is blocked — while every
 * server-side test still passes, because tests never issue a preflight.
 *
 * So this reads the router rather than a list. A new route under either
 * cross-origin prefix fails here until its preflight exists.
 */
const CROSS_ORIGIN_PREFIXES = ['/v1/sdk/', '/v1/authoring/'] as const;

/**
 * Routes a browser reaches without ever asking permission first. A plain GET
 * with no custom header is a CORS *simple request*, so it is never preflighted
 * — it just needs `access-control-allow-origin` on the response, which this one
 * sets. Every other cross-origin route defaults to needing a preflight, so a
 * new route is a failure here until someone decides which of the two it is.
 */
const SIMPLE_REQUEST_ROUTES: ReadonlySet<string> = new Set([
  '/v1/sdk/installations/:installationId/eligibility',
  // Immutable binary served to an <img>/<video> src with `allow-origin: *`.
  '/v1/sdk/media-assets/:assetId',
]);

describe('cross-origin preflight coverage', () => {
  it('answers a preflight for every route a browser reaches cross-origin', async () => {
    const { app, routes } = await inspectedApp();
    const unanswered: string[] = [];
    for (const route of routes) {
      if (!CROSS_ORIGIN_PREFIXES.some((prefix) => route.startsWith(prefix))) continue;
      if (SIMPLE_REQUEST_ROUTES.has(route)) continue;
      // Routed for real rather than looked up by declared path: a wildcard
      // preflight answers for paths no route table lists literally.
      const response = await app.inject({
        method: 'OPTIONS',
        url: route.replace(/:[A-Za-z0-9_]+/gu, 'x'),
        headers: { origin: 'https://editor.lodariq.io' },
      });
      if (response.statusCode === 404) unanswered.push(route);
    }
    expect(unanswered.sort(), `${unanswered.length} route(s) have no preflight`).toEqual([]);
    await app.close();
  });

  it('returns a usable preflight to the editor for an operations route', async () => {
    const { app } = await inspectedApp();
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/sdk/authoring/operations/demo-links/demo_1',
      headers: { origin: 'https://app.customer.example' },
    });
    expect(response.statusCode, response.body).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.customer.example');
    // The wildcard answers for a path no preflight list ever named.
    expect(response.headers['access-control-allow-methods']).toContain('DELETE');
    await app.close();
  });

  it('advertises only the verbs the path actually serves', async () => {
    const { app } = await inspectedApp();
    // Read-only: a preflight used to answer that DELETE was fine here too.
    const readOnly = await app.inject({
      method: 'OPTIONS',
      url: '/v1/sdk/authoring/operations/commercial-usage',
      headers: { origin: 'https://attacker.example' },
    });
    expect(readOnly.statusCode).toBe(204);
    const methods = String(readOnly.headers['access-control-allow-methods']).split(',');
    expect(methods).toContain('GET');
    expect(methods).not.toContain('DELETE');
    expect(methods).not.toContain('PUT');
    await app.close();
  });
});

/** Routes are registered inside deferred plugins, so the hook must precede ready(). */
async function inspectedApp(): Promise<{
  app: ReturnType<typeof createApiApp>;
  routes: string[];
}> {
  const app = createApiApp({
    repository: createInMemoryControlPlaneRepository({}),
    publicApiBaseUrl: 'https://api.lodariq.io',
  });
  const routes = new Set<string>();
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.every((method) => method === 'OPTIONS' || method === 'HEAD')) return;
    routes.add(route.url);
  });
  await app.ready();
  return { app, routes: [...routes] };
}

/**
 * Work nothing will act on. The warehouse half of this lives in
 * `analytics-warehouse.test.ts`, where the fixture is entitled to the feature —
 * here it answers 403 first, which is the right order: an unauthorized caller
 * should not learn what this deployment has configured.
 *
 * Billing already answers 503 when its provider is absent. Residency and the
 * warehouse accepted the request, returned 201 and a row marked pending, and
 * left the admin watching something no worker was ever going to advance —
 * because no provider is constructed for either.
 */
describe('refusing work with no executor', () => {
  it('refuses a residency migration when nothing can run it', async () => {
    const { app } = await inspectedApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/governance/data-residency/migrations',
      headers: {
        'x-lodariq-workspace-id': 'wk_probe',
        'x-lodariq-user-id': 'user_probe',
        'idempotency-key': 'residency-probe-key-01',
      },
      payload: { targetRegion: 'eu', expectedPlacementGeneration: 1 },
    });
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json()).toMatchObject({ error: 'residency_executor_unavailable' });
    await app.close();
  });

});
