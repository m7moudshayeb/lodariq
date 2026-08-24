// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cornerPreference,
  createOverlayLayerManager,
} from '../../../../../../packages/sdk-authoring/src/authoring/overlay/layer-manager';
import { findOverlaps } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver';
import { OVERLAY_CHROME_CORNERS } from '../../../../../../packages/sdk-authoring/src/authoring/overlay/solver.types';

const STAGE = { width: 1280, height: 800 };

function surface(id: string, width: number, height: number): HTMLElement {
  const element = document.createElement('div');
  element.dataset['surface'] = id;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.append(element);
  return element;
}

describe('overlay layer manager (§3.4)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('places each surface in its preferred corner when nothing is reserved', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const filmstrip = surface('filmstrip', 320, 38);
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'filmstrip', element: filmstrip, preference: () => ['bottom-left'] });
    manager.register({ id: 'pill', element: pill, preference: () => ['bottom-right'] });
    manager.setReserved([]);
    manager.solve({ force: true });
    expect(filmstrip.dataset['corner']).toBe('bottom-left');
    expect(pill.dataset['corner']).toBe('bottom-right');
  });

  it('never lets two Lodariq surfaces share a pixel', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    // Both want the same corner; the second must be displaced.
    const first = surface('first', 400, 38);
    const second = surface('second', 400, 38);
    manager.register({
      id: 'first',
      element: first,
      preference: () => [...OVERLAY_CHROME_CORNERS],
    });
    manager.register({
      id: 'second',
      element: second,
      preference: () => [...OVERLAY_CHROME_CORNERS],
    });
    manager.setReserved([]);
    manager.solve({ force: true });
    // Rule 1 is about pixels, not corners: the second may stay in the same corner
    // and slide clear of the first, which reads better than being thrown across
    // the viewport. What must never happen is an overlap.
    expect(findOverlaps(manager.placements())).toEqual([]);
  });

  it('displaces chrome that would cover the card and its target', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'pill', element: pill, preference: () => [...OVERLAY_CHROME_CORNERS] });
    // A card parked in the bottom-right corner, with its target beside it.
    manager.setReserved([
      { left: 900, top: 600, width: 340, height: 180 },
      { left: 840, top: 640, width: 40, height: 30 },
    ]);
    manager.solve({ force: true });
    // Displaced means "off the card", not "in a different corner": sliding up
    // the same edge clears it and keeps the pill where the creator expects it.
    expect(
      findOverlaps([
        ...manager.placements(),
        { id: 'card', rect: { left: 900, top: 600, width: 340, height: 180 } },
      ]),
    ).toEqual([]);
  });

  it('reports a collision rather than silently overlapping when no corner is free', () => {
    const placedWith: { corner: string; displaced: boolean }[] = [];
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({
      id: 'pill',
      element: pill,
      preference: () => [...OVERLAY_CHROME_CORNERS],
      onPlaced: (corner, displaced) => placedWith.push({ corner, displaced }),
    });
    manager.setReserved([{ left: 0, top: 0, width: STAGE.width, height: STAGE.height }]);
    manager.solve({ force: true });
    expect(placedWith).toHaveLength(1);
    // The creator's Move / Hide affordance is the fallback, so this must be visible.
    expect(placedWith[0]?.displaced).toBe(true);
  });

  it('does not re-place while the card grows by a few pixels', () => {
    const moves: string[] = [];
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({
      id: 'pill',
      element: pill,
      preference: () => [...OVERLAY_CHROME_CORNERS],
      onPlaced: (corner) => moves.push(corner),
    });
    manager.setReserved([{ left: 400, top: 300, width: 340, height: 180 }]);
    manager.solve();
    expect(moves).toHaveLength(1);

    // Typing grows the card a line at a time; that must not move chrome.
    for (let extra = 1; extra <= 20; extra += 1) {
      manager.setReserved([{ left: 400, top: 300, width: 340, height: 180 + extra }]);
      manager.solve();
    }
    expect(moves).toHaveLength(1);
  });

  it('skips hidden surfaces so they do not reserve space', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const filmstrip = surface('filmstrip', 400, 38);
    filmstrip.hidden = true;
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'filmstrip', element: filmstrip, preference: () => ['bottom-right'] });
    manager.register({ id: 'pill', element: pill, preference: () => ['bottom-right'] });
    manager.setReserved([]);
    manager.solve({ force: true });
    expect(manager.placements().map((entry) => entry.id)).toEqual(['pill']);
    expect(pill.dataset['corner']).toBe('bottom-right');
  });
});

describe('cornerPreference', () => {
  it('puts the creator’s chosen corner first and keeps the rest stable', () => {
    expect(cornerPreference('top-left', OVERLAY_CHROME_CORNERS)).toEqual([
      'top-left',
      'bottom-right',
      'bottom-left',
      'top-right',
    ]);
  });
});

describe('what counts as reserved, and what is merely in the way', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * The launcher sits bottom-right while the card is top-right. Unioning the two
   * declares the entire right-hand edge occupied and evicts the pill to a corner
   * nothing is wrong with — which is the failure this module's own rules warn
   * about, once for obstacles and now for the reserved rect too.
   */
  it('does not let a far-away obstacle drag the reserved rect across the viewport', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'pill', element: pill, preference: () => ['bottom-right'] });

    const card = { left: 900, top: 60, width: 340, height: 160 };
    const launcher = { left: 1200, top: 730, width: 48, height: 48 };
    manager.setReserved([card]);
    manager.setObstacles([launcher]);
    manager.solve({ force: true });

    // It stays in the corner it belongs to and slides clear of the launcher,
    // rather than being thrown across the viewport by a union that spans to it.
    expect(pill.dataset['corner']).toBe('bottom-right');
    const [placed] = manager.placements();
    expect(
      findOverlaps([
        { id: 'pill', rect: placed!.rect },
        { id: 'launcher', rect: launcher },
        { id: 'card', rect: card },
      ]),
    ).toEqual([]);
    // A slide is only useful if it is actually applied to the element.
    expect(pill.style.top).toBe(`${placed!.rect.top}px`);
  });

  it('keeps the preferred corner once the obstacle is gone', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'pill', element: pill, preference: () => ['bottom-right'] });
    manager.setReserved([{ left: 900, top: 60, width: 340, height: 160 }]);
    manager.setObstacles([{ left: 1200, top: 730, width: 48, height: 48 }]);
    manager.solve({ force: true });

    manager.setObstacles([]);
    manager.solve();
    expect(pill.dataset['corner']).toBe('bottom-right');
    // Back to the corner the stylesheet pins, with no leftover inline position.
    expect(pill.style.top).toBe('');
  });

  it('ignores a zero-sized obstacle rather than treating it as a point blocker', () => {
    const manager = createOverlayLayerManager({ stage: () => STAGE });
    const pill = surface('pill', 260, 38);
    manager.register({ id: 'pill', element: pill, preference: () => ['bottom-right'] });
    manager.setReserved([]);
    manager.setObstacles([{ left: 1200, top: 730, width: 0, height: 0 }, null, undefined]);
    manager.solve({ force: true });
    expect(pill.dataset['corner']).toBe('bottom-right');
  });
});
