// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TalmehRuntime } from '@talmeh/sdk-runtime/runtime';

describe('Talmeh runtime analytics (PRD §16.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('batches tracked events and flushes them over HTTP', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new TalmehRuntime({
      workspaceId: 'wk_local_dev',
      environment: 'development',
      ingestUrl: '/events',
    });

    runtime.identify({ userId: 'user_1' });
    runtime.track('tour_started', { documentId: 'doc_1' });
    runtime.track('tour_completed');
    runtime.flush();

    expect(runtime.getTraits()).toEqual({ userId: 'user_1' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/events',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      workspaceId: string;
      events: Array<{ name: string; props?: Record<string, unknown> }>;
    };
    expect(body.workspaceId).toBe('wk_local_dev');
    expect(body.events.map((event) => event.name)).toEqual(['tour_started', 'tour_completed']);
    expect(body.events[0]?.props).toEqual({ documentId: 'doc_1' });

    runtime.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses sendBeacon for page-exit flushes', () => {
    const fetch = vi.fn();
    const sendBeacon = vi.fn<(url: string, data?: string) => boolean>(() => true);
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    const runtime = new TalmehRuntime({
      workspaceId: 'wk_local_dev',
      environment: 'development',
      ingestUrl: '/events',
    });

    runtime.track('page_left');
    runtime.flush(true);

    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url, payload] = sendBeacon.mock.calls[0]!;
    expect(url).toBe('/events');
    expect(JSON.parse(payload ?? '').events[0].name).toBe('page_left');
    expect(fetch).not.toHaveBeenCalled();
  });
});
