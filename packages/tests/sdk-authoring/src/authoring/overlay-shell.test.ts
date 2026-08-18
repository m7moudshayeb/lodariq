// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { eventInsideOverlayChrome } from '../../../../../packages/sdk-authoring/src/authoring/overlay/click-outside';
import { applyOverlayGeometry, chooseOverlayToolbarSide, OVERLAY_CHROME_PAD_PX, OVERLAY_HANDLE_GUTTER_PX, OVERLAY_TOOLBAR_BAND_PX } from '../../../../../packages/sdk-authoring/src/authoring/overlay/geometry';
import { createCompass, syncCompass } from '../../../../../packages/sdk-authoring/src/authoring/overlay/compass';
import { syncPulses } from '../../../../../packages/sdk-authoring/src/authoring/overlay/pulses';
import { snapPlacement } from '../../../../../packages/sdk-authoring/src/authoring/canvas/edge-resize';

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
    expect(iframe.style.width).toBe(`${320 + OVERLAY_CHROME_PAD_PX * 2 + OVERLAY_HANDLE_GUTTER_PX}px`);
    expect(iframe.style.height).toBe(`${180 + OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX * 2}px`);
    expect(iframe.style.top).toBe(`${200 - OVERLAY_TOOLBAR_BAND_PX - OVERLAY_CHROME_PAD_PX}px`);
    expect(iframe.style.left).toBe(`${120 - OVERLAY_CHROME_PAD_PX - OVERLAY_HANDLE_GUTTER_PX}px`);
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
    expect(iframe.style.height).toBe(`${400 + OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX * 2}px`);
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

  it('marks the current compass placement instead of hiding it', () => {
    const compass = createCompass(document);
    document.body.append(compass);
    syncCompass(
      compass,
      { left: 10, top: 10, width: 80, height: 40, right: 90, bottom: 50 },
      true,
      () => undefined,
      () => undefined,
      'bottom',
    );
    const current = compass.querySelector<HTMLButtonElement>('[data-placement="bottom"]');
    const other = compass.querySelector<HTMLButtonElement>('[data-placement="top"]');
    expect(current?.hidden).toBe(false);
    expect(current?.getAttribute('aria-pressed')).toBe('true');
    expect(other?.hidden).toBe(false);
    expect(other?.getAttribute('aria-pressed')).toBe('false');
    expect(compass.querySelector('[data-retarget]')?.getAttribute('aria-label')).toBe(
      'Change target',
    );
    compass.remove();
  });
});
