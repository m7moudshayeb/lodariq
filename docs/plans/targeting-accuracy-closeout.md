# Task: targeting accuracy — closeout and next phase

Steps 1–7 are complete. `wrong = 0` across 662 trials in both arms, the ratchet
is in place and verified. Full history is in
`docs/plans/targeting-accuracy-next-steps.md`; read it for context, but the work
below is what remains.

**Standing constraints:** do not commit, do not push, do not run `pnpm format`,
do not run the full `pnpm verify`. **Stop and report after each numbered
section.**

---

## 1. Near-miss export — APPROVED, land it and measure

Near-miss is `unmeasured` on 662 of 662. **A clean `wrong = 0` with no
visibility into how close it came is exactly the false confidence this effort
existed to destroy** — Step 2 found the wrong element had already won the
ranking twice, with one check standing between it and a wrong click.

Apply the proposal in `packages/tests/targeting-accuracy/NEAR-MISS-PROBE.md`.
The deciding argument is not the test: **Slice 4's drift-repair UX needs the same
candidate ranking** to tell an author *why* their step broke ("a different
control now scores higher than the one you picked"). This is a down payment on
the product feature, not scaffolding.

Three conditions on the export:

- **It must not ship enabled.** Dead-code-eliminable, or proven free against the
  `public-bootstrap` 6 KiB budget and the `forbiddenStatic` assertions.
- **It must never serialise.** Hand live references synchronously, documented as
  must-not-retain. The existing telemetry boundary deliberately retains no DOM
  references, and candidate identity in a customer's table row can carry PII. Sit
  beside that boundary, do not breach it.
- **Extend rather than duplicate** if widening `setResolutionTelemetryObserver`
  is cheaper than a second hook.

Then measure near-miss across all 662 and report: the count, every case where the
wrong element led, and which check caught it. Add near-miss to the ratchet
baseline as a real number rather than `unmeasured`.

**Also report the tie-fragility number alongside it.** 412 of 662 within half a
point is the figure to watch hardest — any future scoring change can convert
those, and 5b was exactly that kind of change.

## 1b. What section 1 established — fold these into the ADR

**Section 1 is DONE.** `setResolutionRankingObserver` landed, off unless asked,
+93 bytes gz in the resolver chunk. Near-miss measured and ratcheted per arm.

Three findings the ADR must carry:

- **Near-miss, Arm A: 123 of 368 ranked the wrong element first — all 123
  abstained.** 38 cleared the tie gate and were stopped only by a later veto
  (evidence-drift 24, family-quorum 8, not-actionable 3, score-floor+quorum 3). Of
  those 38, 29 had the true target still on the page ranked #2/#3, 28 losing by
  exactly 33.00. Say it this way in the ADR: **not "never close" but "close often,
  and caught every time"** — far more defensible than a bare zero.
- **Hard constraint for section 6 — do NOT lower the two-family quorum.** Eight
  near-misses were stopped by the quorum *and nothing else*: the wrong element
  outscored the target and cleared the margin gate. They sit on
  `tailwind-utility-soup`, `role-button-lookalikes`, `identical-twin-controls` —
  exactly the uninstrumented pages the recall phase targets. Lowering the quorum
  converts those eight directly into confident wrong clicks. This is measured, not
  argued.
- **Near-miss must stay split by arm.** Merged it reads 399 and means nothing: in
  Arm B the author declared a policy precisely so ranking would not decide, so
  "ranked wrong first" there is the system working. Merging would manufacture a
  scary number out of correct behaviour.

Also record the **observer-separation reasoning**, which is better than the
condition it answered: telemetry carries numbers and enum strings *shaped to be
sent*, and a candidate inside a customer's table row can be a person. A live
element cannot leave the page; a description of one can. Merging the two
observers would have put DOM identity into the serialisable channel. They stay
side by side.

**Out-of-scope finding to record as a known gap, not fix here:**
`check-size.mjs` totals only static import graphs, so the resolver — reached only
via `import()` — is in **no measured budget**, while `public-bootstrap` sits on 5
bytes of headroom and `runtime+tour` on 105. ADR-0027's idle-page-cost guarantee
is weaker than documented while the playback path is unmeasured. Full write-up in
project memory under `sdk-size-budget-blind-spot`; it is its own work item.

---

## 2. ADR 0029 + PROGRESS.md

Write `docs/adr/0029-targeting-accuracy-measurement.md` in the existing ADR
format, once section 1's numbers are in hand so it records the complete picture.
It must cover:

- What the harness measures and **what it deliberately does not** (the
  jsdom/Playwright boundary: hydration timing, lazy loading, scroll containers,
  real computed styles are out of scope and must not be faked).
- The outcome model — `correct` / `abstained` / `wrong`, plus `near-miss` and
  `intent-violated` — and why each is categorically distinct from `wrong`.
- The two-arm split, and why an unanswered look-alike tie *should* abstain.
- Every fix and its rationale: the text filter across all rank policies, the
  set-shrink tripwile, the lift, 5b's role-substitutes-for-tag, the
  **action-gated** copy-matches-nobody veto (and why the universal form was
  rejected — notification fatigue destroys the differentiator), and the
  disabled-target rule.
- **Why 5a was dropped, not deferred**, and why the `durableScore` /
  `durableFamilyCount` asymmetry is load-bearing and must stay.
- The whole-set vs per-candidate finding: if the copy landed on someone it moved
  rather than vanished, and moved copy is the drift veto's business.
- The ratchet contract, including that improvements fail as loudly as
  regressions and that regeneration still fails the run.
- The two blind spots: near-miss (resolved by section 1) and tie fragility.

**Claim discipline — state it explicitly in the ADR.** These are internal
engineering numbers: for prioritisation, for setting drift thresholds, and for
design-partner conversations. **They do not go on the website or into marketing
copy.** The corpus is self-authored, and a "zero wrong" claim without the
near-miss and tie-fragility context would be misleading.

Then append a short section to `docs/PROGRESS.md` under the current phase.

## 3. `isProbablyGeneratedValue` hardening

Headless UI ids (`headlessui-menu-item-3`) are captured as **durable**
`configured-attribute` evidence. `generated-ids-swapped` scored **176.00** on the
wrong element — the largest wrong-margin on record — saved only by
`evidence-drift`.

**Radix is safe by accident, not by design:** `radix-:r5:` is rejected by
`normalizedAttributeValue`'s URL-scheme regex reading `radix-:` as a scheme. A
Radix release that dropped the colons would sail straight through, and we ship
Radix in our own dashboard.

Harden the filter properly, add corpus cases for the common generators
(Headless UI, Radix, MUI, Emotion, React `useId`), and report the before/after.
Treat the current Radix pass rate as coincidence to be replaced, not evidence.

## 4. Reason codes (5c)

Three instances, one product consequence — **the author is sent to fix the wrong
thing, and Slice 4's drift-repair inherits every one of them:**

- `low_confidence` cannot distinguish a score-floor failure from a
  family-quorum failure (resolve.ts:422-432, one shared return). This already
  cost a diagnosis round in Step 1.
- `unsupported_boundary` has **zero occurrences** in `packages/sdk-runtime/src`.
  A closed shadow root and a same-document iframe both report `no_candidates`, so
  a boundary failure is indistinguishable from an ordinary miss. (Open shadow DOM
  and late-adopted roots *do* resolve — record that as real capability.)
- Confirm the disabled-target reason code now reports `not_actionable` in every
  case it should, not only when the filter empties the pool entirely
  (`missingReasonCode`, resolve.ts:1404).

This touches `packages/schema` and `packages/sdk-runtime` — flag it as a
separate change.

## 5. Disambiguation card — write the spec, do not build it

The Arm B data is a product finding: **`content-anchored` is the only policy that
survives a redesign** (31/63 honoured, 32 abstained, 0 violations), while
`first` / `last` / `any-matching` honour intent essentially never (13–17
violations of 21 trials per page).

Write a short spec (not code) covering:

- Which answers the card should stop offering, and what replaces them.
- That the card should be **shape-aware**: on a toolbar or footer tie those three
  policies collapse into one operation and should be presented as one plainly
  worded answer; inside a collection they genuinely diverge and content-anchored
  should lead.
- That `automaticSelection` writes `{kind:'ordinal'}` **silently, with no author
  involvement** — decide whether that should continue now that the evidence says
  ordinal is the weakest surviving policy.
- The `containerLabelOf` extension already decided: fall back to a row's first
  cell text, so tables work without customers adding `aria-label` to every row.
  Requiring purpose-added attributes is the dependency our positioning attacks in
  competitors.

## 6. Next phase — recall

**Only 5b improved finding; every other fix made the resolver refuse more.** That
was the right order — a confident wrong click is disqualifying — but nothing is
defending recall, and more rounds like this produce a very safe resolver that
resolves too little to sell.

The clearest evidence is already measured: **`tailwind-utility-soup` abstains on
every trial** — class is never captured, leaving `element-semantics` as the only
durable family, one short of quorum — while `tailwind-instrumented-cta` scores
28/28. On a plain page with no instrumentation, we can target nothing at all.

**Do not lower the quorum.** That manufactures wrongs, and this effort has
produced ample evidence for it. Find more sources of *durable* evidence in plain
DOM instead. Start by scoping, not building:

1. Measure the real size of the problem — across the corpus's uninstrumented
   fixtures, what fraction of targets can reach two durable families today, and
   which family is the missing second one in each case?
2. Assess candidate new sources against that data: `label`→input and
   heading→section relationships, landmark/region containment, position within a
   *labelled* container (the `containerLabelOf` extension is the first instance),
   and declared author anchors treated as durable evidence rather than inferred
   text.
3. Report which would move the most targets over the quorum line, and what each
   would cost in `wrong` risk — measured against the full corpus and the ratchet,
   not argued.

This decides whether a non-technical customer can author without a developer,
which is a stated product goal. Treat it with the same rigour as the safety work:
measure first, and let the ratchet price every change.
