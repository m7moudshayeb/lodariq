import {
  BUTTON_WIDTH_PX_LIMITS,
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
} from '@lodariq/schema';
import { describe, expect, it } from 'vitest';
import {
  clampSnappedSize,
  clampSnappedWidth,
  rectIntersectsViewport,
  resizedSize,
  snapPlacement,
} from '../../../../../packages/sdk-authoring/src/authoring/canvas/edge-resize';

describe('shared 8-edge resize', () => {
  it('clamps button width to schema limits and step', () => {
    expect(clampSnappedWidth(79, BUTTON_WIDTH_PX_LIMITS)).toBe(80);
    expect(clampSnappedWidth(481, BUTTON_WIDTH_PX_LIMITS)).toBe(480);
    expect(clampSnappedWidth(93, BUTTON_WIDTH_PX_LIMITS)).toBe(92);
  });

  it('grows width from the east edge and ignores north for width-only chrome', () => {
    const start = { width: 120, height: 40, x: 200, y: 80 };
    const east = resizedSize('e', start, { x: 240, y: 80 });
    expect(east.width).toBe(160);
    expect(east.height).toBe(40);
    const north = resizedSize('n', start, { x: 200, y: 40 });
    expect(north.width).toBe(120);
    expect(north.height).toBe(80);
  });

  it('clamps overlay popup size to tooltip limits', () => {
    expect(
      clampSnappedSize(
        { width: 100, height: 900 },
        TOOLTIP_WIDTH_PX_LIMITS,
        TOOLTIP_HEIGHT_PX_LIMITS,
      ),
    ).toEqual({ width: 240, height: 640 });
  });

  it('snaps a dragged card to semantic placement, not coordinates', () => {
    const target = { left: 100, top: 100, width: 80, height: 40 };
    expect(snapPlacement({ left: 100, top: 20, width: 80, height: 40 }, target)).toBe('top');
    expect(snapPlacement({ left: 220, top: 100, width: 80, height: 40 }, target)).toBe('right');
    expect(snapPlacement({ left: 100, top: 180, width: 80, height: 40 }, target)).toBe('bottom');
    expect(snapPlacement({ left: 10, top: 100, width: 80, height: 40 }, target)).toBe('left');
  });

  it('treats off-viewport targets as filmstrip-only', () => {
    expect(
      rectIntersectsViewport(
        { left: -40, top: 10, right: -8, bottom: 40 },
        { width: 800, height: 600 },
      ),
    ).toBe(false);
    expect(
      rectIntersectsViewport(
        { left: 20, top: 20, right: 80, bottom: 60 },
        { width: 800, height: 600 },
      ),
    ).toBe(true);
  });
});
