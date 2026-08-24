import { createNonceStyleElement } from '@lodariq/schema/dom';
import {
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
  AUTHORING_TYPOGRAPHY_CSS_PROPERTIES,
  OVERLAY_CHROME_GEOMETRY,
  OVERLAY_CHROME_GHOST_OPACITY,
  OVERLAY_CHROME_MOTION,
} from '../creator-chrome-tokens';
import { EXPERIENCE_MENU_CSS, EXPERIENCE_NAME_DIALOG_CSS } from '../experience-menu/styles';
import { bandStyles } from './overlay/band-styles';
import {
  AUTHORING_BROWSING_ATTRIBUTE,
  AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE,
  AUTHORING_PANELS_HIDDEN_ATTRIBUTE,
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
      ${AUTHORING_TYPOGRAPHY_CSS_PROPERTIES}
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

    /* A declared display beats the UA [hidden] rule, so state it once here. */
    [hidden] {
      display: none !important;
    }

    * {
      scrollbar-color: ${CREATOR_CHROME_TOKENS.border} transparent;
      scrollbar-width: thin;
    }

    ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }

    ::-webkit-scrollbar-track,
    ::-webkit-scrollbar-corner {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      border: 3px solid transparent;
      border-radius: 999px;
      background-color: ${CREATOR_CHROME_TOKENS.border};
      background-clip: padding-box;
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: ${CREATOR_CHROME_TOKENS.muted};
      background-clip: padding-box;
    }

    .overlay-root {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    /* A shadow root inherits no reset, and every measurement here is border-box. */
    [data-overlay-root],
    [data-overlay-root] *,
    [data-overlay-root] *::before,
    [data-overlay-root] *::after {
      box-sizing: border-box;
    }

    .overlay-filmstrip,
    .overlay-mode-pill,
    .overlay-pulse,
    .overlay-compass,
    .overlay-operations-dimmer,
    slot[name="authoring-frame"]::slotted(iframe) {
      pointer-events: auto;
    }

    .overlay-operations-dimmer {
      position: fixed;
      inset: 0;
      z-index: 2;
      background: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.canvas} 55%, transparent);
      cursor: pointer;
    }

    .overlay-filmstrip {
      position: fixed;
      z-index: 4;
      display: flex;
      max-width: min(940px, 72vw);
      align-items: flex-end;
      gap: 0;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 12px;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      padding: 7px;
    }


    .overlay-filmstrip-rail {
      align-self: center;
      color: ${CREATOR_CHROME_TOKENS.subtle};
      font: var(--lq-weight-bold) var(--lq-font-xs)/1 ${CREATOR_CHROME_FONT_STACK};
      letter-spacing: 0.1em;
      text-transform: uppercase;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      text-align: center;
      padding: 0 2px 4px 6px;
    }

    .overlay-filmstrip-rule {
      width: 1px;
      height: 18px;
      flex: 0 0 auto;
      background: ${CREATOR_CHROME_TOKENS.border};
    }

    .overlay-filmstrip-sequence {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      align-items: stretch;
      gap: 0;
    }

    .overlay-filmstrip-steps {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      align-items: stretch;
      gap: 0;
      margin: 0;
      padding: 0;
      list-style: none;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .overlay-filmstrip-steps > li {
      position: relative;
      display: flex;
      flex: 0 0 auto;
      align-items: stretch;
    }

    .overlay-filmstrip-step-remove {
      position: absolute;
      top: -5px;
      right: -5px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 15px;
      height: 15px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 50%;
      background: ${CREATOR_CHROME_TOKENS.surfaceStrong};
      color: ${CREATOR_CHROME_TOKENS.muted};
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      opacity: 0;
      padding: 0;
      transition: opacity ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ease;
    }

    .overlay-filmstrip-steps > li:hover .overlay-filmstrip-step-remove,
    .overlay-filmstrip-steps > li:focus-within .overlay-filmstrip-step-remove {
      opacity: 1;
    }

    .overlay-filmstrip-step-remove:hover {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.danger};
      background: ${CREATOR_CHROME_STATUS_TOKENS.danger};
      color: ${CREATOR_CHROME_TOKENS.onAction};
    }

    .overlay-filmstrip-step {
      position: relative;
      display: flex;
      width: ${OVERLAY_CHROME_GEOMETRY.filmstripThumbWidth}px;
      flex: none;
      flex-direction: column;
      gap: 4px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
      color: inherit;
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1.2 ${CREATOR_CHROME_FONT_STACK};
      padding: 5px 5px 6px;
      text-align: left;
    }

    .overlay-filmstrip-step:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    }

    .overlay-filmstrip-step-frame {
      position: relative;
      display: flex;
      height: ${OVERLAY_CHROME_GEOMETRY.filmstripThumbHeight}px;
      flex-direction: column;
      gap: 2.5px;
      border: 0;
      border-radius: 5px;
      background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
      overflow: hidden;
      padding: 5px 5px 0;
    }

    .overlay-filmstrip-step-number {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 1;
      border-radius: 3px;
      background: ${CREATOR_CHROME_TOKENS.imageScrim};
      color: ${CREATOR_CHROME_TOKENS.onImage};
      font: var(--lq-weight-bold) var(--lq-font-xs)/13px ${CREATOR_CHROME_FONT_STACK};
      padding: 0 4px;
    }

    .overlay-filmstrip-step-lines {
      display: flex;
      flex-direction: column;
      gap: 2.5px;
    }

    .overlay-filmstrip-step-line {
      display: block;
      height: 2.5px;
      border-radius: 2px;
      background: ${CREATOR_CHROME_TOKENS.thumbnailInk};
    }

    .overlay-filmstrip-step-line:first-child {
      background: ${CREATOR_CHROME_TOKENS.action};
      opacity: 0.75;
    }

    .overlay-filmstrip-step-media {
      height: 10px;
      border-radius: 3px;
      background: linear-gradient(
        120deg,
        ${CREATOR_CHROME_TOKENS.action},
        ${CREATOR_CHROME_TOKENS.actionHover}
      );
    }

    .overlay-filmstrip-step-action {
      position: absolute;
      left: 5px;
      bottom: 4px;
      width: 20px;
      height: 6px;
      border-radius: 2px;
      background: ${CREATOR_CHROME_TOKENS.action};
      opacity: 0.8;
    }

    .overlay-filmstrip-step-title {
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      font: var(--lq-weight-regular) var(--lq-font-xs)/1.3 ${CREATOR_CHROME_FONT_STACK};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .overlay-filmstrip-step[aria-current='step'] {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 17%, transparent);
    }

    .overlay-filmstrip-step[aria-current='step'] .overlay-filmstrip-step-title {
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
      font-weight: var(--lq-weight-semibold);
    }

    .overlay-filmstrip-add {
      display: grid;
      flex: none;
      align-self: stretch;
      width: 38px;
      min-height: 63px;
      margin-left: 4px;
      place-items: center;
      border: 1px dashed ${CREATOR_CHROME_CONTROL_TOKENS.border};
      border-radius: 8px;
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.muted};
      cursor: pointer;
      font-size: var(--lq-font-md);
      line-height: 1;
      padding: 0;
    }

    .overlay-filmstrip-add:hover {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.action};
    }

    .overlay-filmstrip-step::after {
      content: '';
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 1;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${CREATOR_CHROME_TOKENS.subtle};
    }

    .overlay-filmstrip-step[data-target-state='ok']::after {
      background: ${CREATOR_CHROME_STATUS_TOKENS.positive};
    }

    .overlay-filmstrip-step[data-target-state='ctx']::after {
      background: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    }

    .overlay-filmstrip-step[data-target-state='bad']::after {
      background: ${CREATOR_CHROME_STATUS_TOKENS.danger};
    }

    .overlay-filmstrip-step-branch {
      position: absolute;
      right: 6px;
      bottom: 20px;
      z-index: 1;
      width: 9px;
      height: 9px;
      border-right: 1.5px solid ${CREATOR_CHROME_TOKENS.action};
      border-bottom: 1.5px solid ${CREATOR_CHROME_TOKENS.action};
      border-bottom-right-radius: 3px;
    }

    .overlay-filmstrip-insert-slot {
      align-self: stretch;
    }

    .overlay-filmstrip-insert {
      position: relative;
      display: flex;
      width: 12px;
      align-self: stretch;
      align-items: center;
      justify-content: center;
      border: 0;
      background: transparent;
      cursor: pointer;
      opacity: 0;
      padding: 0;
      transition: opacity ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ease;
    }

    .overlay-filmstrip-insert::before {
      content: '';
      position: absolute;
      top: 4px;
      bottom: 4px;
      width: 2px;
      border-radius: 2px;
      background: ${CREATOR_CHROME_TOKENS.action};
    }

    .overlay-filmstrip-insert-disc {
      position: relative;
      display: grid;
      width: 15px;
      height: 15px;
      place-items: center;
      border-radius: 50%;
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font: var(--lq-weight-bold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-filmstrip-insert:hover,
    .overlay-filmstrip-insert:focus-visible {
      opacity: 1;
    }

    .overlay-filmstrip-insert-slot:hover .overlay-filmstrip-insert {
      opacity: 1;
    }

    .overlay-filmstrip-step[data-batch-selected='true'] .overlay-filmstrip-step-frame {
      box-shadow: inset 0 0 0 2px ${CREATOR_CHROME_TOKENS.action};
    }

    .overlay-target-ring {
      position: fixed;
      z-index: 1;
      pointer-events: none;
    }

    .overlay-target-ring-edge {
      position: absolute;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      pointer-events: auto;
      cursor: pointer;
      appearance: none;
      color: inherit;
    }

    .overlay-target-ring-edge[data-ring-edge='top'],
    .overlay-target-ring-edge[data-ring-edge='bottom'] {
      left: calc(var(--overlay-ring-edge) * -1);
      right: calc(var(--overlay-ring-edge) * -1);
      height: calc(var(--overlay-ring-edge) * 2);
    }

    .overlay-target-ring-edge[data-ring-edge='top'] {
      top: calc(var(--overlay-ring-edge) * -1);
    }

    .overlay-target-ring-edge[data-ring-edge='bottom'] {
      bottom: calc(var(--overlay-ring-edge) * -1);
    }

    .overlay-target-ring-edge[data-ring-edge='left'],
    .overlay-target-ring-edge[data-ring-edge='right'] {
      top: calc(var(--overlay-ring-edge) * -1);
      bottom: calc(var(--overlay-ring-edge) * -1);
      width: calc(var(--overlay-ring-edge) * 2);
    }

    .overlay-target-ring-edge[data-ring-edge='left'] {
      left: calc(var(--overlay-ring-edge) * -1);
    }

    .overlay-target-ring-edge[data-ring-edge='right'] {
      right: calc(var(--overlay-ring-edge) * -1);
    }

    .overlay-target-ring-edge:hover {
      background: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 14%, transparent);
    }

    .overlay-target-ring[data-selected='true'] {
      outline: 1px dashed ${CREATOR_CHROME_TOKENS.action};
      outline-offset: 4px;
    }

    .overlay-target-ring-edge:focus-visible {
      outline: 2px solid ${CREATOR_CHROME_TOKENS.action};
      outline-offset: 1px;
    }

    .overlay-pulse {
      position: fixed;
      z-index: 3;
      display: grid;
      width: 22px;
      height: 22px;
      place-items: center;
      border: 2px solid ${CREATOR_CHROME_TOKENS.focus};
      border-radius: 999px;
      background: ${CREATOR_CHROME_TOKENS.chrome};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      font: var(--lq-weight-bold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      transform: translate(-60%, -60%);
    }

    .overlay-pulse::after {
      position: absolute;
      inset: -4px;
      border: 2px solid ${CREATOR_CHROME_TOKENS.action};
      border-radius: 50%;
      opacity: 0.55;
      content: '';
      animation: overlay-pulse-halo 2.1s ease-out infinite;
      pointer-events: none;
    }

    @keyframes overlay-pulse-halo {
      0% {
        transform: scale(0.85);
        opacity: 0.6;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }

    .overlay-pulse[data-peer='true'] {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.peer};
      background: ${CREATOR_CHROME_STATUS_TOKENS.peer};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    .overlay-pulse[data-peer='true']::after {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.peer};
    }

    @media (prefers-reduced-motion: reduce) {
      .overlay-pulse::after {
        animation: none;
      }
    }

    .overlay-compass {
      position: fixed;
      z-index: 3;
      pointer-events: none;
      border: 1px dashed color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 45%, transparent);
      border-radius: 10px;
    }

    .overlay-compass-hit,
    .overlay-compass-retarget {
      position: absolute;
      display: grid;
      width: 20px;
      height: 20px;
      place-items: center;
      border: 0;
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.onAction};
      pointer-events: auto;
      cursor: pointer;
      padding: 0;
      transition:
        opacity ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ease,
        transform ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ease;
    }

    .overlay-compass-hit::before {
      width: 13px;
      height: 13px;
      border: 2px solid ${CREATOR_CHROME_TOKENS.onAction};
      border-radius: 50%;
      background: ${CREATOR_CHROME_TOKENS.action};
      box-shadow: ${CREATOR_CHROME_GLASS.shadowDot};
      content: '';
      transition: transform ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ease;
    }

    .overlay-compass-hit svg {
      display: none;
    }

    .overlay-compass-hit:hover::before,
    .overlay-compass-hit:focus-visible::before {
      transform: scale(1.28);
    }

    .overlay-compass-hit {
      transform: translate(-50%, -50%);
    }

    .overlay-compass-hit[data-align='start']::before,
    .overlay-compass-hit[data-align='end']::before {
      width: 11px;
      height: 11px;
      opacity: 0.55;
    }

    .overlay-compass-hit[data-align='start']:hover::before,
    .overlay-compass-hit[data-align='end']:hover::before,
    .overlay-compass-hit[data-align='start']:focus-visible::before,
    .overlay-compass-hit[data-align='end']:focus-visible::before {
      opacity: 1;
    }

    .overlay-compass-line {
      position: absolute;
      height: 0;
      border-top: 1px dashed ${CREATOR_CHROME_TOKENS.action};
      pointer-events: none;
      transform-origin: 0 0;
    }

    .overlay-compass-offset {
      position: absolute;
      left: 50%;
      top: -9px;
      transform: translateX(-50%);
      padding: 1px 5px;
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      border-radius: 5px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      color: ${CREATOR_CHROME_TOKENS.ink};
      font: var(--lq-weight-semibold) var(--lq-font-xs)/1.4 ${CREATOR_CHROME_FONT_STACK};
      pointer-events: none;
    }

    .overlay-compass-hit[aria-pressed='true']::before {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: ${CREATOR_CHROME_TOKENS.onAction};
      transform: scale(1.35);
    }

    .overlay-compass-retarget {
      left: auto;
      right: -11px;
      top: -11px;
      width: 22px;
      height: 22px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 50%;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      color: ${CREATOR_CHROME_TOKENS.onChrome};
      opacity: 0.85;
    }

    .overlay-compass-retarget:hover,
    .overlay-compass-retarget:focus-visible {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      opacity: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .overlay-compass-hit,
      .overlay-compass-retarget {
        transition: none;
      }

      .overlay-compass-hit:hover,
      .overlay-compass-retarget:hover,
      .overlay-compass-hit:focus-visible,
      .overlay-compass-retarget:focus-visible {
        transform: var(--overlay-compass-offset, none);
      }
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
      border: 1px solid color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 62%, transparent);
      border-radius: 15px;
      pointer-events: none;
    }

    .overlay-iframe-frame[data-resizing='true'] {
      border-color: ${CREATOR_CHROME_TOKENS.focus};
    }

    .overlay-card-tools {
      position: absolute;
      top: 0;
      left: 100%;
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin-left: 7px;
      pointer-events: auto;
    }

    .overlay-iframe-frame[data-card-tools-hidden='true'] .overlay-card-tools {
      opacity: 0;
      pointer-events: none;
    }

    .overlay-iframe-frame[data-card-tools='left'] .overlay-card-tools {
      left: auto;
      right: 100%;
      margin-right: ${Math.abs(OVERLAY_CHROME_GEOMETRY.cardGutterOffset) + 2}px;
      margin-left: 0;
    }


    .overlay-card-tool {
      display: grid;
      width: 22px;
      height: 22px;
      place-items: center;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 6px;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      cursor: pointer;
      padding: 0;
    }

    .overlay-card-tool[data-card-tool='move'] { cursor: grab; }
    .overlay-card-tool[data-card-tool='move']:active { cursor: grabbing; }

    .overlay-card-tool:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
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

    .overlay-size-tip {
      position: absolute;
      top: -26px;
      left: 50%;
      border-radius: 6px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      color: ${CREATOR_CHROME_TOKENS.ink};
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 5px 8px;
      pointer-events: none;
      transform: translateX(-50%);
      white-space: nowrap;
    }

    .overlay-iframe-frame .edge-resize-handle {
      position: absolute;
      z-index: 3;
      pointer-events: auto;
      touch-action: none;
    }

    /* The menu is in the iframe and this chrome is on the host, so no z-index wins. */
    :host([${AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE}]) .overlay-iframe-frame .edge-resize-handle,
    :host([${AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE}]) .overlay-card-tools {
      opacity: 0;
      pointer-events: none;
    }

    :host([${AUTHORING_FRAME_MENU_OPEN_ATTRIBUTE}]) .overlay-iframe-frame {
      border-color: transparent;
    }

    .overlay-iframe-frame .edge-resize-handle::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 9px;
      height: 9px;
      border: 1.5px solid ${CREATOR_CHROME_TOKENS.action};
      border-radius: 3px;
      background: ${CREATOR_CHROME_TOKENS.ink};
      transform: translate(-50%, -50%);
    }

    .overlay-iframe-frame[data-resize-at-limit~='width'] .edge-resize-handle[data-edge='e']::after,
    .overlay-iframe-frame[data-resize-at-limit~='width'] .edge-resize-handle[data-edge='w']::after,
    .overlay-iframe-frame[data-resize-at-limit~='height'] .edge-resize-handle[data-edge='n']::after,
    .overlay-iframe-frame[data-resize-at-limit~='height'] .edge-resize-handle[data-edge='s']::after {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.attention};
      background: ${CREATOR_CHROME_STATUS_TOKENS.attention};
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

    /* Transient notices, bottom centre. §4.1 said top centre, which is where
       every full-bleed sheet puts its title and lede — the coach tip covered
       the opening line of whatever section you had just opened. Above the modal
       and the palette: a notice raised from inside either has to stay readable. */
    .overlay-toasts {
      position: fixed;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding + 52}px;
      left: 50%;
      z-index: 9;
      display: flex;
      max-width: min(90vw, 620px);
      flex-direction: column;
      align-items: center;
      gap: 8px;
      /* The stack is not a target; each notice inside it is. */
      pointer-events: none;
      transform: translateX(-50%);
    }

    /* Keep notices above the caption rail without relying on :has(). */
    .overlay-captions:not([hidden]) ~ .overlay-toasts {
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding + 108}px;
    }

    .overlay-toast {
      display: flex;
      align-items: center;
      gap: 11px;
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      border-radius: 10px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.5 ${CREATOR_CHROME_FONT_STACK};
      padding: 9px 13px;
      pointer-events: auto;
      animation: overlay-toast-in 220ms ${OVERLAY_CHROME_MOTION.surfaceMoveEasing} both;
    }

    @keyframes overlay-toast-in {
      from { opacity: 0; transform: translateY(8px); }
    }

    .overlay-toast[data-leaving='true'] {
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 280ms ease, transform 280ms ease;
    }

    /* Tint only — the message itself always carries the meaning. */
    .overlay-toast[data-kind='positive'] {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.positive};
    }
    .overlay-toast[data-kind='warning'] {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    }
    .overlay-toast[data-kind='danger'] {
      border-color: ${CREATOR_CHROME_STATUS_TOKENS.danger};
    }

    .overlay-toast-action {
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
      border-radius: 6px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: var(--lq-weight-regular) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 4px 10px;
      white-space: nowrap;
    }

    .overlay-toast-action:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    }

    @media (prefers-reduced-motion: reduce) {
      .overlay-toast {
        animation: none;
      }
      .overlay-toast[data-leaving='true'] {
        transition: none;
      }
    }


    .overlay-mode-pill {
      position: fixed;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 9px;
      height: ${OVERLAY_CHROME_GEOMETRY.pillHeight}px;
      padding: 0 8px 0 5px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 11px;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      color: ${CREATOR_CHROME_TOKENS.ink};
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.2 ${CREATOR_CHROME_FONT_STACK};
      white-space: nowrap;
      transition: left ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ${OVERLAY_CHROME_MOTION.surfaceMoveEasing},
        top ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ${OVERLAY_CHROME_MOTION.surfaceMoveEasing};
    }

    .overlay-mode-pill[data-dragging='true'] {
      transition: none;
      cursor: grabbing;
    }

    .overlay-filmstrip,
    .overlay-mode-pill {
      left: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      transition: inset ${OVERLAY_CHROME_MOTION.chromeAvoidMs}ms ${OVERLAY_CHROME_MOTION.surfaceMoveEasing};
    }
    :is(.overlay-filmstrip, .overlay-mode-pill)[data-corner='bottom-right'] {
      left: auto;
      right: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      top: auto;
    }
    :is(.overlay-filmstrip, .overlay-mode-pill)[data-corner='bottom-left'] {
      left: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      right: auto;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      top: auto;
    }
    :is(.overlay-filmstrip, .overlay-mode-pill)[data-corner='top-right'] {
      left: auto;
      right: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      top: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      bottom: auto;
    }
    :is(.overlay-filmstrip, .overlay-mode-pill)[data-corner='top-left'] {
      left: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      right: auto;
      top: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      bottom: auto;
    }

    .overlay-mode-pill[data-collapsed='true'] {
      width: ${OVERLAY_CHROME_GEOMETRY.pillCollapsedSize}px;
      height: ${OVERLAY_CHROME_GEOMETRY.pillCollapsedSize}px;
      padding: 0;
      border-radius: 50%;
      justify-content: center;
      overflow: hidden;
    }

    .overlay-mode-pill-dot {
      display: grid;
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: 50%;
      background: none;
      cursor: pointer;
      padding: 0;
      place-items: center;
    }

    .overlay-mode-pill-dot > span {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: ${CREATOR_CHROME_TOKENS.action};
    }

    .overlay-mode-pill-switch {
      display: flex;
      gap: 2px;
      padding: 2px;
      border-radius: 8px;
      background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
    }

    .overlay-mode-pill-switch button {
      display: flex;
      align-items: center;
      gap: 6px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.muted};
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1.25 ${CREATOR_CHROME_FONT_STACK};
      padding: 6px 11px;
    }

    .overlay-mode-pill-switch button:hover {
      color: ${CREATOR_CHROME_TOKENS.ink};
    }

    .overlay-mode-pill-grip {
      display: flex;
      align-items: center;
      color: ${CREATOR_CHROME_TOKENS.subtle};
      cursor: grab;
    }

    .overlay-mode-pill-preview,
    .overlay-mode-pill-icon {
      display: flex;
      height: 24px;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 0;
      border-radius: ${OVERLAY_CHROME_GEOMETRY.controlRadius}px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.quiet};
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      cursor: pointer;
      font: var(--lq-weight-regular) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 0 7px;
      white-space: nowrap;
    }

    .overlay-mode-pill-preview:hover,
    .overlay-mode-pill-icon:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    .overlay-mode-pill-switch button[aria-checked='true'] {
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font-weight: var(--lq-weight-bold);
    }

    .overlay-mode-pill-status {
      display: flex;
      align-items: center;
      gap: 6px;
      color: ${CREATOR_CHROME_TOKENS.muted};
      font-size: var(--lq-font-sm);
    }

    .overlay-mode-pill-rule {
      width: 1px;
      height: 13px;
      background: ${CREATOR_CHROME_TOKENS.border};
    }

    .overlay-mode-pill-env {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: ${CREATOR_CHROME_TOKENS.ink};
      font-weight: var(--lq-weight-semibold);
    }

    .overlay-mode-pill-diverged {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    }

    .overlay-mode-pill-faces {
      display: flex;
      align-items: center;
    }

    .overlay-mode-pill-face {
      display: grid;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      border: 1.5px solid ${CREATOR_CHROME_TOKENS.canvas};
      border-radius: 50%;
      margin-left: -6px;
      background: ${CREATOR_CHROME_STATUS_TOKENS.peer};
      color: ${CREATOR_CHROME_TOKENS.onImage};
      font: var(--lq-weight-bold) 8px/1 ${CREATOR_CHROME_FONT_STACK};
      place-items: center;
    }

    .overlay-mode-pill-face:first-child {
      margin-left: 0;
    }

    .overlay-mode-pill-face[data-peer-overflow] {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.quiet};
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
    }

    .overlay-mode-pill-peers-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .overlay-filmstrip-steps > li {
      position: relative;
    }

    .overlay-filmstrip-peers {
      position: absolute;
      display: flex;
      inset-block-end: -4px;
      inset-inline-start: 50%;
      gap: 2px;
      transform: translateX(-50%);
    }

    .overlay-filmstrip-peer {
      display: inline-flex;
      min-width: 14px;
      height: 14px;
      align-items: center;
      justify-content: center;
      border: 1px solid ${CREATOR_CHROME_TOKENS.surface};
      border-radius: 999px;
      background: ${CREATOR_CHROME_STATUS_TOKENS.peer};
      padding: 0 2px;
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font: var(--lq-weight-semibold) 8px/1 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-filmstrip-peer[data-selecting='true'] {
      outline: 1px solid ${CREATOR_CHROME_STATUS_TOKENS.attention};
      outline-offset: 1px;
    }

    .overlay-mode-pill-tone {
      width: 6px;
      height: 6px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: ${CREATOR_CHROME_STATUS_TOKENS.positive};
    }
    .overlay-mode-pill-tone[data-tone='attention'] {
      background: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    }
    .overlay-mode-pill-tone[data-tone='danger'] {
      background: ${CREATOR_CHROME_STATUS_TOKENS.danger};
    }

    .overlay-mode-pill-progress {
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
    }

    .overlay-mode-pill-icon {
      min-width: 24px;
    }

    .overlay-mode-pill-quiet,
    .overlay-mode-pill-primary {
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 7px;
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 6px 11px;
    }

    .overlay-mode-pill-quiet {
      background: ${CREATOR_CHROME_TOKENS.surfaceStrong};
      color: ${CREATOR_CHROME_TOKENS.ink};
    }

    .overlay-mode-pill-primary {
      background: ${CREATOR_CHROME_TOKENS.action};
      border-color: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
    }

    .overlay-mode-pill-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 6px);
      min-width: 196px;
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      border-radius: 9px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
      padding: 5px;
      white-space: normal;
    }

    .overlay-mode-pill[data-corner^='top'] .overlay-mode-pill-menu {
      top: calc(100% + 6px);
      bottom: auto;
    }

    .overlay-mode-pill-menu button {
      border: 0;
      border-radius: ${OVERLAY_CHROME_GEOMETRY.controlRadius}px;
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 9px;
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.25 ${CREATOR_CHROME_FONT_STACK};
      padding: 7px 9px;
      text-align: left;
    }

    .overlay-mode-pill-menu button > span {
      flex: 1;
    }

    .overlay-mode-pill-menu button > svg {
      flex: none;
    }

    /*
     * The submenu marker: trailing edge, reading direction, never flipped by
     * where the flyout happens to open. See the note in mode-pill.ts.
     *
     * Leading it instead would indent the three submenu rows by its own width
     * and their icons would stop lining up with the fifteen rows that have none.
     *
     * Addressed through the button, not on its own class: the generic row rule
     * above is ".overlay-mode-pill-menu button > span { flex: 1 }" and this is a
     * span child too, so on its own it lost, grew to half the row, and wrapped
     * every submenu label onto a second line.
     */
    .overlay-mode-pill-menu button > .overlay-mode-pill-menu-more {
      display: flex;
      flex: none;
      align-items: center;
      margin-right: -2px;
      color: ${CREATOR_CHROME_TOKENS.subtle};
    }

    /* Reading direction, so the marker still trails the label in Arabic. */
    :host([dir='rtl']) .overlay-mode-pill-menu button > .overlay-mode-pill-menu-more,
    [dir='rtl'] .overlay-mode-pill-menu button > .overlay-mode-pill-menu-more {
      transform: scaleX(-1);
    }

    .overlay-mode-pill-menu button[data-pill-submenu]:hover .overlay-mode-pill-menu-more,
    .overlay-mode-pill-menu button[aria-expanded='true'] .overlay-mode-pill-menu-more {
      color: inherit;
    }

    .overlay-mode-pill-menu button[aria-expanded='true'] {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    /* The shortcut is a reminder, never the only way in (§3.1a). */
    .overlay-mode-pill-menu-key {
      color: ${CREATOR_CHROME_TOKENS.subtle};
      font: var(--lq-weight-regular) var(--lq-font-xs)/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      flex: none;
    }

    .overlay-mode-pill-menu button[aria-current='true'] .overlay-mode-pill-menu-key {
      color: inherit;
      opacity: 0.75;
    }

    /*
     * Says why a disabled row is disabled, next to the row itself.
     *
     * A zero width with a 100% min-width keeps a sentence out of the menu's
     * max-content width — the rows decide how wide the menu is, and the note
     * wraps into whatever that turns out to be, rather than stretching it.
     */
    .overlay-mode-pill-menu-note {
      width: 0;
      min-width: 100%;
      margin: 0;
      color: ${CREATOR_CHROME_TOKENS.muted};
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.5 ${CREATOR_CHROME_FONT_STACK};
      padding: 6px 9px;
    }

    /* The keyboard map is the big modal's now — see overlay/keyboard-map.ts (§10). */

    .overlay-mode-pill-menu-rule {
      height: 1px;
      margin: 4px 0;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
    }

    /* The group heading does the separating, so rows do not each carry a rule. */
    .overlay-mode-pill-menu-group {
      margin: 4px 0 0;
      border-top: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      color: ${CREATOR_CHROME_TOKENS.subtle};
      font: var(--lq-weight-bold) var(--lq-font-xs)/1 ${CREATOR_CHROME_FONT_STACK};
      letter-spacing: 0.1em;
      padding: 11px 9px 5px;
      text-transform: uppercase;
    }

    .overlay-mode-pill-menu-group:first-child {
      border-top: 0;
      margin-top: 0;
      padding-top: 7px;
    }

    .overlay-mode-pill-menu button[aria-current='true'] {
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font-weight: var(--lq-weight-bold);
    }

    .overlay-mode-pill-menu button[disabled] {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .overlay-mode-pill-menu button:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    .overlay-mode-pill-menu button[disabled]:hover {
      background: transparent;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
    }

    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) .overlay-filmstrip,
    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) .overlay-pulses,
    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) .overlay-compass,
    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) .overlay-target-ring,
    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) .overlay-iframe-frame,
    :host([${AUTHORING_BROWSING_ATTRIBUTE}]) slot[name="authoring-frame"]::slotted(iframe) {
      opacity: ${OVERLAY_CHROME_GHOST_OPACITY.browsing};
      pointer-events: none;
      transition: opacity ${OVERLAY_CHROME_MOTION.modeFadeMs}ms ease;
    }

    /* The iframe itself must stop taking pointer events, or picking hits a dead zone. */
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) slot[name="authoring-frame"]::slotted(iframe) {
      opacity: ${OVERLAY_CHROME_GHOST_OPACITY.browsing};
      pointer-events: none;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-target-ring,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-filmstrip,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-pulses,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-compass,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-target-ring,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="operations"]) .overlay-mode-pill,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-filmstrip,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-pulses,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-iframe-frame,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-target-ring,
    :host([${AUTHORING_SHELL_ATTRIBUTE}="previewing"]) .overlay-operations-dimmer,
    :host([${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) .overlay-target-ring,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-filmstrip,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-pulses,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-iframe-frame,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-compass,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-target-ring,
    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-operations-dimmer,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-filmstrip,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-pulses,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-iframe-frame,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-compass,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-target-ring,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-operations-dimmer,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .overlay-mode-pill {
      visibility: hidden;
      pointer-events: none;
    }

    .overlay-show-chip {
      position: fixed;
      right: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      z-index: 6;
      display: none;
      align-items: center;
      gap: 7px;
      height: 32px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 16px;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.5 ${CREATOR_CHROME_FONT_STACK};
      pointer-events: auto;
      padding: 0 12px;
    }

    .overlay-show-chip:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    }

    :host([${AUTHORING_PANELS_HIDDEN_ATTRIBUTE}]) .overlay-show-chip {
      display: flex;
    }

    ${bandStyles(6)}

    .overlay-lock-band {
      position: absolute;
    }

    .overlay-preview-bar {
      position: fixed;
      bottom: ${OVERLAY_CHROME_GEOMETRY.stagePadding}px;
      left: 50%;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 9px;
      height: 40px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 12px;
      background: ${CREATOR_CHROME_GLASS.background};
      backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
      box-shadow: ${CREATOR_CHROME_GLASS.shadow};
      color: ${CREATOR_CHROME_TOKENS.ink};
      font: var(--lq-weight-regular) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 0 8px 0 12px;
      pointer-events: auto;
      transform: translateX(-50%);
      user-select: none;
    }

    .overlay-preview-bar-progress {
      white-space: nowrap;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
    }

    .overlay-preview-bar-icon,
    .overlay-preview-bar-button {
      display: flex;
      height: 28px;
      align-items: center;
      gap: 6px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 8px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
      padding: 0 11px;
      white-space: nowrap;
    }

    .overlay-preview-bar-icon {
      justify-content: center;
      width: 28px;
      padding: 0;
    }

    .overlay-preview-bar-icon:hover:not(:disabled),
    .overlay-preview-bar-button:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    }

    /* Captions on. A toggle has to show its state, not only accept the click. */
    .overlay-preview-bar-icon[aria-pressed='true']:not(:disabled) {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
    }

    .overlay-preview-bar-icon:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .overlay-preview-bar-button[data-primary='true'] {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font-weight: var(--lq-weight-bold);
    }

    .overlay-big-modal {
      position: fixed;
      inset: 0;
      z-index: 7;
      display: grid;
      background: ${CREATOR_CHROME_TOKENS.imageScrim};
      place-items: center;
      pointer-events: auto;
    }

    .overlay-big-modal[hidden] {
      display: none;
    }

    .overlay-big-modal-sheet {
      display: flex;
      width: min(720px, 92vw);
      max-height: 82vh;
      flex-direction: column;
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      border-radius: 14px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
      color: ${CREATOR_CHROME_TOKENS.ink};
      overflow: hidden;
      font: var(--lq-weight-regular) var(--lq-font-md)/1.55 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-big-modal-header {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      padding: 14px 16px;
    }

    .overlay-big-modal-header b {
      flex: 1;
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
      font: var(--lq-weight-semibold) var(--lq-font-md)/1.3 ${CREATOR_CHROME_FONT_STACK};
      letter-spacing: -0.01em;
    }

    .overlay-big-modal-close {
      display: flex;
      width: 26px;
      height: 26px;
      align-items: center;
      justify-content: center;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 7px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      cursor: pointer;
    }

    .overlay-big-modal-close:hover {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    .overlay-big-modal-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }

    .overlay-big-modal-note {
      margin: 0 0 12px;
      color: ${CREATOR_CHROME_TOKENS.muted};
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.55 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-big-modal-table {
      width: 100%;
      border-collapse: collapse;
    }

    .overlay-big-modal-table td {
      border-top: 1px solid ${CREATOR_CHROME_TOKENS.borderSoft};
      padding: 7px 0;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      vertical-align: baseline;
    }

    .overlay-big-modal-table tr:first-child td {
      border-top: 0;
    }

    .overlay-big-modal-table td:first-child {
      width: 150px;
    }

    .overlay-big-modal-table kbd {
      display: inline-block;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 5px;
      background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
      padding: 2px 7px;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      font: var(--lq-weight-regular) var(--lq-font-sm)/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .overlay-big-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      border-top: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      padding: 12px 16px;
      background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
    }

    .overlay-big-modal-button {
      min-height: 28px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 8px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
      padding: 6px 13px;
      color: ${CREATOR_CHROME_TOKENS.ink};
      cursor: pointer;
      font: var(--lq-weight-semibold) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-big-modal-button[data-primary='true'] {
      border-color: ${CREATOR_CHROME_TOKENS.action};
      background: ${CREATOR_CHROME_TOKENS.action};
      color: ${CREATOR_CHROME_TOKENS.onAction};
      font-weight: var(--lq-weight-bold);
    }

    .overlay-palette {
      position: fixed;
      top: 88px;
      left: 50%;
      z-index: 8;
      width: min(620px, 92vw);
      border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      border-radius: 13px;
      background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
      box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
      color: ${CREATOR_CHROME_TOKENS.ink};
      overflow: hidden;
      pointer-events: auto;
      transform: translateX(-50%);
      font: var(--lq-weight-regular) var(--lq-font-md)/1.5 ${CREATOR_CHROME_FONT_STACK};
    }

    .overlay-palette[hidden] {
      display: none;
    }

    .overlay-palette-input {
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
      padding: 13px 15px;
    }

    .overlay-palette-input input {
      flex: 1;
      border: 0;
      background: none;
      color: ${CREATOR_CHROME_TOKENS.ink};
      font: var(--lq-weight-regular) var(--lq-font-md)/1.4 ${CREATOR_CHROME_FONT_STACK};
      outline: none;
    }

    .overlay-palette-input input::placeholder {
      color: ${CREATOR_CHROME_TOKENS.subtle};
    }

    .overlay-palette-input kbd {
      color: ${CREATOR_CHROME_TOKENS.subtle};
      font: var(--lq-weight-regular) var(--lq-font-xs)/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .overlay-palette-list {
      max-height: 320px;
      padding: 6px;
      overflow-y: auto;
    }

    .overlay-palette-row {
      display: flex;
      align-items: center;
      gap: 10px;
      border-radius: 8px;
      padding: 9px 11px;
      color: ${CREATOR_CHROME_TOKENS.inkSoft};
      cursor: pointer;
    }

    .overlay-palette-row:hover,
    .overlay-palette-row[data-active='true'] {
      background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
      color: ${CREATOR_CHROME_TOKENS.inkStrong};
    }

    .overlay-palette-row[aria-disabled='true'] {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .overlay-palette-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .overlay-palette-group {
      margin-left: auto;
      padding-left: 12px;
      color: ${CREATOR_CHROME_TOKENS.subtle};
      font-size: var(--lq-font-sm);
      white-space: nowrap;
    }

    /*
     * The experiences submenu, shared with the launcher's palette on the host
     * page. The same stylesheet is added to both roots so the two routes to
     * these menus are the same pixels rather than two drawings of one idea.
     */
    ${EXPERIENCE_MENU_CSS}
    ${EXPERIENCE_NAME_DIALOG_CSS}
    `,
  );
}
