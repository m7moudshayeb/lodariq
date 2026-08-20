import {
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
} from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import {
  attachEdgeResize,
  mountEdgeResizeHandles,
  snapPlacement,
  type EdgeResizeAxes,
  type OverlayPlacement,
} from '../canvas/edge-resize';
import {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_MIN_HEIGHT_PX,
  OVERLAY_TOOLBAR_BAND_PX,
} from './constants';
import {
  overlayFrameGeometry,
  solveOverlayFrame,
  type OverlayFrameLayout,
} from './frame-layout';
import { escapeHtml } from './html';
import { OPERATIONS_SHEET_TOKENS } from '../../creator-chrome-tokens';
import { OVERLAY_GLYPHS } from './icons';
import { AUTHORING_PANEL_LABELS } from '../panel-config';

/**
 * Measurements now live in `./constants`, derived from `creator-chrome-tokens`.
 * Re-exported here so existing importers keep working while there is exactly one
 * definition of each value.
 */
export {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_HANDLE_GUTTER_PX,
  OVERLAY_INSPECTOR_BAND_PX,
  OVERLAY_TOOLBAR_BAND_PX,
  OVERLAY_TOOLBAR_GAP_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
  OVERLAY_TOOLBAR_MIN_WIDTH_PX,
} from './constants';

/**
 * Toolbar anchor: above → below → docked (§4.2a rule 2).
 *
 * `docked` is the prototype's third state and it is not decoration — on a short
 * viewport with a tall card neither side fits, and without it the toolbar renders
 * below and is clipped off-screen, which is the vanishing-controls failure rule 4
 * exists to prevent.
 */
/**
 * Extra room the frame takes while a floating menu is open. Sized for the tallest
 * shipped menu (the icon picker) rather than a round number.
 */
const MENU_ALLOWANCE_PX = 480;

/** Gap plus button width: what the tool column needs beside the card. */
const CARD_TOOLS_SPAN_PX = 29;

export function chooseOverlayToolbarSide(
  card: { left: number; top: number; width: number; height: number } | null,
  target: { left: number; top: number; width: number; height: number } | null,
  viewportHeight = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerHeight,
): 'above' | 'below' | 'docked' {
  if (!card) return 'above';
  const fitsAbove = card.top - OVERLAY_TOOLBAR_BAND_PX >= OVERLAY_CHROME_PAD_PX;
  const fitsBelow =
    card.top + card.height + OVERLAY_TOOLBAR_BAND_PX <= viewportHeight - OVERLAY_CHROME_PAD_PX;
  if (!fitsAbove && !fitsBelow) return 'docked';
  if (card.top < OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX + 8) return 'below';
  if (!target) return 'above';
  const aboveTop = card.top - OVERLAY_TOOLBAR_BAND_PX - OVERLAY_CHROME_PAD_PX;
  const overlapsX =
    card.left < target.left + target.width + 8 && card.left + card.width > target.left - 8;
  // Sitting above would land on the target itself, so take the other side.
  if (overlapsX && aboveTop < target.top + target.height + 12) {
    return fitsBelow ? 'below' : 'docked';
  }
  return 'above';
}

export function createOverlayFrame(doc: Document): HTMLElement {
  const frame = doc.createElement('div');
  frame.className = 'overlay-iframe-frame';
  frame.dataset['overlayFrame'] = 'true';
  frame.hidden = true;
  const ring = doc.createElement('div');
  ring.className = 'overlay-drag-ring';
  ring.dataset['overlayDrag'] = 'true';
  frame.appendChild(ring);
  frame.appendChild(createCardTools(doc));
  mountEdgeResizeHandles(frame);
  return frame;
}

/**
 * Move and Hide, on the card's own corner (§3.4 rule 4).
 *
 * The manual fallback for when automatic avoidance has no good answer: the card
 * is over the thing the creator wants to see, and neither moving the target nor
 * re-solving will help. Rule 4 exists because rules 1–3 cannot always win.
 */
function createCardTools(doc: Document): HTMLElement {
  const tools = doc.createElement('div');
  tools.className = 'overlay-card-tools';
  tools.dataset['protectedChrome'] = 'true';
  tools.innerHTML = `
    <button type="button" class="overlay-card-tool" data-overlay-drag="true" data-card-tool="move"
      aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.moveCard)}" title="${escapeHtml(AUTHORING_PANEL_LABELS.moveCard)}">${OVERLAY_GLYPHS.move}</button>
    <button type="button" class="overlay-card-tool" data-card-tool="hide"
      aria-label="${escapeHtml(AUTHORING_PANEL_LABELS.hidePanels)}" title="${escapeHtml(AUTHORING_PANEL_LABELS.hidePanels)}">${OVERLAY_GLYPHS.eyeSmall}</button>
  `;
  return tools;
}

/**
 * The way back from hidden chrome (§3.3).
 *
 * Hiding the panels hides the card tools that did the hiding, so without this
 * the only route back is a row inside the mode pill's menu — which a creator who
 * has just made every panel disappear has no reason to look in. The chip is the
 * one thing that stays, bottom-right, and says whose chrome is missing.
 */
export function createShowChip(doc: Document): HTMLButtonElement {
  const chip = doc.createElement('button');
  chip.type = 'button';
  chip.className = 'overlay-show-chip';
  chip.dataset['overlayShowChip'] = 'true';
  chip.dataset['protectedChrome'] = 'true';
  const label = AUTHORING_PANEL_LABELS.showChrome;
  chip.setAttribute('aria-label', label);
  // The full-size eye, as in the prototype: this is a standalone chip, not one of
  // the card tools that `eyeSmall` is sized for.
  chip.innerHTML = `${OVERLAY_GLYPHS.eye}<span>${escapeHtml(label)}</span>`;
  return chip;
}

function fallbackOverlayCard(): ProtectedSurfaceRect {
  const width = Math.min(TOOLTIP_WIDTH_PX_LIMITS.max, Math.max(TOOLTIP_WIDTH_PX_LIMITS.min, 360));
  const height = Math.min(TOOLTIP_HEIGHT_PX_LIMITS.max, Math.max(TOOLTIP_HEIGHT_PX_LIMITS.min, 240));
  const left = Math.max(16, (window.innerWidth - width) / 2);
  const top = 96;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function applyOverlayGeometry(
  iframe: HTMLIFrameElement,
  frame: HTMLElement,
  card: ProtectedSurfaceRect | null,
  visible: boolean,
  toolbar: 'above' | 'below' | 'docked' = 'above',
  /** The step's target. The card is moved off it when the two collide (§3.4). */
  target: ProtectedSurfaceRect | null = null,
  /** The dragged height, when the step has one. Null means "as tall as it reads". */
  authoredHeight: number | null = null,
): OverlayFrameLayout | null {
  if (!visible) {
    hideIframe(iframe, frame);
    return null;
  }
  const rect = card ?? fallbackOverlayCard();
  const pad = OVERLAY_CHROME_PAD_PX;
  const stage = { width: window.innerWidth, height: window.innerHeight };
  const maxCardHeight = Math.min(
    TOOLTIP_HEIGHT_PX_LIMITS.max,
    Math.max(
      TOOLTIP_HEIGHT_PX_LIMITS.min,
      stage.height - OVERLAY_TOOLBAR_BAND_PX - pad * 2 - 72,
    ),
  );
  const layout = solveOverlayFrame(rect, stage, {
    cardHeight: Math.min(maxCardHeight, reported(iframe, 'overlayContentHeight')),
    cardMaxHeight: maxCardHeight,
    inspectorHeight:
      iframe.dataset['overlayInspector'] === '1'
        ? Math.max(OVERLAY_INSPECTOR_MIN_HEIGHT_PX, reported(iframe, 'overlayInspectorContent'))
        : null,
    toolbarPlacement: toolbar,
    target,
    /* Clamped here rather than in the solver: the viewport ceiling is this
     * module's to know, and an authored height above it must still fit. */
    authoredHeight: authoredHeight == null ? null : Math.min(authoredHeight, maxCardHeight),
    /**
     * While a menu is open the frame needs room for it, because the iframe is what
     * clips. The allowance is transient and bounded by the viewport, so Floating UI
     * still has a true boundary to work against rather than an artificially small one.
     */
    ...(iframe.dataset['overlayMenuOpen'] === '1' ? { menuAllowance: MENU_ALLOWANCE_PX } : {}),
  });

  iframe.style.position = 'fixed';
  iframe.style.left = `${layout.frame.left}px`;
  iframe.style.top = `${layout.frame.top}px`;
  iframe.style.width = `${layout.frame.width}px`;
  iframe.style.height = `${layout.frame.height}px`;
  revealIframe(iframe);
  iframe.style.border = '0';
  iframe.style.borderRadius = '0';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'normal';
  iframe.style.boxShadow = '';
  iframe.style.overflow = '';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.zIndex = '2';
  /** Frame-local boxes, read back as CSS custom properties inside the frame. */
  writeSurfaceDataset(iframe, layout);
  // The drag ring tracks the clamped card, so the two can never separate.
  frame.hidden = false;
  frame.style.left = `${layout.cardViewport.left}px`;
  frame.style.top = `${layout.cardViewport.top}px`;
  frame.style.width = `${layout.cardViewport.width}px`;
  frame.style.height = `${layout.cardViewport.height}px`;
  /*
   * The card's tools flip to its other side when the right one runs out of
   * viewport — a card solved hard against the edge would otherwise take its own
   * escape hatch off-screen with it, which is the §3.4 rule 4 failure exactly.
   */
  const toolsRight = layout.cardViewport.left + layout.cardViewport.width + CARD_TOOLS_SPAN_PX;
  const fitsRight = toolsRight <= window.innerWidth - OVERLAY_CHROME_PAD_PX;
  /*
   * The tools also have to keep off the inspector, which the frame draws on one
   * side of the card. They render on the host page, above the iframe, so an
   * overlap is not a cosmetic one: the tools sat on the inspector's close button
   * and swallowed the click, leaving the inspector with no visible way out.
   *
   * Preferring the free side keeps rule 4's escape hatch available. When the
   * only side that fits is the inspector's, the tools stand down — the inspector
   * is dismissible on its own terms, and a control that cannot be clicked is
   * worse than one that is honestly absent.
   */
  const inspectorSide = layout.inspectorAnchor;
  const side = fitsRight ? 'right' : 'left';
  frame.dataset['cardTools'] = side;
  frame.dataset['cardToolsHidden'] = inspectorSide === side ? 'true' : 'false';
  return layout;
}

function reported(iframe: HTMLIFrameElement, key: string): number {
  const value = Number.parseInt(iframe.dataset[key] ?? '', 10);
  return Number.isFinite(value) ? value : 0;
}

function writeSurfaceDataset(iframe: HTMLIFrameElement, layout: OverlayFrameLayout): void {
  iframe.dataset['overlayToolbar'] = layout.toolbarPlacement;
  iframe.dataset['overlayGutter'] = '0';
  if (layout.inspectorAnchor) iframe.dataset['overlayInspectorSide'] = layout.inspectorAnchor;
  for (const [key, value] of Object.entries(overlayFrameGeometry(layout))) {
    if (value === null) delete iframe.dataset[key];
    else iframe.dataset[key] = String(value);
  }
}

/**
 * The size, while the drag is happening. A creator dragging a corner is choosing
 * a number, and the only way to choose one is to see it.
 */
function showSizeTip(frame: HTMLElement, size: { width: number; height: number }): void {
  let tip = frame.querySelector<HTMLElement>('[data-overlay-size-tip]');
  if (!tip) {
    tip = frame.ownerDocument.createElement('span');
    tip.className = 'overlay-size-tip';
    tip.dataset['overlaySizeTip'] = 'true';
    tip.setAttribute('aria-hidden', 'true');
    frame.appendChild(tip);
  }
  tip.textContent = `${Math.round(size.width)} × ${Math.round(size.height)}`;
}

function hideSizeTip(frame: HTMLElement): void {
  frame.querySelector('[data-overlay-size-tip]')?.remove();
}

/**
 * §4.6 — Operations covers the page, because in Tier 3 the page is not the
 * subject. A centred card cost the flow map and the wide tables a third of their
 * width while leaving the product half-visible behind them, which reads as
 * "this is still about your page" at the one moment it is not.
 */
export function applyOperationsGeometry(iframe: HTMLIFrameElement, frame: HTMLElement): void {
  frame.hidden = true;
  /* Only on the way in: `render()` runs on every state change, and re-arming the
     animation each time would flicker the sheet while a creator works in it. The
     width is the flag — every other presentation overwrites it on the way out.
     Scripted rather than a keyframe: the iframe is slotted, so it belongs to the
     host page's tree and never sees a name declared in the shadow root. */
  const arriving = iframe.style.width !== '100%';
  iframe.style.position = 'fixed';
  iframe.style.left = '0px';
  iframe.style.top = '0px';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  revealIframe(iframe);
  /* Matches the sheet's own ground, so the frame does not flash a lighter plate
     before the document paints. */
  iframe.style.background = OPERATIONS_SHEET_TOKENS.body;
  iframe.style.colorScheme = 'dark';
  iframe.style.border = '0';
  iframe.style.borderRadius = '0';
  iframe.style.boxShadow = 'none';
  iframe.style.overflow = 'hidden';
  iframe.removeAttribute('allowtransparency');
  iframe.style.zIndex = '3';
  if (arriving) {
    iframe.animate?.(
      [
        { opacity: 0, transform: 'scale(0.995)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'ease' },
    );
  }
}

/**
 * Clears what `hideIframe` set rather than asserting the opposite.
 *
 * Writing `opacity: 1` and `pointer-events: auto` inline outranks every stylesheet
 * rule, so Browsing and Picking could not ghost the card: §3.3 says both hand the
 * page back to the customer's product, and the frame stayed lit and clickable
 * through both. Opacity and pointer-events belong to the mode, which is CSS's to
 * decide; only visibility is this function's.
 */
function revealIframe(iframe: HTMLIFrameElement): void {
  iframe.style.removeProperty('pointer-events');
  iframe.style.removeProperty('opacity');
  iframe.style.visibility = 'visible';
  iframe.removeAttribute('aria-hidden');
}

export function hideIframe(iframe: HTMLIFrameElement, frame: HTMLElement): void {
  frame.hidden = true;
  iframe.style.pointerEvents = 'none';
  iframe.style.opacity = '0';
  iframe.style.visibility = 'hidden';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.background = '';
  iframe.style.colorScheme = '';
  iframe.style.borderRadius = '';
  iframe.style.boxShadow = '';
  iframe.style.overflow = '';
  iframe.removeAttribute('allowtransparency');
  iframe.setAttribute('aria-hidden', 'true');
}

export function attachOverlayFrameInteractions(
  frame: HTMLElement,
  options: {
    getCardSize: () => { width: number; height: number };
    getTargetRect: () => { left: number; top: number; width: number; height: number } | null;
    onDragSnap: (placement: OverlayPlacement) => void;
    /**
     * The size while the pointer is still down. Not a commit — no document
     * write, no undo entry, no toast — just the card keeping up with the ring.
     */
    onResizeDraft?: (size: { width: number; height: number }) => void;
    onResize: (size: { width: number; height: number }, axes: EdgeResizeAxes) => void;
  },
): () => void {
  const stopResize = attachEdgeResize(frame, {
    getSize: options.getCardSize,
    heightLimits: TOOLTIP_HEIGHT_PX_LIMITS,
    /**
     * The ring follows the pointer, so the drag shows its result as it happens —
     * and the card follows the ring. Only the ring moved before, so a creator
     * dragging an edge watched an empty outline stretch away from a card that
     * stayed put until they let go, then jumped to meet it.
     */
    onDraft: (size) => {
      frame.style.width = `${size.width}px`;
      frame.style.height = `${size.height}px`;
      options.onResizeDraft?.(size);
      showSizeTip(frame, size);
    },
    onCommit: (size, axes) => {
      hideSizeTip(frame);
      options.onResize(size, axes);
    },
    widthLimits: TOOLTIP_WIDTH_PX_LIMITS,
  });
  /** The ring above the card and the Move tool on its corner do the same thing. */
  const dragSurfaces = [...frame.querySelectorAll<HTMLElement>('[data-overlay-drag]')];
  let drag: { startX: number; startY: number; left: number; top: number } | null = null;
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('[data-edge-resize]')) return;
    event.preventDefault();
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      left: frame.getBoundingClientRect().left,
      top: frame.getBoundingClientRect().top,
    };
    (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;
    frame.style.left = `${drag.left + event.clientX - drag.startX}px`;
    frame.style.top = `${drag.top + event.clientY - drag.startY}px`;
  };
  const onPointerUp = (): void => {
    if (!drag) return;
    const target = options.getTargetRect();
    const card = frame.getBoundingClientRect();
    drag = null;
    if (!target) return;
    options.onDragSnap(
      snapPlacement(
        { left: card.left, top: card.top, width: card.width, height: card.height },
        target,
      ),
    );
  };
  for (const surface of dragSurfaces) {
    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerup', onPointerUp);
    surface.addEventListener('pointercancel', onPointerUp);
  }
  return () => {
    stopResize();
    for (const surface of dragSurfaces) {
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerup', onPointerUp);
      surface.removeEventListener('pointercancel', onPointerUp);
    }
  };
}
