# Handoff — 2026-08-24

Written at the end of a Cowork session so a fresh Claude Code session has the
context. Everything below was established by reading the code; anything not
verified is marked as such.

## Ground rules

- **Do not commit or push.** The working tree already carries uncommitted work.
- **Scope test runs to what changed.** Do not run the full monorepo suite unless
  a change is genuinely cross-cutting. `./node_modules/.bin/vitest run --config
  packages/tests/vitest.config.ts <file>` — the tests package aliases
  `@lodariq/*` to source, so no build is needed first.
- Current branch is `LOQ-wrap-up-changes` at `2f64731`.

---

## 1. Two runtime defects — `packages/sdk-runtime/src/renderers/tour.ts`

Reported symptoms: clicking a step in the filmstrip and running Preview both
take seconds; Continue often needs two clicks and the first only makes the
popup flicker. **Diagnosed by reading, never reproduced with instrumentation.**

### A. The step advance is discarded when a render interrupts the exit motion

`leaveCurrentStep` (~1448) runs the step change as `transition()` *after* the
exit animation completes. `render()` (~586) opens with
`cancelPendingStepTransition()` (~1481), which sets `active = false` and clears
`stepTransitionPending`, so the pending `.then` returns early and `transition()`
**never runs**. The click is dropped silently; the flag reset is why the next
click works.

Anything re-rendering mid-motion triggers it: the target tracker repositioning,
`resolveResponsiveTourStep` on a resize, or the authoring preview pushing a
document update — which is why the filmstrip and Preview show it far more than
plain playback.

`startStepExitMotion` in `tour-presentation-effects.ts` is *not* the problem; it
already has a `setTimeout(settle, durationMs + 50)` fallback and cannot hang.

Fix direction: cancelling the exit motion should mean "skip the animation", not
"abandon the navigation" — either run the pending `transition()` when
cancelling, or hold it and re-run it after the render. Reproduce it in jsdom
first (render during the exit motion, assert the index did not move).

### B. A hidden card behind a worst-case-shaped wait

`render()` (~615) sets `this.card.hidden = Boolean(step.targetId)`, so **any**
targeted step hides the card until `findTarget` (~1216) returns. That path:

1. `reachStepPage` — page routing, up to `DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS` (1_500).
2. `ensureResolvers()` (~1581) — `await import('../resolver')`, a dynamic import
   paid at click time on first use.
3. `waitForLifecycle`.
4. If unresolved and the target has an approach: `await
   import('./target-approach-runtime')`, deadline `TARGET_APPROACH_DEADLINE_MS = 15_000`.
5. A settling loop — `while (!result.anchor && Date.now() < deadline)` polling
   `resolveStepTarget` every `delay(50)` for the full 1.5s. Roughly 30 complete
   semantic resolutions, and in authoring preview the `nudgeVirtualizedContainer`
   call inside the loop is skipped, so the loop cannot affect what it waits on.

The loop's own comment justifies it for advances following a *product click*
("route transitions and lazy UI commonly commit after the product click handler
returns"). It is applied unconditionally — including to creator-initiated
filmstrip selection and Preview jumps, where nothing is settling.

**The reframe that matters:** the loop only runs while the target is
*unresolved*. First-attempt resolution costs zero wait. Consistently seeing
~1.5s means resolution is consistently failing on the first pass and burning the
whole budget before drawing anything — a targeting problem wearing a
performance costume. `options.onTargetResolution` already receives
`targetResolutionDiagnostic(result)` per step; measure before optimising.

Safe work regardless of the diagnosis: prefetch the `../resolver` and
`./target-approach-runtime` chunks during idle after the tour starts, so the
first interaction never pays a fetch. **Do not shorten the settling window until
the resolution question is answered** — if resolution is failing, a shorter
timeout only fails faster.

---

## 2. Step indicator — built, unverified, uncommitted

First field ever added to `TourBehavior`. All optional, so pre-existing
documents and older compiled artifacts still validate.

- `schema/src/experience.ts` — `stepIndicator` (`none|count|dots|bar`),
  `stepIndicatorPlacement` (`block|inline`), `stepIndicatorCountForm`
  (`bare|labeled`), plus `TOUR_STEP_INDICATOR_DOTS_MAX_STEPS = 8`. The compiled
  tour variant became `{ ...TourBehavior.properties, surface: 'popup' }`.
- `compiler/src/compile.ts` — `return { ...behavior, surface: 'popup' }` (it was
  discarding the whole behavior for tours).
- `sdk-runtime/src/renderers/tour-step-indicator.ts` (new) — resolver + DOM.
  Denominator is the authored step count held **fixed** (deliberate: a total
  that moved as conditions resolved confuses more than one that overstates).
  Dots degrade to count past the ceiling; a <2-step tour shows nothing; `inline`
  falls back to `block` when `actionLayout` is `stack`; the element is
  `aria-hidden` because the card's live region already announces position.
- Inline placement wraps the last `.tour-action-group` in a new `.tour-footer`
  rather than inserting into the group — the group wraps, its justification
  belongs to `actionAlign`, and `tour.ts:171` notes creator tooling binds to
  that marker. `tour.test.ts:1199` asserts a button's parent is still
  `.tour-action-group`; the wrapper preserves that.
- `tour-styles.ts` — `.tour-footer`, `.tour-progress`, dots and bar, built only
  from **existing** tokens, so `computeBrandThemeContentHash` is unaffected.
- `tour-i18n-catalogs.ts` — `'{current} of {total}'` and
  `'Step {current} of {total}'` in all 8 non-English catalogs.
- `step-actions-section.tsx` — creator controls beside the action layout
  controls, in both the has-buttons and no-buttons branches. `snapshot` is now
  threaded in from `overlay-step-inspector.tsx`.

The runtime duplicates the dot ceiling as a local constant instead of importing
it: the schema barrel is a value import and the delivered bundle is
size-budgeted. A unit test asserts the two stay equal.

**Status:** typechecks clean across schema, compiler, sdk-runtime and
sdk-authoring. Logic verified in isolation (23 assertions). But
`packages/tests/sdk-runtime/src/renderers/tour-step-indicator.test.ts` has
**never been run**, and `packages/schema/dist` is stale relative to the source
change — rebuild it before trusting anything.

**Correction to an earlier belief:** action layout/alignment controls already
exist and always did — `step-actions-section.tsx` and
`popup-composition-inspector.tsx` both render Layout and Alignment. An earlier
grep missed them by filtering `--include=*.ts` when the UI is `.tsx`. The
"dismiss left, primary right" footer is `actionLayout: 'inline'` +
`actionAlign: 'stretch'`.

---

## 3. Marketing hero — decided, not built

Diagnosis: the hero's weakness is composition, not style. The live demo — the
one asset no competitor can show — starts ~650–700px down `index.html`, so the
first screen is eyebrow → serif headline → lede → two buttons → a radial
gradient, the shape of every dev-tool landing page.

**Chosen: concept 3 (editorial poster) with background D.** Reference renders in
`apps/marketing/design-concepts/`.

- ~150px Fraunces, one indigo italic word, hairline rule, one CTA row.
- The `.hero-glow` radial gradient is retired. Background is flat graphite with
  fine grain and a shallow uplight, plus a faded authoring clip in the right
  field, masked into the graphite.
- The demo window peeks up from the bottom edge so the fold pulls rather than stops.
- The bigger idea: run the real SDK on lodariq.io itself, opt-in behind a "Show
  me how this works" button, so a real tour points at the page selling it.

Clip loading rules: `preload="none"` until idle, pause offscreen, poster for
`prefers-reduced-motion` and `Save-Data`, a visible pause control, and it must
be the only thing on the first screen that moves besides the tour card arriving.

**Note the connection to §1:** the hero embeds the real SDK and plays a real
tour, so both runtime defects are visible on the landing page itself.

---

## 4. Recording the authoring clip

Rig at `scripts/record-authoring/` — `playwright.config.ts`,
`authoring-clip.spec.ts`, `post-process.mjs`, `README.md`. Root script:
`pnpm run record:authoring`.

- The authoring surface is **fully local — no API, no database**.
  `apps/fixture-host/authoring.html` mounts `mountLocalAuthoringDevFrame` and
  persists via `lodariq-local-dev`. The config starts only fixture-host.
- The recording target is the **fixture-host page**, not `authoring.html`
  directly — `lodariq-loader.ts:80` iframes it in, and the frame reads
  `window.parent.location.search` for its scenario.
- Proven bootstrap (from `packages/tests/e2e/authoring-accessibility.spec.ts` —
  keep the two in sync): goto `/` → "Open Lodariq actions" → "Experiences on
  this page" → "Open Welcome tour".
- `AuthoringSegmentedControl` renders `role="group"` with `aria-label` = the
  field label, wrapping `<button aria-pressed>` — **not radios**. Scope by group
  label; option words like "Inline" repeat across trays.
- Inspector sections are plain `<button>`s in a `<nav>`.
- Playwright's synthetic mouse paints no cursor, so the spec injects one.
- `post-process.mjs` takes **any** source file (`node
  scripts/record-authoring/post-process.mjs take.mov`) or, with no argument, the
  newest capture in `artifacts/`. It needs **ffmpeg on PATH** (`brew install
  ffmpeg`). It strips audio entirely rather than muting — a video with no audio
  track autoplays under every browser policy, a muted one does not — and emits
  webm + mp4 + a poster frame into `apps/marketing/public/media/`.
- Beat timing (`BEAT`, `SETTLE` in the spec) and trim points (`TRIM_START`,
  `TRIM_DURATION`, `POSTER_AT` env vars) will need one adjustment pass on the
  first real run. Re-running `post-process.mjs` alone re-cuts the last capture.

---

## Housekeeping

- `packages/sdk-runtime/_to_delete/tsconfig.__srccheck.json` — leftover temp
  file, delete it.
- `registry.ts` and two test files under `packages/tests/` were modified before
  any of this work started. Not part of the above.
- Root `package.json` gained a `record:authoring` script.
