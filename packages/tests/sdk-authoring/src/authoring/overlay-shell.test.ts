// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { eventInsideOverlayChrome } from '../../../../../packages/sdk-authoring/src/authoring/overlay/click-outside';
import {
  applyOverlayGeometry,
  chooseOverlayToolbarSide,
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_HANDLE_GUTTER_PX,
  OVERLAY_TOOLBAR_BAND_PX,
  OVERLAY_TOOLBAR_MIN_WIDTH_PX,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/geometry';
import {
  createCompass,
  syncCompass,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/compass';
import { syncPulses } from '../../../../../packages/sdk-authoring/src/authoring/overlay/pulses';
import {
  createFilmstrip,
  renderFilmstripSteps,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/filmstrip';
import { snapPlacement } from '../../../../../packages/sdk-authoring/src/authoring/canvas/edge-resize';
import {
  PULSE_INTERVAL_MS,
  startPulseLoop,
} from '../../../../../packages/sdk-authoring/src/authoring/overlay/pulse-loop';

describe('the geometry loop', () => {
  it('stops while the page is away and picks back up when it returns', () => {
    vi.useFakeTimers();
    let ticks = 0;
    const stop = startPulseLoop(() => {
      ticks += 1;
    });
    const after = (): number => {
      vi.advanceTimersByTime(PULSE_INTERVAL_MS * 3);
      return ticks;
    };

    expect(after()).toBeGreaterThan(1);
    const whileHere = ticks;

    window.dispatchEvent(new Event('pagehide'));
    expect(after()).toBe(whileHere);

    window.dispatchEvent(new Event('pageshow'));
    expect(after()).toBeGreaterThan(whileHere);

    stop();
    const whenStopped = ticks;
    // A page that comes back after the shell is gone must not restart it.
    window.dispatchEvent(new Event('pageshow'));
    expect(after()).toBe(whenStopped);
    vi.useRealTimers();
  });
});

describe('live overlay authoring shell', () => {
  it('ignores pointer events inside overlay chrome and the launcher', () => {
    const host = document.createElement('lodariq-authoring-panel');
    const iframe = document.createElement('iframe');
    const launcher = document.createElement('div');
    launcher.dataset['lodariqCreatorLauncher'] = 'true';
    document.body.append(host, iframe, launcher);
    const inside = new Event('pointerdown');
    Object.defineProperty(inside, 'composedPath', { value: () => [iframe] });
    expect(eventInsideOverlayChrome(inside, host, iframe)).toBe(true);
    const fromLauncher = new Event('pointerdown');
    Object.defineProperty(fromLauncher, 'composedPath', { value: () => [launcher] });
    expect(eventInsideOverlayChrome(fromLauncher, host, iframe)).toBe(true);
    const outside = new Event('pointerdown');
    const pageButton = document.createElement('button');
    Object.defineProperty(outside, 'composedPath', { value: () => [pageButton] });
    expect(eventInsideOverlayChrome(outside, host, iframe)).toBe(false);
    host.remove();
    iframe.remove();
    launcher.remove();
  });

  it('shows pulses only for resolved in-viewport targets', () => {
    document.body.innerHTML =
      '<button data-lodariq-id="new-project" aria-label="New project">New project</button>';
    const target = document.querySelector('button')!;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: 40,
      right: 120,
      bottom: 80,
      width: 80,
      height: 40,
      x: 40,
      y: 40,
      toJSON: () => ({}),
    });
    const layer = document.createElement('div');
    document.body.append(layer);
    const documentState = structuredClone(tourFixture) as LodariqDocument;
    syncPulses(layer, {
      activeStepId: null,
      document: documentState,
      hideActive: false,
      onSelect: () => undefined,
    });
    expect(layer.querySelectorAll('[data-pulse-step]')).toHaveLength(1);

    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      left: -80,
      top: 40,
      right: -8,
      bottom: 80,
      width: 72,
      height: 40,
      x: -80,
      y: 40,
      toJSON: () => ({}),
    });
    syncPulses(layer, {
      activeStepId: null,
      document: documentState,
      hideActive: false,
      onSelect: () => undefined,
    });
    expect(layer.querySelectorAll('[data-pulse-step]')).toHaveLength(0);
  });

  it('snaps overlay drag to semantic placement', () => {
    const target = { left: 100, top: 100, width: 80, height: 40 };
    expect(snapPlacement({ left: 100, top: 20, width: 80, height: 40 }, target)).toBe('top');
  });

  it('sizes the overlay iframe to the tooltip plus toolbar', () => {
    const iframe = document.createElement('iframe');
    const frame = document.createElement('div');
    document.body.append(iframe, frame);
    applyOverlayGeometry(
      iframe,
      frame,
      { left: 120, top: 200, width: 320, height: 180, right: 440, bottom: 380 },
      true,
      'above',
    );
    /**
     * §4.2a rule 1: the toolbar is not width-coupled to the card, so the frame is
     * as wide as whichever is wider and the card is centred in it. A 320px card
     * therefore yields a 420px content box, and `left` shifts by half the overhang
     * so the card still sits over its target.
     */
    const overhang = (OVERLAY_TOOLBAR_MIN_WIDTH_PX - 320) / 2;
    expect(iframe.style.width).toBe(
      `${OVERLAY_TOOLBAR_MIN_WIDTH_PX + OVERLAY_CHROME_PAD_PX * 2 + OVERLAY_HANDLE_GUTTER_PX}px`,
    );
    expect(iframe.style.height).toBe(
      `${180 + OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX * 2}px`,
    );
    expect(iframe.style.top).toBe(`${200 - OVERLAY_TOOLBAR_BAND_PX - OVERLAY_CHROME_PAD_PX}px`);
    expect(iframe.style.left).toBe(
      `${120 - OVERLAY_CHROME_PAD_PX - OVERLAY_HANDLE_GUTTER_PX - overhang}px`,
    );
    expect(iframe.dataset['overlayCardWidth']).toBe('320');
    expect(iframe.style.background).toBe('transparent');
    iframe.dataset['overlayInspector'] = '1';
    applyOverlayGeometry(
      iframe,
      frame,
      { left: 120, top: 200, width: 320, height: 180, right: 440, bottom: 380 },
      true,
      'above',
    );
    expect(Number.parseInt(iframe.style.width, 10)).toBeGreaterThan(
      320 + OVERLAY_CHROME_PAD_PX * 2 + OVERLAY_HANDLE_GUTTER_PX,
    );
    iframe.dataset['overlayContentHeight'] = '400';
    applyOverlayGeometry(
      iframe,
      frame,
      { left: 120, top: 200, width: 320, height: 180, right: 440, bottom: 380 },
      true,
      'above',
    );
    expect(iframe.style.height).toBe(
      `${400 + OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX * 2}px`,
    );
    iframe.remove();
    frame.remove();
  });

  it('docks the toolbar below when above would cover the target', () => {
    const card = { left: 732, top: 141, width: 360, height: 125 };
    const target = { left: 944, top: 92, width: 122, height: 37 };
    expect(chooseOverlayToolbarSide(card, target)).toBe('below');
    expect(
      chooseOverlayToolbarSide(
        { left: 40, top: 320, width: 360, height: 125 },
        { left: 40, top: 80, width: 80, height: 40 },
      ),
    ).toBe('above');
  });

  /**
   * §4.2a rule 2's third anchor. Without it a tall card on a short viewport puts
   * the toolbar below the fold — the vanishing-controls failure rule 4 exists to
   * stop, and the one no behavioural test notices because nothing throws.
   */
  it('docks to the viewport when neither side fits', () => {
    const tallCard = { left: 40, top: 20, width: 360, height: 560 };
    expect(chooseOverlayToolbarSide(tallCard, null, 600)).toBe('docked');
    // The same card on a tall viewport still has room underneath.
    expect(chooseOverlayToolbarSide(tallCard, null, 1200)).toBe('below');
  });

  /**
   * Docked is flush with the viewport edge, as the prototype's `ty=0` is — and the
   * card stays exactly where the runtime put it. The frame growing upward to reach
   * the toolbar must never drag the card with it: that would move the creator's
   * preview away from the position it will ship at.
   */
  it('docks the toolbar to the viewport edge without moving the card', () => {
    const iframe = document.createElement('iframe');
    const frame = document.createElement('div');
    document.body.append(iframe, frame);
    applyOverlayGeometry(
      iframe,
      frame,
      { left: 40, top: 120, width: 360, height: 560, right: 400, bottom: 680 },
      true,
      'docked',
    );
    expect(iframe.style.top).toBe('0px');
    expect(iframe.dataset['overlayToolbar']).toBe('docked');
    expect(iframe.dataset['overlayToolbarY']).toBe('0');
    // Frame top 0 + local card offset must land back on the authored top.
    expect(Number.parseInt(iframe.dataset['overlayCardY'] ?? '', 10)).toBe(120);
    expect(frame.style.top).toBe('120px');
    iframe.remove();
    frame.remove();
  });

  it('offers three alignments on each side and marks the current one', () => {
    const compass = createCompass(document);
    document.body.append(compass);
    syncCompass(
      compass,
      { left: 10, top: 10, width: 80, height: 40, right: 90, bottom: 50 },
      true,
      { onPlace: () => undefined },
      { placement: 'bottom', align: 'end', offsetPx: 12 },
    );
    // Placement is a position, so every side/alignment pair is a dot to drag to.
    expect(compass.querySelectorAll('[data-placement]')).toHaveLength(12);
    const current = compass.querySelector<HTMLButtonElement>(
      '[data-placement="bottom"][data-align="end"]',
    );
    const sameSide = compass.querySelector<HTMLButtonElement>(
      '[data-placement="bottom"][data-align="start"]',
    );
    const other = compass.querySelector<HTMLButtonElement>(
      '[data-placement="top"][data-align="end"]',
    );
    expect(current?.hidden).toBe(false);
    expect(current?.getAttribute('aria-pressed')).toBe('true');
    expect(sameSide?.getAttribute('aria-pressed')).toBe('false');
    expect(other?.getAttribute('aria-pressed')).toBe('false');
    expect(compass.querySelector('[data-retarget]')?.getAttribute('aria-label')).toBe(
      'Change target',
    );
    compass.remove();
  });

  it('sets the offset by dragging a dot away from the target', () => {
    const compass = createCompass(document);
    document.body.append(compass);
    const committed: number[] = [];
    syncCompass(
      compass,
      { left: 100, top: 100, width: 80, height: 40, right: 180, bottom: 140 },
      true,
      { onPlace: () => undefined, onOffsetCommit: (offset) => committed.push(offset) },
      { placement: 'bottom', align: 'center', offsetPx: 12 },
    );
    const dot = compass.querySelector<HTMLButtonElement>(
      '[data-placement="bottom"][data-align="center"]',
    )!;
    dot.dispatchEvent(new MouseEvent('pointerdown', { clientX: 140, clientY: 160, bubbles: true }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 190 }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 190 }));
    expect(committed).toEqual([42]);
    compass.remove();
  });

  it('keeps a plain click a placement change, not a one-pixel offset', () => {
    const compass = createCompass(document);
    document.body.append(compass);
    const committed: number[] = [];
    syncCompass(
      compass,
      { left: 100, top: 100, width: 80, height: 40, right: 180, bottom: 140 },
      true,
      { onPlace: () => undefined, onOffsetCommit: (offset) => committed.push(offset) },
      { placement: 'bottom', align: 'center', offsetPx: 12 },
    );
    const dot = compass.querySelector<HTMLButtonElement>(
      '[data-placement="bottom"][data-align="center"]',
    )!;
    dot.dispatchEvent(new MouseEvent('pointerdown', { clientX: 140, clientY: 160, bubbles: true }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 162 }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 162 }));
    expect(committed).toEqual([]);
    compass.remove();
  });
});

describe('the filmstrip step, as a thumbnail', () => {
  function stepWith(children: unknown[]): LodariqBlock {
    return {
      id: 'step_1',
      type: 'tourStep',
      props: {},
      children: [{ id: 'tip_1', type: 'tooltip', props: {}, children }],
    } as unknown as LodariqBlock;
  }

  function strip(step: LodariqBlock): HTMLElement {
    const filmstrip = createFilmstrip(document);
    document.body.append(filmstrip);
    renderFilmstripSteps(
      filmstrip,
      { type: 'tour', blocks: [step] } as unknown as LodariqDocument,
      'step_1',
    );
    return filmstrip;
  }

  it('previews the step rather than printing its number alone', () => {
    const filmstrip = strip(
      stepWith([
        { id: 'h', type: 'heading', content: 'Welcome', props: {}, children: [] },
        { id: 'p', type: 'paragraph', content: 'Hello', props: {}, children: [] },
        { id: 'b', type: 'button', content: 'Go', props: {}, children: [] },
      ]),
    );
    expect(filmstrip.querySelectorAll('.overlay-filmstrip-step-line')).toHaveLength(2);
    expect(filmstrip.querySelector('.overlay-filmstrip-step-action')).not.toBeNull();
    expect(filmstrip.querySelector('.overlay-filmstrip-step-number')?.textContent).toBe('1');
    expect(filmstrip.querySelector('.overlay-filmstrip-step-title')?.textContent).toBe('Welcome');
  });

  it('shows the media a step carries, which is what a creator scans for', () => {
    const withMedia = strip(stepWith([{ id: 'm', type: 'media', props: {}, children: [] }]));
    expect(withMedia.querySelector('.overlay-filmstrip-step-media')).not.toBeNull();
    const withoutMedia = strip(
      stepWith([{ id: 'p', type: 'paragraph', content: 'Hi', props: {}, children: [] }]),
    );
    expect(withoutMedia.querySelector('.overlay-filmstrip-step-media')).toBeNull();
  });

  it('does not draw an empty tile for a step with nothing in it yet', () => {
    const filmstrip = strip(stepWith([]));
    expect(
      filmstrip.querySelectorAll('.overlay-filmstrip-step-line').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('leaves the thumbnail out of the accessible name, which already says it all', () => {
    const filmstrip = strip(
      stepWith([{ id: 'h', type: 'heading', content: 'Welcome', props: {}, children: [] }]),
    );
    expect(
      filmstrip.querySelector('.overlay-filmstrip-step-frame')?.getAttribute('aria-hidden'),
    ).toBe('true');
    // The state dot is colour; the word after the em dash is how a creator who
    // cannot see that colour still learns the step has no target yet (§4.5).
    expect(filmstrip.querySelector('.overlay-filmstrip-step')?.getAttribute('aria-label')).toBe(
      'Edit step 1: Welcome — Draft',
    );
  });
});

describe('the placement compass on a small target', () => {
  function compassFor(width: number, height: number): HTMLElement {
    const compass = createCompass(document);
    document.body.append(compass);
    syncCompass(
      compass,
      { left: 100, top: 100, width, height, right: 100 + width, bottom: 100 + height },
      true,
      { onPlace: () => undefined },
      { placement: 'top', align: 'center', offsetPx: 12 },
    );
    return compass;
  }

  const visible = (compass: HTMLElement, placement: string): string[] =>
    [...compass.querySelectorAll<HTMLElement>(`[data-placement="${placement}"]`)]
      .filter((dot) => !dot.hidden)
      .map((dot) => dot.dataset['align']!);

  it('offers start, centre and end on an edge long enough to tell them apart', () => {
    const compass = compassFor(240, 120);
    expect(visible(compass, 'top').sort()).toEqual(['center', 'end', 'start']);
    expect(visible(compass, 'right').sort()).toEqual(['center', 'end', 'start']);
  });

  it('offers only the centre where three dots would land on each other', () => {
    // A 30px-tall button cannot hold three 20px hit areas down its side.
    const compass = compassFor(240, 30);
    expect(visible(compass, 'right')).toEqual(['center']);
    expect(visible(compass, 'left')).toEqual(['center']);
    // Its width is still ample, so the top edge keeps all three.
    expect(visible(compass, 'top').sort()).toEqual(['center', 'end', 'start']);
  });

  it('hides them rather than stacking them, so keyboard cannot reach a pile', () => {
    const compass = compassFor(30, 30);
    const reachable = [...compass.querySelectorAll<HTMLElement>('[data-placement]')].filter(
      (dot) => !dot.hidden,
    );
    expect(reachable.every((dot) => dot.dataset['align'] === 'center')).toBe(true);
    expect(reachable).toHaveLength(4);
  });
});
