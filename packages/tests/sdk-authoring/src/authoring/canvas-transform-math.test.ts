import { BUTTON_WIDTH_PX_LIMITS } from '@lodariq/schema';
import {
  clampActionWidth,
  clampAndSnap,
  keyboardMove,
  keyboardSizeDelta,
} from '../../../../../packages/sdk-authoring/src/authoring/canvas/transform-math';
import { describe, expect, it } from 'vitest';

describe('canvas transform math', () => {
  it('uses the shared grid and clamps popup dimensions', () => {
    expect(clampAndSnap(347, { min: 240, max: 640, step: 4 })).toBe(348);
    expect(clampAndSnap(90, { min: 240, max: 640, step: 4 })).toBe(240);
  });

  it('keeps action widths on the schema step and inside limits', () => {
    expect(clampActionWidth(203)).toBe(204);
    expect(clampActionWidth(10)).toBe(BUTTON_WIDTH_PX_LIMITS.min);
  });

  it('provides keyboard parity for movement and size changes', () => {
    expect(keyboardMove('ArrowLeft')).toEqual({ x: -8, y: 0 });
    expect(keyboardSizeDelta('ArrowDown')).toEqual({ width: 0, height: 8 });
    expect(keyboardMove('Escape')).toBeNull();
  });
});
