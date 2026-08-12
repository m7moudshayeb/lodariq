import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { TOOLTIP_HEIGHT_PX_LIMITS, TOOLTIP_WIDTH_PX_LIMITS } from '@lodariq/schema';
import { clamp, clampAndSnap, keyboardMove, keyboardSizeDelta, snapToGrid } from './transform-math';

export type PopupResizeCorner = 'north-east' | 'north-west' | 'south-east' | 'south-west';
export type CanvasOffset = { x: number; y: number };
export type CanvasSize = { widthPx: number | null; heightPx: number | null };

interface InteractMoveEvent {
  dx: number;
  dy: number;
}

interface InteractResizeEvent extends InteractMoveEvent {
  deltaRect: { left: number; top: number; width: number; height: number };
}

export function usePopupTransform({
  experienceKey,
  initialHeight,
  initialWidth,
  onCommitSize,
  onInteractionStart,
  popupRef,
  stageRef,
  zoomPercent,
}: {
  experienceKey: string;
  initialHeight: number | null;
  initialWidth: number | null;
  onCommitSize: (size: CanvasSize) => void;
  onInteractionStart: () => void;
  popupRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  zoomPercent: number;
}) {
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [offset, setOffsetState] = useState<CanvasOffset>({ x: 0, y: 0 });
  const [size, setSizeState] = useState<CanvasSize>({
    widthPx: initialWidth,
    heightPx: initialHeight,
  });
  const offsetRef = useRef(offset);
  const sizeRef = useRef(size);
  const commitRef = useRef(onCommitSize);
  const interactionStartRef = useRef(onInteractionStart);

  commitRef.current = onCommitSize;
  interactionStartRef.current = onInteractionStart;

  const setOffset = (next: CanvasOffset): void => {
    offsetRef.current = next;
    setOffsetState(next);
  };

  const setSize = (next: CanvasSize): void => {
    sizeRef.current = next;
    setSizeState(next);
  };

  useEffect(() => {
    setDragging(false);
    setResizing(false);
    setOffset({ x: 0, y: 0 });
  }, [experienceKey]);

  useEffect(() => {
    setSize({ widthPx: initialWidth, heightPx: initialHeight });
  }, [experienceKey, initialHeight, initialWidth]);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    setReady(false);
    let disposed = false;
    let unset: (() => void) | null = null;
    const scale = zoomPercent / 100;

    void import('interactjs').then(({ default: interact }) => {
      if (disposed) return;
      const interactable = interact(popup)
        .draggable({
          allowFrom: '.storyboard-popup-drag-handle',
          listeners: {
            start: () => {
              interactionStartRef.current();
              setDragging(true);
            },
            move: (event: InteractMoveEvent) => {
              const current = offsetRef.current;
              const next = {
                x: current.x + event.dx / scale,
                y: current.y + event.dy / scale,
              };
              setOffset(clampOffset(next, current, popup, stageRef.current, scale));
            },
            end: () => setDragging(false),
          },
        })
        .resizable({
          edges: {
            left: '[data-corner$="west"]',
            right: '[data-corner$="east"]',
            top: '[data-corner^="north"]',
            bottom: '[data-corner^="south"]',
          },
          listeners: {
            start: () => {
              interactionStartRef.current();
              setSize(measuredSize(popup, scale, sizeRef.current));
              setResizing(true);
            },
            move: (event: InteractResizeEvent) => {
              const current = measuredSize(popup, scale, sizeRef.current);
              const widthPx = clampAndSnap(
                current.widthPx + event.deltaRect.width / scale,
                TOOLTIP_WIDTH_PX_LIMITS,
              );
              const heightPx = clampAndSnap(
                current.heightPx + event.deltaRect.height / scale,
                TOOLTIP_HEIGHT_PX_LIMITS,
              );
              setSize({ widthPx, heightPx });
              setOffset({
                x: offsetRef.current.x + event.deltaRect.left / scale,
                y: offsetRef.current.y + event.deltaRect.top / scale,
              });
            },
            end: () => {
              setResizing(false);
              commitRef.current(sizeRef.current);
            },
          },
        });
      unset = () => interactable.unset();
      setReady(true);
    });

    return () => {
      disposed = true;
      unset?.();
      setReady(false);
    };
  }, [popupRef, stageRef, zoomPercent]);

  const resetPosition = (): void => setOffset({ x: 0, y: 0 });
  const resetSize = (): void => {
    const next = { widthPx: null, heightPx: null };
    setSize(next);
    commitRef.current(next);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Home') {
      resetPosition();
      event.preventDefault();
      return;
    }
    const movement = keyboardMove(event.key);
    if (!movement) return;
    setOffset({
      x: offsetRef.current.x + movement.x,
      y: offsetRef.current.y + movement.y,
    });
    event.preventDefault();
  };

  const resizeWithKeyboard = (
    corner: PopupResizeCorner,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    interactionStartRef.current();
    if (event.key === 'Home') {
      resetSize();
      event.preventDefault();
      return;
    }
    const current = measuredSize(popupRef.current, zoomPercent / 100, sizeRef.current);
    const delta = keyboardSizeDelta(event.key);
    if (!delta) return;
    const widthPx = clampAndSnap(current.widthPx + delta.width, TOOLTIP_WIDTH_PX_LIMITS);
    const heightPx = clampAndSnap(current.heightPx + delta.height, TOOLTIP_HEIGHT_PX_LIMITS);
    setOffset({
      x: corner.endsWith('west')
        ? offsetRef.current.x + current.widthPx - widthPx
        : offsetRef.current.x,
      y: corner.startsWith('north')
        ? offsetRef.current.y + current.heightPx - heightPx
        : offsetRef.current.y,
    });
    const next = { widthPx, heightPx };
    setSize(next);
    commitRef.current(next);
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    dragging,
    moveWithKeyboard,
    offset,
    ready,
    resetPosition,
    resetSize,
    resizeWithKeyboard,
    resizing,
    size,
  };
}

function measuredSize(
  popup: HTMLElement | null,
  scale: number,
  current: CanvasSize,
): { widthPx: number; heightPx: number } {
  const rect = popup?.getBoundingClientRect();
  return {
    widthPx: clampAndSnap(
      current.widthPx ?? (rect?.width ?? TOOLTIP_WIDTH_PX_LIMITS.min) / scale,
      TOOLTIP_WIDTH_PX_LIMITS,
    ),
    heightPx: clampAndSnap(
      current.heightPx ?? (rect?.height ?? TOOLTIP_HEIGHT_PX_LIMITS.min) / scale,
      TOOLTIP_HEIGHT_PX_LIMITS,
    ),
  };
}

function clampOffset(
  next: CanvasOffset,
  current: CanvasOffset,
  popup: HTMLElement,
  stage: HTMLElement | null,
  scale: number,
): CanvasOffset {
  if (!stage) return { x: snapToGrid(next.x, 4), y: snapToGrid(next.y, 4) };
  const stageRect = stage.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  const minX = current.x + (stageRect.left + 12 - popupRect.left) / scale;
  const maxX = current.x + (stageRect.right - 96 - popupRect.right) / scale;
  const minY = current.y + (stageRect.top + 12 - popupRect.top) / scale;
  const maxY = current.y + (stageRect.bottom - 48 - popupRect.top) / scale;
  return {
    x: clamp(snapToGrid(next.x, 4), Math.min(minX, maxX), Math.max(minX, maxX)),
    y: clamp(snapToGrid(next.y, 4), Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}
