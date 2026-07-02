// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LodariqRuntime } from '@lodariq/sdk-runtime/runtime';

describe('Lodariq runtime analytics (PRD §16.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('batches tracked events and flushes them over HTTP', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
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
      events: Array<{ name: string; props?: Record<string, unknown> }>;
    };
    expect(body.events.map((event) => event.name)).toEqual(['tour_started', 'tour_completed']);
    expect(body.events[0]?.props).toEqual({ documentId: 'doc_1' });

    runtime.flush();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('emits vendor-neutral observability events for tracks and SDK errors', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const observability = { emit: vi.fn() };
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_live',
      environment: 'staging',
      correlationId: 'corr_publish_1',
      ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      authorizationToken: 'lod_staging_public_token',
      observability,
    });

    runtime.track('tour_started', { documentId: 'doc_1' });
    runtime.reportError(new Error('Playback failed'), {
      phase: 'playback',
      documentId: 'doc_1',
      stepId: 'step_1',
    });

    expect(observability.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.tour_started',
        correlationId: 'corr_publish_1',
        documentId: 'doc_1',
        attributes: { documentId: 'doc_1' },
      }),
    );
    expect(observability.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runtime.sdk_error',
        correlationId: 'corr_publish_1',
        documentId: 'doc_1',
        stepId: 'step_1',
        attributes: expect.objectContaining({ phase: 'playback', errorName: 'Error' }),
      }),
    );
  });

  it('sends the environment token on authenticated SDK event flushes', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_live',
      environment: 'staging',
      correlationId: 'corr_publish_1',
      ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      authorizationToken: 'lod_staging_token',
    });

    runtime.track('tour_started');
    runtime.flush(true);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.lodariq.com/v1/sdk/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_token',
          'content-type': 'application/json',
        }),
        keepalive: true,
      }),
    );
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ correlationId?: string }>;
    };
    expect(body.events[0]?.correlationId).toBe('corr_publish_1');
  });

  it('uses sendBeacon for page-exit flushes', () => {
    const fetch = vi.fn();
    const sendBeacon = vi.fn<(url: string, data?: string) => boolean>(() => true);
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    const runtime = new LodariqRuntime({
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

  it('reports SDK errors with sanitized metadata through the event pipeline', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_live',
      environment: 'staging',
      ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      authorizationToken: 'lod_staging_public_token',
    });

    runtime.reportError(
      new Error(
        'Fetch failed for https://api.lodariq.com/v1/sdk/current-document?token=lod_staging_secret and owner@example.com',
      ),
      {
        phase: 'playback',
        documentId: 'doc_1',
        stepId: 'step_1',
        correlationId: 'corr_1',
      },
    );

    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{
        name: string;
        documentId?: string;
        stepId?: string;
        correlationId?: string;
        props?: Record<string, unknown>;
      }>;
    };
    expect(body.events[0]).toMatchObject({
      name: 'sdk_error',
      documentId: 'doc_1',
      stepId: 'step_1',
      correlationId: 'corr_1',
      props: {
        phase: 'playback',
        errorName: 'Error',
      },
    });
    const message = String(body.events[0]?.props?.['message']);
    expect(message).toContain('https://api.lodariq.com/v1/sdk/current-document');
    expect(message).not.toContain('lod_staging_secret');
    expect(message).not.toContain('owner@example.com');
  });
});
