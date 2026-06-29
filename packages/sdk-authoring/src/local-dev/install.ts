import type { TalmehDocument } from '@talmeh/schema';
import { createNonceStyleElement } from '@talmeh/schema/dom';
import type {
  InstallOptions,
  LoaderConfig,
  TalmehBrowserApi,
} from '@talmeh/sdk-runtime/talmeh-loader';
import { installTalmeh, readConfigFromScript } from '@talmeh/sdk-runtime/talmeh-loader';
import { compilePreview, loadDocument } from '@talmeh/sdk-runtime/talmeh-local-dev';
import {
  LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT,
  LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY,
  LOCAL_AUTHORING_SESSION_ID,
} from '../authoring/constants';

export interface InstallLocalTalmehAuthoringOptions {
  baseDocument: TalmehDocument;
  script?: HTMLScriptElement;
  scriptSelector?: string;
  iframeSrc?: string;
  sessionId?: string;
  authoringTrigger?: LocalAuthoringTriggerOptions | false;
  installOptions?: Omit<InstallOptions, 'loadCurrentTour' | 'openAuthoring'>;
}

export interface LocalAuthoringTriggerOptions {
  label?: string;
  ariaLabel?: string;
  className?: string;
  container?: HTMLElement;
}

const DEFAULT_LOADER_SELECTOR = 'script[data-talmeh-loader]';
const DEFAULT_AUTHORING_IFRAME_SRC = '/authoring.html';
const DEFAULT_AUTHORING_TRIGGER_CLASS = 'talmeh-authoring-trigger';
const DEFAULT_AUTHORING_TRIGGER_LABEL = 'T';
const DEFAULT_AUTHORING_TRIGGER_ARIA_LABEL = 'Open Talmeh authoring';
const AUTHORING_PANEL_OPEN_ATTRIBUTE = 'data-talmeh-authoring-panel-open';
const LOCAL_AUTHORING_TRIGGER_STYLE_ID = 'talmeh-local-authoring-trigger-style';
const LOCAL_AUTHORING_TRIGGER_SELECTOR = '[data-talmeh-authoring-trigger="true"]';
const MANUAL_TRIGGER_PLACEMENT_KEY = 'talmehAuthoringManualPlacement';
const LOCAL_AUTHORING_TRIGGER_CSS = `
[data-talmeh-authoring-trigger='true'] {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.54);
  border-radius: 999px;
  background: #126451;
  color: #fff;
  box-shadow:
    0 18px 44px rgba(15, 23, 42, 0.24),
    0 0 0 1px rgba(15, 23, 42, 0.04);
  cursor: grab;
  font: 820 17px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  touch-action: none;
  user-select: none;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

[data-talmeh-authoring-trigger='true'][data-talmeh-authoring-dragging='true'] {
  cursor: grabbing;
  transition: none;
}

[data-talmeh-authoring-trigger='true']:hover {
  transform: translateY(-1px);
  background: #0e5244;
  box-shadow:
    0 22px 52px rgba(15, 23, 42, 0.28),
    0 0 0 1px rgba(15, 23, 42, 0.04);
}

[data-talmeh-authoring-trigger='true']:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.42);
  outline-offset: 3px;
}

@supports (width: 100dvw) {
  [data-talmeh-authoring-trigger='true'] {
    right: calc((100vw - 100dvw) + 18px);
    bottom: calc((100vh - 100dvh) + 18px);
  }
}

html[data-talmeh-authoring-panel-open='true'] [data-talmeh-authoring-trigger='true'] {
  top: 18px;
  right: 20px;
  bottom: auto;
  transform: none;
}

@supports (width: 100dvw) {
  html[data-talmeh-authoring-panel-open='true'] [data-talmeh-authoring-trigger='true'] {
    right: calc((100vw - 100dvw) + 20px);
  }
}

@media (max-width: 600px) {
  html[data-talmeh-authoring-panel-open='true'] [data-talmeh-authoring-trigger='true'] {
    right: 16px;
  }

  @supports (width: 100dvw) {
    html[data-talmeh-authoring-panel-open='true'] [data-talmeh-authoring-trigger='true'] {
      right: calc((100vw - 100dvw) + 16px);
    }
  }
}
`;

type LocalAuthoringEnvironment = 'development' | 'staging';

export async function installLocalTalmehAuthoringFromScript(
  options: InstallLocalTalmehAuthoringOptions,
): Promise<TalmehBrowserApi | null> {
  const script =
    options.script ??
    document.querySelector<HTMLScriptElement>(options.scriptSelector ?? DEFAULT_LOADER_SELECTOR);
  if (!script) return null;

  const config = readConfigFromScript(script);
  if (!config) return null;

  let talmeh: TalmehBrowserApi | null = null;
  const sessionId = options.sessionId ?? LOCAL_AUTHORING_SESSION_ID;
  const environment = localAuthoringEnvironment(config.environment);

  const api = await installTalmeh(config, {
    ...options.installOptions,
    loadCurrentTour: (manifest) =>
      compilePreview(currentDocument(config, options.baseDocument, manifest.documentId)),
    openAuthoring: async (manifest) => {
      const { openLocalAuthoringPanel } = await import('../authoring');

      openLocalAuthoringPanel(
        {
          sessionId,
          documentId: manifest.documentId,
          workspaceId: config.workspaceId,
          environment,
        },
        {
          iframeSrc: options.iframeSrc ?? DEFAULT_AUTHORING_IFRAME_SRC,
          preview: {
            loadDocument: (documentId) => currentDocument(config, options.baseDocument, documentId),
            compilePreview,
            playPreview: (doc, previewOptions) => {
              if (!talmeh) throw new Error('Talmeh local preview is not installed');
              return talmeh.playTour(doc, { initialStepId: previewOptions?.stepId });
            },
            stopPreview: () => talmeh?.stopTour(),
          },
        },
      );
    },
  });

  talmeh = api;
  installLocalAuthoringTrigger(api, options.authoringTrigger);
  return api;
}

function installLocalAuthoringTrigger(
  api: TalmehBrowserApi,
  triggerOptions: LocalAuthoringTriggerOptions | false | undefined,
): HTMLButtonElement | null {
  if (triggerOptions === false) return null;

  const options = triggerOptions ?? {};
  const container = options.container ?? document.body;
  const doc = container.ownerDocument;
  ensureLocalAuthoringTriggerStyle(doc);

  container.querySelector<HTMLButtonElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR)?.remove();

  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset['talmehAuthoringTrigger'] = 'true';
  button.textContent = options.label ?? DEFAULT_AUTHORING_TRIGGER_LABEL;
  button.setAttribute('aria-label', options.ariaLabel ?? DEFAULT_AUTHORING_TRIGGER_ARIA_LABEL);
  button.setAttribute('aria-expanded', 'false');
  button.title = options.ariaLabel ?? DEFAULT_AUTHORING_TRIGGER_ARIA_LABEL;

  const className = options.className ?? DEFAULT_AUTHORING_TRIGGER_CLASS;
  if (className) button.className = className;

  let suppressClickAfterDrag = false;
  makeLocalAuthoringTriggerDraggable(button, () => {
    suppressClickAfterDrag = true;
  });

  button.addEventListener('click', () => {
    if (suppressClickAfterDrag) {
      suppressClickAfterDrag = false;
      return;
    }
    void api.openAuthoring();
  });
  container.appendChild(button);
  startLocalAuthoringTriggerViewportSync(button);

  return button;
}

function makeLocalAuthoringTriggerDraggable(
  button: HTMLButtonElement,
  onDragEnd: () => void,
): void {
  let drag: {
    pointerId: number | 'mouse';
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  let dragShield: HTMLElement | null = null;

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    event.preventDefault();
    button.dataset['talmehAuthoringDragging'] = 'true';
    moveLocalAuthoringTrigger(button, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (drag || event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    const ownerWindow = button.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    drag = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    dragShield = createAuthoringDragShield(button.ownerDocument);

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

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const ownerWindow = button.ownerDocument.defaultView ?? window;
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
    delete button.dataset['talmehAuthoringDragging'];
    if (drag.moved) onDragEnd();
    drag = null;
  };

  button.addEventListener('pointerdown', start);
  button.addEventListener('mousedown', start);
}

function createAuthoringDragShield(doc: Document): HTMLElement {
  const shield = doc.createElement('div');
  shield.dataset['talmehAuthoringDragShield'] = 'true';
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

function moveLocalAuthoringTrigger(button: HTMLButtonElement, left: number, top: number): void {
  const panelOpen = button.ownerDocument.documentElement.hasAttribute(
    AUTHORING_PANEL_OPEN_ATTRIBUTE,
  );
  placeLocalAuthoringTrigger(button, left, top, 12, !panelOpen, panelOpen);
}

function startLocalAuthoringTriggerViewportSync(button: HTMLButtonElement): void {
  const ownerWindow = button.ownerDocument.defaultView ?? window;
  const sync = (): void => syncLocalAuthoringTriggerToViewport(button);
  const observer = new ownerWindow.MutationObserver(sync);

  ownerWindow.addEventListener('resize', sync);
  ownerWindow.visualViewport?.addEventListener('resize', sync);
  ownerWindow.visualViewport?.addEventListener('scroll', sync);
  observer.observe(button.ownerDocument.documentElement, {
    attributeFilter: [AUTHORING_PANEL_OPEN_ATTRIBUTE],
    attributes: true,
  });

  sync();
}

function syncLocalAuthoringTriggerToViewport(button: HTMLButtonElement): void {
  if (!button.isConnected || button.dataset['talmehAuthoringDragging'] === 'true') return;
  if (button.ownerDocument.documentElement.hasAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE)) return;
  delete button.dataset[LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY];

  const ownerWindow = button.ownerDocument.defaultView ?? window;
  const rect = button.getBoundingClientRect();
  const bounds = visibleViewportBounds(ownerWindow);
  const margin = bounds.width <= 600 ? 16 : 18;
  const width = rect.width || 52;
  const height = rect.height || 52;
  const manualPlacement = button.dataset[MANUAL_TRIGGER_PLACEMENT_KEY] === 'true';
  const left = manualPlacement ? rect.left : bounds.right - width - margin;
  const top = manualPlacement ? rect.top : bounds.bottom - height - margin;

  placeLocalAuthoringTrigger(button, left, top, margin, false);
}

function placeLocalAuthoringTrigger(
  button: HTMLButtonElement,
  left: number,
  top: number,
  margin: number,
  manualPlacement: boolean,
  openManualPlacement = false,
): void {
  const ownerWindow = button.ownerDocument.defaultView ?? window;
  const rect = button.getBoundingClientRect();
  const bounds = visibleViewportBounds(ownerWindow);
  const width = rect.width || 54;
  const height = rect.height || 54;
  const nextLeft = clamp(left, bounds.left + margin, bounds.right - width - margin);
  const nextTop = clamp(top, bounds.top + margin, bounds.bottom - height - margin);

  if (manualPlacement) button.dataset[MANUAL_TRIGGER_PLACEMENT_KEY] = 'true';
  if (openManualPlacement) button.dataset[LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY] = 'true';
  button.style.left = `${nextLeft}px`;
  button.style.top = `${nextTop}px`;
  button.style.right = 'auto';
  button.style.bottom = 'auto';
  button.dispatchEvent(new CustomEvent(LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT, { bubbles: true }));
}

function visibleViewportBounds(ownerWindow: Window): {
  bottom: number;
  height: number;
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
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function ensureLocalAuthoringTriggerStyle(doc: Document): void {
  if (doc.getElementById(LOCAL_AUTHORING_TRIGGER_STYLE_ID)) return;

  const style = createNonceStyleElement(doc, LOCAL_AUTHORING_TRIGGER_CSS);
  style.id = LOCAL_AUTHORING_TRIGGER_STYLE_ID;
  doc.head.appendChild(style);
}

function currentDocument(
  config: LoaderConfig,
  baseDocument: TalmehDocument,
  documentId: string,
): TalmehDocument {
  return loadDocument(documentId) ?? baseDocumentFor(config, baseDocument, documentId);
}

function baseDocumentFor(
  config: LoaderConfig,
  baseDocument: TalmehDocument,
  documentId: string,
): TalmehDocument {
  const doc = structuredClone(baseDocument);
  return { ...doc, id: documentId, workspaceId: config.workspaceId };
}

function localAuthoringEnvironment(
  environment: LoaderConfig['environment'],
): LocalAuthoringEnvironment {
  if (environment === 'production') {
    throw new Error('Talmeh local authoring is only available in development or staging');
  }
  return environment;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
