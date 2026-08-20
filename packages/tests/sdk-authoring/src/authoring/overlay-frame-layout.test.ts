import { describe, expect, it } from 'vitest';
import {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO,
  OVERLAY_INSPECTOR_WIDTH_PX,
  OVERLAY_TOOLBAR_GAP_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
  OVERLAY_TOOLBAR_MIN_WIDTH_PX,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/constants';
import { solveOverlayFrame } from '../../../../../packages/sdk-authoring/src/authoring/overlay/frame-layout';

const STAGE = { width: 1440, height: 900 };
const CARD = { left: 900, top: 300, width: 360, height: 150 };

/** Frame-local box back to viewport coordinates. */
function absolute(
  frame: { left: number; top: number },
  box: { left: number; top: number },
): { left: number; top: number } {
  return { left: frame.left + box.left, top: frame.top + box.top };
}

function overlaps(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

describe('overlay frame layout', () => {
  it('keeps the card where the runtime put it, whatever else opens', () => {
    const closed = solveOverlayFrame(CARD, STAGE);
    const open = solveOverlayFrame(CARD, STAGE, { inspectorHeight: 700 });
    const menu = solveOverlayFrame(CARD, STAGE, { menuAllowance: 360 });
    for (const layout of [closed, open, menu]) {
      expect(absolute(layout.frame, layout.card)).toEqual({ left: CARD.left, top: CARD.top });
      expect(layout.card.width).toBe(CARD.width);
    }
  });

  /**
   * The defect this module exists to fix: the frame was sized from the card alone,
   * so an inspector taller than the card was clipped by the iframe — and the
   * sections past the cut were unreachable, Advanced among them.
   */
  it('reserves the inspector height in the frame, capped at 60vh', () => {
    const layout = solveOverlayFrame(CARD, STAGE, { inspectorHeight: 1200 });
    const cap = STAGE.height * OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO;
    expect(layout.inspector?.height).toBe(cap);
    expect(layout.inspector?.width).toBe(OVERLAY_INSPECTOR_WIDTH_PX);
    const top = absolute(layout.frame, layout.inspector!).top;
    expect(top).toBeGreaterThanOrEqual(OVERLAY_CHROME_PAD_PX);
    expect(top + cap).toBeLessThanOrEqual(STAGE.height - OVERLAY_CHROME_PAD_PX);
    // The whole reserved box has to fit inside the frame, or it is clipped again.
    expect(layout.inspector!.top + layout.inspector!.height).toBeLessThanOrEqual(
      layout.frame.height,
    );
  });

  it('opens the inspector at its content height when that is under the cap', () => {
    const layout = solveOverlayFrame(CARD, STAGE, { inspectorHeight: 300 });
    expect(layout.inspector?.height).toBe(300);
  });

  it('takes the toolbar minimum width and never leaves the viewport', () => {
    const nearEdge = { left: 1300, top: 300, width: 240, height: 150 };
    const layout = solveOverlayFrame(nearEdge, STAGE);
    expect(layout.toolbar.width).toBe(OVERLAY_TOOLBAR_MIN_WIDTH_PX);
    const toolbar = absolute(layout.frame, layout.toolbar);
    expect(toolbar.left).toBeGreaterThanOrEqual(OVERLAY_CHROME_PAD_PX);
    expect(toolbar.left + layout.toolbar.width).toBeLessThanOrEqual(
      STAGE.width - OVERLAY_CHROME_PAD_PX,
    );
    expect(layout.frame.left + layout.frame.width).toBeLessThanOrEqual(STAGE.width);
  });

  it('anchors the toolbar above, then below, then flush with the viewport', () => {
    const above = solveOverlayFrame(CARD, STAGE);
    expect(above.toolbarPlacement).toBe('above');
    expect(absolute(above.frame, above.toolbar).top).toBe(
      CARD.top - OVERLAY_TOOLBAR_GAP_PX - OVERLAY_TOOLBAR_HEIGHT_PX,
    );

    // The caller may reject `above` to keep the toolbar off the target.
    const below = solveOverlayFrame(CARD, STAGE, { toolbarPlacement: 'below' });
    expect(absolute(below.frame, below.toolbar).top).toBe(
      CARD.top + CARD.height + OVERLAY_TOOLBAR_GAP_PX,
    );

    const tall = { left: 40, top: 20, width: 360, height: 560 };
    const docked = solveOverlayFrame(tall, { width: 1440, height: 600 });
    expect(docked.toolbarPlacement).toBe('docked');
    expect(absolute(docked.frame, docked.toolbar).top).toBe(0);
  });

  /**
   * §3.4 rule 2. A target hard against the right edge has no room beside it, so
   * clamping the card into the viewport slid it back across the target — the card
   * covering the one thing the creator is looking at.
   */
  it('moves the card off its target, to the side with room', () => {
    const target = { left: 1300, top: 400, width: 120, height: 40 };
    const overlapping = { left: 1080, top: 380, width: 360, height: 150 };
    const layout = solveOverlayFrame(overlapping, STAGE, { target });
    const card = layout.cardViewport;
    expect(overlaps(card, target)).toBe(false);
    // No room on the right, so it takes the left.
    expect(card.left + card.width).toBeLessThanOrEqual(target.left);
    expect(card.left).toBeGreaterThanOrEqual(OVERLAY_CHROME_PAD_PX);
    expect(card.top).toBeGreaterThanOrEqual(OVERLAY_CHROME_PAD_PX);
    expect(card.top + card.height).toBeLessThanOrEqual(STAGE.height - OVERLAY_CHROME_PAD_PX);
  });

  it('mirrors that for a target on the far left', () => {
    const target = { left: 8, top: 400, width: 120, height: 40 };
    const overlapping = { left: 12, top: 380, width: 360, height: 150 };
    const card = solveOverlayFrame(overlapping, STAGE, { target }).cardViewport;
    expect(overlaps(card, target)).toBe(false);
    expect(card.left).toBeGreaterThanOrEqual(target.left + target.width);
  });

  it('takes a horizontal side over a vertical one only when it fits', () => {
    // Target spans the full width, so neither left nor right can hold the card.
    const target = { left: 0, top: 380, width: 1440, height: 60 };
    const card = solveOverlayFrame({ left: 500, top: 400, width: 360, height: 150 }, STAGE, {
      target,
    }).cardViewport;
    expect(overlaps(card, target)).toBe(false);
    expect(card.top).toBeGreaterThanOrEqual(target.top + target.height);
  });

  it('leaves a placement that already clears the target alone', () => {
    const target = { left: 200, top: 400, width: 120, height: 40 };
    const clear = { left: 600, top: 380, width: 360, height: 150 };
    expect(solveOverlayFrame(clear, STAGE, { target }).cardViewport).toEqual(clear);
  });

  it('flips the inspector to the free side and corners it when neither fits', () => {
    const rightEdge = { left: 1000, top: 300, width: 360, height: 150 };
    expect(solveOverlayFrame(rightEdge, STAGE, { inspectorHeight: 300 }).inspectorAnchor).toBe(
      'left',
    );
    const narrow = { left: 40, top: 200, width: 360, height: 150 };
    expect(
      solveOverlayFrame(narrow, { width: 600, height: 900 }, { inspectorHeight: 300 })
        .inspectorAnchor,
    ).toBe('corner');
  });
});
