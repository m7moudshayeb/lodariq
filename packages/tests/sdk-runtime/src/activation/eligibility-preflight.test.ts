import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPublicSdkEligibility } from '@lodariq/sdk-runtime/public-bootstrap';

/**
 * The browser half of the pre-flight (ADR-0027).
 *
 * Two properties matter and they pull in opposite directions: it must actually
 * stop pages that have nothing on them, and it must never stop a page that
 * might. Most of what follows tests the second one, because a pre-flight that
 * fails closed is worse than no pre-flight at all.
 */

const CONFIG = {
  installationId: 'ins_pub_eligibility_fixture_01',
  apiBaseUrl: 'https://api.lodariq.io',
};
const PAGE = { href: 'https://app.customer.example/dashboard', origin: 'https://app.customer.example' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDigest(body: unknown, init: { ok?: boolean } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: init.ok ?? true,
      json: async () => body,
    })),
  );
}

function digest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: '1',
    installationId: CONFIG.installationId,
    enabled: true,
    scope: { kind: 'all' },
    ...overrides,
  };
}

describe('public SDK eligibility pre-flight', () => {
  it('stops when nothing is published', async () => {
    stubDigest(digest({ scope: { kind: 'none' } }));
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('stop');
  });

  it('stops when no pattern matches the page', async () => {
    stubDigest(
      digest({ scope: { kind: 'patterns', patterns: [{ pattern: '/settings', mode: 'prefix' }] } }),
    );
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('stop');
  });

  it('proceeds when a pattern matches the page', async () => {
    stubDigest(
      digest({ scope: { kind: 'patterns', patterns: [{ pattern: '/dash', mode: 'prefix' }] } }),
    );
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('matches an origin-qualified pattern the same way the server does', async () => {
    stubDigest(
      digest({
        scope: {
          kind: 'patterns',
          patterns: [{ pattern: 'https://app.customer.example/dashboard', mode: 'exact' }],
        },
      }),
    );
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('reports the kill switch distinctly from having nothing to show', async () => {
    stubDigest(digest({ enabled: false, scope: { kind: 'none' } }));
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('disabled');
  });

  it('proceeds when the digest request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('proceeds on a non-OK response', async () => {
    stubDigest(digest({ scope: { kind: 'none' } }), { ok: false });
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('proceeds on a digest for a different installation', async () => {
    stubDigest(digest({ installationId: 'ins_pub_somebody_elses_install', scope: { kind: 'none' } }));
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('proceeds on a digest from a future schema version', async () => {
    // Forward compatibility: an older loader holding a newer cached digest must
    // fall back to the bootstrap, not guess at a shape it does not know.
    stubDigest(digest({ schemaVersion: '2', scope: { kind: 'none' } }));
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('proceeds on a malformed digest', async () => {
    stubDigest({ schemaVersion: '1', installationId: CONFIG.installationId, enabled: 'yes' });
    await expect(readPublicSdkEligibility(CONFIG, PAGE)).resolves.toBe('proceed');
  });

  it('proceeds when the page context is unusable', async () => {
    stubDigest(
      digest({ scope: { kind: 'patterns', patterns: [{ pattern: '/settings', mode: 'exact' }] } }),
    );
    await expect(readPublicSdkEligibility(CONFIG, { href: 'not a url' })).resolves.toBe('proceed');
  });

  it('asks the control plane over a cacheable GET', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => digest() }));
    vi.stubGlobal('fetch', fetchMock);

    await readPublicSdkEligibility(CONFIG, PAGE);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(
      `https://api.lodariq.io/v1/sdk/installations/${CONFIG.installationId}/eligibility`,
    );
    // No method override means GET, which is the only reason this is cacheable.
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('omit');
  });
});
