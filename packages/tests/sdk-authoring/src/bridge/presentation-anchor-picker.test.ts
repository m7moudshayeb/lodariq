// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPresentationAnchorPicker } from '../../../../../packages/sdk-authoring/src/bridge/presentation-anchor-picker';

describe('presentation anchor picker', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lodariq-presentation-anchor-picker');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('commits a bounded region after a meaningful pointer drag', () => {
    const owner = createOwner();
    const onPick = vi.fn();
    startPresentationAnchorPicker({ owner, onPick });
    const outline = presentationOutline();

    pointer(outline, 'pointerdown', 120, 60);
    pointer(outline, 'pointermove', 180, 90);
    pointer(outline, 'pointerup', 180, 90);

    expect(onPick).toHaveBeenCalledWith({
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.1,
      widthRatio: 0.3,
      heightRatio: 0.3,
    });
    expect(
      document.querySelector('[data-lodariq-bridge="presentation-anchor-outline"]'),
    ).toBeNull();
  });

  it('turns a click without meaningful drag into a point', () => {
    const owner = createOwner();
    const onPick = vi.fn();
    startPresentationAnchorPicker({ owner, onPick });
    const outline = presentationOutline();

    pointer(outline, 'pointerdown', 140, 70);
    pointer(outline, 'pointerup', 143, 72);

    expect(onPick).toHaveBeenCalledWith({ kind: 'point', xRatio: 0.215, yRatio: 0.22 });
  });

  it('resets an in-progress gesture when the owner moves', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const owner = createOwner();
    const onPick = vi.fn();
    startPresentationAnchorPicker({ owner, onPick });
    const outline = presentationOutline();

    pointer(outline, 'pointerdown', 120, 60);
    pointer(outline, 'pointermove', 180, 90);
    vi.mocked(owner.getBoundingClientRect).mockReturnValue(rect(80, 50, 200, 100));
    window.dispatchEvent(new Event('scroll'));
    pointer(outline, 'pointerup', 180, 90);

    expect(onPick).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-lodariq-bridge="presentation-anchor-status"]')?.textContent,
    ).toContain('element moved');

    pointer(outline, 'pointerdown', 100, 60);
    pointer(outline, 'pointerup', 100, 60);
    expect(onPick).toHaveBeenCalledWith({ kind: 'point', xRatio: 0.1, yRatio: 0.1 });
  });

  it('supports a centered keyboard point that moves in bounded steps and commits with Enter', () => {
    const owner = createOwner();
    const onPick = vi.fn();
    startPresentationAnchorPicker({ owner, onPick });
    const outline = presentationOutline();

    outline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    outline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    outline.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onPick).toHaveBeenCalledWith({ kind: 'point', xRatio: 0.52, yRatio: 0.52 });
  });

  it('cancels once with Escape and leaves the rest of the customer page interactive', () => {
    const owner = createOwner();
    const outsideButton = document.createElement('button');
    const outsideClick = vi.fn();
    outsideButton.addEventListener('click', outsideClick);
    document.body.appendChild(outsideButton);
    const onCancel = vi.fn();
    const picker = startPresentationAnchorPicker({ owner, onPick: vi.fn(), onCancel });

    outsideButton.click();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    picker.cancel();

    expect(outsideClick).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute('data-lodariq-presentation-anchor-picker')).toBe(
      false,
    );
    expect(
      document.querySelector('[data-lodariq-bridge="presentation-anchor-guidance"]'),
    ).toBeNull();
  });
});

function createOwner(): HTMLElement {
  const owner = document.createElement('section');
  document.body.appendChild(owner);
  vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 200, 100));
  return owner;
}

function presentationOutline(): HTMLElement {
  const outline = document.querySelector<HTMLElement>(
    '[data-lodariq-bridge="presentation-anchor-outline"]',
  );
  if (!outline) throw new Error('presentation anchor outline missing');
  return outline;
}

function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX,
      clientY,
    }),
  );
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
