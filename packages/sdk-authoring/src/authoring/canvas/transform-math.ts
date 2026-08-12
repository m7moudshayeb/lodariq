import { BUTTON_WIDTH_PX_LIMITS } from '@lodariq/schema';

export type TransformVector = { x: number; y: number };

export function keyboardMove(key: string, step = 8): TransformVector | null {
  return (
    {
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
    }[key] ?? null
  );
}

export function keyboardSizeDelta(key: string, step = 8): { width: number; height: number } | null {
  return (
    {
      ArrowDown: { width: 0, height: step },
      ArrowLeft: { width: -step, height: 0 },
      ArrowRight: { width: step, height: 0 },
      ArrowUp: { width: 0, height: -step },
    }[key] ?? null
  );
}

export function clampAndSnap(
  value: number,
  limits: { min: number; max: number; step: number },
): number {
  return clamp(snapToGrid(value, limits.step), limits.min, limits.max);
}

export function clampActionWidth(
  value: number,
  maximum: number = BUTTON_WIDTH_PX_LIMITS.max,
): number {
  return clampAndSnap(value, { ...BUTTON_WIDTH_PX_LIMITS, max: maximum });
}

export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
