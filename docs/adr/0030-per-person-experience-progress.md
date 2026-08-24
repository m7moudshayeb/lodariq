# 0030. Per-person experience progress: where "finished" lives

- Status: Proposed
- Date: 2026-08-23
- PRD references: §9.3, §11.1, §16.1
- Related: ADR 0027 (idle-page cost), ADR 0029 (targeting accuracy)

## Context

The requirement is one sentence — *track progress of any user in each tour and
continue from where they stopped unless they skipped it* — and it contains two
facts with different lifetimes and different owners.

| Fact | Lifetime | Owner | Fits |
|---|---|---|---|
| Where I am in this tour | Minutes; dies with the visit | This browsing session | `sessionStorage`, the existing `writeTourResume` |
| Whether I finished or skipped it | Forever | **The person**, across devices | Server-side, keyed to identity |

The first is solved and shipped. The second is half-solved: the client now keeps
a per-subject record in `localStorage` behind
`ExperienceProgressStore` (`packages/sdk-runtime/src/runtime/experience-progress.ts`),
which is device-scoped and therefore wrong in the case that motivates the
requirement — a visitor who dismissed a tour on their laptop and opens the
application on their phone is offered it again.

`experience-runtime-core.ts` already gates announcements and surveys on
`localStorage` by `frequency`. That is the same device-scoped precedent, and it
has the same limitation.

This ADR is deliberately a design, not a table. A wrong schema here is expensive
to undo, and the client side is already useful without it.

## Decision

### 1. Derive it from the event stream. Do not build a parallel store.

The events that answer the question are already emitted and already stored:
`tour_completed`, `tour_skipped`, `tour_dismissed`, and their
`announcement_*`/`checklist_*`/`hotspot_*`/`survey_*` siblings, each carrying
`documentId` and a server-resolved pointer
(`AuthoritativeAnalyticsEvent`, `packages/schema/src/events.ts`).

Storing a second copy of "this person finished this tour" invites the two to
disagree, and the one that decides whether a visitor sees an experience must not
be the one that is stale.

**One change is required to make this work**, and it is small:

`engagementKey` — `eng_<sha256(workspaceId \0 userId)>`, computed in the browser
by `pseudonymousEngagementKey` — is currently attached to `experience_shown`
only (`runtime/index.ts`). It must also be attached to the terminal events
(`*_completed`, `*_skipped`). Without it the completion events carry no per-person
key at all and the question is unanswerable from the stream, whatever is built on
top.

That key is the right identifier for this and not merely the convenient one:

- It is one-way. The server never holds the customer's raw `userId`.
- It is deterministic from `workspaceId` + `userId`, so the same person on a
  different device computes the same key. That is precisely the cross-device
  property the requirement needs.
- It already passes ingestion validation (`^eng_[0-9a-f]{64}$`) and is already
  persisted on accepted events.

### 2. Read it through a bounded lookup, not a new event shape

A read endpoint shaped like the existing SDK ingestion surface:

```
GET /v1/sdk/experience-progress?engagementKey=eng_<64 hex>
  → { outcomes: [ { documentId, outcome: 'completed' | 'skipped', at } ] }
```

- Authorised exactly as the other `/v1/sdk/*` routes are: public installation id
  header, workspace and environment resolved server-side, never from the page.
- Bounded: at most the active documents for that installation, so the response
  cannot grow with a visitor's history.
- Cacheable per key for a short TTL. This is on the delivery path, and ADR-0027's
  standard applies — a page that will show nothing must not pay an uncacheable
  round trip for the privilege. Prefer folding the answer into the existing
  `/v1/sdk/bootstrap` response once `identify` is known, rather than adding a
  second blocking request.

Materialisation (a rollup table keyed by `(workspaceId, environmentId,
engagementKey, documentId)`, written by the existing analytics worker) is an
implementation detail of this endpoint and can be added when the query is too
slow. It is not a separate source of truth, and nothing outside the endpoint may
read it.

### 3. The client contract does not change

`LodariqRuntime.experienceOutcome(documentId)` and `recordExperienceOutcome`
already exist and already delegate to an injected `ExperienceProgressStore`.
Shipping the server side means passing a different store through
`RuntimeConfig.experienceProgressStore`. No caller changes. That indirection is
the whole reason it is there.

### 4. Fail open, in both directions

- No identity — `identify` not yet called, or an anonymous visitor — yields
  `null`, never "suppress". Same rule as `triggerMatchesPage` in
  `@lodariq/schema/page-eligibility`: an experience that silently fails to appear
  is worse than one that appears twice.
- A store that throws, times out, or is unreachable yields `null`.
- Only `completed` and `skipped` are terminal. `dismissed` is "not now", and
  treating it as "never again" is the mistake a visitor cannot undo.

### 5. Data residency and retention

`data-residency.ts` (schema and API) places a workspace's data in one of `us`,
`eu`, `apac`, with migrations that copy, verify and cut over with per-phase
evidence and record counts.

Deriving progress from the analytics stream inherits that placement for free:
the rows already live in the workspace's region, already move with a migration,
and already fall under whatever retention the analytics store applies. A new
table would be a second thing to place, a second thing to migrate, a second thing
to enumerate for a deletion request — and a second thing to forget.

The one obligation the derived design adds is that `engagementKey` is
**pseudonymous, not anonymous**. Given a candidate `userId`, anyone with the
workspace id can confirm a match by recomputing the hash — the digest is unsalted
by design, because determinism across devices is the property being bought. Treat
it as personal data for erasure and export purposes.

## Implementation status (2026-08-24)

The prerequisite in §1 has landed. `engagementKey` is now attached to the events
that end an experience — `*_completed`, `*_skipped`, `*_dismissed`,
`survey_submitted` — matched by exact name, because `checklist_item_completed`
and `tour_adaptive_step_skipped` both end in a terminal word and neither ends an
experience. It cost 53 bytes gzipped in `runtime+tour`, leaving 59 of 59,392.
Usage metering is unaffected: it filters on `experience_shown` explicitly.

§2 and §3 are still unbuilt, and one thing found while implementing §1 belongs in
this ADR before they are:

**The read path needs an index that does not exist.** `analytics_events` is
indexed on `(workspace_id, occurred_at)` and `(document_id, occurred_at)` after
`0039`, and on nothing that starts with `engagement_key`. The §2 lookup is on the
delivery path, so serving it against those indexes means a scan per page load on
the largest table in the system. Whoever builds §2 needs the index — and
therefore a shared-environment migration — in the same change, not after it. That
also moves the materialisation question in §2 from "when the query is too slow"
to a decision to make up front, since the index and the rollup solve the same
problem.

## Consequences

- **Partly built.** §1 has landed; §2 and §3 have not. What ships today is still
  the device-scoped `localStorage` store behind the interface, and it is honest
  about being a stand-in.
- The `engagementKey`-on-terminal-events change is a prerequisite and was worth
  making early even though the rest waits: until it landed, no amount of
  downstream work could answer the question, because the data was not being
  recorded. It is being recorded now, so the stream accumulates history from
  today rather than from whenever §2 ships.
- Deriving rather than storing means the answer is only as good as ingestion.
  Events are best-effort — `sendBeacon` on exit, swallowed failures — so a lost
  `tour_completed` re-offers the tour. That is the correct direction to fail, and
  it is the same direction the client store fails in.
- Rules out a per-visitor write endpoint from the browser. The client asserts
  nothing about progress beyond the events it already emits; the server decides
  what those events mean. Anything else lets a page suppress an experience for a
  user it does not own.
- An unsalted digest is the deliberate trade. A salted or keyed one would end the
  confirm-a-guess exposure and also end cross-device matching, which is the
  requirement. If that trade is ever rejected, the fallback is a server-issued
  opaque identity handed back at `identify` time — more moving parts, and a
  round trip before the first experience can be suppressed.
