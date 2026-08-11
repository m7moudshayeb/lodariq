# Lodariq Contextual Canvas Design QA

- Date: 2026-08-11
- Scope: freeform CTA manipulation, popup dismissal, selected-element toolbar focus, prominent link behavior, draggable and four-corner-resizable popup geometry, top-left zoom, and explicit detailed-tray disclosure
- Source visual truth: `/Users/mahmoudshayeb/.codex/generated_images/019ff084-5e39-7a41-bb3e-2af45c5874dc/exec-aa8d7a0a-d395-47ba-b526-ddda09413b7f.png`
- Current-state reference: `/var/folders/p4/q0cck1cd3yxb9jzgp1b3lt140000gn/T/TemporaryItems/NSIRD_screencaptureui_aEUobW/Screenshot 2026-08-11 at 6.56.39 PM.png`
- Standard action implementation: `docs/product-design/implementation-captures/contextual-toolbar-canvas-final.png`
- Standard detailed-tray implementation: `docs/product-design/implementation-captures/contextual-toolbar-tray-final.png`
- Standard text implementation: `docs/product-design/implementation-captures/text-toolbar-canvas-final.png`
- Compact action implementation: `docs/product-design/implementation-captures/contextual-toolbar-compact-action-final.png`
- Draggable popup implementation: `docs/product-design/implementation-captures/draggable-popup-final.jpg`
- Combined comparison: `docs/product-design/implementation-captures/source-vs-draggable-popup-final.png`
- Freeform CTA implementation: `docs/product-design/implementation-captures/freeform-action-canvas-final.jpg`
- Link behavior implementation: `docs/product-design/implementation-captures/freeform-link-behavior-final.jpg`
- Final combined comparison: `docs/product-design/implementation-captures/source-vs-freeform-action-canvas-final.png`
- Popup corner-resize implementation: `docs/product-design/implementation-captures/popup-corner-resize-final.jpg`
- Popup resize comparison: `docs/product-design/implementation-captures/source-vs-popup-corner-resize-final.png`

## Comparison setup

- Source pixels: 1448 × 1086.
- Implementation pixels: 985 × 554 at the active in-app browser viewport and device scale factor 1.
- State: Welcome tour open at 80% canvas zoom. The action capture has Continue selected with horizontal CTA handles visible. The popup-resize capture has the popup itself selected at 368 × 276px with all four corner handles visible and the detailed tray closed. A focused capture separately verifies the link behavior destination.
- Density normalization: the source and implementation were proportionally contained in equal 1200 × 800 panels and inspected together in the final combined comparison. The implementation intentionally keeps the smaller Standard workspace requested after the source mock was generated.
- Brand normalization: the canvas popup uses the resolved customer Brand Theme, matching the popup actually rendered on the page. The source mock's white sample popup is treated as interaction/layout guidance rather than a replacement customer theme.

## Findings

No actionable P0, P1, or P2 issue remains in this scoped interaction.

- Spacing and layout rhythm: the canvas no longer reserves 160px above a vertically centered popup. It starts the popup after 72px of structured canvas space, leaving room for the anchored toolbar without losing the popup below the fold.
- Scroll ownership: natural-height popups remain fully expanded and scroll with the canvas. An explicitly resized height becomes a bounded popup viewport with internal overflow, matching the runtime surface without clipping or moving the four external corner handles.
- Zoom: canvas-local controls are pinned to the canvas's top-left corner and expose 60–120% zoom in 10-point steps, with an 80% fit-oriented default and one-click reset. Moving or scrolling canvas content does not move this control group.
- Popup positioning: a dedicated grip moves the complete popup on a 4px pointer grid, compensates for the active canvas zoom, and keeps the popup within the canvas/tool-dock bounds. Arrow keys move it in 8px steps; Home or a grip double-click resets it.
- Popup sizing: selecting the popup exposes four attached corner handles. Pointer movement is zoom-aware, snaps to the shared 4px grid, and supports simultaneous width/height resizing from every corner; keyboard arrows use 8px increments, while Home or double-click returns to the natural size.
- Popup fidelity: custom width and height are persisted as sanitized tooltip-layout values and applied through the same CSS sizing contract in both the authoring canvas and the page runtime. The live browser verified 368 × 276px on both surfaces and retained the size after reload.
- Context anchoring: both text and action toolbars are positioned from the selected row's live bounding box. The measured action toolbar remained about 10px above the selected action after the popup moved, matching the source's attached popover relationship.
- Selection focus: the button toolbar now contains only the selected-element identity, detailed-settings ellipsis, and close control. Duplicate behavior, width, alignment, color, and spacing controls were removed from this toolbar; their canonical controls remain in the detailed tray.
- Direct CTA sizing: selecting a button or link reveals start/end resize handles on the rendered action. Pointer movement uses a zoom-aware 4px grid with an 80–480px schema bound; keyboard resizing uses 8px increments, and Home or double-click returns to Hug.
- Link behavior: links retain one useful quick control because the destination is essential context. Opening it places the 36px destination input first, at the top of the popover, with its helper text and action pills beneath it.
- Dismissal: text, button, and link toolbars, quick-property popovers, content insertion, Placement, Popup, and detailed settings all have explicit close controls. The controlled link popover was hardened after live QA so its close control always updates the owning open state.
- Detailed disclosure: selecting a button or text block does not open the bottom tray. The selected element's ellipsis opens it; changing the selected block or entering Placement/Popup closes the content tray.
- Layering: the detailed tray is above the right tool dock, so its close control remains reachable at Standard and Compact widths.
- Responsive behavior: Standard retains labels and summaries; Compact preserves the same control order, collapses summaries to icons, keeps horizontal toolbar access, and leaves the persistent footer visible.
- Typography, colors, and visual tokens: the existing Lodariq type hierarchy, Editorial Air creator chrome, semantic selection blue, and customer Brand Theme variables remain authoritative.
- Button block surface: the surrounding action stage now computes to a transparent background with zero padding. The unwanted color came from a legacy `direct child span` chip selector; changing the structural wrapper to a `div` prevents that selector from styling the button container while preserving the actual Brand Theme button fill.
- Icons and assets: all controls use the existing Lucide-backed Lodariq design-system icons. No custom SVG, emoji, CSS illustration, or placeholder asset was introduced.
- Copy and accessibility: canvas zoom, text settings, button/link settings, direct CTA handles, all four popup resize corners, every popup close action, and the detailed tray have explicit accessible names and pressed/current state where applicable.

## Interaction verification

- Selected the heading and confirmed the text toolbar moved directly above it.
- Selected Continue and confirmed the action toolbar moved directly above the action, with the detailed tray absent.
- Confirmed button selection exposes only identity, More, Close, and the two direct resize handles—no duplicate Behavior, Alignment, Color, or Spacing controls.
- Resized Continue through the end handle with keyboard input and confirmed the schema/runtime custom-width path; pointer resizing is covered by the focused interaction test.
- Opened the detailed tray from `More button settings`, then closed it without changing the active Content dock mode.
- Opened the content insertion menu and confirmed its explicit Close control dismisses the menu.
- Selected a link, opened Link behavior, measured the visible Destination input at 35.9976px (the browser's device-rounded 36px), and closed the controlled popover successfully.
- Closed the selected button/link toolbars and confirmed both the toolbar and direct resize handles are removed.
- Opened `More text settings` and confirmed it exposed Block spacing rather than action or popup configuration.
- Confirmed the canvas zoom controls update the canvas scale and remain usable in Standard and Compact workspaces.
- Confirmed the zoom control stays at the same top-left coordinates while the popup moves.
- Confirmed popup movement updates the selected action toolbar by the same visual delta, preserving the attached relationship after repositioning.
- Confirmed pointer drag updates use the 4px grid in the interaction test, and keyboard movement/reset works in both the interaction test and live browser.
- Confirmed all four popup corner handles are present, remain outside the scrollable popup content, and become fully visible when the popup is selected.
- Resized the popup through the bottom-right handle in the focused pointer test at 80% canvas zoom and confirmed the zoom-compensated 372 × 280px result.
- Resized the live popup with keyboard input, confirmed the 368 × 276px canvas badge, and verified the rendered page popup received `--lq-popup-width: 368px` and `--lq-popup-height: 276px`.
- Reloaded the editor and confirmed the custom popup geometry persisted. Selecting a corner resets the popup content viewport to its origin, so focus never hides the heading or clips handles.
- Confirmed `.rich-step-action-stage` is a `DIV` with `rgba(0, 0, 0, 0)` background and zero padding, while `.rich-step-action-preview` retains the resolved Brand Theme fill.
- Confirmed natural-height popups use the enclosing canvas scroll; custom-height popups scroll only their content while the resize frame and handles remain fixed and visible.
- Browser console returned no errors.

## Comparison history

- P1: the 160px top reserve plus vertical centering hid lower popup content. Reduced the reserve to 72px, aligned the popup to the top of the canvas, and removed the popup's inner max-height scroller.
- P1: button selection auto-opened the bottom tray, diverging from the source's progressive disclosure. Removed automatic opening and wired the tray exclusively to the selected toolbar's ellipsis.
- P1: the text toolbar used a fixed canvas coordinate. Reused the selected-row measurement path for both text and action toolbars.
- P1: duplicate button configuration appeared in both the contextual toolbar and detailed tray. Reduced the button toolbar to identity, More, and Close so every detailed value has one visible editing surface.
- P1: CTA width was limited to presets. Added direct horizontal handles, zoom-aware pointer math, keyboard access, a 4px width grid, and a bounded `widthPx` schema/runtime contract.
- P1: link destination could be hidden below a horizontally dense behavior surface. Reordered Behavior into a vertical layout with the destination first and enforced the shared 36px control height.
- P1: the link behavior close button appeared but did not reliably dismiss in the live portal. Made the popover controlled and wired the close button directly to its open-state callback.
- P2: creator popups relied on outside click or Escape. Added visible close controls to selection toolbars, quick behavior, insertion, Placement, Popup, and detailed settings.
- P2: the right tool dock could cover the tray close control. Raised the tray to the correct creator-chrome layer.
- P2: the popup could not be repositioned while reviewing longer content. Added a zoom-aware, bounded drag grip plus keyboard and reset affordances.
- P2: zoom controls were part of the scrolling stage. Moved them to the canvas shell and pinned them to the top-left corner.
- P2: the button container inherited a green chip background from a broad direct-child `span` selector. Replaced the action-stage wrapper with a semantic layout `div`, leaving only the actual rendered button surface themed.
- P1: the popup's previous resize affordance was lost during the canvas redesign, leaving creators unable to set its width and height directly. Added a bounded, schema-backed size contract, four zoom-aware corner handles, keyboard/reset access, and runtime parity.
- P1: putting the corner controls inside the custom-height scroll container clipped three handles and could scroll the heading out of view on focus. Split the popup into a non-scrolling outer resize frame and an inner content viewport, then reset the content viewport when selecting the popup.
- Post-fix evidence: `freeform-action-canvas-final.jpg`, `freeform-link-behavior-final.jpg`, `popup-corner-resize-final.jpg`, `source-vs-freeform-action-canvas-final.png`, and `source-vs-popup-corner-resize-final.png`, plus the earlier contextual toolbar captures.

## Verification

- `@lodariq/sdk-authoring` build, typecheck, and lint: passed.
- `@lodariq/tests` typecheck and lint: passed.
- Focused schema, compiler, runtime, and rich-content interaction tests: 114 passed.
- Standard/Compact browser interaction checks: passed.
- Browser console errors: none.
- `git diff --check`: passed.

## Follow-up polish

- P3: a future Fit command could calculate the best zoom level for unusually long popups; manual zoom already covers the required workflow.

final result: passed
