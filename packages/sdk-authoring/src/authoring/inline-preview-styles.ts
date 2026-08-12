import { createNonceStyleElement } from '@lodariq/schema/dom';
import {
  AUTHORING_CONTEXT_SURFACE_TOKENS,
  CREATOR_CHROME_FONT_STACK,
} from '../creator-chrome-tokens';

interface InlinePreviewStyleAttributes {
  editable: string;
  style: string;
  toolbar: string;
}

export function createInlineEditorStyles(
  doc: Document,
  attributes: InlinePreviewStyleAttributes,
): HTMLStyleElement {
  const style = createNonceStyleElement(
    doc,
    `
      [${attributes.editable}="true"] {
        border-radius: 4px;
        cursor: text;
        outline: 1px dashed transparent;
        outline-offset: 3px;
        transition: outline-color 120ms ease, background-color 120ms ease;
      }

      [${attributes.editable}="true"]:hover {
        outline-color: rgba(61, 232, 176, 0.55);
      }

      [${attributes.editable}="true"]:focus {
        outline: 2px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
      }

      [${attributes.toolbar}="true"] {
        position: sticky;
        bottom: calc(
          var(--lq-tour-composition-padding, var(--lq-tour-spacing)) * -1
        );
        display: flex;
        box-sizing: border-box;
        width: calc(
          100% + (var(--lq-tour-composition-padding, var(--lq-tour-spacing)) * 2)
        );
        max-width: none;
        align-items: center;
        flex: 0 0 auto;
        flex-wrap: nowrap;
        justify-content: space-between;
        gap: 8px;
        margin: auto
          calc(var(--lq-tour-composition-padding, var(--lq-tour-spacing)) * -1)
          calc(var(--lq-tour-composition-padding, var(--lq-tour-spacing)) * -1);
        border: 0;
        border-top: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
        border-radius: 0 0 var(--lq-tour-radius) var(--lq-tour-radius);
        background: color-mix(in srgb, ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface} 96%, transparent);
        box-shadow: none;
        padding: 5px var(--lq-tour-spacing);
        backdrop-filter: blur(14px);
      }

      div[role="dialog"][data-lodariq-popup-height="custom"] {
        display: flex;
        flex-direction: column;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-context {
        position: relative;
        display: inline-grid;
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        place-items: center;
        border-right: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
        margin-right: 1px;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-combobox {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
      }

      [${attributes.toolbar}="true"] button {
        min-width: 0;
        margin: 0;
        border: 1px solid transparent;
        background: transparent;
        box-shadow: none;
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
        font: 600 12px/1.2 ${CREATOR_CHROME_FONT_STACK};
        cursor: pointer;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-trigger {
        display: inline-flex;
        width: 100%;
        min-height: 34px;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        border-radius: 8px;
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
        padding: 6px 8px;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-trigger > svg:first-child {
        flex: 0 0 auto;
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.muted};
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-value {
        flex: 1 1 auto;
        overflow: hidden;
        max-width: none;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-chevron {
        flex: 0 0 auto;
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.muted};
        transition: transform 120ms ease;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-combobox[data-open]
        .lodariq-inline-toolbar-chevron {
        transform: rotate(180deg);
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-details {
        position: relative;
        display: inline-grid;
        width: 34px;
        min-width: 34px;
        min-height: 34px;
        flex: 0 0 auto;
        place-items: center;
        border-left: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
        border-radius: 8px;
        margin-left: 1px;
        padding: 0;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-trigger:hover,
      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-trigger[aria-expanded="true"],
      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-details:hover {
        border-color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
        background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      }

      [${attributes.toolbar}="true"] button:focus-visible {
        outline: 2px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.focus};
        outline-offset: 2px;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-listbox {
        position: absolute;
        right: auto;
        bottom: calc(100% + 8px);
        left: 0;
        z-index: 4;
        display: grid;
        width: max-content;
        min-width: 168px;
        max-width: min(220px, calc(100vw - 32px));
        gap: 2px;
        overflow: hidden;
        border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
        border-radius: 10px;
        background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
        padding: 5px;
        box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-combobox:last-of-type
        .lodariq-inline-toolbar-listbox {
        right: 0;
        left: auto;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-listbox[hidden] {
        display: none;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-option {
        display: grid;
        width: 100%;
        min-height: 36px;
        grid-template-columns: 16px minmax(0, 1fr);
        align-items: center;
        gap: 7px;
        border-radius: 7px;
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
        padding: 7px 9px;
        text-align: left;
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-option:hover,
      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-option[aria-selected="true"] {
        background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-check {
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
      }

      [${attributes.toolbar}="true"] .lodariq-inline-toolbar-check[hidden] {
        visibility: hidden;
      }

      [${attributes.toolbar}="true"] [data-tooltip]::after {
        position: absolute;
        right: 0;
        bottom: calc(100% + 8px);
        z-index: 5;
        width: max-content;
        max-width: 180px;
        border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
        border-radius: 7px;
        background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
        color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
        content: attr(data-tooltip);
        font: 600 11px/1.2 ${CREATOR_CHROME_FONT_STACK};
        opacity: 0;
        padding: 6px 8px;
        pointer-events: none;
        transform: translateY(2px);
        transition: opacity 100ms ease, transform 100ms ease;
        white-space: nowrap;
      }

      [${attributes.toolbar}="true"] [data-tooltip]:hover::after,
      [${attributes.toolbar}="true"] [data-tooltip]:focus-visible::after {
        opacity: 1;
        transform: translateY(0);
      }

      @media (max-width: 420px) {
        [${attributes.toolbar}="true"] .lodariq-inline-toolbar-context {
          display: none;
        }

        [${attributes.toolbar}="true"] .lodariq-inline-toolbar-value {
          max-width: 68px;
        }
      }
    `,
  );
  style.setAttribute(attributes.style, 'true');
  return style;
}
