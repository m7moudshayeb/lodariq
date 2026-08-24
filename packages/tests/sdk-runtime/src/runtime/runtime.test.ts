// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
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

  it('sends the anonymous assignment key beside the batch, never inside an event', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const assignmentKey = `lqv_${'7'.repeat(32)}`;
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_experiment',
      environment: 'production',
      ingestUrl: '/events',
      publicInstallationId: 'ins_pub_experiment_123456',
      assignmentKey,
    });

    runtime.track('tour_started', { documentId: 'doc_1' });
    runtime.flush();

    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      assignmentKey: string;
      events: Array<Record<string, unknown>>;
    };
    expect(body.assignmentKey).toBe(assignmentKey);
    expect(JSON.stringify(body.events)).not.toContain(assignmentKey);
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

  it('carries the engagement key on terminal events but not on step-level ones', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('crypto', webcrypto);
    const pointer = {
      documentId: 'doc_terminal',
      generation: 1,
      publicationId: 'pub_terminal',
      contentHash: `sha256-${'a'.repeat(64)}`,
    };
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_terminal',
      environment: 'production',
      ingestUrl: '/events',
      analyticsPointers: [pointer],
    });
    runtime.identify({ userId: 'user_terminal' });

    // ADR 0030: without a key on the terminal events, "did they finish it"
    // cannot be answered from the stream at all.
    const carries = ['tour_completed', 'tour_skipped', 'tour_dismissed', 'survey_submitted'];
    // Neither of these ends an experience, though both end in a terminal word.
    const omits = ['tour_step_changed', 'checklist_item_completed', 'tour_adaptive_step_skipped'];
    for (const name of [...carries, ...omits]) {
      runtime.track(name, { documentId: pointer.documentId });
    }
    runtime.flush();

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const sent = fetch.mock.calls
      .flatMap(
        (call) =>
          (JSON.parse(call[1]?.body as string) as {
            events: Array<{ name: string; engagementKey?: string }>;
          }).events,
      )
      .reduce<Record<string, string | undefined>>((accumulator, event) => {
        accumulator[event.name] = event.engagementKey;
        return accumulator;
      }, {});

    for (const name of carries) expect(sent[name]).toMatch(/^eng_[0-9a-f]{64}$/u);
    for (const name of omits) expect(sent[name]).toBeUndefined();
  });

  it('waits for a stable workspace-scoped engagement key before flushing shown events', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('crypto', webcrypto);
    const pointer = {
      documentId: 'doc_engagement',
      generation: 3,
      publicationId: 'pub_engagement',
      contentHash: `sha256-${'e'.repeat(64)}`,
    };

    for (const [workspaceId, userId] of [
      ['wk_engagement', 'user_one'],
      ['wk_engagement', 'user_one'],
      ['wk_engagement', 'user_two'],
      ['wk_other', 'user_one'],
    ] as const) {
      const runtime = new LodariqRuntime({
        workspaceId,
        environment: 'production',
        ingestUrl: '/events',
        analyticsPointers: [pointer],
      });
      runtime.identify({ userId });
      runtime.track('experience_shown', { documentId: pointer.documentId });
      runtime.flush();
    }

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const bodies = fetch.mock.calls.map(
      (call) =>
        JSON.parse(call[1]?.body as string) as { events: Array<{ engagementKey?: string }> },
    );
    const keys = bodies.map((body) => body.events[0]?.engagementKey);
    expect(keys[0]).toMatch(/^eng_[a-f0-9]{64}$/u);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    expect(JSON.stringify(bodies)).not.toContain('user_one');
  });

  it('preserves a pending engagement key on a page-exit beacon flush', async () => {
    const fetch = vi.fn();
    const sendBeacon = vi.fn<(url: string, data?: string) => boolean>(() => true);
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('crypto', webcrypto);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_exit_engagement',
      environment: 'production',
      ingestUrl: '/events',
      analyticsPointers: [
        {
          documentId: 'doc_exit_engagement',
          generation: 1,
          publicationId: 'pub_exit_engagement',
          contentHash: `sha256-${'f'.repeat(64)}`,
        },
      ],
    });

    runtime.identify({ userId: 'user_exit' });
    runtime.track('experience_shown', { documentId: 'doc_exit_engagement' });
    runtime.flush(true);

    await vi.waitFor(() => expect(sendBeacon).toHaveBeenCalledOnce());
    const payload = JSON.parse(sendBeacon.mock.calls[0]?.[1] ?? '') as {
      events: Array<{ engagementKey?: string }>;
    };
    expect(payload.events[0]?.engagementKey).toMatch(/^eng_[a-f0-9]{64}$/u);
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

describe('per-visitor experience progress and resume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  const runtime = (): LodariqRuntime =>
    new LodariqRuntime({ workspaceId: 'wk_progress', environment: 'development' });

  const tour = {
    documentId: 'doc_tour_welcome',
    type: 'tour',
    contentHash: 'sha256-progress',
    schemaVersion: '1.0.0',
    compilerVersion: '0.1.0',
    targets: [],
    steps: [{ id: 'step_2', body: [] }],
  } as unknown as Parameters<LodariqRuntime['writeTourResume']>[1];

  it('gives no answer for a visitor who was never identified', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const player = runtime();
    player.recordExperienceOutcome('doc_tour_welcome', 'completed');

    await expect(player.experienceOutcome('doc_tour_welcome')).resolves.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('remembers completion for the identified person, not the device', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const first = runtime();
    first.identify({ userId: 'user_done' });
    first.recordExperienceOutcome('doc_tour_welcome', 'completed');
    await expect(first.experienceOutcome('doc_tour_welcome')).resolves.toMatchObject({
      documentId: 'doc_tour_welcome',
      outcome: 'completed',
    });

    // Same browser, different person: the record is not theirs.
    const second = runtime();
    second.identify({ userId: 'user_new' });
    await expect(second.experienceOutcome('doc_tour_welcome')).resolves.toBeNull();
  });

  it('accepts a replacement store without touching its callers', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const written: Array<{ subject: string; documentId: string }> = [];
    const player = new LodariqRuntime({
      workspaceId: 'wk_progress',
      environment: 'development',
      experienceProgressStore: {
        read: async (_subject, documentId) => ({ documentId, outcome: 'skipped', at: 1 }),
        write: async (subject, record) => {
          written.push({ subject, documentId: record.documentId });
        },
      },
    });
    player.identify({ userId: 'user_remote' });
    player.recordExperienceOutcome('doc_tour_welcome', 'skipped');

    await expect(player.experienceOutcome('doc_tour_welcome')).resolves.toMatchObject({
      outcome: 'skipped',
    });
    await vi.waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]?.subject).toMatch(/^eng_[a-f0-9]{64}$/u);
  });

  it('keeps a stored position that belongs to a non-default document', () => {
    const player = runtime();
    const secondary = { documentId: 'doc_tour_billing', currentVersion: 'v2' };
    player.writeTourResume(secondary, { ...tour, documentId: 'doc_tour_billing' }, {
      id: 'step_2',
    } as Parameters<LodariqRuntime['writeTourResume']>[2]);

    const defaultManifest = { documentId: 'doc_tour_welcome', currentVersion: 'v1' };
    expect(
      player.readTourResume(defaultManifest, (documentId) =>
        documentId === 'doc_tour_billing' ? secondary : undefined,
      ),
    ).toMatchObject({ documentId: 'doc_tour_billing', stepId: 'step_2' });

    // Without the resolver the record looks foreign next to the default
    // manifest, and the reader deletes it on the way past. That is the multi
    // document install losing its resume the moment the bootstrap reads it.
    expect(player.readTourResume(defaultManifest)).toBeNull();
    expect(
      player.readTourResume(defaultManifest, (documentId) =>
        documentId === 'doc_tour_billing' ? secondary : undefined,
      ),
    ).toBeNull();
  });
});
