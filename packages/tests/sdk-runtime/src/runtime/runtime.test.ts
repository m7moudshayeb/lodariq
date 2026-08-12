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

  it('sanitizes legacy event properties without changing the compatibility envelope', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_local_dev',
      environment: 'development',
      ingestUrl: '/events',
    });

    runtime.track('tour_started', {
      documentId: 'doc_1',
      workspaceId: 'wk_spoofed',
      environmentId: 'env_spoofed',
      url: 'https://customer.example/private?token=secret',
      note: 'See https://customer.example/private owner@example.com Bearer live.jwt lod_staging_secret',
    });
    runtime.flush();

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ props?: Record<string, unknown> }>;
    };
    expect(body.events[0]?.props).toEqual({
      documentId: 'doc_1',
      note: 'See <redacted-url> <email> Bearer <redacted> lod_<redacted>',
    });
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('customer.example');
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('owner@example.com');
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('live.jwt');
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('lod_staging_secret');
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('wk_spoofed');
  });

  it('emits vendor-neutral observability events for tracks and SDK errors', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const observability = { emit: vi.fn() };
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_live',
      environment: 'staging',
      correlationId: 'corr_publish_1',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
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
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      authorizationToken: 'lod_staging_token',
    });

    runtime.track('tour_started');
    runtime.flush(true);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.lodariq.io/v1/sdk/events',
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

  it('uses the public installation header and skips sendBeacon for permanent installs', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const sendBeacon = vi.fn<(url: string, data?: string) => boolean>(() => true);
    vi.stubGlobal('fetch', fetch);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_public_runtime',
      environment: 'production',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      publicInstallationId: 'ins_pub_application_1234',
    });

    runtime.track('tour_started');
    runtime.flush(true);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.lodariq.io/v1/sdk/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-lodariq-installation-id': 'ins_pub_application_1234',
        }),
        keepalive: true,
      }),
    );
    expect(sendBeacon).not.toHaveBeenCalled();
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
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      authorizationToken: 'lod_staging_public_token',
    });

    runtime.reportError(
      new Error(
        'Fetch failed for https://api.lodariq.io/v1/sdk/current-document?token=lod_staging_secret and owner@example.com',
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
    expect(message).toContain('<redacted-url>');
    expect(message).not.toContain('api.lodariq.io');
    expect(message).not.toContain('lod_staging_secret');
    expect(message).not.toContain('owner@example.com');
  });

  it('asserts the active document pointer without accepting client-owned identity', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_server_owned',
      environment: 'production',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      publicInstallationId: 'ins_pub_application_1234',
      analyticsPointers: [
        {
          documentId: 'doc_welcome',
          generation: 4,
          publicationId: 'pub_welcome_4',
          contentHash: `sha256-${'a'.repeat(64)}`,
        },
      ],
    });

    runtime.track('tour_started', {
      documentId: 'doc_welcome',
      workspaceId: 'wk_spoofed',
      environmentId: 'env_spoofed',
      callback: 'https://customer.example/private/account?token=secret',
      nested: { publicationId: 'pub_spoofed', safe: 'kept' },
    });
    runtime.flush();

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events[0]).toMatchObject({
      name: 'tour_started',
      documentId: 'doc_welcome',
      pointer: {
        generation: 4,
        publicationId: 'pub_welcome_4',
        contentHash: `sha256-${'a'.repeat(64)}`,
      },
      props: {
        callback: '<redacted-url>',
        nested: { safe: 'kept' },
      },
    });
    expect(body.events[0]).not.toHaveProperty('workspaceId');
    expect(body.events[0]).not.toHaveProperty('environmentId');
    expect(body.events[0]?.['props']).not.toHaveProperty('workspaceId');
  });

  it('uses the first server-issued pointer for a generic event in a multi-document install', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const firstPointer = {
      documentId: 'doc_default',
      generation: 4,
      publicationId: 'pub_default_4',
      contentHash: `sha256-${'d'.repeat(64)}`,
    };
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_multi_document',
      environment: 'production',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      publicInstallationId: 'ins_pub_application_1234',
      analyticsPointers: [
        firstPointer,
        {
          documentId: 'doc_secondary',
          generation: 2,
          publicationId: 'pub_secondary_2',
          contentHash: `sha256-${'e'.repeat(64)}`,
        },
      ],
    });

    runtime.track('sdk_loaded');
    runtime.flush();

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events[0]).toMatchObject({
      name: 'sdk_loaded',
      documentId: firstPointer.documentId,
      pointer: {
        generation: firstPointer.generation,
        publicationId: firstPointer.publicationId,
        contentHash: firstPointer.contentHash,
      },
    });
  });

  it('keeps the newest pointer assertion across stale updates and rollback content reuse', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const originalContentHash = `sha256-${'b'.repeat(64)}`;
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_server_owned',
      environment: 'staging',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
      authorizationToken: 'lod_staging_public_token',
      analyticsPointers: [
        {
          documentId: 'doc_welcome',
          generation: 8,
          publicationId: 'pub_current',
          contentHash: `sha256-${'c'.repeat(64)}`,
        },
      ],
    });

    runtime.registerAnalyticsPointer({
      documentId: 'doc_welcome',
      generation: 7,
      publicationId: 'pub_late_stale',
      contentHash: originalContentHash,
    });
    runtime.track('tour_started', { documentId: 'doc_welcome' });

    runtime.registerAnalyticsPointer({
      documentId: 'doc_welcome',
      generation: 9,
      publicationId: 'pub_rollback',
      contentHash: originalContentHash,
    });
    runtime.track('tour_completed', { documentId: 'doc_welcome' });
    runtime.flush();

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{
        pointer: { generation: number; publicationId: string; contentHash: string };
      }>;
    };
    expect(body.events.map((event) => event.pointer)).toEqual([
      {
        generation: 8,
        publicationId: 'pub_current',
        contentHash: `sha256-${'c'.repeat(64)}`,
      },
      {
        generation: 9,
        publicationId: 'pub_rollback',
        contentHash: originalContentHash,
      },
    ]);
  });
});
