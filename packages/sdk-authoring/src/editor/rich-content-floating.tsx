import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  type Placement,
  type Strategy,
} from '@floating-ui/dom';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { inheritRichContentFloatingTheme } from './rich-content-floating-theme';

const FLOATING_GAP_PX = 7;
const FLOATING_BOUNDARY_PADDING_PX = 8;
const CSS_ZOOM_ALREADY_APPLIED_TOLERANCE = 0.08;

/**
 * Canvas popup frames use CSS `zoom`. Layers portaled to `document.body` with
 * `position: fixed` must use viewport coordinates. Chromium's
 * `getBoundingClientRect` already returns post-zoom viewport rects; engines
 * that still report unzoomed layout boxes need the accumulated zoom applied.
 */
export function readViewportRect(element: Element): DOMRect {
  return scaleRectForCssZoom(element.getBoundingClientRect(), cssZoomCompensation(element));
}

function cssZoomCompensation(element: Element): number {
  const zoom = accumulatedCssZoom(element);
  if (zoom === 1 || !(element instanceof HTMLElement) || element.offsetWidth === 0) return 1;
  const visualWidth = element.getBoundingClientRect().width;
  if (Math.abs(visualWidth / element.offsetWidth - zoom) < CSS_ZOOM_ALREADY_APPLIED_TOLERANCE) {
    return 1;
  }
  return zoom;
}

function accumulatedCssZoom(element: Element): number {
  let zoom = 1;
  let current: Element | null = element;
  while (current) {
    const value = Number.parseFloat(getComputedStyle(current).zoom || '1');
    if (Number.isFinite(value) && value > 0) zoom *= value;
    current = current.parentElement;
  }
  return zoom;
}

function scaleRectForCssZoom(rect: DOMRect, scale: number): DOMRect {
  if (scale === 1) return rect;
  return new DOMRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
}

interface FloatingPosition {
  strategy: Strategy;
  x: number;
  y: number;
}

export function RichContentFloatingMenu({
  children,
  className = '',
  content,
  open,
  placement = 'bottom-start',
}: {
  children: ReactElement;
  className?: string;
  content: ReactNode;
  open: boolean;
  placement?: Placement;
}) {
  const referenceRef = useRef<HTMLDivElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!open || !reference || !floating) return;
    inheritRichContentFloatingTheme(reference, floating);
    setPosition(null);
    const collisionBoundary = reference.closest<HTMLElement>(
      '.panel-storyboard-workspace, .overlay-step-shell',
    );
    const overflowOptions = collisionBoundary
      ? { boundary: collisionBoundary, padding: FLOATING_BOUNDARY_PADDING_PX }
      : { padding: FLOATING_BOUNDARY_PADDING_PX };
    /**
     * `bestFit` deliberately, even though it can put a menu over the authored card.
     *
     * Pinning menus to the side away from the card was tried and is wrong here:
     * the toolbar sits flush against the frame edge, so "away from the card" is a
     * 12px gap and the menu collapsed to a sliver. A transient popover that
     * dismisses on outside click may cover the card; §3.4 rule 1 is about the
     * persistent surfaces. What it may never do is get cut off, which is what the
     * frame growth and `size` below are for.
     */
    const update = (): void => {
      void computePosition(reference, floating, {
        middleware: [
          offset(FLOATING_GAP_PX),
          flip({ ...overflowOptions, fallbackStrategy: 'bestFit' }),
          shift(overflowOptions),
          size({
            ...overflowOptions,
            apply({ availableHeight, availableWidth, elements }) {
              elements.floating.style.setProperty(
                '--rich-content-floating-available-height',
                `${Math.max(0, Math.floor(availableHeight))}px`,
              );
              elements.floating.style.setProperty(
                '--rich-content-floating-available-width',
                `${Math.max(0, Math.floor(availableWidth))}px`,
              );
            },
          }),
        ],
        placement,
        strategy: 'fixed',
      }).then(({ strategy, x, y }) => setPosition({ strategy, x, y }));
    };
    const stopUpdating = autoUpdate(reference, floating, update, {
      ancestorResize: true,
      ancestorScroll: true,
      elementResize: true,
      layoutShift: true,
    });
    return stopUpdating;
  }, [open, placement]);

  const ownerDocument = referenceRef.current?.ownerDocument;
  const floatingStyle: CSSProperties = {
    left: 0,
    position: position?.strategy ?? 'fixed',
    top: 0,
    transform: position
      ? `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`
      : undefined,
    visibility: position ? 'visible' : 'hidden',
  };

  return (
    <div ref={referenceRef} className={`rich-content-toolbar-popover ${className}`.trim()}>
      {children}
      {open && ownerDocument
        ? createPortal(
            <div
              ref={floatingRef}
              className="rich-content-floating-layer"
              data-rich-content-floating-menu="true"
              style={floatingStyle}
            >
              {content}
            </div>,
            ownerDocument.body,
          )
        : null}
    </div>
  );
}

/**
 * Floating layer anchored to a virtual rect (e.g. the live text selection)
 * instead of a trigger element. `contextElement` scopes scroll/resize tracking,
 * theming, and the collision boundary.
 */
export function RichContentFloatingAnchor({
  anchorRect,
  children,
  className = '',
  contextElement,
  open,
  placement = 'top',
}: {
  anchorRect: () => DOMRect;
  children: ReactNode;
  className?: string;
  contextElement: HTMLElement | null;
  open: boolean;
  placement?: Placement;
}): ReactElement | null {
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const anchorRectRef = useRef(anchorRect);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  anchorRectRef.current = anchorRect;

  useLayoutEffect(() => {
    const floating = floatingRef.current;
    if (!open || !floating || !contextElement) return;
    inheritRichContentFloatingTheme(contextElement, floating);
    setPosition(null);
    const collisionBoundary = contextElement.closest<HTMLElement>(
      '.panel-storyboard-workspace, .overlay-step-shell',
    );
    const overflowOptions = collisionBoundary
      ? { boundary: collisionBoundary, padding: FLOATING_BOUNDARY_PADDING_PX }
      : { padding: FLOATING_BOUNDARY_PADDING_PX };
    const virtualReference = {
      contextElement,
      getBoundingClientRect: () => anchorRectRef.current(),
    };
    const update = (): void => {
      void computePosition(virtualReference, floating, {
        middleware: [
          offset(FLOATING_GAP_PX),
          flip({ ...overflowOptions, fallbackStrategy: 'bestFit' }),
          shift(overflowOptions),
        ],
        placement,
        strategy: 'fixed',
      }).then(({ strategy, x, y }) => setPosition({ strategy, x, y }));
    };
    const stopUpdating = autoUpdate(virtualReference, floating, update, {
      ancestorResize: true,
      ancestorScroll: true,
      elementResize: false,
      layoutShift: typeof IntersectionObserver !== 'undefined',
    });
    return stopUpdating;
  }, [contextElement, open, placement]);

  if (!open || !contextElement) return null;
  const floatingStyle: CSSProperties = {
    left: 0,
    position: position?.strategy ?? 'fixed',
    top: 0,
    transform: position
      ? `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`
      : undefined,
    visibility: position ? 'visible' : 'hidden',
  };
  return createPortal(
    <div
      ref={floatingRef}
      className={`rich-content-floating-layer ${className}`.trim()}
      data-rich-content-floating-menu="true"
      style={floatingStyle}
    >
      {children}
    </div>,
    contextElement.ownerDocument.body,
  );
}
