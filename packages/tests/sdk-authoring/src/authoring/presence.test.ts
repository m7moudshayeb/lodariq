import { describe, expect, it } from 'vitest';
import {
  activeStepLock,
  canAskForStep,
  canForceRelease,
  DOCUMENT_LOCK_MAX_MS,
  livePeers,
  peerInitials,
  peersOnStep,
  PRESENCE_STALE_MS,
  STEP_LOCK_IDLE_MS,
  stepEditability,
  type PresenceState,
} from '../../../../../packages/sdk-authoring/src/authoring/presence/presence-model';
import {
  CONFLICT_CHOICES,
  conflictPrompt,
  isStaleWrite,
  resolveConflict,
  type CasRejection,
  type VersionedWrite,
} from '../../../../../packages/sdk-authoring/src/authoring/presence/conflict';

const NOW = 1_700_000_000_000;

const state = (over: Partial<PresenceState> = {}): PresenceState => ({
  selfId: 'creator_me',
  peers: [
    { creatorId: 'creator_me', name: 'Me Myself', stepId: 'step_1', lastSeenAt: NOW },
    { creatorId: 'creator_dina', name: 'Dina Haddad', stepId: 'step_2', lastSeenAt: NOW },
  ],
  stepLocks: [],
  documentLock: null,
  ...over,
});

describe('presence (§15.2 layer 1)', () => {
  it('counts other people, never yourself', () => {
    expect(livePeers(state(), NOW).map((peer) => peer.creatorId)).toEqual(['creator_dina']);
  });

  it('drops a peer who stopped heartbeating, so a closed laptop disappears', () => {
    const stale = state({
      peers: [{ creatorId: 'creator_dina', name: 'Dina', stepId: 'step_2', lastSeenAt: NOW }],
    });
    expect(livePeers(stale, NOW + PRESENCE_STALE_MS - 1)).toHaveLength(1);
    expect(livePeers(stale, NOW + PRESENCE_STALE_MS)).toHaveLength(0);
  });

  it('places peers on the step they are actually on', () => {
    expect(peersOnStep(state(), 'step_2', NOW).map((peer) => peer.name)).toEqual(['Dina Haddad']);
    expect(peersOnStep(state(), 'step_1', NOW)).toEqual([]);
  });

  it('reads an avatar as a person, from one or two names', () => {
    expect(peerInitials('Dina Haddad')).toBe('DH');
    expect(peerInitials('sami')).toBe('S');
    expect(peerInitials('  ')).toBe('?');
  });
});

describe('step-level soft locks (§15.2 layer 2)', () => {
  const held = state({
    stepLocks: [
      { stepId: 'step_2', creatorId: 'creator_dina', acquiredAt: NOW, lastEditAt: NOW },
    ],
  });

  it('makes someone else’s step readable but not editable, and names them', () => {
    const verdict = stepEditability(held, 'step_2', NOW);
    expect(verdict.editable).toBe(false);
    expect(verdict.editable === false && verdict.holder?.name).toBe('Dina Haddad');
    expect(verdict.editable === false && verdict.reason).toBe('step');
  });

  it('leaves your own lock and unlocked steps editable', () => {
    expect(stepEditability(held, 'step_1', NOW).editable).toBe(true);
    const mine = state({
      stepLocks: [{ stepId: 'step_1', creatorId: 'creator_me', acquiredAt: NOW, lastEditAt: NOW }],
    });
    expect(stepEditability(mine, 'step_1', NOW).editable).toBe(true);
  });

  it('lapses by expiry rather than by an unlock action', () => {
    expect(activeStepLock(held, 'step_2', NOW + STEP_LOCK_IDLE_MS - 1)).not.toBeNull();
    expect(activeStepLock(held, 'step_2', NOW + STEP_LOCK_IDLE_MS)).toBeNull();
    // …and the step becomes editable the moment it lapses.
    expect(stepEditability(held, 'step_2', NOW + STEP_LOCK_IDLE_MS).editable).toBe(true);
  });

  it('offers Ask for it instead of a takeover, and force-release only to admins', () => {
    expect(canAskForStep(held, 'step_2', NOW)).toBe(true);
    expect(canAskForStep(held, 'step_1', NOW)).toBe(false);
    expect(canForceRelease(held, 'step_2', NOW, false)).toBe(false);
    expect(canForceRelease(held, 'step_2', NOW, true)).toBe(true);
    // Nothing to force once it has lapsed on its own.
    expect(canForceRelease(held, 'step_2', NOW + STEP_LOCK_IDLE_MS, true)).toBe(false);
  });
});

describe('document-scoped operations (§15.2 layer 3)', () => {
  const reordering = state({
    documentLock: { operation: 'reorder', creatorId: 'creator_dina', acquiredAt: NOW },
  });

  it('holds every step for the moment a reorder takes', () => {
    const verdict = stepEditability(reordering, 'step_1', NOW);
    expect(verdict.editable).toBe(false);
    expect(verdict.editable === false && verdict.reason).toBe('document');
    expect(verdict.editable === false && verdict.holder?.name).toBe('Dina Haddad');
  });

  it('ignores a document lock that outlived a fast operation', () => {
    expect(stepEditability(reordering, 'step_1', NOW + DOCUMENT_LOCK_MAX_MS).editable).toBe(true);
  });

  it('does not hold anything for your own operation', () => {
    const mine = state({
      documentLock: { operation: 'batch', creatorId: 'creator_me', acquiredAt: NOW },
    });
    expect(stepEditability(mine, 'step_1', NOW).editable).toBe(true);
  });
});

describe('CAS across creators (§15.3)', () => {
  const write: VersionedWrite<{ color: string }> = {
    path: 'step:step_2/style.surface',
    label: 'Background colour',
    baseVersion: 4,
    payload: { color: '#101828' },
  };
  const rejection: CasRejection = {
    path: write.path,
    label: write.label,
    baseVersion: 4,
    actualVersion: 5,
    byCreatorName: 'Dina Haddad',
  };

  it('fails rather than overwrites when someone moved the version', () => {
    expect(isStaleWrite(write, 4)).toBe(false);
    expect(isStaleWrite(write, 5)).toBe(true);
  });

  it('offers a choice in words, not a status code', () => {
    const prompt = conflictPrompt(rejection, (item) => `${item.byCreatorName} changed this first.`);
    expect(prompt.message).toBe('Dina Haddad changed this first.');
    expect(prompt.message).not.toContain('409');
    expect(prompt.choices).toEqual(CONFLICT_CHOICES);
  });

  it('keeps both sides whichever choice is made', () => {
    for (const choice of CONFLICT_CHOICES) {
      const resolution = resolveConflict(write, rejection, choice);
      expect(resolution.snapshot).toEqual(write);
    }
  });

  it('rebases only the version when the creator keeps theirs', () => {
    const resolution = resolveConflict(write, rejection, 'keep-mine');
    expect(resolution.apply?.baseVersion).toBe(5);
    // The payload is untouched: merging block trees is what this path avoids.
    expect(resolution.apply?.payload).toEqual(write.payload);
    expect(resolution.compare).toBe(false);
  });

  it('applies nothing when the server’s copy wins, and asks to compare on request', () => {
    expect(resolveConflict(write, rejection, 'keep-theirs').apply).toBeNull();
    const both = resolveConflict(write, rejection, 'open-both');
    expect(both.apply).toBeNull();
    expect(both.compare).toBe(true);
  });
});
