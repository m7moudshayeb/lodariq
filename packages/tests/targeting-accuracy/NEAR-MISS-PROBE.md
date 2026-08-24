# Near-miss probe: why this needed one export, and what it measured

> **Landed 2026-08-23.** `setResolutionRankingObserver` is now exported from
> `resolve.ts`; near-miss is live on all 662 trials and in the ratchet baseline.
> The sections below are kept as the record of why the export was necessary and
> what it cost. Current numbers are at the end.

## The gap

`wrong = 0` is not a safety result. It says no trial *resolved* onto the wrong
element — not that the wrong element never won the ranking. Those are different
claims, and the second is the one that predicts future `wrong`s.

The public API cannot tell them apart:

- Every abstention returns `element: null`, so the result never names the leader.
- `confidence` / `runnerUpConfidence` give the top two **scores** but not **who**.
- `setResolutionTelemetryObserver` (resolve.ts:141) carries `path`,
  `registryOffered`, `corpusSize`, `poolSize`, four timings and `state`. No
  candidate identity. **It does not carry enough.**
- Every ranking helper — `scoreIdentityCandidate`, `sortIdentityCandidates`,
  `durableScore`, `durableFamilyCount`, `candidatePool` — is module-local.

So near-miss was not derivable from outside `resolve.ts`. Until the export
landed the harness reported it as `unmeasured` rather than `0`, because a silent
zero is the exact false confidence this whole exercise exists to remove.

## The change (applied)

One observer, mirroring the telemetry one already there. Additive, opt-in, and
free when nobody subscribes.

```ts
export interface ResolutionRankingSample {
  readonly candidates: readonly {
    readonly element: Element;
    readonly durableScore: number;
    readonly durableFamilyCount: number;
    readonly families: readonly TargetSignalFamily[];
  }[];
}

let rankingObserver: ((sample: ResolutionRankingSample) => void) | null = null;

export function setResolutionRankingObserver(
  observer: ((sample: ResolutionRankingSample) => void) | null,
): void {
  rankingObserver = observer;
}
```

published from `finish()` inside `resolveTargetIdentity`, where `candidates` is
already sorted:

```ts
try {
  rankingObserver?.({
    candidates: candidates.map((candidate) => ({
      element: candidate.element,
      durableScore: durableScore(candidate),
      durableFamilyCount: durableFamilyCount(candidate),
      families: candidate.evidence.map((entry) => entry.family),
    })),
  });
} catch {
  /* measurement is never load-bearing */
}
```

Deliberately **not** included, to keep it minimal: the veto name and the
required margin. The harness derives both from constants sdk-runtime already
exports (`MIN_IDENTITY_CONFIDENCE`, `MIN_INDEPENDENT_IDENTITY_FAMILIES`,
`MIN_RUNNER_UP_MARGIN`, `MAX_RUNNER_UP_MARGIN`) — see `vetoFor` and
`requiredMarginFor` in `src/near-miss.ts`.

Cost when unsubscribed: one null check per resolution. It does not touch the
artifact schema, the result type, or any shipped code path.

Two caveats a reviewer should weigh:

1. It hands a caller live `Element` references for **losing** candidates. The
   existing telemetry observer deliberately exposes no DOM. If that boundary is
   load-bearing, pass a stable descriptor instead and let the harness match on
   it — the near-miss logic only needs identity comparison, not the node.
   *Resolved: live references kept.* A descriptor is a string that can be
   serialised and sent; a node cannot leave the page. Keeping the DOM here and
   out of telemetry is what holds the boundary, not avoiding the DOM entirely.
2. It runs on every resolution, not only failures. Gating on
   `result.state !== 'found'` would halve the work, but then a `found` result
   that landed on the wrong element goes unmeasured — which is precisely the
   case worth catching. Keep it unconditional.

`src/near-miss.ts` binds to this export off the module namespace, so the harness
compiles and runs whether or not it exists — the binding stays, so a build
without the export still reports `unmeasured` rather than a silent zero. Two
harness changes did follow the landing: near-miss is reported and ratcheted per
arm, and `not_actionable` is named as its own veto instead of falling into
`other`.

## Numbers recorded under this patch (2026-08-22)

Corpus of 77 trials, otherwise unchanged: 48 correct, 29 abstained, 0 wrong.

**27 of 77 trials ranked the wrong element first.** Split by what the ranking
actually said:

| Group | Count | Meaning |
| --- | --- | --- |
| Evidence favoured the wrong element | 6 | Leader out-scored the author's pick |
| — of those, cleared the tie gate | 2 | Stopped only by the drift veto |
| Exact score ties | 21 | Identical look-alikes; sort order decided first place |

Vetoes: `tie-margin` 23, `evidence-drift` 2, `locale-unverified` 2.

By page: `table-row-action` 11, `pricing-card-cta` 11, `modal-primary-cta` 2,
`header-actions-tied` 2, `settings-labelled-input` 1. The two 11s are the
unanswered-disambiguation pages, where every candidate scores identically — those
are Step 3 Arm A, not a resolver defect.

### The six where evidence pointed the wrong way

| Page / mutation | Leader | Author's pick | Gap | Gate | Veto |
| --- | --- | --- | --- | --- | --- |
| `modal-primary-cta` / `siblings-reordered` | Cancel 126.50 | Send invites 93.50 (#2) | 33.00 | **cleared** 33.00 ≥ 18.97 | `evidence-drift` |
| `modal-primary-cta` / `element-retagged` | Cancel 93.50 | Send invites 60.50 (#2) | 33.00 | **cleared** 33.00 ≥ 15.00 | `evidence-drift` |
| `header-actions-tied` / `element-retagged` | Save report 66.00 | Schedule report 33.00 (#3) | 33.00 | held | `tie-margin` |
| `table-row-action` / `element-retagged` | Manage 93.50 | Manage 60.50 (#3) | 33.00 | held | `tie-margin` |
| `pricing-card-cta` / `element-retagged` | Choose plan 93.50 | Choose plan 60.50 (#3) | 33.00 | held | `tie-margin` |
| `table-row-action` / `moved-into-collection` | Manage 93.50 | Manage 68.47 (#3) | 25.03 | held | `tie-margin` |

### What the gap of exactly 33.00 means

Five of the six are `element-retagged`, and every one loses by **33.00 — the
`element-semantics` score, to the decimal.** The retag does not merely fail to
identify the target: it demotes the target by exactly one family below every
look-alike that kept its `<button>` tag.

That sharpens Step 5b. Fractional partial credit would only narrow the gap and
leave the wrong element leading. Treating a **surviving explicit ARIA role as
satisfying `element-semantics`** closes it exactly, and on this corpus the result
is a tie, not a flip:

- `modal-primary-cta`: 93.50 vs 93.50 — and only the true target carries the
  captured name "Send invites", so `localizedTextSafelyBreaksDurableTie` should
  settle it *correctly*.
- `header-actions-tied`, `table-row-action`, `pricing-card-cta`: ties among
  identical look-alikes → `ambiguous`.

No path to a new `wrong` is visible on this corpus. It must still be measured
against the widened corpus from Step 4, not assumed.

### Correction to the Step 1 diagnosis

Step 1 reported that the true target ranked below a wrong element in **3** of the
5 `element-retagged` trials. The probe measures **4** — `header-actions-tied`,
`table-row-action`, `modal-primary-cta`, `pricing-card-cta`. Only
`toolbar-testid-button` ranks its true target first, which is why it is the sole
trial in the class stopped by the family quorum rather than by a tie.

## Reproducing

```bash
pnpm --filter @lodariq/tests exec vitest run targeting-accuracy --disable-console-intercept
```

## What shipped, against the three conditions

**Off unless asked.** `rankingObserver` starts `null` and the publish site is an
optional call, so the argument object is never built for a page nobody is
measuring. Cost when unsubscribed: one null check per resolution.

**Zero bytes against every enforced budget.** `resolve.ts` is in no
size-measured static graph — the resolver is reached only through `import()`,
and `check-size.mjs` totals static graphs. Measured before/after, every budget is
unchanged bar 1-2 bytes of chunk-hash churn: public-bootstrap 6138 -> 6139 of
6144, runtime+tour 58773 -> 58775 of 58880. The real cost is **+93 bytes gzipped
in the resolver chunk** (11259 -> 11352), which is loaded at playback and which
no budget currently covers. That gap is worth closing on its own merits; it is
not created by this change.

**Live references, never serialised.** The sample hands `Element` nodes
synchronously and is documented must-not-retain. This is deliberately *not* a
widening of `setResolutionTelemetryObserver`: telemetry is numbers and enum
strings, shaped to be sent somewhere, and a candidate inside a customer's table
row can be a person. A live node cannot leave the page; a description of one can.
So the two observers sit side by side rather than merging.

## Numbers on the full corpus (2026-08-23, 662 trials)

Near-miss is an **Arm A** measure. Arm B's author declared a selection policy
precisely so the ranking would not decide, so a leader landing elsewhere there is
the policy working. Reported separately, never merged.

**Arm A: 123 of 368 ranked the wrong element first.** 45 where evidence favoured
it, 78 exact ties. **All 123 abstained** — no near-miss resolved.

**38 cleared the tie gate**, meaning only a later veto stopped them:

| veto | trials |
| --- | --- |
| `evidence-drift` | 24 |
| `family-quorum` | 8 |
| `not-actionable` | 3 |
| `score-floor+family-quorum` | 3 |

Of the 38, 9 had no right answer left (`target-removed`, `control-disabled`);
**29 had the true target still on the page and outranked**, 28 of them by exactly
33.00 — one whole evidence family. `element-retagged` no longer appears in that
list, which is 5b working: it was 4 of the 6 outscored cases on the 77-trial
corpus and is 0 of 45 now.

The 8 stopped by `family-quorum` are the sharpest single result here:
`tailwind-utility-soup`, `role-button-lookalikes` and `identical-twin-controls`,
where the wrong element out-scored the target *and* cleared the margin gate, and
the two-family quorum was the only thing left. Lowering the quorum to improve
recall would convert those into confident wrong clicks.

Arm B: 276 of 294, which is what a declared policy looks like from the ranking's
point of view. Arm B safety is `intent-violated` (88), scored separately.
