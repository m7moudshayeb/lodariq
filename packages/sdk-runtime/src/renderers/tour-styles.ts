import {
  LODARIQ_TOUR_ANCHORED_ATTRIBUTE,
  createNonceStyleElement,
} from '@lodariq/schema/dom';

export function createTourStyles(): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--lodariq-tour-z-index, 2147483647);
      pointer-events: none;
      font-family: var(--lq-tour-font-family);
    }

    /* The dim is the box-shadow spread; the box itself is the hole over the target. */
    .tour-backdrop {
      box-sizing: border-box;
      position: fixed;
      z-index: -1;
      border-radius: calc(var(--lq-tour-radius) + 2px);
      pointer-events: none;
      animation: tour-target-outline-in var(--lq-tour-motion-duration)
        var(--lq-tour-motion-easing) both;
    }

    .tour-backdrop[hidden] {
      display: none;
    }

    .tour-target-outline {
      box-sizing: border-box;
      position: fixed;
      z-index: 0;
      border: var(--lq-outline-weight, 2px) var(--lq-outline-line, solid)
        var(--lq-outline-color, var(--lq-tour-focus-color));
      border-radius: var(--lq-outline-radius, calc(var(--lq-tour-radius) + 2px));
      box-shadow: 0 0 0 4px var(--lq-tour-focus-halo-color);
      pointer-events: none;
      animation: tour-target-outline-in var(--lq-tour-motion-duration)
        var(--lq-tour-motion-easing) both;
    }

    .tour-target-outline[data-lodariq-outline-line="dashed"] { --lq-outline-line: dashed; }
    .tour-target-outline[data-lodariq-outline-line="dotted"] { --lq-outline-line: dotted; }
    .tour-target-outline[data-lodariq-outline-glow="true"] {
      box-shadow:
        0 0 0 4px var(--lq-tour-focus-halo-color),
        0 0 18px 4px var(--lq-outline-color, var(--lq-tour-focus-color));
    }

    .tour-target-outline[hidden] {
      display: none;
    }

    @keyframes tour-target-outline-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    :host([data-lodariq-authoring-preview-owner]:not([data-lodariq-preview-interactive])) [role="dialog"],
    :host([data-lodariq-authoring-preview-owner]:not([data-lodariq-preview-interactive])) .tour-arrow {
      visibility: hidden;
      pointer-events: none;
    }

    /*
     * §4.4's ring states, drawn on the one ring rather than beside it.
     *
     * Only an authoring session sets the attribute, so a delivered tour never
     * shows a creator's diagnostic. "ok" is the ring as authored and needs no
     * rule; the other two override the creator's treatment on purpose — a
     * warning that can be styled into invisibility is not a warning. The hue
     * arrives with the attribute: status colours belong to the creator chrome's
     * token file, and ADR-0013 keeps literals out of here.
     */
    :host([data-lodariq-authoring-target-state="ctx"]) .tour-target-outline,
    :host([data-lodariq-authoring-target-state="bad"]) .tour-target-outline {
      border-width: 2px;
      border-color: var(--lq-authoring-target-state-color);
      box-shadow: 0 0 0 3px var(--lq-authoring-target-state-halo);
    }

    :host([data-lodariq-authoring-target-state="ctx"]) .tour-target-outline {
      border-style: dashed;
    }

    :host([data-lodariq-authoring-target-state="bad"]) .tour-target-outline {
      border-style: solid;
    }

    /*
     * Centred is the resting place for a card with nothing to point at — a
     * welcome or an announcement. Anchored cards opt out: the positioner writes
     * their exact coordinates once the target resolves.
     */
    div[role="dialog"]:not([${LODARIQ_TOUR_ANCHORED_ATTRIBUTE}]) {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    div[role="dialog"] {
      box-sizing: border-box;
      width: min(var(--lq-tour-width), calc(100vw - 24px));
      padding: var(--lq-tour-composition-padding, var(--lq-tour-spacing));
      border: var(--lq-tour-border-width) solid
        var(--lq-popup-border, var(--lq-tour-border-color));
      border-radius: var(--lq-tour-radius);
      background: var(--lq-popup-surface, var(--lq-tour-surface));
      box-shadow: var(--lq-tour-elevation);
      color: var(--lq-popup-text, var(--lq-tour-text-color));
      z-index: 1;
      pointer-events: auto;
      transition:
        background-color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing),
        border-color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing),
        color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing);
    }

    div[role="dialog"][data-lodariq-motion="fade"] {
      animation: lq-step-fade var(--lq-step-motion-duration) var(--lq-step-motion-easing) both;
    }
    div[role="dialog"][data-lodariq-motion="lift"] {
      animation: lq-step-lift var(--lq-step-motion-duration) var(--lq-step-motion-easing) both;
    }
    div[role="dialog"][data-lodariq-motion="scale"] {
      animation: lq-step-scale var(--lq-step-motion-duration) var(--lq-step-motion-easing) both;
    }
    div[role="dialog"][data-lodariq-motion="pulse"] {
      animation: lq-step-pulse var(--lq-step-motion-duration) var(--lq-step-motion-easing) 2;
    }
    @keyframes lq-step-fade { from { opacity: 0; } }
    @keyframes lq-step-lift { from { opacity: 0; transform: translateY(8px); } }
    @keyframes lq-step-scale { from { opacity: 0; transform: scale(0.97); } }
    @keyframes lq-step-pulse { 50% { transform: scale(1.02); } }

    [data-lodariq-inline-motion="fade"] {
      animation: lq-step-fade var(--lq-inline-motion-duration)
        var(--lq-inline-motion-easing) both;
    }
    [data-lodariq-inline-motion="lift"] {
      animation: lq-step-lift var(--lq-inline-motion-duration)
        var(--lq-inline-motion-easing) both;
    }
    [data-lodariq-inline-motion="scale"] {
      animation: lq-step-scale var(--lq-inline-motion-duration)
        var(--lq-inline-motion-easing) both;
    }
    [data-lodariq-inline-motion="pulse"] {
      animation: lq-step-pulse var(--lq-inline-motion-duration)
        var(--lq-inline-motion-easing) 2;
    }

    .tour-target-outline[data-lodariq-spotlight="subtle"] {
      box-shadow: 0 0 0 4px var(--lq-tour-focus-halo-color);
    }
    .tour-target-outline[data-lodariq-spotlight="standard"] {
      box-shadow: 0 0 0 8px var(--lq-tour-focus-halo-color);
    }
    .tour-target-outline[data-lodariq-spotlight="strong"] {
      box-shadow: 0 0 0 12px var(--lq-tour-focus-halo-color);
    }
    .tour-target-outline[data-lodariq-spotlight-pulse="true"] {
      animation: lq-step-pulse var(--lq-tour-motion-duration) var(--lq-tour-motion-easing) 2;
    }

    [data-lodariq-node-type="media"] {
      display: block;
      box-sizing: border-box;
      max-width: 100%;
      border-radius: var(--lq-tour-radius-sm);
      object-fit: contain;
    }
    [data-lodariq-aspect-ratio="16:9"] { aspect-ratio: 16 / 9; }
    [data-lodariq-aspect-ratio="4:3"] { aspect-ratio: 4 / 3; }
    [data-lodariq-aspect-ratio="1:1"] { aspect-ratio: 1; }

    [data-lodariq-node-type="callout"] {
      padding: var(--lq-tour-space-sm);
      border-inline-start: 3px solid var(--lq-tour-focus-color);
      border-radius: var(--lq-tour-radius-sm);
      background: var(--lq-tour-secondary-surface);
    }
    [data-lodariq-node-type="callout"][data-lodariq-callout-tone="success"] {
      border-inline-start-color: var(--lq-tour-primary-surface);
    }
    [data-lodariq-node-type="callout"][data-lodariq-callout-tone="warning"] {
      border-inline-start-width: 5px;
    }
    [data-lodariq-node-type="stat"] {
      font-size: 1.5em;
      font-weight: 700;
      line-height: 1.2;
    }
    [data-lodariq-node-type="stat"][data-lodariq-stat-emphasis="strong"] {
      font-size: 2em;
    }
    [data-lodariq-node-type="icon"] {
      display: flex;
      align-items: center;
      gap: var(--lq-tour-space-xs);
      width: 100%;
    }
    .tour-composition-icon {
      width: 1.25em;
      height: 1.25em;
      flex: none;
    }
    [data-lodariq-node-type="formField"] {
      display: grid;
      gap: var(--lq-field-gap, var(--lq-tour-space-xs, 6px));
      margin: 0;
      border: 0;
      padding: 0;
      color: var(--lq-field-label, inherit);
      font: inherit;
    }
    /* A checkbox's caption reads as body copy, not as a field label. */
    [data-lodariq-node-type="formField"][data-lodariq-field-control="checkbox"] > span {
      font-size: inherit;
      font-weight: inherit;
    }
    /* Label beside the control: caption takes its own width, the box takes the rest. */
    [data-lodariq-node-type="formField"][data-lodariq-field-control="text"][data-lodariq-field-label="beside"] {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }
    /*
     * Hidden means off the screen, never removed: the caption is still the
     * field's accessible name, so a bare box still says what it asks for.
     */
    [data-lodariq-node-type="formField"][data-lodariq-field-label="hidden"] [data-lodariq-field-caption] {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-label-size="small"] [data-lodariq-field-caption] {
      font-size: var(--lq-tour-small-font-size, 11px);
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-label-size="large"] [data-lodariq-field-caption] {
      font-size: var(--lq-tour-font-size, 14px);
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-label-weight="regular"] [data-lodariq-field-caption] {
      font-weight: 400;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-label-weight="medium"] [data-lodariq-field-caption] {
      font-weight: 550;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-label-weight="bold"] [data-lodariq-field-caption] {
      font-weight: 700;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-control-width="half"] input[type="text"] {
      width: 50%;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-control-width="auto"] input[type="text"] {
      width: auto;
    }
    [data-lodariq-node-type="formField"] legend,
    [data-lodariq-node-type="formField"] > span {
      font-size: var(--lq-tour-small-font-size, 12px);
      font-weight: 650;
    }
    [data-lodariq-node-type="formField"] label {
      display: flex;
      align-items: center;
      gap: 8px;
      font: inherit;
    }
    [data-lodariq-node-type="formField"] input[type="text"] {
      box-sizing: border-box;
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--lq-field-border, var(--lq-tour-border-color, currentColor));
      border-radius: var(--lq-tour-radius-sm, 8px);
      background: var(--lq-field-fill, var(--lq-tour-surface, #ffffff));
      color: var(--lq-field-text, inherit);
      font: inherit;
      padding: 0 10px;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-radius="square"] input[type="text"] {
      border-radius: 0;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-radius="soft"] input[type="text"] {
      border-radius: var(--lq-tour-radius-sm, 8px);
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-radius="round"] input[type="text"] {
      border-radius: 999px;
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-size="compact"] input[type="text"] {
      min-height: 28px;
    }
    [data-lodariq-node-type="formField"] input[type="checkbox"],
    [data-lodariq-node-type="formField"] input[type="radio"] {
      width: 16px;
      height: 16px;
      accent-color: var(--lq-field-fill, var(--lq-tour-focus-color, currentColor));
    }
    [data-lodariq-node-type="formField"][data-lodariq-field-size="compact"] input[type="checkbox"],
    [data-lodariq-node-type="formField"][data-lodariq-field-size="compact"] input[type="radio"] {
      width: 14px;
      height: 14px;
    }
    [data-lodariq-node-type="formField"][data-lodariq-block-align="center"] { margin-inline: auto; }
    [data-lodariq-node-type="formField"][data-lodariq-block-align="end"] { margin-inline: auto 0; }

    @media (prefers-reduced-motion: reduce) {
      div[role="dialog"][data-lodariq-motion],
      [data-lodariq-inline-motion],
      .tour-backdrop,
      .tour-target-outline,
      .tour-target-outline[data-lodariq-spotlight-pulse="true"] {
        animation: none;
      }
    }

    :host([data-lodariq-accessibility-preview="reducedMotion"]) div[role="dialog"],
    :host([data-lodariq-accessibility-preview="reducedMotion"]) [data-lodariq-inline-motion],
    :host([data-lodariq-accessibility-preview="reducedMotion"]) .tour-backdrop,
    :host([data-lodariq-accessibility-preview="reducedMotion"]) .tour-target-outline {
      animation: none !important;
      transition: none !important;
    }
    :host([data-lodariq-accessibility-preview="zoom200"]) div[role="dialog"] {
      font-size: 200%;
      max-width: calc(50vw - 24px);
    }
    :host([data-lodariq-accessibility-preview="compactReflow"]) div[role="dialog"] {
      width: min(296px, calc(100vw - 24px));
    }

    .tour-accessibility-evidence {
      margin-top: var(--lq-tour-space-sm);
      padding: var(--lq-tour-space-sm);
      border: 1px dashed var(--lq-tour-border-color);
      border-radius: var(--lq-tour-radius-sm);
      font-size: var(--lq-tour-small-font-size);
    }
    .tour-accessibility-evidence ol,
    .tour-accessibility-evidence p { margin: var(--lq-tour-space-xs) 0 0; }
    .tour-accessibility-evidence ol { padding-inline-start: var(--lq-tour-space-md); }

    .tour-choreography-recovery {
      display: flex;
      flex-wrap: wrap;
      gap: var(--lq-tour-space-xs);
      margin-top: var(--lq-tour-space-sm);
      padding-top: var(--lq-tour-space-sm);
      border-top: var(--lq-tour-border-width) solid var(--lq-tour-border-color);
    }

    .tour-choreography-recovery p {
      flex: 1 0 100%;
      margin: 0;
      color: var(--lq-popup-text, var(--lq-tour-text-color));
      font-size: var(--lq-tour-small-font-size);
    }

    .tour-choreography-recovery button {
      min-height: 36px;
      padding: 0 var(--lq-tour-space-sm);
      border: var(--lq-tour-border-width) solid var(--lq-tour-border-color);
      border-radius: var(--lq-tour-radius-sm);
      background: var(--lq-tour-secondary-surface);
      color: var(--lq-tour-secondary-text);
      font: inherit;
      font-weight: var(--lq-tour-action-font-weight);
      cursor: pointer;
    }

    .tour-choreography-recovery button:focus-visible {
      outline: 2px solid var(--lq-tour-focus-color);
      outline-offset: 2px;
    }

    div[role="dialog"][data-lodariq-content-align="center"] { text-align: center; }
    div[role="dialog"][data-lodariq-content-align="right"] { text-align: right; }
    div[role="dialog"][data-lodariq-popup-radius="square"] { border-radius: 0; }
    div[role="dialog"][data-lodariq-popup-radius="soft"] { border-radius: var(--lq-tour-radius-sm); }
    div[role="dialog"][data-lodariq-popup-radius="round"] { border-radius: var(--lq-tour-radius-lg); }
    div[role="dialog"][data-lodariq-popup-border-weight="none"] {
      --lq-popup-arrow-border: var(--lq-popup-surface, var(--lq-tour-surface));
      border-width: 0;
    }
    div[role="dialog"][data-lodariq-popup-border-weight="subtle"] {
      border-width: var(--lq-tour-border-width-subtle);
    }
    div[role="dialog"][data-lodariq-popup-border-weight="strong"] {
      border-width: var(--lq-tour-border-width-strong);
    }
    div[role="dialog"][data-lodariq-popup-elevation="none"] { box-shadow: none; }
    div[role="dialog"][data-lodariq-popup-elevation="resting"] {
      box-shadow: var(--lq-tour-elevation-resting);
    }
    div[role="dialog"][data-lodariq-popup-elevation="floating"] {
      box-shadow: var(--lq-tour-elevation-floating);
    }
    div[role="dialog"][data-lodariq-popup-width="custom"] {
      width: min(var(--lq-popup-width), calc(100vw - 24px));
    }
    div[role="dialog"][data-lodariq-popup-height="custom"] {
      display: flex;
      flex-direction: column;
      height: min(var(--lq-popup-height), calc(100vh - 24px));
      overflow: visible;
    }

    .tour-content {
      min-width: 0;
    }

    div[role="dialog"][data-lodariq-popup-height="custom"] > .tour-content {
      min-height: 0;
      flex: 1 1 auto;
      overflow: auto;
    }
    div[role="dialog"][data-lodariq-composition-padding="compact"] {
      --lq-tour-composition-padding: var(--lq-tour-space-sm);
    }
    div[role="dialog"][data-lodariq-composition-padding="relaxed"] {
      --lq-tour-composition-padding: var(--lq-tour-space-lg);
    }

    [data-lodariq-spacing-before="none"] { margin-top: 0 !important; }
    [data-lodariq-spacing-before="tight"] { margin-top: var(--lq-tour-space-xs) !important; }
    [data-lodariq-spacing-before="normal"] { margin-top: var(--lq-tour-space-sm) !important; }
    [data-lodariq-spacing-before="relaxed"] { margin-top: var(--lq-tour-space-md) !important; }
    [data-lodariq-spacing-after="none"] { margin-bottom: 0 !important; }
    [data-lodariq-spacing-after="tight"] { margin-bottom: var(--lq-tour-space-xs) !important; }
    [data-lodariq-spacing-after="normal"] { margin-bottom: var(--lq-tour-space-sm) !important; }
    [data-lodariq-spacing-after="relaxed"] { margin-bottom: var(--lq-tour-space-md) !important; }
    [data-lodariq-spacing-after-px] { margin-bottom: var(--lq-block-spacing-after) !important; }

    .tour-arrow {
      position: absolute;
      z-index: 1;
      width: 16px;
      height: 16px;
      border: 0;
      background: transparent;
      pointer-events: none;
    }

    .tour-arrow::before,
    .tour-arrow::after {
      position: absolute;
      width: 0;
      height: 0;
      content: "";
    }

    .tour-arrow[data-side="bottom"]::before {
      top: 0;
      left: 0;
      border-right: 8px solid transparent;
      border-bottom: 9px solid
        var(--lq-popup-arrow-border, var(--lq-popup-border, var(--lq-tour-border-color)));
      border-left: 8px solid transparent;
    }

    .tour-arrow[data-side="bottom"]::after {
      top: 2px;
      left: 2px;
      border-right: 6px solid transparent;
      border-bottom: 7px solid var(--lq-popup-surface, var(--lq-tour-surface));
      border-left: 6px solid transparent;
    }

    .tour-arrow[data-side="top"]::before {
      bottom: 0;
      left: 0;
      border-top: 9px solid
        var(--lq-popup-arrow-border, var(--lq-popup-border, var(--lq-tour-border-color)));
      border-right: 8px solid transparent;
      border-left: 8px solid transparent;
    }

    .tour-arrow[data-side="top"]::after {
      bottom: 2px;
      left: 2px;
      border-top: 7px solid var(--lq-popup-surface, var(--lq-tour-surface));
      border-right: 6px solid transparent;
      border-left: 6px solid transparent;
    }

    .tour-arrow[data-side="right"]::before {
      top: 0;
      left: 0;
      border-top: 8px solid transparent;
      border-right: 9px solid
        var(--lq-popup-arrow-border, var(--lq-popup-border, var(--lq-tour-border-color)));
      border-bottom: 8px solid transparent;
    }

    .tour-arrow[data-side="right"]::after {
      top: 2px;
      left: 2px;
      border-top: 6px solid transparent;
      border-right: 7px solid var(--lq-popup-surface, var(--lq-tour-surface));
      border-bottom: 6px solid transparent;
    }

    .tour-arrow[data-side="left"]::before {
      top: 0;
      right: 0;
      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
      border-left: 9px solid
        var(--lq-popup-arrow-border, var(--lq-popup-border, var(--lq-tour-border-color)));
    }

    .tour-arrow[data-side="left"]::after {
      top: 2px;
      right: 2px;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 7px solid var(--lq-popup-surface, var(--lq-tour-surface));
    }

    .tour-arrow[hidden] {
      display: none;
    }

    [data-lodariq-node-type="heading"] {
      margin: 0 0 calc(var(--lq-tour-spacing) * .5);
      font-size: var(--lq-tour-base-font-size);
      font-weight: var(--lq-tour-heading-font-weight);
      line-height: var(--lq-tour-heading-line-height);
    }

    [data-lodariq-node-type="paragraph"] {
      margin: 0 0 var(--lq-tour-spacing);
      color: var(--lq-popup-muted-text, var(--lq-tour-muted-text-color));
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
    }

    [data-lodariq-node-type="list"] {
      margin: 0 0 var(--lq-tour-spacing) calc(var(--lq-tour-spacing) * 1.5);
      padding: 0;
      color: var(--lq-popup-text, var(--lq-tour-text-color));
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
    }

    [data-lodariq-node-type="list"] li + li {
      margin-top: 4px;
    }

    [data-lodariq-node-type="divider"] {
      margin: var(--lq-tour-spacing) 0;
      border: 0;
      border-top: var(--lq-tour-border-width) solid var(--lq-tour-border-color);
    }

    [data-lodariq-node-type="media"][data-lodariq-media-ready="true"] {
      margin: var(--lq-tour-spacing) 0;
      padding: 0;
      border: 0;
      background: transparent;
    }

    [data-lodariq-node-type="media"][data-lodariq-media-unavailable="true"] {
      margin: var(--lq-tour-spacing) 0;
      padding: var(--lq-tour-spacing);
      border: var(--lq-tour-border-width) dashed var(--lq-tour-border-color);
      border-radius: var(--lq-tour-radius);
      background: var(--lq-tour-secondary-surface);
      color: var(--lq-tour-secondary-text);
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
      text-align: center;
    }

    [data-lodariq-node-type="link"] {
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      margin-top: var(--lq-tour-space-xs);
      color: var(--lq-tour-primary-surface);
      font-size: var(--lq-tour-small-font-size);
      font-weight: var(--lq-tour-action-font-weight);
      text-decoration: none;
      cursor: pointer;
    }

    [data-lodariq-node-type="link"]:hover {
      text-decoration: underline;
    }

    [data-lodariq-node-type="paragraph"] a,
    [data-lodariq-node-type="heading"] a {
      display: inline;
      min-height: 0;
      margin: 0;
      color: inherit;
      font: inherit;
      text-decoration: underline;
    }

    .tour-action-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--lq-tour-space-sm);
      margin: var(--lq-tour-space-xs) 0 0;
    }

    div[role="dialog"][data-lodariq-action-layout="stack"] .tour-action-group {
      flex-direction: column;
      align-items: stretch;
    }

    div[role="dialog"][data-lodariq-action-layout="inline"][data-lodariq-action-align="center"] .tour-action-group { justify-content: center; }
    div[role="dialog"][data-lodariq-action-layout="inline"][data-lodariq-action-align="end"] .tour-action-group { justify-content: flex-end; }
    div[role="dialog"][data-lodariq-action-layout="inline"][data-lodariq-action-align="stretch"] .tour-action-group { justify-content: space-between; }
    div[role="dialog"][data-lodariq-action-layout="inline"][data-lodariq-action-align="stretch"] .tour-action-group > [data-lodariq-action-width="fill"] { flex: 1 1 0; }
    div[role="dialog"][data-lodariq-action-layout="stack"][data-lodariq-action-align="start"] .tour-action-group { align-items: flex-start; }
    div[role="dialog"][data-lodariq-action-layout="stack"][data-lodariq-action-align="center"] .tour-action-group { align-items: center; }
    div[role="dialog"][data-lodariq-action-layout="stack"][data-lodariq-action-align="end"] .tour-action-group { align-items: flex-end; }
    div[role="dialog"][data-lodariq-composition-gap="none"] .tour-action-group { gap: 0; }
    div[role="dialog"][data-lodariq-composition-gap="tight"] .tour-action-group { gap: var(--lq-tour-space-xs); }
    div[role="dialog"][data-lodariq-composition-gap="normal"] .tour-action-group { gap: var(--lq-tour-space-sm); }
    div[role="dialog"][data-lodariq-composition-gap="relaxed"] .tour-action-group { gap: var(--lq-tour-space-md); }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--lq-tour-space-xs);
      min-height: 40px;
      padding: var(--lq-tour-space-xs) var(--lq-tour-space-sm);
      border: var(--lq-tour-border-width) solid transparent;
      border-radius: var(--lq-tour-radius);
      background: var(--lq-action-fill, var(--lq-tour-primary-surface));
      color: var(--lq-action-text, var(--lq-tour-primary-text));
      font: inherit;
      font-weight: var(--lq-tour-action-font-weight);
      cursor: pointer;
    }

    button[data-lodariq-action-variant="secondary"] {
      border-color: var(--lq-action-border, var(--lq-tour-border-color));
      background: var(--lq-action-fill, var(--lq-tour-secondary-surface));
      color: var(--lq-action-text, var(--lq-tour-secondary-text));
    }

    button[data-lodariq-action-variant="subtle"] {
      border-color: transparent;
      background: var(--lq-action-fill, color-mix(in srgb, var(--lq-tour-primary-surface) 12%, transparent));
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
    }

    button[data-lodariq-action-variant="outline"] {
      border-color: var(--lq-action-border, var(--lq-tour-primary-surface));
      background: transparent;
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
    }

    button[data-lodariq-action-variant="link"] {
      min-height: 36px;
      border-color: transparent;
      background: transparent;
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
      padding-inline: var(--lq-tour-space-xs);
      text-decoration: underline;
    }

    button[data-lodariq-action-size="compact"] { min-height: 36px; padding-block: var(--lq-tour-space-xs); }
    button[data-lodariq-action-width="custom"] { width: min(100%, var(--lq-action-width)); }
    button[data-lodariq-action-width="fill"] { width: 100%; }
    button[data-lodariq-action-radius="square"] { border-radius: 0; }
    button[data-lodariq-action-radius="soft"] { border-radius: var(--lq-tour-radius-sm); }
    button[data-lodariq-action-radius="round"] { border-radius: 999px; }
    button[data-lodariq-block-align="center"] { margin-inline: auto; }
    button[data-lodariq-block-align="end"] { margin-inline: auto 0; }
    button[data-lodariq-block-align="stretch"] { width: 100%; }

    [data-lodariq-node-type="link"][data-lodariq-action-variant] {
      justify-content: center;
      gap: var(--lq-tour-space-xs);
      min-height: 40px;
      margin: 0;
      padding: var(--lq-tour-space-xs) var(--lq-tour-space-sm);
      border: var(--lq-tour-border-width) solid transparent;
      border-radius: var(--lq-tour-radius);
      text-decoration: none;
    }

    [data-lodariq-node-type="link"][data-lodariq-action-variant="primary"] {
      background: var(--lq-action-fill, var(--lq-tour-primary-surface));
      color: var(--lq-action-text, var(--lq-tour-primary-text));
    }

    [data-lodariq-node-type="link"][data-lodariq-action-variant="secondary"] {
      border-color: var(--lq-action-border, var(--lq-tour-border-color));
      background: var(--lq-action-fill, var(--lq-tour-secondary-surface));
      color: var(--lq-action-text, var(--lq-tour-secondary-text));
    }

    [data-lodariq-node-type="link"][data-lodariq-action-variant="subtle"] {
      background: var(--lq-action-fill, color-mix(in srgb, var(--lq-tour-primary-surface) 12%, transparent));
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
    }

    [data-lodariq-node-type="link"][data-lodariq-action-variant="outline"] {
      border-color: var(--lq-action-border, var(--lq-tour-primary-surface));
      background: transparent;
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
    }

    [data-lodariq-node-type="link"][data-lodariq-action-variant="link"] {
      min-height: 36px;
      padding-inline: var(--lq-tour-space-xs);
      color: var(--lq-action-text, var(--lq-tour-primary-surface));
      text-decoration: underline;
    }

    [data-lodariq-node-type="link"][data-lodariq-action-size="compact"] { min-height: 36px; }
    [data-lodariq-node-type="link"][data-lodariq-action-width="custom"] { width: min(100%, var(--lq-action-width)); }
    [data-lodariq-node-type="link"][data-lodariq-action-width="fill"] { width: 100%; }
    [data-lodariq-node-type="link"][data-lodariq-action-radius="square"] { border-radius: 0; }
    [data-lodariq-node-type="link"][data-lodariq-action-radius="soft"] { border-radius: var(--lq-tour-radius-sm); }
    [data-lodariq-node-type="link"][data-lodariq-action-radius="round"] { border-radius: 999px; }
    [data-lodariq-node-type="link"][data-lodariq-block-align="center"] { margin-inline: auto; }
    [data-lodariq-node-type="link"][data-lodariq-block-align="end"] { margin-inline: auto 0; }
    [data-lodariq-node-type="link"][data-lodariq-block-align="stretch"] { width: 100%; }

    .tour-action-group > button:hover {
      filter: brightness(.94);
    }

    .tour-action-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
    }

    [data-lodariq-node-type="button"] {
      margin: 0;
    }

    button:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--lq-tour-focus-color);
      outline-offset: 2px;
    }

    button[disabled],
    [aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.55;
    }

    :host([data-lodariq-embedded-preview]) {
      position: absolute;
      z-index: 1;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      padding: 12px;
      overflow: hidden;
    }

    :host([data-lodariq-embedded-preview]) div[role="dialog"] {
      width: min(var(--lq-tour-width), 100%);
      max-height: 100%;
      pointer-events: none;
    }

    :host([data-lodariq-embedded-preview]) .tour-content {
      max-height: 100%;
      overflow: auto;
    }

    :host([data-lodariq-embedded-preview]) div[role="dialog"][data-lodariq-popup-width="custom"] {
      width: min(var(--lq-popup-width), 100%);
    }

    :host([data-lodariq-embedded-preview]) div[role="dialog"][data-lodariq-popup-height="custom"] {
      height: min(var(--lq-popup-height), 100%);
    }
    /*
     * Last word on visibility. The card is hidden on purpose until its target
     * resolves, and any display declaration elsewhere — the custom-height rule,
     * for one — silently defeats the UA's own [hidden] handling and leaves the
     * card sitting unpositioned in the page's top-left corner.
     */
    div[role="dialog"][hidden] {
      display: none;
    }
  `,
  );
}
