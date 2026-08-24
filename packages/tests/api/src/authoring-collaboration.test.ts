import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringCollaborationSnapshot } from '@lodariq/schema';
import type {
  AuthoringPresenceRecord,
  ControlPlaneRepository,
  ExperienceStepLockRecord,
} from '@lodariq/database';
import { AuthoringCollaborationHub } from '../../../../apps/api/src/authoring-collaboration';

const NOW = '2026-08-21T10:00:00.000Z';
const LATER = '2026-08-21T10:01:00.000Z';

function presence(overrides: Partial<AuthoringPresenceRecord>): AuthoringPresenceRecord {
  return {
    workspaceId: 'wk_a',
    documentId: 'doc_1',
    sessionId: 'session_a',
    creatorId: 'user_a',
    creatorName: 'Ada',
    stepId: 'step_1',
    selection: { type: 'block', blockId: 'heading_1' },
    documentUpdatedAt: NOW,
    lastSeenAt: NOW,
    expiresAt: LATER,
    ...overrides,
  };
}

function lock(overrides: Partial<ExperienceStepLockRecord> = {}): ExperienceStepLockRecord {
  return {
    workspaceId: 'wk_a',
    documentId: 'doc_1',
    stepId: 'step_1',
    holderUserId: 'user_a',
    holderName: 'Ada',
    sessionId: 'session_a',
    acquiredAt: NOW,
    expiresAt: LATER,
    ...overrides,
  };
}

function repository() {
  const entries = [
    presence({}),
    presence({ sessionId: 'session_a_tab_2' }),
    presence({
      sessionId: 'session_mina',
      creatorId: 'user_mina',
      creatorName: 'Mina',
      stepId: 'step_2',
      selection: null,
    }),
  ];
  return {
    listAuthoringPresence: vi.fn(async (scope: { workspaceId: string; documentId: string }) =>
      entries.filter(
        (entry) => entry.workspaceId === scope.workspaceId && entry.documentId === scope.documentId,
      ),
    ),
    listExperienceStepLockRecords: vi.fn(async () => [lock()]),
    listExperienceComments: vi.fn(async () => []),
    getDocument: vi.fn(async () => ({ document: {}, updatedAt: LATER })),
  } as unknown as ControlPlaneRepository;
}

describe('bounded authoring collaboration hub', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(LATER);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fans one scoped refresh out to a crowd without a per-tab poller', async () => {
    const repo = repository();
    const hub = new AuthoringCollaborationHub(repo);
    const sends = Array.from({ length: 100 }, () => vi.fn(() => true));
    const unsubscribers = sends.map((send, index) =>
      hub.subscribe(
        { workspaceId: 'wk_a', documentId: 'doc_1' },
        {
          sessionId: `subscriber_${index}`,
          creatorId: `user_${index}`,
          send,
          replaced: vi.fn(),
        },
      ),
    );
    expect(() =>
      hub.subscribe(
        { workspaceId: 'wk_a', documentId: 'doc_1' },
        {
          sessionId: 'subscriber_over_capacity',
          creatorId: 'user_over_capacity',
          send: vi.fn(() => true),
          replaced: vi.fn(),
        },
      ),
    ).toThrow('collaboration_capacity_reached');

    await vi.advanceTimersByTimeAsync(0);
    expect(repo.listAuthoringPresence).toHaveBeenCalledTimes(1);
    expect(sends.every((send) => send.mock.calls.length === 1)).toBe(true);
    expect(hub.activeChannelCount()).toBe(1);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    expect(hub.activeChannelCount()).toBe(0);
  });

  it('reports duplicate tabs, locks, and draft conflicts without exposing the current session', async () => {
    const repo = repository();
    const hub = new AuthoringCollaborationHub(repo);
    const send = vi.fn((_eventId: string, _snapshot: AuthoringCollaborationSnapshot) => true);
    const unsubscribe = hub.subscribe(
      { workspaceId: 'wk_a', documentId: 'doc_1' },
      { sessionId: 'session_a', creatorId: 'user_a', send, replaced: vi.fn() },
    );
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = send.mock.calls[0]?.[1];
    expect(snapshot).toMatchObject({
      draftChanged: true,
      peers: [
        { creatorId: 'user_a', sameCreator: true },
        { creatorId: 'user_mina', sameCreator: false },
      ],
      locks: [{ holderName: 'Ada', holderParticipantId: expect.stringMatching(/^presence_/u) }],
    });
    expect(snapshot?.peers.some((peer) => peer.participantId.includes('session_a'))).toBe(false);
    unsubscribe();
  });

  it('replaces a reconnect for the same session and keeps document channels isolated', async () => {
    const repo = repository();
    const hub = new AuthoringCollaborationHub(repo);
    const replaced = vi.fn();
    const first = hub.subscribe(
      { workspaceId: 'wk_a', documentId: 'doc_1' },
      { sessionId: 'session_a', creatorId: 'user_a', send: vi.fn(() => true), replaced },
    );
    const secondSend = vi.fn(() => true);
    const second = hub.subscribe(
      { workspaceId: 'wk_a', documentId: 'doc_1' },
      { sessionId: 'session_a', creatorId: 'user_a', send: secondSend, replaced: vi.fn() },
    );
    const other = hub.subscribe(
      { workspaceId: 'wk_b', documentId: 'doc_1' },
      { sessionId: 'session_b', creatorId: 'user_b', send: vi.fn(() => true), replaced: vi.fn() },
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(replaced).toHaveBeenCalledOnce();
    expect(secondSend).toHaveBeenCalledOnce();
    expect(repo.listAuthoringPresence).toHaveBeenCalledWith({
      workspaceId: 'wk_b',
      documentId: 'doc_1',
    });
    expect(hub.activeChannelCount()).toBe(2);
    first();
    second();
    other();
  });
});
