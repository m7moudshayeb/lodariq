# 0026. Step-partitioned concurrent authoring, not CRDT co-editing

- Status: Accepted
- Date: 2026-08-17
- PRD references: §7.5, §9.1, §11.3, §20
- Related: ADR 0003 (server-side publication compile), ADR 0004 (Lexical confined
  to the editor), ADR 0014 (immutable artifacts, pointer compare-and-swap),
  ADR 0015 (SDK-first in-product authoring)
- Design source: `docs/plans/authoring-ux-model.md` §15

## Context

Two creators will open the same experience. The instinctive answer is Figma-style
multiplayer, which inside a Lexical editor means a CRDT — in practice Yjs.

A CRDT requires its merge structure to be the durable source of truth, or at
minimum a persisted shadow that survives disconnection. That is incompatible with
two contracts we already depend on:

- ADR-0004 and the schema contract say a document contains canonical
  `LodariqBlock` JSON and **never** editor state. Persisting a `Y.Doc` would either
  break that boundary or create a second source of truth that has to be reconciled
  with the first.
- ADR-0003 says publication artifacts compile server-side from that canonical JSON.
  A merge structure the compiler cannot read is not publishable, so it would have to
  be projected back into canonical JSON on every change — a lossy step in the one
  place we cannot afford one.

The failure mode of getting this wrong is not visual drift, it is **silent data
loss**: two rich-content trees auto-merged, a paragraph gone, and nobody notified.

There is also a product argument. Tours are step-partitioned by construction. Two
creators almost never need to type in the same paragraph; they need to not overwrite
each other, and to know the other person is there.

## Decision

**Coordinate at the step, not the character.** No CRDT, no operational transform,
and no persisted editor state.

Three layers, in the order they engage:

1. **Presence, always on.** Avatars on filmstrip steps and a chip in the mode pill.
   No new identity work is required: the authoring-session bearer is already scoped
   per creator, per document, per environment, so the live set is known server-side.
   Presence prevents most conflicts socially, before any lock engages.
2. **Step-level soft locks.** Acquired on selection, heartbeated, and released by
   **expiry** — 90 seconds after the last edit — rather than by an explicit unlock. A
   lock that survives a closed laptop is worse than no lock. The other creator can
   open and read the step, sees who holds it, and can `Ask for it`, which pings the
   holder rather than forcing a takeover. Workspace admins may force-release, and the
   host records it.
3. **Document-scoped locks for operations that cannot be step-partitioned** — theme
   changes, reordering, batch operations, adding a locale. Reordering is the reason:
   two concurrent reorders produce an order neither creator asked for. These
   operations are all fast, so the lock is short and the UI states it plainly.

**The write path does not trust the locks.** Locks are advisory and will be bypassed
by expiry, a second tab, or a reconnect, so every step write attaches the base
version it was made against and **fails compare-and-swap rather than overwriting**.
On rejection the creator chooses — keep mine, keep theirs, or open both side by side
— and the losing side is preserved as a draft snapshot whichever they pick. Block
trees are never merged automatically.

Release operations keep ADR-0014's compare-and-swap pointer state unchanged. The
work there is human-readable surfacing, not a new guarantee: never `409 Conflict`,
always "Sami published version 12 while you were reviewing version 11."

## Consequences

- Two creators can work on one experience without a merge engine, and without any
  new durable representation of a document.
- The canonical document stays the only source of truth, so ADR-0003's server-side
  compile and ADR-0004's confinement of Lexical both hold unchanged.
- Conflicts are resolved by a person, visibly, and no resolution is destructive.
- Two people editing the *same step* is coordinated rather than merged. That is a
  deliberate product limit: it is the price of not having a second source of truth,
  and step partitioning makes it rare.
- Presence and locking require a server-side presence and lock endpoint scoped to the
  authoring session. Until it exists, the authoring layer renders presence it is
  given and holds no locks of its own.
- ADR-0015's 10–15 minute authoring session with no refresh becomes load-bearing:
  session expiry must release that creator's locks, must not silently drop queued
  commands, and must not require a full PKCE popup every 15 minutes. That is tracked
  as an open decision rather than assumed.
