import {
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
  type LodariqDocument,
} from '@lodariq/schema';
import {
  TARGET_OUTLINE_GAP_PX,
  type ProtectedSurfaceRect,
} from '@lodariq/sdk-runtime/renderers/tour';
import { AUTHORING_PANEL_LABELS } from '../panel-config';
import {
  AUTHORING_BROWSING_ATTRIBUTE,
  AUTHORING_PANELS_HIDDEN_ATTRIBUTE,
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_SHELL_ATTRIBUTE,
} from '../panel-attributes';
import { attachOverlayClickOutside } from './click-outside';
import type { OverlayPlacement } from '../canvas/edge-resize';
import { createCompass, syncCompass } from './compass';
import {
  createFilmstrip,
  renderFilmstripSteps,
  tooltipOfStep,
  tourStepsOf,
  type FilmstripPresence,
} from './filmstrip';
import {
  livePeers,
  peerInitials,
  peersOnStep,
  stepEditability,
  type PresenceState,
} from '../presence/presence-model';
import {
  applyOperationsGeometry,
  applyOverlayGeometry,
  attachOverlayFrameInteractions,
  chooseOverlayToolbarSide,
  createOverlayFrame,
  createShowChip,
  hideIframe,
} from './geometry';
import { OVERLAY_CHROME_PAD_PX } from './constants';
import { cornerPreference, createOverlayLayerManager } from './layer-manager';
import { createBigModal } from './big-modal';
import { createCaptions } from './captions';
import { createCommandPalette } from './command-palette';
import { keyboardMapModal } from './keyboard-map';
import { createLockBand } from './lock-band';
import { createModePill } from './mode-pill';
import { createPreviewBar } from './preview-bar';
import { authoringText } from '../../i18n';
import type { ModePillMode, ModePillState } from './mode-pill.types';
import { startPulseLoop } from './pulse-loop';
import { createToastLayer, showToast, type ToastOptions } from './toasts';
import { createPulseLayer, syncPulses } from './pulses';
import {
  createTargetRing,
  resolveStepTargetRing,
  syncTargetRing,
  type TargetRingState,
} from './target-ring';
import { OVERLAY_CHROME_CORNERS, type OverlayChromeCorner } from './solver.types';
import type { OverlayShell, OverlayShellCallbacks, OverlayShellPresentation } from './types';

/** The filmstrip belongs bottom-left; the pill starts bottom-right and moves last. */
const FILMSTRIP_CORNERS: readonly OverlayChromeCorner[] = [
  'bottom-left',
  'top-left',
  'bottom-right',
  'top-right',
];

/** Presentation → what the creator is shown in the pill (§3.3). Four states, two controls. */
const PILL_MODE_BY_PRESENTATION: Readonly<Record<OverlayShellPresentation, ModePillMode>> = {
  collapsed: 'editing',
  overlay: 'editing',
  operations: 'editing',
  picking: 'picking',
  previewing: 'previewing',
};

export function createOverlayShell(
  host: HTMLElement,
  shadow: ShadowRoot,
  iframe: HTMLIFrameElement,
  callbacks: OverlayShellCallbacks,
): OverlayShell {
  const root = shadow.querySelector<HTMLElement>('[data-overlay-root]') ?? shadow;
  const filmstrip = createFilmstrip(host.ownerDocument);
  const pulses = createPulseLayer(host.ownerDocument);
  const compass = createCompass(host.ownerDocument);
  const targetRing = createTargetRing(host.ownerDocument, () => {
    targetSelected = true;
    render();
    callbacks.onSelectTarget();
  });
  const frame = createOverlayFrame(host.ownerDocument);
  const dimmer = createOperationsDimmer(host.ownerDocument);

  let presentation: OverlayShellPresentation = 'collapsed';
  let previewDocument: LodariqDocument | null = null;
  let activeStepId: string | null = null;
  let runtimeStepId: string | null = null;
  let cardRect: ProtectedSurfaceRect | null = null;
  /**
   * The size a resize drag is proposing, while the pointer is still down.
   *
   * The runtime goes on reporting the published card's real rect throughout the
   * drag — nothing has been committed yet — and every one of those reports
   * re-solved the frame and undid the draft. So the draft has to be what the
   * solver reads, not something written after it. Cleared on commit, when a real
   * rect for the new size arrives.
   */
  let resizeDraft: { width: number; height: number } | null = null;
  /**
   * Set on commit, cleared when a rect for the committed size arrives.
   *
   * The commit is a round trip — host → frame → document → runtime → a new rect —
   * and dropping the draft at `pointerup` left one frame solved from the old rect.
   * The card flashed back to the size it had been and jumped forward again, on
   * every single release. The timer is only a backstop for a commit that never
   * comes back.
   */
  let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null;
  let targetRect: ProtectedSurfaceRect | null = null;
  /** The resolver's verdict on the active step's target, for §4.4's ring. */
  let targetState: TargetRingState | null = null;
  /** True while the inspector is showing the target rather than the card. */
  let targetSelected = false;
  /** The inspector's box in viewport coordinates, or null while it is closed. */
  let inspectorRect: ProtectedSurfaceRect | null = null;
  let browsing = false;
  let panelsHidden = false;
  /** Until the frame answers `init` there is no provider, so the AI rows say so. */
  let assistAvailable = false;
  /** Captions default on, as in the prototype: the script is why they are there. */
  let captionsOn = true;
  let selectedStepIds: ReadonlySet<string> = new Set();
  /** Who else is here (§15.2 layer 1). Null until a host supplies presence. */
  let presence: PresenceState | null = null;

  const pill = createModePill(host.ownerDocument, {
    onModeChange: (mode) => setBrowsing(mode === 'browsing'),
    onPreview: () => callbacks.onStartPreview(),
    onOpenOperations: (tab?: string) => callbacks.onOpenOperations(tab),
    onToggleAllPanels: () => setPanelsHidden(!panelsHidden),
    onRetrySave: () => callbacks.onRetrySave(),
    onExitAuthoring: () => callbacks.onClose(),
    onSwitchExperience: (type) => callbacks.onSwitchExperience(type),
    onEnvironmentChange: (environment) => callbacks.onEnvironmentChange(environment),
    onToggleRecording: () => callbacks.onToggleRecording(),
    onSimulateUser: () => callbacks.onSimulateUser(),
    onCanvasZoom: (direction) => callbacks.onCanvasZoom(direction),
    onKeyboardMap: () => bigModal.open(keyboardMapModal()),
    onCommandPalette: () => palette.open(),
    onRestart: () => callbacks.onRestart(),
  });
  const bigModal = createBigModal(host.ownerDocument);
  const palette = createCommandPalette(host.ownerDocument, {
    assistAvailable: () => assistAvailable,
    actions: {
      addStep: () => callbacks.onAddStep(),
      retarget: () => callbacks.onRetarget(),
      toggleRecording: () => callbacks.onToggleRecording(),
      openOperations: (tab) => callbacks.onOpenOperations(tab),
      preview: () => callbacks.onStartPreview(),
      simulateUser: () => callbacks.onSimulateUser(),
      hidePanels: () => setPanelsHidden(true),
      ask: (prompt) => callbacks.onAskLodariq(prompt),
    },
  });
  const captions = createCaptions(host.ownerDocument);
  const previewBar = createPreviewBar(host.ownerDocument, {
    onStep: (direction) => callbacks.onPreviewStep(direction),
    onEditStep: () => callbacks.onEditPreviewStep(),
    onExit: () => callbacks.onExitPreview(),
    onToggleCaptions: () => {
      captionsOn = !captionsOn;
      syncPill();
    },
  });
  const showChip = createShowChip(host.ownerDocument);
  showChip.addEventListener('click', () => setPanelsHidden(false));
  const lockBand = createLockBand(host.ownerDocument, {
    // WIRE_BE: asking is a message on the host's collaboration channel. With no
    // channel there is nobody to deliver it to, so the notice is all there is.
    onAsk: (_stepId, holderName) =>
      notify(
        authoringText('Asked {name} for this step. They keep it until they release it.', {
          name: holderName,
        }),
      ),
    onDuplicate: (stepId) => callbacks.onDuplicateStep(stepId),
  });
  root.append(
    dimmer,
    filmstrip,
    pulses,
    targetRing,
    compass,
    frame,
    pill.element,
    showChip,
    lockBand.element,
    previewBar.element,
    captions.element,
    bigModal.element,
    palette.element,
  );

  const titleInput = filmstrip.querySelector<HTMLInputElement>('[data-panel-document-title]');
  titleInput?.addEventListener('blur', () => {
    const title = titleInput.value.trim() || 'Untitled experience';
    titleInput.value = title;
    callbacks.onTitleCommit(title);
  });
  titleInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleInput.blur();
    }
  });
  filmstrip.querySelector('[data-filmstrip-add-step]')?.addEventListener('click', () => {
    callbacks.onAddStep();
  });
  dimmer.addEventListener('click', () => {
    callbacks.onCloseOperations();
  });
  // Hide, on the card's own corner (§3.4 rule 4). The mode pill takes it back.
  frame.addEventListener('click', (event) => {
    const tool = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-card-tool]');
    if (tool?.dataset['cardTool'] === 'hide') setPanelsHidden(true);
  });
  filmstrip.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const insertAt = target?.closest<HTMLButtonElement>('[data-insert-step-at]')?.dataset[
      'insertStepAt'
    ];
    if (insertAt !== undefined) {
      const steps = tourStepsOf(previewDocument);
      const neighbour = steps[Number.parseInt(insertAt, 10)];
      // Past the last chip there is no neighbour, and that is just Add.
      if (neighbour) callbacks.onInsertStepBefore(neighbour.id);
      else callbacks.onAddStep();
      return;
    }
    const removeId = target?.closest<HTMLButtonElement>('[data-remove-step-id]')?.dataset[
      'removeStepId'
    ];
    if (removeId) {
      // Undoable, so it does not ask twice — the undo is cheaper than a dialog.
      callbacks.onDeleteStep(removeId);
      return;
    }
    const stepButton = target?.closest<HTMLButtonElement>('[data-step-id]');
    const stepId = stepButton?.dataset['stepId'];
    if (!stepId) return;
    // ⇧ extends, ⌘/⌃ adds (§4.5). A plain click is still a plain selection.
    if (event.shiftKey) callbacks.onSelectStepAdditive(stepId, 'range');
    else if (event.metaKey || event.ctrlKey) callbacks.onSelectStepAdditive(stepId, 'add');
    else callbacks.onSelectStep(stepId);
  });
  filmstrip.addEventListener('keydown', (event) => {
    const stepButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '[data-step-id]',
    );
    const stepId = stepButton?.dataset['stepId'];
    if (!stepId) return;
    // An accelerator on the visible remove control, never the only way (§3.1a).
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (tourStepsOf(previewDocument).length <= 1) return;
      event.preventDefault();
      callbacks.onDeleteStep(stepId);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const steps = tourStepsOf(previewDocument);
      const index = steps.findIndex((step) => step.id === stepId);
      const next = steps[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (event.altKey) {
        event.preventDefault();
        callbacks.onMoveStep(stepId, event.key === 'ArrowRight' ? 'down' : 'up');
        return;
      }
      if (next) {
        event.preventDefault();
        callbacks.onSelectStep(next.id);
      }
    }
  });

  const stopFrame = attachOverlayFrameInteractions(frame, {
    /*
     * The card as drawn, not as reported. `cardRect` is the runtime's authored
     * rect; the frame is `max(that, measured content)`, so on any step whose
     * content is taller the two differ — 125 against 148 on the fixture's first
     * step. Starting the drag from 125 jumped the card the moment the pointer
     * moved and left every delta short by the difference.
     */
    getCardSize: () => {
      const box = frame.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
      return { width: cardRect?.width ?? 320, height: cardRect?.height ?? 200 };
    },
    getTargetRect: () => targetRect,
    onDragSnap: (placement) => {
      const tooltipId = activeTooltipId();
      if (tooltipId) callbacks.onPlacementCommit(tooltipId, placement);
    },
    /*
     * The frame mirrors these dataset values into its own CSS custom properties,
     * so writing them here is what makes the card track the pointer. The document
     * is untouched until the commit below — a drag is one edit, not one per
     * pointermove.
     */
    onResizeDraft: (size) => {
      resizeDraft = size;
      solveFrame();
    },
    onResize: (size, axes) => {
      holdResizeDraft();
      callbacks.onPopupSizeCommit(
        axes.width ? size.width : null,
        axes.height ? size.height : null,
      );
      // The limits are the part a creator cannot guess, so the confirmation
      // carries them rather than only echoing the number they just dragged to.
      showToast(
        toasts,
        AUTHORING_PANEL_LABELS.cardSize(
          Math.round(size.width),
          Math.round(size.height),
          TOOLTIP_WIDTH_PX_LIMITS,
          TOOLTIP_HEIGHT_PX_LIMITS,
        ),
      );
    },
  });
  const stopClickOutside = attachOverlayClickOutside({
    host,
    iframe,
    isActive: () => presentation === 'overlay' && !browsing,
    onCollapse: callbacks.onCollapse,
  });
  const layers = createOverlayLayerManager({
    stage: () => ({
      width: host.ownerDocument.documentElement.clientWidth,
      height: host.ownerDocument.documentElement.clientHeight,
    }),
  });
  const stopFilmstripLayer = layers.register({
    id: 'filmstrip',
    element: filmstrip,
    preference: () => FILMSTRIP_CORNERS,
  });
  const stopPillLayer = layers.register({
    id: 'mode-pill',
    element: pill.element,
    preference: () => cornerPreference(pill.corner(), OVERLAY_CHROME_CORNERS),
  });

  /**
   * Everything Lodariq is drawing in the overlay — card, toolbar and inspector all
   * live inside this one iframe, so its rect is the whole reserved area (§3.4).
   *
   * Pulses and the compass are measured against this rather than against the card
   * alone: a numbered badge sitting on the toolbar or on the open inspector is the
   * same overlap defect as one sitting on the card.
   */
  function reservedOverlayRect(): ProtectedSurfaceRect | null {
    if (presentation !== 'overlay' || iframe.hidden) return cardRect;
    const rect = iframe.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return cardRect;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  const stopPulses = startPulseLoop(() => {
    syncPulses(pulses, {
      activeStepId,
      card: reservedOverlayRect(),
      document: previewDocument,
      hideActive: presentation === 'overlay',
      onSelect: callbacks.onSelectStep,
      peerStepIds: heldStepIds(),
    });
    // A target that momentarily fails to re-resolve — an ambiguous pick, a
    // node being replaced — must not erase the rect the card is solved against,
    // or the chrome jumps onto the element the creator just chose.
    const resolvedTarget = resolveStepTargetRing(previewDocument, activeStepId);
    targetRect = resolvedTarget?.rect ?? targetRect;
    const nextState = resolvedTarget?.state ?? null;
    if (nextState !== targetState) {
      targetState = nextState;
      callbacks.onTargetStateChange?.(nextState);
    }
    if (presentation === 'overlay') {
      // The target moves when the page scrolls, and the card is solved against it.
      solveFrame();
      placeCompass();
    }
    placeRing();
    placeChrome();
  });
  const toasts = createToastLayer(host.ownerDocument);
  root.appendChild(toasts);

  function notify(message: string, options?: ToastOptions): void {
    showToast(toasts, message, options);
  }

  const render = (): void => {
    host.setAttribute(AUTHORING_SHELL_ATTRIBUTE, presentation);
    host.toggleAttribute(AUTHORING_BROWSING_ATTRIBUTE, browsing);
    host.toggleAttribute(AUTHORING_PANELS_HIDDEN_ATTRIBUTE, panelsHidden);
    const chromeHidden =
      presentation === 'picking' ||
      presentation === 'previewing' ||
      presentation === 'operations' ||
      panelsHidden ||
      host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
    filmstrip.hidden = chromeHidden;
    pulses.hidden = chromeHidden;
    dimmer.hidden = presentation !== 'operations';
    if (presentation === 'overlay') {
      solveFrame();
      placeCompass();
    } else if (presentation === 'operations') {
      applyOperationsGeometry(iframe, frame);
      compass.hidden = true;
    } else {
      hideIframe(iframe, frame);
      compass.hidden = true;
    }
    placeRing();
    syncLockBand();
    renderFilmstripSteps(filmstrip, previewDocument, activeStepId, selectedStepIds, filmstripPresence());
    syncPill();
    placeChrome({ force: true });
  };

  /** §15.2 layer 2 — only while composing, and only for the step you are on. */
  function syncLockBand(): void {
    // Browsing is not editing, so a lock on the step is not yet in anyone's way.
    const editability =
      presentation === 'overlay' && !browsing && !panelsHidden && presence && activeStepId
        ? stepEditability(presence, activeStepId, Date.now())
        : null;
    lockBand.setHolder(
      editability && !editability.editable && activeStepId
        ? {
            stepId: activeStepId,
            holderName: editability.holder?.name ?? authoringText('Someone else'),
            reason: editability.reason,
          }
        : null,
    );
  }

  /**
   * Automatic avoidance (§3.4 rule 5): chrome moves out of the way before the
   * creator notices, and only the reserved rect drives it.
   */
  function placeChrome(options: { force?: boolean } = {}): void {
    layers.setReserved(presentation === 'overlay' ? [cardRect, targetRect] : []);
    layers.setObstacles(launcherRects());
    layers.solve(options);
  }

  /**
   * The creator launcher is ours too, and it lives in the host page's light DOM
   * where the layer manager cannot see it. Without this the mode pill settles into
   * the same bottom-right corner and the two are drawn on the same pixels — the
   * §3.4 rule 1 overlap, between the two surfaces a creator uses most.
   */
  function launcherRects(): ProtectedSurfaceRect[] {
    const rects: ProtectedSurfaceRect[] = [];
    for (const element of host.ownerDocument.querySelectorAll<HTMLElement>(
      '[data-lodariq-creator-launcher="true"]',
    )) {
      if (!element.isConnected) continue;
      // A hidden launcher still measures — `visibility` keeps layout — and an
      // invisible surface is not something chrome should be dodging.
      const view = element.ownerDocument.defaultView;
      const visibility = view?.getComputedStyle(element).visibility;
      if (visibility === 'hidden' || visibility === 'collapse') continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      rects.push({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      });
    }
    return rects;
  }

  /**
   * Progress reads from the runtime step while previewing and from the selection
   * while composing, and is labelled for whichever it is (audit #6).
   */
  function syncPill(): void {
    const steps = tourStepsOf(previewDocument);
    const boundStepId = presentation === 'previewing' ? (runtimeStepId ?? activeStepId) : activeStepId;
    const index = steps.findIndex((step) => step.id === boundStepId);
    // Preview has its own bar (§4.7); the pill's switch and save state are about
    // composing and mean nothing while the tour is playing.
    const previewing = presentation === 'previewing';
    pill.element.hidden = previewing;
    previewBar.setVisible(previewing);
    const script = steps[index]?.props.narration?.script ?? null;
    previewBar.setState({
      stepNumber: index >= 0 ? index + 1 : null,
      stepCount: steps.length,
      captionsOn,
      hasScript: Boolean(script?.trim()),
    });
    captions.setScript(script);
    captions.setVisible(previewing && captionsOn);
    pill.setState({
      mode: browsing && presentation === 'overlay' ? 'browsing' : PILL_MODE_BY_PRESENTATION[presentation],
      stepNumber: index >= 0 ? index + 1 : null,
      stepCount: steps.length,
      panelsHidden,
      // WIRE_BE: presence arrives from the host's collaboration channel. With no
      // channel configured `presence` is undefined and nobody else is here.
      peers: presence
        ? livePeers(presence, Date.now()).map((peer) => ({
            creatorId: peer.creatorId,
            name: peer.name,
          }))
        : [],
    });
  }

  /** Steps a live peer is holding, for the pulse dot's peer variant (§15.2). */
  function heldStepIds(): ReadonlySet<string> {
    if (!presence) return new Set();
    const now = Date.now();
    return new Set(
      tourStepsOf(previewDocument)
        .filter((step) => peersOnStep(presence!, step.id, now).length > 0)
        .map((step) => step.id),
    );
  }

  /**
   * Adapts presence for the filmstrip, which needs names and initials rather than
   * the whole model. Peers are filtered by heartbeat inside `peersOnStep`, so a
   * closed laptop stops showing without any cleanup pass here.
   */
  function filmstripPresence(): FilmstripPresence | undefined {
    if (!presence) return undefined;
    const state = presence;
    return {
      peersOnStep: (stepId) =>
        peersOnStep(state, stepId, Date.now()).map((peer) => ({
          name: peer.name,
          initials: peerInitials(peer.name),
        })),
    };
  }

  function setBrowsing(next: boolean): void {
    if (browsing === next) return;
    browsing = next;
    callbacks.onBrowsingChange(next);
    render();
  }

  function setPanelsHidden(next: boolean): void {
    if (panelsHidden === next) return;
    panelsHidden = next;
    callbacks.onToggleAllPanels(next);
    render();
  }

  function activeTooltipId(): string | null {
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    return step ? (tooltipOfStep(step)?.id ?? null) : null;
  }

  /**
   * Solves and applies the frame, keeping the inspector's box for the surfaces
   * that have to avoid it. Without it the placement dots — which are anchored to
   * the target, on the host — get drawn straight across an open inspector when the
   * target happens to sit behind it (§3.4 rule 1).
   */
  /**
   * The card box the solver should use: the drafted size while one is in flight.
   *
   * A card resting against a viewport edge is held there by the runtime's own
   * clamp, so it has to stay held as the size changes. Keeping the stale `left`
   * instead made a shrink drag show the card in a place it would not end up —
   * 56px out on the fixture — and the difference appeared the instant the pointer
   * came up. A card that is not against an edge is target-anchored, and there the
   * stale corner is the right one to keep.
   */
  function draftedCardRect(): ProtectedSurfaceRect | null {
    if (!cardRect || !resizeDraft) return cardRect;
    const width = Math.round(resizeDraft.width);
    const height = Math.round(resizeDraft.height);
    const pad = OVERLAY_CHROME_PAD_PX;
    const stage = {
      width: host.ownerDocument.documentElement.clientWidth,
      height: host.ownerDocument.documentElement.clientHeight,
    };
    /**
     * Was the clamp holding this corner, and where does it move the new size to?
     *
     * `>=`, not equality: the runtime reports a rect a few pixels past the limit
     * and the solver pulls it back, so a card visibly against the edge is not
     * sitting exactly on it. Testing for exactly-on missed every real case.
     */
    const held = (start: number, was: number, now: number): number | null =>
      start >= Math.max(pad, was) - 1 ? Math.max(pad, now) : null;
    const left =
      held(cardRect.left, stage.width - cardRect.width - pad, stage.width - width - pad) ??
      cardRect.left;
    const top =
      held(cardRect.top, stage.height - cardRect.height - pad, stage.height - height - pad) ??
      cardRect.top;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }

  /** Longest a commit may take before the draft is dropped anyway. */
  const RESIZE_SETTLE_TIMEOUT_MS = 1_500;

  /** Keep showing the dragged size until a rect for it arrives (see `resizeSettleTimer`). */
  function holdResizeDraft(): void {
    if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
    resizeSettleTimer = setTimeout(() => {
      resizeSettleTimer = null;
      resizeDraft = null;
      solveFrame();
    }, RESIZE_SETTLE_TIMEOUT_MS);
  }

  /** A rect the size we asked for: the commit landed, so the draft is spent. */
  function releaseResizeDraft(rect: ProtectedSurfaceRect | null): void {
    if (!resizeSettleTimer || !resizeDraft || !rect) return;
    if (Math.abs(rect.width - resizeDraft.width) > 1) return;
    if (Math.abs(rect.height - resizeDraft.height) > 1) return;
    clearTimeout(resizeSettleTimer);
    resizeSettleTimer = null;
    resizeDraft = null;
  }

  /** The dragged height: the live draft, else the one saved on the step. */
  function authoredCardHeight(): number | null {
    if (resizeDraft) return Math.round(resizeDraft.height);
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    return (step ? tooltipOfStep(step)?.props.tooltipLayout?.heightPx : null) ?? null;
  }

  function solveFrame(): void {
    const layout = applyOverlayGeometry(
      iframe,
      frame,
      draftedCardRect(),
      true,
      overlayToolbarSide(),
      targetRect,
      authoredCardHeight(),
    );
    if (!layout?.inspector) {
      inspectorRect = null;
      return;
    }
    const left = layout.frame.left + layout.inspector.left;
    const top = layout.frame.top + layout.inspector.top;
    inspectorRect = {
      left,
      top,
      width: layout.inspector.width,
      height: layout.inspector.height,
      right: left + layout.inspector.width,
      bottom: top + layout.inspector.height,
    };
  }

  function overlayToolbarSide(): 'above' | 'below' | 'docked' {
    return chooseOverlayToolbarSide(cardRect, targetRect);
  }

  function activePlacement(): OverlayPlacement | null {
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    const placement = step ? tooltipOfStep(step)?.props.placement : null;
    return placement === 'top' ||
      placement === 'right' ||
      placement === 'bottom' ||
      placement === 'left'
      ? placement
      : null;
  }

  function placeCompass(): void {
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    const props = step ? tooltipOfStep(step)?.props : null;
    syncCompass(
      compass,
      targetRect,
      true,
      {
        onPlace: ({ placement, align }) => {
          const tooltipId = activeTooltipId();
          if (tooltipId) callbacks.onPlacementCommit(tooltipId, placement, align);
        },
        onOffsetPreview: (offsetPx) => {
          const tooltipId = activeTooltipId();
          if (tooltipId) callbacks.onAnchorOffsetPreview?.(tooltipId, offsetPx);
        },
        onOffsetCommit: (offsetPx) => {
          const tooltipId = activeTooltipId();
          if (tooltipId) callbacks.onAnchorOffsetCommit?.(tooltipId, offsetPx);
        },
        onRetarget: callbacks.onRetarget,
      },
      {
        placement: activePlacement(),
        align: props?.anchorAlign ?? 'center',
        offsetPx: props?.anchorOffsetPx ?? 12,
      },
      /**
       * The card and the inspector, not the whole frame. The frame carries the
       * toolbar band and its padding, so it brushes the target in the ordinary
       * adjacent case and measuring against it would withhold the dots nearly
       * always. These two are the surfaces that actually cover things.
       */
      cardRect,
      inspectorRect,
    );
  }

  /**
   * The ring's hittable band (§4.4). It tracks the ring the runtime drew, which
   * sits at the step's own outline offset rather than on the target's edge —
   * measuring from the target would put the band inside a wide ring.
   */
  function placeRing(): void {
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    syncTargetRing(targetRing, {
      rect: targetRect,
      outlineOffsetPx: step?.props.emphasis?.targetOutline?.offsetPx ?? TARGET_OUTLINE_GAP_PX,
      selected: targetSelected,
      visible: presentation === 'overlay' && !panelsHidden && !browsing,
    });
  }


  /**
   * The frame measures its own content and reports it on the iframe; the host is
   * the only side that can act on it, because it owns the geometry. Nothing
   * watched those attributes, so a report sat unread until some unrelated event
   * — a runtime rect, a window resize — happened to trigger the next solve.
   * Collapsing a section left the popover at its old height with a band of empty
   * glass under it for a few hundred milliseconds, then it snapped.
   *
   * Only the keys the *frame* writes are observed. The host's own writes land on
   * different keys, so applying a solve here cannot retrigger this.
   */
  const reportedGeometry = new MutationObserver(() => {
    if (presentation !== 'overlay') return;
    solveFrame();
    placeChrome();
  });
  reportedGeometry.observe(iframe, {
    attributes: true,
    attributeFilter: [
      'data-overlay-content-height',
      'data-overlay-inspector',
      'data-overlay-inspector-content',
      'data-overlay-menu-open',
    ],
  });

  render();

  return {
    destroy: () => {
      reportedGeometry.disconnect();
      stopFrame();
      stopClickOutside();
      stopPulses();
      stopFilmstripLayer();
      stopPillLayer();
      layers.destroy();
      toasts.remove();
      filmstrip.remove();
      pulses.remove();
      compass.remove();
      frame.remove();
      pill.destroy();
      palette.destroy();
      captions.element.remove();
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer);
      dimmer.remove();
    },
    presentation: () => presentation,
    browsing: () => browsing,
    refreshPulses: () =>
      syncPulses(pulses, {
        activeStepId,
        card: reservedOverlayRect(),
        document: previewDocument,
        hideActive: presentation === 'overlay',
        onSelect: callbacks.onSelectStep,
        peerStepIds: heldStepIds(),
      }),
    setActiveStepId: (stepId) => {
      // A different step is a different target, so the ring is no longer what
      // the inspector is talking about.
      if (stepId !== activeStepId) targetSelected = false;
      activeStepId = stepId;
      render();
    },
    setTargetSelected: (selected) => {
      if (selected === targetSelected) return;
      targetSelected = selected;
      placeRing();
    },
    setCardRect: (rect) => {
      /**
       * A null rect arrives between the runtime tearing the preview popup down and
       * mounting its replacement — which every config change does. Falling back to
       * a default rect for those ~25ms moved the whole authoring surface across the
       * page and snapped it back: the flash the creator sees on every change. The
       * last known rect is still the truth until a real one replaces it.
       */
      if (rect === null && presentation === 'overlay' && cardRect) return;
      cardRect = rect;
      releaseResizeDraft(rect);
      if (presentation === 'overlay') solveFrame();
      placeChrome();
    },
    setDocument: (documentState, title) => {
      previewDocument = documentState;
      if (title && titleInput && titleInput !== host.ownerDocument.activeElement) {
        titleInput.value = title;
      }
      // The document is the authority on its own type, so every refresh path
      // corrects the pill rather than only the one that opened it.
      if (documentState) pill.setState({ experienceType: documentState.type });
      render();
    },
    setPillState: (patch: Partial<ModePillState>) => pill.setState(patch),
    setAssistAvailable: (available) => {
      assistAvailable = available;
    },
    openCommandPalette: () => palette.open(),
    notify: (message: string, options?: ToastOptions) => showToast(toasts, message, options),
    setPresentation: (next) => {
      presentation = next;
      // Leaving compose ends Browsing: preview, picking and Operations all own the page.
      if (next !== 'overlay') {
        browsing = false;
        // The held rect belongs to the composing session, not to the next one.
        cardRect = null;
      }
      render();
    },
    setPresence: (next) => {
      presence = next;
      renderFilmstripSteps(filmstrip, previewDocument, activeStepId, selectedStepIds, filmstripPresence());
      syncPill();
    },
    setSelectedStepIds: (stepIds) => {
      selectedStepIds = new Set(stepIds);
      renderFilmstripSteps(filmstrip, previewDocument, activeStepId, selectedStepIds, filmstripPresence());
    },
    setRuntimeStepId: (stepId) => {
      runtimeStepId = stepId;
      syncPill();
    },
    setTargetRect: (rect) => {
      targetRect = rect;
      if (presentation !== 'overlay') return;
      // The card is solved against the target, so a new target re-solves the frame.
      solveFrame();
      placeCompass();
    },
  };
}

function createOperationsDimmer(doc: Document): HTMLElement {
  const dimmer = doc.createElement('div');
  dimmer.className = 'overlay-operations-dimmer';
  dimmer.dataset['protectedChrome'] = 'true';
  dimmer.hidden = true;
  dimmer.setAttribute('aria-hidden', 'true');
  return dimmer;
}


