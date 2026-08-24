import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthoringOperationsClient } from '../../../../../packages/sdk-authoring/src/authoring/operations/operations-client';

const BASE = 'https://api.lodariq.io';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stub(
  handler: (url: string, init: RequestInit | undefined) => { status?: number; body?: unknown },
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      blob: async () => new Blob(['export']),
    } as Response;
  });
  const client = createAuthoringOperationsClient({
    baseUrl: BASE,
    authorization: () => 'Bearer session_token',
    authoringSession: () => 'session_token',
    fetch: fetchStub as unknown as typeof fetch,
  });
  return { client, calls };
}

describe('reaching Operations from the panel', () => {
  it('sends the session bearer and never a document id', async () => {
    const { client, calls } = stub(() => ({ body: { documentId: 'doc_1', adaptivePolicy: {} } }));
    await client.readMeasurement();
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/measurement`);
    expect((calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer session_token',
    );
    expect(calls[0]?.url).not.toContain('doc_1');
  });

  it('does not send the environment either — the session already names it', async () => {
    const { client, calls } = stub(() => ({ body: { funnel: [] } }));
    await client.readAnalytics('env_someone_else');
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/analytics`);
    expect(calls[0]?.url).not.toContain('env_someone_else');
  });

  it('reads the bearer at call time, so a rotated session is not stale', async () => {
    let token = 'Bearer first';
    const seen: string[] = [];
    const fetchStub = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)['authorization']!);
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    const client = createAuthoringOperationsClient({
      baseUrl: BASE,
      authorization: () => token,
      authoringSession: () => 'session_token',
      fetch: fetchStub as unknown as typeof fetch,
    });
    await client.readMeasurement();
    token = 'Bearer second';
    await client.readMeasurement();
    expect(seen).toEqual(['Bearer first', 'Bearer second']);
  });

  it('unwraps the envelope each route returns', async () => {
    const { client } = stub((url) => {
      if (url.endsWith('/comments')) return { body: { comments: [{ id: 'cmt_1' }] } };
      if (url.endsWith('/sessions')) return { body: { sessions: [{ correlationId: 'run_1' }] } };
      if (url.endsWith('/step-locks')) return { body: { locks: [{ stepId: 'step_1' }] } };
      if (url.endsWith('/applications')) return { body: { applications: [{ id: 'app' }] } };
      return { body: {} };
    });
    expect(await client.listComments()).toEqual([{ id: 'cmt_1' }]);
    expect(await client.listSessions?.()).toEqual([{ correlationId: 'run_1' }]);
    expect(await client.listStepLocks()).toEqual([{ stepId: 'step_1' }]);
    expect(await client.listApplications()).toEqual([{ id: 'app' }]);
  });

  it('binds lock ownership to the authenticated session and sends explicit takeover', async () => {
    const response = {
      lock: { stepId: 'step_1' },
      acquired: true,
      canTakeover: true,
    };
    const { client, calls } = stub((_url, init) => ({
      status: init?.method === 'DELETE' ? 204 : 200,
      body: response,
    }));
    await client.claimStepLock('step_1');
    await client.claimStepLock('step_2', true);
    await client.releaseStepLock?.('step_2');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ stepId: 'step_1' });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      stepId: 'step_2',
      takeover: true,
    });
    expect(calls[2]?.init?.method).toBe('DELETE');
    expect(JSON.parse(String(calls[2]?.init?.body))).toEqual({ stepId: 'step_2' });
  });

  it('sends semantic review anchors and replies to the thread route', async () => {
    const { client, calls } = stub(() => ({ body: { comment: { id: 'cmt_thread' } } }));
    await client.addComment(
      { type: 'target', stepId: 'block_step_1', targetId: 'target_new_project' },
      'Check this target.',
    );
    await client.replyToComment('cmt_thread', 'Confirmed.');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      anchor: { type: 'target', stepId: 'block_step_1', targetId: 'target_new_project' },
      body: 'Check this target.',
    });
    expect(calls[1]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/comments/cmt_thread/replies`);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ body: 'Confirmed.' });
  });

  it('sends a typed assist operation and returns only the bounded proposal', async () => {
    const proposal = {
      proposalId: 'proposal_1',
      summary: 'Clearer',
      edits: [{ path: 'block:copy_1/content', before: 'Before', after: 'After' }],
    };
    const { client, calls } = stub(() => ({
      body: { operationId: `aiop_${'a'.repeat(20)}`, proposal, replayed: false },
    }));
    await expect(
      client.requestAiAssist?.({
        kind: 'command',
        scope: 'step',
        prompt: 'Make this clearer',
        stepIds: ['step_1'],
      }),
    ).resolves.toEqual(proposal);
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/assist`);
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      operationId: string;
      request: { prompt: string };
    };
    expect(body.operationId).toMatch(/^aiop_[A-Za-z0-9_-]{20,}$/u);
    expect(body.request.prompt).toBe('Make this clearer');
  });

  it('validates immutable narration generation before returning it to the editor', async () => {
    const result = {
      operationId: `ttsop_${'a'.repeat(20)}`,
      replayed: false,
      audio: {
        assetId: 'asset_narration',
        contentHash: `sha256-${'1'.repeat(64)}`,
        sourceHash: `sha256-${'2'.repeat(64)}`,
        contentType: 'audio/wav',
        durationMs: 1_000,
        cues: [{ text: 'Welcome.', startMs: 0, durationMs: 1_000 }],
      },
      asset: {
        id: 'asset_narration',
        kind: 'audio',
        filename: 'narration.wav',
        contentType: 'audio/wav',
        byteLength: 12,
        contentHash: `sha256-${'1'.repeat(64)}`,
        createdAt: '2026-08-21T00:00:00.000Z',
        downloadPath: '/v1/authoring/media-assets/asset_narration',
      },
    };
    const { client, calls } = stub(() => ({ body: result }));

    await expect(client.generateNarration?.('step_1')).resolves.toEqual(result);
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/narration`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ stepId: 'step_1' });
  });

  it('validates and unwraps the audit event list', async () => {
    const event = {
      id: `tenevt_${'a'.repeat(20)}`,
      workspaceId: 'wk_1',
      actorUserId: 'user_1',
      actorName: 'Ada Stone',
      eventType: 'workspace_deletion_cancelled',
      targetUserId: null,
      targetName: null,
      invitationId: null,
      previousRole: null,
      nextRole: null,
      occurredAt: '2026-08-21T10:00:00.000Z',
    };
    const { client, calls } = stub(() => ({ body: { events: [event] } }));

    await expect(client.listAuditEvents?.()).resolves.toEqual([event]);
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/audit-events`);
  });

  it('queues a release-scoped export and downloads only after completion', async () => {
    const release = {
      publicationId: 'pub_release',
      contentHash: `sha256-${'a'.repeat(64)}`,
      pointerGeneration: 3,
    };
    const job = {
      id: `anx_${'b'.repeat(20)}`,
      kind: 'raw-events-jsonl',
      status: 'completed',
      definitionVersion: 1,
      environmentId: 'env_staging',
      documentId: 'doc_1',
      release,
      retentionCutoff: '2026-01-01T00:00:00.000Z',
      attemptCount: 1,
      maxAttempts: 3,
      filename: 'lodariq-doc_1-generation-3.jsonl',
      byteLength: 10,
      contentHash: `sha256-${'c'.repeat(64)}`,
      createdAt: '2026-08-21T10:00:00.000Z',
      completedAt: '2026-08-21T10:00:01.000Z',
      resultExpiresAt: '2026-08-22T10:00:01.000Z',
    };
    const { client, calls } = stub((url) => ({ body: url.endsWith('/download') ? undefined : job }));
    const createObjectUrl = vi.fn(() => 'blob:export');
    const revokeObjectUrl = vi.fn();
    const NativeUrl = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeUrl {
        static override createObjectURL = createObjectUrl;
        static override revokeObjectURL = revokeObjectUrl;
      },
    );
    const click = vi.fn();
    vi.stubGlobal('document', {
      createElement: () => ({
        href: '',
        download: '',
        hidden: false,
        click,
        remove: vi.fn(),
      }),
      body: { appendChild: vi.fn() },
    });

    await client.exportAnalytics?.('raw-events-jsonl', release);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe(`${BASE}/v1/sdk/authoring/operations/analytics-exports`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      operationId: expect.stringMatching(/^anxop_[A-Za-z0-9_-]{20,}$/u),
      kind: 'raw-events-jsonl',
      release,
    });
    expect(calls[1]?.url).toBe(
      `${BASE}/v1/sdk/authoring/operations/analytics-exports/${job.id}/download`,
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:export');
  });

  it('carries the server’s reason rather than a status code', async () => {
    const { client } = stub(() => ({
      status: 403,
      body: { error: 'authoring_capability_forbidden', message: 'This session cannot change that' },
    }));
    await expect(client.updateMeasurement({ successEvent: null })).rejects.toThrow(
      'This session cannot change that',
    );
  });

  it('names a forbidden response so the panel can go read-only instead of retrying', async () => {
    const { client } = stub(() => ({ status: 403, body: {} }));
    await expect(client.readMeasurement()).rejects.toMatchObject({
      name: 'LodariqOperationsForbiddenError',
    });
  });

  it('still fails cleanly when the error body is not JSON', async () => {
    const fetchStub = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    }));
    const client = createAuthoringOperationsClient({
      baseUrl: BASE,
      authorization: () => 'Bearer x',
      authoringSession: () => 'session_token',
      fetch: fetchStub as unknown as typeof fetch,
    });
    await expect(client.readMeasurement()).rejects.toThrow('Operations request failed (500)');
  });
});
