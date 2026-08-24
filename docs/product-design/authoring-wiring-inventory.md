# What is not wired, and what each piece needs

Audited 2026-08-23 against the working tree. Two sources: every `WIRE_` marker in
code, and a browser sweep of the authoring chrome, the step inspector and all 21
Operations tabs running on the fixture host.

The `WIRE_` markers are not the whole story. **The two controls that prompted this
audit — canvas zoom and the Appearance match actions — carry no marker at all.**
One is dead in every session; the other is gated on a service no local build
supplies. So the list below is organised by what would actually fix each item,
not by whether someone remembered to leave a note.

| tier | meaning | count |
|---|---|---|
| **A** | Dead in every session. No backend fixes it; the code path ends nowhere. | 4 |
| **B** | Needs an authenticated session. Dead in local dev, live in `apps/editor`. | 8 groups |
| **C** | `WIRE_`-marked stand-ins. Drawn honestly, disabled or session-scoped on purpose. | 14 |

---

## Resolved on 2026-08-24

Worked in a branch off `master@a8ae647`. Each item below is struck from the tier
it was filed under; the entries are left in place so the reasoning survives.

| item | what changed |
|---|---|
| **A1** canvas zoom | Two halves. The value is real: `canvasZoomPercent` and `recordingSteps` moved to `controller-base.ts` and are published on the snapshot, `zoomCanvas()` steps one shared ladder (`local-frame-ui/canvas-zoom.ts`, 60–120 in tens), `setCanvasZoom()` is what the storyboard's own control calls, and `CanvasZoomControl` snaps with `nearestCanvasZoomIndex` rather than `findIndex` — which returned `-1`, and so stepped "zoom out" to the largest rung, for any percent off the ladder. **The rows are drawn disabled anyway**, for the reason in A1b below. |
| **A2** record steps | `continueStepRecording()` runs on `target.pick.result` and appends the next step; `stopStepRecording()` runs on either cancel path. The frame re-sends `authoring.shell.capabilities` with a new optional `recording` field, so the pill row finally reads "Stop recording steps" while a run is live. |
| **A3** Side by side | The three pill tabs are a real view switcher on a `StoryboardView` state. Side by side enables at two ticked steps and ticking the second selects it; Repetition narrows the same grid instead of opening a fourth place to edit a step. Each falls back to All the moment its precondition stops holding. |
| **B1** Match product | `local-dev/mock-brand.ts` supplies `getBrandWorkflowState`, `prepareBrandMatchProposal`, `applyBrandMatch` and `adoptBrandPreviewTheme`, and `connectLocalPanelHostServices` now asks the host for `sampleProductStyle` — **the element picker is the real one**, since `panel.ts` already answered `style.sample.start` and only the frame never asked. `mergeProductStyleTokensIntoDraft` moved from `apps/api/src/product-style-theme.ts` into `@lodariq/schema`, so the local adopt path and the control plane run one implementation. |
| **B2** operations | `local-dev/mock-operations.ts` implements every required method and ten optional ones, derived from the document in front of the creator and a fixed epoch — no `Math.random`, so a screenshot taken twice looks the same twice. Measurement, Analytics, Sessions, A/B, Collaboration (with one lock held by someone else, so takeover is reachable), Applications, Audit, Versions, Copy fixes and the Accessibility sweep all have data. |
| **orphan** `saveStepStyleRecipes` | Deleted. Its three call sites each sat one line above `persistAuthoringResources()`, which writes recipes and checkpoints together through `saveAuthoringResources` — the atomic write the control plane actually offers. |
| **marker count** | `authoring-chrome-migration-handoff.md` §3 claimed 52 markers and listed seams that no longer exist. Regenerated from grep: 23, and the table is now per-marker with line numbers. |
| **B5** saved styles / checkpoints | `local-dev/local-resource-store.ts` backs `loadStepStyleRecipes`, `loadDraftCheckpoints` and `saveAuthoringResources` with IndexedDB — the same storage the media library already uses, one database over — hydrated before mount exactly like `hydrateLocalMediaAssets`. Verified across a real page reload, with the hooks removed as a negative control: without them the style is gone and the menu is back to `Custom` alone. |
| **preview refresh** | Adopting a match reported "Product match was saved, but the preview could not refresh" about a preview that *had* refreshed. `panel.ts`'s `theme.preview.apply` handler returned the replay promise, and a returned promise holds the bridge ack until it settles (the bridge's `onMessage`), against the frame's 2s budget; a replay is compile + resolve + play. Measured: the error at **2075ms with the repainted dialog already on the page**. The handler acks the apply — complete once the theme is stored — and fires the replay separately, surfacing a real replay failure as a host toast. Now saved at ~400ms. The same shape in `authoring.preview.request` ('full' mode budgeting 2s for work step mode already gives 20s) is matched to 20s. |

### A1b. Why the zoom rows are disabled rather than wired

The audit said the working zoom was "a separate local `useState` in
`rich-step-content-editor.tsx`". Driving it in the browser turned up two things
the static read missed.

**`TourStepInspector` is exported and rendered nowhere.** It is the only route to
`RichStepContentEditor`, which is the only consumer of `--storyboard-canvas-zoom`.
So the zoom that "works" is unmounted in the shipped app: there is no zoomable
canvas anywhere today.

**Overlay editing cannot have one.** `frame-layout.ts` says it outright — "the
card's position is the *runtime's* — it is where the shipped popup will appear,
so nothing else may move it". Scaling only Lodariq's card would make the surface
lie about the shipped size, which is the one thing that surface is for, and it
would desynchronise the geometry the host solves the frame against.

So the three rows are printed and disabled with the reason and the answer — *the
card is shown at the size it will ship; use your browser zoom to read it larger*
— and the frame publishes `canvasZoomable` on `authoring.shell.capabilities` so a
workspace that does honour a canvas zoom turns them back on without the pill
knowing anything about workspaces. `t50-chrome-wiring.mjs` holds the line.

### Also fixed: the fixture host could not open a non-tour experience at all

`?scenario=experience-type&type=announcement` builds an announcement base
document, but `public/lodariq-local/manifest.json` statically names
`doc_tour_welcome`, so authoring always opened that id and the frame threw
"Lodariq local authoring document not found" and painted nothing. The host's own
loader already re-ids its base document (`baseDocumentFor`); the frame now does
the same half. Without this none of the non-tour inspectors were reachable in the
fixture, which is presumably why they drifted unnoticed.

Also fixed while in the area, from the same complaint about the inspector:
**the non-tour experience types drew unstyled browser widgets.**
`experience-behavior-section.tsx` was the only inspector code not built from the
shared property controls — a bare `<select>` in `.storyboard-property-row` and a
bare checkbox in `.storyboard-property-toggle`, **neither class defined by any
stylesheet in the repo**. Announcement, hotspot, survey and checklist now use
`PropertyChoiceField` exactly as the tour does: `menu` for a list of choices,
`track` for a two-state one. The four content sections that shared one sentence
("Edit this content on the card.") now each name what they point at.


Not changed, with reasons:
- **Appearance is still unreachable from overlay edit mode** — the route is
  Operations → Appearance or ⌘K. Adding a *More actions → Customize* row is a
  navigation decision, not a wiring one.
- **Tier C** is untouched. Every marker there is drawn honestly.
- **The brand-drift runtime preview** still budgets 4s for the same
  ack-holds-the-replay shape (`controller-snapshot.ts`). It is left alone because
  changing whether its promise is awaited changes the drift flow's own
  contract, and no measurement here says it currently fails.

---

## Tier A — dead in every session

These are not waiting on a backend. Each is a control that is drawn, is
clickable, and does nothing that reaches the screen.

### A1. Canvas zoom — verified inert

`ControllerChromeFeature.zoomCanvas()`
(`packages/sdk-authoring/src/authoring/local-frame-ui/controller-chrome.ts:73`)
updates `this.canvasZoomPercent` and sets a status line. **That field never
reaches the snapshot**, and nothing renders it. The doc comment above the class
claims "the zoom rows drive the same canvas variable the storyboard control
writes" — it does not.

Reached from three places, all live and all inert: the mode pill's *Zoom the
canvas in / out / Reset canvas zoom* rows (`data-pill-zoom-in|out|reset`), and
the `canvas-zoom-in|out|reset` chrome actions in
`controller-bridge.ts:151-153`.

Measured: three consecutive zoom-ins leave `--storyboard-canvas-zoom` unset, the
card at `360px`, `zoom: 1` and `transform: none`.

The one working zoom is a *different* one: `CanvasZoomControl` in
`rich-step-content-editor.tsx:206`, whose value lives in a local `useState` and
only styles the storyboard canvas. It is not shared with the chrome rows and is
lost on remount.

**Needs:** `canvasZoomPercent` on the snapshot, `--storyboard-canvas-zoom` applied
to whichever surface is on screen (the overlay card has no zoomable ancestor
today), and the storyboard control reading the same value instead of its own.

### A2. Record steps from my clicks — stops after one step

`toggleStepRecording()` (`controller-chrome.ts:61`) sets `recordingSteps`, then
calls `appendStepAndChooseTarget()` once. **Nothing else in the codebase reads
`recordingSteps`** — the target-pick completion path in `controller-bridge.ts`
does not re-arm it. So the pill reads "Recording" while recording has already
finished, which is worse than the row being absent.

**Needs:** the pick-completed handler to append the next step and re-open the
picker while the flag is set, and the flag on the snapshot so the chrome can show
a truthful state.

### A3. Storyboard → "Side by side"

`operations-storyboard.tsx:49` is hard-`disabled` with the title "Tick two or
three steps below." Ticking them does nothing: `aria-pressed` tracks
`compare.length >= 2` but `disabled` has no expression to flip.

**Needs:** removing the literal `disabled`, or the comparison view it was meant
to open.

### A4. Colour scheme — fixed today

Held its choice in a local `useState` and wrote nothing; also offered `surface`
and `muted`, which no Tour recipe answers to. Now writes the experience's
appearance preset. Listed here only so it is not re-reported.

---

## Tier B — needs an authenticated session

These work in `apps/editor` and are dead in local dev, because
`local-dev/frame.ts` and `local-dev/install.ts` do not supply the service. They
are drawn disabled, most with a reason on them — honest, but indistinguishable
from broken if you are evaluating locally.

### B1. Appearance → "Match product" / "Use this element's look"

The two the report named. Gated on `!brand.canEdit || !themeGenerationAvailable`
(`panel-body-appearance-modes.tsx:159,174`). `brand.canEdit` comes from
`getBrandWorkflowState`, and `accessibleFallbackBrandState()`
(`controller-model.ts:107`) returns `canEdit: false` — so without that service the
buttons can never enable.

Verified in the browser: both disabled, with the note *"Product matching becomes
available in an authenticated authoring session with Brand edit access."*

**Services missing locally:** `getBrandWorkflowState`, `sampleBrandStyle`,
`applyBrandMatch`, `prepareBrandMatchProposal`, `adoptBrandPreviewTheme`. In
`apps/editor` these are supplied but still gated on the
`SAMPLE_PRODUCT_STYLE` session capability plus `directHostServices.sampleProductStyle`.

**Note:** there is no route to Appearance at all from overlay edit mode. The
panel's *More actions → Customize* entry is not rendered there; the ways in are
Operations → Appearance, or ⌘K → "Generate a brand theme from my product".

### B2. Everything behind the `operations` service

**Local dev supplies no `operations` service at all.** Thirty methods are consulted
by `controller-operations.ts`; every one is absent. That silently disables:

| tab | what is dead locally |
|---|---|
| Analytics | `readAnalytics`, `exportAnalytics`, `readMeasurement`, `updateMeasurement` |
| Audit log | `listAuditEvents`, `exportAuditCsv` — *Export CSV* is disabled on `Boolean(operations.exportAuditCsv)` |
| Check | `runAccessibilitySweep` — *Accessibility sweep* disabled on the same pattern |
| Collaboration | `listComments`, `addComment`, `replyToComment`, `resolveComment`, `subscribeCollaboration`, `claimStepLock`, `releaseStepLock`, `listStepLocks` |
| Share a demo | `createDemoLink`, `readDemoLinks`, `revokeDemoLink`, `readDemoAnalytics` |
| A/B testing | `createExperiment`, `readExperiment`, `updateExperiment` |
| Copy fixes | `listCopySuggestions` |
| Release | `listDeliverySchedules`, `listDeliveryTransitionHistory`, `listDocumentVersions` |
| Audience | `listApplications`, `readDataCatalog` |
| — | `readCommercialUsage`, `listSessions` |

Provided by `creator-install/index.ts` (`createAuthoringOperationsClient`),
`direct-host-services-impl.ts` (`createBridgeOperationsServices`) and
`apps/editor` (`createHostedOperationsServices`).

**Needs, to make local evaluation honest:** a `local-dev` operations stub in the
shape of `local-dev/mock-assist.ts` — the precedent already exists for `requestAiAssist`
and `generateNarration`, and the reasoning there applies verbatim: *"a control
that is only ever disabled cannot be designed against."*

### B3. Language → "Draft every missing string"

Disabled on `!snapshot.translation.available`, which is
`Boolean(services.translateDocument)`. Supplied only by `apps/editor`.

### B4. Release verification and promotion

`verifyStagingRelease`, `promoteExactArtifact`, `approveAndPromoteExactArtifact`,
`requestPromotionApproval`, `releaseUnavailableReason` — all `apps/editor` only.

### B5. Saved step styles and draft checkpoints do not persist

`loadStepStyleRecipes` and `loadDraftCheckpoints` are supplied only by
`apps/editor`. **`saveStepStyleRecipes` is assigned nowhere in the repo** — it is
declared in `local-frame-types.ts:228`, called three times in
`controller-reliability.ts`, and no install path ever provides it. A style saved
in the hosted editor survives only because `saveAuthoringResources` covers the
same ground; the narrower hook is dead weight and should either be wired or removed.

### B6. Media library

`uploadMediaAsset` / `loadMediaAssets` / `loadMediaAssetPreview` exist in local
dev. The *Replace media…* and *Per-locale media…* rows do not — see C.

### B7. Brand drift preview adoption

`adoptBrandPreviewTheme` — `apps/editor` only. Checking drift works locally
(`checkBrandDrift` is supplied); adopting the proposal does not.

### B8. Persist-on-save-request

`persistDocumentOnSaveRequest` — `apps/editor` only.

---

## Tier C — `WIRE_`-marked stand-ins

Twenty markers in code: 14 `WIRE_BE`, 2 `WIRE_DASHBOARD`, 2 `WIRE_DB`,
2 `WIRE_IFRAME`. Each is drawn either disabled with its reason on it, or held for
the session. These are working as designed; they are listed so the count is known.
Every line reference below was checked against the file. The assist provider is
two markers (`local-dev/frame.ts:71` and `mock-assist.ts:12`) and one bullet.

**`WIRE_BE` — needs the control plane**

- Adaptive skipping (`step-flow-section.tsx:289`) — disabled
- Target health history (`target-inspector-sections.tsx:349`) — disabled
- Test a target against a changed page (`target-inspector-sections.tsx:503`) — disabled
- Replace media / per-locale media (`rich-content-block-inspector.tsx:661`) — disabled
- "Describe it for me" alt text (`rich-content-block-inspector.tsx:786`) — disabled
- Media frame radius / caption / loop / mute (`rich-content-block-inspector.tsx:692`) — session-only
- Form-field empty message (`rich-content-block-inspector.tsx:1106`) — session-only
- Workspace event catalogue (`controller-operations.ts:73`, `operations-analytics.tsx:259`) — the success-event picker has no list to offer
- Session replay and return-rate boxes (`operations-analytics.tsx:360`) — printed, not fetched
- Test-user traits for conditions (`step-conditions-section.tsx:281`) — session-only
- Step-lock "Ask for it" (`overlay/shell.ts:191`) — raises a notice; there is no channel to deliver on
- Assist provider (`local-dev/frame.ts:71`, `mock-assist.ts:12`) — local dev uses a deterministic stand-in

**`WIRE_DB` — needs a schema field**

- Target disambiguation rule (`step-target-section.tsx:15`) — the seven answers hold for the session; the document stores one resolved target
- Step → saved-style binding (`types.ts:478`) — no `styleId`, so the binding is derived from a content hash and lost the moment a colour is nudged

**`WIRE_DASHBOARD` — needs workspace settings**

- Copy/paste-style keyboard bindings (`toolbar-style-picker.tsx:7`)
- Link block docs base (`rich-content-block-handles.tsx:84`)

**`WIRE_IFRAME` — needs a bridge operation**

- "Take me to it" — scroll the host page to the target (`step-target-section.tsx:147`) — disabled
- Four palette rows route to the section instead of firing its verb (`overlay/palette-commands.ts:86`): *Generate a brand theme from my product*, *Translate into every locale*, *Publish to staging* and *Narrated demo*. The row opens the control with the creator's finger on it rather than running it. The other `openOperations` rows — flow, storyboard, check, compare — are genuinely "show me this view" and are not affected

---

## Housekeeping

`authoring-chrome-migration-handoff.md` §3 claims **52 markers**. The real count
is **20**. Its per-marker table lists items that no longer exist in code
(resolver sandbox, identify-payload traits and narration timing are still there;
plan limits, per-language pictures, experiment assignment and demo capture are
not). The inventory line and the table under it should be regenerated from
`grep -rn "WIRE_" packages/*/src apps/*/src` rather than maintained by hand.

## Evidence

- `docs/product-design/prototypes/qa/t49-inspector-reaches-card.mjs` — drives every
  step-inspector row against the card
- Browser sweep of all 21 Operations tabs, the mode pill and the step inspector on
  the fixture host; the zoom result above is from three scripted zoom-ins with
  computed style read before and after
