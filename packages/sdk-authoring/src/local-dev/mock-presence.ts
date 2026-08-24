import type { PresenceState } from '../authoring/presence/presence-model';
import type { LocalAuthoringPresenceServices } from '../authoring/panel';

/**
 * Two colleagues on the document, for local development only.
 *
 * Hosted presence uses the authenticated heartbeat/SSE transport and semantic
 * bridge. This source remains only for reviewing the chrome without an API.
 *
 * It exists so the presence surfaces can be seen and reviewed: the pill's faces,
 * the filmstrip's avatars and the step lock are invisible in single-player, and
 * a surface nobody can look at cannot be designed against.
 *
 * Off unless asked for — `?lodariqPresence=demo` — because a fixture that always
 * shows two strangers is a fixture nobody trusts.
 *
 * Reference: authoring-spec.html → `DOC.peers` / `drawPill()` `.faces`
 */
const DEMO_PEERS = [
  // One of them is holding their step, so the lock band (§15.2) has something to
  // draw. Without a held step it is a surface nobody can look at.
  { creatorId: 'demo-peer-1', name: 'Dina Okonkwo', stepIndex: 1, holding: true },
  { creatorId: 'demo-peer-2', name: 'Maya Haddad', stepIndex: 2, holding: false },
] as const;

const PRESENCE_QUERY_PARAM = 'lodariqPresence';
const PRESENCE_DEMO_VALUE = 'demo';
/** Well inside `PRESENCE_STALE_MS`, so the peers never lapse mid-session. */
const HEARTBEAT_MS = 10_000;

export function mockPresenceRequested(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get(PRESENCE_QUERY_PARAM) === PRESENCE_DEMO_VALUE;
}

/**
 * `stepIds` orders the peers onto real steps, so the filmstrip has something to
 * mark. Fewer steps than peers simply leaves the extras off any step.
 */
export function createMockPresence(
  selfId: string,
  stepIds: () => readonly string[],
): LocalAuthoringPresenceServices {
  const snapshot = (): PresenceState => {
    const steps = stepIds();
    const now = Date.now();
    // Clamped: a peer parked on a step that does not exist demonstrates nothing.
    // The fixture now has five, so these two land on distinct steps.
    const stepOf = (index: number): string | null =>
      steps[Math.min(index, steps.length - 1)] ?? null;
    return {
      selfId,
      peers: DEMO_PEERS.map((peer, index) => {
        const stepId = stepOf(peer.stepIndex);
        return {
          creatorId: peer.creatorId,
          name: peer.name,
          stepId,
          selection: index === 0 && stepId ? { type: 'block' as const, blockId: stepId } : null,
          lastSeenAt: now,
        };
      }),
      stepLocks: DEMO_PEERS.flatMap((peer) => {
        const stepId = peer.holding ? stepOf(peer.stepIndex) : null;
        return stepId
          ? [{ stepId, creatorId: peer.creatorId, acquiredAt: now, lastEditAt: now }]
          : [];
      }),
      documentLock: null,
    };
  };

  return {
    subscribe: (onChange) => {
      onChange(snapshot());
      const timer = setInterval(() => onChange(snapshot()), HEARTBEAT_MS);
      return () => clearInterval(timer);
    },
  };
}
