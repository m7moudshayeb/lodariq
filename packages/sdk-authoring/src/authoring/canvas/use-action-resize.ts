import { BUTTON_WIDTH_PX_LIMITS, type BlockLayoutProps } from '@lodariq/schema';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { clampActionWidth } from './transform-math';

export type ActionResizeEdge = 'start' | 'end';

interface InteractResizeEvent {
  deltaRect: { width: number };
}

export function useActionResize({
  actionAlign,
  actionKey,
  initialWidth,
  onCommit,
  previewRef,
  zoomPercent,
}: {
  actionAlign: BlockLayoutProps['align'];
  actionKey: string;
  initialWidth: number | null;
  onCommit: (widthPx: number | null) => void;
  previewRef: RefObject<HTMLElement | null>;
  zoomPercent: number;
}) {
  const [liveWidth, setLiveWidthState] = useState<number | null>(initialWidth);
  const [resizing, setResizing] = useState(false);
  const liveWidthRef = useRef(liveWidth);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const setLiveWidth = (width: number | null): void => {
    liveWidthRef.current = width;
    setLiveWidthState(width);
  };

  useEffect(() => setLiveWidth(initialWidth), [actionKey, initialWidth]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    let disposed = false;
    let unset: (() => void) | null = null;
    const scale = zoomPercent / 100;

    void import('interactjs').then(({ default: interact }) => {
      if (disposed) return;
      const interactable = interact(preview).resizable({
        edges: {
          left: '.storyboard-action-resize-handle.start',
          right: '.storyboard-action-resize-handle.end',
        },
        listeners: {
          start: () => {
            setLiveWidth(measuredWidth(preview, scale, liveWidthRef.current));
            setResizing(true);
          },
          move: (event: InteractResizeEvent) => {
            const multiplier = actionAlign === 'center' ? 2 : 1;
            const maximumWidth = availableWidth(preview, scale);
            const next =
              measuredWidth(preview, scale, liveWidthRef.current) +
              (event.deltaRect.width / scale) * multiplier;
            setLiveWidth(clampActionWidth(next, maximumWidth));
          },
          end: () => {
            setResizing(false);
            if (liveWidthRef.current) commitRef.current(liveWidthRef.current);
          },
        },
      });
      unset = () => interactable.unset();
    });

    return () => {
      disposed = true;
      unset?.();
    };
  }, [actionAlign, previewRef, zoomPercent]);

  const reset = (): void => {
    setLiveWidth(null);
    commitRef.current(null);
  };

  const resizeWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    edge: ActionResizeEdge,
  ): void => {
    if (event.key === 'Home') {
      reset();
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const current = measuredWidth(previewRef.current, zoomPercent / 100, liveWidthRef.current);
    const visualDirection = event.key === 'ArrowRight' ? 1 : -1;
    const edgeDirection = edge === 'end' ? 1 : -1;
    const width = clampActionWidth(
      current + visualDirection * edgeDirection * 8,
      BUTTON_WIDTH_PX_LIMITS.max,
    );
    setLiveWidth(width);
    commitRef.current(width);
    event.preventDefault();
  };

  return { liveWidth, reset, resizeWithKeyboard, resizing };
}

function measuredWidth(element: HTMLElement | null, scale: number, current: number | null): number {
  const measured = (element?.getBoundingClientRect().width ?? BUTTON_WIDTH_PX_LIMITS.min) / scale;
  return clampActionWidth(current ?? measured, BUTTON_WIDTH_PX_LIMITS.max);
}

function availableWidth(element: HTMLElement, scale: number): number {
  const available = (element.parentElement?.getBoundingClientRect().width ?? 0) / scale;
  return Math.min(Math.max(available, BUTTON_WIDTH_PX_LIMITS.min), BUTTON_WIDTH_PX_LIMITS.max);
}
