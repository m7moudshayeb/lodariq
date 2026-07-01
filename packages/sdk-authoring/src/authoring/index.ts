import type {
  BridgeMessage,
  CompiledDocument,
  ElementFingerprint,
  PreviewPatchOperation,
  ResolverDiagnostic,
  LodariqBlock,
  LodariqDocument,
  TargetInspectAction,
} from '@lodariq/schema';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { resolve } from '@lodariq/sdk-runtime/resolver';
import {
  AuthoringBridge,
  BRIDGE_PROTOCOL_VERSION,
  createBridgeCorrelationId,
  startTargetPicker,
  type TargetPicker,
} from '../bridge';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  moveTopLevelBlock,
  renumberTourSteps,
  reorderTopLevelBlock,
  removeTargetFromBlocks,
  setBlockAction,
  transformBlocks,
  updateBlockContent,
} from './document-ops';
import {
  LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT,
  LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY,
} from './constants';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * floating toolbar, element picker handoff, and the sandboxed iframe editor
 * served from a dedicated Lodariq origin (editor.lodariq.com, PRD §12.5).
 *
 * Ownership split (PRD §9.5):
 * - iframe: Lexical editor state, drafts, auth, selection, validation/review UI.
 * - host bridge: DOM inspection, target picking, page-state, overlay preview.
 * - server: persistence, compilation, publication, long-running jobs.
 *
 * React + Lexical are intentionally available in this package because it is
 * never shipped to production viewers (PRD §6.2, §9.1, §20).
 */
export interface AuthoringSession {
  sessionId: string;
  documentId: string;
  workspaceId: string;
  environment: 'development' | 'staging';
}

export interface LocalAuthoringPanelOptions {
  iframeSrc: string;
  initialDocument?: LodariqDocument;
  preview?: LocalAuthoringPreviewServices;
  onSave?: (document: LodariqDocument) => Promise<void> | void;
}

export interface LocalAuthoringPreviewOptions {
  stepId?: string;
}

export interface LocalAuthoringPreviewServices {
  loadDocument: (documentId: string) => LodariqDocument | null;
  compilePreview: (doc: LodariqDocument) => Promise<CompiledDocument>;
  playPreview: (doc: CompiledDocument, options?: LocalAuthoringPreviewOptions) => Promise<void>;
  stopPreview?: () => void;
  onPreviewError?: (error: unknown) => void;
}

export interface LocalAuthoringPanel {
  close: () => void;
  destroy: () => void;
  saveAndClose: () => Promise<void>;
}

let activePanel: LocalAuthoringPanel | null = null;
const AUTHORING_PANEL_OPEN_ATTRIBUTE = 'data-lodariq-authoring-panel-open';
const AUTHORING_HOST_LAYER_STYLE_ID = 'lodariq-authoring-host-layer-style';
const LOCAL_AUTHORING_TRIGGER_SELECTOR = '[data-lodariq-authoring-trigger="true"]';
const DEFAULT_AUTHORING_PANEL_WIDTH = 550;
const DEFAULT_AUTHORING_PANEL_HEIGHT = 820;
const MIN_AUTHORING_PANEL_WIDTH = 340;
const MIN_AUTHORING_PANEL_HEIGHT = 360;
const SMALL_VIEWPORT_PANEL_HEIGHT = 260;

function withPanelFrameParams(iframeSrc: string): string {
  const parentOrigin = window.location.origin;

  try {
    const url = new URL(iframeSrc, window.location.href);
    url.searchParams.set('lodariqFrame', 'panel');
    if (
      parentOrigin &&
      parentOrigin !== 'null' &&
      url.origin !== parentOrigin &&
      ['http:', 'https:'].includes(url.protocol)
    ) {
      url.searchParams.set('parentOrigin', parentOrigin);
    }
    return url.toString();
  } catch {
    return iframeSrc;
  }
}

export function openLocalAuthoringPanel(
  session: AuthoringSession,
  options: LocalAuthoringPanelOptions,
): LocalAuthoringPanel {
  if (activePanel) {
    void activePanel.saveAndClose();
    return activePanel;
  }

  const host = document.createElement('lodariq-authoring-panel');
  const shadow = host.attachShadow({ mode: 'open' });
  const iframeSrc = withPanelFrameParams(options.iframeSrc);
  const iframeOrigin = new URL(iframeSrc, window.location.href).origin;
  const preview = options.preview;
  let previewDocument =
    (options.initialDocument ? structuredClone(options.initialDocument) : null) ??
    preview?.loadDocument(session.documentId) ??
    null;
  let previewRequestId = 0;
  let picker: TargetPicker | null = null;
  let bridge: AuthoringBridge | null = null;
  let stopLifecycleObserver: (() => void) | null = null;
  let stopPanelAnchorSync: (() => void) | null = null;
  let pendingSaveBeforeClose: {
    requestCorrelationId: string;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  shadow.appendChild(createPanelStyles());
  const panelElement = document.createElement('section');
  panelElement.className = 'panel';
  panelElement.setAttribute('role', 'dialog');
  panelElement.setAttribute('aria-label', 'Lodariq authoring');
  panelElement.innerHTML = `
    <div class="panel-surface">
      <header>
        <span class="panel-title">
          <span class="panel-mark" aria-hidden="true">T</span>
          <strong>Lodariq</strong>
        </span>
        <button type="button" aria-label="Close Lodariq authoring">
          <span aria-hidden="true">Close</span>
        </button>
      </header>
      <slot name="authoring-frame"></slot>
    </div>
  `;
  shadow.appendChild(panelElement);

  const iframe = document.createElement('iframe');
  iframe.slot = 'authoring-frame';
  iframe.title = 'Lodariq authoring';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('src', iframeSrc);
  host.appendChild(iframe);

  const closeButton = shadow.querySelector('button');
  const panelHeader = shadow.querySelector<HTMLElement>('header');

  const close = (): void => {
    if (pendingSaveBeforeClose) {
      clearTimeout(pendingSaveBeforeClose.timer);
      pendingSaveBeforeClose.resolve();
      pendingSaveBeforeClose = null;
    }
    picker?.cancel();
    picker = null;
    stopPanelAnchorSync?.();
    stopPanelAnchorSync = null;
    stopLifecycleObserver?.();
    stopLifecycleObserver = null;
    bridge?.stop();
    bridge = null;
    preview?.stopPreview?.();
    clearTargetReveal();
    host.remove();
    setAuthoringPanelOpenState(false);
    if (activePanel === panel) activePanel = null;
  };

  const saveAndClose = (): Promise<void> => {
    if (!bridge || !host.isConnected) {
      close();
      return Promise.resolve();
    }
    if (pendingSaveBeforeClose) {
      return new Promise((resolve) => {
        const previousResolve = pendingSaveBeforeClose?.resolve;
        if (pendingSaveBeforeClose) {
          pendingSaveBeforeClose.resolve = () => {
            previousResolve?.();
            resolve();
          };
        }
      });
    }

    const requestCorrelationId = createBridgeCorrelationId('authoring_save_request');
    return new Promise((resolve) => {
      pendingSaveBeforeClose = {
        requestCorrelationId,
        resolve,
        timer: setTimeout(() => {
          if (pendingSaveBeforeClose?.requestCorrelationId !== requestCorrelationId) return;
          close();
        }, 1000),
      };
      try {
        bridge?.send({
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: requestCorrelationId,
          type: 'authoring.save.request',
        });
      } catch {
        close();
      }
    });
  };

  const panel: LocalAuthoringPanel = {
    close,
    destroy: close,
    saveAndClose,
  };

  closeButton?.addEventListener('click', () => {
    void saveAndClose();
  });
  attachPanelDrag(host, panelHeader);
  iframe?.addEventListener('load', () => {
    if (!iframe.contentWindow) return;
    stopLifecycleObserver?.();
    stopLifecycleObserver = null;
    bridge?.stop();
    bridge = new AuthoringBridge(iframe.contentWindow, {
      allowedOrigins: [iframeOrigin],
      targetOrigin: iframeOrigin,
      expectedSessionId: session.sessionId,
      expectedDocumentId: session.documentId,
      onMessage: (message) => {
        if (message.type === 'authoring.save.result') {
          if (
            pendingSaveBeforeClose &&
            message.requestCorrelationId === pendingSaveBeforeClose.requestCorrelationId
          ) {
            const documentToSave = message.document ?? previewDocument;
            if (documentToSave && options.onSave) {
              void Promise.resolve(options.onSave(structuredClone(documentToSave)))
                .then(() => close())
                .catch((error: unknown) => {
                  pendingSaveBeforeClose?.resolve();
                  pendingSaveBeforeClose = null;
                  dispatchAuthoringSaveError(error);
                });
            } else {
              close();
            }
          }
          return;
        }
        if (message.type === 'preview.patch') {
          queuePreview(message.blockId, message.patch.ops);
          return;
        }
        if (message.type === 'target.pick.canceled') {
          picker?.cancel();
          picker = null;
          return;
        }
        if (message.type === 'target.inspect.request') {
          handleTargetInspect(message);
          return;
        }
        if (message.type !== 'target.pick.start') return;
        picker?.cancel();
        picker = startTargetPicker({
          onPick: ({ fingerprint }) => {
            picker = null;
            void bridge
              ?.sendWithAck(
                {
                  protocol: BRIDGE_PROTOCOL_VERSION,
                  sessionId: session.sessionId,
                  documentId: session.documentId,
                  correlationId: createBridgeCorrelationId('target_pick_result'),
                  type: 'target.pick.result',
                  blockId: message.blockId,
                  fingerprint,
                },
                { timeoutMs: 2000 },
              )
              .catch(() => {});
          },
          onCancel: () => {
            picker = null;
            bridge?.send({
              protocol: BRIDGE_PROTOCOL_VERSION,
              sessionId: session.sessionId,
              documentId: session.documentId,
              correlationId: createBridgeCorrelationId('target_pick_canceled'),
              type: 'target.pick.canceled',
              blockId: message.blockId,
            });
          },
        });
      },
    });
    bridge.start();
    if (options.initialDocument) {
      bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: session.sessionId,
        documentId: session.documentId,
        correlationId: createBridgeCorrelationId('authoring_init'),
        type: 'authoring.init',
        workspaceId: session.workspaceId,
        environment: session.environment,
        document: structuredClone(options.initialDocument),
      });
    }
    stopLifecycleObserver = startPageLifecycleObserver(bridge, session);
  });

  document.body.appendChild(host);
  setAuthoringPanelOpenState(true);
  stopPanelAnchorSync = startPanelAnchorSync(host);
  activePanel = panel;

  function queuePreview(blockId: string, ops: PreviewPatchOperation[]): void {
    if (!preview) return;
    const current = previewDocument ?? preview.loadDocument(session.documentId);
    if (!current) return;

    previewDocument = applyPreviewPatch(current, blockId, ops);
    const stepId = findContainingTourStepId(previewDocument.blocks, blockId);
    const requestId = ++previewRequestId;
    void preview
      .compilePreview(structuredClone(previewDocument))
      .then((compiled) => {
        if (requestId !== previewRequestId || !host.isConnected) return;
        if (stepId && !compiled.steps.some((step) => step.id === stepId && step.targetId)) {
          preview.stopPreview?.();
          return;
        }
        return preview.playPreview(compiled, stepId ? { stepId } : undefined);
      })
      .catch((error: unknown) => {
        preview.onPreviewError?.(error);
      });
  }

  function handleTargetInspect(
    message: Extract<BridgeMessage, { type: 'target.inspect.request' }>,
  ): void {
    const diagnostic = inspectTarget(message.fingerprint, message.action);
    void bridge
      ?.sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: session.sessionId,
          documentId: session.documentId,
          correlationId: createBridgeCorrelationId('target_inspect_result'),
          type: 'target.inspect.result',
          blockId: message.blockId,
          targetId: message.targetId,
          action: message.action,
          diagnostic,
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {});
  }

  return panel;
}

function startPanelAnchorSync(host: HTMLElement): () => void {
  const sync = (): void => {
    positionPanelFromAuthoringTrigger(host);
  };
  document.addEventListener(LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT, sync);
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  sync();
  scheduleAnimationFrame(sync);

  return () => {
    document.removeEventListener(LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT, sync);
    window.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
  };
}

function positionPanelFromAuthoringTrigger(host: HTMLElement): void {
  const trigger = document.querySelector<HTMLElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR);
  if (!trigger) return;

  const viewport = visibleViewportBounds(window);
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const margin = viewportWidth <= 600 ? 12 : 18;
  const triggerRect = positionOpenAuthoringTrigger(trigger, viewport, margin);

  const width = Math.min(
    DEFAULT_AUTHORING_PANEL_WIDTH,
    Math.max(MIN_AUTHORING_PANEL_WIDTH, viewportWidth - margin * 2),
  );
  const centerX = triggerRect.left + triggerRect.width / 2;
  const minHeight = authoringPanelMinimumHeight(viewportHeight, margin);
  const minTop = viewport.top + margin;
  const maxTop = Math.max(minTop, viewport.bottom - minHeight - margin);
  const top = clamp(
    triggerRect.bottom + 10,
    minTop,
    maxTop,
  );
  const left = clamp(centerX - width / 2, viewport.left + margin, viewport.right - width - margin);
  const height = authoringPanelHeight(viewport, top, margin);

  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  setPanelArrow(host, centerX - left, width);
}

function authoringPanelMinimumHeight(viewportHeight: number, margin: number): number {
  return Math.min(
    MIN_AUTHORING_PANEL_HEIGHT,
    Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewportHeight - margin * 2),
  );
}

function authoringPanelHeight(
  viewport: ReturnType<typeof visibleViewportBounds>,
  top: number,
  margin: number,
): number {
  const availableHeight = Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewport.bottom - top - margin);
  return Math.min(DEFAULT_AUTHORING_PANEL_HEIGHT, availableHeight);
}

function positionOpenAuthoringTrigger(
  trigger: HTMLElement,
  viewport: ReturnType<typeof visibleViewportBounds>,
  margin: number,
): Pick<DOMRect, 'bottom' | 'height' | 'left' | 'width'> {
  const rect = trigger.getBoundingClientRect();
  const width = rect.width || 52;
  const height = rect.height || 52;
  const rightMargin = viewport.width <= 600 ? 16 : 20;
  const manualPlacement = trigger.dataset[LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY] === 'true';
  const left = manualPlacement
    ? clamp(rect.left, viewport.left + margin, viewport.right - width - margin)
    : clamp(
        viewport.right - width - rightMargin,
        viewport.left + margin,
        viewport.right - width - margin,
      );
  const top = manualPlacement
    ? clamp(rect.top, viewport.top + margin, viewport.bottom - height - margin)
    : clamp(viewport.top + 18, viewport.top + margin, viewport.bottom - height - margin);

  trigger.style.left = `${left}px`;
  trigger.style.top = `${top}px`;
  trigger.style.right = 'auto';
  trigger.style.bottom = 'auto';

  return {
    bottom: top + height,
    height,
    left,
    width,
  };
}

function attachPanelDrag(host: HTMLElement, panelHeader: HTMLElement | null): void {
  if (!panelHeader) return;
  let drag: {
    pointerId: number | 'mouse';
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  let dragShield: HTMLElement | null = null;

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    drag.moved = true;
    event.preventDefault();
    movePanelWithAuthoringTrigger(host, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (drag || event.button !== 0) return;
    if ((event.target as Element | null)?.closest('button')) return;
    const rect = host.getBoundingClientRect();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    drag = {
      pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    dragShield = createAuthoringDragShield(host.ownerDocument);
    panelHeader.dataset['lodariqAuthoringDragging'] = 'true';

    if (pointerId === 'mouse') {
      ownerWindow.addEventListener('mousemove', move, true);
      ownerWindow.addEventListener('mouseup', finish, true);
      return;
    }

    panelHeader.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = drag.pointerId;
    if (pointerId === 'mouse') {
      ownerWindow.removeEventListener('mousemove', move, true);
      ownerWindow.removeEventListener('mouseup', finish, true);
    } else {
      panelHeader.releasePointerCapture?.(pointerId);
      ownerWindow.removeEventListener('pointermove', move, true);
      ownerWindow.removeEventListener('pointerup', finish, true);
      ownerWindow.removeEventListener('pointercancel', finish, true);
    }
    dragShield?.remove();
    dragShield = null;
    delete panelHeader.dataset['lodariqAuthoringDragging'];
    drag = null;
  };

  panelHeader.addEventListener('pointerdown', start);
  panelHeader.addEventListener('mousedown', start);
}

function createAuthoringDragShield(doc: Document): HTMLElement {
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

function movePanelWithAuthoringTrigger(host: HTMLElement, left: number, top: number): void {
  const trigger = document.querySelector<HTMLElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR);
  const hostRect = host.getBoundingClientRect();
  const triggerRect = trigger?.getBoundingClientRect();
  const viewport = visibleViewportBounds(window);
  const margin = viewport.width <= 600 ? 12 : 18;
  const triggerWidth = triggerRect?.width || 54;
  const triggerHeight = triggerRect?.height || 54;
  const width = Math.min(
    hostRect.width || DEFAULT_AUTHORING_PANEL_WIDTH,
    viewport.width - margin * 2,
  );
  const minHeight = authoringPanelMinimumHeight(viewport.height, margin);
  const minTop = viewport.top + triggerHeight + margin + 10;
  const maxTop = Math.max(minTop, viewport.bottom - minHeight - margin);
  const nextLeft = clamp(left, viewport.left + margin, viewport.right - width - margin);
  const nextTop = clamp(top, minTop, maxTop);
  const height = authoringPanelHeight(viewport, nextTop, margin);
  const arrowX = clamp(width - 42, 28, width - 28);

  host.style.left = `${nextLeft}px`;
  host.style.top = `${nextTop}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  setPanelArrow(host, arrowX, width);

  if (trigger) {
    trigger.dataset[LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY] = 'true';
    const triggerLeft = clamp(
      nextLeft + arrowX - triggerWidth / 2,
      viewport.left + margin,
      viewport.right - triggerWidth - margin,
    );
    const triggerTop = clamp(
      nextTop - triggerHeight - 10,
      viewport.top + margin,
      viewport.bottom - triggerHeight - margin,
    );
    trigger.style.left = `${triggerLeft}px`;
    trigger.style.top = `${triggerTop}px`;
    trigger.style.right = 'auto';
    trigger.style.bottom = 'auto';
  }
}

function setPanelArrow(host: HTMLElement, x: number, panelWidth: number): void {
  host.style.setProperty('--lodariq-panel-arrow-x', `${clamp(x, 28, panelWidth - 28)}px`);
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

function setAuthoringPanelOpenState(open: boolean): void {
  if (open) {
    ensureAuthoringHostLayerStyles(document);
    document.documentElement.setAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE);
  }
  document
    .querySelectorAll<HTMLButtonElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR)
    .forEach((button) => {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) delete button.dataset[LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY];
    });
}

function ensureAuthoringHostLayerStyles(doc: Document): void {
  if (doc.getElementById(AUTHORING_HOST_LAYER_STYLE_ID)) return;
  const style = createNonceStyleElement(
    doc,
    `
    :root[${AUTHORING_PANEL_OPEN_ATTRIBUTE}="true"] lodariq-tour {
      --lodariq-tour-z-index: 2147483644;
    }
  `,
  );
  style.id = AUTHORING_HOST_LAYER_STYLE_ID;
  doc.head.appendChild(style);
}

function dispatchAuthoringSaveError(error: unknown): void {
  window.dispatchEvent(
    new CustomEvent('lodariq:authoring-save-error', {
      detail: { error },
    }),
  );
}

function startPageLifecycleObserver(
  bridge: AuthoringBridge,
  session: Pick<AuthoringSession, 'sessionId' | 'documentId'>,
): () => void {
  let disposed = false;
  let scheduled = false;
  let ackPending = false;
  let dirtyWhileAckPending = false;
  let lastSent = '';

  const schedule = (): void => {
    if (disposed) return;
    if (ackPending) {
      dirtyWhileAckPending = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    scheduleAnimationFrame(flush);
  };

  const flush = (): void => {
    scheduled = false;
    if (disposed) return;

    const snapshot = currentLifecycleSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSent) return;
    lastSent = serialized;
    ackPending = true;
    dirtyWhileAckPending = false;

    const message: BridgeMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      documentId: session.documentId,
      correlationId: createBridgeCorrelationId('page_lifecycle_update'),
      type: 'page.lifecycle.update',
      route: snapshot.route,
      scrollState: snapshot.scrollState,
    };

    void bridge
      .sendWithAck(message, { timeoutMs: 1000 })
      .catch(() => {})
      .finally(() => {
        ackPending = false;
        if (dirtyWhileAckPending) schedule();
      });
  };

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', schedule);
  const restoreHistoryObservation = observeHistoryState(schedule);

  schedule();

  return () => {
    disposed = true;
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('hashchange', schedule);
    document.removeEventListener('visibilitychange', schedule);
    restoreHistoryObservation();
  };
}

function currentLifecycleSnapshot(): {
  route: string;
  scrollState: { x: number; y: number };
} {
  return {
    route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    scrollState: {
      x: window.scrollX,
      y: window.scrollY,
    },
  };
}

function observeHistoryState(onChange: () => void): () => void {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const wrap = <T extends History['pushState'] | History['replaceState']>(original: T): T =>
    function wrappedHistoryState(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ): void {
      original.call(this, data, unused, url);
      onChange();
    } as T;

  const wrappedPushState = wrap(originalPushState);
  const wrappedReplaceState = wrap(originalReplaceState);
  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;

  return () => {
    if (window.history.pushState === wrappedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === wrappedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  window.setTimeout(callback, 16);
}

function inspectTarget(
  fingerprint: ElementFingerprint,
  action: TargetInspectAction,
): ResolverDiagnostic {
  const result = resolve(fingerprint);
  if (action === 'view' && result.element) revealTarget(result.element);
  return {
    state: result.state,
    confidence: result.confidence,
    candidateCount: result.candidateCount,
    resolutionMethod: result.resolutionMethod,
    message: targetInspectMessage(action, result.state),
  };
}

function targetInspectMessage(
  action: TargetInspectAction,
  state: ResolverDiagnostic['state'],
): string {
  if (state === 'found') {
    if (action === 'view') return 'Anchor highlighted on the page';
    if (action === 'test') return 'Anchor is ready';
    return 'Anchor is ready';
  }
  if (state === 'ambiguous') return 'Anchor needs a more specific selection';
  return 'Anchor needs attention on this page';
}

function revealTarget(element: Element): void {
  clearTargetReveal();
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  const doc = element.ownerDocument;
  const rect = element.getBoundingClientRect();
  const marker = doc.createElement('div');
  marker.dataset['lodariqBridge'] = 'target-reveal';
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: '2147483645',
    pointerEvents: 'none',
    border: '2px solid #16a34a',
    borderRadius: '6px',
    boxShadow: '0 0 0 5px rgba(22, 163, 74, 0.18)',
  });
  doc.body.appendChild(marker);
  window.setTimeout(() => marker.remove(), 1200);
}

function clearTargetReveal(): void {
  document
    .querySelectorAll('[data-lodariq-bridge="target-reveal"]')
    .forEach((marker) => marker.remove());
}

function applyPreviewPatch(
  document: LodariqDocument,
  blockId: string,
  ops: PreviewPatchOperation[],
): LodariqDocument {
  let next = structuredClone(document);
  for (const op of ops) {
    if (op.op === 'insertBlock') {
      next = { ...next, blocks: renumberTourSteps([...next.blocks, structuredClone(op.block)]) };
    }
    if (op.op === 'insertBlocks') {
      next = {
        ...next,
        blocks: renumberTourSteps([...next.blocks, ...structuredClone(op.blocks)]),
      };
    }
    if (op.op === 'updateContent') {
      next = { ...next, blocks: updateBlockContent(next.blocks, blockId, op.content) };
    }
    if (op.op === 'moveBlock') {
      const blocks = moveTopLevelBlock(next.blocks, blockId, op.direction);
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'reorderBlock') {
      const blocks = reorderTopLevelBlock(next.blocks, blockId, op.beforeBlockId);
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'transformBlock') {
      next = { ...next, blocks: transformBlocks(next.blocks, blockId, op.type) };
    }
    if (op.op === 'setAction') {
      next = { ...next, blocks: setBlockAction(next.blocks, blockId, op.action ?? null) };
    }
    if (op.op === 'attachTarget') {
      const label =
        op.fingerprint.accessibleName ??
        op.fingerprint.stableAttributes['data-lodariq-id'] ??
        op.fingerprint.tagName;
      next = {
        ...next,
        targets: [
          ...next.targets.filter((target) => target.id !== op.targetId),
          { id: op.targetId, fingerprint: structuredClone(op.fingerprint) },
        ],
        blocks: attachTargetToBlocks(next.blocks, blockId, op.targetId, label),
      };
    }
    if (op.op === 'removeTarget') {
      const blocks = removeTargetFromBlocks(next.blocks, blockId, op.targetId);
      next = {
        ...next,
        targets: blocksReferenceTarget(blocks, op.targetId)
          ? next.targets
          : next.targets.filter((target) => target.id !== op.targetId),
        blocks,
      };
    }
    if (op.op === 'replaceDocument') {
      next = structuredClone(op.document);
    }
  }
  return next;
}

function findContainingTourStepId(
  blocks: LodariqBlock[],
  blockId: string,
  currentStepId?: string,
): string | undefined {
  for (const block of blocks) {
    const stepId = block.type === 'tourStep' ? block.id : currentStepId;
    if (block.id === blockId) return stepId;
    const childStepId = findContainingTourStepId(block.children, blockId, stepId);
    if (childStepId) return childStepId;
  }
  return undefined;
}

function createPanelStyles(): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      top: 82px;
      right: 18px;
      bottom: auto;
      display: block;
      width: min(550px, calc(100vw - 36px));
      height: min(820px, calc(100dvh - 100px));
      max-height: calc(100dvh - 100px);
      min-height: min(360px, calc(100dvh - 100px));
      z-index: 2147483646;
      pointer-events: auto;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-sizing: border-box;
    }

    .panel {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .panel::before {
      position: absolute;
      top: -7px;
      left: var(--lodariq-panel-arrow-x, calc(100% - 42px));
      width: 14px;
      height: 14px;
      border-top: 1px solid rgba(199, 211, 218, 0.92);
      border-left: 1px solid rgba(199, 211, 218, 0.92);
      background: #f8fbfc;
      content: "";
      transform: translateX(-50%) rotate(45deg);
      z-index: 1;
    }

    .panel-surface {
      position: relative;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(199, 211, 218, 0.92);
      border-radius: 12px;
      background: #f8fbfc;
      box-shadow:
        0 26px 70px rgba(15, 23, 42, 0.28),
        0 0 0 1px rgba(255, 255, 255, 0.86) inset;
      overflow: hidden;
      backdrop-filter: blur(16px);
      box-sizing: border-box;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 44px;
      padding: 0 10px 0 14px;
      border-bottom: 1px solid rgba(7, 25, 22, 0.9);
      background: linear-gradient(180deg, #071916, #09211e);
      color: #e8f2ef;
      cursor: grab;
      user-select: none;
    }

    header[data-lodariq-authoring-dragging="true"] {
      cursor: grabbing;
    }

    .panel-title {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .panel-mark {
      display: inline-grid;
      width: 24px;
      height: 24px;
      place-items: center;
      border-radius: 999px;
      background: #2e806f;
      color: #f4faf8;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
    }

    button {
      padding: 5px 10px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #dce9e5;
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.1);
      color: #f4faf8;
    }

    button:focus-visible {
      outline: 3px solid rgba(78, 207, 178, 0.36);
      outline-offset: 2px;
    }

    slot[name="authoring-frame"] {
      display: block;
      height: calc(100% - 44px);
      min-height: 0;
      overflow: hidden;
    }

    ::slotted(iframe[slot="authoring-frame"]) {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #edf2f5;
      pointer-events: auto;
    }

    @media (max-width: 600px) {
      :host {
        top: 78px;
        right: 12px;
        bottom: auto;
        left: 12px;
        width: auto;
        height: calc(100dvh - 90px);
        max-height: calc(100dvh - 90px);
        min-height: min(320px, calc(100dvh - 90px));
      }

      .panel::before {}
    }
  `,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
