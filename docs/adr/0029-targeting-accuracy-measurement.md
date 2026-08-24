# 0029. Targeting accuracy is measured against a mutation corpus, and ratcheted

- Status: Accepted
- Date: 2026-08-23
- PRD references: §8.1–§8.6, §16.4, §20
- Related: ADR 0008 (confidence-scored resolver), ADR 0016 (Target Identity V2),
  ADR 0009 (test surface), ADR 0027 (idle-page cost)

## Context

ADR 0008 and ADR 0016 describe a resolver that scores candidates against
multi-family evidence and refuses to answer unless the winner clears a
confidence floor, reaches a family quorum, and beats the runner-up. Every one of
those thresholds was chosen by judgement. None of them had ever been measured.

That is a specific kind of danger. A resolver that fails loudly is a support
ticket; a resolver that resolves _confidently onto the wrong element_ clicks a
button the visitor did not choose, inside the customer's own application, with
our name on it. The failure mode we most needed a number for was the one the
existing tests were least able to produce, because unit tests are written from
the same intuition as the code they cover.

So the question this ADR answers is not "does the resolver work". It is: **when
the customer's page changes underneath a saved target, how often does the
resolver get it wrong, and how close does it come the rest of the time?**

## Decision

### A mutation corpus, run as an ordinary test

`packages/tests/targeting-accuracy/` holds host pages that mimic real
application shapes — a toolbar of similar buttons, a Radix dialog trigger, a
Headless UI menu, a table of identical row actions, a Tailwind page with no
instrumentation at all, a two-button confirm modal, a wizard with a disabled
Next. Each page is captured the way an author would capture it, then **mutated**
the way a product team ships changes: classes renamed, wrappers inserted,
siblings reordered, copy rewritten, elements retagged, ids reissued, the target
deleted, labels exchanged between neighbours. Compounds chain those into named
releases a team could plausibly ship in one sprint.

Every (page × mutation) pair is one trial, scored against a **contract declared
per mutation** — resolve, abstain, or either. The corpus is 662 trials.

This is a Vitest suite in jsdom, not a Playwright run, and that boundary is
deliberate.

### What the harness deliberately does not measure

jsdom has no layout engine, no real cascade, no network, and no scheduler. The
harness therefore **does not** measure:

- **Hydration timing.** A target that exists only after React hydrates, and the
  race between playback and that moment.
- **Lazy loading and virtualization.** A row that is not in the DOM until the
  user scrolls to it.
- **Scroll containers and real viewports.** Whether the resolved element is
  reachable, and what `scrollIntoView` does inside a nested overflow container.
- **Real computed styles.** Visibility here is a synthetic approximation
  (`applySyntheticLayout`), not `getComputedStyle` over a real cascade.

Those belong to the runtime lifecycle layer and to Playwright, and they are
tested there. The rule that keeps this honest: **the harness must never fake
them.** Adding a hand-written stub for hydration timing would produce a number
that reads like browser evidence and is not, which is worse than the gap. Where
the corpus cannot see something, it reports that it cannot see it.

The same rule produced the `unmeasured` state for near-miss (below) rather than
a comfortable zero.

### The outcome model

Five outcomes, and the whole point is that four of them are **not** `wrong`:

| Outcome           | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `correct`         | Resolved onto the element the author picked.                     |
| `abstained`       | Declined to answer: `needs_review`, `ambiguous`, or `missing`.   |
| `wrong`           | Resolved confidently onto a **different** element.               |
| `near-miss`       | The wrong element **led the ranking**, whatever the outcome was. |
| `intent-violated` | Obeyed the author's declared policy; the page moved.             |

`wrong` is the only disqualifying outcome and is asserted at zero. `abstained`
is a cost, not a defect — a tour that stops and says so is recoverable, and a
`needs_review` is exactly the drift notification the product is built around.

`near-miss` is the one that makes `wrong = 0` mean anything. A trial that
abstained because nothing matched is ordinary caution. A trial that abstained
because _one veto_ stopped a wrong element that had already won the ranking is a
bullet dodged, and it is the better predictor of the next `wrong`. Those two
look identical from outside: every abstention returns `element: null`.

`intent-violated` is not a resolver defect at all. It is a finding about the
_policy the author chose_ — the resolver did what it was told and the page moved
underneath. Folding it into `wrong` would blame the resolver for obeying.

### Two arms, never merged

The corpus runs every mutation twice:

- **Arm A — `unanswered`.** The author was asked "which of these three?" and
  never answered. On a look-alike page the contract is therefore **abstain**, and
  resolving is the failure.
- **Arm B — `answered`.** The author declared a selection policy, so the trial is
  scored on whether that _intent_ survived, not on whether it landed where Arm A
  would have.

Their totals are never combined. One percentage across both would describe
nothing, because the same behaviour is a pass in one arm and a failure in the
other.

The Arm A contract deserves stating plainly, because it inverts the intuitive
metric: **on a tie of genuine look-alikes, abstaining is the correct answer.**
Three identical "Manage" buttons in three table rows carry identical evidence.
Picking one is a coin flip presented as a decision, and it is a coin flip the
visitor pays for. The resolver is supposed to ask, which is what the
disambiguation card exists for. `table-row-action`, `pricing-card-cta`,
`tailwind-utility-soup`, `role-button-lookalikes` and `identical-twin-controls`
abstain on 100% of trials, and that is the target behaviour, not backlog.

### Results at the time of writing

**Arm A: 368 trials, 346 met contract (94%), 0 wrong.** 192 correct, 176
abstained. Every miss is an abstention where a resolve was recoverable — the
safe direction. The three adversarial classes written specifically to force a
wrong all held: `target-removed` abstained 10/10; `labels-exchanged` abstained 8
and resolved 2 correctly; `lookalikes-swapped` abstained 6 and resolved 4
correctly.

**Arm B: 294 trials, 0 policy violations.** 84 honoured, 88 intent-violated, 122
abstained.

### Near-miss: not "never close", but "close often, and caught every time"

This is the sentence the ADR exists to record, and it is more defensible than a
bare zero.

Near-miss cannot be derived from the public result — every abstention nulls
`element`, `confidence` gives scores but not identities, and every ranking helper
is module-local. It needed one new export,
`setResolutionRankingObserver` (see `NEAR-MISS-PROBE.md`). Until that landed the
harness reported `unmeasured` on 662 of 662 rather than `0`.

Measured, **Arm A: 123 of 368 trials ranked the wrong element first — and all
123 abstained.** 45 where evidence genuinely favoured the leader, 78 exact ties
where sort order alone decided.

**38 of those cleared the tie gate**, meaning the margin rule would not have
stopped them and only a later veto did:

| Veto                            | Trials |
| ------------------------------- | ------ |
| `evidence-drift`                | 24     |
| `family-quorum`                 | 8      |
| `not-actionable`                | 3      |
| `score-floor` + `family-quorum` | 3      |

Of the 38, nine had no right answer left (`target-removed`, `control-disabled`).
The other **29 had the true target still on the page, ranked #2 or #3 and
losing** — 28 of them by exactly **33.00**, one whole evidence family.

Near-miss is reported and ratcheted **per arm, never merged**. Merged it reads
399 of 662 and means nothing: in Arm B the author declared a policy _precisely
so the ranking would not decide_, so "ranked the wrong one first" there is the
system working as designed. Merging would manufacture an alarming number out of
correct behaviour.

### The two-family quorum must not be lowered — measured, not argued

Eight near-misses were stopped by `MIN_INDEPENDENT_IDENTITY_FAMILIES` **and
nothing else**: the wrong element out-scored the target _and_ cleared the margin
gate, and the family quorum was the last check standing. They sit on
`tailwind-utility-soup`, `role-button-lookalikes` and `identical-twin-controls`.

Those are exactly the uninstrumented pages the recall phase targets, and
lowering the quorum is the obvious way to make them resolve. **It would convert
those eight directly into confident wrong clicks.** Recall work must find _more
durable evidence_, never a lower bar. This constraint is binding on future
changes and is the reason the number is recorded here rather than in a plan.

### The ranking observer stays separate from the telemetry observer

The obvious economy — widen `setResolutionTelemetryObserver` rather than add a
second hook — was rejected, and the reasoning generalises beyond this case.

Telemetry carries numbers and enum strings: timings, pool sizes, a state. It is
**shaped to be sent somewhere.** The ranking sample carries live `Element`
references for losing candidates, and a candidate inside a customer's table row
can be a person. **A live element cannot leave the page; a description of one
can.** Handing live nodes is therefore the privacy-preserving choice, and merging
the two observers would have put DOM identity into the channel designed for
serialisation.

They stay side by side. The ranking sample is synchronous, valid for the call
only, and documented must-not-retain. It is `null` until someone subscribes, and
the publish site is an optional call, so the sample object is never constructed
for a page nobody is measuring.

### The fixes, and why each one is shaped the way it is

**The text filter applies to every rank policy, not just `any-matching`.**
`first`, `last`, `ordinal`, `first-in-collection` and `newest-in-collection` were
re-indexing over _every_ tied candidate rather than over the ones that looked
like what the author picked. "The second Manage button" then silently meant "the
second thing here", and an A/B variant inserted above the target moved the
answer. This produced the corpus's first confirmed `wrong`, and the same shape
recurred on each policy as its case was added — four occurrences of one defect.
`within-container` is deliberately exempt: it names a container rather than a
rank and already refuses unless exactly one candidate is inside, so filtering
there would make it resolve _more_ often, which is a different question.

**The set-shrink tripwire.** A rank is only meaningful relative to the set it
ranks. If the filtered set is smaller than the set counted at capture, the
policy abstains rather than re-index onto a survivor. This needs no schema
change — `captureEvidence.uniqueCandidateCount` already records the counted set —
and is gated on `ambiguityIsSoleWeakness` so the two independently-measured
counts are only compared when they provably describe the same set. That gate is
reasoning, not measurement: every policy page in the corpus has a uniform tie, so
the corpus cannot detect a mismatch there.

**The lift.** `evidenceContradiction` had an early return that skipped the
localized-text check whenever no quorum-qualifying rival existed. The resolver
already held the contradiction and discarded it. Removing the guard: 0 outcome
changes, 0 test cost, and 5 trials gained a `resolved_with_drift` they had been
silently missing.

**5b — an explicit role substitutes for the tag it was built from.** A design
system reimplementing `<button>` as `<a role="button">` demoted the target by
exactly one family — the 33.00 signature — below every look-alike that kept its
tag. Fractional partial credit was proposed first and **disproved by
measurement**: it would only narrow the gap and leave the wrong element leading.
Only the tag check yields, only to an explicitly _declared_ role, and the rest of
the family still has to match. A bare retag with no `role` is refused: an anchor
is a link until the product says otherwise, and the tag was the only statement of
kind it made. This is the only fix in the whole effort that improved _finding_
rather than refusal, and the ranking data confirms it — `element-retagged` was 4
of 6 outscored near-misses before, and is 0 of 45 now.

**The copy-matches-nobody veto, gated on `requiredAction`.** When the recorded
copy matches no candidate, that reads equally well as a rename and as a different
control standing where ours used to. The universal veto — always refuse — was
**rejected**, and not on the trial count. Its cost is a drift alert on every copy
edit, and copy edits are among the most frequent things a product team ships. A
drift channel that cries wolf on every button rename gets muted, and then the
real breakages get muted with it. Notification credibility _is_ the
differentiator; spending it to catch three dialog cases is a bad trade.

The gate is the stake, not the shape: `anchor` steps keep resolving with drift
recorded, and every other required action refuses. Pointing a card at a renamed
button is a mistake the user can see and ignore; pressing it on their behalf is
not. This takes `wrong` to 0 in both regimes at a measured 9 benefit / 7 cost,
where the universal form cost 9 contract regressions across every page shape
measured.

**The disabled-target rule.** The same single-survivor trap arriving through the
actionability filter instead of through deletion — and more common in real apps
than deletion is: an invalid form, a loading state, a missing permission. When
the filter drops a plausible candidate and the winner is standing unopposed,
"the only one left" is not a reason to click it. The result is `not_actionable`,
which tells the author their button is disabled rather than that evidence
drifted.

Its first form over-reached badly and the corpus caught it: `notActionable > 0`
with no durable rival fired on **all 23** `wizard-next-click` trials — the
fixture built to demonstrate the actionability filter _working_. The
discriminator that fixes it: `configured-attribute` and `registry-contract` are
issued to one element, so matching one is a claim about **identity**, not about
kind. `semantic-attribute` is deliberately excluded, because two dialog triggers
side by side both carry `aria-haspopup="dialog"`. The rule now fires on exactly
three trials in 662.

### Whole-set, not per-candidate

A rejected first attempt is worth recording because the distinction is subtle
and cost three wrongs to learn. Checking each candidate individually for
"does the recorded copy still match?" traded three wrongs for three different
ones on `labels-exchanged`. The correct question is asked **of the whole set**:
if the recorded copy landed on _someone_, it moved rather than vanished — and
moved copy is the drift veto's business, not the rank policy's. Per-candidate,
the two are indistinguishable.

### Why 5a was dropped rather than deferred

`sibling-position` scoping — rescoping the guard from "is this a collection" to
"are these siblings interchangeable" — was planned, prototyped and **removed
from the plan**, not shelved. Measured, its ratio was 3 benefit : 10 cost, gated
or ungated; it collided with the same shipped test and the same discriminator as
the action-gated veto; and once that veto landed it covered everything 5a would
have fixed and more. It is redundant _and_ a bad trade. Leaving it "deferred"
would have implied a debt that does not exist.

The asymmetry 5a would also have resolved is **load-bearing and stays**:
`sibling-position` counts in `durableScore` but is excluded from
`durableFamilyCount`. That is not an oversight. Separating two identical controls
is the entire job of sibling position, so it must score; but "a button in the
second of three slots" must never be able to constitute an identity on its own,
so it must not count toward the quorum. Collapsing the two would either blind the
comparison or admit position as identity, and the near-miss data shows exactly
what the quorum is holding back.

### The ratchet

`baseline.json` is a committed snapshot compared class by class, wired in as
part of the suite.

- **Per arm, per mutation class, by count.** Never a global percentage: one
  percentage lets a regression in one class hide behind a gain in another, and at
  this corpus size a single trial outweighs a percentage point.
- **Improvements fail as loudly as regressions.** A number that moved is a diff a
  person should read and accept on purpose. A ratchet that silently absorbs gains
  cannot tell a real fix from a fixture that stopped running.
- **Trial counts are in the snapshot**, so a fixture that quietly stops executing
  reads as its counts dropping to zero and fails, rather than looking like a
  corpus that got easier.
- **`wrong === 0` is absolute**, asserted per class in its own test so a failure
  names the class. It is never ratcheted and never waived.
- **Near-miss is bucketed honestly.** `unmeasured` is kept distinct from `none`,
  because collapsing them would report a probe that never ran as a clean sweep.
- **Regeneration is a human decision.** `UPDATE_TARGETING_BASELINE=1` rewrites the
  file **and still fails the run**, so somebody has to read the diff before it
  lands.

### Known gaps

**Tie fragility — 412 of 662.** Trials whose top two durable scores sit within
half a point. First place there is decided by sort order, not by evidence, so any
scoring change that nudges one candidate can convert a tie into a confident
resolution onto an arbitrary element. 5b was exactly such a change. This is the
number to watch hardest before touching scoring, and the reason the ratchet
exists at all.

**`unsupported_boundary` has zero producers.** A closed shadow root and a
same-document iframe both report `no_candidates`, so a hard boundary is
indistinguishable from an ordinary miss. Open shadow roots and late-adopted roots
_do_ resolve, which is real capability worth recording.

**Generated ids are treated as durable.** `headlessui-menu-item-3` is captured as
`configured-attribute` evidence, and `generated-ids-swapped` scored 176.00 on the
wrong element — the largest wrong-margin on record — saved only by
`evidence-drift`. Radix is currently safe _by accident_: `radix-:r5:` is rejected
because a URL-scheme regex reads `radix-:` as a scheme. A Radix release that
dropped the colons would sail through, and we ship Radix in our own dashboard.

**`check-size.mjs` does not measure the resolver.** The size gate totals _static_
import graphs, and the resolver is reached only through `import()`. It is
therefore in **no measured budget**, while `public-bootstrap` sits on 5 bytes of
headroom and `runtime+tour` on 105. ADR 0027's idle-page-cost guarantee is
accurate for the idle page and weaker than it reads for the playback path: bytes
can be added to the resolver indefinitely and CI will not notice. This surfaced
while proving the ranking observer free against those budgets — the observer adds
+93 bytes gzipped to the resolver chunk and zero to every enforced budget — and
it is its own work item, not a defect introduced here.

### Claim discipline

**These numbers are internal engineering numbers.** They exist to prioritise
work, to set drift thresholds, and to answer a design partner's questions
honestly in a conversation where the caveats can be given.

**They do not go on the website and they do not go into marketing copy.** The
corpus is self-authored: we wrote both the pages and the mutations, so it
measures the failure modes we thought of. A published "zero wrong" claim, without
the near-miss figure, the tie-fragility figure, and the jsdom boundary alongside
it, would be misleading — and would be indefensible the first time a prospect's
own page produced a wrong resolution.

The defensible public claim is about _behaviour_, not a score: the resolver
refuses rather than guesses, and it tells the author when it does.

## Consequences

- Resolver changes are now priced, not argued. Every fix above was measured
  before and after; two proposals that were intuitively appealing
  (fractional partial credit, the lone-candidate discriminating-family rule) were
  killed by measurement, and one shipped rule was found to over-reach on 23
  trials before it left the working tree.
- The quorum and the `durableScore` / `durableFamilyCount` asymmetry are now
  constrained by evidence. Changing either requires re-running the corpus and
  accepting the diff.
- The recall phase inherits a hard boundary: uninstrumented pages must be fixed
  by finding more durable evidence, never by lowering the bar. `tailwind-utility-soup`
  abstains on every trial today — one durable family where the quorum needs two —
  and that is the shape of the problem to solve.
- Near-miss and tie fragility are ratcheted but not threshold-asserted. Picking a
  ceiling for either today would freeze a guess, which is the mistake this whole
  effort was built to stop repeating.
- The corpus is a maintenance obligation. A mutation class nobody adds is a
  failure mode nobody measures, and the compound coverage is explicitly a sample:
  eight atomic classes are reached by no compound and are measured alone only.
- Two runtime observers now exist on the resolver. Anything added to either must
  respect which side of the serialisation boundary it is on.
