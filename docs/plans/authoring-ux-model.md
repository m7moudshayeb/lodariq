# Authoring UX Model — In-Product Creation Without Context Switching

Status: proposal (design research + interaction spec)
Author: design research pass, 2026-08-17
Supersedes in intent: nothing yet. Extends `docs/plans/authoring-free-shell.md`, resolves the undocumented remainder of `docs/plans/ux-revamp.md`, and closes the five findings in `docs/product-design/audits/authoring-showcase-tour-2026-08-13/README.md`.
Constraint sources: ADR-0003, ADR-0004, ADR-0013, ADR-0014, ADR-0015, ADR-0016, ADR-0018.
**Interactive companion:** `docs/product-design/prototypes/authoring-spec.html` — 29 screens, one per section below, each stating its own rules and measurements. Where this document describes an interaction, the prototype runs it. Treat the two as one artifact: prose here, behaviour and numbers there.

---

## 0. The thesis in one paragraph

Every product in this category — all twenty-two I looked at — splits authoring across two surfaces: content is built on the page, and *everything else* (targeting settings, theme, audience, review, publish, analytics) is built somewhere else. Pendo splits designer from Guide Details. Appcues splits Builder from Studio. UserGuiding makes you do a second dashboard pass to go live. Usetiful's own documentation concedes its flow "creates a deliberate context transition rather than a seamless single-interface experience." **That split is the category's default, and it is the thing worth beating.** The reason nobody has beaten it is not that they didn't think of it — it is that once you put the page on the canvas, you no longer have anywhere to put a settings form, and every attempt to add one back collides with the page. That is exactly where Lodariq is stuck right now. The way out is not a smaller panel. It is a **placement law** that assigns every control to one of three surfaces by a rule the creator can feel, so that nothing ever needs to live in a persistent panel again.

The law:

> **If it has a visible position on screen, you manipulate it directly.
> If it belongs to the thing you have selected, it lives in the inspector anchored to that thing.
> If it belongs to the document rather than to any one thing, it lives in Operations.**

Everything in the old floating panel resolves cleanly under this rule. Most of it was object-scoped — which is why it felt rigid in a panel and why it has no natural home in the current page-as-canvas build: it was put in the wrong tier, twice.

---

## 1. What the research actually says

### 1.1 The market has already conceded the direction

The industry is moving to in-context editing and saying so out loud. Pendo's own pitch for Visual Design Studio is that you "edit your guide by interacting with it in context in your application, rather than in a side panel." Inline Manual rebuilt its authoring tool to put composition "right within the Step's preview." Amplitude (Command AI) lets you change a guide *while previewing it* without returning to the builder. Builder.io's Fusion extension is prompt-in-place on a running app.

So the page-as-canvas decision in `authoring-free-shell.md` is correct and is not the thing to revisit. What no one has done is carry *release and configuration* onto the same surface. That is the open lane.

### 1.2 Entry mechanism: the SDK bet is right, with a known failure tail

- **Extension-based entry** (Appcues, Chameleon, Userpilot, UserGuiding, Whatfix, Product Fruits, and every demo tool) is reliable but adds an install step and a Manifest V3 maintenance tax. Inline Manual's entire Authoring Tool → Builder migration was forced by MV3.
- **Snippet-based entry** (Pendo, Intercom) needs no install but has a documented long tail of launch failures: popup blockers, cookie/localStorage restrictions, app redirects mid-launch, Safari ITP.

Lodariq is snippet-based with a first-party PKCE popup at `app.lodariq.io/authoring/activate` (ADR-0015). **That flow is exposed to precisely Pendo's failure tail.** This needs explicit design attention (§8.4), not just an error state — it is the single highest-frequency support ticket in the category for snippet-based products.

### 1.3 Targeting is a UX surface, not a config field

The best-in-class here is Userflow, and it is not close. It generates and compares *multiple* candidate selectors rather than storing one path, then exposes the ambiguity as two direct-manipulation controls: a **Loosest↔Strictest precision slider** and a **Dynamic text** checkbox. When a target matches many elements it offers three plain-language resolutions — match by element text, by Nth occurrence, or by nearest neighbour. Appcues surfaces selector health as three named states. Product Fruits ships a live selector debugger and a global "prefer data attributes" preference. Navattic gives you arrow tools to walk up and down the DOM ladder; Webflow gives you an always-visible ancestor breadcrumb, which is strictly better because it does not require you to first fail.

Chrome DevTools' inspect mode remains the gold standard and almost none of it has been borrowed by this category: the mode indicator turns blue, hover paints an overlay *and* syncs the tree bidirectionally, the hover card carries accessible name, role, keyboard-focusability and contrast ratio alongside geometry, and three modifiers handle the real edge cases — persist the tooltip, temporarily hide it, and **inspect elements behind `pointer-events: none`**.

Lodariq's ADR-0016 targeting engine is better than any of this under the hood. The gap is that none of that strength is currently legible to a creator, and ADR-0016 correctly forbids exposing selectors, fingerprints, DOM depth or hierarchy. So the strength has to be surfaced as *evidence and confidence in plain language* — which is a harder design problem and a bigger moat.

### 1.4 The complaints are all about the same three things

Across G2, Reddit and teardowns, the recurring builder complaints are:

1. **"No-code" that isn't.** WalkMe: "you need a solid understanding of CSS, HTML, and jQuery"; "even 6 years into leveraging the tool with internal experts we require a fair amount of technical support." Reprise publishes required skill levels per tier. Chameleon's own docs state "Custom CSS takes precedence over any other point-and-click styling changes" — i.e. the real styling layer is CSS and the pickers are a veneer.
2. **Builder performance and findability.** Pendo: "it's hard to remember where the different options are at first"; the editor is "criticized for its unresponsiveness, especially with detailed and lengthier guides"; "guides can become hard to manage and update with time, and you might end up needing to create the guides from scratch instead of tweaking the existing ones."
3. **Repetition.** Nothing in the DAP category has real style reuse. Pendo has saved layouts; Appcues has themes with per-block overrides; nobody has copy-style/paste-style or named step recipes. Your own 2026-08-13 audit found the same thing independently: six cards "required repeating alignment, padding, radius, palette, border, and shadow choices one step at a time."

### 1.5 Two genuinely open lanes

The research surfaced two capabilities that are either unique to one vendor or shipped by nobody:

- **Brand auto-detection.** Chameleon is the *only* product in the category that samples your UI and generates themes from it — and its framing is very good: it produces **two variants, one blended into the product and one deliberately contrasting**. Pendo, Appcues and Userpilot are all still manual hex entry.
- **Predictive layout QA.** No product ships "this tooltip will overflow at 375px" or an in-canvas accessibility check. Webflow's Audit panel — the closest analogue in any tool — explicitly does *not* check contrast. Supademo's AI Demo Audit is engagement scoring, not layout simulation. This is empty space, and Lodariq already owns the placement math needed to fill it.

---

## 2. Diagnosis: why the panel → page move stalled

The old panel failed for the reasons the archive doc names — it read as an "editor/debugger hybrid" and made a first-time creator answer *what am I making / what do I click next / can I trust what gets published* all at once. Killing it was right.

But the migration stalled for a structural reason that is not in the docs:

**The panel was doing four different jobs at once, and only one of them was replaced.**

| Job the panel did | What replaced it | Status |
|---|---|---|
| Compose content (blocks from the outer tray) | Rich Content field, in-place | ✅ Replaced, and better |
| Configure the selected object (popup tray, placement tray, property tray, per-step appearance) | *nothing* | ❌ Homeless |
| Configure the document (flow map, translation, batch, appearance, release, review, recovery) | "Operations modal" | ⚠️ Named, never specced |
| Show state (what step, what environment, saving or not, is my target OK) | *nothing* | ❌ Homeless |

Two of the four jobs have no surface. That is the whole gap. It also explains the audit findings precisely: chrome collisions (#3, #4) happen because object-scoped controls are being rendered as page-level chrome; the misleading progress indicator (#6) happens because there is no state surface so state got parasitised onto the header; the style repetition (#5) happens because object configuration has no home and therefore no reuse model.

A second, quieter problem: `rich-content-authoring.md` still documents the Popup / Placement / property trays as *present*, while `authoring-free-shell.md` says there is no floating panel. **These two documents contradict each other and both are treated as current.** Reconciling them is a prerequisite for any implementation work.

---

## 3. The model

### 3.1 Placement law

Three tiers. Every control in the product must be assignable to exactly one, and the assignment must be derivable by a creator without being taught.

**Tier 1 — Manipulate.** Anything with a visible position, size, order or identity. No forms, ever.
Placement (compass), size (8-edge resize), step order (filmstrip drag), target (picker), content (typing in the card), block order (gutter handles).

**Tier 2 — Inspect.** Anything scoped to the currently selected object, whose effect is visible inside or on that object.
Style, action, conditions, per-step overrides, button/field properties, target evidence and repair, narration script.
Lives in a single **inspector popover** anchored to the selection. One instance. Escape closes. Never persistent.

**Tier 3 — Operate.** Anything scoped to the document, the environment, or the release — where the underlying page is not the subject.
Flow map, translation, batch edits, theme/appearance, release, review, recovery, analytics.
Lives in **Operations**, which is allowed to cover the page because the page is irrelevant to it.

The one-line version, which should be in onboarding copy: *drag what you can see, open the inspector for what you selected, open Operations for the whole thing.*

### 3.1a The pointer-first rule

The creator is a product marketer, not a developer. They will not read a shortcut list, and they should never need to.

> **No keystroke is ever the only way to do anything.**
> Every action has a visible, labelled, clickable affordance. Keyboard shortcuts are accelerators layered on top of those affordances, discovered by seeing them printed next to the control they duplicate — never by memorization.

This is a testable acceptance criterion, not a sentiment. **Zero-keyboard completion test:** a creator must be able to build, target, style, preview, verify and publish a six-step tour using only a pointer, with no keystrokes except typing text into the card. Any flow that fails this test is a defect, regardless of how good the shortcut is.

Two consequences that are easy to get wrong:

- **Keyboard operability is still required.** Pointer-first is not pointer-only. `ux-revamp.md` already commits to keyboard reorder with position announcement, Enter/Space to pin, and drag alternatives — those are WCAG obligations and they stay. The distinction is that keyboard *operability* serves people who cannot use a pointer, while keyboard *shortcuts* serve speed. The first is mandatory and must mirror the visible controls exactly; the second is optional and must never be load-bearing.
- **Modifier keys are banned from the primary path.** Hold-`⇧`-to-pick-through and hold-`⌃⌥`-to-pin are DevTools patterns for a DevTools audience. The problems they solve are real here; the solutions are not transferable. §4.4a replaces each of them with a visible control.

### 3.2 Surface inventory

| Surface | Persistent? | Intercepts input? | Scope |
|---|---|---|---|
| Canvas (customer page) | always | only where an overlay sits | — |
| Card (rich content editor in the `editor.lodariq.io` iframe) | while a step is selected | yes | step content |
| Toolbar (docked above the card) | with the card | yes | selection within card |
| Compass + resize frame | with the selection | yes, 8 handles only | geometry |
| Pulses | while authoring, not previewing | yes, dot only | step selection |
| Filmstrip | while authoring; collapses in Target mode | yes | step order |
| **Inspector popover** *(new)* | on demand, one at a time | yes | selected object |
| **Mode pill** *(new)* | always, ~200×36px, magnetized, movable, collapsible to a dot | yes, its own pixels only | state + mode + escape hatches |
| Operations | on demand | yes, full | document |
| Preview | replaces all of the above | no Lodariq pixels | — |

`ux-revamp.md` forbids "modal backdrop, page resizing, full-width bar, or permanent rail" that blocks the product. The mode pill complies: it is a small floating overlay that intercepts only its own pixels, never reflows the page, is movable, and collapses to a single 28px dot. It is not a rail and must never be allowed to grow into one — that is a hard design constraint, not a preference. **If a control is ever proposed for the mode pill, it belongs in Tier 2 or Tier 3 instead.**

### 3.3 Mode model — two visible controls, not four modes

The audit's findings #3 and #4 are mode-confusion bugs wearing a layout costume. "The content insertion menu also appeared non-responsive while button controls were active" is a creator being in a mode they cannot see. DevTools solved this in 2011 by turning the icon blue — but a blue icon is a hint, not a control, and a PMM needs the control.

Internally there are four states. **The creator is only ever shown two controls**, and never has to name a mode:

**Control 1 — the Editing ⇄ Browsing switch.** A two-position labelled toggle in the mode pill, always visible, always one click.

```
  ┌─────────────────────────────┐
  │  ✏ Editing  │   ↗ Browsing  │
  └─────────────────────────────┘
```

- **Editing** — the authoring layer is live. Page is inert under overlays.
- **Browsing** — the authoring layer ghosts to 15% opacity with `pointer-events: none`. Your clicks reach your product. Click through three screens to reach the page you want, click **Editing**, and everything returns exactly where it was.

This is the single most important interaction in the whole product and it must not be hidden behind a held key. The hardest thing in on-page authoring is *getting to the next screen of your product* without the editor eating your clicks — the locked spec's "click outside deselects once, then the page is interactive" is a two-click workaround for a missing control. Storylane makes you pause ten seconds between clicks; Walnut makes you toggle every interactive element on and off during capture. A labelled switch beats both, and beats a keystroke.

Hold-`Space` remains as a transient accelerator for people who find it, printed on the switch's tooltip. It is never the only way.

**Control 2 — the Preview button.** In the pill, labelled `Preview`. Everyone already understands this word. Exiting is a single labelled `Exit preview` affordance.

**Target is not a mode the creator chooses.** It is a state the flow puts them in, always entered from a visible button and always self-announcing:

- Creating a step opens the picker automatically with an instruction band: *"Click the thing this step should point at."*
- Changing an existing target is the **`Change target`** button in the inspector's Target section, and the **`Change`** affordance on the target's own outline.
- The picker announces itself with a full-width instruction band and a `Cancel` button, so there is never a moment where the creator is in the picker without being told so and given an exit.

Net creator-facing model: **one switch, one button, and a picker that tells you what it wants.** That is the whole mode system as experienced. The four-state machine underneath is an implementation detail and no UI copy should ever refer to it.

### 3.4 Layer manager and collision (audit #3, #4)

There must be exactly one module that owns z-order and pointer-event routing for every Lodariq-rendered pixel. Rules:

1. **Only the topmost layer at a given point receives pointer events.** No two interactive Lodariq layers may occupy the same pixel. Where they would, the lower one is displaced (below) or suppressed.
2. **Reserved rect.** Compute the union of the runtime card rect + target element rect + compass. All non-anchored chrome (mode pill, filmstrip, inspector) is placed by a quadrant solver in the largest free region outside that union, with a stable preference order so chrome does not jitter as the creator types.
3. **Anchored chrome flips, it does not overlap.** The inspector uses the standard flip/shift/collision middleware pattern (Floating UI semantics): preferred side, flip to opposite, shift within viewport, and finally fall back to a fixed corner with a leader line to its anchor.
4. **Get out of the way — as a visible button.** Every Lodariq surface that can cover the page carries a `Move` and a `Hide` affordance in its own corner. This is what Appcues ships as a reposition arrow and Intercom as a Hide control on its bottom bar, and both exist because creators hit this constantly. Hidden chrome returns via a persistent `Show` chip. Hold-`\` peek is an accelerator on top, printed in the Hide tooltip.
5. **Automatic avoidance first.** The creator should rarely need #4. When the quadrant solver detects that chrome would cover the card or its target, it moves the chrome *before* the creator notices, with a 150ms transition so the movement is legible rather than startling. Manual `Move`/`Hide` is the fallback for when the solver has no good answer, not the primary mechanism.
6. **Collapse.** The mode pill's `⌄` menu carries `Hide all panels` / `Show all panels`. `⌘⇧\` mirrors it.
7. **The minimized authoring header is deleted.** Its job (progress) moves to the mode pill and is bound to the *runtime* step, not the editor selection (audit #6).

### 3.5 What Compose mode looks like

```
┌────────────────────────────────────────────────────────────────┐
│  customer product page — untouched, no reflow                  │
│                                                                │
│      ┌───────────────────────┐                                 │
│      │ B I U  ⌄  A  ⬛  ⋯     │  ← toolbar, docked above card   │
│      ├───────────────────────┤                                 │
│      │                       │                                 │
│      │  Rich content card    │  ← the artifact, edited in place│
│      │  (editor iframe,      │                                 │
│      │   aligned over the    │     ◇ ← compass on target       │
│      │   runtime tooltip)    │   ┌────────┐                    │
│      │                       │   │ target │                    │
│      │  [ Got it ]           │   └────────┘                    │
│      └───────────────────────┘                                 │
│                                                                │
│                                                                │
│  ①  ②  ③                            ┌──────────────────────┐   │
│  ↑ pulses on visible targets        │ ◐ Staging · 2/6 · ✓  │   │
│                                     └──────────────────────┘   │
│  ┌──────────────────────────────────┐        ↑ mode pill       │
│  │ ▸1 ▸2 ▸3 ▸4 ▸5 ▸6  +             │                          │
│  └──────────────────────────────────┘                          │
│    ↑ filmstrip                                                 │
└────────────────────────────────────────────────────────────────┘
```

Nothing is persistent except the pill and the filmstrip, and both are displaceable and collapsible. There is no panel.

---

## 4. Surface specifications

### 4.1 Mode pill

Content, left to right, at ~200×36px:

`[mode glyph] [environment] · [n of m] · [save state] [⌄]`

- **Mode glyph** — filled when in a non-default mode, matching DevTools' blue-icon convention. Click cycles nothing; it is a status indicator with a menu.
- **Environment** — `Staging` / `Dev`. Chameleon surfaces environment and identified user in its builder chrome and it is one of the few unambiguously praised details in the category, because "why isn't my guide showing" is the #1 support ticket. Include the resolved audience/identified user in the menu.
- **`n of m`** — bound to the *runtime* step during preview, to the selection during compose, and labelled accordingly (`Preview · 1 of 6` vs `Step 2 of 6`). Audit finding #6.
- **Save state** — one of `Saved` / `Saving…` / `Retry` (§8.1). Never a spinner that lies.
- **`⌄` menu** — Operations, Preview, Help, Exit authoring, and the keyboard map.

Magnetized to the nearest corner, draggable, collapses to a 28px dot on double-click or after 8s idle in Browsing. Position persists per creator per origin. The Editing/Browsing switch (§3.3) is the pill's leftmost and largest element — it is the most-used control in the product and should look like it.

### 4.2 Card and toolbar

Keep everything in `rich-content-authoring.md`. The decisions there are good and several are better than the competition: the persistent toolbar above the popup rather than selection-gated (so the published preview stays clean); media and buttons in document flow "so the popup behaves like a Notion page rather than a stack of locked bricks"; the 0–96 whole-pixel spacing input instead of subjective presets; commit-on-blur links with no Apply button.

Two changes:

- **The `⋯` on the toolbar opens the inspector for the card.** This is the only entry point that needs to exist for step-level configuration, and it replaces the Popup tray entirely.
#### 4.2a Toolbar behaviour — the part that decides whether this feels good

A tooltip card is 280–360px wide. A rich-text toolbar is not. This mismatch is the single most likely reason the authoring experience ends up feeling like a form bolted to a popup, so it needs a spec rather than an intention.

**1. The toolbar is not width-coupled to the card.** It has its own minimum width (~420px), is centred on the card, and is allowed to overhang symmetrically on both sides. Squeezing eighteen controls into a 260px bar produces 14px hit targets and a bar that reads as part of the card. The overhang is not a defect — it is the thing that makes the toolbar legible as *chrome around* the card rather than *furniture inside* it.

**2. Anchor order: above → below → docked.** Preferred position is above the card with a 10px gap. If there is no room (card near the top of the viewport), flip below. If neither fits, dock to the top of the stage with a leader line. It never overlaps the card, and it never overlaps the target.

**3. Position is solved on selection and resize, never on content change.** This is the detail that separates "calm" from "nauseating." If the solver re-runs as the card grows during typing, the toolbar jitters on every line break. Solve on: selection change, explicit resize, card move, viewport resize. Apply hysteresis — only re-solve if the current position has become invalid by more than ~24px.

**4. Persistent frame, contextual contents.** `rich-content-authoring.md` chose a persistent toolbar over a selection-gated one, and the reasoning ("so the published preview stays clean") is right — keep it. But *persistent* should mean the bar never appears or disappears, not that its contents are fixed. Structure it in three zones:

```
[ ＋ Insert ] │ ←──── contextual middle ────→ │ [ ⋯ ]
   constant        swaps on selection            constant
```

- **Nothing selected** → step-level: Style · Placement · Actions
- **Text run** → B / I / U · size · colour · link
- **CTA button** → variant · on-click · colour
- **Media** → fit · width · alt text · captions

The bar's geometry does not move when the middle swaps; only its contents cross-fade. This is Figma's and Google Docs' model, and it means the creator never has to hunt for controls that vanished, while a 260px card still gets a usable toolbar.

**5. The card must render as its published self.** No input borders, no focus rings on body text, no placeholder boxes, no visible field chrome. The only editing affordances inside the card are the caret, the text selection, and a thin outline on a selected decorator. Everything else is in the toolbar or the inspector. This is what makes it read as a document rather than a form.

**6. Gutter handles live outside the card's box.** `rich-content-authoring.md` specifies hover gutter handles for insert-after, reorder and per-block settings. On a 300px card, a 24px inner gutter costs 8% of the writing width and shifts the text away from where it will actually publish. Render the gutter in the overlay's margin, outside the card's padding box, so the card's content geometry is byte-identical to the published result. This also makes §7.3's predictive QA meaningful — you are measuring the real thing.

**7. Content that does not fit is a conversation, not a squeeze.** When an insert would overflow the card, offer to grow it rather than reflowing into something unusable: *"This video needs more room. `[Widen the card]`"*. The 8-edge resize already exists; this just connects it to the moment the creator needs it.

**8. Chrome and content use different token sets.** The card renders in the customer's Brand Theme tokens; the toolbar, gutter, pill and filmstrip render in Lodariq creator-chrome tokens ("restrained glass," per the Editorial Air system). That deliberate contrast is what makes *this is my content / this is the editor* legible without a single label. If both used the same palette the creator would lose the boundary immediately.

**9. Toolbar and card live in the same document.** Both render inside the single `editor.lodariq.io` iframe, which is transparent and sized to the overlay region, not to the card. This is not an aesthetic choice — caret position, selection range and toolbar state have to stay in one document, because ADR-0015 forbids streaming keystrokes or pointer movement across the bridge. The layer manager (§3.4) routes pointer events so only card and toolbar pixels intercept.

---

- **Action layout / alignment / gap move into the inspector's Actions section**, not a tray. `rich-content-authoring.md` currently states the Popup tray Action layout control "is the only way" to put consecutive buttons on one line — that must become a direct manipulation instead: drag one button onto the row of another to join them, drag out to split. Tier 1, not Tier 2. The alignment and gap controls remain in the inspector as refinements.

### 4.3 Inspector popover — the single replacement for all trays

This is the most important new surface. It absorbs the Popup tray, the Placement tray, the under-canvas property tray, and the `More` → Placement/Content/Action/Conditions/Advanced menu.

**Invocation.** `⌘/` or the `⋯` affordance on whatever is selected — the card, a button, a form field, a media block, a target, a step in the filmstrip. Always the same gesture. Escape closes. Clicking a different object moves the inspector to it rather than opening a second one.

**Anchoring.** Attached to the selected object with flip/shift collision handling. If no viable position exists, it docks to the corner opposite the reserved rect with a 1px leader line to the anchor, so the relationship stays legible.

**Size.** ~320px wide, height content-driven, max 60vh with internal scroll. Never full height.

**Structure.** Sections, not tabs. Tabs were the old panel's mistake: they hide state and force a mode decision before you know what you want. Sections are collapsed by default beyond the first, and the first section is chosen by *what you selected*:

| Selection | First section | Other sections |
|---|---|---|
| Card | Style | Actions · Placement · Conditions · Narration · Advanced |
| CTA button | Button | Action · Style |
| Form field | Field | Validation · Style |
| Media block | Media | Frame · Alt text |
| Target (via compass or pulse) | Target | Evidence · Approach · Repair |
| Step (from filmstrip) | Step | Style · Conditions · Narration |

**Style section — the important one.** Every control is a semantic token picker, never a raw value, per ADR-0013. Following Shopify's `color_scheme_group` pattern, which is the best in the industry: the creator picks a **whole named scheme** with roles (surface, text, accent, border) rather than four hex values, and sees a generated preview swatch. Individual role override is available but demoted one level.

Above the style controls, always visible:

```
Style:  [ Primary card  ⌄ ]   ● 3 overrides    [ Reset ]
        ┌──────────────────────────────────────────────┐
        │ Copy style ⌘⌥C   Paste style ⌘⌥V             │
        │ Apply to…                                    │
        │ Create style from this step…                 │
        └──────────────────────────────────────────────┘
```

Override semantics follow Appcues/Figma component semantics, which the category has already validated: an override indicator per changed property, and four actions — reset property, reset instance, save as new style, update the original style. This is the entire fix for audit finding #5.

**Advanced section.** Contains what the archive doc says must stay off the default path — lifecycle controls, backup JSON, diagnostics, compiled/support package. Collapsed, last, and labelled in creator language, never "target lifecycle" or "compiler package."

### 4.4 Target system

This is where Lodariq can be visibly better than everyone, because ADR-0016 is genuinely stronger than the selector-string engines the rest of the category ships. The design job is to make that strength *felt* without exposing a single selector.

**Picking (Target mode).**

- Crosshair cursor; hover paints the highlight rect; the filmstrip collapses (already in the locked spec).
- **Hover card** — borrowed from DevTools and stripped of implementation detail. Shows: what the thing is in plain language (its accessible name and role — "Button · Create project"), its size, and **a live match count** ("1 of 1 on this page" / "1 of 4 that look like this"). Never a selector, never DOM depth. Match count is the single most useful number and no DAP shows it during hover.
- **Ancestor breadcrumb**, always visible during picking, Webflow-style — but rendered in *plain language*, not DOM nodes: `Page › Projects area › Toolbar › "Create project" button`. **Every crumb is a click target** and hovering it previews the highlight. This is strictly better than Navattic's arrow tools and Product Fruits' "move up the DOM tree" because it never requires you to first fail, and better than arrow-key traversal because it is visible and clickable. Arrow keys mirror it for keyboard operability.
- **Pick bigger / Pick smaller.** Two buttons next to the breadcrumb, because "the crumb names are abstract and I just want the box to be a bit bigger" is the actual creator mental model. Each click walks one level and re-renders the highlight.

#### 4.4a Replacing the DevTools modifiers

Three real problems, three visible controls. No modifier keys on the primary path.

| Real problem | DevTools answer (wrong audience) | Lodariq answer |
|---|---|---|
| The dropdown/menu closes when I move my mouse to it | hold `⌥` to enter picking transiently | **Automatic page freeze.** When a transient layer (menu, popover, dropdown) appears while picking, Lodariq freezes it and shows a band: *"Page frozen so this menu stays open."* `[ Unfreeze ]`. No key, no instruction to remember — it happens because the creator did the thing that needs it. Also available as a `Freeze page` button in the picker band for the cases detection misses. |
| The hover card disappears when I try to read it | hold `⌃⌥` to pin it | **Click to pin.** Clicking the hover card pins it; clicking elsewhere unpins. Same gesture creators already use everywhere else. |
| A transparent overlay is swallowing my click | hold `⇧` to pick through | **Disambiguation, not a modifier.** If the clicked point has more than one plausible target, show the same plain-language chooser used everywhere else: *"Two things are here — `the Create project button` / `the panel behind it`",* each option live-highlighting on hover. This reuses a pattern the creator has already met instead of teaching a new one. |

This single table removes the entire "unable to select an element in a drop-down menu" class of support article that Whatfix, UserGuiding and Arcade all maintain — and removes it without asking a PMM to learn a chord.

**Disambiguation.** When the engine's evidence is ambiguous, do not show a slider and do not show a selector. Show Userflow's three plain-language resolutions, phrased as a question with visual answers:

> **Four things on this page look like this one.**
> ○ Just the one I clicked
> ○ Any button that says "Create project"
> ○ The 2nd one, in reading order
> ○ Any of them — first one wins

Each option live-highlights its matches on the page as you arrow through it. This is the whole of what a precision slider does, expressed in language a PMM can answer.

**Three verification states** (audit #2 — replaces the current binary, which produces the false-`Unverified` the audit caught):

| State | Meaning | Creator action |
|---|---|---|
| **Verified** | Resolved here, now, with durable evidence | none |
| **Needs context** | Resolved reliably when reached the recorded way; not present on this screen right now | review the approach, or none |
| **Can't find** | Evidence gates failed | repair |

The audit's modal-`Close` case is `Needs context`, not `Verification failed`, and stating that correctly removes a whole class of false alarms.

**Approach recipes** — the direct implementation of audit finding #2, and a real differentiator. When a creator targets something that required navigation to reach, Lodariq already knows how they got there: it observed the clicks. Capture that as an **approach**, displayed as a plain-language breadcrumb in the inspector's Approach section:

> **How Lodariq will get here**
> 1. Click **Import** on the Projects page
> 2. Wait for the **Import data** dialog
> 3. Then find **Close**
> `[ Replay ]  [ Edit ]  [ Record again ]`

Each line is editable and reorderable; each waits on a semantic condition (element appears, route changes, text appears) not a timer. `Replay` runs it and reports pass/fail inline. Nobody in the category has this — WalkMe approximates it with jQuery and a desktop app.

**Repair.** When drift breaks a target, ADR-0014 forbids mutating a live release. The repair flow surfaces as a proposal in the inspector, and — this is the borrow from Webflow's Audit panel that makes audits actually get acted on — the proposal carries a **jump-to-element action** that selects the offending step on canvas and opens the exact section where the fix lives. A passive list of problems gets ignored; a list with a "take me there and open the right thing" arrow gets fixed.

### 4.5 Filmstrip and multi-step

- Horizontal, bottom-magnetized, collapses in Target mode (already locked).
- Each item is a thumbnail plus a one-line title plus a state dot (Verified / Needs context / Can't find / Draft).
- **Multi-select** with `⇧`-click and `⌘`-click. This is a prerequisite for `Apply to…` in the style section and for batch operations, and it is the cheapest possible fix for the repetition complaint.
- Drag to reorder with a handle and a movement threshold; keyboard reorder with position announcement and Escape restore (already specified in `ux-revamp.md`, keep it).
- **Insert here** affordance between items, so adding a step in the middle is one gesture rather than add-then-drag.

### 4.6 Operations — specced

`authoring-free-shell.md` names Operations as the home for flow map, translation, batch, appearance, release, review and recovery, and says only that it "may cover the page" and "never publishes on open/close." Here is the rest.

**Form.** Full-viewport sheet inside the same `editor.lodariq.io` iframe (the locked spec already says "the same iframe switches overlay and operations presentations"). It covers the page because in Tier 3 the page is not the subject. Left nav, single content column, no nested modals.

**Sections.**

| Section | Contains | Notes |
|---|---|---|
| **Map** | Node graph of steps, branches, conditions, entry points | Connector lines decorative; status carried in text (already specified). Click a node → close Operations, select that step on canvas. |
| **Appearance** | Theme selection, token editing, generated theme variants, contrast report | §6 |
| **Language** | Locale list, per-locale draft translations, per-locale placement state | §7.6, ADR-0018 |
| **Batch** | Multi-select operations across steps: apply style, apply theme, replace text, retarget | Every batch op previews the diff and requires confirm. |
| **Check** | Pre-publish report: contrast, overflow prediction, targets by state, missing alt text, untranslated strings | §7.3. Each row has jump-to-element. |
| **Release** | Publish to staging, verify, promote to production, rollback, history | ADR-0014 semantics preserved verbatim: immutable artifact, verification bound to one hash, promotion reuses the exact artifact, pointer CAS, append-only history. |
| **Recovery** | Version history, restore, orphaned asset recovery | |

**Non-negotiables.** Opening or closing Operations never publishes, never mutates release state, never creates a version. Production is rejected at every layer per ADR-0015 and the Release section renders the production column as explicitly disabled with the reason, not hidden.

**Why this doesn't reintroduce context switching.** It's the same origin, the same iframe, the same session, one keystroke away, and it returns you to the exact selection you left. The context switch competitors force is *a different application, a different auth session, and a lost place*. This is a drawer, not a destination.

### 4.7 Preview (audit #3)

- `P` enters. Every Lodariq authoring pixel is removed — pill, filmstrip, pulses, card, compass, inspector.
- The runtime renders with the **exact theme snapshot** that will publish, per the ux-revamp principle "preview and production use the same runtime renderer and exact theme snapshot."
- Exactly one authoring pixel survives: a small exit affordance, movable, that reads `Preview · 1 of 6 · Exit`, bound to the runtime step.
- Entry and exit are announced to screen readers (already specified).
- **Edit-during-preview**, borrowed from Amplitude, which is the one thing they do better than anyone. The exit affordance carries an `Edit this step` button: click it and the currently-showing step is selected and its card reopens in place, without resetting preview state. This collapses the edit→test→edit loop to two clicks. `⌘E` mirrors it.

---

## 5. Applying the model to the other experience types

The model is type-agnostic by construction, which matters because five of six types in `ux-revamp.md` are still unimplemented.

| Type | Tier 1 (manipulate) | Tier 2 (inspector) | Notes |
|---|---|---|---|
| **Tour** | placement compass, resize, filmstrip order, target pick | style, actions, conditions, approach, narration | the implemented case |
| **Announcement** | drag the card to a screen region for slide-in/banner/modal; resize | style, dismissal, frequency, audience | **Resolves the open decision**: don't ask modal-vs-banner up front. Drop one card centre-screen; dragging it to an edge *is* choosing slide-in; dragging to the top edge *is* choosing banner. The form is a consequence of position, which is Tier 1 by definition. |
| **Hotspot** | drag the marker on the target; pick marker form from a 4-swatch inline row | tooltip content, trigger, style | Marker/tooltip are one object with two states; the inspector has a `Marker` and `Tooltip` section. |
| **Survey** | drag question order, resize | question type, options, logic, style | **Resolves the open decision**: default to a single CSAT question on the canvas immediately, with the template picker as a `Start from a template` link in the inspector's first section. Nobody should face a template grid before seeing anything. |
| **Checklist** | drag the panel to an edge (which sets drawer vs floating), drag item order | items, completion rules, style | Same edge-drag-decides-form logic as announcements. |
| **Knowledge** | — | — | Deferred, per ux-revamp. |

The "edge-drag decides the form" idea is worth emphasising: it converts two of your three open type decisions from a dialog into a gesture, and it is a Tier-1 answer to what everyone else ships as a Tier-3 radio group.

---

## 6. Styling system

### 6.1 The layer stack

Four layers, strictly ordered, and the creator only ever touches the top two.

```
1. Renderer recipes           (ADR-0013, versioned, code)
2. Brand theme tokens         (semantic: surface / text / accent / border / radius / shadow / type)
3. Named step styles          (a set of token bindings + spacing/alignment, reusable)
4. Instance overrides         (per-object, marked, resettable)
```

No raw CSS layer. This is a deliberate and defensible break from Chameleon ("custom CSS takes precedence"), Appcues (Advanced tab CSS), and Pendo (supplemental CSS per theme + global CSS). All three of them have CSS escape hatches and all three of them have the same review complaint: the escape hatch becomes the real styling system, and then non-technical creators cannot maintain their own content. ADR-0013 already forbids persisting raw CSS, so the constraint is already yours — the design job is to make layer 2 rich enough that nobody wants the escape hatch.

Concretely, layer 2 needs, at minimum, what Pendo exposes: container background/border-width/border-colour/radius/shadow (colour, angle, distance, blur, size)/backdrop, close-button treatment and position, caret dimensions, typography for title/subtitle/body/link (family, weight, size, colour, decoration, transform, line-height, letter-spacing), three button levels each with default and hover, and divider treatment. Plus a dark set. That is the bar for "no CSS needed" and it is a known-achievable bar.

### 6.2 Named step styles — closing audit #5

- **Copy style / Paste style** — labelled rows in the inspector's style menu, copying the full override set of the selected object. `⌘⌥C` / `⌘⌥V` printed alongside.
- **Apply to…** — with filmstrip multi-select, applies to n steps with a preview of the diff.
- **Create style from this step…** — names the current override set, converts it to a style, and rebinds this step to it. The overrides become zero.
- **Update the original** — when a step bound to a style has drifted, offer to push the change back to the style, exactly like a Figma component.
- Styles bind to *tokens*, not values, so a theme change propagates through every style and every step. This is the property Pendo explicitly lacks — its own help centre warns that "updating a theme does not retro-apply to existing guides," which is the source of the "you end up recreating guides from scratch" complaint. Appcues gets this right (theme edits apply on save) and it should be copied.

### 6.3 Theme snapshot staleness

`authoring-and-release.md` documents that the authoring iframe holds the theme snapshot from session start, so a new theme requires a session refresh. That is a correctness bug wearing a documentation costume: creators will change a theme, see nothing, and change it again. Fix it with a versioned snapshot handle — the host holds the current theme version, the iframe subscribes, and a version bump triggers a re-render with the new snapshot. If a full fix is out of scope short-term, the interim must be an explicit in-product state (`Theme updated — reload to see it  [Reload]`), never silence.

---

## 7. The AI layer

Ordered by leverage, not by novelty. Each item states the UX, the guardrail, and the constraint check.

### 7.1 One-click brand theme (highest leverage)

**Why first.** It is the only shipped brand auto-detection in the entire DAP category (Chameleon), and it removes the single biggest first-run cost: a PMM staring at fourteen hex fields. ADR-0013 already permits product-style sampling in authenticated authoring and forbids persisting raw CSS/selectors/DOM — which is exactly the shape of this feature.

**UX.** On first activation in a workspace, before any content exists:

> **Making Lodariq look like your product…**
> [ sampling animation over the real page ]
>
> **Two ways to look like you.**
> ┌─────────────┐  ┌─────────────┐
> │  Blended    │  │  Distinct   │
> │  [preview]  │  │  [preview]  │
> └─────────────┘  └─────────────┘
> Both pass AA contrast.   `Use Blended`  `Use Distinct`  `Start plain`

Two variants, one that melts into the product and one that deliberately stands out, is Chameleon's framing and it is correct — it turns an unanswerable question ("what colours?") into a binary preference ("blend in or stand out?").

**Technique.** Don't scrape the whole DOM. Sample computed styles from a fixed **semantic probe set**: `body`, primary nav, the sticky header with the highest z-index, the first CTA-heuristic button (largest tap target with a non-neutral background above the fold), the first in-content link, `h1`/`h2`/`p`, and the first `[class*=card]`/`[class*=panel]`. From each read colour, background, border colour, radius, shadow, and the type metrics. Then:

- **Colour** — bucket in OKLCH, split near-neutrals (chroma < 0.03) into a greyscale ramp, cluster the rest by hue (±15°) **weighted by rendered pixel area, not occurrence count** — a 40px CTA should outrank 200 hairline borders. Highest-area chromatic cluster is primary; the most hue-distant secondary cluster is accent.
- **Radius** — the *mode* across buttons and cards, not the mean (real design systems are quantized), snapped to {0, 2, 4, 6, 8, 12, 16, 9999}.
- **Shadow** — keep the y-offset/blur ratio from cards, re-tint the shadow colour toward the primary hue at very low chroma. This is the detail that makes generated themes read as intentional rather than automatic.
- **Spacing** — GCD detection over observed paddings, snapped to a 4px or 8px base.
- **Type** — first non-fallback family in each stack for heading vs body; capture the font asset URL so it can actually load.

Derive the final token set **contrast-first**: Adobe Leonardo's `generateContrastColors()` takes the target ratio as the *input* and returns the colour, and Material Color Utilities' HCT tone scale maps monotonically to L\* so a fixed tone delta yields a near-fixed contrast ratio. Either approach means AA is guaranteed by construction rather than audited afterwards. `context.dev`'s Extract Styleguide API does the whole render-and-compute pipeline as a service if the build-vs-buy maths favours it — but note it renders the page server-side, which will not work for authenticated app screens; for those, in-page sampling is the only option, and in-page sampling is what ADR-0013 already contemplates.

**Guardrail.** Persist only the resulting semantic tokens. Never persist CSS text, selectors, class names, stylesheet content, DOM snapshots, URLs or coordinates. The sampler runs in the authoring path only. The generated theme is a *proposal* the creator accepts; acceptance writes tokens; nothing auto-applies to a live artifact (ADR-0013, ADR-0014).

### 7.2 Live contrast gate

Compute WCAG 2.x AA at edit time on every token pair actually in use, with APCA shown as a secondary readout. Surface as a non-blocking inline warning on the offending control, and as a **publish-blocking** item in Operations → Check. This matches the existing principle: "Save should almost always work; publish or review can be blocked by critical issues." The 2026-08-13 audit already called for exactly this — "custom colors need automatic contrast checks before accepting or publishing a palette."

Note that this is uncontested ground: Webflow's Audit panel — the best analogue anywhere — does not check contrast, and no DAP theme editor surfaces live WCAG warnings at all.

### 7.3 Predictive layout QA (the empty lane)

Nobody ships this. You already own the placement math, which means the marginal cost is low and the differentiation is high.

Before publish, simulate every step's card against the captured target geometry at 375 / 768 / 1280 / 1920, in RTL, and with the longest available locale string, and report:

- card overflows the viewport
- card occludes its own target
- placement flips to an unintended side
- text overflows at the longest locale
- target falls below the fold with no scroll-into-view
- tap targets under 44×44 CSS px (already an existing requirement)

Each finding gets a jump-to-element action that selects the step and opens the section that fixes it — the Webflow Audit affordance. This is what turns a report into a workflow.

### 7.4 AI copy assist

Two surfaces, both narrow on purpose.

- **Inline rewrite verbs** on a text selection in the toolbar's `AI` control: *Shorter · Clearer · More formal · Friendlier · Fix grammar*. Scribe's verb set is the proven one and it is cheap to build with a high perceived value. Scoped to the selection, never the document.
- **Draft this step** — generate a first draft of a step's copy from the target's accessible name, role, and immediate surrounding text. Not from a screenshot: the accessible tree is smaller, cheaper, more accurate, and does not require shipping page pixels anywhere. This also has a nice second-order effect — steps whose targets have poor accessible names produce poor drafts, which is a quiet accessibility nudge.

**Guardrail**, from Webflow's AI Assistant, which has the best-designed constraints in this space: AI may create new content and new styles, but **may never mutate existing theme tokens or named styles**. And it needs two distinct undos — one that reverses the AI step within the panel, and `⌘Z` which removes the generated content entirely.

### 7.5 In-canvas AI command

One prompt affordance, opened from a visible `Ask Lodariq` row in the inspector and an `AI` control in the toolbar (`⌘K` mirrors both). The interaction loop is Supademo's, which is the cleanest shipped example: **preview → accept / reject / refine / undo**. Never apply-then-explain.

Scope discipline matters more than capability here. `⌘K` on a step edits that step. `⌘K` in Operations → Batch can edit many, but every batch operation shows a diff and requires an explicit confirm — Supademo puts "every change behind your approval" and that is the right default for anything that touches more than one object.

### 7.6 AI translation

Per ADR-0018, locale variants are already a first-class concept. The interaction model to copy is Navattic's, which is the best in the category:

- Locale list in Operations → Language. Add a locale, AI produces **drafts** in the builder for human refinement — never auto-published translations.
- **Targets are shared across locales by default**; only text varies. Per-locale target overrides exist for the case where the localized UI genuinely differs, and are resolved at publish time rather than requiring manual sync.
- Placement verification state is per locale (already in `ux-revamp.md`), and the Check report groups untranslated and unverified-in-locale items together.

### 7.7 AI narration / voice

Worth building, but scoped carefully — Lodariq's types are tours, announcements and hotspots, not screen-recorded video demos, so narration serves two purposes: **showcase/demo playback** and **accessibility**.

**UX**, following Supademo's design, which gets the one thing right that matters most:

- **The narration script is a separate field from the on-screen copy.** Text that reads well in a tooltip reads badly aloud. Decoupling these is the single most important decision in the feature. Provide a `Sync from step text` bulk action for authors who don't want to write twice.
- Language is **inferred from the script**, and the voice list filters to it. This eliminates the classic Spanish-text-English-voice bug that comes from making language a separate picker.
- Voice picker is a preview-in-place list with gender/accent facets; switch and regenerate at any time.
- Prosody is shaped by punctuation and sentence structure rather than by exposed SSML sliders. Ship pronunciation overrides for product names as a per-workspace lexicon — that is the one thing creators genuinely need and no slider provides.
- Cloned voice is a separate, gated capability, not a default.

**Engineering notes.** This is batch generation, not conversational, so time-to-first-audio is irrelevant — do not pay for the 40ms tier. Optimize for quality per character and multilingual coverage. Rough economics: a 12-step tour at ~200 chars/step is ~2,400 characters, which is about $0.04 on OpenAI TTS-1 and under $0.10 on the premium tiers. The cost that matters is not generation, it is **regeneration churn** — cache by hash of `(script_text, voice_id, model, speed)` and regenerate only dirty steps. Avatar video is 20–100× more expensive (HeyGen publishes $1–5/minute) and should be considered out of scope until there is demand.

**Release implication, and this one needs an ADR amendment.** Audio assets must be part of the immutable publication artifact so that preview and production play identical audio, exactly as the theme snapshot is embedded today (ADR-0014). Given your current 5 MiB per-asset ceiling and the note that "increasing the production video limit requires a streaming/object-storage upload design," narration audio will force that design sooner than video will. Plan for object storage with content-addressed audio referenced by hash from the artifact, rather than inlined.

### 7.8 Explicitly not recommended

- **AI that auto-applies anything to a live release.** ADR-0014 forbids it and the principle "drift creates reviewable repair proposals; they never mutate a live release automatically" is right.
- **AI-generated selectors or targeting.** ADR-0016's evidence gates are the product. An LLM guessing a selector is strictly worse and would undermine the moat.
- **A general chat assistant in the chrome.** Every AI feature above is anchored to a selection or a section. An unanchored chat box is where scope discipline goes to die, and it re-creates the "editor/debugger hybrid" feeling the archive doc identified as the original sin.

---

## 8. Mechanics that must be fixed for any of this to feel good

### 8.1 Transactional mutation queue (audit #1)

The audit found that "rapid background, text, and border colour changes acknowledged each click but overwrote one another while pending," and that each property persisted only when changes were separated by a debounce interval. **Debounce is not a correctness mechanism** and using it as one is why the bug exists.

The fix:

- Every edit is a **command** with a target path, a value, and a monotonic sequence number.
- Optimistic local application, immediately, always.
- **One in-flight write per document.** Commands queue behind it.
- **Coalesce by path** while queued — three background-colour changes collapse to the last one, but a background change and a border change both survive. Last-writer-wins per path, never per document.
- On failure: retry with backoff, then surface `Retry` in the mode pill with the specific failed property named. Never a generic failure — the ux-revamp principle "never show a generic `Publish failed` when Lodariq knows the operation stage" applies to saves too.
- The existing 300ms debounce on canonical change delivery from Lexical stays — that is a transport optimization and it is fine. It just must not be load-bearing for correctness.

### 8.2 Save, draft, and publish semantics

Amplitude's model is the right one and it prevents the most common category trap: post-publish edits become **unpublished drafts** until you explicitly re-publish. Combined with ADR-0014's immutable artifacts, the state model is:

`Draft` → `Published to staging (artifact #n)` → `Verified (bound to #n)` → `Promoted to production (#n reused)`

Editing a published document creates a new draft; the live artifact is untouched. The mode pill shows draft-diverged state as a dot on the environment chip. **Resolves the ux-revamp open question about a manual `Save as version` control: it isn't needed.** Immutable artifacts already are versions; a second, creator-facing versioning concept would be two models of the same thing and would confuse the release story. Recovery already covers the "I want to go back" need.

### 8.3 Rendering surface parity

`rich-content-authoring.md` names three surfaces that must agree: "the rich editor, the authored canvas popup, and the framework-free runtime popup." Three implementations of the same visual is a permanent drift generator, and it is the mechanism behind the audit's chrome-collision findings.

The locked spec already points at the fix — the runtime `TourPlayer` keeps geometry while the overlay iframe is the visible editor. Push that further: **the authored canvas popup should not exist as a third renderer.** The editor renders content; the runtime renders the container, geometry and theme; the editor's output is composited into the runtime's container. Two surfaces, one geometry authority. This also makes §7.3's predictive QA meaningful, because the thing being simulated is the thing that ships.

### 8.4 Activation reliability

ADR-0015's PKCE popup flow inherits Pendo's documented failure tail. Design for it explicitly rather than discovering it in support:

- **Popup blocked** — the most common one. The activation click must be the direct, synchronous result of a user gesture. If the popup is still blocked, fall back to same-tab redirect with a return URL rather than showing an error.
- **App redirects mid-activation** — persist the pending activation intent keyed by origin so the flow resumes after the host app's own navigation.
- **Third-party storage restrictions / Safari ITP** — the credential-free iframe design already helps here, but the activation handoff needs a same-origin path that does not depend on third-party storage.
- **Diagnosis surface** — a single `Why didn't authoring open?` state naming the specific stage that failed, in the launcher itself. Chameleon's environment/user transparency is praised for exactly this reason.

---

## 9. Control map

Read this as the **primary column** — the visible control is the design. The accelerator column exists so that a creator who builds forty tours a quarter can go faster, and it is discovered by reading the shortcut printed next to the control in its tooltip or menu row. **No creator ever needs to know the third column exists.**

| Action | Visible control (primary) | Accelerator (optional) |
|---|---|---|
| Open authoring | Launcher, or `Open in product` from the dashboard | `⌘⇧L` (existing entry gesture) |
| Reach another screen of my app | **Editing ⇄ Browsing** switch in the pill | hold `Space` |
| Point a step at something | Automatic on step creation; `Change target` button in the inspector and on the target outline | — |
| Select a bigger/smaller element | Clickable breadcrumb + `Pick bigger` / `Pick smaller` buttons | `↑` `↓` |
| Keep a menu open while picking | Automatic freeze + `Freeze page` button | — |
| Pick something under an overlay | Disambiguation chooser | — |
| Preview | `Preview` button in the pill | `P` |
| Edit what I'm previewing | `Edit this step` on the preview bar | `⌘E` |
| Configure the selected thing | `⋯` on the object | `⌘/` |
| Reuse a style | `Copy style` / `Paste style` / `Apply to…` rows in the inspector's style menu | `⌘⌥C` / `⌘⌥V` |
| Get chrome out of the way | Automatic avoidance; `Move` / `Hide` on each surface | hold `\` |
| Hide everything | `Hide all panels` in the pill menu | `⌘⇧\` |
| Ask AI | `AI` control in the toolbar / `Ask Lodariq` in the inspector | `⌘K` |
| Move between steps | Filmstrip click | `←` `→` |
| Nudge geometry | Drag the frame | Arrow keys |
| Reset size | `Reset` in the inspector | `Home` (existing) |
| Operations | `⌄` menu in the pill | `⌘O` |
| Back out | `Cancel` / `Close` buttons; click-outside | `Esc` |

Three rules that keep this honest:

1. **Every row's primary column must be reachable without prior knowledge.** If a control is only in a menu the creator has no reason to open, it fails.
2. **Shortcuts are shown, never taught.** Print the accelerator on the right edge of the menu row or in the control's tooltip — Gmail's and Figma's model. There is no shortcut-memorization onboarding step, and `?` opening a cheat sheet is a convenience for the 2%, not a plan for the 98%.
3. **The zero-keyboard completion test (§3.1a) gates release.** Build a six-step tour with a pointer only. If any step requires a keystroke, that's a bug.

### 9.1 Keyboard operability (separate obligation, unchanged)

This is not the same thing as shortcuts and is not optional. Requirements from `ux-revamp.md` carry forward in full: 44×44 CSS px minimum targets, hover never required and never activating, Enter/Space pins, drag requires a handle plus a movement threshold and suppresses the activation click, keyboard reorder with position announcement and Escape restore, connector lines decorative with meaning carried in text, preview entry and exit announced.

Additions: the inspector is a focus-trapped popover with `Esc` to dismiss and focus restoration to its anchor; the picker announces the hovered element's accessible name and live match count; the Editing/Browsing switch is a labelled two-state control operable by Enter/Space and announced on change; and every visible control in the §9 table is in the tab order with a real accessible name.

### 9.2 Validating this rather than asserting it

You already have `docs/plans/phase-0-usability-test-script.md` and a phase-2 test plan. The pointer-first claim is the thing most worth putting in front of real creators, because it is easy to believe and easy to get wrong.

Suggested task set, five PMMs, no training, think-aloud, pointer-only instruction withheld:

1. Build a three-step tour where step 2 is on a screen you have to navigate to. *Measures: does the Editing/Browsing switch get found without prompting?*
2. Point a step at an item inside a dropdown menu. *Measures: does automatic freeze work, or do they give up?*
3. Make step 3 look like step 1. *Measures: is style reuse discoverable, or do they re-set every property?*
4. Change the target of step 2 after the fact. *Measures: is `Change target` where they look?*
5. Publish to staging and verify. *Measures: does Operations read as "still in my product" or as "I left"?*

Success bar: all five tasks completed with a pointer only, and no participant asks about or reaches for a keyboard shortcut. If task 1 fails, the switch is in the wrong place or wrongly labelled — that is the highest-risk single element in this spec.

---

## 10. How this maps to the documented gaps

| Documented gap | Where it lands |
|---|---|
| Popup tray (action layout / alignment / gap) | Inspector → Actions; layout becomes drag-to-join (§4.2) |
| Placement tray | Compass (Tier 1) + Inspector → Placement |
| Under-canvas property tray (buttons, fields) | Inspector, first section keyed to selection (§4.3) |
| Per-step appearance overrides | Inspector → Style, with override indicators (§4.3, §6.2) |
| Operations modal never specced | §4.6 |
| No reusable styling (audit #5) | §6.2 — copy/paste style, Apply to…, named styles, update-original |
| Chrome collision (audit #3, #4) | §3.4 — layer manager, reserved rect, auto-avoidance, visible Move/Hide; header deleted |
| Mutation races (audit #1) | §8.1 — command queue |
| Misleading preview progress (audit #6) | §4.1, §4.7 — bound to runtime step |
| Context-aware target verification (audit #2) | §4.4 — three states + approach recipes |
| Chrome-aware true-user preview (audit #3) | §4.7 |
| Theme snapshot staleness | §6.3 |
| Announcement default (open decision) | §5 — edge-drag decides the form |
| Survey start (open decision) | §5 — CSAT on canvas immediately, templates demoted |
| Manual `Save as version` (open decision) | §8.2 — not needed |
| Doc contradiction: trays present vs no panel | Must be reconciled before implementation (§2) |

---

## 11. Sequencing

Ordered by ratio of unblocking-value to cost. Each slice is independently shippable.

**Slice A — make the current build honest.**
Command queue (§8.1). Delete the minimized header, move state to the mode pill bound to the runtime step (§4.1, §4.7). Reconcile `rich-content-authoring.md` with `authoring-free-shell.md`. Theme snapshot versioning or an explicit stale state (§6.3).
*Unblocks everything; fixes three of six audit findings.*

**Slice B — the inspector.**
Build the anchored popover with collision handling and the section model. Migrate the popup, placement and property trays into it. Add the layer manager, peek and collapse (§3.4, §4.3).
*This is the slice that closes the panel→page migration. Nothing else should ship before it.*

**Slice C — style reuse.**
Filmstrip multi-select, copy/paste style, `Apply to…`, named step styles, override indicators and the four override actions (§6.2).
*Highest creator-visible payoff per unit of work in the whole plan.*

**Slice D — targeting made legible.**
Three verification states, hover card with match count, ancestor breadcrumb, DevTools modifiers, plain-language disambiguation, approach recipes (§4.4).
*Turns your strongest engineering asset into a visible product advantage.*

**Slice E — Operations.**
Map, Appearance, Language, Batch, Check, Release, Recovery (§4.6). The Editing/Browsing switch (§3.3) and the control map (§9).
*Completes the "never leave the page" claim.*

The Editing/Browsing switch is small and unblocks the most friction of anything in this plan — if it can be pulled forward into Slice A or B, it should be.

**Slice F — AI layer, in order.**
Brand theme generation and the contrast gate (§7.1, §7.2) → predictive QA (§7.3) → copy assist (§7.4) → `⌘K` command (§7.5) → translation (§7.6) → narration (§7.7, gated on the object-storage design).

**Slice G — other types.**
Announcement and hotspot on the shared overlay kernel, then survey, then checklist (§5).

**Slice H — concurrency.**
Presence, then step-level soft locks, then cross-creator CAS and the conflict chooser (§15). Gated on resolving the session-lifetime question (§15.4) first.
*Order matters: presence alone removes most conflicts, and shipping it early tells you whether locking is even needed at your customers' team sizes.*

---

## 12. Constraint compliance

| Constraint | Status |
|---|---|
| ADR-0004 editor boundary (Lexical confined; canonical `LodariqBlock`; stable IDs from `editor/ids.ts`) | Respected. The inspector is authoring chrome, not an editor node; it emits canonical values. |
| Runtime/authoring split; no React or Lexical in `lodariq-tour` | Respected. All new surfaces live in `sdk-authoring` / the editor iframe. §8.3 *reduces* runtime surface area. |
| ADR-0003 server-side publication compilation | Respected. Predictive QA (§7.3) is preview-only analysis and must not become a compile step. |
| ADR-0013 safe brand system; never persist raw CSS/selectors/DOM | Respected, and §6.1's no-CSS-escape-hatch stance strengthens it. §7.1 sampling is authoring-only; only semantic tokens persist. |
| ADR-0014 immutable artifacts, pointer CAS, no side-effect publishing | Respected. §8.2 aligns the creator-facing state model to it. **§7.7 requires an amendment** for content-addressed audio assets in the artifact. |
| ADR-0015 credential model, exact-origin bridge, semantic batched messages, production rejected | Respected. §8.4 hardens activation without changing the model. Inspector state changes are semantic commits, not keystroke streams. |
| ADR-0016 target identity v2; no selector/fingerprint exposure; coordinates diagnostic only | Respected. §4.4 exposes only accessible name, role, match count and plain-language evidence. Approach recipes are semantic conditions, not timers or coordinates. |
| ADR-0018 localization boundaries | Respected. §7.6 keeps targets shared, text per-locale, resolution at publish. |
| ux-revamp: no backdrop, page resize, full-width bar, or permanent rail blocking the product | Respected — with the standing constraint that the mode pill must never grow into a rail (§3.2). |
| ux-revamp accessibility contract | Carried forward in full, extended in §9.1. |
| Non-developer creator ("usable without onboarding, CSS, or release training") | §3.1a pointer-first rule and the §9 control map exist to enforce this. Keyboard shortcuts are accelerators only; the zero-keyboard completion test gates release. |

Four items need explicit decisions before implementation:

1. **ADR-0014 amendment** for narration audio as content-addressed artifact assets, which forces the object-storage design earlier than video would.
2. **Reconciliation** of `rich-content-authoring.md` and `authoring-free-shell.md`, which currently describe incompatible surfaces and are both treated as current.
3. **New ADR on concurrency** (§15) recording that CRDT co-editing is ruled out on schema grounds, and specifying presence, step-level soft locks, and cross-creator CAS.
4. **Session lifetime vs. edit duration** (§15.4). The 10–15 minute non-refreshable authoring session predates locking and predates long-form rich content; it needs revisiting before concurrency work, not during it.

A fifth, if production authoring is ever pursued: an ADR separating *render origin* from *owning environment* (§14.4). That is a real change to ADR-0015's scoping tuple and should not be attempted as a config flag.

---

## 13. Risks

- **The inspector becomes the panel again.** The failure mode is real: sections accrete, someone pins it open "for convenience," and in six months it is a 320px permanent sidebar. Mitigation: hard rule that the inspector has no pinned state, no persistence across selection changes, and a maximum of six sections per selection type. Enforce it in review.
- **Predictive QA that cries wolf.** A report with fifteen items that are mostly fine trains creators to ignore it, which is worse than no report. Ship it warning-only for one release, measure the accept rate per rule, and only promote rules to publish-blocking once they clear a precision bar.
- **Brand generation that produces something slightly wrong.** A theme that is 90% right is more irritating than one that is obviously generic, because it reads as a near-miss of your brand. Mitigation: always ship `Start plain` as a third, equal option, and make the token editor good enough that fixing the 10% takes under a minute.
- **Browsing mode losing state.** If ghosting the chrome and clicking through the app ever loses the creator's selection or scroll position, the feature is worse than the two-click workaround. It needs a real state snapshot, not a re-render.
- **Shortcut creep.** The failure mode is gradual: a control is hard to place, someone ships the shortcut first "and we'll add the button later," and the button never arrives. Six months on there are nine keyboard-only capabilities and the product has quietly become a developer tool. Mitigation: the zero-keyboard completion test (§3.1a) runs every release, and no PR may introduce a shortcut whose primary visible control does not already exist in the same PR.
- **Automatic behaviours that surprise.** Page freeze and chrome auto-avoidance both act without being asked. Unannounced automation reads as a bug. Each must state what it did in one plain sentence with an immediate undo — *"Page frozen so this menu stays open. `[Unfreeze]`"* — and never act silently.
- **Approach recipes over-fitting.** Recording how the creator got somewhere can capture incidental steps. The recipe must be editable, replayable and trimmable from the first version, not a black box.

---

## 14. Environments, visibility and blast radius

### 14.1 Where things stand today

ADR-0015 rejects production independently at every layer — config, bootstrap, API, repository, loader and bundle gates — and returns `{ state: 'disabled' }`. **Today the answer to "what if a customer authors in production" is: they cannot.** That is a defensible position and this section does not propose changing it casually. But it is worth being clear-eyed: Pendo, Appcues, Chameleon and Whatfix all author against production, many customers have no staging environment that resembles their real app, and "production is disabled" with no explanation is the kind of thing that loses a deal in the first demo. So the question is not *whether* to think about it, but *what the safe shape is*.

### 14.2 Draft visibility: unreachable, not hidden

For the direct question — *would an unpublished draft show up in another user's session?* — the answer is no, and the mechanism matters more than the answer:

- An end user's runtime loader resolves **only the environment's published release pointer** (ADR-0014). There is no code path from a visitor's loader to draft content.
- Draft content is resolvable **only** with an authoring-session bearer, which per ADR-0015 is scoped to `workspace + environment + document + creator + exact customer origin`, lives 10–15 minutes, is memory-only, and cannot be read by the host page.
- Preview compiles in the browser and is preview-only (ADR-0003). Previewing must never write an artifact or move a pointer.

The design principle to hold onto, and to write into the tests:

> **Draft isolation is achieved by non-resolvability, never by a visibility filter on a shared fetch.**

A visibility flag is a thing that can be wrong — one bad boolean and a half-finished tour is in front of every customer. No path at all cannot be wrong. Any future feature that would require the runtime to fetch drafts and filter them (a "preview for teammates" link, for instance) must instead mint a scoped bearer, not add a flag.

### 14.3 The real production risk is not visibility

If production authoring is ever enabled, the dangerous failure modes are elsewhere, and one of them is not about Lodariq at all:

1. **Side effects on real data.** To author, the creator clicks through their own app. In production that app operates on real customer records. Positioning step 4 near a `Delete project` button and clicking it deletes a real project. **Browsing mode (§3.3) makes this materially worse**, because its entire purpose is to pass clicks to the product. This is the strongest argument for the current lockout and it deserves to be stated in those terms rather than as a generic safety posture.
2. **Analytics pollution.** The author's own click-throughs generate real product events. `PROGRESS.md` already lists analytics isolation as later work — it is a **prerequisite** for production authoring, not an enhancement.
3. **Accidental publish.** ADR-0014's CAS pointers, explicit capabilities and artifact reuse already make this hard. Production should additionally require a typed confirmation naming the experience, and the open question about "zero or one approval" (§ux-revamp open decisions) resolves to **one** for production.
4. **CSP and bundle weight.** Production apps commonly ship stricter CSP than staging, and `frame-src`/`connect-src` rules will block the editor iframe. This will present as "authoring just doesn't open" and needs the §8.4 diagnosis surface to name it specifically.

### 14.4 The intermediate worth considering

There is a middle option that gets most of the customer value without most of the blast radius, and I have not seen it in any competitor:

**Author *against* production, own the document in staging.** The creator opens authoring on their production origin — real screens, real data, real targets — but the document belongs to the staging environment and can only publish there. Promotion to production still goes through the normal ADR-0014 path. Targets captured against production resolve correctly because they are captured against the real thing, which is precisely the "my staging doesn't look like my app" complaint.

The honest cost: this separates *which origin am I rendering over* from *which environment owns this document*, and ADR-0015's scoping tuple currently fuses them. That is a real ADR change, not a config toggle, and it needs its own decision record. It also does nothing about risk #1 — clicking through production still touches real data — so it would ship with the persistent production banner and a per-session confirmation on Browsing mode regardless.

**Recommendation:** keep the lockout for now; replace the bare `{ state: 'disabled' }` with a product surface that explains why and states the path (`Authoring runs on staging. Here's how to point Lodariq at a staging environment · Why not production?`). A dead end that explains itself converts; a dead end that doesn't, churns.

---

## 15. Concurrent creators

### 15.1 Do not build real-time co-editing

The instinct for "two people in the same tour" is Figma-style multiplayer, which in a Lexical editor means Yjs. **That is architecturally incompatible with your schema and should be ruled out explicitly rather than discovered in sprint three.**

A CRDT model requires the merge structure (the `Y.Doc`) to be the durable source of truth, or at minimum a persisted shadow that survives disconnection. ADR-0004 and the schema contract say documents contain canonical `LodariqBlock` JSON and **never Lexical state**; ADR-0003 says publication artifacts compile server-side from that canonical JSON. Persisting CRDT state would either violate that boundary or create a second source of truth that has to be reconciled with the first — which is the same class of bug as the three-renderer problem in §8.3, but with data loss as the failure mode instead of visual drift.

There is also a product argument: tours are **step-partitioned by construction**. Two PMMs almost never need to type in the same paragraph. They need to not overwrite each other and to know the other one is there. Step-level coordination delivers nearly all of the value of multiplayer at a small fraction of the cost and risk.

### 15.2 Three layers of coordination

**Layer 1 — Presence (always on).** Small avatars on filmstrip items showing who is on which step, and a chip in the mode pill (`2 people here`). This is cheap and prevents most conflicts socially before any locking logic engages. It needs no new identity work: the authoring-session bearer is already scoped per creator per document per environment, so the set of live sessions on a document is already known server-side.

**Layer 2 — Step-level soft lock.** Acquired on selection, heartbeated, released on deselect or ~90s after the last edit.

- The other creator can **open and read** the step — the card renders read-only, with a green ring and `Dina is editing this step`.
- **`Ask for it`** pings the holder rather than forcing a takeover.
- Workspace admins can force-release, and the action is recorded.
- Soft, not hard: a lock that survives a closed laptop is worse than no lock. Heartbeat expiry is the release mechanism, not an explicit unlock action.

**Layer 3 — Document-scoped mutations need more than a step lock.** Theme changes, step reordering, batch operations and adding a locale touch the whole document and cannot be step-partitioned. Reordering is the nastiest — two concurrent reorders produce an order neither creator asked for. These take a short document-level lock for the duration of the operation (they are all fast), and the UI states it plainly: `Sami is reordering steps — one moment`.

**Release operations are already handled.** ADR-0014's compare-and-swap pointer state and append-only history are the correct guarantee at the dangerous end. The work is human-readable surfacing: not `409 Conflict`, but *"Sami published version 12 while you were reviewing version 11. `[See what changed]` `[Review version 12]`"*.

### 15.3 When a lock lapses anyway

Locks are advisory and will occasionally be bypassed — expiry during a slow edit, two tabs, a reconnect. So the write path needs its own guarantee:

- Every step carries a version. The §8.1 command queue does per-path last-writer-wins **within one creator's session**; across creators it must attach the base version and **fail CAS rather than overwrite**.
- On CAS failure, surface a choice — `Keep mine` / `Keep theirs` / `Open both side by side` — and never silently merge block trees. Auto-merging two rich-content documents is how you lose a paragraph and never find out.
- The losing creator's work is preserved as a draft snapshot regardless of which button they press.

### 15.4 A latent issue this exposes

ADR-0015 gives the authoring session a 10–15 minute lifetime with **no refresh token**. A creator writing a six-step tour will routinely exceed that. Combined with locking, three things have to be true and none of them are specified today:

1. Session expiry must **release that creator's locks**, or a lapsed session holds a step hostage for 90s past every timeout.
2. Expiry must not silently drop queued commands. The queue holds, the pill shows `Reconnecting…`, and re-activation flushes it. Silent expiry mid-edit is data loss wearing a permissions costume.
3. Re-activation must not require the full PKCE popup dance every 15 minutes — that is a context switch by any other name, and it is the exact thing this whole document exists to eliminate.

This is worth resolving before concurrency work rather than during it, because the fix probably changes the session model.

---

## 16. Sources

**Competitor authoring models** — Pendo Visual Design Studio ([announcement](https://www.pendo.io/pendo-blog/introducing-pendo-visual-design-studio-bringing-power-app-guides-everyone/), [guide designers](https://support.pendo.io/hc/en-us/articles/27240831152923-Guide-designers), [launch troubleshooting](https://adoptpartners.pendo.io/hc/en-us/articles/360046030611-Help-Launching-the-Visual-Design-Studio)) · Appcues ([builder](https://docs.appcues.com/en_US/appcues-builder/how-to-use-the-appcues-builder), [CSS selectors](https://docs.appcues.com/user-experiences-troubleshooting/css-selectors), [themes](https://docs.appcues.com/user-experiences-customization/new-themes-and-advanced-styling)) · WalkMe ([editor install](https://support.walkme.com/knowledge-base/how-to-install-the-walkme-editor/), [jQuery selectors](https://support.walkme.com/knowledge-base/jquery-selectors/)) · Whatfix ([editor](https://support.whatfix.com/docs/editor), [dropdown selection](https://support.whatfix.com/docs/unable-to-select-an-element-in-a-drop-down-menu)) · Userpilot ([element detection](https://docs.userpilot.com/article/173-detecting-and-displaying-the-right-element)) · Chameleon ([extension](https://help.chameleon.io/en/articles/1204283-what-does-the-chameleon-chrome-extension-do), [custom CSS](https://help.chameleon.io/en/articles/3338736-using-custom-css-to-style-experiences), [styling overview](https://help.chameleon.io/en/articles/5883579-styling-overview)) · UserGuiding ([guides](https://help.userguiding.com/en/articles/3305966-creating-guides)) · Intercom ([tour design](https://www.intercom.com/help/en/articles/2900887-design-your-product-tour), [CSS targeting](https://www.intercom.com/help/en/articles/2901138-edit-css-to-point-your-tour-at-the-right-website-elements)) · Userflow ([auto element selection](https://www.userflow.com/blog/auto-element-selection), [tooltip selection](https://help.userflow.com/docs/tooltip-element-selection)) · Usetiful ([element selection](https://help.usetiful.com/support/solutions/articles/77000197925-select-element-on-your-page)) · Product Fruits ([targeting](https://help.productfruits.com/en/article/selecting-and-targeting-elements), [unbreakable tours](https://productfruits.com/blog/building-unbreakable-product-tours)) · Amplitude/Command AI ([testing](https://amplitude.com/docs/guides-and-surveys/testing)) · Inline Manual ([builder migration](https://support.inlinemanual.com/support/solutions/articles/80001163710-migrating-from-authoring-tool-to-builder)) · Pendo reviews ([userguiding](https://userguiding.com/blog/pendo-reviews)), WalkMe reviews ([userguiding](https://userguiding.com/blog/walkme-reviews))

**Interactive demo tools** — Storylane ([HTML demos](https://docs.storylane.io/recording-demos/recording-html-demos), [AI demo creation](https://docs.storylane.io/editing-demos/ai-demo-creation)) · Navattic ([captures](https://docs.navattic.com/build/captures/web), [capture editor](https://www.navattic.com/blog/four-ways-to-use-navattic-s-capture-editor), [multilingual](https://docs.navattic.com/demos/multilingual)) · Arcade ([record](https://docs.arcade.software/kb/build/interactive-demo/record), [AI voice](https://www.arcade.software/post/ai-voice-for-product-demos)) · Supademo ([voiceovers](https://docs.supademo.com/customize/voiceovers/instant-ai-voiceover), [Jan 2026](https://supademo.com/blog/product-update-jan-recap), [July 2026](https://supademo.com/blog/product-update-july-recap)) · Guideflow ([AI](https://www.guideflow.com/features/ai), [AI voiceover](https://docs.guideflow.com/help/ai/ai-voiceover)) · Reprise ([capture comparison](https://reprise.zendesk.com/hc/en-us/articles/13627467845147-Replay-HTML-Capture-vs-Replicate-Application-Capture-vs-Reveal-Overlay)) · Walnut ([interactions](https://help.walnut.io/help/demos/capture/interactions)) · Demostack ([cloner](https://www.demostack.com/cloner)) · Tourial ([workflow capture](https://www.tourial.com/blog/chrome-extension-workflow-capture)) · [cross-tool comparison](https://www.howdygo.com/blog/interactive-product-demo-comparison)

**Analogue patterns** — [Webflow intro](https://help.webflow.com/hc/en-us/articles/33961260162323-Intro-to-Webflow) · [Webflow variables](https://webflow.com/webflow-way/design-systems/variables) · [Webflow AI Assistant](https://help.webflow.com/hc/en-us/articles/34205154436243-Modify-page-designs-with-the-Webflow-AI-Assistant) · [Webflow Audit panel](https://help.webflow.com/hc/en-us/articles/33961313088531-Intro-to-the-Audit-panel) · [Chrome DevTools inspect mode](https://developer.chrome.com/docs/devtools/inspect-mode) · [DevTools element badges](https://developer.chrome.com/docs/devtools/elements/badges) · [Shopify theme editor](https://shopify.dev/docs/storefronts/themes/tools/online-editor) · [Shopify input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings) · [Figma navigation](https://help.figma.com/hc/en-us/articles/360039831974-Explore-the-navigation-bar-and-left-sidebar) · [Builder.io Fusion extension](https://www.builder.io/c/docs/fusion-chrome-extension) · [Inplace editor pattern](https://ui-patterns.com/patterns/InplaceEditor)

**Colour, contrast, brand extraction** — [Material Color Utilities](https://github.com/material-foundation/material-color-utilities/) · [Adobe Leonardo](https://github.com/adobe/leonardo) · [APCA](https://git.apcacontrast.com/documentation/WhyAPCA.html) · [context.dev styleguide API](https://docs.context.dev/api-reference/screenshot-styleguide/extract-design-system-and-styleguide-from-website) · [Brandfetch Brand API](https://docs.brandfetch.com/brand-api/overview) · [programmatic brand extraction](https://dzone.com/articles/programmatic-brand-extraction-assets-url) · [Relume style guide builder](https://www.relume.ai/resources/docs/concept-creation-using-the-relume-style-guide-builder)

**AI voice / generation** — [HeyGen API pricing](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained) · [TTS provider comparison 2026](https://futureagi.com/blog/best-text-to-speech-providers-2026/) · [Scribe AI](https://scribe.com/library/scribe-ai) · [Loom AI features](https://support.atlassian.com/loom/docs/loom-ai-features/) · [Guidde](https://www.guidde.com/)
