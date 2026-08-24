import { describe, expect, it, vi } from 'vitest';
import { createHostedOperationsServices } from '../../../../apps/editor/src/hosted-operations-services';

describe('hosted scoped replay operations', () => {
  it('validates and returns bounded experience sessions', async () => {
    const request = vi.fn(
      async (_url: URL, _init: Pick<RequestInit, 'body' | 'headers' | 'method'>) =>
        new Response(
          JSON.stringify({
            sessions: [
              {
                correlationId: 'run_hosted_1',
                startedAt: '2026-08-21T10:00:00.000Z',
                endedAt: '2026-08-21T10:00:01.000Z',
                durationMs: 1_000,
                outcome: 'completed',
                stepsReached: 1,
                unresolvedStepIds: [],
                beats: [
                  {
                    name: 'experience_shown',
                    at: '2026-08-21T10:00:00.000Z',
                    offsetMs: 0,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const services = createHostedOperationsServices('https://api.lodariq.io', request as never);

    await expect(services.listSessions?.()).resolves.toMatchObject([
      { correlationId: 'run_hosted_1', outcome: 'completed' },
    ]);
    expect(String(request.mock.calls[0]?.[0])).toBe(
      'https://api.lodariq.io/v1/authoring/operations/sessions',
    );
  });

  it('keeps collaboration credentials in the hosted request seam for heartbeat and SSE', async () => {
    const snapshot = {
      selfParticipantId: `presence_${'a'.repeat(24)}`,
      generatedAt: '2026-08-21T10:00:00.000Z',
      documentUpdatedAt: '2026-08-21T09:59:00.000Z',
      draftChanged: false,
      peers: [],
      locks: [],
      comments: [],
    };
    const event = { eventId: 'collab_1', snapshot };
    const request = vi.fn(
      async (
        url: URL,
        _init: {
          body?: BodyInit | null;
          longLived?: boolean;
          method?: string;
        },
      ) => {
        if (url.pathname.endsWith('/collaboration/events')) {
          return new Response(`data: ${JSON.stringify(event)}\n\n`, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        if (url.pathname.endsWith('/collaboration/presence')) {
          return new Response(JSON.stringify(snapshot), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(null, { status: 204 });
      },
    );
    const services = createHostedOperationsServices('https://api.lodariq.io', request as never, {
      documentUpdatedAt: () => '2026-08-21T09:59:00.000Z',
    });

    await expect(
      services.heartbeatCollaboration?.({ stepId: 'step_1', selection: null }),
    ).resolves.toEqual(snapshot);
    const heartbeatCall = request.mock.calls.find(([url]) =>
      String(url).endsWith('/collaboration/presence'),
    );
    expect(JSON.parse(String(heartbeatCall?.[1]?.body))).toMatchObject({
      stepId: 'step_1',
      selection: null,
      documentUpdatedAt: '2026-08-21T09:59:00.000Z',
    });

    const streamed = new Promise<void>((resolve) => {
      const stop = services.subscribeCollaboration?.((value) => {
        expect(value).toEqual(snapshot);
        stop?.();
        resolve();
      });
    });
    await streamed;
    const streamCall = request.mock.calls.find(([url]) =>
      String(url).endsWith('/collaboration/events'),
    );
    expect(streamCall?.[1]).toMatchObject({ method: 'GET', longLived: true });
    expect(String(streamCall?.[0])).not.toContain('session');
  });
});
