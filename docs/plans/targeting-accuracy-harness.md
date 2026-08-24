# Task: finish the targeting accuracy harness

You are picking up work already in progress. Read this whole file before
touching anything — roughly half the harness is written, the API surface has
already been mapped for you, and there are non-obvious traps recorded below.

---

## 1. Why this exists (do not skip — it determines the design)

Lodariq's entire differentiation is that a tour step still points at the right
control after the customer redesigns their app. We have measured that Pendo
fails at this: on `pendo.io/guide-showcase`, ~half of their own public guide
steps resolve to **zero** elements, and every step that survives targets a
purpose-added anchor id.

We have never run the equivalent measurement on ourselves. There are ~1,560
lines of resolver tests in `packages/tests/sdk-runtime/src/resolver/`, but every
one of them asserts a **mechanism** (does this guard fire, does this record omit
DOM refs). None answer *"what fraction of real captures survive a real
redesign."* So the one thing we sell is the one thing we cannot quantify.

This harness produces that number.

**The three outcomes, and why the third is special:**

| Outcome | Meaning | Cost |
|---|---|---|
| `correct` | Resolved, landed on the control the creator picked | — |
| `abstained` | Declined to resolve (`missing` / `ambiguous` / `needs_review`) | A degraded tour, but an **honest** one — the drift-detection path can catch it and notify |
| `wrong` | Resolved *confidently* onto a **different** element | Ships a broken tour with **no signal**. Worse than showing nothing |

`wrong` is the number that can kill the product. We have already shipped this
bug once: `applySelectionPolicy` case `'any-matching'` aliased to `'first'`,
filtered nothing, and returned `found` on the wrong button. Treat `wrong` as a
hard failure in every mutation class.

**Deliberate decision — report before gate.** The vitest suite asserts only the
hard invariant (`wrong === 0`). Do **not** add accuracy threshold assertions on
`correct`/`abstained` yet. We cannot pick sensible thresholds before seeing the
first baseline. The reporter prints the table; a human reads it and decides the
thresholds in a follow-up.

---

## 2. Where you are

Work directly in the repo working tree (`~/Desktop/lodariq`), on whatever branch
is currently checked out. There is no separate worktree for this.

**Do not commit and do not push.** Leave the work as uncommitted changes for
review. The working tree already carries a large amount of unrelated
in-progress work — everything you add lives under
`packages/tests/targeting-accuracy/`, so do not touch, stage, stash, or revert
anything outside that directory.

---

## 3. What already exists

All under `packages/tests/targeting-accuracy/src/`:

- **`layout.ts`** — synthetic layout engine. jsdom reports every rect as 0×0,
  which would silently disable every visual signal family (`layout-slot`,
  `visual-topology`, `sibling-position`) and make the numbers a lie — the
  resolver would look better than it is because the hardest evidence never
  participates. `applySyntheticLayout(root)` assigns deterministic rects derived
  from rendered structure, and stubs `getBoundingClientRect`, `getClientRects`,
  `offsetWidth/Height/Left/Top`, `offsetParent`. Containers marked
  `data-harness-row` lay out horizontally. **Must be called once after building
  the page and again after every mutation.**
- **`host-pages.ts`** — 7 `HostPage` fixtures, each returning one ground-truth
  element. Includes the known-hostile cases: three unlabelled header buttons
  that all tie (the `.head-actions` case from `fixture-host`), a row action
  inside a collection, and three pricing CTAs with identical copy.
- **`mutations.ts`** — 12 `Mutation` generators: `pristine` (control),
  `class-rename`, `wrapper-inserted`, `siblings-reordered`,
  `accessible-name-changed`, `i18n-text-swap`, `moved-into-collection`,
  `element-retagged`, `virtualized-remount`, `ab-variant-inserted`,
  `instrumentation-stripped`, `layout-reflow`. `apply()` returns the element
  that is still the same control, or `null` when the mutation does not apply to
  that page (skip the trial rather than scoring it). Each carries
  `expectation: 'resolve' | 'either'` — documentation of whether abstaining is
  defensible. Nothing permits `wrong`.
- **`scorer.ts`** — `Outcome`, `Trial`, `classify()`, `summarize()`,
  `describeElement()`.

Read all four before writing more. Match their commenting style: comments
explain *why*, not *what*.

---

## 4. What you need to build

### `src/corpus.ts`
Runs the `HOST_PAGES × MUTATIONS` matrix and returns `Trial[]`.

Per trial, in this exact order:

1. Reset: `document.body.innerHTML = ''`, `document.documentElement.lang = 'en'`,
   set `window.innerWidth = 1440` / `innerHeight = 900`.
2. `const container = document.createElement('div'); document.body.appendChild(container)`
3. `const groundTruth = page.build(container)`
4. `applySyntheticLayout(document.body)`
5. **Capture on the pristine page** —
   `const capture = captureTargetEvidence(groundTruth)`
6. `const nextTruth = mutation.apply(container, groundTruth)` — if `null`, skip.
7. `applySyntheticLayout(document.body)` — again. A mutation that changes
   structure must change layout, or you credit the resolver with visual evidence
   a real browser would have invalidated.
8. `const result = resolveTarget({ id: capture.identity.targetId, fingerprint: capture.fingerprint, identity: capture.identity }, document)`
9. `classify(result, nextTruth)`

Build a fresh page per trial. Never reuse a mutated DOM.

### `src/report.ts`
Formats a markdown table: rows = mutation class, columns = correct / abstained /
wrong / total, plus a per-page breakdown and a summary line. For every `wrong`
trial, print the page, the mutation, the expected element and what it actually
hit (`describeElement`) — a `wrong` is a bug report, so make it directly
actionable. Also list `missedRecoverable` (abstentions where
`expectation === 'resolve'`) since those are the improvement backlog.

### `src/targeting-accuracy.test.ts`
- First line must be `// @vitest-environment jsdom`.
- Runs the corpus, `console.log`s the report.
- **Sanity gate first:** every `pristine` trial must be `correct`. If capture →
  resolve does not round-trip on an unmodified page, the harness is measuring
  nothing and every other number is noise. Assert this loudly and separately.
- Asserts `summary.wrong === 0`.
- No threshold assertions on correct/abstained (see §1).

### Wiring
Add a script to `packages/tests/package.json`, e.g.
`"test:targeting": "vitest run targeting-accuracy"`.

---

## 5. API contracts (already verified — do not re-derive)

```ts
import { captureTargetEvidence } from '@lodariq/sdk-authoring/bridge';
import { resolveTarget, type ResolutionResult } from '@lodariq/sdk-runtime/resolver';

captureTargetEvidence(element: Element, event?: MouseEvent, options?: {
  locale?: string; requiredAction?: ...; resolutionMode?: ...;
  stateId?: string; targetId?: string;
}): { fingerprint: ElementFingerprint; identity: TargetIdentityV2 }

resolveTarget(
  target: Pick<Target, 'id' | 'fingerprint' | 'identity' | 'selection'>,
  root: ParentNode = document,
  context: TargetResolutionContext = {},
): ResolutionResult
```

- `ResolutionResult.state` is one of `'found' | 'ambiguous' | 'missing' | 'needs_review'`.
- Also carries `element`, `anchor`, `confidence`, `candidateCount`,
  `resolutionMethod`, `reasonCode`, `evidenceFamilies`, `runnerUpConfidence`,
  `currentLocale`.
- `resolveTarget` returns `identity_invalid` unless `target.id === target.identity.targetId`.
  Omit `options.targetId` at capture (it generates a valid temporary id) and use
  `capture.identity.targetId` as `target.id`.
- **Do not pass `context.locale`.** The resolver falls back to reading
  `document.documentElement.lang`, which is what production does — and the
  `i18n-text-swap` mutation sets `lang = 'de'`, so letting it read the document
  is the realistic path.

Path aliases (`@lodariq/sdk-runtime/resolver`, `@lodariq/sdk-authoring/bridge`)
already resolve to source via `packages/tests/vitest.config.ts`. Vitest include
is `**/*.test.ts`; `packages/tests/tsconfig.json` includes `**/*.ts`, so the new
directory is picked up by typecheck automatically.

---

## 6. Traps

1. **ES2020 target.** No `Array.prototype.at()`. Use
   `array[array.length - 1]`. Existing tests carry this workaround with a comment.
2. **Strict TS with `noUncheckedIndexedAccess`.** Every indexed access is
   possibly `undefined`. Guard, do not cast.
3. **Never import a runtime value from the `@lodariq/schema` barrel** inside
   anything that reaches sdk-runtime's small bundles — it pulls a 125 KB TypeBox
   chunk and trips the forbidden-code gate. Type-only imports are fine here, but
   prefer subpath entries.
4. `pnpm knip:check` may flag the new non-test `.ts` files as unused if only the
   test imports them. Check before declaring done.
5. `pnpm boundaries` (dependency-cruiser) — existing tests reach into
   `packages/sdk-authoring/src/...` by relative path, so precedent exists, but
   verify.

---

## 7. Run it

Iterate fast:
```bash
pnpm --filter @lodariq/tests exec vitest run targeting-accuracy
```

Before declaring done:
```bash
pnpm --filter @lodariq/tests typecheck
pnpm --filter @lodariq/tests lint
```

Do **not** run the full `pnpm verify` — it builds everything, runs Playwright
and hits the network. Out of scope. Do not run `pnpm format` (it rewrites
unrelated pre-existing files); if you need formatting, scope prettier to
`packages/tests/targeting-accuracy`.

---

## 8. Definition of done

- [ ] `corpus.ts`, `report.ts`, `targeting-accuracy.test.ts` written.
- [ ] The `pristine` sanity gate passes — capture → resolve round-trips on every
      one of the 7 pages. **If it does not, stop and report that. It is a real
      finding, not a harness bug to paper over.**
- [ ] The suite runs and prints the per-mutation-class table.
- [ ] Typecheck and lint clean.
- [ ] Nothing committed, nothing pushed, nothing outside
      `packages/tests/targeting-accuracy/` modified.
- [ ] **Report back with the actual numbers**: the table, the total
      correct/abstained/wrong, every `wrong` trial in detail, and the
      `missedRecoverable` list ranked by mutation class.

The numbers matter more than the code. If `wrong > 0`, that is the most
important output of this task — lead with it, name the exact page and mutation,
and do not fix the resolver in this pass. We want the measurement first,
uncontaminated by a fix.
