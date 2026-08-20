import { describe, expect, it } from 'vitest';
import {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_WIDTH_PX,
  OVERLAY_RESOLVE_HYSTERESIS_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
  OVERLAY_TOOLBAR_MIN_WIDTH_PX,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/constants';
import {
  findOverlaps,
  rectsIntersect,
  reservedRect,
  shouldResolve,
  solveChrome,
  solveInspector,
  solveToolbar,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver';
import type { SolverRect } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver.types';

const STAGE = { width: 1440, height: 900 };
const card = (over: Partial<SolverRect> = {}): SolverRect => ({
  left: 500,
  top: 400,
  width: 330,
  height: 220,
  ...over,
});

describe('overlay toolbar solver', () => {
  it('takes its own minimum width and overhangs a narrow card symmetrically', () => {
    const narrow = card({ width: 260 });
    const solution = solveToolbar(narrow, STAGE);
    expect(solution.rect.width).toBe(OVERLAY_TOOLBAR_MIN_WIDTH_PX);
    expect(solution.overhang).toBe(OVERLAY_TOOLBAR_MIN_WIDTH_PX - 260);
    const toolbarCentre = solution.rect.left + solution.rect.width / 2;
    expect(toolbarCentre).toBeCloseTo(narrow.left + narrow.width / 2, 5);
  });

  it('never shrinks below the card when the card is wider', () => {
    const wide = card({ width: 620 });
    expect(solveToolbar(wide, STAGE).rect.width).toBe(620);
    expect(solveToolbar(wide, STAGE).overhang).toBe(0);
  });

  it('prefers above, flips below when the card is near the top', () => {
    expect(solveToolbar(card(), STAGE).placement).toBe('above');
    expect(solveToolbar(card({ top: 8 }), STAGE).placement).toBe('below');
  });

  it('docks when neither side fits', () => {
    const tall = card({ top: 8, height: STAGE.height - 40 });
    const solution = solveToolbar(tall, { width: 1440, height: 300 });
    expect(solution.placement).toBe('docked');
    expect(solution.rect.top).toBe(0);
  });

  it('never overlaps the card in any placement', () => {
    for (const top of [8, 200, 400, 700, 860]) {
      const subject = card({ top });
      const solution = solveToolbar(subject, STAGE);
      if (solution.placement === 'docked') {
        continue;
      }
      expect(rectsIntersect(solution.rect, subject)).toBe(false);
    }
  });

  it('stays inside the stage when the card hugs an edge', () => {
    const solution = solveToolbar(card({ left: 4 }), STAGE);
    expect(solution.rect.left).toBeGreaterThanOrEqual(OVERLAY_CHROME_PAD_PX);
    expect(solution.rect.left + solution.rect.width).toBeLessThanOrEqual(
      STAGE.width - OVERLAY_CHROME_PAD_PX,
    );
  });
});

describe('overlay inspector solver', () => {
  it('sits to the right when there is room', () => {
    const solution = solveInspector(card(), STAGE, 300);
    expect(solution.anchor).toBe('right');
    expect(solution.needsLeader).toBe(false);
  });

  it('flips left when the right side is blocked', () => {
    const solution = solveInspector(card({ left: 1100 }), STAGE, 300);
    expect(solution.anchor).toBe('left');
  });

  it('falls back to a corner with a leader line when neither side fits', () => {
    const solution = solveInspector(card({ left: 300, width: 900 }), { width: 1000, height: 900 }, 300);
    expect(solution.anchor).toBe('corner');
    expect(solution.needsLeader).toBe(true);
  });

  it('caps height at the max ratio and keeps a fixed width', () => {
    const solution = solveInspector(card(), STAGE, 5000);
    expect(solution.rect.width).toBe(OVERLAY_INSPECTOR_WIDTH_PX);
    expect(solution.rect.height).toBeLessThanOrEqual(STAGE.height * 0.6);
  });

  it('never overlaps its anchor', () => {
    for (const left of [4, 300, 800, 1100, 1380]) {
      const anchor = card({ left });
      const solution = solveInspector(anchor, STAGE, 300);
      if (solution.anchor === 'corner') {
        continue;
      }
      expect(rectsIntersect(solution.rect, anchor)).toBe(false);
    }
  });
});

describe('unanchored chrome solver', () => {
  const pill = { width: 220, height: OVERLAY_TOOLBAR_HEIGHT_PX };

  it('uses the first free corner in the fixed preference order', () => {
    const reserved = reservedRect([card({ left: 40, top: 700 })]);
    expect(solveChrome(pill, STAGE, reserved).corner).toBe('bottom-right');
  });

  it('gets out of the reserved rect without leaving the corner it belongs to', () => {
    const reserved = reservedRect([card({ left: 1150, top: 780, width: 260, height: 100 })]);
    const solution = solveChrome(pill, STAGE, reserved);
    expect(solution.collides).toBe(false);
    expect(rectsIntersect(solution.rect, reserved)).toBe(false);
    // Sliding up its own edge is preferred to being thrown to another corner.
    expect(solution.corner).toBe('bottom-right');
    expect(solution.slid).toBe(true);
  });

  it('reports a collision rather than silently overlapping when nothing is free', () => {
    const reserved: SolverRect = { left: 0, top: 0, width: STAGE.width, height: STAGE.height };
    const solution = solveChrome(pill, STAGE, reserved);
    expect(solution.collides).toBe(true);
  });

  it('reserves the union of card and target', () => {
    const reserved = reservedRect([
      { left: 100, top: 100, width: 100, height: 100 },
      { left: 300, top: 350, width: 100, height: 100 },
      null,
    ]);
    expect(reserved).toEqual({ left: 100, top: 100, width: 300, height: 350 });
  });
});

describe('hysteresis', () => {
  it('resolves when there is no previous placement', () => {
    expect(shouldResolve(null, card())).toBe(true);
  });

  it('ignores growth smaller than the threshold — the typing case', () => {
    const before = card();
    const after = card({ height: before.height + OVERLAY_RESOLVE_HYSTERESIS_PX - 1 });
    expect(shouldResolve(before, after)).toBe(false);
  });

  it('resolves once drift exceeds the threshold', () => {
    const before = card();
    const after = card({ height: before.height + OVERLAY_RESOLVE_HYSTERESIS_PX + 1 });
    expect(shouldResolve(before, after)).toBe(true);
  });
});

describe('layer invariant', () => {
  it('reports no overlaps for a full solved layout', () => {
    const subject = card();
    const target: SolverRect = { left: 320, top: 180, width: 130, height: 36 };
    const toolbar = solveToolbar(subject, STAGE);
    const inspector = solveInspector(subject, STAGE, 300);
    const reserved = reservedRect([subject, target, toolbar.rect, inspector.rect]);
    const pill = solveChrome({ width: 220, height: 38 }, STAGE, reserved);

    expect(
      findOverlaps([
        { id: 'card', rect: subject },
        { id: 'toolbar', rect: toolbar.rect },
        { id: 'inspector', rect: inspector.rect },
        { id: 'pill', rect: pill.rect },
      ]),
    ).toEqual([]);
  });

  it('detects an overlap when one is introduced', () => {
    const a: SolverRect = { left: 0, top: 0, width: 100, height: 100 };
    const b: SolverRect = { left: 50, top: 50, width: 100, height: 100 };
    expect(findOverlaps([{ id: 'a', rect: a }, { id: 'b', rect: b }])).toEqual([['a', 'b']]);
  });
});
