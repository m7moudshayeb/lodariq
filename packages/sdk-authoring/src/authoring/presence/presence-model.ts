/**
 * Concurrent creators, layers 1 and 2 (§15).
 *
 * Deliberately **not** real-time co-editing. A CRDT needs its merge structure to be
 * durable, and the schema contract says a document holds canonical `LodariqBlock`
 * JSON and never editor state (ADR-0004, ADR-0003). Persisting CRDT state would
 * create a second source of truth with data loss as the failure mode. Tours are
 * step-partitioned by construction, so step-level coordination buys nearly all of
 * multiplayer's value at a fraction of the risk — see ADR-0019.
 *
 * Everything here is pure and time-injected: `now` is a parameter, never a call, so
 * expiry is testable and no clock skew hides in a timer.
 */

export interface PresencePeer {
  readonly creatorId: string;
  /** Display name, already resolved by the host. Initials are derived here. */
  readonly name: string;
  /** The step they are on, or null when they are elsewhere in the document. */
  readonly stepId: string | null;
  /** Epoch ms of their last heartbeat. */
  readonly lastSeenAt: number;
}

/** A step held by one creator. Advisory, heartbeated, and released by expiry. */
export interface StepLock {
  readonly stepId: string;
  readonly creatorId: string;
  readonly acquiredAt: number;
  readonly lastEditAt: number;
}

/**
 * A whole-document operation cannot be step-partitioned, so it takes a short
 * document lock instead: theme changes, reordering, batch operations, adding a
 * locale. Reordering is the reason this exists — two concurrent reorders produce an
 * order neither creator asked for (§15.2 layer 3).
 */
export const DOCUMENT_OPERATIONS = ['theme', 'reorder', 'batch', 'locale'] as const;
export type DocumentOperation = (typeof DOCUMENT_OPERATIONS)[number];

export interface DocumentLock {
  readonly operation: DocumentOperation;
  readonly creatorId: string;
  readonly acquiredAt: number;
}

/** A peer is gone after this long without a heartbeat. */
export const PRESENCE_STALE_MS = 30_000;
/** A soft lock lapses this long after the last edit. Expiry *is* the release. */
export const STEP_LOCK_IDLE_MS = 90_000;
/** Document operations are all fast; a lock outliving this is a bug, not a hold. */
export const DOCUMENT_LOCK_MAX_MS = 15_000;

export interface PresenceState {
  readonly selfId: string;
  readonly peers: readonly PresencePeer[];
  readonly stepLocks: readonly StepLock[];
  readonly documentLock: DocumentLock | null;
}

export const EMPTY_PRESENCE: PresenceState = {
  selfId: '',
  peers: [],
  stepLocks: [],
  documentLock: null,
};

/** Peers still present. A closed laptop stops heartbeating and drops out. */
export function livePeers(state: PresenceState, now: number): readonly PresencePeer[] {
  return state.peers.filter(
    (peer) => peer.creatorId !== state.selfId && now - peer.lastSeenAt < PRESENCE_STALE_MS,
  );
}

/** Peers on one step, for the filmstrip's avatars. */
export function peersOnStep(
  state: PresenceState,
  stepId: string,
  now: number,
): readonly PresencePeer[] {
  return livePeers(state, now).filter((peer) => peer.stepId === stepId);
}

/**
 * The lock that actually applies to a step: expired ones are ignored rather than
 * cleaned up, because "a lock that survives a closed laptop is worse than no lock".
 */
export function activeStepLock(
  state: PresenceState,
  stepId: string,
  now: number,
): StepLock | null {
  const lock = state.stepLocks.find((candidate) => candidate.stepId === stepId);
  if (!lock) return null;
  return now - lock.lastEditAt < STEP_LOCK_IDLE_MS ? lock : null;
}

export type StepEditability =
  /** Yours to edit: unlocked, or locked by you. */
  | { readonly editable: true }
  /** Someone else holds it. The card renders read-only with their name. */
  | { readonly editable: false; readonly holder: PresencePeer | null; readonly reason: 'step' }
  /** A whole-document operation is in flight; nothing is editable for a moment. */
  | { readonly editable: false; readonly holder: PresencePeer | null; readonly reason: 'document' };

export function stepEditability(
  state: PresenceState,
  stepId: string,
  now: number,
): StepEditability {
  if (state.documentLock && state.documentLock.creatorId !== state.selfId) {
    if (now - state.documentLock.acquiredAt < DOCUMENT_LOCK_MAX_MS) {
      return { editable: false, holder: peerById(state, state.documentLock.creatorId), reason: 'document' };
    }
  }
  const lock = activeStepLock(state, stepId, now);
  if (!lock || lock.creatorId === state.selfId) return { editable: true };
  return { editable: false, holder: peerById(state, lock.creatorId), reason: 'step' };
}

function peerById(state: PresenceState, creatorId: string): PresencePeer | null {
  return state.peers.find((peer) => peer.creatorId === creatorId) ?? null;
}

/** Two letters, so an avatar reads as a person and not as a colour. */
export function peerInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]![0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase();
}

/**
 * Whether asking for a step is worth offering. `Ask for it` pings the holder; it
 * never forces a takeover, because a forced takeover is how two people lose an
 * edit each (§15.2).
 */
export function canAskForStep(state: PresenceState, stepId: string, now: number): boolean {
  const lock = activeStepLock(state, stepId, now);
  return Boolean(lock && lock.creatorId !== state.selfId);
}

/** Admins can force-release, and the action is recorded by the host. */
export function canForceRelease(state: PresenceState, stepId: string, now: number, isAdmin: boolean): boolean {
  return isAdmin && canAskForStep(state, stepId, now);
}
