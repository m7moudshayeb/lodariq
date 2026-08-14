import { createNonceStyleElement } from '@lodariq/schema/dom';
import {
  AUTHORING_CONTEXT_SURFACE_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_TOKENS,
} from '../creator-chrome-tokens';
import {
  AUTHORING_PANEL_LAYOUT_ATTRIBUTE,
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_TARGET_PICKING_ATTRIBUTE,
  AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE,
} from './panel-attributes';

export interface AuthoringPanelStyleOptions {
  defaultHeight: number;
  defaultWidth: number;
  headerHeight: number;
}

export function createPanelStyles({
  defaultHeight,
  defaultWidth,
  headerHeight,
}: AuthoringPanelStyleOptions): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      top: 16px;
      right: 16px;
      bottom: auto;
      display: block;
      width: min(${defaultWidth}px, calc(100vw - 32px));
      height: min(${defaultHeight}px, calc(100dvh - 32px));
      max-width: calc(100vw - 32px);
      max-height: calc(100dvh - 32px);
      min-height: min(320px, calc(100dvh - 32px));
      z-index: 2147483646;
      pointer-events: auto;
      font-family: ${CREATOR_CHROME_FONT_STACK};
      box-sizing: border-box;
      color-scheme: light;
    }

    .panel {
      position: relative;
      display: grid;
      grid-template-rows: ${headerHeight}px minmax(0, 1fr);
      width: 100%;
      height: 100%;
      border-radius: 16px;
      background: #ffffff;
      box-shadow:
        0 24px 60px rgba(15, 36, 31, 0.18),
        0 6px 18px rgba(15, 36, 31, 0.12),
        0 0 0 1px rgba(15, 76, 64, 0.08) inset;
      isolation: isolate;
    }

    .authoring-bar {
      position: relative;
      z-index: 3;
      display: flex;
      min-width: 0;
      height: ${headerHeight}px;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border: 1px solid #0c211c;
      border-bottom-color: #0c211c;
      border-radius: 16px 16px 0 0;
      background: #0c211c;
      color: #ffffff;
      cursor: grab;
      padding: 0 8px 0 16px;
      box-sizing: border-box;
      touch-action: none;
      user-select: none;
    }

    .authoring-bar[data-lodariq-authoring-dragging="true"] {
      cursor: grabbing;
    }

    .authoring-bar button,
    .authoring-bar input,
    .authoring-bar select,
    .authoring-bar summary {
      cursor: pointer;
      touch-action: auto;
      user-select: auto;
    }

    .authoring-bar input {
      cursor: text;
    }

    .panel-surface {
      position: relative;
      z-index: 2;
      min-width: 0;
      min-height: 0;
      width: 100%;
      height: 100%;
      border: 1px solid #d8dfe1;
      border-top: 0;
      border-radius: 0 0 16px 16px;
      background: transparent;
      overflow: hidden;
      box-sizing: border-box;
    }

    .panel-drag-handle {
      position: absolute;
      top: 0;
      left: 0;
      display: flex;
      width: 16px;
      min-width: 16px;
      height: 100%;
      flex: 0 0 16px;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 16px 0 0 0;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }

    .panel-drag-handle[data-lodariq-authoring-dragging="true"] {
      cursor: grabbing;
    }

    .panel-drag-handle:focus-visible {
      outline: 3px solid color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 82%, transparent);
      outline-offset: -4px;
    }

    .panel-drag-grip {
      display: none;
      width: 24px;
      height: 40px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.72);
      opacity: 0.82;
    }

    .panel-drag-handle:hover .panel-drag-grip {
      background: rgba(255, 255, 255, 0.07);
      color: #ffffff;
      opacity: 1;
    }

    .panel-heading {
      display: flex;
      min-width: 0;
      flex: 1 1 auto;
      align-items: center;
      gap: 12px;
    }

    .panel-title-cluster {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 16px;
    }

    .panel-document-title {
      display: block;
      min-width: 0;
      width: min(160px, 20vw);
      overflow: hidden;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: #ffffff;
      font-family: inherit;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
      margin: 0;
      outline: 0;
      padding: 8px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-document-title:hover,
    .panel-document-title:focus {
      border-color: rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.07);
    }

    .panel-document-title:focus-visible {
      outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
      outline-offset: 1px;
    }

    .panel-step-status {
      display: inline-flex;
      min-height: 36px;
      flex: 0 0 auto;
      align-items: center;
      border-left: 1px solid rgba(255, 255, 255, 0.16);
      color: rgba(255, 255, 255, 0.86);
      font-size: 12px;
      font-weight: 600;
      padding: 0 16px;
      white-space: nowrap;
    }

    .return-to-editor {
      display: none;
      min-height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 650;
      padding: 0 12px;
      white-space: nowrap;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .return-to-editor {
      display: inline-flex;
      align-items: center;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"]) {
      top: 16px !important;
      right: 50% !important;
      left: auto !important;
      width: max-content !important;
      max-width: calc(100vw - 32px);
      transform: translateX(50%);
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .panel,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .authoring-bar {
      width: max-content;
      max-width: calc(100vw - 32px);
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .authoring-bar {
      cursor: default;
      padding: 0 8px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .panel-drag-handle,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .panel-heading {
      display: none;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      .panel-document-title,
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      [data-panel-zoom-control],
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      [data-panel-layout-control],
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      [data-panel-action="minimize"],
    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"][${AUTHORING_PREVIEW_ACTIVE_ATTRIBUTE}="true"])
      [data-panel-action="close-panel"] {
      display: none;
    }

    .target-picking-label {
      display: none;
      overflow: hidden;
      color: ${CREATOR_CHROME_TOKENS.ink};
      font-size: 12px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .authoring-bar-actions {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 8px;
    }

    .panel-chrome-save-status {
      display: inline-flex;
      min-height: 36px;
      align-items: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.74);
      font-size: 12px;
      font-weight: 600;
      padding: 0 8px;
      white-space: nowrap;
    }

    .panel-chrome-save-status[data-state='error'] {
      color: #f6b3a6;
    }

    .panel-chrome-action {
      display: inline-flex;
      min-height: 40px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 0 12px;
    }

    .panel-chrome-action:hover,
    .panel-chrome-action:focus-visible {
      border-color: rgba(255, 255, 255, 0.32);
      background: rgba(255, 255, 255, 0.12);
    }

    .panel-chrome-action.primary {
      min-width: 160px;
      border-color: #0b6655;
      background: #0b6655;
    }

    .panel-chrome-action.primary:hover,
    .panel-chrome-action.primary:focus-visible {
      border-color: #14816c;
      background: #14816c;
    }

    .panel-chrome-action-icon,
    .panel-chrome-action-icon svg {
      display: block;
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
    }

    .panel-overflow {
      position: relative;
      flex: 0 0 auto;
    }

    .panel-overflow > summary {
      list-style: none;
    }

    .panel-overflow > summary::-webkit-details-marker {
      display: none;
    }

    .panel-overflow-menu {
      position: absolute;
      z-index: 12;
      top: calc(100% + 8px);
      right: 0;
      display: grid;
      width: 240px;
      gap: 4px;
      border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
      border-radius: 12px;
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
      box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
      padding: 8px;
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
      cursor: default;
    }

    .panel-overflow:not([open]) .panel-overflow-menu {
      display: none;
    }

    .panel-overflow-control {
      min-width: 0;
    }

    .panel-overflow-action {
      display: grid;
      min-height: 40px;
      grid-template-columns: 20px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 0 12px;
      text-align: left;
    }

    .panel-overflow-action:hover,
    .panel-overflow-action:focus-visible {
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    }

    .panel-overflow-action.danger {
      color: #a33a3a;
    }

    .panel-overflow-action svg {
      display: block;
      width: 16px;
      height: 16px;
    }

    .header-action {
      position: relative;
      display: grid;
      width: 36px;
      height: 36px;
      min-height: 36px;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: rgba(255, 255, 255, 0.82);
      font: inherit;
      cursor: pointer;
    }

    .header-action:hover,
    .header-action:focus-visible {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.07);
      color: #ffffff;
    }

    .header-action::after {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 7;
      max-width: 180px;
      border: 1px solid ${CREATOR_CHROME_TOKENS.border};
      border-radius: 8px;
      background: ${CREATOR_CHROME_TOKENS.surface};
      color: ${CREATOR_CHROME_TOKENS.ink};
      content: attr(data-tooltip);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      opacity: 0;
      padding: 8px 8px;
      pointer-events: none;
      transform: translateY(-2px);
      transition: opacity 120ms ease, transform 120ms ease;
      white-space: nowrap;
    }

    .header-action:hover::after,
    .header-action:focus-visible::after {
      opacity: 1;
      transform: translateY(0);
    }

    .header-action-icon,
    .header-action-icon svg {
      display: block;
      width: 18px;
      height: 16px;
    }

    .panel-layout-combobox {
      position: relative;
      flex: 0 0 auto;
    }

    .panel-layout-trigger {
      display: inline-flex;
      height: 36px;
      min-width: 112px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
    }

    .panel-layout-trigger:hover,
    .panel-layout-trigger:focus-visible,
    .panel-layout-combobox[data-open] .panel-layout-trigger {
      border-color: rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.11);
    }

    .panel-layout-trigger-icon,
    .panel-layout-option-icon,
    .panel-layout-chevron {
      display: block;
      flex: 0 0 auto;
    }

    .panel-layout-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .panel-layout-chevron {
      opacity: 0.72;
      transition: transform 140ms ease;
    }

    .panel-layout-combobox[data-open] .panel-layout-chevron {
      transform: rotate(180deg);
    }

    .panel-layout-listbox {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 8;
      display: grid;
      width: 176px;
      gap: 4px;
      border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
      border-radius: 12px;
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
      padding: 8px;
      box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
      box-sizing: border-box;
    }

    .panel-layout-listbox[hidden] {
      display: none;
    }

    .panel-layout-option {
      display: flex;
      min-height: 40px;
      align-items: center;
      gap: 8px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 12px;
      text-align: left;
    }

    .panel-layout-option[hidden] {
      display: none;
    }

    .panel-layout-option:hover,
    .panel-layout-option:focus-visible {
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    }

    .panel-zoom-combobox {
      position: relative;
      flex: 0 0 auto;
    }

    .panel-zoom-trigger {
      display: inline-flex;
      height: 36px;
      min-width: 84px;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
    }

    .panel-zoom-trigger:hover,
    .panel-zoom-trigger:focus-visible,
    .panel-zoom-combobox[data-open] .panel-zoom-trigger {
      border-color: rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.11);
    }

    .panel-zoom-trigger > svg,
    .panel-zoom-chevron {
      display: block;
      flex: 0 0 auto;
    }

    .panel-zoom-value {
      white-space: nowrap;
    }

    .panel-zoom-chevron {
      opacity: 0.68;
      transition: transform 140ms ease;
    }

    .panel-zoom-combobox[data-open] .panel-zoom-chevron {
      transform: rotate(180deg);
    }

    .panel-zoom-listbox {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 8;
      display: grid;
      width: 104px;
      gap: 4px;
      border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
      border-radius: 12px;
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
      padding: 4px;
      box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
      box-sizing: border-box;
    }

    .panel-zoom-listbox[hidden] {
      display: none;
    }

    .panel-zoom-option {
      min-height: 36px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 8px;
      text-align: left;
    }

    .panel-zoom-option[hidden] {
      display: none;
    }

    .panel-zoom-option:hover,
    .panel-zoom-option:focus-visible {
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    }

    .panel-overflow-menu .panel-layout-trigger,
    .panel-overflow-menu .panel-zoom-trigger {
      width: 100%;
      min-width: 0;
      justify-content: flex-start;
      border-color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
      padding: 0 12px;
    }

    .panel-overflow-menu .panel-layout-trigger:hover,
    .panel-overflow-menu .panel-layout-trigger:focus-visible,
    .panel-overflow-menu .panel-zoom-trigger:hover,
    .panel-overflow-menu .panel-zoom-trigger:focus-visible {
      border-color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
      background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
      color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    }

    .panel-overflow-menu .panel-layout-value,
    .panel-overflow-menu .panel-zoom-value {
      flex: 1 1 auto;
      text-align: left;
    }

    .panel-resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      z-index: 5;
      display: grid;
      width: 24px;
      height: 24px;
      place-items: end;
      padding: 0 4px 4px 0;
      border: 0;
      border-radius: 0 0 12px 0;
      background: transparent;
      color: #65716d;
      cursor: nwse-resize;
      touch-action: none;
    }

    .panel-resize-handle:hover,
    .panel-resize-handle:focus-visible,
    .panel-resize-handle[data-lodariq-authoring-resizing="true"] {
      background: transparent;
      color: #003f35;
    }

    .panel-resize-icon {
      display: block;
      width: 18px;
      height: 16px;
      overflow: visible;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-width: 2;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.48;
    }

    button:focus-visible {
      outline: 3px solid color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 76%, transparent);
      outline-offset: 2px;
    }

    slot[name="authoring-frame"] {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    ::slotted(iframe[slot="authoring-frame"]) {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
      pointer-events: auto;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) {
      width: min(300px, calc(100vw - 24px));
      height: 44px;
      max-height: 44px;
      min-height: 44px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel {
      grid-template-rows: 44px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .authoring-bar {
      height: 44px;
      border-bottom-color: ${CREATOR_CHROME_TOKENS.border};
      border-radius: 999px;
      padding-right: 0;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-drag-handle {
      position: relative;
      top: auto;
      left: auto;
      width: auto;
      min-width: 0;
      flex: 1 1 auto;
      justify-content: center;
      border-radius: 999px;
      padding: 0 16px;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-drag-grip,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-heading,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .authoring-bar-actions,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-resize-handle,
    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .panel-surface {
      display: none;
    }

    :host([${AUTHORING_TARGET_PICKING_ATTRIBUTE}="true"]) .target-picking-label {
      display: inline;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) {
      height: 44px;
      max-height: 44px;
      min-height: 44px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel {
      grid-template-rows: 44px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .authoring-bar {
      height: 44px;
      border-bottom-color: ${CREATOR_CHROME_TOKENS.border};
      border-radius: 999px;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel-surface {
      display: none;
    }

    :host([${AUTHORING_PANEL_MINIMIZED_ATTRIBUTE}="true"]) .panel-resize-handle {
      display: none;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .authoring-bar {
      gap: 4px;
      padding-right: 4px;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-heading {
      gap: 4px;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-document-title {
      width: 78px;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-layout-value {
      display: none;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-layout-trigger {
      width: 38px;
      min-width: 38px;
      gap: 4px;
      padding: 0 4px;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-zoom-trigger {
      width: 66px;
      min-width: 66px;
      gap: 4px;
      padding: 0 4px;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-zoom-trigger-icon {
      display: none;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-step-status,
    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-chrome-save-status,
    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-chrome-action {
      display: none;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-overflow-menu .panel-layout-value,
    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-overflow-menu .panel-zoom-value {
      display: block;
    }

    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-overflow-menu .panel-layout-trigger,
    :host([${AUTHORING_PANEL_LAYOUT_ATTRIBUTE}="compact"]) .panel-overflow-menu .panel-zoom-trigger {
      width: 100%;
      min-width: 0;
      padding: 0 12px;
    }

    @media (max-width: 600px) {
      :host {
        top: 72px;
        right: 12px;
        width: min(320px, calc(100vw - 24px));
        height: min(480px, 72dvh);
        max-height: calc(100dvh - 94px);
        min-height: min(260px, calc(100dvh - 94px));
        max-width: calc(100vw - 24px);
      }

      .authoring-bar {
        padding-right: 4px;
      }

      .panel-drag-grip {
        display: none;
      }

      .panel-heading {
        gap: 4px;
      }

      .panel-document-title {
        width: 78px;
      }

      .panel-step-status,
      .panel-chrome-save-status,
      .panel-chrome-action {
        display: none;
      }

      .panel-layout-value {
        display: none;
      }

      .panel-layout-trigger {
        width: 38px;
        min-width: 38px;
        gap: 4px;
        padding: 0 4px;
      }

      .panel-zoom-trigger {
        width: 66px;
        min-width: 66px;
        gap: 4px;
        padding: 0 4px;
      }

      .panel-zoom-trigger-icon {
        display: none;
      }

      .panel-overflow-menu .panel-layout-value,
      .panel-overflow-menu .panel-zoom-value {
        display: block;
      }

      .panel-overflow-menu .panel-layout-trigger,
      .panel-overflow-menu .panel-zoom-trigger {
        width: 100%;
        min-width: 0;
        padding: 0 12px;
      }

      .panel-resize-handle {
        display: none;
      }

    }
  `,
  );
}
