# Targeting & Resolution Remediation — Implementation Brief

Status: ready to implement · Date: 2026-08-18 · Audience: implementing agent
Governs: `packages/sdk-runtime/src/resolver/**`, `packages/sdk-runtime/src/renderers/tour*.ts`,
`packages/sdk-authoring/src/bridge/targeting/**`, `packages/sdk-authoring/src/authoring/target-*.ts`

All line references verified against `a645e48`. Re-verify before editing; do not trust a stale number.

---

## 0. Constraints — read before writing code

1. **Do not stage or commit.** No `git add`, no `git commit`. Leave the working tree dirty.
2. **ADR-0016 holds.** Coordinates stay diagnostic-only. No coordinate, offset, `scrollY`, or
   `elementFromPoint` value may ever become a resolution key or drive a production interaction.
   No CSS selector, XPath, or structural path may be persisted as identity.
3. **ADR-0013 holds.** Never persist raw CSS or DOM strings.
4. **No new customer code requirement.** Every change here must work on an app that ships no
   `data-testid`, no registry hooks, and no instrumentation of any kind. Attribute paths are
   opportunistic accelerators only, never preconditions.
5. Tests live in `packages/tests/<pkg>/src/...` mirroring source paths. Per-file
   `// @vitest-environment jsdom` opt-in.
6. Behaviour-preserving refactors must be proven behaviour-preserving by test, not by inspection.

---

## 1. Root cause

The resolver conflates two operations that need different signals and different cost profiles:

- **Search** — find the element. Currently O(n) over every element in the document, with an
  expensive per-element constant. Should be an indexed lookup.
- **Verification** — confirm the found element is the intended one. Currently never trusted at
  capture time, so nothing ever reaches `verified`.

Consequence: the system pays maximum cost for certainty it already holds, then declines to spend
that certainty in the UI. Every task below follows from this.

---

## 2. Task list, ordered by leverage

Do them in order. Each is independently shippable.

### T1 — Memoize visibility per resolution pass
**Files:** `packages/sdk-runtime/src/resolver/element-evidence.ts:207` (`isVisible`), `:523`
(`computedStyleOf`)

`isVisible()` walks the ancestor chain calling `getComputedStyle` per ancestor, per element, with no
memoization. Called once per candidate over the full document.

Add a pass-scoped `Map<Element, boolean>` (and a `Map<Element, CSSStyleDeclaration>` for computed
style). Memoize ancestor results recursively — if an ancestor is already known visible, stop
climbing. Cache lifetime is a single resolution pass; do not cache across passes (style can change
between them).

Signature change: thread a context object rather than a module-level cache. A module-level cache is
a correctness bug — it will survive across resolutions and go stale.

**Measured effect** (Chromium, synthetic DOM, no stylesheet cascade — real apps will be worse):

| Elements | Current | Memoized |
|---|---|---|
| 2,000 | 115 ms | 11 ms |
| 6,000 | 225 ms | 15 ms |
| 15,000 | 460 ms | 39 ms |

**Acceptance:** identical resolution results on the existing resolver test suite; add a test proving
the cache does not leak between passes.

---

### T2 — Indexed candidate pool instead of full tree walk
**Files:** `packages/sdk-runtime/src/resolver/resolve.ts:244` (`collectElements` call), `:793`
(`isPotentialIdentityCandidate`), `packages/sdk-runtime/src/resolver/element-evidence.ts:166`

`resolve.ts:793` already defines exactly the predicate that describes a viable candidate:

```ts
function isPotentialIdentityCandidate(identity, element, registryTarget) {
  if (element === registryTarget) return true;
  if (exactAttributesMatch(element, identity.invariants.configuredAttributes)) return true;
  if (exactAttributesMatch(element, identity.invariants.semanticAttributes)) return true;
  if (identity.semantics.role && semanticRoleOf(element) === identity.semantics.role) return true;
  if (identity.semantics.tagName && element.tagName.toLowerCase() === identity.semantics.tagName) return true;
  return false;
}
```

It is currently used **only** to increment diagnostic counters (`resolve.ts:270-280`), while the loop
still iterates every element returned by `collectElements`.

Build the pool from the identity instead. Add `collectIndexedCandidates(identity, root)` in
`element-evidence.ts` that emits a candidate set from, in order:

1. `identity.invariants.configuredAttributes` → `[name="value"]` attribute query
2. `identity.invariants.semanticAttributes` → attribute query
3. `identity.semantics.role` → role-to-tag/attr expansion
   (`role=button` → `button, [role=button], input[type=button], input[type=submit]`, etc.)
4. `identity.semantics.tagName` → tag query
5. `identity.semantics.elementKind` → the kind's tag/role union (see `KIND_MATCHERS`,
   `element-evidence.ts:122`)

Union the results, dedupe, then run the existing gates and scoring over that set only.

**Shadow DOM:** the current walk crosses open shadow roots. `querySelectorAll` does not. Keep a
shadow-root registry (walk once, cache the roots, re-query per root) or retain the tree walk
specifically for shadow subtrees. **Do not silently drop shadow-DOM support** — verify with a test.

**Fallback:** if the indexed pool is empty, fall back to the full walk. Log which path was taken.

**Measured effect** (6,005-element page, realistic control/layout mix):

| Pool | Build | + visibility gate | Total |
|---|---|---|---|
| Full tree walk — 6,005 els | 5.9 ms | 164.4 ms | **170 ms** |
| Indexed by element kind — 648 els | 1.6 ms | 14.4 ms | **16 ms** |
| Indexed by role — 162 els | 1.7 ms | 3.5 ms | **5.2 ms** |

Scoring is also linear in pool size, so the reduction applies twice. Combines multiplicatively with T1.

**Acceptance:** full existing resolver suite green with the indexed path forced on. Add tests for
shadow DOM, empty-pool fallback, and identity with only `tagName` populated.

---

### T3 — Check declared identity before scanning
**Files:** `packages/sdk-runtime/src/resolver/resolve.ts:244-254`, `:830`
(`resolveRegistryTarget`), `:845` (`resolveStableReference`)

`collectElements` runs at `:244`. `resolveRegistryTarget` runs at `:249` — *after*. The
90-point family, where the customer has explicitly declared the element, pays for the full document
scan before anyone checks whether the answer was handed over.

Move registry and stable-reference resolution ahead of pool construction. If either returns an
element that passes `belongsToRoot`, `isVisible`, and the semantic gates, return immediately with
full confidence. Only build a pool when they miss.

**Also:** `resolveRegistryTarget` and `resolveStableKey` are declared in
`resolver/types.ts:60-61` and consumed in `resolve.ts`, but **nothing outside the resolver ever
supplies them.** No public API exposes them; no caller passes them. The highest-confidence family in
`TARGET_IDENTITY_SCORE_BY_FAMILY` (90) is unreachable in production.

Decide and act: either expose a public registration API from `packages/sdk-runtime/src/index.ts`
(e.g. `registerTarget(key, element)` writing to a `Symbol.for`-keyed registry, mirroring
`brand-token-registry.ts`), or delete the family and its score entry. Do not leave it as dead
config implying a capability that cannot be invoked. **Recommend: expose it** — it is the
deterministic escape hatch for customers who want one, offered as an optional upgrade, never a
requirement.

**Acceptance:** test proving a registry hit resolves without invoking `collectElements` at all.

---

### T4 — Fix the resolution poll loop
**File:** `packages/sdk-runtime/src/renderers/tour-choreography-runtime.ts:111-122`

```ts
let element = resolveTarget(targetId, requiredAction);
while (!element) {
  await delay(50, signal);
  element = resolveTarget(targetId, requiredAction);
}
```

A single resolution costs ~170 ms at 6,000 elements (pre-T1/T2). The loop waits 50 ms. **The work is
longer than the interval**, so it runs back-to-back at ~100% main-thread occupancy while waiting —
Lodariq janks the host application, worst at exactly the moment the target is slow to appear.
There is also no deadline; only the abort signal terminates it.

Replace with:
- `MutationObserver` on the resolution root, debounced (~16 ms), re-attempting only on DOM change.
- Exponential backoff as a safety net: 50 → 100 → 200 → 400 → 800 ms, capped.
- A hard deadline (default ~10 s, configurable per step) producing an explicit
  `target_wait_timeout` outcome rather than looping forever.
- Never re-enter resolution while a pass is in flight.

**Acceptance:** test asserting resolution count stays bounded over a 5 s wait with a static DOM
(should approach 1, not ~100).

---

### T5 — Decouple card visibility from resolution
**Files:** `packages/sdk-runtime/src/renderers/tour.ts:436`,
`packages/sdk-runtime/src/renderers/tour-target-tracker.ts:57,72,92`

`tour.ts:436` sets `this.card.hidden = Boolean(step.targetId)`. The only unhide is
`tour-target-tracker.ts:92`, after placement. Perceived latency equals resolution latency exactly,
and the waiting state is a blank screen.

**Do not** show the anchored card in a provisional position and animate it to the target. Splitting
is required:

- **Position-independent chrome** — progress ("2 of 7"), next/back/dismiss, step title, narration
  controls. Makes no spatial claim. Renders immediately in a fixed rail position.
- **Anchored payload** — beak, spotlight cutout, precise placement. Renders only on successful
  resolution, only in the correct position. Never provisional, never animated from a wrong location.

While waiting past a short threshold (~300 ms), the chrome shows an honest waiting state naming the
target's legible label (`bridge/targeting/legibility.ts` already produces this). On T4 timeout it
becomes an explicit recoverable state, not silence.

**Acceptance:** test asserting chrome is in the DOM and visible before resolution completes, and
that the anchored payload is not.

---

### T6 — Let capture evidence produce a verified state
**Files:** `packages/sdk-authoring/src/authoring/target-health-ledger.ts:139-156`
(`derivePresentation`), `packages/sdk-authoring/src/bridge/targeting/capture.ts:834`
(`captureQuality`), `:859` (`assessCandidateUniqueness`), `:434` (`captureNeedsConfirmation`)

`derivePresentation` returns `verified` only when a *runtime* resolution diagnostic came back
`found`. Otherwise: `return entry.lastVerified ? 'unavailable_current_context' : 'unverified';`
(`:147`, `:156`). A target proven unique seconds ago displays as unverified because it has not been
re-proven under conditions that have not occurred. Nothing ever verifies.

Uniqueness at capture is decidable and already computed. Changes:

1. **Introduce `verified_at_capture`** as a distinct presentation state, set when
   `uniqueCandidateCount === 1` and `runnerUpMargin >= TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN` over
   durable families. Record the timestamp and the qualifying families so it is auditable.
2. **`capture.ts:855` — `sampleCount >= 2` gates `strong`.** A first pick always passes
   `sampleCount: 1`, capping every single capture at `usable`. Either allow `strong` on a single
   sample with a wide margin, or auto-collect a second sample via `mergeTargetCaptureVariants()`
   without creator involvement. Do not surface this as a task the creator must perform.
3. **`capture.ts:864` — `durableFamilies.length < 2`** hard-returns
   `{ uniqueCandidateCount: 2, runnerUpMargin: 0 }`, manufacturing ambiguity. **Instrument before
   changing.** Log how often this fires on real pages.
4. **`capture.ts:883` and `:1058` — `pool.truncated`** forces non-unique / null. Same: instrument
   first. Likely fires on large pages and may be the dominant cause.
5. Use **capture-time click coordinates as a tie-breaker** when two candidates are otherwise
   indistinguishable. The creator clicked one of them; that is ground truth at capture. Record as
   diagnostic evidence only — it must not enter the persisted identity or reach the resolver.

**Do not** remove drift detection or self-healing. Move drift repair to resolution time, where
there is an actual mismatch to repair, instead of taxing every capture for drift that has not
happened.

**Acceptance:** a target captured on a page with an unambiguous match reaches a verified state
without any runtime resolution having occurred.

---

### T7 — Split the two "needs context" states in the UI
**Files:** `packages/sdk-authoring/src/authoring/target-verification.ts:29-30`,
`target-health-ledger.ts:20`

```ts
unavailable_current_context: 'needs-context',
unverified: 'needs-context',
```

Both render identically. A creator cannot distinguish "never checked" from "checked, just not on
this screen." The second is normal; the first is not. Give them distinct states and distinct copy.
Add `verified_at_capture` from T6 to this mapping.

---

### T8 — Separate identity signals from change detectors
**File:** `packages/schema/src/target-runtime.ts:82-95` (`TARGET_IDENTITY_SCORE_BY_FAMILY`)

Currently in one scoring pool:

```
'registry-contract': 90, 'configured-attribute': 75, 'semantic-attribute': 45,
'element-semantics': 30, 'ancestor-context': 25, 'relationship-context': 30,
'visual-topology': 12, 'visual-structure': 24, 'visual-appearance': 18,
'visual-neighborhood': 22, 'layout-slot': 35, 'localized-text': 15,
```

The visual families are volatile *by design* — restyling, re-layout, i18n string length, font
loading, zoom and breakpoints all move them. Scoring them as identity means a customer restyling a
button lowers the system's confidence about *which* button it is. That is the wrong output. The
restyle did not create ambiguity; it created *change*.

Partition into:

- **Identity signals** (drive resolution): `registry-contract`, `configured-attribute`,
  `semantic-attribute`, `element-semantics`, `ancestor-context`, `relationship-context`,
  `layout-slot`, `localized-text`.
- **Change detectors** (feed drift notification, do **not** gate verification or resolution
  confidence): `visual-topology`, `visual-structure`, `visual-appearance`, `visual-neighborhood`.

Visual families remain valid as tie-breakers on a near-tie (the existing
`MAX_VISUAL_SCORE_SWING = 14` gating at `resolve.ts:569,613` is correct and should be preserved) —
but a mismatch there emits a drift event rather than suppressing confidence.

Rationale: the drift notification system already warns the customer about layout and style change.
Feeding the same signals into both the alarm and the confidence score double-counts the risk.

**This task changes a schema constant and needs an ADR amendment. Do not ship it without one.**

---

### T9 — Make the configured-attribute allowlist customer-configurable
**Files:** `packages/sdk-authoring/src/bridge/targeting/capture.ts:108`,
`packages/sdk-runtime/src/resolver/element-evidence.ts:107`

Two hardcoded, divergent lists:

```ts
// capture.ts:108
const CONFIGURED_ATTRIBUTE_NAMES = ['data-lodariq-id','data-testid','data-test','data-cy','id'];
// element-evidence.ts:107
const STABLE_KEY_ATTRIBUTE_NAMES = ['id','name','data-testid','data-test','data-cy','data-qa','data-key'];
```

A customer on `data-e2e`, `data-track`, or `data-analytics-id` gets nothing. Make the list a
workspace setting (validated against `TARGET_CONFIGURED_ATTRIBUTE_NAME_PATTERN`), reconcile the two
lists to one source, and thread it through capture and resolution.

**Framing, for docs and UI:** this is not a selector escape hatch and does not violate ADR-0016.
The creator never types or sees a selector. It is an attribute-*value* lookup on an allowlisted
attribute *name*, verified against the full semantic identity before use. It fails closed. What
ADR-0016 prohibits is persisting positional structural paths that silently resolve to the wrong
element after a redesign.

**This is opportunistic only.** Many customers ship no such attributes. T1/T2 must deliver their
speed gains with the allowlist entirely empty.

---

### T10 — Instrument
**Files:** `packages/sdk-runtime/src/resolver/**` (currently zero occurrences of
`performance.now`, no caching, no timing)

Add timing around: pool construction, gate pass, scoring, total resolution. Record which path
resolved (registry / attribute / role-index / full-scan) and pool size. Report p50/p95 to the
target health ledger.

Nothing here is measured today. Land this early — T6's thresholds should be tuned against real
numbers, not guesses.

---

## 3. Explicitly rejected

**Coordinate-based resolution** (click position + `scrollY` + box dimensions as the resolution key).
Rejected on three grounds:

1. **Correlated failure.** `scrollY` is a layout *output*. Anything above the target changing height
   moves every target below it. One header change breaks every experience on the page
   simultaneously — the worst available failure shape.
2. **Data dependence.** A list of 3 rows versus 30 rows moves everything beneath it. This varies per
   user per session, not per release. The creator's capture works; the heavy user's session fails.
   Invisible in testing, because test data is static. Also: viewport width, browser zoom, OS font
   scaling, scrollbar presence (Windows 15 px vs macOS overlay 0 px), cookie banners, late-settling
   lazy images, i18n string length.
3. **Safety.** A positional resolver that drifts does not fail — it *succeeds on the wrong element*.
   `elementFromPoint` always returns something. Highlighting or directing a user toward an
   unintended destructive control is a harm vector, not a reliability annoyance. This is why
   ADR-0016 and PRD §8.4 made coordinates diagnostic-only.

The same objection applies to positional click handling: matching a click by region still requires
knowing which element was meant, and the topmost element at those coordinates is precisely the thing
that drifted.

Coordinates are a good **change detector** and a good **capture-time tie-breaker** (T6.5). They are
not an identity.

---

## 4. Identity ladder — target end state

Try in order; stop at the first that resolves and verifies.

| Tier | Method | Cost | Customer code |
|---|---|---|---|
| 0 | Registry contract (T3) | <1 ms | Yes, one call — optional |
| 1 | Configured attribute lookup (T9) | ~1 ms | No — reuses existing attrs if present |
| 2 | Role + accessible name, scoped to landmark/route | ~5 ms | **No** |
| 3 | Full semantic scan (current path) | 100–500 ms | No |

Tier 2 is the primary path for customers with no instrumentation, and must not be treated as a
fallback. Accessible name plus role is written by the product team, present on every app, and
survives restyling, re-layout, framework migration and data change. When the label *does* change,
the step's copy is also wrong — breaking loudly there is correct.

Underused stable signals already partly captured, worth strengthening: `href` on anchors,
`name`/`type`/`autocomplete` on inputs (see `SEMANTIC_ATTRIBUTE_NAMES`, `capture.ts:116`),
`action` on forms, and position within a *named* container rather than the page
(`ancestor-context`, `layout-slot` — this is the correct home for positional intuition).

Scope every tier by `routePatternId` and `stateId` (already in `packages/schema/src/target.ts`)
before pool construction.

---

## 5. Sequencing

- **Ship first, independently, no schema change:** T1, T2, T10. Pure performance and measurement.
- **Then:** T4, T5. Perceived-latency fixes; T5 depends on nothing but is best landed after T1/T2 so
  the waiting state is rarely seen.
- **Then, needs instrumentation from T10:** T6, T7.
- **Needs an ADR amendment:** T8, and T3's decision on exposing the registry API.
- **Independent, any time:** T9.

## 6. Acceptance for the whole effort

1. Resolution on a 6,000-element page is under 20 ms p50 with an empty attribute allowlist and no
   customer instrumentation.
2. Waiting never presents as a blank screen, and the anchored card never appears in a provisional
   position.
3. An unambiguous capture reaches a verified state without a prior runtime resolution.
4. No coordinate value reaches the resolver or any persisted identity.
5. Shadow-DOM targeting still works.
6. Full `packages/tests` suite green.

## 7. Open questions for the implementer

- How often do `pool.truncated` and `durableFamilies.length < 2` actually fire on real pages?
  T10 answers this; T6's thresholds depend on it.
- Does `collectElements`' 50,000 limit ever trigger in practice? It currently returns
  `needs_review` / `scan_limit_exceeded`, which is a silent whole-target failure.
- Should the registry API (T3) be public, or is the deterministic escape hatch better delivered as
  the `data-lodariq-id` attribute alone?
