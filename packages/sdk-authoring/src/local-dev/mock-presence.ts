import type { PresenceState } from '../authoring/presence/presence-model';
import type { LocalAuthoringPresenceServices } from '../authoring/panel';

/**
 * Two colleagues on the document, for local development only.
 *
 * WIRE_BE: real presence is a heartbeat over the host's collaboration channel —
 * there is no bridge message for it yet, and `panel.ts` takes it through
 * `LocalAuthoringPresenceServices`, so swapping this for the real thing is one
 * assignment in `local-dev/install.ts`. Nothing here ships to a hosted origin.
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
    // Clamped, because the fixture usually has one step and a peer parked on a
    // step that does not exist demonstrates nothing.
    const stepOf = (index: number): string | null => steps[Math.min(index, steps.length - 1)] ?? null;
    return {
      selfId,
      peers: DEMO_PEERS.map((peer) => ({
        creatorId: peer.creatorId,
        name: peer.name,
        stepId: stepOf(peer.stepIndex),
        lastSeenAt: now,
      })),
      stepLocks: DEMO_PEERS.flatMap((peer) => {
        const stepId = peer.holding ? stepOf(peer.stepIndex) : null;
        return stepId ? [{ stepId, creatorId: peer.creatorId, acquiredAt: now, lastEditAt: now }] : [];
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
