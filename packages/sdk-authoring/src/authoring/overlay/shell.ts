import type { LodariqDocument } from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import { AUTHORING_PANEL_LABELS } from '../panel-config';
import {
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_SHELL_ATTRIBUTE,
} from '../panel-attributes';
import { attachOverlayClickOutside } from './click-outside';
import type { OverlayPlacement } from '../canvas/edge-resize';
import { createCompass, syncCompass } from './compass';
import { createFilmstrip, renderFilmstripSteps, tooltipOfStep, tourStepsOf } from './filmstrip';
import {
  applyOperationsGeometry,
  applyOverlayGeometry,
  attachOverlayFrameInteractions,
  chooseOverlayToolbarSide,
  createOverlayFrame,
  hideIframe,
  OVERLAY_TOOLBAR_BAND_PX,
} from './geometry';
import { createPulseLayer, resolvedStepTargetRect, syncPulses } from './pulses';
import type { OverlayShell, OverlayShellCallbacks, OverlayShellPresentation } from './types';

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
  const frame = createOverlayFrame(host.ownerDocument);
  const picking = createPickingChip(host.ownerDocument);
  const previewExit = createPreviewExit(host.ownerDocument);
  const dimmer = createOperationsDimmer(host.ownerDocument);
  root.append(dimmer, filmstrip, pulses, compass, frame, picking, previewExit);

  let presentation: OverlayShellPresentation = 'collapsed';
  let previewDocument: LodariqDocument | null = null;
  let activeStepId: string | null = null;
  let cardRect: ProtectedSurfaceRect | null = null;
  let targetRect: ProtectedSurfaceRect | null = null;

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
  filmstrip.querySelector('[data-filmstrip-operations]')?.addEventListener('click', () => {
    callbacks.onOpenOperations();
  });
  dimmer.addEventListener('click', () => {
    callbacks.onCloseOperations();
  });
  filmstrip.querySelector('[data-filmstrip-close]')?.addEventListener('click', () => {
    callbacks.onClose();
  });
  filmstrip.addEventListener('click', (event) => {
    const stepButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '[data-step-id]',
    );
    if (!stepButton?.dataset['stepId']) return;
    callbacks.onSelectStep(stepButton.dataset['stepId']);
  });
  filmstrip.addEventListener('keydown', (event) => {
    const stepButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '[data-step-id]',
    );
    const stepId = stepButton?.dataset['stepId'];
    if (!stepId) return;
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
  previewExit.querySelector('button')?.addEventListener('click', () => callbacks.onExitPreview());

  const stopFrame = attachOverlayFrameInteractions(frame, {
    getCardSize: () => ({
      width: cardRect?.width ?? 320,
      height: cardRect?.height ?? 200,
    }),
    getTargetRect: () => targetRect,
    onDragSnap: (placement) => {
      const tooltipId = activeTooltipId();
      if (tooltipId) callbacks.onPlacementCommit(tooltipId, placement);
    },
    onResize: (size) => callbacks.onPopupSizeCommit(size.width, size.height),
  });
  const stopClickOutside = attachOverlayClickOutside({
    host,
    iframe,
    isActive: () => presentation === 'overlay',
    onCollapse: callbacks.onCollapse,
  });
  const stopPulses = startPulseLoop(() => {
    syncPulses(pulses, {
      activeStepId,
      document: previewDocument,
      hideActive: presentation === 'overlay',
      onSelect: callbacks.onSelectStep,
    });
    targetRect = resolvedStepTargetRect(previewDocument, activeStepId);
    if (presentation === 'overlay') placeCompass();
    avoidFilmstripCollision(filmstrip, iframe, cardRect, presentation, overlayToolbarSide());
  });
  const stopPickingDrag = attachChipDrag(picking);

  const render = (): void => {
    host.setAttribute(AUTHORING_SHELL_ATTRIBUTE, presentation);
    const chromeHidden =
      presentation === 'picking' ||
      presentation === 'previewing' ||
      presentation === 'operations' ||
      host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE);
    filmstrip.hidden = chromeHidden;
    pulses.hidden = chromeHidden;
    dimmer.hidden = presentation !== 'operations';
    previewExit.hidden = presentation !== 'previewing';
    picking.hidden = presentation !== 'picking';
    if (presentation === 'overlay') {
      applyOverlayGeometry(iframe, frame, cardRect, true, overlayToolbarSide());
      placeCompass();
    } else if (presentation === 'operations') {
      applyOperationsGeometry(iframe, frame);
      compass.hidden = true;
    } else {
      hideIframe(iframe, frame);
      compass.hidden = true;
    }
    renderFilmstripSteps(filmstrip, previewDocument, activeStepId);
  };

  function activeTooltipId(): string | null {
    const step = tourStepsOf(previewDocument).find((item) => item.id === activeStepId);
    return step ? (tooltipOfStep(step)?.id ?? null) : null;
  }

  function overlayToolbarSide(): 'above' | 'below' {
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
    syncCompass(
      compass,
      targetRect,
      true,
      (placement) => {
        const tooltipId = activeTooltipId();
        if (tooltipId) callbacks.onPlacementCommit(tooltipId, placement);
      },
      callbacks.onRetarget,
      activePlacement(),
    );
  }

  render();

  return {
    destroy: () => {
      stopFrame();
      stopClickOutside();
      stopPulses();
      stopPickingDrag();
      filmstrip.remove();
      pulses.remove();
      compass.remove();
      frame.remove();
      picking.remove();
      previewExit.remove();
      dimmer.remove();
    },
    presentation: () => presentation,
    refreshPulses: () =>
      syncPulses(pulses, {
        activeStepId,
        document: previewDocument,
        hideActive: presentation === 'overlay',
        onSelect: callbacks.onSelectStep,
      }),
    setActiveStepId: (stepId) => {
      activeStepId = stepId;
      render();
    },
    setCardRect: (rect) => {
      cardRect = rect;
      if (presentation === 'overlay') {
        applyOverlayGeometry(iframe, frame, cardRect, true, overlayToolbarSide());
      }
      avoidFilmstripCollision(filmstrip, iframe, cardRect, presentation, overlayToolbarSide());
    },
    setDocument: (documentState, title) => {
      previewDocument = documentState;
      if (title && titleInput && titleInput !== host.ownerDocument.activeElement) {
        titleInput.value = title;
      }
      render();
    },
    setPresentation: (next) => {
      presentation = next;
      render();
    },
    setTargetRect: (rect) => {
      targetRect = rect;
      if (presentation === 'overlay') placeCompass();
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

function createPickingChip(doc: Document): HTMLElement {
  const chip = doc.createElement('div');
  chip.className = 'overlay-picking-chip';
  chip.dataset['protectedChrome'] = 'true';
  chip.dataset['lodariqAuthoringControl'] = 'true';
  chip.hidden = true;
  chip.innerHTML = `<span class="target-picking-label">${AUTHORING_PANEL_LABELS.selectTarget}</span>`;
  return chip;
}

function createPreviewExit(doc: Document): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'overlay-preview-exit';
  wrap.dataset['protectedChrome'] = 'true';
  wrap.dataset['lodariqExitPreview'] = 'true';
  wrap.hidden = true;
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = AUTHORING_PANEL_LABELS.exitPreview;
  wrap.appendChild(button);
  return wrap;
}

function attachChipDrag(chip: HTMLElement): () => void {
  let drag: { startX: number; startY: number; left: number; top: number } | null = null;
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const rect = chip.getBoundingClientRect();
    drag = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    chip.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (!drag) return;
    chip.style.left = `${drag.left + event.clientX - drag.startX}px`;
    chip.style.top = `${drag.top + event.clientY - drag.startY}px`;
    chip.style.right = 'auto';
    chip.style.bottom = 'auto';
  };
  const onUp = (): void => {
    drag = null;
  };
  chip.addEventListener('pointerdown', onDown);
  chip.addEventListener('pointermove', onMove);
  chip.addEventListener('pointerup', onUp);
  chip.addEventListener('pointercancel', onUp);
  return () => {
    chip.removeEventListener('pointerdown', onDown);
    chip.removeEventListener('pointermove', onMove);
    chip.removeEventListener('pointerup', onUp);
    chip.removeEventListener('pointercancel', onUp);
  };
}

function startPulseLoop(tick: () => void): () => void {
  tick();
  const ownerWindow = window;
  const onScroll = (): void => tick();
  ownerWindow.addEventListener('scroll', onScroll, true);
  ownerWindow.addEventListener('resize', onScroll);
  const timer = ownerWindow.setInterval(tick, 400);
  return () => {
    ownerWindow.removeEventListener('scroll', onScroll, true);
    ownerWindow.removeEventListener('resize', onScroll);
    ownerWindow.clearInterval(timer);
  };
}

function avoidFilmstripCollision(
  filmstrip: HTMLElement,
  iframe: HTMLIFrameElement,
  card: ProtectedSurfaceRect | null,
  presentation: OverlayShellPresentation,
  toolbar: 'above' | 'below',
): void {
  if (presentation !== 'overlay' || !card || filmstrip.hidden) {
    filmstrip.dataset['dock'] = 'bottom';
    return;
  }
  const strip = filmstrip.getBoundingClientRect();
  const overlay = iframe.getBoundingClientRect();
  const bottom = Math.max(
    overlay.bottom,
    card.bottom + (toolbar === 'below' ? OVERLAY_TOOLBAR_BAND_PX : 0),
  );
  const overlaps =
    strip.left < Math.max(card.right, overlay.right) &&
    strip.right > Math.min(card.left, overlay.left) &&
    strip.top < bottom &&
    strip.bottom > Math.min(card.top, overlay.top);
  filmstrip.dataset['dock'] = overlaps ? 'top' : 'bottom';
}
