import type {
  BridgeMessage,
  CompiledDocument,
  ElementFingerprint,
  PreviewPatchOperation,
  ResolverDiagnostic,
  TalmehBlock,
  TalmehDocument,
  TargetInspectAction,
} from '@talmeh/schema';
import { createNonceStyleElement } from '@talmeh/schema/dom';
import { resolve } from '@talmeh/sdk-runtime/resolver';
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

export * from './local-frame';

/**
 * Authoring shell (PRD §9.4).
 *
 * Loaded ONLY for authenticated creators entering authoring mode. Owns the
 * floating toolbar, element picker handoff, and the sandboxed iframe editor
 * served from a dedicated Talmeh origin (editor.talmeh.io, PRD §12.5).
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
  preview?: LocalAuthoringPreviewServices;
}

export interface LocalAuthoringPreviewOptions {
  stepId?: string;
}

export interface LocalAuthoringPreviewServices {
  loadDocument: (documentId: string) => TalmehDocument | null;
  compilePreview: (doc: TalmehDocument) => Promise<CompiledDocument>;
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
const AUTHORING_PANEL_OPEN_ATTRIBUTE = 'data-talmeh-authoring-panel-open';
const LOCAL_AUTHORING_TRIGGER_SELECTOR = '[data-talmeh-authoring-trigger="true"]';
const DEFAULT_AUTHORING_PANEL_WIDTH = 550;
const MIN_AUTHORING_PANEL_WIDTH = 320;

export function openLocalAuthoringPanel(
  session: AuthoringSession,
  options: LocalAuthoringPanelOptions,
): LocalAuthoringPanel {
  if (activePanel) {
    void activePanel.saveAndClose();
    return activePanel;
  }

  const host = document.createElement('talmeh-authoring-panel');
  const shadow = host.attachShadow({ mode: 'open' });
  const iframeOrigin = new URL(options.iframeSrc, window.location.href).origin;
  const preview = options.preview;
  let previewDocument = preview?.loadDocument(session.documentId) ?? null;
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
  panelElement.setAttribute('aria-label', 'Talmeh authoring');
  panelElement.innerHTML = `
    <div class="panel-surface">
      <header>
        <span class="panel-title">
          <span class="panel-mark" aria-hidden="true">T</span>
          <strong>Talmeh</strong>
        </span>
        <button type="button" aria-label="Close Talmeh authoring">
          <span aria-hidden="true">Close</span>
        </button>
      </header>
      <slot name="authoring-frame"></slot>
    </div>
  `;
  shadow.appendChild(panelElement);

  const iframe = document.createElement('iframe');
  iframe.slot = 'authoring-frame';
  iframe.title = 'Talmeh authoring';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.setAttribute('src', options.iframeSrc);
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
            close();
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
  const minHeight = Math.min(360, Math.max(260, viewportHeight * 0.42));
  const top = clamp(triggerRect.bottom + 10, viewport.top + margin, viewport.bottom - minHeight);
  const left = clamp(centerX - width / 2, viewport.left + margin, viewport.right - width - margin);
  const bottom = Math.max(window.innerHeight - viewport.bottom + margin, margin);

  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
  host.style.bottom = `${bottom}px`;
  host.style.width = `${width}px`;
  setPanelArrow(host, centerX - left, width);
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
    panelHeader.dataset['talmehAuthoringDragging'] = 'true';

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
    delete panelHeader.dataset['talmehAuthoringDragging'];
    drag = null;
  };

  panelHeader.addEventListener('pointerdown', start);
  panelHeader.addEventListener('mousedown', start);
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
  const nextLeft = clamp(left, viewport.left + margin, viewport.right - width - margin);
  const nextTop = clamp(top, viewport.top + triggerHeight + margin + 10, viewport.bottom - 260);
  const bottom = Math.max(window.innerHeight - viewport.bottom + margin, margin);
  const arrowX = clamp(width - 42, 28, width - 28);

  host.style.left = `${nextLeft}px`;
  host.style.top = `${nextTop}px`;
  host.style.right = 'auto';
  host.style.bottom = `${bottom}px`;
  host.style.width = `${width}px`;
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
  host.style.setProperty('--talmeh-panel-arrow-x', `${clamp(x, 28, panelWidth - 28)}px`);
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
    message: targetInspectMessage(action, result.state, result.resolutionMethod),
  };
}

function targetInspectMessage(
  action: TargetInspectAction,
  state: ResolverDiagnostic['state'],
  method: string,
): string {
  if (state === 'found') {
    if (action === 'view')
      return `Target found and highlighted by ${humanResolutionMethod(method)}`;
    if (action === 'test') return `Target test passed by ${humanResolutionMethod(method)}`;
    return `Found by ${humanResolutionMethod(method)}`;
  }
  if (state === 'ambiguous') return 'Multiple matching elements found';
  return 'Target not found on the current page';
}

function revealTarget(element: Element): void {
  clearTargetReveal();
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  const doc = element.ownerDocument;
  const rect = element.getBoundingClientRect();
  const marker = doc.createElement('div');
  marker.dataset['talmehBridge'] = 'target-reveal';
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
    .querySelectorAll('[data-talmeh-bridge="target-reveal"]')
    .forEach((marker) => marker.remove());
}

function humanResolutionMethod(method: string): string {
  switch (method) {
    case 'talmeh_id':
      return 'Talmeh ID';
    case 'stable_attribute':
      return 'stable attribute';
    case 'role_and_name':
      return 'role and label';
    case 'label':
      return 'label';
    case 'ancestor_landmark':
      return 'landmark';
    case 'relative_position':
      return 'relative position';
    case 'scoped_css':
      return 'scoped CSS';
    default:
      return 'semantic match';
  }
}

function applyPreviewPatch(
  document: TalmehDocument,
  blockId: string,
  ops: PreviewPatchOperation[],
): TalmehDocument {
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
        op.fingerprint.stableAttributes['data-talmeh-id'] ??
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
  blocks: TalmehBlock[],
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
      bottom: 16px;
      display: block;
      width: min(550px, calc(100vw - 36px));
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
      left: var(--talmeh-panel-arrow-x, calc(100% - 42px));
      width: 14px;
      height: 14px;
      border-top: 1px solid rgba(203, 213, 225, 0.78);
      border-left: 1px solid rgba(203, 213, 225, 0.78);
      background: rgba(255, 255, 255, 0.98);
      content: "";
      transform: translateX(-50%) rotate(45deg);
      z-index: 1;
    }

    .panel-surface {
      position: relative;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(203, 213, 225, 0.82);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow:
        0 26px 70px rgba(15, 23, 42, 0.18),
        0 0 0 1px rgba(255, 255, 255, 0.55) inset;
      overflow: hidden;
      backdrop-filter: blur(16px);
      box-sizing: border-box;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 42px;
      padding: 0 10px 0 12px;
      border-bottom: 1px solid rgba(226, 232, 240, 0.82);
      background: rgba(255, 255, 255, 0.96);
      color: #172033;
      cursor: grab;
      user-select: none;
    }

    header[data-talmeh-authoring-dragging="true"] {
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
      background: #126451;
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
    }

    button {
      padding: 5px 10px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: #f6f8fb;
      color: #334155;
      font: inherit;
      cursor: pointer;
    }

    button:hover {
      background: #e8edf6;
      color: #111827;
    }

    button:focus-visible {
      outline: 3px solid rgba(37, 99, 235, 0.32);
      outline-offset: 2px;
    }

    slot[name="authoring-frame"] {
      display: block;
      height: calc(100% - 42px);
      min-height: 0;
      overflow: hidden;
    }

    ::slotted(iframe[slot="authoring-frame"]) {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #fff;
      pointer-events: auto;
    }

    @media (max-width: 600px) {
      :host {
        top: 78px;
        right: 12px;
        bottom: 12px;
        left: 12px;
        width: auto;
      }

      .panel::before {}
    }
  `,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
