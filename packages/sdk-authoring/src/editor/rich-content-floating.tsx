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
    const collisionBoundary = reference.closest<HTMLElement>('.panel-storyboard-workspace');
    const overflowOptions = collisionBoundary
      ? { boundary: collisionBoundary, padding: FLOATING_BOUNDARY_PADDING_PX }
      : { padding: FLOATING_BOUNDARY_PADDING_PX };
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
