import { describe, expect, it } from 'vitest';
import { solveOverlayFrame } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/frame-layout';
import {
  rectsIntersect,
  solveChromeAmong,
  solveToolbar,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver';
import type { SolverRect } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver.types';

const STAGE = { width: 1440, height: 900 };

describe('the toolbar never covers the target (§4.2a rule 2)', () => {
  it('flips below when the space above the card is the target', () => {
    const card: SolverRect = { left: 500, top: 300, width: 340, height: 220 };
    const target: SolverRect = { left: 520, top: 248, width: 160, height: 40 };
    const solved = solveToolbar(card, STAGE, target);
    expect(solved.placement).toBe('below');
    expect(rectsIntersect(solved.rect, target)).toBe(false);
  });

  it('keeps its preferred side when the target is nowhere near it', () => {
    const card: SolverRect = { left: 500, top: 300, width: 340, height: 220 };
    const target: SolverRect = { left: 520, top: 540, width: 160, height: 40 };
    expect(solveToolbar(card, STAGE, target).placement).toBe('above');
  });

  it('still places the toolbar when both sides are compromised', () => {
    const card: SolverRect = { left: 500, top: 300, width: 340, height: 220 };
    // A target tall enough to sit above and below the card at once.
    const target: SolverRect = { left: 400, top: 200, width: 600, height: 420 };
    const solved = solveToolbar(card, STAGE, target);
    expect(['above', 'below', 'docked']).toContain(solved.placement);
    expect(solved.rect.width).toBeGreaterThanOrEqual(card.width);
  });

  it('behaves exactly as before when there is no target', () => {
    const card: SolverRect = { left: 500, top: 300, width: 340, height: 220 };
    expect(solveToolbar(card, STAGE).placement).toBe(solveToolbar(card, STAGE, null).placement);
  });
});

describe('chrome slides along its edge before it gives up', () => {
  it('finds a gap up the preferred edge rather than jumping corners', () => {
    // Obstacles across every corner, leaving a band in the middle-right free.
    const obstacles: SolverRect[] = [
      { left: 0, top: 780, width: 1440, height: 120 },
      { left: 0, top: 0, width: 1440, height: 200 },
      { left: 0, top: 200, width: 900, height: 580 },
    ];
    const solved = solveChromeAmong({ width: 200, height: 38 }, STAGE, obstacles, [
      'bottom-right',
    ]);
    expect(solved.collides).toBe(false);
    expect(solved.corner).toBe('bottom-right');
    expect(obstacles.some((o) => rectsIntersect(solved.rect, o))).toBe(false);
  });

  it('reports a collision when the stage is genuinely full', () => {
    const solved = solveChromeAmong({ width: 200, height: 38 }, STAGE, [
      { left: 0, top: 0, width: 1440, height: 900 },
    ]);
    expect(solved.collides).toBe(true);
  });
});

describe('the whole authoring frame clears the target', () => {
  const stage = { width: 1280, height: 720 };
  /** A wide, short card — the shape that used to let the frame slide back over it. */
  const target: SolverRect = { left: 243, top: 202, width: 491, height: 110 };

  it('ignores a requested toolbar side that would put the frame back on the target', () => {
    const solved = solveOverlayFrame(
      { left: 308, top: 330, width: 360, height: 148 },
      stage,
      { target, toolbarPlacement: 'above' },
    );
    expect(rectsIntersect(solved.frame, target)).toBe(false);
  });

  it('still honours a requested side that clears the target', () => {
    const solved = solveOverlayFrame(
      { left: 308, top: 470, width: 360, height: 148 },
      stage,
      { target, toolbarPlacement: 'above' },
    );
    expect(solved.toolbar.top).toBeLessThan(470);
    expect(rectsIntersect(solved.frame, target)).toBe(false);
  });
});
