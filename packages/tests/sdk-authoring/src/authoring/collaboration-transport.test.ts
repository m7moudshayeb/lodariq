import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringCollaborationEvent } from '@lodariq/schema';
import {
  collaborationTransportTest,
  subscribeToCollaborationEvents,
} from '../../../../../packages/sdk-authoring/src/authoring/operations/collaboration-transport';

const snapshot: AuthoringCollaborationEvent['snapshot'] = {
  selfParticipantId: `presence_${'a'.repeat(24)}`,
  generatedAt: '2026-08-21T10:00:00.000Z',
  documentUpdatedAt: '2026-08-21T09:59:00.000Z',
  draftChanged: false,
  peers: [
    {
      participantId: `presence_${'b'.repeat(24)}`,
      creatorId: 'user_mina',
      name: 'Mina Chen',
      stepId: 'step_2',
      selection: { type: 'block', blockId: 'heading_2' },
      lastSeenAt: '2026-08-21T10:00:00.000Z',
      sameCreator: false,
    },
  ],
  locks: [],
  comments: [],
};

const event: AuthoringCollaborationEvent = { eventId: 'collab_1', snapshot };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('authoring collaboration SSE transport', () => {
  it('assembles chunked frames, ignores keepalives, and rejects malformed payloads', () => {
    const received = vi.fn();
    const first = collaborationTransportTest.consumeSseFrames(
      `: keepalive\n\ndata: ${JSON.stringify(event).slice(0, 30)}`,
      received,
    );
    const remainder = collaborationTransportTest.consumeSseFrames(
      `${first}${JSON.stringify(event).slice(30)}\n\ndata: {"eventId":"bad"}\n\n`,
      received,
    );

    expect(remainder).toBe('');
    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(snapshot);
  });

  it('reconnects with bounded backoff and keeps credentials in request headers', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoded);
              controller.close();
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      );
    const onSnapshot = vi.fn();
    const onState = vi.fn();
    const stop = subscribeToCollaborationEvents(request, onSnapshot, onState);

    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(250);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toBe('/collaboration/events');
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: { accept: 'text/event-stream' },
    });
    expect(onState).toHaveBeenCalledWith('connected');
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    stop();
  });
});
