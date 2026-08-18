import { createNonceStyleElement } from '@lodariq/schema/dom';
import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from '../creator-chrome-tokens';
import {
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE,
  AUTHORING_SHELL_ATTRIBUTE,
  AUTHORING_TARGET_PICKING_ATTRIBUTE,
} from './panel-attributes';

export interface AuthoringPanelStyleOptions {
  defaultHeight: number;
  defaultWidth: number;
  headerHeight: number;
}

export function createPanelStyles(_options: AuthoringPanelStyleOptions): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      z-index: 2147483646;
      pointer-events: none;
      font-family: ${CREATOR_CHROME_FONT_STACK};
      box-sizing: border-box;
      color-scheme: light;
    }

    .overlay-root {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .overlay-filmstrip,
    .overlay-pulse,
    .overlay-compass,
    .overlay-picking-chip,
    .overlay-preview-exit,
    .overlay-operations-dimmer,
    slot[name="authoring-frame"]::slotted(iframe) {
      pointer-events: auto;
    }

    .overlay-operations-dimmer {
      position: fixed;
      inset: 0;
      z-index: 2;
      background: rgba(16, 18, 22, 0.45);
      cursor: pointer;
    }

    .overlay-filmstrip {
      position: fixed;
      left: 50%;
      bottom: 16px;
      z-index: 4;
      display: flex;
      max-width: min(720px, calc(100vw - 120px));
      align-items: center;
      gap: 8px;
      height: 56px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 16px;
      background: ${CREATOR_CHROME_TOKENS.chrome};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
      padding: 8px 12px 8px 16px;
      transform: translateX(-50%);
    }

    .overlay-filmstrip[data-dock='top'] {
      top: 18px;
      bottom: auto;
    }

    .overlay-filmstrip-title {
      width: 140px;
      min-width: 96px;
      border: 0;
      background: transparent;
      color: inherit;
      font: 600 12px/1.2 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-filmstrip-rule {
      width: 1px;
      height: 24px;
      flex: 0 0 auto;
      background: rgba(255, 255, 255, 0.12);
    }

    .overlay-filmstrip-sequence {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      align-items: center;
      gap: 8px;
    }

    .overlay-filmstrip-steps {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow-x: auto;
    }

    .overlay-filmstrip-step,
    .overlay-filmstrip-add {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
      cursor: pointer;
      font: 600 12px/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 0;
    }

    .overlay-filmstrip-add {
      flex: 0 0 auto;
      font-size: 16px;
      line-height: 1;
    }

    .overlay-filmstrip-operations,
    .overlay-filmstrip-close,
    .overlay-preview-exit button {
      height: 32px;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      font: 600 12px/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 0 12px;
    }

    .overlay-filmstrip-operations {
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
    }

    .overlay-filmstrip-close,
    .overlay-preview-exit button {
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
    }

    .overlay-filmstrip-step[aria-current='step'] {
      background: ${CREATOR_CHROME_TOKENS.focus};
      color: #07201b;
    }

    .overlay-pulse {
      position: fixed;
      z-index: 3;
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border: 2px solid ${CREATOR_CHROME_TOKENS.focus};
      border-radius: 999px;
      background: ${CREATOR_CHROME_TOKENS.chrome};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      font: 700 12px/1 ${CREATOR_CHROME_FONT_STACK};
      transform: translate(-50%, -50%);
    }

    .overlay-compass {
      position: fixed;
      z-index: 3;
      pointer-events: none;
    }

    .overlay-compass-hit,
    .overlay-compass-retarget {
      position: absolute;
      display: grid;
      width: 32px;
      height: 32px;
      place-items: center;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 999px;
      background: ${CREATOR_CHROME_TOKENS.chrome};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      pointer-events: auto;
      cursor: pointer;
      padding: 0;
    }

    .overlay-compass-hit[data-placement='top'] { left: 50%; top: -40px; transform: translateX(-50%); }
    .overlay-compass-hit[data-placement='right'] { right: -40px; top: 50%; transform: translateY(-50%); }
    .overlay-compass-hit[data-placement='bottom'] { left: 50%; bottom: -40px; transform: translateX(-50%); }
    .overlay-compass-hit[data-placement='left'] { left: -40px; top: 50%; transform: translateY(-50%); }

    .overlay-compass-hit[aria-pressed='true'] {
      background: ${CREATOR_CHROME_TOKENS.action};
      border-color: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
    }

    .overlay-compass-retarget {
      left: auto;
      right: -40px;
      top: -40px;
      transform: none;
    }

    slot[name="authoring-frame"]::slotted(iframe) {
      position: fixed;
      z-index: 2;
      background: transparent;
      color-scheme: normal;
    }

    .overlay-iframe-frame {
      position: fixed;
      z-index: 3;
      box-sizing: border-box;
      border: 1px dashed transparent;
      border-radius: 12px;
      pointer-events: none;
    }

    .overlay-iframe-frame:hover,
    .overlay-iframe-frame[data-resizing='true'] {
      border-color: ${CREATOR_CHROME_TOKENS.focus};
    }

    .overlay-drag-ring {
      position: absolute;
      left: 16px;
      right: 16px;
      top: 4px;
      height: 10px;
      pointer-events: auto;
      cursor: grab;
    }

    .overlay-iframe-frame .edge-resize-handle {
      position: absolute;
      z-index: 3;
      pointer-events: auto;
      touch-action: none;
    }

    .overlay-iframe-frame .edge-resize-handle[data-edge='n'],
    .overlay-iframe-frame .edge-resize-handle[data-edge='s'] {
      right: 10px;
      left: 10px;
      height: 10px;
      cursor: ns-resize;
    }
    .overlay-iframe-frame .edge-resize-handle[data-edge='n'] { top: 0; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='s'] { bottom: -5px; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='e'],
    .overlay-iframe-frame .edge-resize-handle[data-edge='w'] {
      top: 10px;
      bottom: 10px;
      width: 10px;
      cursor: ew-resize;
    }
    .overlay-iframe-frame .edge-resize-handle[data-edge='e'] { right: -5px; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='w'] { left: -5px; }
    .overlay-iframe-frame .edge-resize-handle:is([data-edge='ne'], [data-edge='se'], [data-edge='sw'], [data-edge='nw']) {
      width: 14px;
      height: 14px;
    }
    .overlay-iframe-frame .edge-resize-handle[data-edge='ne'] { top: -7px; right: -7px; cursor: nesw-resize; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='se'] { right: -7px; bottom: -7px; cursor: nwse-resize; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='sw'] { bottom: -7px; left: -7px; cursor: nesw-resize; }
    .overlay-iframe-frame .edge-resize-handle[data-edge='nw'] { top: -7px; left: -7px; cursor: nwse-resize; }

    .overlay-picking-chip {
      position: fixed;
      top: 24px;
      left: 50%;
      z-index: 5;
      display: none;
      transform: translateX(-50%);
      border-radius: 999px;
      background: #0c211c;
      color: #fff;
      cursor: grab;
      padding: 10px 16px;
      font: 600 12px/1.2 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-preview-exit {
      position: fixed;
      top: 18px;
      right: 18px;
      z-index: 5;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-filmstrip,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-pulses,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-compass,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-filmstrip,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-pulses,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-operations-dimmer,
    :host([${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-iframe-frame,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-compass,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-operations-dimmer {
      visibility: hidden;
      pointer-events: none;
    }

    :host([${AUTHORING_SHELL_ATTRIBUTE}="picking"]) .overlay-picking-chip {
      display: flex;
    }
    `,
  );
}
