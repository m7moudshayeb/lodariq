# Lodariq authoring showcase audit

Date: 2026-08-13

## Audit scope

This audit covers authoring and replaying a six-step interactive Tour in the local fixture app. The experience uses passive progression, rich list content, click-target actions, a modal handoff, a route transition, a marker-free semantic target, custom placement, and per-step appearance overrides.

The authored experience is named **The Acme Momentum Tour**.

## Flow

### 1. Welcome to your command center — Healthy

The opening anchors to the Active projects card and uses a high-contrast emerald presentation with a large centered heading.

![Welcome step](./01-welcome.png)

### 2. Find the work that needs you — Healthy

The second step targets Needs attention, moves above the target, and adds a three-item decision checklist. The list remains readable and the target relationship is clear.

![Portfolio signal step](./02-portfolio-signal.png)

### 3. Bring the backlog with you — Healthy

The coral action step targets Import. Its button uses `clickTarget`, opens the product modal, and advances without losing the tour.

![Import action step](./03-import-action.png)

### 4. Review before you commit — Working, verification caveat

The Tour successfully follows the newly opened modal and targets its Close action. Clicking the Tour CTA closes the product modal and advances. The authoring UI still labels this transient target as Unverified even though the replay succeeds repeatedly.

![Modal review step](./04-review-modal.png)

### 5. Move from overview to execution — Healthy in user preview

The right-positioned card targets the Projects navigation item. Activating it changes the fixture route and advances to the post-route step. In authoring preview, the minimized authoring header can overlap the card; true user preview renders it correctly.

![Route transition step](./05-project-route.png)

### 6. You are ready to create momentum — Healthy

The finale resolves the marker-free Create project action, presents a three-item playbook, and uses a deep-navy card with a coral border. Its click-target CTA activates the product control and completes the Tour.

![Creation finale](./06-create-finale.png)

## What works especially well

- Click-target actions create convincing product choreography: open a modal, close it, change routes, and activate a final control.
- Semantic targeting handled the marker-free Create project action and the Dashboard-to-Projects transition reliably during replay.
- Rich content is useful without becoming a separate page builder. Headings, paragraphs, lists, buttons, alignment, placement, padding, radius, borders, and shadows were enough to establish distinct visual beats.
- The runtime preserved focusable, labeled dialogs and buttons throughout the flow, and target outlines made the active product element easy to understand.

## Highest-impact issues and enhancements

### 1. Make authoring mutations transactional

Rapid background, text, and border color changes acknowledged each click but overwrote one another while pending. Each property persisted only when changes were separated by a debounce interval.

Enhancement: queue mutations by property or submit one atomic popup-style patch with a monotonic revision. Keep optimistic local state authoritative until the server or document store confirms the same revision. A visible Saving/Saved state should represent the whole style transaction.

### 2. Preserve verified target evidence across missing contexts

Selecting a step while its route or modal was absent downgraded its durable status from Verified to Unverified. Restoring the original route did not automatically restore the status; the target had to be selected again. The modal Close target remained Unverified even though it resolved and replayed successfully.

Enhancement: distinguish **Verified**, **Unavailable in current context**, and **Verification failed**. Preserve the last verified evidence until the target identity itself changes. For transient UI, store or infer a context recipe such as “click Import, wait for dialog, then resolve Close.”

### 3. Make preview chrome layout-aware

The minimized authoring header covered the top of a correctly positioned right-side Tour card. The same card rendered correctly in Preview as user.

Enhancement: reserve authoring-chrome bounds in the placement solver, or launch full preview in true-user mode automatically while keeping a small floating Return to editor control outside Tour geometry.

### 4. Automatically resolve authoring-surface collisions

The on-page Step controls could not be opened while the authoring popup overlapped them; the popup had to be minimized first. The content insertion menu also appeared non-responsive while button controls were active until those controls were explicitly closed.

Enhancement: when an author interacts with a covered on-page control, collapse or reposition the popup automatically. Opening an insertion trigger should close the current block toolbar and open the requested menu in one action.

### 5. Add reusable style and choreography tools

Creating six distinct cards required repeating alignment, padding, radius, palette, border, and shadow choices one step at a time.

Enhancement: add Copy style, Paste style, Apply to selected steps, and named step-style recipes. For interactions, add a visual sequence builder for “activate target → wait for modal/route/text → continue” instead of relying on implicit synchronous behavior.

### 6. Clarify progress during preview

The minimized authoring header displayed the editor's selected step rather than the visitor's current preview step. This could show “Step 6 of 6” while the visitor was viewing step 1.

Enhancement: label the mode explicitly and bind progress to the runtime preview, for example “Preview · 1 of 6.” Consider an optional visitor-facing progress indicator in the Tour card.

## Accessibility risks and evidence limits

- Custom colors need automatic contrast checks before accepting or publishing a palette. The screenshots alone do not establish contrast compliance for every state.
- The visible dialog, heading, button labels, target outlines, and focus styling are strong signals, but screenshots cannot verify screen-reader announcements, full keyboard order, Escape behavior, focus restoration, reduced-motion handling, or zoom/reflow at smaller viewports.
- Modal-plus-Tour layering worked visually, but it should be tested with assistive technology to confirm that only the intended active dialog is exposed and that focus does not escape behind the modal.

## Recommended order

1. Transactional mutation queue for related authoring changes.
2. Context-aware target verification and lifecycle recipes.
3. Chrome-aware true-user preview behavior.
4. Automatic panel collision handling.
5. Reusable step styles, action choreography, and clearer progress.
