// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTRAST_RATIO_TARGETS, evaluateContrast } from '@lodariq/schema';
import { brandThemeOffer } from '../../../../../packages/sdk-authoring/src/authoring/brand-theme-offer';
import { BrandVariantChoice } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/brand-variant-choice';
import { PropertyColorField } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/properties/property-controls';

const offer = () =>
  brandThemeOffer({
    schemaVersion: '1',
    proposalId: 'lodariq.ui.proposal',
    sources: [
      {
        sourceId: 'lodariq.ui.source',
        kind: 'selected_element',
        confidence: 88,
        fingerprintHash: `sha256-${'e'.repeat(64)}`,
        capturedAt: '2026-08-17T00:00:00.000Z',
      },
    ],
    samples: [
      {
        sampleId: 'lodariq.ui.cta',
        sourceId: 'lodariq.ui.source',
        kind: 'selected_element',
        confidence: 88,
        values: { backgroundColor: '#4f46e5', color: '#ffffff', radiusPx: 8, widthPx: 160 },
      },
      {
        sampleId: 'lodariq.ui.page',
        sourceId: 'lodariq.ui.source',
        kind: 'page_typography',
        confidence: 82,
        values: { backgroundColor: '#ffffff', color: '#101828', widthPx: 1_280 },
      },
    ],
    tokens: {},
    confidence: 88,
    requiresConfirmation: true,
    createdAt: '2026-08-17T00:00:00.000Z',
  });

describe('brand variant choice (§7.1)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('offers both variants as pressable options with the choice reflected', () => {
    const markup = renderToStaticMarkup(
      createElement(BrandVariantChoice, {
        chosen: 'blended',
        offer: offer(),
        onChoose: () => undefined,
      }),
    );
    expect(markup).toContain('data-brand-variant="blended"');
    expect(markup).toContain('data-brand-variant="distinct"');
    expect(markup).toContain('Blends in');
    expect(markup).toContain('Stands out');
    // Pressed state, not a colour, carries the selection for assistive tech.
    expect(markup).toMatch(/aria-pressed="true"[^>]*data-brand-variant="blended"/);
  });

  it('reports the chosen variant on click', async () => {
    const onChoose = vi.fn();
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    await act(async () => {
      root.render(
        createElement(BrandVariantChoice, { chosen: 'blended', offer: offer(), onChoose }),
      );
    });

    rootElement.querySelector<HTMLButtonElement>('[data-brand-variant="distinct"]')?.click();

    expect(onChoose).toHaveBeenCalledWith('distinct');
    await act(async () => root.unmount());
  });

  it('previews each variant with its own surface, so the two are visibly different', () => {
    const markup = renderToStaticMarkup(
      createElement(BrandVariantChoice, {
        chosen: null,
        offer: offer(),
        onChoose: () => undefined,
      }),
    );
    const surfaces = [
      ...markup.matchAll(/class="brand-variant-preview" style="background:([^;]+);/gu),
    ];
    expect(surfaces).toHaveLength(2);
    expect(surfaces[0]?.[1]).not.toBe(surfaces[1]?.[1]);
  });
});

describe('live contrast gate (§7.2)', () => {
  it('shows the WCAG verdict with APCA as a secondary readout', () => {
    const contrast = evaluateContrast(
      '#bbbbbb',
      '#ffffff',
      CONTRAST_RATIO_TARGETS.text,
      CONTRAST_RATIO_TARGETS.textUnusable,
    );
    const markup = renderToStaticMarkup(
      createElement(PropertyColorField, {
        apcaLc: -12.4,
        contrast,
        customized: true,
        label: 'Text',
        onChange: () => undefined,
        onReset: () => undefined,
        value: '#bbbbbb',
      }),
    );
    // WCAG is the gate…
    expect(markup).toContain('data-contrast-state="blocker"');
    // …and APCA rides along, magnitude only: polarity is not a creator's problem.
    expect(markup).toContain('APCA Lc 12');
    expect(markup).not.toContain('-12');
  });

  it('omits the APCA line when no value is supplied', () => {
    const markup = renderToStaticMarkup(
      createElement(PropertyColorField, {
        contrast: evaluateContrast('#111111', '#ffffff', 4.5, 3),
        customized: false,
        label: 'Text',
        onChange: () => undefined,
        onReset: () => undefined,
        value: '#111111',
      }),
    );
    expect(markup).toContain('data-contrast-state="pass"');
    expect(markup).not.toContain('APCA');
  });
});
