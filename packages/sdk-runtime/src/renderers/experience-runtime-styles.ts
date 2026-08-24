import { createNonceStyleElement } from '@lodariq/schema/dom';

/*
 * Surface layout is unconditional. These rules used to be qualified
 * :not([data-lodariq-anchored]), which meant attaching a target to a banner
 * silently turned it back into a tour tooltip. A target scopes when an
 * experience appears; the surface decides where it sits.
 */
export function createExperienceRuntimeStyles(document: Document): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    .tour-backdrop.experience-modal-backdrop {
      inset: 0;
      z-index: 0;
      width: auto;
      height: auto;
      border-radius: 0;
      background: color-mix(in srgb, var(--lq-tour-text-color) 24%, transparent);
      box-shadow: none;
      pointer-events: auto;
    }

    /* Every viewport surface places itself; none of them inherit tooltip layout. */
    :host([data-lodariq-surface-anchor="viewport"]) div[role="dialog"] {
      position: fixed;
      max-width: calc(100vw - 24px);
    }

    :host([data-lodariq-surface="modal"]) div[role="dialog"] {
      top: 50%;
      right: auto;
      bottom: auto;
      left: 50%;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 48px);
      transform: translate(-50%, -50%);
      overflow: auto;
    }

    :host([data-lodariq-surface="banner"]) div[role="dialog"] {
      top: 12px;
      right: 12px;
      bottom: auto;
      left: 12px;
      width: auto;
      max-width: min(var(--lq-tour-width), calc(100vw - 24px));
      margin-inline: auto;
      transform: none;
      border-radius: var(--lq-tour-radius-sm);
    }

    :host([data-lodariq-surface="slideIn"]) div[role="dialog"],
    :host([data-lodariq-surface="drawer"]) div[role="dialog"] {
      top: 12px;
      right: 12px;
      bottom: 12px;
      left: auto;
      display: flex;
      flex-direction: column;
      width: min(var(--lq-tour-width), calc(100vw - 24px));
      max-height: none;
      transform: none;
      overflow: auto;
    }

    :host([data-lodariq-surface="floating"]) div[role="dialog"] {
      top: auto;
      right: 20px;
      bottom: 20px;
      left: auto;
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 40px);
      transform: none;
      overflow: auto;
    }

    .experience-close {
      position: absolute;
      inset-block-start: var(--lq-tour-space-xs);
      inset-inline-end: var(--lq-tour-space-xs);
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 24px;
      cursor: pointer;
    }
    div[role="dialog"].has-experience-close {
      padding-inline-end: calc(var(--lq-tour-composition-padding, var(--lq-tour-spacing)) + 32px);
    }

    :host([data-lodariq-experience="hotspot"]) div[role="dialog"][data-hotspot-open="false"] {
      width: calc(var(--lq-experience-marker) + 4px);
      min-width: calc(var(--lq-experience-marker) + 4px);
      height: calc(var(--lq-experience-marker) + 4px);
      padding: 2px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      box-shadow: none;
    }
    .hotspot-marker {
      position: relative;
      display: grid;
      width: var(--lq-experience-marker);
      height: var(--lq-experience-marker);
      place-items: center;
      border: 2px solid var(--lq-tour-focus-color);
      border-radius: 999px;
      background: var(--lq-tour-surface);
      color: var(--lq-tour-text-color);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .hotspot-marker[data-marker="dot"]::after {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: var(--lq-tour-focus-color);
      content: "";
    }
    .hotspot-marker[data-marker="ring"] { border-width: 4px; }
    .hotspot-marker[data-marker="pulse"]::after {
      position: absolute;
      inset: -7px;
      border: 2px solid var(--lq-tour-focus-color);
      border-radius: inherit;
      animation: lq-hotspot-pulse 1.8s ease-out infinite;
      content: "";
    }
    :host([data-lodariq-experience="hotspot"]) div[role="dialog"][data-hotspot-open="true"] .hotspot-marker {
      position: absolute;
      inset-block-start: -18px;
      inset-inline-start: -18px;
    }
    @keyframes lq-hotspot-pulse {
      from { opacity: .85; transform: scale(.75); }
      to { opacity: 0; transform: scale(1.25); }
    }

    .survey-submit {
      min-height: 40px;
      margin-block-start: var(--lq-tour-space-sm);
      padding-inline: var(--lq-tour-space-md);
      border: 0;
      border-radius: var(--lq-tour-radius-sm);
      background: var(--lq-tour-primary-surface);
      color: var(--lq-tour-primary-text);
      font: inherit;
      font-weight: var(--lq-tour-action-font-weight);
      cursor: pointer;
    }
    .survey-status { margin-block-end: 0; color: var(--lq-tour-muted-text); }
    .checklist-progress { margin-block-start: 0; color: var(--lq-tour-muted-text); font-size: .9em; }
    .checklist-item {
      display: flex;
      gap: var(--lq-tour-space-sm);
      align-items: flex-start;
      cursor: pointer;
    }
    .checklist-item input { flex: none; margin-block-start: .2em; accent-color: var(--lq-tour-focus-color); }
    .checklist-item:has(input:checked) span { text-decoration: line-through; opacity: .7; }

    @media (prefers-reduced-motion: reduce) {
      .hotspot-marker::after { animation: none !important; }
    }

    @media (max-width: 520px) {
      :host([data-lodariq-surface="slideIn"]) div[role="dialog"],
      :host([data-lodariq-surface="drawer"]) div[role="dialog"] {
        top: auto;
        right: 8px;
        bottom: 8px;
        left: 8px;
        width: auto;
        max-height: calc(100vh - 16px);
      }
      :host([data-lodariq-surface="floating"]) div[role="dialog"] {
        right: 8px;
        bottom: 8px;
        left: 8px;
        width: auto;
      }
      :host([data-lodariq-surface="modal"]) div[role="dialog"] {
        max-height: calc(100vh - 24px);
      }
    }
  `,
  );
}
