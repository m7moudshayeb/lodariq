// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const computePosition = vi.fn(async () => ({
  x: 0,
  y: 0,
  placement: 'bottom' as const,
  strategy: 'fixed' as const,
  middlewareData: {},
}));
const offset = vi.fn((value: number) => ({ name: 'offset', value }));
const flip = vi.fn(() => ({ name: 'flip' }));

vi.mock('@floating-ui/dom', () => ({
  computePosition,
  offset,
  flip,
  shift: () => ({ name: 'shift' }),
  arrow: () => ({ name: 'arrow' }),
}));

const { computeCollisionAwareTourPosition } = await import(
  '../../../../../packages/sdk-runtime/src/renderers/tour-protected-positioning'
);

function options(overrides: Record<string, unknown> = {}) {
  const card = document.createElement('div');
  const arrowElement = document.createElement('div');
  const element = document.createElement('button');
  document.body.append(card, arrowElement, element);
  return {
    anchor: {
      kind: 'element' as const,
      element,
      interactionSafe: true as const,
      getBoundingClientRect: () => element.getBoundingClientRect(),
    },
    arrowElement,
    card,
    placement: 'bottom' as const,
    reference: element,
    ...overrides,
  };
}

describe('the author-set gap and flip reach the positioner', () => {
  it('uses the renderer default when the author set nothing', async () => {
    offset.mockClear();
    await computeCollisionAwareTourPosition(options());
    expect(offset).toHaveBeenCalledWith(12);
  });

  it('uses the author’s gap when the compass set one', async () => {
    offset.mockClear();
    await computeCollisionAwareTourPosition(options({ offsetPx: 40 }));
    expect(offset).toHaveBeenCalledWith(40);
  });

  it('keeps flip on by default and drops it when the author turned it off', async () => {
    flip.mockClear();
    await computeCollisionAwareTourPosition(options());
    expect(flip).toHaveBeenCalled();

    flip.mockClear();
    await computeCollisionAwareTourPosition(options({ autoFlip: false }));
    expect(flip).not.toHaveBeenCalled();
  });
});
