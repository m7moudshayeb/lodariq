import { createNonceStyleElement } from '@lodariq/schema/csp';
import type { LodariqBrowserApi } from '@lodariq/sdk-runtime/lodariq-loader';
import { LOCAL_AUTHORING_PANEL_TOGGLE_EVENT } from '../authoring/constants';
import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from '../creator-chrome-tokens';
import {
  CREATOR_ENABLED_EXPERIENCE_TYPES,
  type CreatorEnabledExperienceType,
} from '../creator-experience-types';

export interface CreatorToolbarOptions {
  container?: HTMLElement;
  label?: string;
  ariaLabel?: string;
  className?: string;
  onCreateExperience?: (type: CreatorExperienceType) => MaybePromise<void>;
  listExperiencesForPage?: () => MaybePromise<readonly CreatorPageExperienceSummary[]>;
  onOpenExperience?: (experienceId: string) => MaybePromise<void>;
  onPreview?: () => MaybePromise<void>;
}

export type CreatorExperienceType = CreatorEnabledExperienceType;

export interface CreatorPageExperienceSummary {
  id: string;
  title: string;
  type: CreatorExperienceType;
}

type MaybePromise<T> = T | Promise<T>;
type CreatorLauncherCapability = 'create' | 'edit' | 'list' | 'preview';
type CreatorLauncherIconName = keyof typeof CREATOR_LAUNCHER_ICONS;
type CreatorLauncherIconNode = readonly [
  tagName: 'circle' | 'path',
  attributes: Readonly<Record<string, string>>,
];

const CREATOR_LAUNCHER_ICONS = {
  eye: [
    [
      'path',
      {
        d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  list: [['path', { d: 'M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13' }]],
  pencil: [
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4',
      },
    ],
  ],
  plus: [['path', { d: 'M5 12h14M12 5v14' }]],
} as const satisfies Readonly<Record<string, readonly CreatorLauncherIconNode[]>>;

export const CREATOR_LAUNCHER_ACTIONS = [
  { capability: 'create', icon: 'plus', id: 'new-experience', label: 'New experience' },
  {
    capability: 'list',
    icon: 'list',
    id: 'experiences-on-page',
    label: 'Experiences on this page',
  },
  { capability: 'preview', icon: 'eye', id: 'preview-as-user', label: 'Preview as user' },
] as const;

const CREATOR_LAUNCHER_FALLBACK_ACTION = {
  capability: 'edit',
  icon: 'pencil',
  id: 'edit-current-experience',
  label: 'Edit current experience',
} as const;

type CreatorLauncherActionId =
  (typeof CREATOR_LAUNCHER_ACTIONS)[number]['id'] | typeof CREATOR_LAUNCHER_FALLBACK_ACTION.id;

interface CreatorLauncherAction {
  capability: CreatorLauncherCapability;
  icon: CreatorLauncherIconName;
  id: CreatorLauncherActionId;
  label: string;
}

const TOOLBAR_SELECTOR = '[data-lodariq-creator-toolbar="true"]';
const LAUNCHER_SELECTOR = '[data-lodariq-creator-launcher="true"]';
const TOOLBAR_STYLE_ID = 'lodariq-creator-toolbar-style';
const DEFAULT_CLASS_NAME = 'lodariq-creator-toolbar';
const DEFAULT_LABEL = 'LQ';
const DEFAULT_ARIA_LABEL = 'Open Lodariq actions';
const DRAG_THRESHOLD = 4;
const LAUNCHER_SIZE = 48;
const VIEWPORT_MARGIN = 18;
const LAUNCHER_ACTION_HEIGHT = 44;
const LAUNCHER_ACTION_GAP = 8;
const LAUNCHER_SURFACE_WIDTH = 280;
const LAUNCHER_SURFACE_GAP = 12;
const PALETTE_ESTIMATED_HEIGHT =
  CREATOR_LAUNCHER_ACTIONS.length * LAUNCHER_ACTION_HEIGHT +
  (CREATOR_LAUNCHER_ACTIONS.length - 1) * LAUNCHER_ACTION_GAP;
const PALETTE_MIN_WIDTH = LAUNCHER_ACTION_HEIGHT;
const launcherCleanupByElement = new WeakMap<HTMLElement, () => void>();
let launcherIdSequence = 0;

const CREATOR_TOOLBAR_CSS = `
[data-lodariq-creator-launcher='true'] {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  width: ${LAUNCHER_SIZE}px;
  height: ${LAUNCHER_SIZE}px;
  color: ${CREATOR_CHROME_TOKENS.onChrome};
  font-family: ${CREATOR_CHROME_FONT_STACK};
  isolation: isolate;
  box-sizing: border-box;
}

[data-lodariq-creator-toolbar='true'] {
  position: relative;
  z-index: 2;
  display: grid;
  width: ${LAUNCHER_SIZE}px;
  height: ${LAUNCHER_SIZE}px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: ${CREATOR_CHROME_TOKENS.chrome};
  color: ${CREATOR_CHROME_TOKENS.onChrome};
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  cursor: grab;
  font: 700 12px/1 ${CREATOR_CHROME_FONT_STACK};
  letter-spacing: -0.02em;
  padding: 0;
  touch-action: none;
  user-select: none;
  appearance: none;
  box-sizing: border-box;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}

[data-lodariq-creator-toolbar='true']:hover {
  border-color: rgba(61, 232, 176, 0.5);
  box-shadow:
    0 20px 48px rgba(0, 0, 0, 0.46),
    0 4px 12px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(255, 255, 255, 0.07) inset;
  transform: translateY(-1px);
}

[data-lodariq-creator-toolbar='true']:focus-visible,
[data-lodariq-launcher-action='true']:focus-visible {
  outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
  outline-offset: 3px;
}

[data-lodariq-creator-toolbar='true'][data-lodariq-authoring-dragging='true'] {
  cursor: grabbing;
  transition: none;
  transform: none;
}

[data-lodariq-creator-toolbar='true'][aria-busy='true'],
[data-lodariq-launcher-action='true'][aria-busy='true'] {
  cursor: progress;
  opacity: 0.76;
}

[data-lodariq-launcher-palette='true'] {
  position: absolute;
  right: 0;
  bottom: ${LAUNCHER_SIZE + 12}px;
  z-index: 1;
  display: grid;
  width: ${LAUNCHER_ACTION_HEIGHT}px;
  gap: ${LAUNCHER_ACTION_GAP}px;
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.98);
  transform-origin: bottom right;
  visibility: hidden;
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    visibility 0s linear 140ms;
}

[data-lodariq-launcher-palette='true']::after {
  position: absolute;
  right: 0;
  bottom: -12px;
  width: ${LAUNCHER_ACTION_HEIGHT}px;
  height: 12px;
  content: '';
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-below='true'] [data-lodariq-launcher-palette='true'] {
  top: ${LAUNCHER_SIZE + 12}px;
  bottom: auto;
  transform-origin: top right;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-below='true'] [data-lodariq-launcher-palette='true']::after {
  top: -12px;
  bottom: auto;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-palette='true'] {
  right: auto;
  left: 0;
  transform-origin: bottom left;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-below='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-palette='true'] {
  transform-origin: top left;
}

[data-lodariq-creator-launcher='true']:hover [data-lodariq-launcher-palette='true'],
[data-lodariq-creator-launcher='true']:focus-within [data-lodariq-launcher-palette='true'],
[data-lodariq-creator-launcher='true'][data-lodariq-pinned='true'] [data-lodariq-launcher-palette='true'] {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
  visibility: visible;
  transition-delay: 0s;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-dismissed='true'] [data-lodariq-launcher-palette='true'] {
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.98);
  visibility: hidden;
}

[data-lodariq-launcher-action-wrap='true'] {
  position: relative;
  width: ${LAUNCHER_ACTION_HEIGHT}px;
  height: ${LAUNCHER_ACTION_HEIGHT}px;
}

[data-lodariq-launcher-action='true'] {
  display: grid;
  width: ${LAUNCHER_ACTION_HEIGHT}px;
  height: ${LAUNCHER_ACTION_HEIGHT}px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: ${CREATOR_CHROME_TOKENS.chrome};
  color: ${CREATOR_CHROME_TOKENS.muted};
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.36),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  cursor: pointer;
  padding: 0;
  appearance: none;
  box-sizing: border-box;
  transition:
    color 120ms ease,
    border-color 120ms ease,
    transform 120ms ease;
}

[data-lodariq-launcher-action='true']:hover {
  border-color: rgba(61, 232, 176, 0.5);
  color: ${CREATOR_CHROME_TOKENS.onChrome};
  transform: translateX(-2px);
}

[data-lodariq-launcher-action='true'] svg {
  display: block;
  width: 19px;
  height: 19px;
}

[data-lodariq-launcher-tooltip='true'] {
  position: absolute;
  top: 50%;
  right: calc(100% + 10px);
  z-index: 4;
  width: max-content;
  max-width: min(220px, calc(100% - 96px));
  border: 1px solid ${CREATOR_CHROME_TOKENS.border};
  border-radius: 8px;
  background: ${CREATOR_CHROME_TOKENS.surface};
  color: ${CREATOR_CHROME_TOKENS.ink};
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  font: 600 12px/1.2 ${CREATOR_CHROME_FONT_STACK};
  opacity: 0;
  padding: 8px 8px;
  pointer-events: none;
  transform: translate(4px, -50%);
  visibility: hidden;
  white-space: nowrap;
  transition:
    opacity 100ms ease,
    transform 100ms ease,
    visibility 0s linear 100ms;
}

[data-lodariq-launcher-action-wrap='true']:hover [data-lodariq-launcher-tooltip='true'],
[data-lodariq-launcher-action-wrap='true']:focus-within [data-lodariq-launcher-tooltip='true'] {
  opacity: 1;
  transform: translate(0, -50%);
  visibility: visible;
  transition-delay: 0s;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-tooltip='true'] {
  right: auto;
  left: calc(100% + 10px);
  transform: translate(-4px, -50%);
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-action-wrap='true']:hover [data-lodariq-launcher-tooltip='true'],
[data-lodariq-creator-launcher='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-action-wrap='true']:focus-within [data-lodariq-launcher-tooltip='true'] {
  transform: translate(0, -50%);
}

[data-lodariq-creator-launcher='true'][data-lodariq-active-surface] [data-lodariq-launcher-tooltip='true'] {
  display: none;
}

[data-lodariq-launcher-surface='true'] {
  position: absolute;
  right: ${LAUNCHER_SIZE + LAUNCHER_SURFACE_GAP}px;
  bottom: ${LAUNCHER_SIZE + 12}px;
  z-index: 3;
  width: min(${LAUNCHER_SURFACE_WIDTH}px, calc(100% - 92px));
  max-height: min(360px, calc(100dvh - 36px));
  overflow: auto;
  border: 1px solid ${CREATOR_CHROME_TOKENS.border};
  border-radius: 16px;
  background: ${CREATOR_CHROME_TOKENS.surface};
  color: ${CREATOR_CHROME_TOKENS.ink};
  box-shadow:
    0 22px 58px rgba(0, 0, 0, 0.44),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  box-sizing: border-box;
  padding: 8px;
}

[data-lodariq-launcher-surface='true'][hidden] {
  display: none;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-below='true'] [data-lodariq-launcher-surface='true'] {
  top: ${LAUNCHER_SIZE + 12}px;
  bottom: auto;
}

[data-lodariq-creator-launcher='true'][data-lodariq-palette-align-left='true'] [data-lodariq-launcher-surface='true'] {
  right: auto;
  left: ${LAUNCHER_SIZE + LAUNCHER_SURFACE_GAP}px;
}

.lodariq-launcher-surface-header {
  display: grid;
  gap: 4px;
  padding: 8px 8px 12px;
}

.lodariq-launcher-surface-header strong {
  color: ${CREATOR_CHROME_TOKENS.ink};
  font: 720 14px/1.2 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-launcher-surface-header span,
.lodariq-launcher-surface-status,
.lodariq-launcher-surface-item span {
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: 540 12px/1.35 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-launcher-surface-status {
  margin: 0;
  padding: 12px 12px;
}

.lodariq-launcher-surface-list {
  display: grid;
  gap: 4px;
}

.lodariq-launcher-surface-item {
  display: grid;
  width: 100%;
  min-height: 52px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: ${CREATOR_CHROME_TOKENS.ink};
  cursor: pointer;
  padding: 8px 12px;
  text-align: left;
  appearance: none;
  box-sizing: border-box;
}

.lodariq-launcher-surface-item:hover {
  border-color: rgba(61, 232, 176, 0.3);
  background: rgba(255, 255, 255, 0.05);
}

.lodariq-launcher-surface-item:focus-visible {
  outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
  outline-offset: 1px;
}

.lodariq-launcher-surface-item strong {
  overflow: hidden;
  font: 680 13px/1.3 ${CREATOR_CHROME_FONT_STACK};
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lodariq-launcher-surface-item-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.lodariq-launcher-surface-item-copy small {
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: 520 11px/1.35 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-launcher-surface-item > span:last-child {
  border-radius: 999px;
  background: rgba(61, 232, 176, 0.12);
  color: ${CREATOR_CHROME_TOKENS.action};
  font-size: 10px;
  font-weight: 700;
  padding: 4px 8px;
  text-transform: uppercase;
}

@media (max-width: 600px) {
  [data-lodariq-creator-launcher='true'] {
    right: 16px;
    bottom: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-lodariq-creator-toolbar='true'],
  [data-lodariq-launcher-action='true'],
  [data-lodariq-launcher-palette='true'],
  [data-lodariq-launcher-tooltip='true'] {
    transition: none;
  }
}
`;

export function installCreatorToolbar(
  options: CreatorToolbarOptions = {},
): HTMLButtonElement | null {
  if (!options.container && typeof document === 'undefined') return null;

  const doc = options.container?.ownerDocument ?? document;
  const container = options.container ?? doc.body;
  if (!container) return null;

  const api = currentLodariqApi(doc);
  if (!api?.authoring.enabled) {
    removeCreatorToolbar(container);
    return null;
  }

  ensureCreatorToolbarStyle(doc);
  removeCreatorToolbar(container);

  const launcher = doc.createElement('div');
  launcher.dataset['lodariqCreatorLauncher'] = 'true';
  launcher.dataset['lodariqPinned'] = 'false';

  const palette = doc.createElement('div');
  palette.dataset['lodariqLauncherPalette'] = 'true';
  palette.id = `lodariq-launcher-palette-${createLauncherId()}`;
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', 'Lodariq actions');

  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset['lodariqCreatorToolbar'] = 'true';
  button.dataset['lodariqAuthoringTrigger'] = 'true';
  button.className = options.className ?? DEFAULT_CLASS_NAME;
  button.textContent = options.label ?? DEFAULT_LABEL;
  const ariaLabel = options.ariaLabel ?? DEFAULT_ARIA_LABEL;
  button.dataset['lodariqDefaultAriaLabel'] = ariaLabel;
  button.setAttribute('aria-label', ariaLabel);
  button.setAttribute('aria-controls', palette.id);
  button.setAttribute('aria-expanded', 'false');
  button.title = ariaLabel;

  const surface = doc.createElement('div');
  surface.dataset['lodariqLauncherSurface'] = 'true';
  surface.id = `lodariq-launcher-surface-${createLauncherId()}`;
  surface.setAttribute('role', 'dialog');
  surface.tabIndex = -1;
  surface.hidden = true;

  const actionContext: CreatorLauncherActionContext = {
    api,
    doc,
    launcher,
    launcherButton: button,
    options,
    surface,
  };
  for (const action of availableLauncherActions(api, options)) {
    const actionWrapper = doc.createElement('div');
    actionWrapper.dataset['lodariqLauncherActionWrap'] = 'true';

    const actionButton = doc.createElement('button');
    actionButton.type = 'button';
    actionButton.dataset['lodariqLauncherAction'] = 'true';
    actionButton.dataset['lodariqLauncherActionId'] = action.id;
    actionButton.setAttribute('aria-label', action.label);
    actionButton.appendChild(createLauncherIcon(doc, action.icon));

    const tooltip = doc.createElement('span');
    tooltip.dataset['lodariqLauncherTooltip'] = 'true';
    tooltip.id = `lodariq-launcher-tooltip-${createLauncherId()}`;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = action.label;
    actionButton.setAttribute('aria-describedby', tooltip.id);

    if (action.capability === 'create' || action.capability === 'list') {
      actionButton.setAttribute('aria-controls', surface.id);
      actionButton.setAttribute('aria-expanded', 'false');
      actionButton.setAttribute('aria-haspopup', 'dialog');
    }
    actionButton.addEventListener('click', () => {
      void runLauncherAction(action, actionButton, actionContext);
    });
    actionWrapper.append(actionButton, tooltip);
    palette.appendChild(actionWrapper);
  }

  launcher.append(button, palette, surface);
  container.appendChild(launcher);
  launcherCleanupByElement.set(
    launcher,
    attachLauncherInteractions(launcher, button, surface, doc),
  );
  return button;
}

export function removeCreatorToolbar(container?: HTMLElement): void {
  if (!container && typeof document === 'undefined') return;
  const target = container ?? document.body;
  if (!target) return;
  const launcher = target.querySelector<HTMLElement>(LAUNCHER_SELECTOR);
  if (launcher) {
    launcherCleanupByElement.get(launcher)?.();
    launcherCleanupByElement.delete(launcher);
    launcher.remove();
  }
  target.querySelector<HTMLButtonElement>(TOOLBAR_SELECTOR)?.remove();
}

function attachLauncherInteractions(
  launcher: HTMLElement,
  button: HTMLButtonElement,
  surface: HTMLElement,
  doc: Document,
): () => void {
  let suppressClickAfterDrag = false;
  let manualPlacement = false;
  let suppressFocusReopen = false;
  let drag: {
    pointerId: number | 'mouse';
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  let dragShield: HTMLElement | null = null;

  const togglePinned = (): void => {
    const nextPinned = launcher.dataset['lodariqPinned'] !== 'true';
    setLauncherPinned(launcher, button, nextPinned);
    if (!nextPinned) closeLauncherSurface(launcher, surface);
  };

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!drag || !matchesDragPointer(drag.pointerId, event)) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < DRAG_THRESHOLD) return;
    drag.moved = true;
    dragShield ??= createLauncherDragShield(doc);
    event.preventDefault();
    button.dataset['lodariqAuthoringDragging'] = 'true';
    manualPlacement = true;
    placeLauncher(launcher, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!drag || !matchesDragPointer(drag.pointerId, event)) return;
    const ownerWindow = doc.defaultView ?? window;
    const pointerId = drag.pointerId;
    if (pointerId === 'mouse') {
      ownerWindow.removeEventListener('mousemove', move, true);
      ownerWindow.removeEventListener('mouseup', finish, true);
    } else {
      button.releasePointerCapture?.(pointerId);
      ownerWindow.removeEventListener('pointermove', move, true);
      ownerWindow.removeEventListener('pointerup', finish, true);
      ownerWindow.removeEventListener('pointercancel', finish, true);
    }
    dragShield?.remove();
    dragShield = null;
    delete button.dataset['lodariqAuthoringDragging'];
    if (drag.moved) suppressClickAfterDrag = true;
    drag = null;
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (drag || event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    const ownerWindow = doc.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    drag = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    if (pointerId === 'mouse') {
      ownerWindow.addEventListener('mousemove', move, true);
      ownerWindow.addEventListener('mouseup', finish, true);
      return;
    }
    button.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const handleClick = (): void => {
    if (suppressClickAfterDrag) {
      suppressClickAfterDrag = false;
      return;
    }
    if (launcher.dataset['lodariqAuthoringPanelState']) {
      setLauncherPinned(launcher, button, true);
      doc.defaultView?.dispatchEvent(new CustomEvent(LOCAL_AUTHORING_PANEL_TOGGLE_EVENT));
      return;
    }
    delete launcher.dataset['lodariqPaletteDismissed'];
    togglePinned();
  };
  const handleButtonKeyDown = (event: KeyboardEvent): void => {
    const offset = launcherKeyboardOffset(event.key);
    if (offset) {
      event.preventDefault();
      manualPlacement = true;
      const rect = launcher.getBoundingClientRect();
      const distance = event.shiftKey ? 48 : 16;
      placeLauncher(launcher, rect.left + offset.x * distance, rect.top + offset.y * distance);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismissPalette(true);
    }
  };
  const handleLauncherKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' && launcher.dataset['lodariqPinned'] === 'true') {
      const actions = Array.from(
        launcher.querySelectorAll<HTMLButtonElement>(
          '[data-lodariq-launcher-action="true"]:not(:disabled)',
        ),
      );
      const activeElement = event.target;
      const activeIndex = actions.findIndex((action) => action === activeElement);
      let focusTarget: HTMLButtonElement | null = null;
      if (activeElement === button && !event.shiftKey) {
        focusTarget = actions[0] ?? null;
      } else if (activeIndex >= 0 && event.shiftKey) {
        focusTarget = activeIndex === 0 ? button : (actions[activeIndex - 1] ?? null);
      } else if (activeIndex >= 0 && activeIndex < actions.length - 1 && !event.shiftKey) {
        focusTarget = actions[activeIndex + 1] ?? null;
      }
      if (focusTarget) {
        event.preventDefault();
        focusTarget.focus();
        return;
      }
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dismissPalette(true);
  };
  const dismissPalette = (restoreFocus: boolean): void => {
    launcher.dataset['lodariqPaletteDismissed'] = 'true';
    setLauncherPinned(launcher, button, false);
    closeLauncherSurface(launcher, surface);
    if (restoreFocus) {
      suppressFocusReopen = true;
      button.focus();
      queueMicrotask(() => {
        suppressFocusReopen = false;
      });
    }
  };
  const reopenPalette = (): void => {
    delete launcher.dataset['lodariqPaletteDismissed'];
  };
  const reopenPaletteOnFocus = (): void => {
    if (suppressFocusReopen) return;
    reopenPalette();
  };
  // Hover reveals through CSS only. Persisted/pinned state is intentionally
  // reserved for click, tap, or keyboard activation.
  const revealPaletteOnHover = (): void => reopenPalette();
  const handleOutsidePointerDown = (event: Event): void => {
    if (event.composedPath().includes(launcher)) return;
    if (launcher.dataset['lodariqPinned'] !== 'true' && surface.hidden) return;
    dismissPalette(false);
  };

  button.addEventListener('pointerdown', start);
  button.addEventListener('mousedown', start);
  button.addEventListener('click', handleClick);
  button.addEventListener('keydown', handleButtonKeyDown);
  launcher.addEventListener('keydown', handleLauncherKeyDown);
  launcher.addEventListener('mouseenter', revealPaletteOnHover);
  launcher.addEventListener('focusin', reopenPaletteOnFocus);
  doc.addEventListener('pointerdown', handleOutsidePointerDown, true);

  const sync = (): void => {
    if (!launcher.isConnected || button.dataset['lodariqAuthoringDragging'] === 'true') return;
    if (manualPlacement) {
      const rect = launcher.getBoundingClientRect();
      placeLauncher(launcher, rect.left, rect.top);
      return;
    }
    placeLauncherAtDefault(launcher);
  };
  const ownerWindow = doc.defaultView ?? window;
  ownerWindow.addEventListener('resize', sync);
  ownerWindow.visualViewport?.addEventListener('resize', sync);
  ownerWindow.visualViewport?.addEventListener('scroll', sync);
  sync();

  return () => {
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    ownerWindow.removeEventListener('resize', sync);
    ownerWindow.visualViewport?.removeEventListener('resize', sync);
    ownerWindow.visualViewport?.removeEventListener('scroll', sync);
    button.removeEventListener('pointerdown', start);
    button.removeEventListener('mousedown', start);
    button.removeEventListener('click', handleClick);
    button.removeEventListener('keydown', handleButtonKeyDown);
    launcher.removeEventListener('keydown', handleLauncherKeyDown);
    launcher.removeEventListener('mouseenter', revealPaletteOnHover);
    launcher.removeEventListener('focusin', reopenPaletteOnFocus);
    doc.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    dragShield?.remove();
    dragShield = null;
    drag = null;
  };
}

interface CreatorLauncherActionContext {
  api: LodariqBrowserApi;
  doc: Document;
  launcher: HTMLElement;
  launcherButton: HTMLButtonElement;
  options: CreatorToolbarOptions;
  surface: HTMLElement;
}

function availableLauncherActions(
  api: LodariqBrowserApi,
  options: CreatorToolbarOptions,
): readonly CreatorLauncherAction[] {
  const availableCapabilities: Readonly<Record<CreatorLauncherCapability, boolean>> = {
    create: Boolean(options.onCreateExperience),
    edit: false,
    list: Boolean(options.listExperiencesForPage && options.onOpenExperience),
    preview: Boolean(options.onPreview ?? api.playTour),
  };
  const canonicalActions = CREATOR_LAUNCHER_ACTIONS.filter(
    (action) => availableCapabilities[action.capability],
  );
  if (availableCapabilities.create || availableCapabilities.list) return canonicalActions;
  return [CREATOR_LAUNCHER_FALLBACK_ACTION, ...canonicalActions];
}

function createLauncherIcon(doc: Document, iconName: CreatorLauncherIconName): SVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = doc.createElementNS(namespace, 'svg');
  const attributes = {
    'aria-hidden': 'true',
    fill: 'none',
    focusable: 'false',
    height: '19',
    stroke: 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-width': '2',
    viewBox: '0 0 24 24',
    width: '19',
  };
  for (const [name, value] of Object.entries(attributes)) icon.setAttribute(name, value);
  for (const [tagName, nodeAttributes] of CREATOR_LAUNCHER_ICONS[iconName]) {
    const node = doc.createElementNS(namespace, tagName);
    for (const [name, value] of Object.entries(nodeAttributes)) node.setAttribute(name, value);
    icon.appendChild(node);
  }
  return icon;
}

async function runLauncherAction(
  action: CreatorLauncherAction,
  button: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): Promise<void> {
  if (button.getAttribute('aria-busy') === 'true') return;
  setLauncherPinned(context.launcher, context.launcherButton, true);
  button.setAttribute('aria-busy', 'true');
  try {
    await launcherActionHandler(action.id, button, context)();
  } catch (error) {
    dispatchAuthoringError(context.doc, error);
  } finally {
    button.removeAttribute('aria-busy');
  }
}

function launcherActionHandler(
  actionId: CreatorLauncherActionId,
  actionButton: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): () => MaybePromise<void> {
  const handlers: Record<CreatorLauncherActionId, () => MaybePromise<void>> = {
    'edit-current-experience': async () => {
      closeLauncherSurface(context.launcher, context.surface);
      await context.api.openAuthoring();
    },
    'experiences-on-page': () => renderPageExperiencesSurface(actionButton, context),
    'new-experience': () => renderNewExperienceSurface(actionButton, context),
    'preview-as-user': async () => {
      closeLauncherSurface(context.launcher, context.surface);
      if (context.options.onPreview) {
        await context.options.onPreview();
        return;
      }
      await context.api.playTour();
    },
  };
  return handlers[actionId];
}

function renderNewExperienceSurface(
  actionButton: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): void {
  if (toggleOpenLauncherSurface('new-experience', actionButton, context)) return;
  const list = openLauncherSurface(
    'new-experience',
    'New experience',
    'Choose an experience type to start.',
    actionButton,
    context,
  );
  const onCreateExperience = context.options.onCreateExperience;
  if (!onCreateExperience) return;

  for (const experienceType of CREATOR_ENABLED_EXPERIENCE_TYPES) {
    const item = createSurfaceItem(
      context.doc,
      `Create ${experienceType.label}`,
      experienceType.label,
      'Create',
      experienceType.description,
    );
    item.dataset['lodariqExperienceType'] = experienceType.id;
    item.addEventListener('click', () => {
      void runSurfaceItemAction(item, context.doc, async () => {
        await onCreateExperience(experienceType.id);
        closeLauncherSurface(context.launcher, context.surface);
        if (actionButton.isConnected) actionButton.focus();
      });
    });
    list.appendChild(item);
  }

  list.querySelector<HTMLButtonElement>('button')?.focus();
}

async function renderPageExperiencesSurface(
  actionButton: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): Promise<void> {
  if (toggleOpenLauncherSurface('experiences-on-page', actionButton, context)) return;
  const list = openLauncherSurface(
    'experiences-on-page',
    'Experiences on this page',
    'Open an experience without leaving this page.',
    actionButton,
    context,
  );
  const status = createSurfaceStatus(context.doc, 'Loading experiences…');
  list.appendChild(status);

  const listExperiencesForPage = context.options.listExperiencesForPage;
  const onOpenExperience = context.options.onOpenExperience;
  if (!listExperiencesForPage || !onOpenExperience) return;

  try {
    const experiences = await listExperiencesForPage();
    if (!isLauncherSurfaceOpen(context.surface, 'experiences-on-page')) return;
    list.replaceChildren();
    if (experiences.length === 0) {
      list.appendChild(createSurfaceStatus(context.doc, 'No experiences found on this page.'));
      return;
    }

    for (const experience of experiences) {
      const label = creatorExperienceLabel(experience.type);
      const title = experience.title.trim() || `Untitled ${label.toLowerCase()}`;
      const item = createSurfaceItem(context.doc, `Open ${title}`, title, label);
      item.dataset['lodariqExperienceId'] = experience.id;
      item.addEventListener('click', () => {
        void runSurfaceItemAction(item, context.doc, async () => {
          await onOpenExperience(experience.id);
          closeLauncherSurface(context.launcher, context.surface);
          if (actionButton.isConnected) actionButton.focus();
        });
      });
      list.appendChild(item);
    }
    list.querySelector<HTMLButtonElement>('button')?.focus();
  } catch (error) {
    if (isLauncherSurfaceOpen(context.surface, 'experiences-on-page')) {
      list.replaceChildren(
        createSurfaceStatus(context.doc, 'Experiences could not be loaded. Try again.'),
      );
    }
    throw error;
  }
}

function toggleOpenLauncherSurface(
  surfaceId: Exclude<CreatorLauncherActionId, 'preview-as-user'>,
  actionButton: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): boolean {
  if (!isLauncherSurfaceOpen(context.surface, surfaceId)) return false;
  closeLauncherSurface(context.launcher, context.surface);
  actionButton.focus();
  return true;
}

function openLauncherSurface(
  surfaceId: Exclude<CreatorLauncherActionId, 'preview-as-user'>,
  title: string,
  description: string,
  actionButton: HTMLButtonElement,
  context: CreatorLauncherActionContext,
): HTMLElement {
  const headingId = `lodariq-launcher-heading-${createLauncherId()}`;
  const descriptionId = `lodariq-launcher-description-${createLauncherId()}`;
  const header = context.doc.createElement('header');
  header.className = 'lodariq-launcher-surface-header';
  const heading = context.doc.createElement('strong');
  heading.id = headingId;
  heading.textContent = title;
  const supportingText = context.doc.createElement('span');
  supportingText.id = descriptionId;
  supportingText.textContent = description;
  header.append(heading, supportingText);

  const list = context.doc.createElement('div');
  list.className = 'lodariq-launcher-surface-list';
  list.setAttribute('role', 'group');

  context.surface.replaceChildren(header, list);
  context.surface.dataset['lodariqLauncherSurfaceKind'] = surfaceId;
  context.surface.setAttribute('aria-describedby', descriptionId);
  context.surface.setAttribute('aria-labelledby', headingId);
  context.surface.hidden = false;
  context.launcher.dataset['lodariqActiveSurface'] = surfaceId;
  setSurfaceActionExpanded(context.launcher, actionButton);
  return list;
}

function closeLauncherSurface(launcher: HTMLElement, surface: HTMLElement): void {
  surface.hidden = true;
  delete surface.dataset['lodariqLauncherSurfaceKind'];
  delete launcher.dataset['lodariqActiveSurface'];
  setSurfaceActionExpanded(launcher, null);
}

function isLauncherSurfaceOpen(
  surface: HTMLElement,
  surfaceId: Exclude<CreatorLauncherActionId, 'preview-as-user'>,
): boolean {
  return !surface.hidden && surface.dataset['lodariqLauncherSurfaceKind'] === surfaceId;
}

function setSurfaceActionExpanded(
  launcher: HTMLElement,
  expandedAction: HTMLButtonElement | null,
): void {
  for (const action of launcher.querySelectorAll<HTMLButtonElement>(
    '[data-lodariq-launcher-action][aria-expanded]',
  )) {
    action.setAttribute('aria-expanded', action === expandedAction ? 'true' : 'false');
  }
}

function createSurfaceItem(
  doc: Document,
  ariaLabel: string,
  title: string,
  badge: string,
  description?: string,
): HTMLButtonElement {
  const item = doc.createElement('button');
  item.type = 'button';
  item.className = 'lodariq-launcher-surface-item';
  item.setAttribute('aria-label', ariaLabel);
  const copy = doc.createElement('span');
  copy.className = 'lodariq-launcher-surface-item-copy';
  const name = doc.createElement('strong');
  name.textContent = title;
  copy.appendChild(name);
  if (description) {
    const supportingText = doc.createElement('small');
    supportingText.textContent = description;
    copy.appendChild(supportingText);
  }
  const badgeElement = doc.createElement('span');
  badgeElement.textContent = badge;
  item.append(copy, badgeElement);
  return item;
}

function createSurfaceStatus(doc: Document, message: string): HTMLParagraphElement {
  const status = doc.createElement('p');
  status.className = 'lodariq-launcher-surface-status';
  status.setAttribute('aria-live', 'polite');
  status.textContent = message;
  return status;
}

async function runSurfaceItemAction(
  item: HTMLButtonElement,
  doc: Document,
  action: () => MaybePromise<void>,
): Promise<void> {
  if (item.getAttribute('aria-busy') === 'true') return;
  item.setAttribute('aria-busy', 'true');
  try {
    await action();
  } catch (error) {
    dispatchAuthoringError(doc, error);
  } finally {
    item.removeAttribute('aria-busy');
  }
}

function creatorExperienceLabel(type: CreatorExperienceType): string {
  return (
    CREATOR_ENABLED_EXPERIENCE_TYPES.find((experienceType) => experienceType.id === type)?.label ??
    type
  );
}

function setLauncherPinned(
  launcher: HTMLElement,
  launcherButton: HTMLButtonElement,
  pinned: boolean,
): void {
  if (pinned) delete launcher.dataset['lodariqPaletteDismissed'];
  launcher.dataset['lodariqPinned'] = pinned ? 'true' : 'false';
  launcherButton.setAttribute('aria-expanded', pinned ? 'true' : 'false');
}

function launcherKeyboardOffset(key: string): { x: number; y: number } | null {
  const offsets: Partial<Record<string, { x: number; y: number }>> = {
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
  };
  return offsets[key] ?? null;
}

function matchesDragPointer(
  pointerId: number | 'mouse',
  event: MouseEvent | PointerEvent,
): boolean {
  if ('pointerId' in event) return pointerId === event.pointerId;
  return pointerId === 'mouse';
}

function placeLauncherAtDefault(launcher: HTMLElement): void {
  const ownerWindow = launcher.ownerDocument.defaultView ?? window;
  const viewport = visibleViewportBounds(ownerWindow);
  const margin = viewport.width <= 600 ? 16 : VIEWPORT_MARGIN;
  placeLauncher(
    launcher,
    viewport.right - LAUNCHER_SIZE - margin,
    viewport.bottom - LAUNCHER_SIZE - margin,
  );
}

function placeLauncher(launcher: HTMLElement, left: number, top: number): void {
  const ownerWindow = launcher.ownerDocument.defaultView ?? window;
  const viewport = visibleViewportBounds(ownerWindow);
  const margin = viewport.width <= 600 ? 16 : VIEWPORT_MARGIN;
  const nextLeft = clamp(left, viewport.left + margin, viewport.right - LAUNCHER_SIZE - margin);
  const nextTop = clamp(top, viewport.top + margin, viewport.bottom - LAUNCHER_SIZE - margin);
  launcher.style.left = `${nextLeft}px`;
  launcher.style.top = `${nextTop}px`;
  launcher.style.right = 'auto';
  launcher.style.bottom = 'auto';
  syncPalettePlacement(launcher, nextLeft, nextTop, viewport, margin);
}

function syncPalettePlacement(
  launcher: HTMLElement,
  left: number,
  top: number,
  viewport: ReturnType<typeof visibleViewportBounds>,
  margin: number,
): void {
  const wouldOverflowTop = top - 12 - PALETTE_ESTIMATED_HEIGHT < viewport.top + margin;
  const actionDockLeft = left - Math.max(PALETTE_MIN_WIDTH - LAUNCHER_SIZE, 0);
  const surfaceLeft = left - LAUNCHER_SURFACE_WIDTH - LAUNCHER_SURFACE_GAP;
  const wouldOverflowLeft = Math.min(actionDockLeft, surfaceLeft) < viewport.left + margin;
  launcher.dataset['lodariqPaletteBelow'] = wouldOverflowTop ? 'true' : 'false';
  launcher.dataset['lodariqPaletteAlignLeft'] = wouldOverflowLeft ? 'true' : 'false';
}

function visibleViewportBounds(ownerWindow: Window): {
  bottom: number;
  left: number;
  right: number;
  top: number;
  width: number;
} {
  const viewport = ownerWindow.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? ownerWindow.innerWidth;
  const height = viewport?.height ?? ownerWindow.innerHeight;
  return {
    bottom: top + height,
    left,
    right: left + width,
    top,
    width,
  };
}

function createLauncherDragShield(doc: Document): HTMLElement {
  const shield = doc.createElement('div');
  shield.dataset['lodariqAuthoringDragShield'] = 'true';
  shield.setAttribute('aria-hidden', 'true');
  Object.assign(shield.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'grabbing',
    pointerEvents: 'auto',
    userSelect: 'none',
    background: 'transparent',
  });
  doc.body.appendChild(shield);
  return shield;
}

function ensureCreatorToolbarStyle(doc: Document): void {
  if (doc.getElementById(TOOLBAR_STYLE_ID)) return;
  const style = createNonceStyleElement(doc, CREATOR_TOOLBAR_CSS);
  style.id = TOOLBAR_STYLE_ID;
  doc.head.appendChild(style);
}

function currentLodariqApi(doc: Document): LodariqBrowserApi | undefined {
  return doc.defaultView?.Lodariq ?? window.Lodariq;
}

function dispatchAuthoringError(doc: Document, error: unknown): void {
  doc.defaultView?.dispatchEvent(
    new CustomEvent('lodariq:authoring-error', {
      detail: { error },
    }),
  );
}

function createLauncherId(): string {
  launcherIdSequence += 1;
  return launcherIdSequence.toString(36);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
