# UX Revamp

Source of truth guardrails: `../../refined-lodariq-prd.md` section 20 and
`../../AGENTS.md`.

This is the canonical creator interaction specification. It consolidates the
canvas-first, storyboard, and recipe ideas into one live-product authoring,
Brand System, verification, and release workflow.

Technical source: `phase-2-brand-and-release-foundation.md`. Product and
architecture source: `../../refined-lodariq-prd.md`.

Visual source: Option 2, **Editorial Air**, in
`../product-design/design-system-exploration-2026-08-06/README.md`. Its
hierarchy and cross-surface design language are the current canonical visual
direction; the PRD and this plan remain authoritative for behavior and phase
scope.

## Implementation Checkpoint — 2026-08-07

The completed Phase 0/1 work remains historical fact, but its dashboard-first
hosted entry architecture is amended and superseded by this direct in-product
entry contract. The implementation has been aligned without undoing the Phase
0/1 runtime, schema, persistence, and security foundations:

- Local and hosted authoring implement the compact, modeless, draggable
  authoring popup and runtime overlay. It keeps the customer product visible and
  clickable instead of reserving a full-width bar or permanent left dock.
- The dashboard implements the Editorial Air compatibility shell: light-first
  navigation, a release-led overview, environment progress, recent activity,
  and focused destinations for the existing setup/admin capabilities. It does
  not infer verification or production-live state from publication history.
- On desktop, dashboard navigation is collapsed by default to an icon rail and
  expands in place to labeled destinations. The icons and current destination
  remain visible while collapsed. On mobile, the header opens the same
  destinations in a modal drawer; a horizontal navigation strip is not an
  accepted responsive fallback.
- Local and hosted creator entry now expose the canonical `New experience`,
  `Experiences on this page`, and `Preview as user` icon dock. `New` offers only
  the implemented Tour type and creates a distinct persisted draft.
- `Experiences on this page` is browse-first: opening it does not create a draft
  or session, receives only the normalized pathname, searches page-scoped Tour
  summaries, shows honest release/empty states, and can expand explicitly to
  workspace scope through `Browse all`. Selecting an item opens or restores it
  without a dashboard transition.
- The one permanently installed SDK keeps the draggable creator launcher hidden
  on an exact authoring-enabled development/staging origin until the keyboard
  toggle or dashboard entry reveals it. A browser extension,
  a second creator snippet, another open Lodariq tab, and a daily dashboard launch
  are not required. Production remains closed.
- The hosted launcher keeps the canonical four stable actions in the same
  order: `New`, `Experiences on this page`, `Preview`, and `Hide Lodariq`. Each
  compact icon has an accessible name and a short hover/focus tooltip, and every
  target is at least 44 by 44 CSS pixels. Hover may reveal the launcher
  temporarily; click, tap, Enter, or Space pins it. Pointer leave and action
  activation do not close a pinned dock; outside click, the launcher toggle, or
  `Escape` does.
- Signed-out activation opens a first-party, top-level Lodariq authentication
  popup; password entry is never embedded in the customer product. After sign-in,
  membership, environment, requested scope, and exact opener origin are verified
  before the one-time exchange becomes a short-lived in-memory activation. The
  active popup/dashboard session now uses Lodariq-owned credentials and an
  opaque, database-backed first-party cookie; active runtime/dependencies are
  Clerk-free. Recovery/reset, email-worker lifecycle, capability gates, and the
  consolidated local milestone gate pass; production enablement and live
  cutover remain open.
- When an activation sign-in needs a password set/reset, the popup opens the
  first-party recovery flow in a new tab. The creator finishes there, closes the
  activation window, and retries from the launcher so the original one-time
  request is never silently reused or weakened.
- The activated launcher opens the same modeless draggable authoring popup and
  runtime-backed overlay used by local authoring.
  The popup captures input only inside its visible bounds; the surrounding
  customer page remains usable. Entering placement selection collapses the
  popup to a small movable instruction chip so it cannot obstruct the element
  being selected.
- The launcher center minimizes/restores the active hosted surface instead of
  starting a duplicate activation. The dedicated Close action revokes the
  activation/session and drops only unpersisted iframe state; prior autosaves
  remain. `Save & exit` flushes the latest document before revocation. Neither
  action publishes.
- Inline preview input stays inside the customer page. Blur or Enter sends one
  exact-origin semantic commit to canonical JSON, the popup, preview, and
  autosave; Escape reverts. No keystroke stream, raw HTML, or authoring behavior
  is added to the production runtime.
- Draft changes autosave through a debounced serialized queue. Save-and-exit
  waits for the iframe's latest document, retries transient failures, keeps the
  panel open while persistence is unresolved, and exposes a manual retry after
  bounded automatic retries.
- Concept 10 is implemented for tour target repair. The creator can fix
  placement directly from the compact step list. When the semantic resolver
  finds one clear replacement, Lodariq highlights it immediately. The creator
  chooses `Use this placement` or `Pick another`; no pointer search is required.
  A replacement preserves target identity and lifecycle hints while updating
  the semantic fingerprint.
- Hosted authoring loads and saves drafts without publishing as a side effect.
  Environment-token creation, editor launch, and authoring-session creation are
  configuration/authoring operations only.
- Diagnostics and advanced controls remain progressively disclosed. Resolver
  coordinates remain diagnostic only, and the creator sees semantic match
  evidence rather than a misleading production-coordinate action.

This checkpoint does not claim every state described below. Concepts 09 v2 and
11 v2 remain the Phase 2 interaction and state references for Brand System and
exact-artifact promotion; Editorial Air now governs their shared visual
language and shell. Only the closed theme/artifact contracts, explicit hashing,
immutable artifact storage, and guarded per-document deployment foundation were
available at the Slice 1 checkpoint. Slice 2 now implements the tokenized Tour
renderer, persisted Brand Theme drafts/immutable approvals/defaults/impact,
exact-theme direct/hosted authoring, document-specific delivery, deterministic
basic preflight, release state, and guarded staging publication with a server-
derived request hash, idempotency, expected-generation CAS, and explicit
capabilities. Its consolidated milestone gate and same-viewport visual QA pass.
Slice 3 adds Product sampling/provenance, exact browser verification, and
production promotion/approval locally. Immediate preview refresh, atomic
source-plus-draft persistence, compact findings presentation,
rollback/unpublish, and analytics isolation remain later work.
It does not claim a complete production auth cutover, deployed/live entry
evidence, or an active production-live pointer. Recovery and delivery code are
complete, but public production signup/recovery remain disabled pending the
sole clean-slate baseline application to an approved empty Neon database,
Resend domain/secrets, coordinated API/dashboard flags, deployment, and live
probes.

Concept 01's outcome/type catalog and concept 08's audience/trigger sentence
are deferred to Phase 3. Phase 2 Slice 1 provides the stable `New` launcher
action for the Tour creation flow; Phase 3 expands what that action offers.
Their sections below remain the intended interaction contract for that phase,
not current Phase 0/1 functionality.

The consolidated Slice 1 local gate passed on 2026-08-07: installation completed
with the expected Node 22 versus required Node 24 warning; changed-package and
workspace typechecks, lint, boundaries, migration safety, 55 test files/581
tests, 11/11 builds, all listed size budgets, 58 prepared SDK assets, and the
security audit passed. All 62 executed E2E tests passed after correcting two
stale assertions, with four planned skips. Same-viewport Editorial Air Design QA
and deployed/live evidence remain separate gates.

## Goal

Make Lodariq usable by non-developer Product Marketing creators without
onboarding, CSS, or release training. The creator should understand the loop
immediately:

```text
Choose outcome -> create on the live staging product -> edit in place ->
match the product automatically -> preview and repair -> publish to staging ->
verify -> promote the exact version to production -> monitor and repair drift
```

The primary surface is the customer's actual website with Lodariq authoring
controls layered on top. The creator should not begin in a separate abstract
document editor, raw JSON editor, Markdown source view, or debugger-like panel.

## Core Principles

- The compact launcher and modeless popup own session controls; the customer
  product remains the primary authoring canvas.
- The active experience surface is the content editor: tooltip, modal, hotspot,
  survey, checklist drawer, or knowledge widget.
- Editing should happen inside a rendered preview of the thing being created.
- Simple experiences should feel like filling obvious blanks.
- Complex experiences should progressively expand into cards, drawers, or
  panels without leaving the customer page.
- Advanced controls are contextual and collapsed by default.
- Save should almost always work; publish or review can be blocked by critical
  issues.
- A usable approved Brand Theme is applied automatically; styling is not a
  required setup step for each experience.
- `Match product` maps explicitly supplied or bounded sampled product styles to
  safe semantic roles. It never exposes or persists CSS.
- Preview and production use the same runtime renderer and exact theme snapshot.
- Environment configuration happens once in the dashboard. Ordinary release
  remains inside authoring.
- Staging publication compiles an immutable artifact. Production promotion
  reuses that exact artifact without reconfiguration or recompilation.
- Release state and its derived primary action appear when the current context
  needs them; they do not permanently crowd the stable launcher.
- Target and brand drift create reviewable repair proposals; they never mutate
  a live release automatically.
- The canonical state remains structured Lodariq block JSON.
- The UI may render human-readable recipes, but those recipes are controls, not
  durable syntax or a Markdown/custom grammar.
- Creators never maintain code-like attributes such as `src`, `action`, or
  `target`.
- Workspace admins approve semantic Brand Themes and renderer recipes; creators
  inherit them, select safe presets, and intentionally acknowledge shared
  changes.

## Global In-Product Authoring Shell

### Permanent SDK Entry And Activation

Customers install one SDK entry in the application shell and leave it in place.
The same installation resolves the configured environment and loads only the
runtime needed for ordinary visitors. On an exact development or staging origin
where authoring is enabled, it may also render the lightweight creator launcher.
Production never enables authoring or loads the authoring package.

The dashboard remains the place for initial installation, exact-origin and
environment policy, membership, Brand approval, and administrative or recovery
work. It is also a fallback entry when direct activation cannot complete, but it
is not the ordinary authoring workspace. A browser extension may be explored as
an optional convenience later; it is not required or canonical.

Installation setup presents one public snippet and its exact trusted origins.
Admins and owners may create an installation, synchronize those mappings, and
revoke it. Members and viewers receive a read-only inspect/copy view. The normal
dashboard action is `Open your product`; it must not ask a returning creator to
prepare a token, session, or second snippet handoff.

When a signed-out creator activates the launcher, the SDK opens a first-party
Lodariq authentication page in a top-level popup created by the user gesture.
The current core owns password entry; passkeys and SSO remain later capabilities.
On success, it returns a one-time
activation result only to the exact verified opener origin. The SDK exchanges
that result for a short-lived, capability-scoped authoring session. The customer
page never receives a Lodariq account credential or long-lived bearer, embeds a
password form, uses wildcard `postMessage`, or assumes another Lodariq tab is
signed in. The host keeps activation only in memory until an exact-origin
one-time handoff; the editor iframe alone keeps the document-session bearer in
memory.

### Stable Creator Launcher — Phase 2 Slice 1 Contract

The small draggable launcher is available in minimized and pinned states. Its
stable actions are:

- `New` — starts the implemented creation flow; Phase 3 expands its
  outcome/type catalog.
- `Experiences on this page` — lists relevant existing experiences without a
  dashboard context switch. It includes draft/staging/live state, resume or
  preview, recent release history, and an in-popup search or `Browse all` path
  when the current route has no match.
- `Preview` — runs the current experience through the production runtime
  renderer.

The selected Editorial Air direction uses a small deep-evergreen glass launcher
with edge-aware icon buttons and short tooltips expanding around it. The popup uses a
restrained glass drag header and a substantially opaque warm-white body so it
stays legible over arbitrary customer products. Dashboard surfaces remain
light-first, flat, and release-led; translucency is reserved for creator chrome.
The generated mark, exact silhouette, icon motion, and final contrast values are
still illustrative until coded visual QA and usability validation. The state,
action, hit-target, and accessibility contracts in this section are fixed.

The action order and meaning do not change. Icons have visible labels when
space permits and otherwise have accessible names plus clear tooltips. Each
pointer target is at least 44 by 44 CSS pixels. Hover/focus may temporarily
reveal the actions, but hover is never required and never activates an action.
Click, tap, Enter, or Space pins the launcher open. Pointer leave and action
activation preserve pinned state; only an explicit launcher toggle, outside
click, or `Escape` collapses it. Dragging starts only from its handle, crosses a
movement threshold, and suppresses the activation click.

Repair, autosave failure, readiness, derived release, and release-history
controls appear contextually only when their state makes them relevant. The
launcher does not become a permanent dashboard, styling form, release toolbar,
or environment selector.

### In-Product Experience Browser

Opening `Experiences on this page` is a read-only browse action. It must not
create an empty draft, select an arbitrary document, or start a document session
until the creator chooses an item.

- The page request carries only a normalized pathname. Query parameters,
  fragments, credentials, and the full customer URL do not enter this browse
  contract.
- The initial scope is the current page. `Browse all` deliberately expands to
  the same workspace without a dashboard transition.
- Search, truthful draft/staging/live state, empty results, and explicit
  `Start Tour`/open actions stay inside the bounded modeless surface.
- Choosing an existing item restores that document; `Start Tour` creates a
  distinct Tour draft. Only then does the editor iframe create and own the
  document-scoped authoring session.

### Modeless Authoring Popup

The launcher opens the same compact modeless popup and runtime overlay for local
and hosted authoring. The popup is draggable by a dedicated handle, restores its
last valid session-local position, and clamps to the visual viewport, safe area,
zoom, orientation, and on-screen keyboard. Its position is UI state, never
canonical document or Brand Theme data.

Only the popup's visible pixels intercept pointer input. No modal backdrop,
page resizing, full-width bar, or permanent rail may block the customer product.
Minimizing preserves the draft, selected experience/step, and position; `Save &
exit` explicitly ends the session and never publishes.

The dedicated Close icon is not an alias for `Save & exit`. Close revokes the
activation/session and may drop only the iframe edits that have not reached the
server; already autosaved revisions remain. `Save & exit` flushes and persists
the latest iframe state before revocation. Both controls have explicit labels or
accessible names, and neither deletes prior saved work or publishes.

Target selection temporarily captures the deliberate selection click while
suppressing the host product action. At entry, the popup collapses to a small
draggable instruction chip with `Cancel`; hovered candidates receive a semantic
outline and Escape restores the previous editing state. There is no blanket
page dimming, and the chip can be moved away from any candidate.

### Shell States

| State                        | Stable or primary control              | Contextual controls                                   | Visual difference                                              |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Signed out                   | Sign in to author                      | Cancel                                                | Top-level first-party auth popup; no embedded credentials      |
| Idle or minimized            | New, Experiences on this page, Preview | Sign out/minimize as appropriate                      | Compact draggable launcher; page remains fully usable          |
| Choosing outcome or format   | Available New flow                     | Cancel                                                | Compact chooser; page remains visible                          |
| Selecting placement          | Cancel selection                       | None                                                  | Popup collapses to movable chip; candidates highlight on hover |
| Editing experience           | Preview or derived release action      | Relevant repair/history, minimize, Close, Save & exit | Active experience is outlined; modeless popup stays movable    |
| Previewing                   | Exit preview                           | Relevant release status                               | Popup minimizes while the runtime behavior remains interactive |
| Saving                       | None                                   | Exit guarded                                          | Quiet status reads Saving                                      |
| Saved draft                  | Preview or Publish to Staging          | Relevant release/history                              | Draft and environment versions remain explicit                 |
| Sent for review              | View review status                     | Minimize or exit                                      | Status reads Sent for review                                   |
| Published to staging         | Open staging test                      | Relevant history                                      | Exact staging version/hash shows that verification is needed   |
| Staging verified             | Promote to Production                  | Open staging, relevant history                        | Exact artifact is ready to promote                             |
| Awaiting production approval | View approval                          | Cancel request where permitted                        | Exact artifact and target environment remain explicit          |
| Live in production           | Live in Production                     | History, rollback, or unpublish when requested        | Draft and environment versions remain explicit                 |
| Error or blocked             | Fix or retry the specific issue        | Safe draft actions                                    | One contextual recovery action replaces unrelated controls     |

### Outcome And Type Chooser — Phase 3 Expansion

In Phase 3, clicking `New` opens a compact outcome chooser beside the pinned
launcher. The first question is what the creator wants to achieve, not which
schema or renderer they understand.

Initial outcomes:

- Introduce a new feature — recommends an announcement plus optional short tour.
- Guide a first action — recommends a tour.
- Point out something new — recommends a hotspot/tooltip.
- Announce a change — recommends a modal, banner, or slide-in.
- Collect lightweight feedback — recommends a survey when that renderer is
  enabled.
- Build an onboarding sequence — recommends a checklist plus linked moments
  when the shared state model is enabled.

`Browse formats` reveals the underlying tour, announcement, hotspot, survey,
checklist, and knowledge types for experienced creators. Only implemented,
workspace-enabled renderers appear as available; future types must not create
dead-end configuration.

Each outcome shows one sentence, a small live-product example, and the number of
required decisions. Selecting it creates a useful default experience rather
than an empty form. The chooser closes when the creator chooses, cancels,
presses Escape, or clicks outside it; the stable launcher remains available.

## Global Modes

The authoring system should be modeled as explicit modes. Each mode must have a
distinct visual treatment, clear allowed actions, and a predictable exit path.

### Mode Transition Summary

| From                       | Trigger                       | To                                      |
| -------------------------- | ----------------------------- | --------------------------------------- |
| Idle                       | New clicked                   | Choosing outcome or format              |
| Choosing outcome or format | Target-bound outcome selected | Selecting placement                     |
| Choosing outcome or format | Unbound outcome selected      | Editing experience                      |
| Selecting placement        | Valid page element selected   | Editing experience                      |
| Selecting placement        | Cancel clicked                | Idle or prior Editing experience        |
| Editing experience         | Preview clicked               | Previewing                              |
| Previewing                 | Exit preview clicked          | Editing experience                      |
| Editing experience         | Save draft succeeds           | Saved draft                             |
| Editing experience         | Send for review succeeds      | Sent for review                         |
| Any active mode            | Close clicked                 | Revoke and exit; prior autosaves remain |
| Editing experience         | Save & exit clicked           | Flush, persist, revoke, and exit        |
| Any active mode            | Blocking operation fails      | Error or blocked                        |

The creator should never wonder which mode they are in. Each mode changes the
launcher/popup controls and the page-level visual treatment.

Release state is orthogonal to the editing mode. A creator may be editing a new
draft while an older immutable version remains verified on staging or live in
production. The contextual release surface must always show both truths rather
than replacing environment state with a generic `Published` label.

### Idle

Purpose: no active experience is being edited.

UI:

- Once revealed, the minimized launcher exposes `New`, `Experiences on this
page`, `Preview`, and `Hide Lodariq`.
- No page dimming.
- No selected placement.
- No floating editor.

Allowed actions:

- New experience.
- Open existing Lodariq experiences on the page if available.

Exit:

- Choose an experience type.

### Choosing Outcome or Format

Purpose: creator is deciding what to create.

UI:

- Phase 3 outcome/type chooser opens beside the pinned launcher. Before Phase 3,
  `New` opens only the implemented creation flow.
- Page remains visible and undimmed.
- Picker owns keyboard focus.

Allowed actions:

- Choose an outcome or browse a specific implemented format.
- Cancel.
- Search/filter experience types if the list grows.

Exit:

- A target-bound outcome enters Selecting placement.
- An unbound outcome enters Editing experience with a useful rendered default.

### Selecting Placement

Purpose: creator is choosing the page element that anchors an experience or
step.

UI:

- Page remains visible and usable; no blanket dim or backdrop is applied.
- Center copy says "Choose starting point" for a tour or "Choose placement" for
  hotspot/targeted content.
- Hovered elements receive a clear outline.
- Lodariq UI itself is not selectable.
- The popup collapses to a small movable chip showing Cancel selection.

Allowed actions:

- Hover page elements to inspect semantic candidates.
- Click an element to attach placement while suppressing that one host-product
  action.
- Cycle between parent/child candidates when needed.
- Cancel.

Exit:

- Valid element selected: enter Editing experience.
- Cancel: return to Idle or previous editing surface.
- No eligible element: show a non-blocking explanation and keep selection mode.

### Editing Experience

Purpose: creator is composing content, behavior, and configuration.

UI:

- The active experience renders in place.
- The active surface gets an authoring outline and editing controls.
- The popup shows Preview or the derived release action plus quiet autosave and
  independent draft/staging/production state. Repair and history appear only
  when relevant.
- Any structural surface, such as tour steps or checklist items, stays in the
  movable modeless popup and never reserves a permanent dock.

Allowed actions:

- Edit content.
- Add content blocks.
- Choose actions.
- Configure placement or layout.
- Open contextual advanced controls.
- Preview.
- Save draft or send for review.
- Publish, verify, or promote when the derived action is eligible.
- Duplicate or delete experience where permitted.

Exit:

- Preview enters Previewing.
- Stop prompts if there are unsaved changes.
- Draft/review menu can move to Saved draft or Sent for review.

### Previewing

Purpose: creator sees the runtime behavior without authoring affordances.

UI:

- Most authoring chrome is hidden.
- The popup minimizes to Exit preview plus device/state controls while keeping
  relevant release truth available.
- The experience runs like an end user would see it.

Allowed actions:

- Interact with the preview.
- Switch preview viewport: desktop, tablet, mobile.
- Exit preview.

Exit:

- Exit preview returns to Editing experience.
- Preview failure returns to Editing experience with a clear issue.

### Saved Draft

Purpose: draft has been saved but not sent for review.

UI:

- The popup status reads Saved as draft.
- Active editor remains available.
- Review blockers remain visible but do not block editing.

Allowed actions:

- Continue editing.
- Preview.
- Send for review.
- Stop editing.

### Sent For Review

Purpose: creator has handed off the experience.

UI:

- The popup status reads Sent for review.
- Editing may remain possible, but changes should create a new draft state.

Allowed actions:

- View review status.
- Continue editing as a draft.
- Stop editing.

### Error Or Blocked

Purpose: an action cannot complete safely.

UI:

- The issue appears closest to the broken item.
- The popup shows a short status and one main fix action.
- Save draft remains available where the document is structurally safe.

Examples:

- Missing placement.
- Ambiguous placement.
- Target not found.
- Unsafe URL.
- Missing button action.
- Incomplete survey response.
- Broken reference to another document.
- Media upload failed.
- Unsaved changes while exiting.

## Existing Experience Editing

Creators should also be able to edit an existing Lodariq experience already
shown on the page.

Entry points:

- Click an existing rendered Lodariq experience while authoring is active.
- Open the stable `Experiences on this page` launcher action.
- Select a step, hotspot, checklist, survey, announcement, or knowledge item
  from its visible runtime surface.

Behavior:

- Selecting an existing experience enters Editing experience.
- The relevant editor surface opens in place.
- If multiple experiences overlap, Lodariq shows a small chooser with names,
  types, and statuses.
- If the selected experience was already sent for review, editing creates a new
  draft state rather than silently modifying the reviewed version.

Statuses:

- Live.
- Draft.
- Sent for review.
- Needs attention.
- Archived, if later supported.

## Editing Model

### Authoring Composer

The active experience surface contains a structured editor. It should feel like
a familiar text editor, but it must remain a block editor under the hood.

Core content controls:

- Text.
- Heading.
- List.
- Link.
- Image.
- Video.
- Button.
- Divider.
- Checklist item.
- Question.

Text selection toolbar:

- Bold.
- Italic.
- Link.
- Heading style.
- Bullet or numbered list.

Add content menu:

- Text.
- Heading.
- Image or video.
- List.
- Button.
- Question.
- Divider.

The authoring composer may be larger than the final runtime surface. For
example, a tooltip can expand into an anchored composer while still previewing
the final compact tooltip shape.

### Styling Model

The Brand System should remove styling work rather than expose a larger style
panel. Creators do not write arbitrary CSS, JavaScript, raw HTML, selectors, or
token syntax.

Default behavior:

- Every new experience immediately inherits the approved workspace Brand Theme.
- If no approved theme exists, Lodariq displays an accessible fallback and a
  non-blocking `Match product` action.
- An experience already attached to a product element can match that element
  without another selection.
- Unbound experiences ask for at most one representative element when product
  matching needs more evidence.
- The preview is the real runtime renderer with the exact theme snapshot that
  will be compiled.

Primary appearance actions:

- `Match product` — derive a safe semantic proposal from explicit SDK tokens,
  the target, and bounded page evidence.
- `Use this element's look` — select a representative button, card, or dialog.
- `Choose preset` — default, accent, inverse, success, warning, or minimal.
- `Edit workspace brand` — admin-only entry to the shared theme and impact view.

Common creator options remain semantic:

- Density: compact, comfortable, spacious.
- Width: narrow, medium, wide.
- Mode: system, light, dark.
- Position: auto, top, right, bottom, left.
- Action: primary, secondary, link.
- Media layout and renderer recipe where supported.

Inheritance is always visible:

```text
Workspace brand -> experience preset -> component variant
```

A local change receives an `Override` badge with `Reset to brand`. Do not hide
local divergence or create arbitrary per-block token maps.

#### Product-Match Proposal

The proposal sheet shows:

- The inferred semantic role, not the CSS property.
- Source: explicit customer tokens, selected element, nearby product evidence,
  or Lodariq fallback.
- Confidence only when it changes the decision.
- Before/after preview using the real renderer.
- Accessibility consequences.
- `Apply` or `Choose another element`.

High-confidence safe proposals may preview automatically but do not overwrite
an approved workspace token without confirmation. Raw styles, class names,
selectors, HTML, and coordinates never appear.

#### Workspace Brand and Impact

The admin view groups semantic roles instead of component-by-component CSS:

- Color roles and states.
- Typography roles.
- Spacing, shape, elevation, sizing, and motion.
- Renderer recipes for implemented types.
- Light/dark mode.
- Style-source provenance and last check.

Before approval, one impact surface renders the affected tooltip, modal,
announcement, hotspot, and other implemented recipes across desktop/mobile,
light/dark, long-copy, and critical states. It identifies documents with local
overrides and explains that existing live artifacts remain unchanged until
republished/promoted.

#### Visual Preflight

Preflight runs quietly during preview and exposes only actionable issues:

- Contrast or focus visibility.
- Overflow or clipped primary action.
- Missing font and fallback.
- Target/viewport collision.
- Host overlay obstruction.
- Dark mode, responsive width, RTL, reduced motion, or zoom failure.

Critical failures show one repair action nearest the broken component. Warnings
do not prevent draft save. The issue detail may reveal technical diagnostics,
but the first message stays creator-facing.

#### Brand Drift

When normalized product style evidence changes, show `Brand needs review`, not
an automatic mutation. The review shows changed roles, source/confidence,
affected experiences, before/after runtime previews, and accessibility impact.
Approval creates a new immutable Brand Theme version. Live artifacts and their
staging/production pointers remain unchanged.

If content becomes too large for the selected surface, Lodariq should suggest a
better format:

```text
This tooltip is getting long. Use a modal or slide-in instead?
```

## Experience Types

### Tour Or Guide

Purpose: guide users through one or more steps attached to page context.

Creation flow:

1. Creator chooses Tour or guide.
2. The popup collapses to a movable chip displaying "Choose starting point."
3. Creator clicks a page element.
4. Lodariq opens an anchored tooltip editor beside that element.
5. The pinned launcher keeps its stable actions and Preview becomes available.
6. The draggable authoring popup shows the compact step list.

Tour editor surface:

- Tooltip content editor.
- Placement chip.
- Action selector.
- Step status.
- Add content menu.
- `More` entry point to an on-demand advanced surface.

Step list:

- Appears inside the draggable modeless popup; it is not a permanent left rail.
- Shows steps as compact rows.
- Selecting a row previews that exact step; it does not expand a form beneath
  the list.
- Cards are sortable by drag and keyboard move actions.
- Each collapsed card shows step number, short title, placement label, and
  status.
- `More` opens Placement, Content, Action, Conditions, and Advanced for only the
  selected step in an on-demand surface.
- Add step appears at the bottom of the list and immediately starts target
  selection. After selection, the new tooltip renders and its first meaningful
  content field receives focus.

Step card statuses:

- Ready.
- Needs check.
- Needs placement.
- Needs content.
- Needs action.
- Target not found.
- Ambiguous target.
- Cannot publish.

Placement interaction:

- Hovering a placement item in a step card draws a connector line to the page
  target if found.
- If the target is not found, the card shows Fix placement.
- If multiple targets match, the page highlights all candidates and asks the
  creator to choose the intended one.

Actions:

- Next step.
- Previous step.
- Finish tour.
- Dismiss.
- Open page.
- Start another Lodariq document.
- Trigger Lodariq-owned event.
- Wait for product click on the current target.

Advanced:

- Wait until text appears.
- Scroll element into view.
- Open panel first.
- Select tab first.
- Show only for selected audience.
- Stop showing after completion.
- Troubleshooting and placement diagnostics.

Runtime-specific notes:

- Coordinates are diagnostic only.
- Runtime playback must use semantic resolver scoring, waits, and scroll
  handling.

### Announcement

Purpose: deliver a message that may not require a specific page target.

Creation flow:

1. Creator chooses Announcement.
2. Lodariq displays a default modal in the middle of the page.
3. The modal contains the editor.
4. Creator can switch layout if needed.

Supported layouts:

- Modal.
- Banner.
- Slide-in.
- Toast-style message, if supported by theme.

Editor sections:

- Content.
- Layout.
- Actions.
- Audience.
- Timing.
- Advanced.

Content blocks:

- Heading.
- Text.
- Image or video.
- List.
- Button.
- Link.
- Divider.

Actions:

- Dismiss.
- Open page.
- Start tour.
- Complete.
- Trigger Lodariq-owned event.

Statuses:

- Ready.
- Needs title or message.
- Needs action, when a required CTA exists.
- Unsafe link.
- Layout overflow.
- Cannot publish.

Advanced:

- Trigger rules.
- Audience rules.
- Frequency cap.
- Dismiss behavior.
- Reopen behavior.
- Troubleshooting.

### Survey

Purpose: collect feedback through a question and response mechanism.

Creation flow:

1. Creator chooses Survey.
2. Lodariq opens a survey template picker or default survey modal.
3. Creator chooses a survey type.
4. The survey modal renders with editor controls inside it.
5. Creator configures question, response, follow-up, and thank-you state.

Survey templates:

- NPS.
- CSAT.
- CES.
- Rating.
- Multiple choice.
- Free text.
- Yes/no.

Editor sections:

- Question.
- Response type.
- Options or scale labels.
- Follow-up.
- Thank-you state.
- Actions.
- Audience.
- Timing.
- Advanced.

Question controls:

- Question text.
- Description.
- Required or optional.
- Response type.
- Placeholder text for free text.
- Scale labels, such as Not likely and Very likely.

Response behavior:

- Submit.
- Skip, if optional.
- Branch by response where supported.
- Show follow-up question.
- Show thank-you message.
- Open page after submit.
- Trigger Lodariq-owned event after submit.

Survey statuses:

- Ready.
- Needs question.
- Needs response type.
- Needs response options.
- Needs submit behavior.
- Invalid branching.
- Cannot publish.

Survey-specific cases:

- NPS requires a score scale and submit action.
- Multiple choice requires at least two options.
- Free text requires a placeholder or clear prompt.
- Follow-up questions must not create invalid loops.
- Thank-you state should be editable and previewable.
- Survey does not need a page target by default.

Advanced:

- Show after event.
- Show after delay.
- Show after tour completion.
- Audience rules.
- Sampling rate.
- Frequency cap.
- Stop showing after submit.

### Hotspot

Purpose: add a persistent marker beside an element with optional tooltip
content.

Creation flow:

1. Creator chooses Hotspot.
2. Page enters Selecting placement.
3. Creator clicks a page element.
4. Lodariq renders a marker on or near the element.
5. Creator edits marker style and tooltip content.

Editor sections:

- Marker.
- Tooltip.
- Behavior.
- Audience.
- Advanced.

Marker controls:

- Dot.
- Pulse.
- Icon.
- Label.
- Accent style.
- Position.

Tooltip controls:

- Heading.
- Text.
- Image.
- Link.
- Button.
- Dismiss action.

Behavior:

- Open on hover.
- Open on click.
- Start open.
- Persistent until dismissed.
- Hide after action.

Statuses:

- Ready.
- Needs placement.
- Needs tooltip content, if tooltip is enabled.
- Target not found.
- Ambiguous target.
- Cannot publish.

Advanced:

- Wait until text appears.
- Scroll element into view.
- Audience rules.
- Frequency cap.
- Troubleshooting.

### Checklist

Purpose: give users a persistent task list and track completion.

Creation flow:

1. Creator chooses Checklist.
2. Lodariq opens a left drawer, sidebar, or floating panel.
3. The checklist editor appears inside the rendered checklist surface.
4. Creator adds and configures checklist items.

Editor sections:

- Header.
- Items.
- Item actions.
- Completion rules.
- Empty and completed states.
- Audience.
- Advanced.

Checklist item controls:

- Item title.
- Description.
- Action.
- Completion rule.
- Optional target placement.
- Optional related tour or page.

Item actions:

- Open page.
- Start tour.
- Highlight element.
- Complete manually.
- Trigger Lodariq-owned event.

Completion rules:

- User clicks Complete.
- User visits page.
- User clicks target.
- Lodariq-owned event occurs.
- Tour completed.
- Checklist item action completed.

Statuses:

- Ready.
- Needs at least one item.
- Item needs action.
- Item needs completion rule.
- Target not found.
- Broken document reference.
- Cannot publish.

Panel behavior:

- Items are cards.
- Cards are sortable.
- Cards are collapsed by default when many items exist.
- Expanded item card shows action and completion rule.
- Completed state is separately editable and previewable.

Advanced:

- Audience rules.
- Show until completed.
- Reset behavior.
- Progress display.
- Troubleshooting.

### Knowledge

Purpose: provide contextual help, lightweight documentation, or searchable
answers inside the product.

Creation flow:

1. Creator chooses Knowledge.
2. Lodariq opens a help widget, launcher, or side panel depending on workspace
   theme.
3. Creator edits the rendered help surface.
4. Creator adds articles, cards, links, or contextual prompts.

Editor sections:

- Widget or launcher.
- Content.
- Categories.
- Suggested help.
- Actions.
- Audience.
- Advanced.

Content types:

- Article.
- Short answer.
- Link.
- Embedded media.
- Related tour.
- Related checklist.
- Contact/support action, if configured by workspace.

Actions:

- Open article.
- Start tour.
- Open page.
- Search.
- Dismiss.

Statuses:

- Ready.
- Needs title.
- Needs at least one content item.
- Broken link.
- Broken related document reference.
- Cannot publish.

Advanced:

- Show contextually on selected pages.
- Suggest article near target.
- Audience rules.
- Search indexing status.
- Troubleshooting.

## Placement And Target States

Placement state should be visible both in the relevant card and on the page.

| State          | Meaning                                                        | UI                                           |
| -------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Unset          | No placement selected                                          | Show Choose placement                        |
| Unverified     | Placement exists but this locale/viewport/state is not checked | Show Unverified and offer Check placement    |
| Verified       | Required context resolved and was explicitly checked           | Show Verified and allow highlight            |
| Missing        | No candidate exists or the required UI is not mounted          | Show Target not found and Fix placement      |
| Ambiguous      | More than one candidate remains plausible                      | Highlight candidates and ask creator to pick |
| Drift detected | Previously stable durable evidence changed                     | Show Review placement                        |

Default placement actions stay short:

- Show on page.
- Choose another element.
- **Use exact area** when the whole element is active, or **Use whole element**
  when a point/region override exists.
- Show one attention status only when repair or review is needed.

Exact-area selection is progressively disclosed only after a real owner has
resolved. The popup collapses while the creator clicks for a point, drags for a
region, or moves a keyboard point with arrow keys and confirms with `Enter`;
`Escape` cancels and restores the prior state. Lodariq stores normalized ratios
relative to that owner and re-resolves it before commit. Current delivery uses
this for target-bearing Tour-tooltip positioning only. The geometry never
identifies or activates customer UI.

`More placement options` progressively discloses:

- Before it appears: wait for page text, bring into view, or open required UI.
- Troubleshoot: test interaction and check placement.
- Matching details: semantic method, confidence, and developer diagnostics.
- Remove placement.

The default popup never exposes selector/fingerprint data, DOM depth, role,
hierarchy, or implementation-centric resolver copy.

## Save And Review

### Draft and Review Menu

Autosave is the default. Opening the draft status or release menu provides
explicit draft/review actions without making manual save a required step.

Fields and actions:

- Name field.
- Save draft.
- Save a named checkpoint, if later evidence shows creators need it.
- Send for review.
- Copy preview link, if available.
- Discard changes, behind confirmation.

Save statuses:

- Unsaved changes.
- Saving.
- Saved.
- Save failed.
- Saved as draft.
- Sent for review.

### Autosave Indicator

Autosave should be visible but quiet.

Indicator states:

- Saved.
- Saving.
- Unsaved changes.
- Save failed.
- Offline or reconnecting, if applicable.

Rules:

- Autosave status appears quietly in the popup near any relevant release state.
- Field-level changes should update local state immediately.
- Autosave should debounce typing and batch semantic changes.
- Failed autosave should not destroy local edits.
- An explicit `Save draft now` action may remain available for confidence and
  recovery, but ordinary typing/editing must never depend on it.

Save behavior:

- Autosave runs in the background.
- Explicit draft save gives confidence but is not required before preview or
  release readiness checks.
- Save draft should be allowed for incomplete experiences.
- Send for review should require blocking issues to be fixed or explicitly
  marked as draft review, depending on workflow policy.

### Exit Handling

Close or cancel should behave differently by mode:

- Idle: closes authoring shell.
- Choosing outcome or format: closes the chooser and leaves the launcher.
- Selecting placement: cancels selection.
- Editing with Close: revokes the session and drops only not-yet-persisted iframe
  state; existing autosaved revisions remain.
- Editing with `Save & exit`: flushes the latest document, persists it, then
  revokes and exits. Save failure keeps recovery explicit rather than pretending
  the session ended safely.
- Previewing: exits preview first.

## Preview

Preview is the main confidence action.

Preview controls:

- Preview current experience.
- Preview from first step for tours.
- Preview current step for tours.
- Desktop.
- Tablet.
- Mobile.
- Restart preview.
- Exit preview.

Preview should report:

- Can all placements be found?
- Does the experience fit the selected viewport?
- Does the exact Brand Theme snapshot pass contrast, focus, font, overflow, and
  host-overlay checks?
- Is the renderer/theme contract compatible with production?
- Are required actions configured?
- Are links safe?
- Are required survey responses configured?
- Are broken references present?

Preview failure should always return the creator to the nearest repair point.
Preview must use the actual runtime renderer and compatible compiled JSON. A
separate authoring-only visual imitation is not acceptable.

### Responsive Preview

Responsive preview belongs in Previewing mode, not as a persistent editing
control.

Viewport options:

- Desktop.
- Tablet.
- Mobile.

Behavior:

- Switching viewport should not mutate the document.
- If an experience overflows in a viewport, Lodariq should show a fit warning
  and suggest a safer layout.
- Mobile preview should use the same document state and resolver semantics, not
  a separate mobile-only copy.
- Placement issues caused by responsive layout changes should appear as
  placement review issues.

Examples:

- A desktop tooltip may need to move from right to bottom on mobile.
- A large announcement modal may need to become a full-width mobile sheet.
- A checklist drawer may need to become a bottom sheet on mobile.
- A hotspot marker should remain attached to the resolved element after layout
  changes.

## Environment Release Pipeline

Environments are configured once in the dashboard. The creator does not choose
or configure a domain every time they publish.

When release context is relevant, the popup shows independent truths:

```text
Draft v13 · Staging v12 Verified · Production v11
```

### Derived Primary Action

| Condition                                                      | Primary action        |
| -------------------------------------------------------------- | --------------------- |
| Draft has blockers                                             | Review blockers       |
| Configured staging has no/current-old artifact                 | Publish to Staging    |
| Staging has the current artifact but no valid verification     | Verify on Staging     |
| Staging has the current verified artifact; production is older | Promote to Production |
| Production has the same artifact                               | Live in Production    |
| A release operation failed                                     | Review release issue  |

If the workspace has only one configured environment, the action names that
environment explicitly. A chevron exposes other configured environments and
exceptional actions, but ordinary authoring follows the configured pipeline.

### Publish to Staging

When readiness passes, `Publish to Staging` is one primary action. It compiles a
persisted document version plus exact approved theme on the server. The success
state remains in authoring:

```text
Live on Staging. This exact version is ready for verification.
[Open staging] [Copy test link]
```

The experience may continue to autosave a newer draft, but the contextual
release surface keeps the staging artifact version explicit.

### Verification

Verification belongs to one exact staging publication/hash. The review surface
shows:

- Exact origin and time.
- Manifest/artifact integrity.
- Renderer and SDK versions.
- Target/lifecycle health.
- Brand/accessibility/responsive health.
- Person or automated check that completed verification.

Any content, target, action, trigger, appearance, theme, or renderer-contract
change creates a different hash and invalidates the old verification for
promotion.

### Production Promotion Sheet

The compact sheet shows only release-critical facts:

```text
Promote v12 to Production

Source: Staging · verified 8 minutes ago
Destination: Production · https://app.customer.com
Artifact: sha256-a91f... · unchanged; no recompilation
Changes: 2 copy changes, 1 repaired placement, theme unchanged
Audience: Workspace admins
Trigger: First visit to /exports
Health: 5/5 targets found · brand checks passed

[Promote now]
```

Secondary actions are `Schedule` or `Request approval` when policy requires
them. Do not ask the creator to re-enter content, audience, trigger, appearance,
placement, or domains. If environment-specific behavior is ever introduced, it
must be labeled as an explicit typed binding—not silently called promotion.

Target cost:

- Staging publish: one action.
- Open/share verification: one action.
- Production promotion: one action plus deliberate confirmation.
- Ordinary dashboard/editor context switches: zero.

### Release History, Rollback, and Unpublish

Release history is environment- and document-specific:

```text
v12 · Current · Mahmoud · 10:42
v11 · Previous · Sarah · yesterday
v10 · Aug 2
```

`Restore v11` shows the meaningful diff, target production origin, and one
confirmation/reason. The result is a new auditable rollback release referencing
v11's immutable artifact. It never rewrites old history or recompiles.

`Take offline` creates an auditable inactive release after confirmation. It
does not delete publication or analytics history.

### Release Failure

Show the previous active release as safe unless the pointer actually changed.
The first error names the failed step and one repair:

- Artifact upload failed — Retry publication.
- Deployment changed since review — Refresh release difference.
- Verification expired after a change — Verify the current staging version.
- Approval is for an older artifact — Request approval for this version.
- Production target evidence is stale — Recheck production health.

Never show a generic `Publish failed` when Lodariq knows the operation stage.

## Duplicate And Delete

Duplicate and delete should live in contextual menus, not the stable launcher.

Locations:

- Experience-level menu on the active editor surface.
- Step card menu for tour steps.
- Checklist item menu.
- Survey question menu if multi-question surveys are supported.
- Knowledge item menu.

Duplicate behavior:

- Duplicate content and safe configuration.
- Create new stable block IDs.
- Do not reuse target IDs unless duplicating a step intentionally preserves the
  same placement and marks it for review.

Delete behavior:

- Soft confirmation for destructive deletes.
- If deleting required content, mark experience incomplete.
- Allow undo.

## Advanced Areas

Advanced should be contextual and collapsed.

Common advanced categories:

- Audience.
- Timing.
- Conditions.
- Placement troubleshooting.
- Frequency.
- Completion.
- Diagnostics.

Advanced labels should remain creator-facing:

- "Who should see this?"
- "When should it appear?"
- "Before this appears"
- "Troubleshoot placement"
- "How often should it show?"

Avoid default labels like target lifecycle, compiler package, raw diagnostics,
or JSON.

## Readiness Statuses

Use the same readiness model across all types.

| Status       | Meaning                                        | Save    | Preview                       | Publish/Promote                                                              |
| ------------ | ---------------------------------------------- | ------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Ready        | Complete and safe                              | Allowed | Allowed                       | Staging publish allowed; production still requires exact verification/policy |
| Incomplete   | Missing configuration but structurally safe    | Allowed | Allowed where possible        | Blocked                                                                      |
| Invalid      | Cannot safely run                              | Allowed | Blocked or partial            | Blocked                                                                      |
| Needs review | Target, brand, or dependency changed/ambiguous | Allowed | Allowed with warning          | Requires review/fix                                                          |
| Saving       | Write in progress                              | Pending | Existing preview only         | Disabled until persisted version is explicit                                 |
| Save failed  | Last write failed                              | Retry   | Allowed if local state exists | Disabled                                                                     |

Status should appear at three levels:

- Experience status.
- Section/card status.
- Individual field or placement status.
- Brand Theme and visual-preflight status.
- Per-environment deployment and verification status.

## Accessibility And Keyboard

Required behavior:

- Launcher and popup are keyboard reachable. Enter or Space pins the launcher;
  hover is never required.
- Every launcher action has a visible label or accessible name plus tooltip and
  a target of at least 44 by 44 CSS pixels.
- The popup drag handle supports keyboard movement and announces its position;
  Escape restores the previous position while moving.
- The Phase 3 outcome/type chooser supports arrow keys, Enter, and Escape.
- Placement mode has clear focus and cancellation.
- Editors use visible focus rings.
- Step, item, and question cards support keyboard reorder.
- Preview mode announces entry and exit to screen readers.
- Connector lines are decorative; status text must carry the meaning.

## Implementation Guardrails

- Canonical document remains structured block JSON.
- Do not introduce Markdown-to-JSON compilation or custom Markdown grammar.
- Do not allow arbitrary CSS, JavaScript, or raw HTML in documents.
- Keep product-style sampling authoring-only and persist only normalized safe
  semantic tokens with provenance/confidence.
- Compile the exact approved Brand Theme snapshot and renderer contract into the
  immutable artifact; theme approval alone never changes live output.
- Do not expose code-like attributes to creators.
- Use TypeBox/JSON Schema in `@lodariq/schema` for canonical contracts.
- Runtime publication artifacts must be compiled server-side.
- Browser compilation is preview-only.
- Active release identity includes workspace, environment, and document.
- Promotion and rollback reuse immutable artifacts without recompilation.
- Do not copy documents/themes per environment or publish as a side effect of
  token/session/editor operations.
- Release operations require explicit capabilities, idempotency, compare-and-
  swap pointer state, and append-only history.
- Authoring remains separate from production runtime packages.
- Keep one permanent SDK installation. Ordinary runtime loading must not depend
  on a browser extension or a pre-authenticated dashboard tab.
- Hosted direct activation is development/staging-only. Signed-out activation
  uses a user-initiated first-party top-level auth popup, then an exact-origin,
  one-time exchange for a short-lived capability-scoped session. Never embed
  Lodariq credentials in the customer page or send them through wildcard
  messaging.
- The authoring iframe and bridge continue to use exact allowed origins,
  runtime validation, semantic batched messages, and acknowledgements.
- Coordinates are diagnostics only and never drive production interactions.

## Phase Ownership

- **Phase 0/1 historical completion:** local evaluator, runtime/authoring package
  boundaries, structured contracts, hosted session path, tour persistence,
  preview/runtime foundations, and exact-origin bridge work remain factual.
  This specification amends and supersedes the old dashboard-first authoring
  entry and persistent bar/dock architecture; it does not retroactively mark
  completed foundation work incomplete.
- **Phase 2:** Slice 1 has converged hosted development/staging entry on the
  permanent SDK, direct launcher, first-party popup activation, short-lived
  exact-origin handoff, route-aware browser, and the modeless draggable popup/
  runtime overlay. Slice 2 implements persisted Brand Theme authoring, tokenized
  Tour preview/delivery, document-specific reads, deterministic readiness, and
  contextual staging release state/action; its milestone gate and visual QA pass.
  The Clerk-free owned-auth code milestone passes; production auth
  enablement/live cutover remains an operational gate. Product matching,
  exact-browser verification, and production promotion/approval are implemented
  locally. Immediate preview/persistence/findings hardening, rollback/unpublish,
  and history/analytics completion remain Phase 2 Slice 3/4.
- **Phase 3:** expand `New` into the outcome-first and type catalog, then add the
  announcement/hotspot shared overlay kernel. Only implemented and enabled
  types may appear; checklist and survey remain gated by their dependencies.
- **Later:** knowledge, custom pipeline tiers, and other optional acquisition or
  administration conveniences. A browser extension, if ever built, stays an
  optional accelerator rather than the canonical product path.

## Entry And Overlay Acceptance

- A valid development/staging origin can begin from the installed launcher
  without visiting the dashboard first; production and ordinary viewers never
  load authoring code.
- Signed-out activation opens a first-party top-level popup from the user
  gesture. It succeeds without another Lodariq tab, returns only to the exact
  verified opener origin, leaves no account/long-lived credential in the
  customer page, and leaves the document-session bearer only in the editor
  iframe.
- `New`, `Experiences on this page`, and `Preview` remain in the same order and
  are usable by pointer, touch, and keyboard. Optional hover reveal is never the
  only way to find or pin them.
- Opening, minimizing, and restoring the popup require one action each and
  preserve the draft, selected item, and clamped position. Dragging neither
  opens an action nor creates document/theme mutations.
- Every point outside the visible popup remains available to the customer page.
  Placement selection collapses to the chip, and the chosen selection click
  fires the host-product action zero times.
- Repair, release, and history controls are absent until their corresponding
  state or creator request makes them relevant.

## Open Decisions

- Whether Announcement should first default to modal or ask for modal/banner/
  slide-in before rendering.
- Whether Survey starts with a template picker or a default CSAT-style question.
- Knowledge is deferred to Phase 6/later unless separate paid demand changes the
  roadmap.
- Whether Sent for review freezes editing or creates a new draft after the next
  change.
- Whether creators need a visible manual `Save as version` action after
  immutable release versions are already automatic.
- Whether basic production promotion ships with no approval by default or one
  configurable admin approval for Growth/Enterprise workspaces.
- Whether customer demand justifies QA/UAT/custom environment tiers after the
  fixed development/staging/production pipeline.
