import { describe, expect, it } from 'vitest';
import {
  CONTRAST_RATIO_TARGETS,
  CustomerBrandTokenValues,
  validate,
  type ProductStyleProposal,
  type ProductStyleSample,
} from '@lodariq/schema';
import {
  brandThemeOffer,
  brandVariantTokenValues,
  sampledStyleFromProposal,
} from '../../../../../packages/sdk-authoring/src/authoring/brand-theme-offer';
import {
  contrastRatio,
  generateBrandVariants,
} from '../../../../../packages/sdk-authoring/src/authoring/brand-variants';

const sample = (over: Partial<ProductStyleSample> = {}): ProductStyleSample => ({
  sampleId: 'lodariq.sample.1',
  sourceId: 'lodariq.inferred.selected',
  kind: 'selected_element',
  confidence: 88,
  values: {},
  ...over,
});

const proposal = (samples: readonly ProductStyleSample[]): ProductStyleProposal => ({
  schemaVersion: '1',
  proposalId: 'lodariq.proposal.1',
  sources: [
    {
      sourceId: 'lodariq.inferred.selected',
      kind: 'selected_element',
      confidence: 88,
      fingerprintHash: `sha256-${'a'.repeat(64)}`,
      capturedAt: '2026-08-17T00:00:00.000Z',
    },
  ],
  samples: [...samples],
  tokens: {},
  confidence: 88,
  requiresConfirmation: true,
  createdAt: '2026-08-17T00:00:00.000Z',
});

const richProposal = (): ProductStyleProposal =>
  proposal([
    sample({
      sampleId: 'lodariq.sample.cta',
      values: {
        backgroundColor: '#4f46e5',
        color: '#ffffff',
        radiusPx: 8,
        paddingBlockPx: 8,
        paddingInlinePx: 16,
        widthPx: 160,
        shadow: [{ xPx: 0, yPx: 10, blurPx: 26, spreadPx: 0, color: '#0a0a0a20' }],
        fontFamilies: ['Inter'],
      },
    }),
    sample({
      sampleId: 'lodariq.sample.page',
      sourceId: 'lodariq.inferred.page',
      kind: 'page_typography',
      confidence: 82,
      values: {
        backgroundColor: '#ffffff',
        color: '#101828',
        fontFamilies: ['Inter'],
        widthPx: 1_280,
      },
    }),
  ]);

describe('sampled style from a proposal (§7.1)', () => {
  it('weights each observation by confidence × width', () => {
    const style = sampledStyleFromProposal(richProposal());
    const cta = style.colors.find((color) => color.hex === '#4f46e5');
    expect(cta?.area).toBe(88 * 160);
    // The page background is the same white as the CTA's label, so both weights
    // are present; the wide page sample is the heavier of the two.
    const whites = style.colors.filter((color) => color.hex === '#ffffff').map((c) => c.area);
    expect(whites).toEqual([88 * 160, 82 * 1_280]);
  });

  it('drops the alpha channel so the maths runs in opaque sRGB', () => {
    const style = sampledStyleFromProposal(richProposal());
    expect(style.shadow?.color).toBe('#0a0a0a');
    for (const color of style.colors) expect(color.hex).toHaveLength(7);
  });

  it('takes the heading family from page typography and keeps the geometry', () => {
    const style = sampledStyleFromProposal(richProposal());
    expect(style.headingFamily).toBe('Inter');
    expect(style.radii).toEqual([8]);
    expect(style.paddings).toEqual([8, 16]);
  });

  it('survives a proposal that sampled nothing usable', () => {
    const style = sampledStyleFromProposal(proposal([sample()]));
    expect(style.colors).toEqual([]);
    expect(style.shadow).toBeUndefined();
    // …and still yields an offer rather than throwing.
    expect(brandThemeOffer(proposal([sample()])).variants).toHaveLength(2);
  });
});

describe('the offer (§7.1)', () => {
  it('offers exactly two generated variants, blended first', () => {
    const offer = brandThemeOffer(richProposal());
    expect(offer.variants.map((variant) => variant.id)).toEqual(['blended', 'distinct']);
    expect(offer.proposalId).toBe('lodariq.proposal.1');
  });

  it('passes the sampler’s confirmation requirement through untouched', () => {
    const offer = brandThemeOffer(richProposal());
    expect(offer.requiresConfirmation).toBe(true);
    expect(offer.confidence).toBe(88);
  });
});

describe('acceptance payload (ADR-0013)', () => {
  const variantValues = () => brandThemeOffer(richProposal()).variants.map((v) => v.values);

  it('validates against the customer brand token contract', () => {
    for (const values of variantValues()) {
      const result = validate(CustomerBrandTokenValues, values);
      // Name the offending role rather than reporting a bare `false`.
      expect(result.valid ? [] : result.errors).toEqual([]);
    }
  });

  it('expands into semantic roles without introducing a failing pair', () => {
    for (const values of variantValues()) {
      const colors = values.modes?.light?.colors;
      if (!colors?.surface || !colors.surfaceInverse) throw new Error('expected surfaces');
      for (const [foreground, background] of [
        [colors.text, colors.surface],
        [colors.textMuted, colors.surface],
        [colors.textInverse, colors.surfaceInverse],
        [colors.onAccent, colors.accent],
      ] as const) {
        expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(
          CONTRAST_RATIO_TARGETS.text,
        );
      }
    }
  });

  it('derives the spacing scale from the detected base', () => {
    const values = brandVariantTokenValues(
      generateBrandVariants({ colors: [], radii: [], paddings: [4, 12] }).blended,
    );
    expect(values.spacing).toEqual({ xs: 2, sm: 4, md: 8, lg: 12, xl: 16 });
  });

  it('clamps a pill radius into the token domain rather than emitting 9999', () => {
    const values = brandVariantTokenValues(
      generateBrandVariants({ colors: [], radii: [40, 40], paddings: [] }).blended,
    );
    expect(values.radii?.md).toBeLessThanOrEqual(32);
    expect(values.radii?.pill).toBe(999);
    expect(validate(CustomerBrandTokenValues, values).valid).toBe(true);
  });

  it('carries elevation as an alpha-blended layer, keeping the sampled shape', () => {
    const layer = variantValues()[0]?.elevations?.floating?.[0];
    expect(layer?.yPx).toBe(10);
    expect(layer?.blurPx).toBe(26);
    expect(layer?.color).toMatch(/^#[0-9a-f]{8}$/u);
  });
});
