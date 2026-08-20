import { describe, expect, it, vi } from 'vitest';
import { createAuthoringOperationsClient } from '../../../../../packages/sdk-authoring/src/authoring/operations/operations-client';

const BASE = 'https://api.lodariq.io';

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
      if (url.endsWith('/step-locks')) return { body: { locks: [{ stepId: 'step_1' }] } };
      if (url.endsWith('/applications')) return { body: { applications: [{ id: 'app' }] } };
      return { body: {} };
    });
    expect(await client.listComments()).toEqual([{ id: 'cmt_1' }]);
    expect(await client.listStepLocks()).toEqual([{ stepId: 'step_1' }]);
    expect(await client.listApplications()).toEqual([{ id: 'app' }]);
  });

  it('claims a step under one id per tab, so a second tab reads as someone else', async () => {
    const { client, calls } = stub(() => ({ body: { lock: { stepId: 'step_1' } } }));
    await client.claimStepLock('step_1');
    await client.claimStepLock('step_2');
    const first = JSON.parse(String(calls[0]?.init?.body)) as { sessionId: string };
    const second = JSON.parse(String(calls[1]?.init?.body)) as { sessionId: string };
    expect(first.sessionId).toBe(second.sessionId);
    expect(first.sessionId).toMatch(/^tab_/u);
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
