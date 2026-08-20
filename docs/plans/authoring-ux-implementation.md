# Authoring UX Implementation — Progress

Status: **the creator-facing model is implemented; the delivery and measurement halves are not.** Every
slice landed (0, A–H) plus the orphan correctness items in §8, §9 and §14, and the whole change set lives
in `sdk-authoring`, `schema` and `sdk-runtime` — one line in `apps/api`, nothing in `packages/database`,
nothing in `apps/dashboard`, nothing in `packages/compiler`.

Read that scope literally. This plan built **what a creator sees and does**. It did not build the
server-side halves the model depends on (B3 narration audio, B12 the per-path save transport, B13 the
presence and lock endpoint), and it did not touch the path from an authored experience to a rendered,
measured one for any type other than `tour` (B11 renderers, **B14** publish, **B15** survey responses).
Nothing in this plan emits telemetry (**B16**), and §14.3's analytics-pollution prerequisite is untouched
(**B17**). Also open: two decisions (B1 a doc reconciliation, B2 session lifetime), two E2Es (S1
zero-keyboard, S5 rapid-edit), and per-property override indicators.
Started: 2026-08-17
Design source of truth: `docs/plans/authoring-ux-model.md` (prose) +
`docs/product-design/prototypes/authoring-spec.html` (behaviour, geometry, tokens)
Guardrails: `AGENTS.md`, ADR-0003, ADR-0004, ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0018

Working log for the authoring interaction model only. Broader phase tracking stays in `docs/PROGRESS.md`.

---

## 1. Scope

Complete the panel → page-as-canvas migration by giving the two homeless jobs a surface (object
configuration and state), specifying the third (Operations), on an architecture that absorbs
announcement / hotspot / survey / checklist without reopening the shell.

Not a dashboard redesign. No change to the runtime, schema, resolver or release model.

### Success conditions

| # | Condition | Check | State |
|---|---|---|---|
| S1 | Zero-keyboard completion test passes | E2E: build → target → style → preview → publish, pointer only | partial — every control is pointer-complete, the map is published, and `control-map.test.ts` forbids printing an unwired shortcut; the E2E itself still has to be written |
| S2 | No two interactive Lodariq layers share a pixel | `findOverlaps` unit tests + layer-manager suite | **enforced ✅** — the manager adds each solved rect to the obstacle list, and the suite asserts `findOverlaps() === []` |
| S3 | A new experience type touches no shell file | experience-registry suite: register a definition, then read it back through the capability, section and gesture paths | **enforced ✅** — all three registries are live; a type is one definition object plus one `registerExperience()` call, and the capability map reads the registry rather than keeping its own table |
| S4 | No colour literal outside the token module | `pnpm tokens:check`, baselined | **enforced ✅**, now covering `panel-styles.ts` too |
| S5 | Rapid property edits never lose a write | queue unit tests + E2E rapid-edit fixture | **unit ✅** (12 tests); E2E pending |
| S6 | Runtime bundle unchanged | existing bundle gate | not run |

---

## 2. Decisions taken

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-17 | **Palette moves to indigo-on-graphite**, replacing "Graphite + Mint" | Owner decision. Implemented as a *value* swap inside `creator-chrome-tokens.ts` with every export name unchanged, so all ten consuming modules picked it up with no edits and no surface was restyled. |
| 2026-08-17 | **Overlay chrome keeps the prototype's measurements** (38/10/420/320…) rather than snapping to the Editorial Air ladders | Owner decision. The values live in a single `OVERLAY_CHROME_GEOMETRY` block, documented as a deliberate deviation scoped to chrome drawn *over the customer page*. The workspace ladders still govern everything inside the authoring frame. |
| 2026-08-17 | New code extends `authoring/overlay/`, not a new `shell/` tree | `authoring/overlay/` already owns page-as-canvas. A parallel tree would have been the drift this work exists to prevent. |
| 2026-08-17 | **The mutation queue lives in `authoring/mutations/`, not `authoring/overlay/commands/`** | Deviation from this doc's earlier plan. The queue is a durability concern consumed by `panel.ts`; `authoring/overlay/` owns page-as-canvas chrome. Putting a save queue there would have been a second kind of drift. |
| 2026-08-17 | **No keyboard accelerators printed or wired yet** | §3.1a's rule is "no shortcut without its visible control in the same PR". The reverse also holds: printing `⌘O` next to a row whose shortcut does not exist teaches a lie. Every control shipped so far is pointer-complete; accelerators land as their own pass. |
| 2026-08-17 | **The document title stays in the filmstrip for now** | It is document-scoped, so the placement law puts it in Operations (Tier 3). Moving it needs a frame-side title field and a controller path; the host currently owns the commit. Tracked as B9 rather than left undocumented. |
| 2026-08-17 | **Corner placement, not free positioning, for unanchored chrome** | The layer manager picks a corner when chrome would cover the card. If the creator could also park a surface at arbitrary coordinates, two positioning models would fight. Dragging the pill magnetizes to the nearest corner and that corner becomes the manager's first preference. |

---

## 3. Anti-drift rules

1. **Three token sets, never mixed** — dashboard, creator-chrome, customer Brand Theme. The card renders
   in Brand Theme; every piece of chrome around it renders in creator-chrome.
2. **No colour literal outside `creator-chrome-tokens.ts`.**
3. **Every overlay measurement is a named export**, never a literal in a surface.
4. **Copy lives in one module per surface.**
5. **The mode pill may never grow into a rail.**
6. **The inspector has no pinned state**, max 7 sections per selection kind (§4.3's six for the card,
   plus Target, because a step is re-pointed from the card the creator selected).
7. **No shortcut without its visible control in the same PR.**
8. **One toolbar, never two.** A second floating bar over the card is the failure mode §4.2a rule 4 exists to prevent.

---

## 4. Architecture

```
packages/sdk-authoring/src/
  creator-chrome-tokens.ts        palette · type/space/radius ladders · OVERLAY_CHROME_GEOMETRY
  authoring/mutations/            ← NEW  transactional command queue (§8.1)
    types.ts                            contract: command, transport, status
    queue.ts                            sequence · single in-flight · coalesce by path · backoff
  authoring/overlay/
    constants.ts                  named measurements derived from the tokens
    solver.types.ts               pure geometry types
    solver.ts                     toolbar / inspector / chrome placement, no DOM
    layer-manager.ts              ← NEW  owns placement for every unanchored surface (§3.4)
    inspector-sections.ts         ← NEW  section registry, six-section cap enforced (§4.3)
    inspector-sections.types.ts   ← NEW  selection kinds + section contract
    inspector-copy.ts             ← NEW  every label the inspector renders
    mode-pill.ts / .types.ts      ← NEW  the state + mode surface (§4.1, §3.3)
    mode-pill-copy.ts             ← NEW  every string the pill renders
    html.ts                       ← NEW  shared escapeHtml
    shell.ts                      composes the surfaces; owns Browsing and panel visibility
    geometry.ts  compass.ts  filmstrip.ts  pulses.ts  click-outside.ts
  authoring/ai/                   ← NEW  provider-agnostic assist layer (§7.4–§7.6)
    assist-contract.ts                  verbs · forbidden paths · edit + proposal shapes
    assist-machine.ts                   preview → accept / reject / refine / undo, as a reducer
  authoring/narration/            ← NEW  script model, language inference, lexicon (§7.7)
  authoring/experiences/          ← NEW  ExperienceDefinition contract + registry (§5, S3)
    definition.ts                       the contract the shell knows instead of document types
    gestures.ts                         Tier-1 gesture names + edge-drag → form mapping
    built-in.ts                         all six shipped types, as data
  authoring/brand-variants.ts     ← NEW  OKLCH maths, contrast-first derivation (§7.1)
  authoring/brand-theme-offer.ts  ← NEW  proposal → two variants → semantic tokens
  editor/                         Lexical stays confined (ADR-0004)
```

**Extensibility seam.** The shell knows an `ExperienceDefinition` contract, not a set of types.
**All three registries are live:** a new unanchored surface is one `layers.register()` call with a
corner preference, a new inspector section is one registry entry plus one key in the section-body map,
and a new experience type is one definition object plus one `registerExperience()` call — carrying its
own capabilities, root blocks, gestures, sections and seed content, with no switch statement anywhere.

**Code splitting.** `shell` core on activation · `editor` on first card · `experiences/<type>` on
document open · `operations` on open · `picker` on first pick · AI surfaces on first invocation.

---

## 5. Slice status

### Slice 0 — token layer + geometry + pure solver ✅ landed

| Change | File |
|---|---|
| Palette swapped to indigo-on-graphite; names unchanged | `src/creator-chrome-tokens.ts` |
| Added `CREATOR_CHROME_GLASS` (restrained glass for floating chrome) | same |
| Added `peer` status token (presence, §15) | same |
| Added `inkSoft`/`subtle`/`surfaceStrong`/`borderSoft` — previously raw hex in `foundation.ts` | same |
| Added `OVERLAY_CHROME_GEOMETRY` / `_MOTION` / `_GHOST_OPACITY` | same |
| Named measurements, single-sourced | `src/authoring/overlay/constants.ts` |
| Pure solver: toolbar, inspector, unanchored chrome, hysteresis, overlap assertion | `overlay/solver.ts`, `solver.types.ts` |
| 20 unit tests | `packages/tests/…/overlay/solver.test.ts` |

**Drift bug fixed along the way.** `styles/foundation.ts` held a hand-copied status palette that had
already diverged from `CREATOR_CHROME_STATUS_TOKENS`, plus accent-derived `rgba()` values still
hard-coded to the old mint RGB. All now interpolate from the token module.

### Slice A — make the current build honest ✅ landed

**A1. Transactional mutation queue (§8.1, audit #1).** `authoring/mutations/`.

- Every edit is a command with a **path**, a creator-facing **label** and a monotonic **sequence**.
- **One in-flight write per document**; everything else queues behind it.
- **Coalesce by path while queued** — three background changes collapse to the last one, a background
  and a border change both survive. Last-writer-wins is per property, never per document.
- **Backoff ladder** `[400, 1200, 3000]ms`, then `retry` state carrying the property that failed.
- Failed work is **re-queued at the head**, but never over a newer write to the same path.
- `schedule` is injected, so all tests drive time explicitly.
- **Not yet the live transport, and the audit bug is nonetheless not live.** `panel.ts` still persists
  the whole document behind a generation counter, so a later save always carries the newer value of
  every property; the per-property loss the audit found was in the *frame's* write path and is fixed by
  `commitCoordinatedMutation` plus the transaction coordinator. The queue is the durability layer for
  the semantic per-path transport that replaces whole-document autosave. Tracked as **B12**.

**A2. Mode pill (§4.1, §3.3).** `overlay/mode-pill.ts`.

- **Editing ⇄ Browsing** switch as the leftmost and largest element, with the *why* in each tooltip.
  Browsing ghosts the layer to 15% with `pointer-events: none` via `data-lodariq-browsing`; the pill
  itself is excluded, because it is the way back.
- Environment chip (`Staging` / `Dev`; production never appears), progress, save state, and a `⌄` menu
  carrying Operations · Preview · Hide/Show all panels · Collapse · Close authoring.
- Preview replaces the pill's contents with `Preview · n of m` + `Edit this step` + `Exit preview`,
  and is the **only** authoring pixel left during preview — the separate `overlay-preview-exit`
  element is deleted.
- Draggable with a 4px threshold, magnetized to the nearest corner, corner persisted per origin
  (geometry only, never session state). Collapses to a 28px dot on double-click or after 8s idle in
  Browsing, and always re-expands when the creator returns to Editing.
- 11 unit tests, including "never prints an accelerator" and "the preview bar has exactly two buttons".

**A3. Progress bound to the runtime step (audit #6).**
`syncPill()` reads the runtime step during preview and the selection while composing, and labels each
accordingly. `panel.ts` pushes `setRuntimeStepId` from the runtime's `onStepChange`.

**A4. The minimized authoring header is gone.** Operations and Close moved from the filmstrip into
the pill's menu; the filmstrip is step order plus a state dot per step. Entering full preview no
longer sets the minimized-layer attribute — the shell presentation does that work.

### Slice B — the inspector (in progress)

**B-layer. Layer manager ✅ landed.** `overlay/layer-manager.ts`.

- One module owns placement for every unanchored surface. Surfaces register with a corner preference;
  the creator's chosen corner goes first.
- Reserved rect = card ∪ target. **Each solved surface joins the obstacle list**, so rule 1 (no two
  Lodariq surfaces share a pixel) falls out of the ordering rather than needing a separate check.
- Obstacles are a **list, not a union**: the union of two far-apart rects covers everything between
  them and would report every corner as taken. `solveChromeAmong` is the list form; `solveChrome`
  is the single-rect convenience over it.
- Re-solve is gated by `shouldResolve` on the reserved rect, so growing the card by a line does not
  move chrome — asserted by a test that types 20 lines and expects one placement.
- `inset` transition at `chromeAvoidMs` so avoidance reads as movement, not a glitch.
- Replaces the ad-hoc `avoidFilmstripCollision`; `data-dock` is gone, both surfaces use `data-corner`.
- 7 unit tests.

**B-inspector. Section registry + step inspector ✅ landed.**

- `overlay/inspector-sections.ts` is the registry. Sections carry an explicit `order` and an
  `advanced` flag, so registration order does not matter and Advanced is always last and always
  collapsed. Registration is idempotent per section id, and **the six-section cap throws at
  registration** rather than being left to review — §13's "the inspector becomes the panel again"
  risk, expressed as code.
- Only sections with a real body are registered. §4.3 also specifies Conditions and Narration on the
  card and a whole Target kind; those arrive with Slices D and F, and registering them now would ship
  rows that do nothing. A test asserts the card still has room for them.
- `components/overlay-step-inspector.tsx` renders those sections as `<details>` into the overlay's
  existing inspector column, with bodies wired to the components that already existed but had no
  route in the overlay path: `PopupCompositionInspector` (style, actions), `StepPlacementEditor`
  (placement), `StepPresentationInspector` (advanced). **That is the Popup tray and the Placement
  tray migrated** — sections instead of tabs, one `⋯` entry point on the toolbar, `Esc` to close, and
  no state carried across a selection change.
- 11 tests: 7 on the registry, 4 on the rendered popover.

**Still to do in Slice B:** anchored flip/shift/corner-with-leader placement for the popover itself
(it currently sits in the overlay's inspector column, which the host already positions), the focus
trap, and moving the *block* inspector's tabs onto the same registry.

### Slice C — style reuse ✅ landed

Audit #5 was "six cards required repeating alignment, padding, radius, palette, border and shadow
choices one step at a time". The *engine* for reuse already existed — copy/paste style, apply to a
selection, named recipes with a content-hashed library. What was missing was the surface and the
selection it acts on.

- **Filmstrip multi-select.** ⇧-click extends, ⌘/⌃-click adds. The host filmstrip sends a new
  `select-add` / `select-range` shell command; the frame answers with a new
  `authoring.shell.selection` message carrying step ids only, and the filmstrip marks them with a ring
  plus `aria-selected` — a real selection, announced, not just coloured.
- **`StepStyleReuse`** in the inspector's Style section: Copy style · Paste style · Apply to… ·
  Create style from this step, then the saved styles with a swatch each. `Apply to…` **names its blast
  radius before acting** ("Apply to 3 steps" / "Apply to this step") because a batch that hides its
  scope is a trap, and Paste is honestly disabled until something has been copied.
- 9 tests (5 on the surface, 4 on filmstrip state and selection).

**Not yet:** per-property override indicators and the four override actions (reset property, reset
instance, save as new, update the original). Those need a per-step *binding* to a named style, which
the schema does not record — a data change, so it wants its own pass rather than a guess.

### Slice D — targeting made legible ✅ landed

ADR-0016 is stronger than the selector-string engines the category ships, and none of that strength
was visible. Everything here is derived from what the creator can already see — accessible name, role,
size, look-alike count — because ADR-0016 forbids exposing selectors, fingerprints or DOM depth.

| §4.4 requirement | What landed |
|---|---|
| Hover card with plain-language name and role | `describeTarget` maps roles and container tags to words (`Button`, `Card`, `Navigation`), never a tag name |
| Live match count | `countLookAlikes` + `matchCountLabel`: `1 of 1 on this page` / `2 of 4 that look like this`, shown on hover — a number no DAP in the survey displays |
| Ancestor breadcrumb, clickable, plain language | `targetBreadcrumb` renders `Navigation › “Project actions” toolbar › “Create project” button`; unnamed scaffolding is skipped so the trail never fills with noise; each crumb clicks to select and hovers to preview |
| Pick bigger / Pick smaller | `pickBigger` / `pickSmaller` as buttons in the picker band, walking one level per click and stopping at the page rather than the document |
| Automatic page freeze | `startPageFreeze` watches for transient layers (menus, dialogs, listboxes) while picking and pins them, announcing it once with an immediate `Unfreeze`. `Freeze page` is also a button, for what detection misses |
| Click-through for stacked elements | `stackedChoices` produces the plain-language chooser — "the “Create project” button" / "the panel behind it" — instead of hold-`⇧` |
| Userflow's three resolutions | `lookAlikeQuestion` returns exact / by-name / nth / any with creator-language labels; the by-name option is dropped when there is no name to match on. No slider, no selector |
| Three verification states | `target-verification.ts` maps the ledger's seven presentations onto Verified · Needs context · Can’t find, each with a meaning *and* an action |
| Approach recipes | `approach.ts` records click → route → revealed layer as plain sentences, waits on semantic conditions only, and is reorderable, trimmable and replayable with the failing step named |
| Target section in the inspector | `StepTargetSection`: state, meaning, action, an evidence line in words, and `Change target` |

**Audit #2 is closed, and visibly.** `stepHealth`, `targetHealthTitle` and the step footer all read from
the three-state model now, so the false `Unverified` on a modal `Close` — and the equally unhelpful
`Unavailable in current context` — are gone from every surface at once. Two fixture-host tests that
asserted the old wording were updated to the new, and that diff is the audit finding being fixed.

**A real bug found on the way.** Two pickers could coexist in one document, each with its own outline,
click suppression and (now) freeze listeners. Tests exposed it as cross-file pollution; in the product
it would have been a stuck picker. `startTargetPicker` now retires the active picker for that document
before starting.

32 tests (18 legibility and verification, 14 freeze, disambiguation and approach).

### Slice E — Operations → Check ✅ landed

Operations already had Map, Language, Batch, Appearance, Release, Review and Recovery. **Check** was
the missing section (§4.6), and it is where §7.2's contrast gate and §7.3's predictive QA surface.

- **`predictive-qa.ts`** simulates each step's card against the target at 375 / 768 / 1280 / 1920, in
  RTL, and at the longest locale string, reporting: viewport overflow, self-occlusion, unintended
  placement flips, locale text overflow, targets below the fold with no scroll, and tap targets under
  44×44. Pure — no DOM, no rendering, and explicitly not a compile step (ADR-0003).
- Two things it deliberately does *not* do, both from §13's cries-wolf warning: it **shifts the card
  into view** the way the runtime does before calling anything overflow, and it **clamps the captured
  target into the simulated viewport**, because captured geometry comes from one viewport and a
  responsive app moves its own elements. Without those, every right-hand target would fail at 375px
  and the report would be noise. It also ships **warning-only** — `qaBlockers()` returns nothing until
  a rule's accept rate has been measured.
- A flip is measured against the **mirrored** preference, so an RTL step that lands exactly where it
  was meant to is not reported as flipped. That was a real bug the RTL test caught.
- **`apcaLightnessContrast`** in `@lodariq/schema` adds APCA as the *secondary* readout beside WCAG
  2.x. WCAG stays the gate because that is what the accessibility contract commits to; APCA is shown
  next to it because it is right where WCAG is known to be weak.
- **`publish-check.ts`** assembles one report: contrast on the pairs actually in use, layout findings,
  targets by their three-state verification, missing media descriptions, and untranslated locales —
  one row per locale, not per string. **Every step-scoped row carries a jump**: `Take me there`
  closes Operations and selects the step, which is the Webflow Audit affordance that gets findings
  fixed rather than skimmed.
- Opening Check never publishes and never touches release state (§4.6 non-negotiables).
- 19 tests (11 simulation, 8 report and APCA).

### Slice F — the AI layer ✅ landed

Every surface here is anchored to a selection, a step, or an explicit batch. There is no chat box in
the chrome, because §7.8 is right that an unanchored one is where scope discipline goes to die.

**§7.1 One-click brand theme — two variants, plus Start plain.**

- `brand-variants.ts` is pure colour maths: OKLCH conversion, hue bucketing **weighted by rendered
  pixel area** (one 40×120 CTA outranks 200 hairline borders), near-neutrals split into a greyscale
  ramp, radius by *mode* snapped to the ladder, spacing base by GCD, and a shadow re-tinted toward the
  brand hue at very low chroma while keeping its y/blur ratio.
- Contrast is **derived, not audited**. `contrastFirstForeground(background, ratio, hue)` takes the
  target ratio as an input and returns the least extreme colour that meets it, so AA holds by
  construction. It searches **both** lightness directions: a saturated mid-lightness indigo cannot
  reach 4.5:1 by going darker at all, and guessing the direction from the background alone silently
  returns a failing colour — which is the exact bug this function exists to prevent.
- `brand-theme-offer.ts` owns the wire contract and knows no colour science: it flattens the existing
  `sampleProductStyles()` proposal into weighted observations (`confidence × width`, because heights
  never cross the bridge), then expands each variant into the full semantic role set. Output is
  `CustomerBrandTokenValues` — semantic tokens only, validated against the schema in tests (ADR-0013).
- `BrandVariantChoice` renders **Blends in** / **Stands out** as preview cards, and `Start plain` sits
  beside `Use proposed draft` as an equal third option — §13's mitigation for "a theme that is 90%
  right is more irritating than one that is obviously generic". Choosing a variant replaces only the
  proposal's tokens; evidence, provenance and the server-side apply boundary are untouched.

**§7.2 Live contrast gate.** The inline warning on the offending control already existed; APCA now
rides along beside the WCAG verdict at edit time, computed on the pairs actually in use, magnitude
only. WCAG stays the gate in Check.

**§7.4 / §7.5 Copy assist and the `⌘K` command.**

- `ai/assist-contract.ts` encodes the two guardrails as data rather than etiquette: Scribe's five
  verbs and no more, and `FORBIDDEN_ASSIST_PATHS` so a proposal may create content but can **never**
  mutate theme tokens or named styles (Webflow's constraint, the load-bearing one). A proposal whose
  every edit was dropped by that filter fails *honestly* rather than applying nothing.
- `ai/assist-machine.ts` is the loop as a pure reducer: **preview → accept / reject / refine / undo**,
  never apply-then-explain. Batch scope stops at an explicit confirm with the diff still on screen.
  `undo` walks the refine chain back inside the panel; `⌘Z` still owns the document, which is §7.4's
  two-distinct-undos requirement.
- `ControllerAssistFeature` owns only the async edge and the single write. `requestAiAssist` is the
  provider seam; without it the whole surface reports itself unavailable rather than half-working.
  A slow response that lands after a newer ask is dropped — §8.1's lesson, applied here too.
- Step drafts read the **accessible tree, not a screenshot**: `targetDraftContext` sends the accessible
  name, the role word, and a bounded slice of nearby text with the target's own label removed. A
  nameless target is reported as weak, which is the quiet accessibility nudge §7.4 wants.

**§7.6 Translation.** Targets are shared across locales *by construction* — variants have only ever
carried text. What was missing was the escape hatch and the report:

- `LocalizedTargetOverride` on a variant redirects one step's target for one locale, both ends being
  existing document targets so evidence and identity stay intact (ADR-0016). It resolves inside
  `materializeLocalizedDocument`, which means **publish gets it for free** — the compiler already
  materializes each locale, so nothing there changed and no manual sync exists to forget.
- Check now groups a locale's untranslated copy with its unverified-in-locale targets in one place,
  as §7.6 asks.

**§7.7 Narration — authored now, published later.** The script is a separate field from the on-screen
copy, which is the decision that matters most; `Sync from step text` exists for authors who will not
write twice. Language is **inferred from the script** (writing system first, then function-word scoring
over the product's locales) and the voice list follows it, which eliminates the Spanish-text-
English-voice bug. Prosody comes from punctuation, so no SSML sliders; the one override modelled is a
pronunciation lexicon, applied longest-form-first. `narrationCacheKey` hashes
`(script, voice, model, speed)` because the cost that matters is regeneration churn, not generation.
**Generation, playback and publication are deliberately absent**: audio must sit inside the immutable
artifact for preview and production to sound identical, which needs the ADR-0014 amendment (B3) and a
content-addressed object-storage design. `narration` is therefore omitted from `CompiledBodyProps` —
draft-only data until that lands.

- The inspector's section cap moved 6 → 7, recorded in `creator-chrome-tokens.ts`: §4.3 lists six for
  the card, but the card also carries Target, because a creator re-points a step from the card they
  selected. Conditions is the seventh and still owes.
- 62 tests (19 brand variants, 11 offer, 4 variant acceptance, 5 variant/contrast UI, 15 assist core,
  6 assist wiring, 6 locale target overrides, 16 narration, 5 narration UI — minus overlap).

### Slice G — the experience registry ✅ landed (S3 closed)

The last structural piece. §5's claim is that the model is type-agnostic by construction; this makes
that testable rather than asserted.

- **`experiences/definition.ts`** is the contract the shell knows instead of a set of document types:
  capabilities, root block types, workspace kind, Tier-1 gestures, inspector sections, a `seed`, and an
  optional `formFromRegion`. `experiences/built-in.ts` registers all six types as **data**.
- **The capability map no longer has its own table.** `experienceAuthoringProfile()` and friends read
  the registry, bootstrapping it on first read so no caller has to remember and no import order can
  leave it empty. A second table was exactly the drift this indirection prevents.
- **The card's inspector sections now come from the experience type**, because they genuinely differ:
  a tour card has Placement and Narration, an announcement has Dismissal and Frequency, a hotspot has
  Marker and Tooltip. `registerBuiltInInspectorSections` keeps only the *selection* kinds — button,
  form field, media — which are the same everywhere.
- **Every type seeds real content.** §5 resolved two open decisions by refusing to ask: a survey opens
  with one CSAT question already on the canvas (`Start from a template` belongs in the inspector, not
  in front of an empty screen), and an announcement opens as a card centre-screen. Seeded blocks are
  validated against `LodariqBlock` in tests, and the id factory is injected so seeding stays pure.
- **Edge-drag decides the form (§5).** `dropRegion()` reads a normalized drop into a region — vertical
  edges win corners, because a banner is the form that spans — and each type maps that region itself:
  announcement → banner / slide-in / modal, checklist → drawer / floating. A type without
  `formFromRegion` ignores the drop, which is how the gesture stays additive. `setSurfaceFormFromDrop`
  is the only controller code involved, and it contains no type name.
- Tour's card drag is now `drag-anchor` rather than `drag-to-region`: it moves the card relative to its
  target, which is a different gesture from dropping into a viewport region. Conflating the two made
  a tour drop set a checklist form, which the test caught.
- **`ExperienceSurfaceForm`** is a new document field, and `DOCUMENT_TYPES` is now exported so the
  registry can be tested for completeness against the schema rather than against a copy of the list.
  Like narration, the form is authoring-only: the runtime renders popup / modal / hotspot today, so
  banner, slide-in, drawer and floating are stored but not yet rendered, and the compiled artifact does
  not carry the field. Storing the creator's decision now means the renderers inherit correct data
  instead of a migration. **Raised as B11.**
- 19 tests (registry completeness and extension, seeds, the drop gesture) plus 4 controller tests.

### Slice H — concurrent creators ✅ landed (models and surfaces)

Ruled out first, then built. **ADR-0026** records why there is no CRDT: a merge structure has to be
durable to be useful, the schema contract says a document holds canonical `LodariqBlock` JSON and never
editor state (ADR-0004), and publications compile from that JSON server-side (ADR-0003). Persisting a
`Y.Doc` would create a second source of truth whose failure mode is silent data loss. Tours are
step-partitioned by construction, so step-level coordination buys nearly all of multiplayer's value.
That closes **B4**.

- **`presence/presence-model.ts`** is pure and time-injected — `now` is a parameter, never a call — so
  every expiry rule is tested rather than waited on. Three layers: presence (peers filtered by
  heartbeat), step-level soft locks that lapse 90s after the last edit, and short document locks for
  the operations that cannot be step-partitioned. A closed laptop stops heartbeating and simply drops
  out; expiry *is* the release, because a lock that survives a closed laptop is worse than no lock.
- **The surfaces say who, not just that.** The pill carries `2 other people here`; the filmstrip shows
  initials under the step someone is on, capped at three faces with `+n` after; the held step renders
  read-only with the holder's name, `Ask for it` (which pings rather than takes), and `Take over` for
  admins only. A document-scoped hold states itself plainly and offers nothing to click.
- **A real bug the tests caught:** the pill's `isSameState` did not compare the new `peerCount`, so
  presence would have arrived once and then frozen. Cheap to find with a test, invisible in review.
- **`presence/conflict.ts` + the queue** implement §15.3. A write attaches the version it was made
  against; a mismatch **fails compare-and-swap rather than overwriting**. A conflict is deliberately
  *not* a transport failure: retrying it is the overwrite we refuse, so the queue drops that command,
  spends no retry budget, keeps the rest of the batch moving, and hands the creator a choice —
  `Keep mine` / `Keep theirs` / `Open both side by side`. Resolution rebases the *version* only; the
  payload is never merged, and the losing side is kept as a snapshot whichever button is pressed.
- **§15.4 item 2 is implemented:** `queue.hold()` / `queue.resume()`. A lapsed session stops the drain
  and keeps everything queued, the pill says `Reconnecting…` rather than showing an error, and
  re-activation flushes. Silent expiry mid-edit is data loss wearing a permissions costume.
- **What is deliberately not here:** the server-side presence and lock endpoint that *produces* this
  state, and session-expiry-driven lock release. Both need B2 (ADR-0015's 10–15 minute session with no
  refresh) answered first — a lock cannot be released on expiry by a client that does not know when
  expiry happens. The authoring layer renders presence it is given and holds no locks of its own, which
  is the honest half. Raised as **B13**.
- 33 tests (16 model, 10 surfaces, 7 queue hold/conflict).

### Final pass — the orphan correctness items ✅ landed

The four items §8 and §9 list that are cheap individually and easy to forget collectively, plus §14's
dead end.

- **§6.3 theme snapshot staleness.** `theme-staleness.ts` compares by **content hash** rather than
  version number, because a version can be reused across environments and a hash cannot. When the
  workspace theme moves past the one this frame rendered, Appearance says `Theme updated — reload to
  see it` with a `Reload` action. It deliberately does **not** re-render under the creator's hands: a
  theme change mid-edit has to be visible and chosen. The bug this fixes is a creator changing a theme,
  seeing nothing, and changing it again.
- **§8.2 draft-diverged semantics.** A dot on the pill's environment chip, with an accessible name —
  `Unpublished changes since the last publish` — because a bare colour is not a state. Editing a
  published experience makes a new draft and leaves the live artifact alone; the creator has to be able
  to see that. §8.2 also resolves the `Save as version` open question: immutable artifacts *are*
  versions, so a second creator-facing versioning concept is not built.
- **§8.3 renderer parity, guarded.** The authored canvas already resolves its composition, style recipe
  and theme variables from the **runtime's** resolvers, so container geometry and appearance have one
  authority — the third renderer the doc warns about does not exist. What was missing was the guard:
  `renderer-parity.test.ts` fails if a canvas file grows its own recipe or stops reading
  `--lq-tour-*`. A copied renderer looks right on the day it is copied, which is exactly why this needs
  a test rather than a review.
- **§8.4 activation reliability.** `activation-diagnosis.ts` names the stage that failed —
  popup-blocked, popup-closed, redirected-away, storage-restricted, grant-rejected, session-expired,
  network — and returns the recovery with it, so no surface has to infer the next step from prose. A
  blocked popup is classified **before** any error inspection, because `window.open` returning null
  throws nothing, and it recovers by continuing in the same tab rather than showing an error. The
  pending intent is stored per origin with a five-minute TTL and *taken* rather than peeked, so a
  navigation mid-activation resumes exactly once.
- **§9 the control map is published** as `docs/plans/authoring-control-map.md` and enforced by a test:
  every row has a visible primary control, and the accelerator column may only contain shortcuts that
  are actually wired. It lists `⌘K` and `Esc`, and nothing else — printing a shortcut that does not
  exist teaches a lie.
- **§9.1 the inspector is now focus-trapped.** Tab cycles inside it, `Esc` dismisses, focus returns to
  whatever opened it. The trap is Tab-only: it never captures pointer input, because a trap that
  swallowed clicks would lock the creator out of their own page. Tab stops are computed **structurally**
  — controls inside a collapsed `<details>` are not stops — rather than geometrically, since a layout
  measurement cannot tell "collapsed" from "not laid out yet".
- **§4.3 anchoring finished.** `solveInspector` had been written and never called. It now decides the
  one thing the host cannot know — that neither side fits inside the frame's own viewport — and the
  inspector takes a corner with a leader line. The host stays authoritative for *which* side, because
  it owns the frame's geometry; two sources of truth for that would fight.
- **§14 the production dead end explains itself.** `AuthoringDisabledReason` is a closed enum on the
  bootstrap contract, so no server text crosses the boundary and the SDK owns the wording:
  *"Authoring runs on staging, not production"*, then the real reason — building means clicking through
  your own product, and in production those clicks act on real customer data (§14.3's first risk, stated
  in those terms) — then the path. A schema test asserts a *message* is refused where the enum is
  accepted.
- **§14.2 written into the tests.** Draft isolation is non-resolvability, never a visibility filter, so
  `draft-non-resolvability.test.ts` guards the **absence** of a code path: no content-visibility flag
  and no draft endpoint anywhere in the delivery source. CSS `visibility` is deliberately not matched —
  a pattern that cries wolf gets deleted.
- 39 tests (6 theme staleness and the diverged dot, 7 focus trap and anchoring, 11 activation, 4 control
  map, 4 availability, 3 draft isolation, 4 renderer parity).
- **Two real cycles the boundary gate caught.** Sourcing the capability map from the registry made
  `experience-authoring-capabilities` ⇄ `experiences/definition` circular, and putting the per-type
  section registration inside `inspector-sections` pulled the section registry into the experience
  graph. Fixed by extracting `experiences/capabilities.ts` as a leaf for the shared vocabulary and
  `experiences/inspector-registration.ts` as the one-way bridge, so the section registry stays a leaf
  too. Typecheck was happy with both cycles; only `pnpm boundaries` saw them.

### 5.1 B7 resolved — the style gate was a no-op

**Finding: `pnpm styles:check` has been inspecting zero declarations.** `postcss-styled-syntax` only
parses *tagged* template literals. All 43 style modules use an untagged
`export const X_CSS = \`…\``, so stylelint parsed each file, found no CSS, and reported success.

**Fix taken.** S4 is enforced by `scripts/check-design-tokens.mjs`, wired as `pnpm tokens:check`.

- Scans the style modules for raw colour values in colour-bearing declarations.
- `${…}` interpolations pass: those are token-sourced.
- `foundation.ts` is exempt — it is where the custom properties are declared from the tokens.
- **Baselined** at 222 pre-existing violations, so the gate fails only on *new* ones.

**Two improvements this pass:**

1. **The scan now covers `authoring/panel-styles.ts`**, which draws the chrome that sits over the
   customer page — the place the boundary matters most, and it was outside the scan entirely. It
   contributes zero violations: the pill, filmstrip, picking chip and dimmer are all token-sourced.
2. **Baseline keys carry an occurrence index instead of a line number.** Deleting eight lines from a
   style module used to present nine untouched violations as new work, which trains people to
   regenerate the baseline — the one thing that must not become routine.

## 6. Blockers

| # | Blocker | Blocks | State |
|---|---|---|---|
| B1 | `rich-content-authoring.md` and `authoring-free-shell.md` describe incompatible surfaces; both read as current | Slice B | open — a decision, not code |
| B2 | Session lifetime (10–15 min, no refresh) predates locking and long-form rich content | Slice H | open |
| B3 | ADR-0014 amendment for content-addressed narration audio | Slice F (narration) | open |
| B4 | ADR recording that CRDT co-editing is ruled out on schema grounds | Slice H | **closed** — ADR-0026, step-partitioned concurrent authoring |
| B5 | Editorial Air source doc named by `AGENTS.md` | — | **closed** — tokens live in `creator-chrome-tokens.ts`; `AGENTS.md`'s path reference is stale and should be repointed |
| B6 | Vitest could not be run from the earlier Linux shell | full-suite verification | **closed** — `pnpm test` runs on the Mac: **180 files / 1404 tests passing, 0 failing** |
| B7 | Stylelint override rules dormant — untagged templates are never parsed | S4 | **closed** — root-caused; S4 enforced by `pnpm tokens:check` (5.1) |
| B8 | 43 style modules use untagged templates, so the whole stylelint config is inert | style linting generally | open — tagging them is a separate pass with a large first run |
| B9 | The document title is document-scoped but still renders in the filmstrip | placement-law purity | open — needs a frame-side title field in Operations; the host owns the commit today |
| B10 | Operations has no **Check** section (§4.6, §7.3) | — | **closed** — Check ships with predictive QA and the contrast gate |
| B12 | The §8.1 mutation queue is not the live save path; `panel.ts` still autosaves the whole document | per-path semantic transport, §15.3 CAS in production | open — the queue, its CAS path and its hold/resume are complete and tested; swapping the transport is its own change |
| B13 | No server-side presence or lock endpoint, so presence and locks render but are never produced | §15 shipping | open — blocked on B2, because expiry-driven release needs the client to know when the session expires |
| B11 | The runtime renders popup / modal / hotspot only, so a banner, slide-in, drawer or floating form is authored but not rendered | announcement + checklist shipping | open — the authoring side is complete and stores the creator's choice; the renderers are runtime work outside this plan's scope |
| B14 | `validateTourPublishReadiness` accepts only `tourStep` at the document root, so every non-tour seed the §5 registry produces fails publish with `unsupported_tour_block` | any non-tour type shipping | open — **this gates B11**: the renderer gap is moot while the artifact cannot be produced. Needs a per-type publish validator selected by experience type, which the registry can now supply |
| B15 | Survey responses are never captured. `renderFormFieldNode` builds inert DOM with no change listener; nothing collects values, no event carries them, `analytics_events` has no response shape, and there is no aggregate | survey being a product rather than a rendering | open — the largest gap. Needs its own decision: response capture is a new privacy surface (free-text answers are customer content), so it wants an ADR before a table |
| B16 | `sdk-authoring` emits no telemetry of any kind, so no authoring surface this plan added is measurable — brand-variant choice, assist accept/reject/undo, conflict resolution and activation failure are all invisible. `SelectorDiagnosticEvent` and `TargetDiagnosticEvent` exist in the schema with **no producer anywhere** | knowing whether any of this works | open — pre-existing gap that the new surfaces inherit rather than one this plan introduced; needs an authoring-side channel, which does not exist today |
| B17 | §14.3.2's analytics pollution — the author's own click-throughs are indistinguishable from real product events | production authoring | open — not blocking today only because production authoring is locked out; it is a prerequisite the moment that changes |

---

## 7. Product bugs found and fixed while making the suite green

The suite was red on this branch before any of this pass's work: **9 failures across 5 files.** Three
were stale test expectations from the in-flight panel→page migration; the rest were real defects.

1. **Two toolbars over one card.** A selection bubble rendered Bold / Italic / Link on top of the
   identical controls in the persistent bar — two interactive Lodariq layers on the same pixels
   (§3.4 rule 1) and exactly the vanishing-controls hunt §4.2a rule 4 exists to prevent. Deleted,
   along with its now-dead `readRangeViewportRect` helper and CSS.
2. **Opening a select in the toolbar's More menu silently discarded the author's selection.** The
   pointer guard knew about select triggers and popovers; the selection guard did not. Focus moved
   out of the editor, the selection sync overwrote the saved range with a collapsed one, and every
   control in that menu — inline animation, font size, colours — quietly did nothing. Both guards now
   share one `TOOLBAR_SURFACE_SELECTOR`.
3. **Inserting media left the insert panel sitting over the card.** Every other insert option closes
   the menu; media did not, so a second insert toggled the panel shut instead of opening it.
4. Five pre-existing TypeScript errors in `rich-content-block-handles.tsx` /
   `rich-content-block-inspector.tsx` (a hover type that had grown geometry fields it did not
   declare, and an unused import). `pnpm typecheck` is now green repo-wide.
5. Localization: 28 missing catalog messages and 21 stale ones across all 8 locales. `pnpm i18n:check`
   is green; the stale entries were leftovers from the deleted panel (canvas zoom, panel drag/resize,
   preview announcements).
6. A dead E2E helper and an unused parameter that kept `pnpm lint` red.

### 7.1 A trap worth knowing about: `pnpm vitest run` tests the last build

`@lodariq/sdk-authoring` is a workspace dependency, so Vite externalizes it and resolves it through
its `exports` map to `dist/` — the `resolve.alias` entries pointing at `src/` do not apply. A direct
`pnpm vitest run` therefore exercises **whatever was last built**, and edits to source appear to have
no effect. `pnpm test` is unaffected because turbo builds before testing.

This cost real time here: several source edits looked inert until the resolved function turned out to
be minified `dist` output. Two fixes were tried and both rejected:

- `server.deps.inline: [/^@lodariq\//]` — breaks 23 API and dashboard tests, which depend on being
  externalized.
- Narrowing it to `/^@lodariq\/sdk-authoring/` — loads a second copy of Lexical and Floating UI, so
  editor tests fail on duplicated module state.

**So the rule is: run `pnpm test`, or `pnpm --filter @lodariq/sdk-authoring build` before a direct
`vitest` run.** Worth a line in the contributing notes; a config fix would need the package to expose
a source-conditional export.

### 7.2 `pnpm test` exited 1 with nothing failing

Separately, the suite exited non-zero while reporting every test green. jsdom's teardown calls
`close()` on every child browsing context, and the bridge suites stub an iframe's `contentWindow` with
a plain `{ postMessage }` object — so teardown threw `window[i].close is not a function` after the run
had already passed. Patching the global `window.close` does not help: vitest holds the environment's
own reference from before setup files run. `vitest.setup.ts` now detaches stubbed frames in an
`afterEach`, which fixes the cause rather than the symptom. **`pnpm test` exits 0 for the first time on
this branch.**

---

## 8. Verification

| Gate | Result |
|---|---|
| `pnpm test` | **209 files / 1661 tests passing**, 7 files + 41 tests skipped, 0 failing, **exit 0** |
| `pnpm typecheck` | **20/20 packages clean** |
| `pnpm lint` | **13/13 clean** |
| `pnpm i18n:check` | **1611 authoring messages complete in all 8 locales** (13 112 translations) |
| `pnpm tokens:check` | passed — 46 style modules + `panel-styles.ts`, 222 baselined, **0 new** |
| `pnpm architecture:check` | passed (2 barrels, 9 coordinators); every new overlay, inspector, mutations, ai and narration module is in the back-reference list so none can depend on the facade |
| `pnpm boundaries` | 7 warnings, all pre-existing orphans, 0 errors (1108 modules cruised) |
| `pnpm knip:check` | passed |
| Contrast (computed) | every creator-chrome pair AA or better; both generated brand variants AA **by construction**, asserted in tests |

New tests in Slice F: **62** across brand variants, the offer and its acceptance payload, the assist
contract/machine/wiring, per-locale target overrides, and narration. Slice G adds **19** more across
registry completeness and extension, seeded content, and the edge-drag gesture, and Slice H **33**
across the presence model, its surfaces, and the queue's hold and conflict paths.

---

## 9. Next

1. **Slice H + the gated decisions.** Presence, step-level soft locks and cross-creator CAS with a
   conflict chooser (§15), which needs B2 (session lifetime) answered first, plus B3 (the ADR-0014
   narration-audio amendment) and B4 (an ADR ruling out CRDT).
3. **Resolve B1** by reconciling `rich-content-authoring.md` with `authoring-free-shell.md`. A decision,
   not code, and it still gates the last of the tray migration.
4. Write the S1 zero-keyboard E2E and the S5 rapid-edit E2E; both are asserted only at unit level today.
5. Smaller carry-overs: per-property override indicators and the four override actions (needs a schema
   binding), the corner-and-leader inspector fallback, B8 (tag the style templates), B9 (move the
   document title into Operations).

---

---

## 10. Coverage assessment — 2026-08-17 (final pass)

Measured against `authoring-ux-model.md`, section by section. Legend: **done** · **partial** ·
**gated** (client complete, blocked on a transport or decision) · **not started**.

| § | Feature | State | Evidence |
|---|---|---|---|
| 3.1 | Placement law (3 tiers) | **done** | `inspector-sections.ts` · `layer-manager.ts` |
| 3.1a | Pointer-first rule | **partial** | every control is pointer-complete and nothing prints an unwired shortcut; the zero-keyboard E2E is still unwritten |
| 3.3 | Modes → Editing ⇄ Browsing | **done** | `mode-pill.ts` |
| 3.4 | Layer manager, reserved rect, avoidance | **done** | `layer-manager.ts` · obstacle list · `findOverlaps() === []` |
| 4.1 | Mode pill | **done** | `mode-pill.ts` + copy module, now carrying presence and draft divergence |
| 4.2 / 4.2a | Card + toolbar solver | **done** | `solver.ts` |
| 4.3 | Inspector: sections, anchoring, focus trap | **done** | registry + `solveInspector` wired, flip → corner-with-leader, Tab cycles, focus restored |
| 4.4 | Target legibility, three states, breadcrumb, match count | **done** | `bridge/targeting/*` |
| 4.4a | Freeze · disambiguation · click-to-pin | **done** | `page-freeze.ts` · `disambiguation.ts` |
| 4.5 | Filmstrip multi-select | **done** | `filmstrip.ts`, now with presence avatars |
| 4.6 | Operations, including **Check** | **done** | `operations-hub.tsx` · `operations-check.tsx` with jump-to-element |
| 4.7 | Preview, runtime-bound progress | **done** | `onEditPreviewStep`, runtime step binding |
| 5 | Other experience types | **done** (authoring) / **gated** (publish + render) | `experiences/` registry, all six types, seeds, edge-drag → form. B14: only `tourStep` roots pass publish readiness, so no non-tour seed can produce an artifact; B11: banner/slide-in/drawer/floating have no runtime renderer; B15: survey collects nothing |
| 6.1 | Token stack, no CSS escape hatch | **done** | `creator-chrome-tokens.ts` · `pnpm tokens:check` |
| 6.2 | Named step styles | **done** | `step-style-reuse.tsx`. Per-property override indicators remain the one open piece |
| 6.3 | Theme snapshot staleness | **done** | `theme-staleness.ts` + `Theme updated — reload to see it`; the version handle compares content hashes |
| 7.1 | Brand theme generation (Blends in / Stands out / Start plain) | **done** | `brand-variants.ts` · `brand-theme-offer.ts`, AA by construction |
| 7.2 | Contrast gate | **done** | WCAG at edit time and in Check, APCA as the secondary readout |
| 7.3 | Predictive layout QA | **done** | `predictive-qa.ts`, warning-only first per §13 |
| 7.4 | AI copy assist | **done** (client) | five verbs, step drafts from the accessible tree, design-system guardrail. Provider is a seam |
| 7.5 | `⌘K` command loop | **done** | preview → accept / reject / refine / undo, batch confirm |
| 7.6 | Translation | **done** | drafts into locale variants, per-locale target overrides resolved at materialization, grouped in Check |
| 7.7 | AI narration | **done** (authoring) / **gated** (audio) | script separate from copy, language inferred, lexicon, cache key. B3: audio needs the ADR-0014 amendment |
| 7.8 | What is deliberately not built | **done** | no unanchored chat, no AI targeting, nothing auto-applies to a release |
| 8.1 | Mutation queue | **done** (mechanism) / **gated** (transport) | queue with CAS and hold/resume. B12: `panel.ts` still autosaves whole documents |
| 8.2 | Draft-diverged semantics | **done** | dot on the environment chip, named for assistive tech |
| 8.3 | Renderer parity | **done** (guarded) | the canvas resolves composition, style and theme from the *runtime's* resolvers; `renderer-parity.test.ts` stops a second implementation appearing |
| 8.4 | Activation reliability | **done** (model) | `activation-diagnosis.ts`: named stages, popup-blocked → same-tab, per-origin resumable intent. The launcher wiring is host work |
| 9 | Control map | **done** | `docs/plans/authoring-control-map.md`, enforced by `control-map.test.ts` — no row prints an unwired shortcut |
| 9.1 | Keyboard operability | **done** | inspector focus trap, `Esc`, focus restoration, meaning never colour-only |
| 9.2 | Validating rather than asserting | **partial** | the task set is published in the control map; the session itself is a research activity |
| 14.2 | Draft isolation by non-resolvability | **done** | `draft-non-resolvability.test.ts` guards the *absence* of a visibility flag |
| 14.4 | Production dead end that explains itself | **done** | `AuthoringDisabledReason` + `authoring-availability.ts`, naming the real risk |
| 15 | Concurrency: presence → locks → CAS | **done** (client) / **gated** (endpoint) | ADR-0026 · `presence/*` · conflict chooser. B13: no presence/lock endpoint yet |

### Slice roll-up

| Slice | State |
|---|---|
| 0 · tokens, geometry, solver | **complete** |
| A · queue, header, runtime progress | **complete** (queue transport is B12) |
| B · layer manager, inspector, tray migration | **complete** — anchoring and focus trap included |
| C · style reuse | **complete** except per-property override indicators |
| D · targeting legibility | **complete** |
| E · Operations → Check | **complete** |
| F · AI layer | **complete** except narration audio (B3) |
| G · experience registry + other types | **complete** — S3 enforced; renderers are B11 |
| H · concurrency | **complete** on the client — endpoint is B13 |

**Read:** the research is implemented. What is left is not design work: four transports and two
decisions (B1–B3, B11–B13), each with the client side already written and tested against it, plus two
E2Es (S1, S5) and per-property override indicators.

### Gates

| Gate | Result |
|---|---|
| `pnpm test` | **209 files / 1661 tests passing**, 7 files + 41 tests skipped, 0 failing, exit 0 |
| `pnpm typecheck` | 20/20 packages clean |
| `pnpm lint` | 13/13 clean |
| `pnpm i18n:check` | 1611 authoring messages complete in all 8 locales (13 112 translations) |
| `pnpm tokens:check` | pass · 46 style modules + `panel-styles.ts` · 222 baselined, 0 new |
| `pnpm architecture:check` | pass · 2 barrels, 9 coordinators |
| `pnpm boundaries` | 7 warnings (pre-existing orphans), 0 errors |
| `pnpm knip:check` | pass |

---

## 11. Log

**2026-08-18 (13)** — **The inspector was dense because its controls expand their options inline.** Not
because anything was in the wrong tier. Measured before touching it: **57 visible controls across six
sections** in a 320×540 popover — `Style` 17 in 428px, `Actions` 22 in 365px — against the prototype's ~22
with a largest section of 9.

The proposal that got there was wrong first, and the user caught it. I had argued for moving per-step
colour to Operations → Appearance; they pointed out that anything moved there still has to show how the
popup will look, which means a replica, which brings back a canvas and config trays — the floating panel
again, in a modal. That is exactly what §3.1's placement law exists to prevent, and per-step colour
belongs to the step: *"if it belongs to the thing you selected, it lives in the inspector anchored to that
thing."* I was arguing against my own citation.

Reading §7.2 made the split sharper, and we had shipped it backwards. The prototype specifies
*"non-blocking **inline warning** on the offending control while editing"* with the audit as a
*"**publish-blocking** item in Operations → Check"*. We shipped a permanent `REVIEW AND PREVIEW · AA · AAA`
aside plus an APCA figure inside the popover — the audit, in the wrong place, always open — and no
publish-blocking check at all. The theme-level table Operations audits is four token *pairs*; it never
needs a replica, which is why that half genuinely can live there.

So nothing moved tier. The density came from one change:

- **`PropertyChoiceField` / `PropertyColorField` gained a `presentation` prop.** `segmented` stays the
  workspace form; `menu` is the prototype's `.fld` row — label left, one `.pk` pill right that opens the
  choices. Same options, same value, same change; one visible control instead of the option count.
- **`AuthoringSelect` gained `size="compact"`.** A size, not a new control — the menu, the keyboard model
  and the a11y are Radix's, unchanged. That is what makes this different from the CSS squeezing: the
  variant is in the API rather than implied by specificity.
- **The colour palette moved *behind* the pill**, not away. Verified in the browser: the menu still holds
  all five quick colours, the custom picker and `Use Brand surface`.
- **The five appearance tabs are gone.** They existed only because each control was full-width; as rows
  all five fit, so `Background · Text · Border · Border weight · Shadow` are five plain rows now.
- **Contrast is an inline warning shown only when the pair fails**, per §7.2.

Result: `Style` 17 → 5 rows, `Actions` 22 → 7 rows, and every property still reachable. `Actions` is now
the prototype's section exactly — seven `.fld` rows and the italic why-note.

Two things fell out on the way. `QUICK_COLORS[0]` was `#006b58`, the pre-adoption mint — it survived the
palette swap and is why authored buttons kept filling green; it is the adopted palette now, with a test on
the retired value. And the design-token boundary caught a raw `#ffffff` I introduced for the swatch
check-mark, which is the guard doing its job; the selected ring carries the state instead.

**The other half of §4.3's cap now exists.** The section cap was already enforced at registration and
throws past seven — that rule was holding while `Actions` legally registered one section and put
twenty-two controls in it. `inspector-density.test.ts` guards the rows: every composition property must
take a pill, the tab strip must not come back, contrast must stay a warning, and no colour choice may be
dropped when the palette moves behind the pill.

Gates: 212 files / 1690 tests, typecheck 20/20, lint 13/13, tokens 217 (unchanged baseline), i18n 13,168,
boundaries 0 errors, architecture and knip pass.

**Not done:** the same treatment for the block inspector (button, media, form field) — it shares
`PropertyChoiceField`, so it is the same one-line change per call site, but it has not been walked.
`Advanced` is still 11 controls. And the control-by-control audit across every selection kind is still
outstanding.

**2026-08-18 (12)** — Six user-reported defects, each reproduced in the browser before it was touched.

1. **The pill's menu did nothing, and `Browsing` collapsed the editor.** Two bugs on the same click.
   The pill lives in the panel's shadow root, so a document-level listener sees its target retargeted to
   the host: `element.contains(event.target)` was false for the pill's *own* pointerdown, so the menu
   closed before the `click` could reach the item, and the click landed on the page instead. The
   click-outside guard then read that as leaving the editor. `composedPath()` fixes the first.
   The second was independent: `eventInsideOverlayChrome` enumerated one selector per surface and had
   never listed the mode pill, so *any* press on it was "outside". It now matches
   `[data-lodariq-authoring-control="true"]`, which every shell surface carries.
2. **Popup resize did nothing.** The drag started (the ring lit) and then died silently. `attachEdgeResize`
   listened on the window without taking pointer capture, and the card renders inside an iframe that
   covers the area being dragged across — pointer events do not cross that boundary, so the first move
   inward went to the iframe and the top window never saw `pointermove` or `pointerup`. Capture on the
   handle, listeners on the handle. Verified end to end: 360 → 288px, commit on the bridge, card follows.
   The ring now also tracks the pointer during the drag, which it never did.
3. **Everything flashed on every config change.** Measured per animation frame: the iframe jumped from
   `726,128 714×564` to `498,36 744×612` and back within ~25ms. The runtime tears the preview popup down
   and mounts a replacement on each change, and the null card rect in between fell through to a default
   rect. The last known rect is held through a transient null now; re-measured, the rect is completely
   stable across a change.
4. **The toolbar reserved 420px for three words.** §4.2a rule 1 is about not being *coupled* to the card —
   it exists so a text toolbar is never squeezed into a 260px card. Content-sized satisfies that too, and
   the solved span is still the ceiling. Measured: 327px in the step context, 420px once the caret lands
   in text.
5. **Placement dots drawn across the open inspector.** They are host chrome anchored to the target; when
   the target sits behind the inspector they landed on it. The compass now stands down for the card *or*
   the inspector — the frame as a whole would withhold them nearly always, since it brushes the target in
   the ordinary adjacent case.
6. **Every dropdown opened from the glass inspector was a white sheet.** The same class of bug as the
   shell's, one layer down: `workspace.ts` re-declares the light contextual palette *on each menu surface*
   — right in the workspace, wrong over a customer's page. They take the chrome's menu pair on glass now,
   and the fidelity guard was rewritten to check the palette's *values* rather than ban the property name,
   which is what made it fire on the fix.

Also this pass: the block inspector's header had a layout only inside the wide content tray, so its title
and close button sat side by side mid-sentence — it gets the step inspector's header and a scrolling body;
the sequence editor under Advanced ships as a 600px-wide trigger → wait → continue strip with arrows and
became an unreadable pile at 320, so it is the prototype's Approach list: numbered lines, plain language.

**Measured, not fixed:** the first popup takes ~590ms from the click in dev, of which the frame's own
document and modules are ~150ms — a Vite-dev module waterfall that the production bundle does not have.
Worth a warm-up pass, but the honest number is not 1–2s once bundled.

**Reproduced and still open:** action-button resize has no affordance at all — `useActionResize` was
deleted in this branch and nothing replaced it, so this is a feature to restore rather than a bug to fix.
The colour row still wraps "Use Brand surface" onto three lines against the custom-colour control, and its
swatches render grey. Authored action buttons still fill pre-adoption green.

**2026-08-18 (11)** — The jumping, the clipped inspector and the card-over-target were all one
architectural fault, and this entry is the fix for it. Measured in Chromium against `fixture-host` before
and after each change.

**Root cause.** The overlay frame stacked toolbar, card and inspector as a flex column-plus-column inside
one iframe, and the host sized that iframe from the card alone. Three consequences, which are exactly the
three the user kept reporting:

- The inspector could never be taller than the card. Measured: content 579px, visible 173px. Everything
  past the cut was unreachable — which is why Advanced "did not exist".
- Opening the inspector re-solved the frame's width and height, so the surface resized under the pointer.
  Actions measured 1022px of content and drove the frame to match: the 300 → 1000px jump.
- The card was a flex child, so its position was a layout result rather than the runtime's placement.

**The fix** is `authoring/overlay/frame-layout.ts`: one pure `solveOverlayFrame` that composes the
existing `solveToolbar` and `solveInspector`, takes their union as the iframe box, and returns frame-local
boxes. The frame positions three absolutely positioned peers from CSS custom properties — the prototype's
`#tbar` / `#cwrap` / `#insp`, which is what `solve()` does there. Verified: the card holds at
`1068,140 360×148` across idle, Style, Placement, Actions, Advanced and Target; the popover sizes itself
per section (349 / 540 / 427) and scrolls internally past the 60vh cap.

Two measurement bugs found on the way, both self-fulfilling:

- `max-height: 60vh` **inside** the frame resolves against the frame's own height, which the host had
  just sized from that value — so the cap shrank to 60% of itself every pass (540 → 338). The cap belongs
  to the host, the only side that knows the real viewport.
- The height reporter measured the scroller, whose `scrollHeight` equals its client height whenever the
  content is shorter. The reserved height could only ever grow: closing a long section left a band of
  empty glass. Measured on the sections instead.

Also fixed, each reproduced first:

1. **The card could sit on its own target.** Clamping it into the viewport caused it: a target hard
   against the right edge leaves less than a card's width beside it, so the clamp slid the card back
   across the target. `solveOverlayFrame` now takes the target and moves the card to the side with room —
   the opposite side, when the preferred one has none — and leaves a placement that already clears it
   alone. Four cases under test, including a full-width target where only a vertical side can work.
2. **The card could land off-screen** for a page-sized target; the prototype clamps into the stage, so
   this does too.
3. **Step deletion from the filmstrip**, which is where insertion already lives (§4.5). Hover- or
   focus-revealed × on the chip, absent on the last step, `Delete`/`Backspace` as an accelerator on the
   visible control. New `remove` shell-step command.
4. **Two `⋯` side by side** in the toolbar. The editor's formatting overflow keeps the ellipsis; step
   settings takes a sliders glyph, because it opens settings.
5. **The formatting controls showed with nothing selected.** In the step context the middle is now only
   the prototype's `Style · Placement · Actions`; the editor's controls appear when the caret lands.
6. **A literal `ils>`** — the tail of a `</details>` — was rendering as visible text in the picker's
   weak-target card.
7. **The picker offered two exits.** A floating `Interact first` / `Cancel` pill pair duplicated the
   band's, in the opposite corner. Removed; the band carries both, keeping the DOM contract the tests
   assert. The band now also steps to the bottom edge when the candidate is underneath it (§3.4 rule 5) —
   it sits where a product's own navigation is, which is often the thing being pointed at.
8. **The mode pill and the creator launcher shared the bottom-right corner.** The launcher lives in the
   host page's light DOM where the layer manager could not see it; it is a reserved rect now.
9. **The compass was four 32px glass discs** landing on the neighbouring controls. Now the prototype's
   `.cmp` affordance: 14px accent dots with a light ring, offset clear of the target, the current
   placement inverted. Two leftover inset rules from the old treatment were still pulling one dot inside
   the target's label.
10. **The numbered badge sat at the target's centre**, over the customer's own label. Corner-anchored and
    22px now.
11. **Inspector density.** The workspace's stacked caption-over-full-width-control is right in a 640px
    tray and wrong in a 320px popover — four properties filled the whole cap. Now the prototype's `.fld`
    row (label left, control right), `.schip` chip rows, `.imenu` command lists and the italic `.why`
    note, all scoped through the column's attribute so they outrank the tray rules without `!important`.
    `PropertyChoiceField` / `PropertyColorField` moved from `fieldset`/`legend` to `div`/`span`, because a
    legend cannot be a flex item per spec.
12. **Placement opened a popover on top of the inspector.** Its target row duplicated the Target section
    and carried a nested `AuthoringPopover`. In the inspector the section is now the side control and its
    why-note only; the target keeps its own section, which is the prototype's split.
13. **Advanced** sharpened: the preview is a framed specimen with a caption rather than a light panel
    that has escaped onto glass, and `Delete step` reads as the destructive control it is.

Gates: 211 files / 1684 tests, typecheck 20/20, lint 13/13, tokens 217 (unchanged baseline), i18n 13,168
translations across 8 locales, boundaries 0 errors, architecture and knip pass.

**Still not matched:** the prototype's Placement section has an `Offset` row; ours has no offset control
and adding one is a schema plus runtime change. Operations is still the light Editorial Air sheet while
the chrome around it is glass. Authored action buttons still render the pre-adoption green. The block
inspector (`rich-content-block-inspector.tsx`) has not been through this pass at all.

**2026-08-18 (10)** — Driven from browser screenshots rather than from reading. Every item below was
reproduced in Chromium against `fixture-host` and re-verified after the fix.

Defects found and fixed:
1. **The frame jumped 300px → 1000px** on opening settings or typing. I had let the inspector's
   `scrollHeight` into the frame's content height, which defeats §4.3's own 60vh-with-internal-scroll cap.
   Removed, and §4.2a rule 3's hysteresis applied so a keystroke no longer re-solves geometry.
2. **Numbered step badges drawn over the card, toolbar and inspector.** Pulses now measure against the
   whole reserved frame rect, not the card alone.
3. **The compass ringed the card's own copy** when the card sat on its target. Suppressed in that case
   only — adjacent is still fine — and the current placement is now an inset marker rather than a 32px
   disc covering the customer's button label.
4. **Target picking could not reach the page.** Picking hid the frame *decoration* but never the iframe,
   which stayed at `pointer-events: auto`. A dead zone the size of card + toolbar; widening the frame for
   rule 1 made it obvious, but it predates that.
5. **Two invalid `box-shadow` literals** — `'…${TOKEN}…'` in single quotes, in `page-context.ts` and
   `target-picker.ts`. The picker outline and the reveal marker have been drawing no halo at all.
6. **No way to delete a step.** `deleteTopLevelBlock` existed on the controller, correct and unused;
   nothing in the overlay called it. Now in the inspector's Advanced section, guarded on the last step.
7. **Portalled menus had no surface** — they painted with `--lq-color-page`, which is the *ground*, so
   over a customer's product they rendered as bare text. Now `--lq-color-panel`.
8. **`.shell-panel` carried the stale mint palette** (`#006b58`) as hardcoded literals and relit the
   overlay's floating chrome, painting dark-navy icons onto dark glass.
9. Toolbar: no horizontal scroll (overflow moves into the trailing menu), the prototype's
   `Style · Placement · Actions` step context, and its own 420px minimum centred on the card.
10. The picker band is a centred glass band rather than a full-bleed slab over the customer's own nav.

**Still wrong, reproduced but not yet fixed** — the next pass, and the reason this is not "matches the
prototype 100%": the block inspector's header clips under its close button and its Action/Style sections
render empty; the Style section's colour row collapses into overlapping swatches and contrast readouts;
the toolbar shows two `⋯` affordances; Operations is still the light sheet while everything around it is
glass; authored action buttons still render in the pre-adoption green. A control-by-control walk of the
prototype's inspector against the shipped one has **not** been done.

**2026-08-17 (9)** — **The chrome did not match the prototype, and the tokens hid it.** Reported by the
user, confirmed by reading the two side by side.

`creator-chrome-tokens.ts` had adopted the prototype's palette exactly — indigo `#7c8cff` on graphite
`#14161c`, glass `rgba(20,22,28,.94)` with `blur(14px)` — and `foundation.ts` declared all of it. Then
`overlay-shell.ts`, the module that actually paints the toolbar and inspector, opened with
`html:has(.shell-overlay) { …light palette…; color-scheme: light }` and overrode every one of them. It
referenced `AUTHORING_CONTEXT_SURFACE_TOKENS` **80 times and the glass tokens zero times**. The result on
screen: a white toolbar and a white inspector floating over the customer's page, beside a dark-glass mode
pill and filmstrip drawn by `panel-styles.ts` — two palettes, one viewport. Every token test passed the
whole time, because the tokens were never wrong.

Fixed by scoping the light override to `.shell-operations` (a full-screen sheet, no page behind it — it
should stay Editorial Air) and letting `.shell-overlay` inherit the dark foundation it was always meant
to. Added `CREATOR_CHROME_CONTROL_TOKENS` for the prototype's on-glass control values, which glass needs
because an opaque control on translucent chrome reads as a hole.

The same module imported no geometry and hardcoded its own: a 44px toolbar where the token says 38,
12px radius where the prototype says 10. Now wired to `OVERLAY_*_PX`.

**The toolbar was also structurally different.** The prototype specifies a persistent frame with a
contextual middle — `＋ Insert │ ⟨CONTEXT⟩ controls │ ⋯` — and what shipped was the rich editor's own
toolbar dropped into a slot: no pinned Insert, no separators, no context label, no step context. Rebuilt
it: `overlay/toolbar-context.ts` maps a selection to one of five contexts and names it, the editor
reports the context and portals Insert into a pinned slot the frame positions, and the label carries the
220ms swap.

Two real defects surfaced while doing it:
1. Keying the context wrapper to animate the swap **remounted the portal host**, tearing the toolbar out
   of the DOM mid-interaction — caught by an existing test. Only the label is keyed now.
2. `chooseOverlayToolbarSide` had no `docked` state, so the prototype's third anchor did not exist. On a
   short viewport with a tall card neither side fits and the toolbar rendered below the fold — the exact
   vanishing-controls failure §4.2a rule 4 is written to prevent, and one no behavioural test would
   notice because nothing throws.

`overlay-chrome-fidelity.test.ts` now reads the prototype file itself and compares palette, measurements
and the on-glass hover fill, so "matches the prototype" is checkable rather than a matter of taste. It
also forbids re-declaring the overlay tokens as a light palette. Suite 210 files / 1674 tests, exit 0.

**2026-08-17 (8)** — Final pass: the orphan correctness items, plus two dependency cycles that only
`pnpm boundaries` could see. Theme staleness by content hash with a
visible reload, the draft-diverged dot, the inspector focus trap and the corner-with-leader anchoring
that finally calls `solveInspector`, activation diagnosis with a popup-blocked same-tab fallback and a
resumable per-origin intent, the published control map with a test that forbids printing an unwired
shortcut, the production dead end that explains itself, and §14.2's non-resolvability principle written
into a test that guards an absent code path. Suite 209 files / 1661 tests, exit 0.

**2026-08-17 (7)** — Slice H landed and B4 is closed by ADR-0026. Presence, step and document soft
locks, and cross-creator compare-and-swap with a conflict chooser that never merges block trees. The
queue gained `hold()`/`resume()` so a lapsed session says `Reconnecting…` instead of losing work, and a
lost CAS is dropped rather than retried over the other creator. Found a real bug: the pill's state
equality ignored `peerCount`, which would have frozen presence after its first arrival. Raised B12 and
B13 — the two transports the client is now correct against. Suite 202 files / 1622 tests, exit 0.

**2026-08-17 (6)** — Slice G landed and S3 is closed: the experience registry is the contract the shell
knows, the capability map now reads it instead of keeping a second table, the card's inspector sections
come from the type, every type seeds real content, and edge-drag decides the announcement and checklist
forms. Raised B11 — those forms are authored but not yet rendered. Suite 200 files / 1591 tests, exit 0.

**2026-08-17 (5)** — Slice F landed: the one-click brand theme with two AA-by-construction variants and
`Start plain`, APCA beside WCAG at edit time, the anchored assist loop (five verbs, `⌘K`, preview →
accept/reject/refine/undo, batch confirm) with the design-system guardrail encoded as data, per-locale
target overrides resolved at materialization so publish needs no change, and narration authored
separately from on-screen copy with generation still behind B3. Suite 198 files / 1572 tests, exit 0.
The stale-`dist` trap (§7.1) bit once more — a schema edit needed `pnpm --filter @lodariq/schema build`
before the test could see it.

**2026-08-17 (4)** — Slice B's section registry and step inspector landed: the Popup and Placement
trays now render as collapsible sections behind one `⋯`, with the six-section cap enforced at
registration. Recorded the stale-`dist` trap (7.1) after it swallowed several source edits.

**2026-08-17 (3)** — Slice A landed and Slice B started. Mutation queue, mode pill, layer manager,
runtime-bound progress, minimized header deleted. Suite taken from 9 failures to green; three real
product bugs fixed on the way (two toolbars, selection loss on select-open, insert panel left open).
Token gate extended to `panel-styles.ts` and made line-independent. Localization reconciled. B6 and
B7 closed; B9 and B10 raised.

**2026-08-17 (3)** — Checkpoint review of in-flight work. Slices A–E landed since the last entry:
mutation queue, layer manager, mode pill with the Editing ⇄ Browsing switch, inspector with a section
registry, filmstrip multi-select, style reuse, full target legibility set, predictive QA, contrast gate,
and an experience-capability profile map covering all six document types. Typecheck now clean.
Coverage table added as §9.

**2026-08-17 (2)** — B7 root-caused and closed: `postcss-styled-syntax` ignores untagged template
literals, so `styles:check` has always been a no-op. S4 now enforced by `pnpm tokens:check` with a
222-entry baseline. Fixed 9 stale old-mint literals the palette change had orphaned. B8 raised.

**2026-08-17** — Slice 0 landed. Palette migrated by value-swap; overlay geometry single-sourced; pure
solver added with 20 passing tests; stale status palette in `foundation.ts` corrected. B5 closed, B6
and B7 raised.

---
