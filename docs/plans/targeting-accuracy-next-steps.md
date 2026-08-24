# Task: targeting accuracy — phase 2 (revised after Step 1)

The harness from `docs/plans/targeting-accuracy-harness.md` is built and has
produced a first baseline. Step 1 (diagnosis) is **complete**. Read that file for
the API contracts and traps; they still apply. This file is what to do next, and
it has been reordered in light of what Step 1 found.

**Standing constraints:** do not commit, do not push, do not run `pnpm format`
(it rewrites unrelated in-progress files), do not run the full `pnpm verify`.
Confine changes to `packages/tests/targeting-accuracy/` unless a step explicitly
says otherwise. **Stop and report at the end of every step.**

---

## What Step 1 established (do not re-derive)

Baseline: 77 trials — 48 correct, 29 abstained, **0 wrong**.

**The headline is thinner than it looks, and this reframes everything below.**

In at least two trials the resolver **ranked the wrong element first and cleared
the margin gate**, and was stopped only by a single downstream check,
`evidenceContradiction(...) === 'wrong-element'`:

- `modal-primary-cta` / `siblings-reordered` — "Cancel" ranked 1st at
  durableScore 126.5 vs the true target's 93.5; margin 33 against a required
  18.97. On course to resolve confidently onto the wrong button.
- `modal-primary-cta` / `element-retagged` — same wrong leader, same saviour.

`wrong = 0` therefore rests on **one last-line veto, not defence in depth.**

### 1a — `element-retagged`: a legitimate guard fed a wrong input

`durableFamilyCount = 1` vs `MIN_INDEPENDENT_IDENTITY_FAMILIES = 2`. Score was
never the problem (115.5 vs a floor of 55; true target ranked 1st by 3.5x).
`semanticRoleOf(<a role="button" href="#">)` correctly returns `'button'`, but
`element-semantics` is an all-or-nothing conjunction, so a tag change zeroes it —
costing family #2 *and* tripping `stableEvidenceHasDrift` → `evidence_drift`.

The quorum rule is right. The defect is that surviving compensating evidence (an
explicit ARIA role) scores nothing. Caution: across the 5 retag trials the true
target ranked *below* a wrong element in 3, so abstaining prevented a wrong in
those. Any relaxation must be measured.

### 1b — `siblings-reordered`: `sibling-position` transferred to the wrong button

Captured slot index 1 of 2; after reorder "Cancel" occupies index 1, so
`sibling-position` (+33) and `visual-topology` (+13.2) moved to the wrong
element. Strip the +33 and it is 93.5 vs 93.5 — an honest `ambiguous`.

Exactly the failure ADR-0016 predicts, but `isInsideCollection` only suppresses
`sibling-position` inside things that *look like* collections, and a two-button
modal footer is not one by the repetition heuristic.

### Two further defects found

- **`durableScore` includes supporting families while `durableFamilyCount`
  excludes them** (resolve.ts:1140).
- **`low_confidence` is a misnomer** — two conditions share one return
  (resolve.ts:422-432). This is product-facing: the same code drives telemetry
  and will drive the drift-repair hint.

**Priority: 1b outranks 1a.** A near-miss on the catastrophic outcome beats a
missed resolve.

---

## Step 2 — Report near-misses as a first-class outcome

**Do this first. It is the highest-value change in this file.**

Today the scorer sees `wrong = 0` and reports safety. Step 1 proved that number
concealed at least two cases where the wrong element had already won the ranking.
Make the invisible margin visible.

Add a `nearMiss` field to `Trial`, set when **the top-ranked candidate was not
the ground truth**, regardless of the final outcome. Record: the wrong leader's
score and families, the true target's score and rank, the margin, and **which
check produced the abstention** — the specific veto name, not just the reason
code.

Report near-misses as their own section, ranked by how close they came
(margin cleared, then score gap). A trial that is `abstained` *and* `nearMiss` is
categorically different from one that abstained because nothing matched — the
first is a bullet dodged, the second is ordinary caution.

This requires reading resolver internals the public `ResolutionResult` does not
expose. **Do not change `packages/sdk-runtime/` to expose them.** Prefer
`setResolutionTelemetryObserver` (resolve.ts:133) if it carries enough; if it
does not, say so and propose the smallest additive change, but do not apply it —
that is a separate decision.

**Output:** near-miss count for the existing 77 trials, each one detailed.

---

## What Step 2 established (read before Step 3)

Near-miss is now reported, and it is **not** derivable from outside `resolve.ts`
— `setResolutionTelemetryObserver` carries no candidate identity, every
abstention returns `element: null`, and the ranking helpers are module-local. The
harness therefore reports near-miss as **`unmeasured`, never `0`**. That
distinction is load-bearing: a silent zero would rebuild the exact false
confidence this step exists to destroy.

The proposed 16-line observer is written up in
`packages/tests/targeting-accuracy/NEAR-MISS-PROBE.md`. **Not applied.** Numbers
below were taken under that patch, then reverted (`git diff
packages/sdk-runtime/` empty).

**27 of 77 trials ranked the wrong element first**, which splits into two very
different populations:

- **6 — evidence genuinely favoured the wrong element.** 2 of those cleared the
  tie gate and were stopped only by `evidence-drift`. Both are
  `modal-primary-cta`, both against "Cancel".
- **21 — exact score ties (93.50 each) where sort order picked the leader.** All
  of them `table-row-action` and `pricing-card-cta`. These are the unanswered
  disambiguation question (Arm A), not a resolver defect.

**Treat those 21 as a latent fragility, not a clean result.** First place there
is arbitrary. Any future scoring change that nudges one tied candidate by a
single point converts 21 trials from `ambiguous` to resolved-onto-an-arbitrary-
element. Step 5b is exactly such a change. **Add a tie-fragility metric** — count
of trials where the top-two gap falls below a small epsilon — and ratchet it in
Step 7 alongside near-miss.

Correction to Step 1: the true target ranked below a wrong element in **4** of 5
retag trials, not 3. Direct measurement supersedes the earlier hand-derivation.

**Carry into Step 3:** `wrong = 0` rests on `evidence-drift` firing twice, on one
page, both times against the same button. Arm A's new scoring contract must
**not** be allowed to absorb that. Report near-miss and tie-fragility
**orthogonally to** each arm's expected-outcome scoring — never folded into it,
never netted against it. An abstention that was expected and an abstention that
was a bullet dodged are different facts and must stay separately visible.

---

## Step 3 — Split the corpus into two arms, and get the suite green

The pristine failure is a modelling gap: passing only
`id`/`fingerprint`/`identity` models *an author who was asked "which of these
three?" and never answered*. Abstaining is correct there. Encode that rather than
engineering around it.

Two labelled arms, reported separately. **Never merge their totals into one
percentage.**

### Arm A — `unanswered` (no selection policy)

Existing trials move here unchanged; the scoring contract changes. For a page
whose target sits in a look-alike tie, **the expected outcome is `abstained`, and
resolving is the failure.** Mark those cases on the fixture (e.g.
`ambiguousWithoutSelection: true` on `HostPage`) rather than hardcoding page ids
in the scorer.

The pristine gate becomes: every pristine trial produces its *expected* outcome.
That gate should pass and the suite goes green.

### Arm B — `answered` (author supplied a selection policy)

**There is a design decision here that outranks the measurement.**

Do not test an ordinal policy inside a collection and report that it breaks under
reorder. We know. ADR-0016 says so, and Step 1b just demonstrated it doing damage
*outside* a collection too. Rediscovering it proves nothing.

The question Arm B exists to answer: **which selection policies should we offer
for a control inside a collection, and do they survive a redesign?** Survey what
`TargetSelectionPolicy` can express, then evaluate at least:

1. **Content-anchored** — "the Manage button in the row containing *Globex*."
   Should survive reorder *and* re-sort. Check whether `relationship-context` /
   `resolveStableKey` already expresses this. If it does, this is likely the
   policy we should steer authors toward, and establishing that is the most
   valuable thing this step can produce.
2. **Any-matching** — "click any Manage button." Legitimate for some tours. This
   is the policy previously aliased to `first` that resolved onto the wrong
   button; confirm the fix holds across the corpus.
3. **Ordinal** — the control, expected to break. The finding to report is not
   "it broke" but whether we should offer it inside a collection at all.

Score Arm B on whether the author's *declared intent* survived. Where a policy
lands on a different element than the author picked, classify it
**`intent-violated`**, not `wrong` — the resolver honoured what it was told.
`wrong` stays reserved for resolving against the evidence.

**Output:** suite green, two arms reported separately, and a recommendation on
the collection policy with evidence.

---

## What Step 3 established — INCLUDING A CONFIRMED `wrong`

**`wrong = 2`. Not a test artifact — a live defect in `applySelectionPolicy`.**

Arm B, `ordinal` position 2 (reading-order), pages `table-row-action` and
`pricing-card-cta`, mutation `ab-variant-inserted`. The inserted experiment
button copies the target's class; durable scoring excludes `localized-text` — the
only distinguishing signal — so it ties at 93.50 and joins the tied set. Position
2 in document order is now the experiment's button. Result: `found`, confidence
93.50, and the tour confidently clicks **"Try the new flow"**.

Root cause: `applySelectionPolicy` filters `any-matching` through
`matchedItsText`, and the comment above that filter describes this precise
hazard. **`first`, `last` and `ordinal` skip it.** Control: `any-matching` on the
same pages and mutation produced 0 wrongs. This is the same bug class as the
previously-shipped `any-matching` → `first` aliasing — fixed for one policy out
of four, still live in three.

**This fix jumps to the front of Step 5, ahead of 5a.** 5a is a near-miss; this
is a confirmed hit in shipping code. Full write-up of severity and the fix is in
project memory under `selection-policy-text-filter-defect`.

### Arm results

- **Arm A (unanswered)** — 77 trials, 75 met contract (97%), 0 wrong, pristine
  gate 7/7 green. Missed-recoverable fell 18 → 2, and both survivors are the
  known ones: `header-actions-tied`/`wrapper-inserted` and
  `modal-primary-cta`/`siblings-reordered`. The second is the near-miss the
  contract was warned not to absorb — it did not; it still reports as a miss.
- **Arm B (answered)** — 77 trials: 32 honoured, 23 intent-violated, 20
  abstained, 2 wrong.

### Collection policy — decided

**Offer content-anchored (within-container). Do not offer ordinal inside a
collection.** Content-anchored honoured `pristine`, `class-rename`,
`wrapper-inserted`, `siblings-reordered`, `accessible-name-changed`,
`virtualized-remount` and `layout-reflow`; failed closed on `i18n-text-swap`,
`element-retagged` and `ab-variant-inserted`; **0 wrong in 33 trials**. On the
very mutation where ordinal produces a confident wrong click, it abstains.

Also settled, so it is not re-litigated: `relationship-context` /
`resolveStableKey` **cannot** express content-anchoring —
`relationshipReferenceMatches` matches only `semanticRole` and `stableKey`, and
`stableKeyMatches` reads id/name/data-testid/data-test/data-cy/data-qa/data-key.
Nothing in that path reads text. `within-container` + `containerLabelOf` is the
only content-anchored mechanism that exists today.

### The `containerLabelOf` gap — DECIDED: extend it (Step 5 scope)

Tables never work (0/11): a row carries its identity in a sibling
`<span role="cell">Globex</span>`, and `containerLabelOf` reads only
`aria-label`, `aria-labelledby`, `caption`/`legend`, and a direct-child heading.
Adding `aria-label="Globex"` to the row lifts it to 7/11 honoured, 0 wrong — so
the failure is the label lookup, not the policy.

**Extend `containerLabelOf` to fall back to a row's first cell text.** Do not
take the "require labelled rows" option. Requiring customers to add purpose-added
attributes so our targeting works is precisely the dependency our positioning
attacks in competitors — Pendo's surviving guides are the ones anchored to
purpose-added ids ([[competitor-targeting-evidence]]). Shipping the same
requirement for tables would recreate their weakness, and tables are the single
most common place per-row targeting is needed.

Address the apparent tension with "text is untrustworthy" explicitly in the ADR:
`localized-text` is non-durable as **inferred evidence**. A container anchor is
**declared author intent** — the author said "the Globex row". Those are
different things, and the anchor is being used to disambiguate an already-tied
set, not to establish identity. Note the practical corollary: content-anchoring
is strongest on proper nouns and data values (which is what table rows contain)
and weakest on translated UI strings — hence the honest `i18n-text-swap`
abstention.

### Tie fragility — added, and read it carefully

110 of 154 fragile. **Arm A 33/77 is the informative number. Arm B 77/77 is
near-vacuous** — a selection policy exists to settle a tie, so every Arm B trial
is in one by construction. Measure Arm B's fragility *before* policy application,
or the metric tells you nothing there.

Arm A splits: `table-row-action` 11, `pricing-card-cta` 11,
`header-actions-tied` 4, `sidebar-route-anchor` 3, `modal-primary-cta` 3,
`settings-labelled-input` 1.

Worth keeping visible: **`sidebar-route-anchor` scores 11/11 correct yet has 3
fragile trials** — it resolves through a name tiebreak sitting on top of a
durable-score tie. A page that looks perfect and is one point from trouble.

---

## Step 4 — Widen the corpus before fixing anything

Fixing against today's narrow corpus means measuring a fix with the wrong
instrument. Step 1 found two near-misses in 77 trials; a wider corpus will
almost certainly find more, and they should inform the fix.

Add these, roughly in value order. Each needs a fixture, a mutation, or both.

1. **Compound mutations — the most important addition.** Real redesigns are not
   one change. Apply 3-4 in one trial (class-rename + wrapper + reorder + copy
   edit). Each signal degrades a little; the combination is where a runner-up
   climbs above the target. Generate a bounded, deterministic set of
   combinations — do not brute-force the full power set, and log which
   combinations were sampled so the coverage is not silently partial.
2. **Generated / unstable ids.** Radix emits `id="radix-:r3:"`, Headless UI
   `id="headlessui-menu-button-4"`. They *look* like stable attributes and change
   every mount. Fixture: controls carrying such ids. Mutation: re-issue all
   generated ids with new counter values, and separately, swap two components'
   counters. **This is the highest wrong-resolution risk in the list, and we ship
   Radix in our own dashboard.** Also check what capture does with them — if they
   are recorded as `configured-attribute` evidence, that is a defect on its own.
3. **Tailwind utility soup.** Our `class-rename` models CSS Modules, not
   Tailwind. Tailwind is different in kind: every button carries the *same* long
   utility string, so class evidence is useless and non-discriminating. Fixture:
   siblings with identical utility strings. Mutation: a design tweak that
   rewrites a few utilities without touching structure.
4. **Portalled modal.** React renders modals outside their logical subtree, so
   `ancestor-context` captured in the component tree will not match the DOM tree.
   Our `modal-primary-cta` builds the dialog inline; add a variant portalled to
   `document.body`.
5. **RTL layout flip.** An Arabic locale sets `direction: rtl` and mirrors
   geometry, potentially invalidating `layout-slot`, `sibling-position` and
   `visual-topology` at once. Our `i18n-text-swap` changes text but not geometry.
   Relevant to our market.
6. **`requiredAction: 'click'` capture.** Step 1 found capture recorded
   `'anchor'` on **all 7 pages** because the harness passes no `MouseEvent`. The
   actionability guard has never been exercised. Add click-captured targets.
7. **Adversarial cases** — written with the explicit goal of forcing a `wrong`:
   two controls that swap places while keeping every durable signal; the target
   removed while a look-alike survives; two controls exchanging labels in a copy
   edit.
8. **Shadow DOM / iframe** — as a capability probe, not scored accuracy. There is
   an `unsupported_boundary` reason code; find out whether it fires.

**Explicitly out of scope for this harness:** hydration timing, lazy loading,
scroll containers, real computed styles, genuinely virtualized rows absent from
the DOM. jsdom cannot model these honestly and a fixture that pretends to tests
nothing. Note them for a future Playwright harness against `fixture-host`; do not
fake them here.

**Output:** widened corpus, full re-run, and the new near-miss and wrong counts.
If `wrong > 0` appears here, stop — that outranks the rest of this file.

---

## What Step 4 established — `wrong` is now 10

Corpus 154 → 494 trials, 15 fixtures, 31 mutation classes (21 atomic + 10
compound). Both pristine gates green. **`wrong` 2 → 10.** That is the harness
working: the corpus got 3.2x bigger and adversarial, and the defects were always
there.

Full register with severity, mechanisms and repro is in project memory under
`targeting-confirmed-wrongs`. Summary of the 8 new ones, all **Arm A, no policy
involved**:

- **3 × `target-removed`** — the lone survivor of a two-control dialog gets
  clicked. `modal-primary-cta` → "Cancel", `app-shell-modal` → "Keep it",
  `radix-dialog-trigger` → "Settings". **Structural:** the tie gate is the
  primary defence and it does not exist at one candidate —
  `runnerUpConfidence` is null, and the 55 floor is no real bar when the wrong
  element scores 93.50. Correct (`ambiguous`) whenever two look-alikes survive.
  The failure is specific to the two-control case, **which is the shape of every
  confirm dialog**, and the mechanism is symmetric — remove the other button and
  it clicks "Delete forever".
- **2 × `element-retagged` on `radix-dialog-trigger`** — plain `resolved`, **no
  drift flag**. Target loses `element-semantics` (−33 → 49.50), "Settings" keeps
  it at 82.50. `evidence-drift` never fires because the target still matches
  `semantic-attribute` (`aria-haspopup`). **This reverses 5b's risk assessment:
  the fixture does not manufacture a wrong, it removes one. 5b is now a
  wrong-fix.**
- **3 × `compound:redesign-plus-copy`** (reorder → class-rename → wrapper →
  copy edit). 126.50 vs 93.50 — Step 1b's `sibling-position` arithmetic exactly.
  **`siblings-reordered` alone still abstains on all three pages in the same
  run.** Add a copy edit and the drift becomes an annotation instead of a veto.
  Precisely what compound mutations were added to find.

### Test this before writing any of the Step 5 fixes

Four of the five mechanisms share one shape: **the resolver acts on an element
whose text contradicts, or fails to match, the captured `localized-text`.**

`evidenceContradiction(...) === 'wrong-element'` already catches *"the recorded
name is on a **different** candidate"* — that saved the Step 1b and Step 2
near-misses. It appears **not** to catch *"the recorded name is on **nobody**"*,
which is the `target-removed` case and is at least as dangerous: it means the
control the author picked is gone.

**Start Step 5a-1 by testing whether extending `evidenceContradiction` to the
name-matches-nobody case kills mechanisms 1, 2 and 3 at once.** If it does, this
is one defect class, not four, and the ADR should say so.

### Also found

- **Generated ids.** Headless UI ids are captured as durable
  `configured-attribute` evidence (`{"id":"headlessui-menu-item-3"}`);
  `isProbablyGeneratedValue` misses them. `generated-ids-swapped` scored **176.00**
  on the wrong element — a bigger margin than any near-miss on record — saved only
  by `evidence-drift`. **Radix is safe by accident:** `radix-:r5:` is rejected by
  `normalizedAttributeValue`'s URL-scheme regex reading `radix-:` as a scheme. A
  Radix release dropping the colons sails straight through. Add
  `isProbablyGeneratedValue` hardening to Step 5.
- **Actionability guard works, reports the wrong reason.** First time it has run.
  A disabled target reports `low_confidence`, not `not_actionable`, because
  `missingReasonCode` (resolve.ts:1404) only runs when the filter empties the pool
  entirely.
- **`unsupported_boundary` is a dead code path** — zero occurrences in
  `packages/sdk-runtime/src`. Closed shadow root and same-document iframe both
  report `no_candidates`, so a boundary failure is indistinguishable from an
  ordinary miss. Open shadow DOM and late-adopted roots **do** resolve.
- **The reason-code family is now three deep** (quorum-vs-floor,
  disabled-vs-low-confidence, boundary-vs-no-candidates). **Promote 5c from a
  footnote to a workstream** — it is the diagnostics layer Slice 4's drift-repair
  depends on, and every instance sends the author to fix the wrong thing.
- **Uninstrumented Tailwind is not targetable at all.** `tailwind-utility-soup`
  abstains on every trial — class is never captured, leaving `element-semantics`
  as the only durable family, one short of quorum. `tailwind-instrumented-cta`
  scores 28/28. Our answer is "instrument it", which sits awkwardly against the
  no-code-authoring goal. **Size this: what fraction of a real uninstrumented app
  is targetable?** Positioning question, not just engineering.
- **Harness trap for the ratchet:** a compound that skips everywhere reports 100%
  by reporting nothing. Two compounds initially ran zero trials; reordering them
  surfaced the 3 compound wrongs. **Step 7 must assert minimum trial counts per
  class**, not just outcomes.

---

## Step 5 — Apply the fixes

Only now: green suite, two arms, wide corpus. That is the regression net.

**Order for Step 5 (revised after Step 4): 5a-0, 5a-1, 5b, 5a, then
`isProbablyGeneratedValue`. 5c runs alongside as its own workstream.**

**5a-0 — `first` / `last` / `ordinal` must apply the text filter. DO THIS FIRST.**
The only confirmed `wrong` in the corpus, and it is in shipping code. Apply the
same `matchedItsText` filter `any-matching` already uses. Ordinal then means
"position N among candidates that look like the one you picked", which is what an
author intends; under `i18n-text-swap` the candidate set empties and it fails
closed, exactly as `any-matching` does today. While in there, establish **which
of these policies the look-alike card actually offers an author** — if `ordinal`
is selectable, the exposure is real.

**5a-1 — the single-candidate gap (`target-removed`). NEW, and broader than 5a-0.**
Three wrongs in Arm A with no policy involved, so it affects *every* tour, in the
exact UI shape where destructive actions live. **Begin by testing the unifying
hypothesis above** — extend `evidenceContradiction` to the name-matches-nobody
case and re-run; it may kill mechanisms 1, 2 and 3 together.

If a separate rule is still needed: a lone candidate has no comparative evidence,
so it is answering "does this look like what I captured?" rather than "is this the
best match?" Absolute identification needs *more* evidence than comparative
ranking, not less. Require a lone candidate to match at least one
**discriminating** family — one a sibling could not also match
(`configured-attribute`, `semantic-attribute`, `registry-contract`, or agreeing
`localized-text`). Matching only families every sibling shares identifies nothing.

**5a — `sibling-position` scoping (the near-miss).**
The guard is scoped to the wrong concept. The hazard is not "is this a
collection" but **"are these siblings interchangeable"** — same role, similar
accessible name, similar shape. A two-button modal footer is not a collection and
still suffered the exact failure ADR-0016 predicts. Rescope
`isInsideCollection`'s use here to interchangeability, or gate `sibling-position`
on the sibling set being *distinguishable*.

While there, resolve the asymmetry: `durableScore` includes supporting families
but `durableFamilyCount` excludes them. If a family is not durable enough for the
quorum, justify why it is durable enough to score in the durable comparison — or
remove it from that score.

**5b — `element-semantics`: role substitutes for tag (NOT fractional credit).**

*This supersedes the fractional-partial-credit proposal from Step 1. Step 2's
measurement disproved it.* Five of the six genuine near-misses lose by **exactly
33.00** — one whole `element-semantics` family. A retag does not merely fail to
identify the target; it demotes the target by precisely one family below every
look-alike that kept its `<button>` tag. Fractional credit would only *narrow*
that gap and leave the wrong element still leading. It has to close exactly.

The rule to implement: **an explicit ARIA role matching the captured semantic
role substitutes for the tag check specifically** — the other checks inside
`element-semantics` still have to pass. Do not let a matching role paper over a
failed accessible-name or type check; that would be far broader than the evidence
supports.

Predicted effect on the current corpus (from Step 2, to be re-verified against
the widened one): `modal-primary-cta` goes to 93.50 vs 93.50 with only the true
target carrying the captured name, so `localizedTextSafelyBreaksDurableTie`
should settle it correctly; the other three become ties among identical
look-alikes and stay `ambiguous`. No path to a new `wrong` is visible.

**The specific risk to measure:** on a page where the look-alikes are
`<div role="button">` and the captured target was a real `<button>`, this change
makes the look-alikes newly satisfy the family too. That is the case that could
manufacture a `wrong`. Build it into the Step 4 corpus before applying this fix.
**If it produces a single `wrong`, revert and report.**

**5c — Split the `low_confidence` reason code** so score-floor and family-quorum
failures are distinguishable. This one touches `packages/schema` and
`packages/sdk-runtime`, so treat it as a separate change and flag it. It matters
beyond debugging: the same code will drive the drift-detection repair hint shown
to authors, and "low confidence" when the truth is "not enough independent
signals" sends them to fix the wrong thing.

Re-run the full corpus after each fix and report **before/after per mutation
class, both arms, plus the near-miss delta** — not just the class you targeted.

---

## Step 5a-1 hypothesis result — and the decision it forces

**Confirmed as a mechanism, rejected in its literal form.** Extending
`evidenceContradiction` to name-matches-nobody kills all 8 Arm A wrongs
(`wrong` 10 → 2; the survivors are 5a-0's, since the selection policy runs at the
tie gate before `evidenceContradiction` is reached). **Mechanisms 1, 2 and 3 are
one defect class — the ADR must say so.**

But the change has two halves that behave completely differently:

- **The lift** (run the text check when no quorum-qualifying rival exists —
  remove the `rivals.length === 0` early return): **0 outcome changes, 0 test
  cost, shipped resolver suite green**, and 5 trials gain a `resolved_with_drift`
  they were silently missing — two of them the radix retag wrongs Step 4 flagged
  as "plain resolved, no drift flag". The resolver already had the contradiction
  in hand and threw it away because of the rivals guard. **Free. Land it alone.**
- **The flip** ("name on nobody" returns `wrong-element` instead of
  `changed-copy`): kills the compound trio, and makes `changed-copy` dead code.
  It breaks a shipped test, `wrong-element.test.ts > reports the copy changing
  without withholding the step`, which deliberately encodes the opposite rule:
  *"Nobody else claims the name: an edit, not a substitution."*

### The proposed fallback rule is dead — measured, not argued

"A lone candidate must match a discriminating family" reaches **2 of 8**:
`radix-dialog-trigger`'s wrong leader "Settings" carries `semantic-attribute`
(`aria-haspopup`), one of the rule's own named families, and 3 of the 8 are not
lone candidates at all. Tightening to *unshared* discriminating families does not
rescue it — it then vetoes the legitimate rename case too, because both buttons
in the shipped test also carry `aria-haspopup`. Do not spend more time on this
rule.

### This is an information problem, not a rule-design problem

When two controls are identical except for their text, and the captured text now
matches nobody, **"renamed" and "replaced" are both consistent with the
evidence.** The resolver cannot tell them apart because the information is not
there. Stop hunting for a discriminator; **choose the failure mode.**

The costs are wildly asymmetric:

- Treat it as *renamed* (today) → resolves → risk of a confident wrong click,
  potentially on a destructive control. **Unbounded cost, inside a customer's
  product.**
- Treat it as *gone* (the flip) → abstains → a legitimate copy edit stops the
  tour until it is re-pointed. **Bounded cost.**

**The shipped rule was correct when it was written and the trade has since
moved.** It was authored when an abstention meant a dead tour with no recovery
path. Slice 4's drift-detection loop changes that: an abstention becomes a
notification plus a one-click re-point. Lowering the cost of abstaining changes
which default is right.

**So: take the flip, and pay for it on the recovery side.** The drift
notification for this case should name the shape — "the control you targeted may
have been renamed" — and offer the surviving candidate for one-click
confirmation, not a re-author. That turns a false abstention into five seconds of
author time and dissolves the dilemma. Design that notification as part of the
same change; do not land the flip without it.

### Before landing the flip, close the corpus blind spot

The corpus priced the flip at 3 contract-neutral trials
(`toolbar-testid-button`, `tailwind-instrumented-cta`, `wizard-next-click`, all
on `labels-exchanged`, all `correct` → `abstained`). **That price is wrong**, and
the harness cannot see why: no mutation renames a target in place to unrelated
words. `accessible-name-changed` appends `" now"`, and `localizedTextContradicts`
requires zero shared words, so it never fires on the true target.

Add that mutation — a full in-place rename to unrelated words — and re-price
before deciding.

**Lesson for the ADR and the ratchet: a missing mutation class is a silent bias,
not a neutral gap.** It made this change look cheaper than it is. Same family as
"a compound that skips everywhere reports 100% by reporting nothing". Note also
that a **hand-written shipped unit test caught what the 494-trial corpus could
not** — the corpus supplements the resolver suite, it does not supersede it.

### Order

1. Land the lift alone. Free, and it un-silences two wrongs.
2. Add the in-place-rename mutation; re-price the flip.
3. Decide the flip on the cost asymmetry above, together with its drift
   notification. Do not treat it as a search for a discriminator.

---

## Flip re-priced — REJECTED in universal form, decision DEFERRED

Lift landed (resolve.ts:1063, rivals guard moved onto `supportingEvidencePointsElsewhere`):
515 trials, 0 outcome changes, 5 reason-code upgrades to `resolved_with_drift`,
147/147 shipped resolver+bridge tests green. Keep it.

New atomic class `accessible-name-rewritten` re-priced the flip:

| | old (494) | re-priced (515) |
|---|---|---|
| Arm A wrongs killed | 8 | 8 |
| correct → abstained | 3 | **12** |
| — contract regressions | 0 | **9** |

**Reject the universal flip.** The count quadrupled but the *shape* is the
finding: benefit is confined to 3 pages, all two-control confirm dialogs; cost
lands on **9 of the 10 non-ambiguous pages — every shape measured**. Renaming a
button becomes a universal tour-stopper, including on three pages where a
surviving hand-authored `data-testid` pins the element beyond any doubt.
Abstaining there is not caution, it is discarding the best signal on the page.

**The decisive argument is not the 9 trials — it is the notification channel.**
The flip's cost is a drift alert on every copy edit, and copy edits are among the
most frequent things a product team ships. A drift channel that cries wolf on
every button rename gets muted, and then the real breakages get muted with it.
Notification credibility *is* the differentiator ("notify, don't fail silently");
spending it to catch three dialog cases is a bad trade.

### Do not decide the flip yet — re-price it against the RESIDUE

The flip is being judged against 8 wrongs, but **5 of those 8 have their own
targeted fixes already queued**:

- Mechanism 3 (compound trio, 3 wrongs) is Step 1b's `sibling-position`
  arithmetic — **5a should kill it independently.**
- Mechanism 2 (radix retag, 2 wrongs) is the `element-semantics` conjunction —
  **5b should kill it independently.**

That would leave mechanism 1 (`target-removed`, 3 wrongs) as the flip's only
unique contribution. **Land 5a-0, 5a and 5b first, then re-measure.** If only the
three lone-survivor cases remain, the right instrument is a narrow rule for that
case, not a universal veto costing 9 regressions.

### The conditional variant worth testing — and why its rejection was circular

Claude Code flagged a shape-conditional flip without proposing one. The condition
should not be "two-control dialog" but: **does the winning candidate match
evidence that no rival in the current DOM could also match?** Uniqueness
evaluated at resolve time, not family membership.

This is *not* the dead lone-candidate rule. That one was rejected because
"Settings" carries `aria-haspopup` — but `aria-haspopup` is **shared** by both
buttons, so it is present and not unique. The unshared variant was then rejected
because it also vetoes the shipped rename unit test — **but that test is the
artifact whose contract is under review.** Rejecting the rule because it
contradicts the assumption being questioned is circular. Re-evaluate it on corpus
economics with the unit test's expectation held open.

Expected split on this corpus: instrumented pages (`toolbar-testid-button`,
`tailwind-instrumented-cta`, `wizard-next-click`, `sidebar-route-anchor`) keep
resolving; the uninstrumented dialogs abstain. That recovers most of the cost
while keeping the benefit. **Measure it, do not assume it.**

### Structural finding — selection policies bypass the contradiction check entirely

Arm B's 7 new trials are untouched by the flip because **`applySelectionPolicy`
resolves at the tie gate, before `evidenceContradiction` ever runs.** Same
structural fact behind the 5a-0 wrongs. Whichever way the flip is decided, **it
protects no tour that declared a policy.**

This is a layering problem larger than the flip: the safety check sits downstream
of the mechanism that most needs it. Raise it as its own ADR question — should
contradiction detection run *before* policy application?

### Ratchet bookkeeping

`accessible-name-rewritten` carries `expectation: 'resolve'`, encoding today's
un-flipped contract. If a flip ever lands, that expectation must change in the
same diff or the class reads as a permanent 9-trial regression.

---

## Consolidation after 5a-0 + tripwire + 5a measurement

**Arm B is clean: 294/294 contract, 0 wrong, no intent-violations on any rank
policy.** Corpus 662. The whole selection-policy layer is done.

Landed: text filter extended to `first-in-collection` / `newest-in-collection`
(which were live-wrong — both clicked the A/B button on
`table-row-action-sorted`); set-shrink tripwire (45 intent-violated → abstained,
**zero honoured lost**), armed only where `ambiguityIsSoleWeakness === true`.
`within-container` deliberately left unfiltered — it names a container rather
than a rank and already refuses unless exactly one candidate is inside, so
filtering would make it resolve *more*.

### Two corrections to earlier guidance in this document

- **The `durableScore` / `durableFamilyCount` asymmetry is load-bearing — keep
  it.** Step 1 flagged it as a suspected defect; that was wrong. Measured:
  removing `sibling-position` from `durableScore` buys the same 3 wrongs but
  costs **30 correct → abstained** (Arm A met 338 → 316) and breaks six shipped
  tests. The existing justification at `SUPPORTING_DURABLE_FAMILIES` stands, now
  with evidence.
- **5a is not an independent step.** Its literal rule ("same role, similar name,
  similar shape") fires on none of the three targets — Cancel/Send invites,
  Keep it/Delete forever, Settings/Invite people all have *different* names. The
  rule that does fire is durable-shape identity, which is exactly what
  `sibling-position.test.ts > separates sibling controls that differ only in
  their words` exists to protect. That is a deletion, not a rescope.

### The 8 remaining wrongs are really 2 + 6

- **2 independent** — `element-retagged` on `radix-dialog-trigger`. **5b. Do this
  next.** Its risk assessment already inverted: the fixture does not manufacture
  a wrong, it removes one.
- **6 are one decision** — 3 `target-removed` + 3 `compound:redesign-plus-copy`.
  5a's reformulation ("drop `sibling-position` when the captured copy matches
  nobody") kills the compound trio but costs 10 correct → abstained and **breaks
  the same shipped test the flip breaks, for the same reason.** Both key off
  *the captured words match nobody*; that test encodes *matching nobody is an
  edit, resolve anyway*. The resolver cannot separate "Import renamed to Upload,
  nothing moved" from "Send invites renamed and the footer reordered" — both
  present as slot match + copy matches nobody.

**Fold 5a into the deferred flip decision. One ADR question, not three.**

Also established: the veto must be asked of the **whole set**, not per-candidate.
The per-candidate form traded 3 wrongs for 3 different ones (`labels-exchanged`
on three pages) — disarming the slot let the impostor that took the name win
clean instead of tripping the drift veto. If the copy landed on *someone*, it
moved rather than vanished, and moved copy is the veto's business.

### The cut that may dissolve the deadlock — TEST THIS BEFORE DECIDING

Every option so far has been binary (resolve vs abstain) and universal. The
missing variable is **`requiredAction`**, which the identity already carries.

The costs are not symmetric across step types:

- A step that **points or highlights** the wrong element is annoying.
- A step that **clicks or types** on the wrong element is destructive — and
  `target-removed` is dangerous precisely because it is a click on a confirm
  dialog.

**Proposal: gate the copy-matches-nobody veto on `requiredAction`.** Highlight /
anchor steps keep resolving with drift (today's behaviour, cheap). Action steps —
click, type, submit — refuse. That puts benefit and cost in the *same place*,
which was the core objection to the universal flip (benefit on 3 pages, cost on
9). Copy edits on highlight steps stop generating drift alerts, so the
notification-fatigue objection largely dissolves too.

**The corpus cannot price this yet.** Step 4 found capture recorded
`requiredAction: 'anchor'` on essentially every fixture; only `wizard-next-click`
captures a click. **Before deciding: re-capture the confirm-dialog fixtures
(`modal-primary-cta`, `app-shell-modal`, `radix-dialog-trigger`) and the rename
fixtures with `requiredAction: 'click'`, then re-price the flip and 5a under an
action-gated rule.** Report the four-way split: action-step benefit,
action-step cost, highlight-step benefit, highlight-step cost.

### Heuristic worth keeping — the bug lives in the most-offered path

Three occurrences now, and each time the defect sat in the *most reachable*
surface, not the most obscure: `automaticSelection` writes ordinal **silently,
with no author involvement**; `lookAlikeQuestion` offers `first` unconditionally;
and `first-in-collection` / `newest-in-collection` are the **first two answers
offered inside a collection**. **Rank remaining defects by exposure, not by
corpus trial count.** Trial count is not exposure.

---

## DECIDED 2026-08-22 — action-gated flip approved, 5a dropped

Shayeb approved the safe direction. The decision, settled:

- **Take the flip, gated on `requiredAction`.** Action steps (`observe-click`,
  `focus`, `input`) refuse when the captured copy matches nobody; highlight /
  `anchor` steps keep resolving with drift. Measured 9 benefit / 7 cost, and it
  takes `wrong` to **0** in both regimes.
- **Drop 5a entirely.** The gated flip covers everything 5a would have fixed and
  more; 5a's ratio is 3 : 10 gated or ungated, and it breaks
  `wrong-element.test.ts`. It is now redundant *and* a bad trade. Remove it from
  the plan rather than deferring it.
- **Land the disabled-target case in the same change.** Switching the confirm
  dialogs to `observe-click` capture created 3 wrongs on its own, before any
  rule: the actionability filter drops a disabled target from the pool, leaving
  one rival to resolve unopposed. Same single-survivor trap, second route in, and
  far more common in real apps than deletion (invalid form, loading state,
  missing permission).

### The condition attached to this decision

The action gate is what makes "be safe" affordable. Safety here is paid for in a
currency the corpus cannot see: **author trust in the notifications.** Every
unnecessary stop trains someone to ignore the alerts, and once the alerts are
ignored the real breakages are ignored too — which destroys the actual
differentiator. The universal flip was rejected on exactly this ground.

So the 7 remaining costs are only acceptable if the repair path exists.
**The drift notification plus one-click re-point is now part of this change, not
a later phase.** Without it, this ships broken tours with an explanation. With
it, a rename costs the author five seconds.

### After this closes — the balance has to swing back

Of every fix in this whole effort, only 5b improved *finding*; it turned 13
abstentions into correct resolutions. Everything else made the resolver refuse
more. That was the right order — a confident wrong click is disqualifying — but
**nothing is currently defending recall**, and three more rounds of this produces
a very safe resolver that resolves too little to sell.

Next phase is the opposite problem, with the same rigour: **uninstrumented pages
are largely untargetable today** (`tailwind-utility-soup` abstains on every
trial — one durable family, quorum needs two). The fix is not lowering the quorum
— that manufactures wrongs, now well evidenced — but finding more sources of
durable evidence in plain DOM: label→input and heading→section relationships,
landmark containment, position within a *labelled* container, and declared author
anchors treated as durable. That workstream decides whether a non-technical
customer can author at all, which is the stated product goal.

---

## Step 6 — Re-measure

Fresh full run, both arms, wide corpus. This is the number that gets frozen.
Report it in full, near-misses included.

---

## Step 7 — Ratchet, not thresholds

**Do not gate on a single global percentage.** One number lets a regression in
one class hide behind a gain in another, and a single trial is worth over a
percentage point at this corpus size.

- Commit a **baseline snapshot** (JSON): per-arm, per-mutation-class trial counts
  by outcome, **plus the near-miss count**.
- Assert **no class got worse than the snapshot**, by count.
- A failure names the exact arm, class and delta.
- Improvements also fail, with a message telling the human to update the snapshot
  deliberately. An improvement should be a diff someone accepts, never silent
  drift.
- Provide a documented way to regenerate it, and state in the file header that
  regenerating is a human decision.

Absolute, and **not** thresholds:

- `wrong === 0` — every class, every arm, always.
- The pristine gate — expected outcomes on unmodified pages, or the run is void.

Near-misses are ratcheted but not absolute: they should trend down, and any
increase is a regression worth failing on.

---

## Step 8 — Write it up

`docs/adr/0029-targeting-accuracy-measurement.md`, following the existing ADR
format: what the harness measures and what it deliberately does not; the outcome
model including `near-miss` and `intent-violated` and why each is distinct from
`wrong`; the two-arm split and why an unanswered tie *should* abstain; the
collection selection-policy recommendation; the ratchet contract; and the
jsdom/Playwright boundary.

Append a short section to `docs/PROGRESS.md` under the current phase.

**Claim discipline — state this in the ADR explicitly.** These numbers are an
internal engineering baseline: for prioritisation, for drift-detection
thresholds, and for design-partner conversations. They do not go on the website
or into marketing copy. The corpus is small and self-authored, and — given the
near-miss finding — a "zero wrong" or "96%" claim would be actively misleading
today.

---

## Throughout

Numbers matter more than code. If `wrong` is ever non-zero, that outranks
everything else here: stop, report it with the exact arm, page, mutation and both
elements, and do not fix the resolver in the same pass.
