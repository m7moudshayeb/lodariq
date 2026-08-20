# Authoring Free Shell

Status: current in-product authoring shell. Product source:
`refined-lodariq-prd.md` §7.3 and `ux-revamp.md`. This file records the locked
interaction, not an options menu.

## Decision

The customer page is the canvas. There is no floating editor panel.

- The live tour popup is the rich-content editor (`RichContentEditor` in the
  `editor.lodariq.io` iframe, aligned over the runtime tooltip).
- A thin filmstrip lists every step and holds the experience title.
- Numbered pulses mark resolved, on-screen targets only.
- Flow map, translation, batch, appearance, release, review, and recovery open
  in one operations modal from a contextual launcher action.
- The pre-session browse shell is unchanged. Standalone `apps/editor` is
  unchanged.

Lexical stays in `packages/sdk-authoring/src/editor`. The session bearer stays
in the iframe. Do not mount React or Lexical into `lodariq-tour`.

## Surfaces

| Surface | Role |
| --- | --- |
| Live overlay popup | One open card at a time. Type, insert, resize. Toolbar docks above it. |
| Filmstrip | All steps, add/reorder, title. Collapses during target pick. |
| Pulses | Quiet numbered circles for visible targets. Click to edit. |
| Placement compass | Four icons on the target. Drag-snap writes `top/right/bottom/left`. |
| Operations modal | Explicit; may cover the page. Never publishes on open/close. |
| Preview as user | Hides overlay and filmstrip. Exit preview returns to pulses. |

Click outside deselects once without firing the product action. After that the
page is interactive.

Media, buttons, and the overlay popup share one 8-edge resize: dashed frame,
drag any edge or corner, arrows nudge, Home resets.

## Implementation

Host chrome lives next to the existing authoring panel custom element. The same
iframe switches overlay and operations presentations. Runtime `TourPlayer`
keeps target outline and placement math; the runtime card is hidden (geometry
preserved) while the overlay iframe is the visible editor.
