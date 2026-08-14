# Tour Authoring Reliability and Capability Plan

Source of truth: `../../refined-lodariq-prd.md` sections 7.4, 8.3-8.6, 9.5,
11.3, 14.2, and 20; `../../AGENTS.md`; and the creator interaction contract in
`ux-revamp.md`.

Evidence source: the six-step authoring exercise documented in
`../product-design/audits/authoring-showcase-tour-2026-08-13/README.md`.

Status: **Local capability milestone integrated; reliability closure and external validation pending**

Last updated: 2026-08-14

## Current branch reconciliation — 2026-08-14

The isolated implementation was reconciled against the later refactored current
branch instead of being merged as a whole-tree replacement. Most implementation
files were already identical. Where both trees had changed, the current branch's
smaller modules, shared flow analysis, generalized experience-authoring
capabilities, and latest interaction ownership were preserved.

The resulting creator flow keeps direct action fields in **Behavior**, opens
sequence and branch configuration in **Flow Map**, and keeps completion,
accessibility preview, and draft checkpoints in **Review & recovery**. The
derived Flow Map now also has localized node, edge, movement, and keyboard
descriptions and disables local delete gestures that cannot represent a
canonical document mutation. The compatible patched `nanoid` release is pinned
through the workspace override.

### Reconciliation verification

| Gate                        | Result                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration        | 150 files passed, 1 skipped; 1,199 tests passed, 11 environment-gated tests skipped                                             |
| Focused authoring coverage  | Flow Map and persistent-footer integration suites passed; 69 tests                                                              |
| Type safety and lint        | 20/20 workspace typecheck tasks and 13/13 workspace lint tasks passed                                                           |
| Localization                | Dashboard 853, authoring 1,375, and runtime 38 source messages complete; 11,304 translations validated                          |
| Build and size              | Workspace build passed; all 14 build-and-size tasks passed                                                                      |
| Architecture and safety     | Dependency boundaries passed with zero errors; architecture, Knip dependency, style, and migration-safety checks passed         |
| Security                    | Package audit passed with no known vulnerabilities                                                                              |
| In-app browser visual check | Flow Map remained clear at default, 900 px, and 720 px widths; graph labels and safe keyboard behavior were verified; no errors |

### Remaining code closure

The capability surfaces in release trains A through D are present, but the
following system-level work remains before this plan can be called code-complete:

- connect document transactions to real persistence outcomes, bridge-applied
  revisions, retries, and conflict handling instead of recording persistence
  immediately after scheduling a save;
- coalesce preview patches and runtime positioning/collision recalculation on
  animation frames;
- expand structured release-readiness findings and repair routes for
  choreography, timeout recovery, unsupported actions, media validity,
  accessibility names/focus, reduced-motion equivalence, and responsive chrome;
- complete bounded privacy-safe diagnostic envelopes and emit the currently
  declared transaction, choreography, branch, contrast, and repair events;
- provide durable host/API persistence for reusable recipes and named draft
  checkpoints, subject to additive tenant-isolated storage review;
- replace typed media asset identifiers with a validated asset picker/upload
  capability and server-side asset resolution;
- gate authoring controls on deployed compiler and renderer capability metadata;
  and
- add compiler-to-runtime round-trip and cross-browser end-to-end coverage for
  the new flow, recovery, batch, accessibility, responsive, and media paths.

## Initial implementation record — 2026-08-13

All capabilities in release trains A through D are implemented in the local
workspace. The implementation keeps structured TypeBox contracts, immutable
server-compiled artifacts, authoring/runtime package separation, semantic
targeting, exact-origin bridges, and the existing publication guardrails.

### Delivered architecture

- Added closed, bounded canonical contracts for choreography, ordered waits,
  typed actions, branching and fallback rules, completion outcomes, motion,
  spotlight, media, responsive presentation, style snapshots, and accessibility
  preview modes. The schema is now `2.0.0`; compiled document V4 remains
  readable alongside V1-V3; compiler `0.5.0` and renderer contract V4 pin the
  new behavior into immutable artifacts.
- Added compiler flow-graph validation, deterministic transition compilation,
  shared contrast evaluation, safe presentation compilation, release findings,
  and compatibility mapping for legacy linear tours and click-target actions.
- Added narrow authoring modules for document transactions, target-health
  evidence, contextual-surface ownership, protected-surface collision
  coordination, step batches, style recipes, named draft checkpoints, Flow Map
  derivation, sequence editing, responsive/motion/media controls, branch
  simulation, accessibility preview, and runtime-bound preview progress.
- Added runtime executors for choreography, deterministic flow evaluation,
  presentation recipes, protected-surface placement, named SDK events, timeout
  recovery, completion behavior, and privacy-safe branch/choreography
  diagnostics. Coordinates remain presentation diagnostics only and cannot
  resolve or activate product controls.
- Preserved production delivery budgets through explicit code splitting. Tour
  resolution and choreography load only when required; authoring reliability,
  hosted-panel adoption, and the local frame are separate lazy boundaries. The
  ordinary runtime still has no dependency on React, Lexical, or creator UI.
- Localized every added creator/runtime string in Arabic, German, Spanish,
  French, Italian, Belgian Dutch, Portuguese, and Turkish. Locale-sensitive
  async authoring states are covered by integration tests.

### Automated verification evidence recorded on 2026-08-13

| Gate                        | Result                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and integration        | 149 files passed, 1 skipped; 1,189 tests passed, 11 environment-gated tests skipped                                                                 |
| Browser E2E                 | 98 passed, 4 intentionally skipped across Chromium, Firefox, and WebKit                                                                             |
| Type safety                 | 20/20 workspace typecheck tasks passed                                                                                                              |
| Lint                        | 13/13 workspace lint tasks passed                                                                                                                   |
| Localization                | Dashboard 839, authoring 1,338, runtime 38 source messages complete; 11,008 translations validated                                                  |
| Boundaries and architecture | Dependency boundaries passed with zero errors; architecture ownership, Knip dependency, styles, and migration-safety checks passed                  |
| Runtime size                | Loader 3,011/3,072; public bootstrap 5,114/5,120; activation 18,045/18,432; public delivery 7,051/7,168; runtime + tour 43,673/47,104 bytes gzipped |
| Authoring size              | Authoring-owned 201,575/256,000; frame 82,669/146,432; toolbar 9,724/10,240; install 127,406/172,032; hosted entry 68,764/180,224 bytes gzipped     |
| Distribution                | Build and all size gates passed; 171 versioned SDK CDN assets prepared                                                                              |
| Security                    | Package audit passed with no known vulnerabilities                                                                                                  |
| Formatting                  | Every added or modified implementation file passes Prettier; `git diff --check` passes                                                              |

### External evidence not claimed

In addition to the code closure above, these operational checks require target
environments, physical assistive-technology coverage, or deployment authority
and remain intentionally unclaimed:

- recapture the six-step visual showcase against a deployed staging build;
- complete VoiceOver/Safari and Windows screen-reader/browser sessions, plus
  the manual keyboard, 200% zoom, RTL, reduced-motion, and focus-restoration
  evidence described below; and
- validate deployed staging publication, promotion, rollback, and production
  bundle/network traces against real environment configuration.

These checks may produce follow-up defects and cannot be substituted with local
automation or bypassed by a release gate.

## Outcome

Make Lodariq reliable enough for rapid visual authoring and expressive enough
for complex, multi-state product tours. A creator should be able to:

1. Change several appearance properties quickly without losing an edit,
   remounting the popup, changing font metrics, or losing focus.
2. Leave the route or modal where a target was verified without destroying the
   verified evidence.
3. Author an explicit sequence such as **activate Import -> wait for the dialog
   -> show the next step**, including a bounded recovery path.
4. Run a full preview whose Tour card is never obscured by Lodariq's authoring
   chrome and whose progress reflects the runtime, not editor selection.
5. Reuse a safe step style across selected steps or documents and see contrast
   problems at the moment a custom color is chosen.
6. Build branching, action-rich tours with clear completion behavior, test them
   from any step, and understand their flow before release.
7. Create richer presentations without introducing arbitrary CSS, JavaScript,
   raw HTML, coordinate-driven actions, or authoring code in production.

## Scope and priority

The first release train contains the seven requested enhancements and the two
interaction gaps exposed by the same authoring exercise. Later release trains
add the broader capability wishlist on top of those foundations.

| ID      | Capability                                                                          | Priority | Release train |
| ------- | ----------------------------------------------------------------------------------- | -------- | ------------- |
| TXN-01  | Transactional debounced appearance edits                                            | P0       | A             |
| TGT-01  | Context-aware target availability with retained verification                        | P0       | A             |
| ACT-01  | Explicit activate -> wait -> continue choreography                                  | P0       | A             |
| CHR-01  | Tour-card-aware minimized chrome placement                                          | P0       | A             |
| CHR-02  | Automatic popup avoidance for on-page authoring controls and active targets         | P0       | A             |
| PRV-01  | True-user full preview and runtime-bound progress                                   | P0       | A             |
| STY-01  | Copy style, apply to steps, and reusable recipes                                    | P0       | A             |
| A11Y-01 | Immediate custom-color contrast validation                                          | P0       | A             |
| UI-01   | One active contextual authoring surface at a time                                   | P0       | A             |
| FLOW-01 | Branching and typed conditions                                                      | P1       | B             |
| ACT-02  | Multiple actions, observed product gestures, failure paths, and completion behavior | P1       | B             |
| EDIT-01 | Step multi-select, batch operations, and stronger duplicate workflows               | P1       | B             |
| FLOW-02 | Flow Map, reachability diagnostics, and preview from any step                       | P1       | B             |
| PRES-01 | Motion recipes, spotlight emphasis, richer media, and structured content blocks     | P2       | C             |
| PRES-02 | Responsive presentation variants                                                    | P2       | C             |
| A11Y-02 | Keyboard, screen-reader, reduced-motion, zoom, and reflow preview modes             | P1       | C             |
| HIST-01 | Transaction-aware history and named draft checkpoints                               | P1       | C             |
| REL-01  | Expanded release readiness for flow, actions, accessibility, and responsiveness     | P1       | D             |
| OBS-01  | Privacy-safe authoring and runtime diagnostics                                      | P1       | D             |

## Product and architecture invariants

- Canonical content remains structured block JSON validated by TypeBox/JSON
  Schema in `@lodariq/schema`.
- A debounce may delay transport or persistence, but it must never be the owner
  of the creator's latest state. The optimistic canonical draft is authoritative.
- Preview patches remain semantic and batched. Do not stream individual
  keystrokes, pointer positions, arbitrary properties, CSS, HTML, or scripts
  through the iframe bridge.
- Target identity remains semantic. Live rectangles may prevent UI collisions,
  but they are transient authoring presentation data and can never resolve,
  authorize, or trigger a customer-page interaction.
- A context mismatch is not evidence drift. It must not mutate a target identity
  or erase the last successful observation.
- Production interaction fails closed unless a target resolves semantically and
  satisfies its required action.
- Choreography supports only a closed action and condition registry. It cannot
  run arbitrary JavaScript or read customer database state that was not
  explicitly provided through the SDK.
- Reusable styles contain semantic Lodariq fields only. Applying a recipe stamps
  an explicit safe snapshot into the canonical draft; a later recipe edit does
  not silently mutate an existing document or immutable artifact.
- Full preview uses the production renderer. Authoring-only collision inputs and
  callbacks are enabled only with an authenticated non-production preview owner.
- Real publication artifacts compile server-side and pin the exact document,
  theme, renderer contract, and resolved recipe values. Promotion and rollback
  continue to reuse an existing artifact without recompilation.
- Authoring modules, React, Lexical, transaction metadata, recipe libraries, and
  chrome geometry never enter the normal production runtime bootstrap.

## Current foundation

The plan extends existing behavior rather than replacing it:

- `PreviewPatchOperation` already defines closed semantic mutations in
  `packages/schema/src/bridge.ts`.
- The local frame already coalesces same-tick preview patches in
  `packages/sdk-authoring/src/authoring/local-frame-ui/controller-target-document.ts`.
- The host already serializes debounced draft saves in
  `packages/sdk-authoring/src/authoring/panel.ts`.
- The canonical target already carries `TargetIdentityV2.context`, and the
  resolver reports route/state mismatch reason codes.
- `RuntimeLifecycleHints` already supports route, text, element, panel, tab,
  scroll, network-idle, and timeout hints.
- `TourPlayer` already supports runtime step callbacks, click-target actions,
  semantic target re-resolution, and authoring-only interactive preview.
- The authoring popup already has clamped draggable geometry and exact restore
  state in `panel-geometry.ts`.
- Undo/redo and step/content duplication already exist, but operate at individual
  mutation granularity rather than named transactions or batch selections.
- Compiler preflight already evaluates theme and popup contrast. It needs to be
  shared with immediate authoring feedback and extended to every custom control.

## Target architecture

### 1. One transaction path for every authoring surface

Introduce an authoring-only `DocumentTransactionCoordinator`. Both React
controls and live-canvas commits submit typed operations to it. The coordinator
owns the optimistic draft, transaction grouping, preview delivery, undo entry,
and persistence scheduling.

```text
Creator gesture
  -> typed document transaction
  -> optimistic canonical draft (immediate)
  -> React/canvas snapshot (immediate, stable focus)
  -> semantic preview batch (animation-frame cadence)
  -> latest complete draft autosave (idle cadence)
  -> matching revision acknowledgement
```

Transaction metadata is transient and is not part of `LodariqDocument`:

```ts
interface AuthoringDocumentTransaction {
  transactionId: string;
  baseRevision: number;
  revision: number;
  scope: 'appearance' | 'content' | 'structure' | 'target' | 'behavior';
  coalescingKey?: string;
  operations: PreviewPatchOperation[];
}
```

Rules:

- Apply operations to the latest staged document, never to a React render's
  captured block object.
- Coalesce only operations with the same scope and coalescing key. Popup color
  edits use the tooltip ID; button appearance uses the button ID.
- Merge rapid field edits into one complete safe style snapshot. Changing
  background, then text, then border produces one `setTooltipStyle` operation
  containing all three final fields.
- Render every optimistic change immediately. Debounce only persistence and,
  where useful, expensive preview compilation.
- Use one undo entry for one continuous color-picker gesture or bounded swatch
  burst. A different control, blur, Enter, step change, preview, publish, save,
  close, or timeout closes the transaction.
- Flush pending transactions before target selection, step selection, full
  preview, explicit save, release actions, and panel shutdown.
- A stale acknowledgement may update save status but may not replace a newer
  optimistic draft. A revision conflict triggers a full authoritative draft
  resynchronization and a visible retry state; it never silently chooses an
  older value.
- Retain selection and focus by stable block IDs. Appearance changes must not
  remount editable content or recreate its editor instance.

Bridge migration:

- Add `transactionId`, `baseRevision`, and `revision` to the semantic preview
  envelope and include the applied revision in its acknowledgement.
- Accept the existing unversioned `preview.patch` during one compatibility
  window, but emit versioned transactions from the new authoring frame.
- After the bundled host/frame assets are deployed atomically, require the new
  fields and increment `BRIDGE_PROTOCOL_VERSION`.
- Keep preview delivery batched; revision metadata is not permission to send
  one message per input event.

### 2. Separate target identity, verification, and current availability

Replace the single disposable `targetDiagnostics` interpretation with an
authoring target-health ledger:

```ts
interface AuthoringVerifiedObservation {
  context: AuthoringTargetContext;
  diagnostic: ResolverDiagnostic & { state: 'found' };
  observedAt: string;
}

interface AuthoringTargetHealth {
  targetId: string;
  lastVerified?: AuthoringVerifiedObservation;
  currentObservation?: ResolverDiagnostic;
  currentContext: AuthoringTargetContext;
  presentation:
    | 'verified'
    | 'checking'
    | 'unavailable_current_context'
    | 'unverified'
    | 'ambiguous'
    | 'drifted'
    | 'missing';
}
```

`lastVerified` is factual, context-scoped evidence. `presentation` is derived
from that evidence plus the current route, state, locale, viewport, and mounted
UI. Page-context changes update availability; they do not delete evidence.

Creator mapping:

| Condition                                            | Creator label                  | Effect                                                      |
| ---------------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| Successful observation in the current context        | Verified                       | Ready in this context                                       |
| Known route/state/modal context is absent            | Unavailable in current context | Retain evidence; offer Open required UI or Preview sequence |
| No successful observation exists for this context    | Needs verification             | Allow edit; require verification before release             |
| Correct context is present but no candidate resolves | Missing                        | Repair required                                             |
| Multiple candidates resolve                          | Ambiguous                      | Repair required                                             |
| Stable evidence changed below its quorum             | Drift detected                 | Review or repair required                                   |

Implementation behavior:

- Extend `page.lifecycle.update` with bounded opaque `routePatternId` and
  `stateId` when the host has them. Continue to treat route text as transient
  page context and never store raw URLs in target evidence.
- On route/state change, mark only affected targets unavailable. Do not clear
  unrelated diagnostics.
- If the selected target's known context returns, automatically re-run one
  correlated health inspection. Successful resolution restores Verified
  without retargeting.
- If required UI is absent but its activation recipe is known, show the recipe
  and an explicit **Open required UI** test action.
- Keep draft-session observations in the authoring ledger. Publication
  verification remains bound to the exact immutable artifact; do not present a
  stale draft observation as release verification.
- Keep the draft observation above authoring-only and in memory. If exact-
  artifact observations later need cross-session history, persist only the
  existing privacy-safe `TargetVerificationObservation` contract. Do not add
  selectors, page text, raw route, screenshots, DOM fragments, or coordinates
  to that record.

### 3. Compile explicit action choreography

Replace implicit click-and-next timing with a closed choreography contract. The
creator UI uses plain language; the canonical schema uses typed stages.

Initial action sequence:

```ts
interface StepChoreography {
  trigger:
    | { type: 'activateTarget'; targetId: string }
    | { type: 'observeTargetClick'; targetId: string }
    | { type: 'manual' };
  waitFor: Array<
    | { type: 'targetAvailable'; targetId: string }
    | { type: 'route'; match: 'exact' | 'prefix' | 'contains'; value: string }
    | { type: 'textVisible'; value: string; locale: string }
    | { type: 'event'; eventName: string }
    | { type: 'networkIdle' }
  >;
  transition: { type: 'next' | 'complete' | 'stay'; stepId?: string };
  timeoutMs: number;
  onTimeout: 'retry' | 'stay' | 'skip' | 'dismiss';
}
```

The exact TypeBox contract should use discriminated unions and bounded strings,
arrays, and timeouts. The sketch above is intentionally not an open record.

For V1, the sequence is a closed field on the initiating `BlockActionProps`.
The action type becomes `runSequence`, and `activateTarget` defaults to the
enclosing Tour step's semantic target unless another document target is chosen
explicitly. This lets each future action own its own sequence and transition.
Release B adds an optional step-level automatic sequence for passive observed
gestures that start when the step becomes ready rather than when a Tour action
is pressed.

Runtime state machine:

```text
idle -> resolving trigger -> activating/observing -> waiting for conditions
     -> transitioning -> rendering next step
                     \-> timed out -> authored recovery
```

Rules:

- Resolve and revalidate the trigger target immediately before interaction.
- Programmatic activation is allowed only for a semantically resolved,
  interaction-safe element and an allowlisted activation type. It may never
  fall back to coordinates.
- The click event alone does not advance a choreographed step. The runtime waits
  for every declared postcondition, in declared order, then advances once.
- A modal handoff should prefer `targetAvailable` for the next target. Route and
  localized text waits are explicit alternatives, not hidden heuristics.
- Event waits consume only named SDK events the customer explicitly sends.
  Conditions cannot read arbitrary globals, DOM data, or customer databases.
- Every wait has cancellation, a bounded timeout, and a creator-selected
  failure policy. The Tour card remains recoverable with Retry/Skip/Exit rather
  than disappearing or hanging indefinitely.
- Preview shows the active stage and elapsed wait without exposing customer
  content in analytics.
- Legacy `clickTarget` plus `RuntimeLifecycleHints` remains readable. The
  compiler maps it to a compatible default sequence until old documents are
  explicitly migrated.

Authoring sequence builder:

- Start with templates: **Continue**, **Activate this control**, **Wait for the
  visitor to click**, **Open UI then continue**, and **Navigate then continue**.
- Render a short vertical sequence: `Activate Import`, `Wait for Close to
appear`, `Continue to Review`.
- Let the creator select existing semantic targets for trigger and wait stages.
- Test the sequence in place and report the exact failing stage.
- Store no natural-language recipe as durable syntax; the labels are projections
  of typed canonical data.

### 4. Coordinate authoring chrome and preview presentation

Add an authoring-only `ProtectedSurfaceRegistry` and a collision coordinator.
Known surfaces register a live rectangle and priority:

- current Tour card and arrow;
- target outline and inline step controls;
- active contextual toolbar, insertion menu, or target picker instruction;
- currently resolved semantic customer target while it is being configured;
- authoring popup and minimized Return to editor control.

Rectangles are ephemeral layout inputs. They are never serialized, included in
an artifact, used by the resolver, or used to dispatch an interaction.

Placement policy:

1. The Tour's Floating UI placement solver evaluates all allowed placements and
   chooses the lowest-overlap candidate with the normal viewport gutter.
2. If the minimized chrome still intersects the Tour card, move the chrome to
   the safest viewport edge.
3. If no edge is collision-free, reduce chrome to a movable **Return to editor**
   pill and keep it outside the card and active target.
4. If the full authoring popup obscures a registered on-page control or current
   target, first move it to the nearest safe position; if no usable position
   exists, collapse it temporarily.
5. Restore the exact pre-avoidance geometry and focus when the protected
   interaction closes, unless the creator manually dragged or resized the
   popup in the meantime.

Operational rules:

- Manual drag has priority and cancels the current auto-restore token.
- Use `ResizeObserver`, scroll/resize listeners, and animation-frame batching;
  do not broad-scan the page on every mutation.
- Keep at least an 8 CSS-pixel separation between registered surfaces.
- In full preview, prefer true-user presentation with only the small Return to
  editor control. The regular authoring popup stays minimized and its iframe
  does not cover the customer page.
- Preserve modeless behavior. Customer-page content outside visible chrome
  remains interactive.

### 5. Separate editor selection from preview playback

Track these as independent state:

- `selectedEditorStepId`: the block being edited;
- `previewStepId`: the step currently rendered by `TourPlayer`;
- `previewMode`: none, step, or full;
- `previewStatus`: preparing, playing, waiting, completed, dismissed, or failed.

Wire `TourPlayer.onStepChange`, `onComplete`, `onDismiss`, `onSkip`, and
choreography-stage callbacks through the authoring-only preview controller to
the host header.

Display rules:

- Editing: `Step 6 of 6` may reflect editor selection.
- Full preview: `Preview · 1 of 6` must reflect runtime playback.
- Choreography wait: `Preview · Step 3 · Waiting for dialog`.
- Completion: `Preview complete` with Replay and Return to editor.
- A linear tour may expose optional visitor-facing progress. A branching tour
  uses step identity or remaining-path language unless the denominator is
  deterministic; it must not show a knowingly false total.
- **Preview from this step** supplies an explicit initial step ID and runs the
  same lifecycle/choreography used from the start.

### 6. Add reusable semantic styles

Define one sanitized authoring style projection:

```ts
interface TourStepStyleSnapshot {
  popupLayout?: TooltipLayoutProps;
  popupStyle?: TooltipStyleProps;
  primaryActionStyle?: ButtonStyleProps;
  contentStyles?: Array<{ role: 'heading' | 'body' | 'list'; style: TextStyleProps }>;
}
```

The actual TypeBox schema must remain closed and use the current allowlisted
values. Targets, content, action behavior, URLs, conditions, and choreography
are explicitly excluded from a style snapshot.

Creator actions:

- **Copy style** stores a sanitized in-memory style snapshot.
- **Paste style** applies it to the current step as one transaction.
- **Apply to steps** opens step multi-select, previews the affected fields, and
  commits one batch transaction with one undo entry.
- **Save as recipe** creates a named authoring recipe with a preview thumbnail
  rendered from semantic values.
- **Apply recipe** stamps the recipe's safe values into the document. Recipes
  are templates, not live links; changing a recipe never mutates released tours
  or existing drafts automatically.
- Reset choices remain granular: Popup, Actions, Typography, or All to Brand.

Recipe storage and release behavior:

- Start with document/workspace authoring recipe resources, versioned by opaque
  ID and content hash. Add database/API storage only when cross-document reuse
  ships; do not put recipe infrastructure in the production runtime.
- Applying a recipe writes explicit existing block props, omitting values that
  inherit the Brand Theme. The canonical document therefore remains sufficient
  for compilation.
- Publication compiles the resolved safe values already present in the
  document. It does not fetch a mutable recipe at runtime.
- Recipe previews resolve against the document's exact approved Brand Theme and
  current light/dark mode.

### 7. Validate contrast while editing

Move the pure contrast calculation and resolved-color logic into a shared,
DOM-free module consumed by both authoring and compiler preflight. Keep compiler
preflight authoritative for release, but make the authoring result identical.

Validate:

- popup text against popup surface;
- muted/supporting text against popup surface;
- primary and secondary action text against custom action fills;
- visible action borders and focus indicators against adjacent surfaces;
- custom text and highlight combinations where the editor can determine both
  resolved colors;
- every active light/dark mode selected by `ExperienceAppearance`.

Interaction:

- Update the ratio and pass/warning/blocker state immediately beside a custom
  color control without remounting the canvas.
- Never discard a creator's color merely because it is weak. Save remains
  allowed; publication follows the existing warning/blocker policy.
- Offer safe semantic alternatives from the approved Brand Theme: **Use Brand
  text**, **Use Brand surface**, or the nearest existing accessible theme role.
  Do not silently alter the chosen value.
- Include the affected step, control, mode, measured ratio, and required ratio
  in release repair navigation.
- Test authored colors and resolved theme fallbacks with the same function so
  preview and preflight cannot disagree.

## Release train A: reliability and the requested enhancements

### Slice A0 - Contract tests and fixture scenarios

- Add a deterministic complex-tour fixture containing modal, route transition,
  delayed text, semantic target, transient missing context, and custom colors.
- Capture failing tests for rapid multi-field changes, route/modal absence,
  preview progress, minimized chrome overlap, popup/control overlap, and
  contrast mismatch.
- Add bridge fixtures for versioned transactions and preview callbacks.

Exit gate: every reported issue has a deterministic failing test before its
implementation lands.

### Slice A1 - Transaction coordinator

- Add the transient transaction/revision contracts.
- Route popup, button, text style, layout, and document appearance controls
  through the coordinator.
- Split optimistic draft updates from debounced persistence.
- Make undo, preview flush, save, close, and release boundaries transaction-aware.
- Preserve content editor instances and focus across style updates.

Exit gate: 100 rapid alternating background, text, and border changes preserve
the final value of every field, create one coherent undo group per gesture,
keep focus, and persist the same final document shown in preview.

### Slice A2 - Target availability ledger

- Introduce current-context and last-verified state.
- Stop clearing the entire diagnostics map on route/locale/viewport changes.
- Add **Unavailable in current context** UI and automatic recheck on context
  return.
- Keep exact-artifact release verification separate from draft health.

Exit gate: a verified modal target and route target retain their evidence while
absent, never show a false failure, and return to Verified after the required
context is restored without retargeting.

### Slice A3 - Choreography V1

- Add TypeBox canonical and compiled choreography schemas.
- Implement the cancelable runtime state machine and legacy mapping.
- Build the sequence editor and in-place stage tester.
- Add retry/stay/skip/dismiss timeout recovery.
- Increment the compiled artifact and renderer contract versions while retaining
  read compatibility for existing immutable artifacts.

Exit gate: the fixture can activate Import, wait for the dialog's Close target,
continue into the modal, close it, wait for the route change, and continue to a
post-route target without timing-based sleeps or coordinate fallback.

### Slice A4 - Preview/chrome coordination

- Add protected-surface registration and collision scoring.
- Wire Tour card geometry, inline controls, active semantic target, popup, and
  minimized chrome into the coordinator.
- Implement temporary move/collapse and exact state restoration.
- Add true-user full preview with a collision-free Return to editor control.
- Bind the minimized header to runtime preview callbacks.

Exit gate: at supported viewport sizes, no full-preview Tour card, target
outline, or registered on-page authoring control intersects Lodariq chrome; the
header advances from Preview 1 through completion independently of editor
selection.

### Slice A5 - Styles and contrast

- Add sanitized style copy/paste and selected-step batch application.
- Add named recipe create/apply/delete authoring flows.
- Share contrast resolution between authoring and compiler.
- Extend preflight to custom action styles and all supported color modes.
- Add accessible repair suggestions and release deep links.

Exit gate: a six-step tour can be restyled from one source step in one batch,
one undo restores all affected steps, recipes never alter behavior or targets,
and every deliberately weak custom combination is reported consistently in
authoring and preflight.

### Slice A6 - Contextual surface coordination

- Make the existing authoring interaction machine the owner of the active
  contextual surface.
- Opening insertion, properties, action settings, target settings, or another
  side action closes the previous surface and opens the requested one in the
  same gesture.
- Restore focus to the originating editable block when a surface closes.

Exit gate: no author action requires manually closing a toolbar or side panel
before the requested contextual surface opens.

## Release train B: complex flow authoring

### Branching and typed conditions

- Add a closed `StepTransition` schema with a default edge and ordered optional
  conditions.
- Limit conditions to Lodariq-known document state, identify traits, named SDK
  events, locale, and explicit completion history. Do not imply access to other
  customer data.
- Require a deterministic fallback edge and bound rule count/value sizes.
- Validate target step existence, reachability, terminal paths, and cycles. The
  first version rejects unbounded cycles; a later explicit loop may carry a
  maximum visit count.
- Compile the transition graph into the immutable artifact and evaluate it in
  the runtime without API calls.

### Multiple guided actions and completion

- Allow multiple action blocks in a step, each with a typed transition.
- Add observed visitor gestures such as semantic target click and focus. Input
  observation records completion only; it must not capture the entered value.
- Add explicit completion outcomes: stop silently, show a completion card,
  activate a safe target, or open an allowlisted page.
- Let recovery branches point to a help step rather than only Retry/Skip/Exit.
- Announce waiting, recovery, branch choice, and completion accessibly.

### Batch editing and Flow Map

- Add range and command/control step selection with clear selection count.
- Batch apply style, placement defaults, timeout policy, duplicate, move, and
  delete as one transaction. Never batch target identity or action behavior
  without an explicit per-step review.
- Build a derived Flow Map from canonical steps, action edges, and conditions.
  The map edits typed edges; it is not a second source of truth.
- Show unreachable steps, missing fallback edges, dead ends, ambiguous action
  ownership, and non-terminating paths inline.
- Support **Preview from here**, branch simulation with supplied safe test
  context, and a trace of the path taken.

Release B exit gate: creators can build, inspect, and preview a branching tour
with multiple actions and a recovery path; every reachable path terminates or
has an explicit bounded loop, and no condition uses undeclared customer data.

## Release train C: expressive and inclusive presentation

### Motion recipes

- Add allowlisted motion roles such as fade, lift, scale, and pulse with bounded
  duration/easing values.
- Default to subtle renderer recipes and honor `prefers-reduced-motion` with a
  non-animated equivalent.
- Keep motion semantic; no arbitrary keyframes, CSS, or scripts.

### Structured content, spotlight, and media

- Complete authoring and renderer coverage for the existing safe heading,
  paragraph, list, divider, media, button, and link block registry.
- Add constrained media metadata and server-validated asset references; never
  make creators maintain `src` attributes.
- Ship spotlight as a renderer-owned emphasis treatment attached to a semantic
  target. Its geometry may render the mask but never locate or activate the
  target.
- Add callout/stat/icon compositions only as typed blocks with accessibility
  names and deterministic renderer recipes.

### Responsive variants

- Add a small closed set of viewport-class presentation overrides for placement,
  width, action layout, and optional media visibility.
- Keep target identity shared. Viewport topology remains supporting evidence,
  not a separate coordinate target.
- Preview compact, medium, and wide canvases against the same canonical step and
  report clipping, control overlap, and reflow issues.

### Accessibility preview and history

- Add keyboard-only preview, focus-order trace, screen-reader announcement log,
  reduced-motion mode, 200% zoom, RTL, and compact reflow checks.
- Verify focus entry, focus restoration, Escape behavior, modal layering, and
  live-region announcements with manual assistive-technology evidence before
  claiming support.
- Upgrade undo/redo to transaction labels such as `Changed popup palette` and
  `Applied Launch card to 5 steps`.
- Add named draft checkpoints and compare/restore as draft-only operations.
  Restoration never changes a staging or production pointer.

Release C exit gate: every new presentation capability has a reduced-motion,
keyboard, screen-reader, zoom/reflow, and contrast path, plus deterministic
serialization and runtime tests.

## Release train D: readiness and diagnostics

### Release readiness

Extend the existing compiler and browser verification findings with:

- invalid or unreachable flow edges;
- missing terminal completion;
- choreography targets that are unverified in required contexts;
- timeout recovery that leaves no usable path;
- unsupported or unsafe action types;
- custom popup/action/content contrast;
- responsive clipping and chrome/target collisions;
- keyboard traps, missing accessible names, and focus-restoration failures;
- motion without a reduced-motion equivalent;
- missing or invalid media assets.

All findings identify the exact step/block and open the relevant repair surface.
Draft save remains permissive; publish blocks only critical runtime or safety
failures under the existing policy.

### Privacy-safe diagnostics

Add bounded events for:

- transaction committed, coalesced, retried, conflicted, and persisted;
- target unavailable, context restored, verification passed, and repair opened;
- choreography stage started, satisfied, timed out, retried, skipped, and
  completed;
- preview started/from-step, step changed, branch chosen, completed, and exited;
- automatic chrome move/collapse/restore and unresolved collision;
- style copy/apply/recipe use and contrast finding severity;
- readiness finding and repair completion.

Events carry opaque document/step/target IDs, environment, version, bounded
state/reason codes, durations, and counts. They do not carry authored text,
color values, raw routes, selectors, DOM content, screenshots, coordinates,
identify values, or user-entered product data. Staging and production analytics
remain separate by default.

Release D exit gate: the team can distinguish authoring defects, product-context
unavailability, runtime timeouts, and creator exits without collecting customer
content or adding a separate analytics vendor.

## Contract and migration plan

| Area                    | Canonical document change                    | Compiled/runtime change                         | Compatibility                                            |
| ----------------------- | -------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Transactions            | None; metadata is authoring-only             | Versioned preview bridge envelope               | Accept legacy patch messages during rollout              |
| Target availability     | None; derived authoring state                | Optional bounded page-context fields            | Existing target identity and artifacts remain readable   |
| Choreography            | Add closed action sequence/transition schema | Add compiled sequence and runtime state machine | Map legacy `clickTarget` and lifecycle hints             |
| Preview progress/chrome | None                                         | Authoring-only callbacks and obstacle geometry  | Production options reject authoring-only geometry        |
| Style copy/apply        | None; writes existing safe props             | None beyond existing compiled props             | Existing documents work unchanged                        |
| Recipe library          | Separate authoring resource                  | None; application stamps canonical props        | No live recipe lookup in runtime                         |
| Contrast                | None                                         | Extend deterministic preflight findings         | Existing finding codes remain readable; add new subjects |
| Branching               | Add closed step transitions and conditions   | Compile a deterministic graph                   | Linear documents compile as implicit next edges          |
| Presentation            | Add only bounded semantic fields/blocks      | Increment renderer contract as needed           | Retain old immutable artifact readers                    |

Schema process:

1. Add TypeBox definitions, sanitizers, JSON Schema registry exports, and fixtures.
2. Add explicit document migration functions and bump `SCHEMA_VERSION` when the
   canonical shape changes.
3. Increment compiled artifact and renderer contract versions for choreography,
   branching, or renderer input changes.
4. Keep `CompiledDocumentV1` through V3 readable. Add a new closed compiled
   version rather than weakening an existing schema.
5. Update server compilation before enabling authoring controls that can produce
   the new canonical fields.
6. Publish capability metadata so an older runtime cannot receive a newer
   choreography or presentation contract.

No database migration is required for Release A except the optional cross-
document recipe library. If that library ships, add tenant-scoped rows and RLS,
apply only additive migrations, and require normal migration review. Do not
modify a shared environment destructively as part of this plan.

## Implementation map

| Layer           | Primary areas                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema          | `packages/schema/src/block.ts`, `document.ts`, `target.ts`, `target-verification.ts`, `bridge.ts`, `compiled.ts`, `version.ts`, registry and fixtures                         |
| Authoring state | `packages/sdk-authoring/src/authoring/local-frame-ui/controller-*`, `state/interaction-machine.ts`, a new transaction coordinator and target-health ledger                    |
| Authoring UI    | `components/contextual-property-tray.tsx`, `properties/property-controls.tsx`, `components/tour-sequence-rail.tsx`, target controls, Flow Map and sequence builder components |
| Host chrome     | `packages/sdk-authoring/src/authoring/panel.ts`, `panel-geometry.ts`, `panel-config.ts`, page-context and preview service adapters                                            |
| Compiler        | `packages/compiler/src/compile.ts`, `preflight.ts`, migration and graph validation helpers                                                                                    |
| Runtime         | `packages/sdk-runtime/src/renderers/tour.ts`, loader preview contracts/controller, lifecycle and action executors                                                             |
| Persistence/API | Existing draft save path; additive recipe resource only when workspace reuse ships                                                                                            |
| Tests           | Schema, compiler, SDK authoring, SDK runtime, local fixture, and Playwright suites under `packages/tests`                                                                     |

New modules should stay narrow. In particular, keep transaction reduction,
target-health derivation, choreography execution, collision scoring, graph
validation, and contrast evaluation as independently testable pure modules
instead of expanding `panel.ts` or `tour.ts` into nested condition trees.

## Verification strategy

### Unit and property tests

- Randomized sequences of style fields prove last-write-per-field behavior and
  transaction associativity.
- Revision tests cover delayed, duplicated, stale, missing, and conflicting
  acknowledgements.
- Target-health table tests cover route, state, locale, viewport, missing modal,
  return to context, ambiguous, drift, and target identity replacement.
- Choreography tests cover every trigger, wait, transition, timeout, abort,
  retry, and legacy mapping.
- Collision tests score viewport edges, Tour placement alternatives, resize,
  scroll, user drag, and restore tokens without invoking DOM interactions.
- Graph tests cover reachability, fallback edges, cycles, missing steps, and
  deterministic condition order.
- Contrast tests use the same vectors for immediate authoring and compiler
  preflight.
- Serialization round trips cover every new canonical field and reject unknown
  CSS/script/selector-shaped input.

### Integration tests

- Iframe tests prove exact-origin validation, semantic batching, revision ACKs,
  flush boundaries, and stale-message rejection.
- Compiler/runtime tests prove the exact authored choreography and style values
  survive server compilation.
- Preview tests prove callbacks are isolated by preview owner and are absent in
  ordinary production playback.
- Recipe tests prove only allowlisted style fields apply and behavior/targets
  remain byte-for-byte unchanged.
- Undo/checkpoint tests restore one complete batch without publishing or
  changing environment pointers.

### End-to-end fixture scenarios

1. Rapidly change popup background, text, border, radius, and button fill; type
   in content during the save window; verify every final value, font size, and
   focus position.
2. Verify a modal target, close the modal, switch steps, reopen it, and confirm
   Unavailable -> Checking -> Verified without retargeting.
3. Verify a route target, navigate away and back, and repeat the same assertion.
4. Run activate -> dialog target -> close -> route -> delayed text -> final
   activation with explicit waits and no fixed sleeps.
5. Drag/minimize the popup into every edge and run full preview across compact,
   medium, and wide viewports; assert no registered intersections.
6. Open insertion, action, target, and style controls in succession; each new
   surface opens in one gesture and restores focus correctly.
7. Copy a style to five selected steps, undo once, reapply a recipe, and compare
   the canonical block JSON.
8. Choose known failing light and dark palettes, repair them from Brand roles,
   and confirm authoring and release reports match.
9. Preview each branch, timeout recovery, Skip, completion card, and Preview
   from here path using keyboard only.

### Manual evidence

- Re-run the six-step authoring showcase and capture the complete visitor flow.
- Test VoiceOver on macOS/Safari and at least one Windows screen reader/browser
  combination before claiming screen-reader support.
- Test keyboard-only operation, 200% zoom, reduced motion, RTL, compact reflow,
  modal focus containment, Escape, and focus restoration.
- Verify normal production network/bundle traces contain no authoring modules,
  recipe data, chrome geometry, transaction metadata, or preview callbacks.

## Performance and quality budgets

- One semantic preview batch at most per animation frame during continuous
  controls; no bridge message per raw pointer movement.
- One latest-document autosave attempt after the configured idle interval;
  serialized retries must not allow an older generation to win.
- Collision recalculation is animation-frame batched and observes only
  registered surfaces plus viewport changes.
- Choreography observers attach to the smallest relevant scope, abort when the
  step changes, and use bounded retry/timeout counts.
- No focus loss, contenteditable remount, font-size shift, or full iframe reload
  from an appearance-only transaction.
- Existing runtime and authoring bundle gates remain required. Authoring-only
  capabilities must not increase the normal production runtime except for the
  explicitly versioned choreography/presentation executor.

## Rollout

1. Land failing regression tests and additive schemas.
2. Enable transaction V2 and target availability in local authoring, then
   hosted development/staging authoring.
3. Enable preview callbacks and collision coordination for authoring previews
   only.
4. Enable choreography authoring only after the new server compiler and runtime
   contract are deployed and capability-compatible.
5. Enable style recipes and immediate contrast after transaction V2 is stable.
6. Re-run the showcase and a focused usability test before making Release A the
   default.
7. Ship branching and richer presentation behind their compiled/renderer
   contract versions, not a production authoring flag.
8. Remove legacy bridge emission only after supported hosted assets have moved
   to the versioned transaction protocol. Continue reading immutable legacy
   artifacts indefinitely.

Rollback is contract-based: disable new authoring controls and stop emitting
new fields while retaining readers. Never mutate or recompile an active
staging/production artifact to roll a feature back.

## Success measures

- Zero lost fields in automated rapid-edit stress tests and observed authoring
  sessions.
- Zero appearance-only focus-loss or font-shift regressions in the fixture
  matrix.
- A verified transient target is never downgraded solely because its known
  context is absent.
- All complex fixture transitions advance on declared semantic conditions, not
  arbitrary delay timing.
- Zero Tour-card/chrome and registered-control/popup collisions in the supported
  viewport matrix.
- Preview progress matches runtime callbacks for every linear step and reports
  honest path language for branches.
- A creator can style six steps from one source in one batch and undo it once.
- Authoring and release preflight produce identical contrast outcomes.
- Every compiled branch has a reachable terminal or explicit bounded recovery.
- Production bootstrap and ordinary runtime remain free of creator modules and
  authoring-only metadata.

## Definition of done

The complete program is done when:

- all P0 and P1 capabilities in the scope table are implemented and pass their
  release-train gates;
- P2 presentation capabilities ship only with their renderer, responsive, and
  accessibility evidence;
- the six-step showcase can be authored from a clean fixture state without a
  lost mutation, manual panel workaround, false target downgrade, misleading
  progress label, or contrast surprise;
- server compilation, staging verification, production promotion, rollback,
  and analytics preserve the existing immutable-artifact and environment
  guardrails;
- schema, compiler, runtime, authoring, E2E, accessibility, bundle, security,
  and migration checks pass; and
- this plan's status is updated with the exact implementation and external
  evidence actually completed, without claiming deployed or assistive-
  technology proof that was not run.
