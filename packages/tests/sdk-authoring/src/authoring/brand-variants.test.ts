import { describe, expect, it } from 'vitest';
import { CONTRAST_RATIO_TARGETS } from '@lodariq/schema';
import {
  clusterBrandColors,
  contrastFirstForeground,
  contrastRatio,
  detectSpacingBase,
  generateBrandVariants,
  hexToOklch,
  NEUTRAL_CHROMA_THRESHOLD,
  oklchToHex,
  retintShadow,
  snapRadius,
  variantMeetsAa,
  type SampledProductStyle,
} from '../../../../../packages/sdk-authoring/src/authoring/brand-variants';

describe('OKLCH round trip', () => {
  it('survives a round trip within a channel step', () => {
    for (const hex of ['#000000', '#ffffff', '#4f46e5', '#3ecf8e', '#f2555a', '#767676']) {
      const round = oklchToHex(hexToOklch(hex));
      expect(round.toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it('reports greys as near-zero chroma and hues as chromatic', () => {
    expect(hexToOklch('#808080').chroma).toBeLessThan(NEUTRAL_CHROMA_THRESHOLD);
    expect(hexToOklch('#4f46e5').chroma).toBeGreaterThan(NEUTRAL_CHROMA_THRESHOLD);
  });
});

describe('brand colour clustering (§7.1)', () => {
  it('weights by rendered area, so a CTA outranks a wall of hairlines', () => {
    const clusters = clusterBrandColors([
      // One large indigo CTA…
      { hex: '#4f46e5', area: 40 * 120 },
      // …against many tiny teal borders.
      ...Array.from({ length: 200 }, () => ({ hex: '#0f9b6c', area: 1 })),
    ]);
    expect(clusters.primary).toBe('#4f46e5');
  });

  it('splits near-neutrals into a greyscale ramp, lightest first', () => {
    const clusters = clusterBrandColors([
      { hex: '#111111', area: 10 },
      { hex: '#ffffff', area: 100 },
      { hex: '#888888', area: 20 },
      { hex: '#4f46e5', area: 50 },
    ]);
    expect(clusters.neutrals[0]).toBe('#ffffff');
    expect(clusters.neutrals).toContain('#111111');
    expect(clusters.neutrals).not.toContain('#4f46e5');
  });

  it('picks the most hue-distant cluster as the accent', () => {
    const clusters = clusterBrandColors([
      { hex: '#4f46e5', area: 500 },
      // Nearly the same hue as the primary — a poor accent.
      { hex: '#6d5bf5', area: 100 },
      // Far away — the right one.
      { hex: '#e5a24f', area: 90 },
    ]);
    expect(clusters.primary).toBe('#4f46e5');
    expect(clusters.accent).toBe('#e5a24f');
  });

  it('reports nothing rather than guessing when nothing chromatic was sampled', () => {
    const clusters = clusterBrandColors([{ hex: '#ffffff', area: 10 }]);
    expect(clusters.primary).toBeUndefined();
    expect(clusters.accent).toBeUndefined();
  });
});

describe('geometry and rhythm (§7.1)', () => {
  it('takes the mode of the radii, not the mean', () => {
    // A mean would land near 7; the system is clearly on 8.
    expect(snapRadius([8, 8, 8, 8, 0])).toBe(8);
    expect(snapRadius([])).toBe(8);
  });

  it('snaps radii to the ladder', () => {
    expect(snapRadius([11.4, 12.2, 13])).toBe(12);
    expect(snapRadius([999, 9_999])).toBe(9999);
  });

  it('detects the spacing base by GCD', () => {
    expect(detectSpacingBase([8, 16, 24, 32])).toBe(8);
    expect(detectSpacingBase([4, 12, 20])).toBe(4);
    expect(detectSpacingBase([])).toBe(8);
  });

  it('keeps the shadow’s shape and only re-tints its colour', () => {
    const retinted = retintShadow({ offsetY: 12, blur: 32, color: '#000000' }, '#4f46e5');
    expect(retinted.offsetY).toBe(12);
    expect(retinted.blur).toBe(32);
    expect(retinted.color).not.toBe('#000000');
    // Tinted toward the brand hue, but barely — a shadow, not a colour wash.
    expect(hexToOklch(retinted.color).chroma).toBeLessThanOrEqual(0.04);
  });

  it('leaves the shadow alone when nothing chromatic was sampled', () => {
    const shadow = { offsetY: 8, blur: 20, color: '#000000' };
    expect(retintShadow(shadow, undefined)).toEqual(shadow);
  });
});

describe('contrast-first derivation (§7.1)', () => {
  it('returns a colour that meets the target ratio by construction', () => {
    for (const background of ['#ffffff', '#f5f6f8', '#101828', '#4f46e5']) {
      const foreground = contrastFirstForeground(background, CONTRAST_RATIO_TARGETS.text);
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
        CONTRAST_RATIO_TARGETS.text,
      );
    }
  });

  it('returns the least extreme colour that passes, not pure black', () => {
    const foreground = contrastFirstForeground('#ffffff', CONTRAST_RATIO_TARGETS.text);
    expect(foreground).not.toBe('#000000');
    expect(hexToOklch(foreground).lightness).toBeGreaterThan(0.2);
  });

  it('meets a higher target with a stronger colour', () => {
    const aa = hexToOklch(contrastFirstForeground('#ffffff', 4.5)).lightness;
    const aaa = hexToOklch(contrastFirstForeground('#ffffff', 7)).lightness;
    expect(aaa).toBeLessThan(aa);
  });
});

describe('two brand variants (§7.1)', () => {
  const sample: SampledProductStyle = {
    colors: [
      { hex: '#ffffff', area: 100_000 },
      { hex: '#101828', area: 4_000 },
      { hex: '#4f46e5', area: 6_000 },
    ],
    radii: [8, 8, 8],
    paddings: [8, 16, 24],
    shadow: { offsetY: 10, blur: 26, color: '#0a0a0a' },
    headingFamily: 'Inter',
    bodyFamily: 'Inter',
  };

  it('produces one variant that blends and one that stands out', () => {
    const { blended, distinct } = generateBrandVariants(sample);
    expect(blended.surface).toBe('#ffffff');
    // Distinct flips the surface polarity rather than inventing a new palette.
    expect(hexToOklch(distinct.surface).lightness).toBeLessThan(0.5);
    expect(distinct.accent).toBe(blended.accent);
  });

  it('guarantees AA on both, by construction', () => {
    const { blended, distinct } = generateBrandVariants(sample);
    expect(variantMeetsAa(blended)).toBe(true);
    expect(variantMeetsAa(distinct)).toBe(true);
  });

  it('carries the sampled geometry and type into both', () => {
    const { blended, distinct } = generateBrandVariants(sample);
    for (const variant of [blended, distinct]) {
      expect(variant.radiusPx).toBe(8);
      expect(variant.spacingBasePx).toBe(8);
      expect(variant.bodyFamily).toBe('Inter');
      expect(variant.shadow?.offsetY).toBe(10);
    }
  });

  it('emits semantic tokens only — never CSS, selectors or coordinates (ADR-0013)', () => {
    const { blended } = generateBrandVariants(sample);
    const serialized = JSON.stringify(blended);
    for (const term of ['class', 'selector', 'px solid', 'http', '<', 'querySelector']) {
      expect(serialized).not.toContain(term);
    }
    // Only named token roles, nothing raw.
    expect(Object.keys(blended).sort()).toEqual([
      'accent',
      'bodyFamily',
      'border',
      'headingFamily',
      'muted',
      'onAccent',
      'radiusPx',
      'shadow',
      'spacingBasePx',
      'surface',
      'text',
    ]);
  });

  it('still produces a usable pair when the product is entirely greyscale', () => {
    const { blended, distinct } = generateBrandVariants({
      colors: [
        { hex: '#ffffff', area: 1_000 },
        { hex: '#333333', area: 100 },
      ],
      radii: [],
      paddings: [],
    });
    expect(variantMeetsAa(blended)).toBe(true);
    expect(variantMeetsAa(distinct)).toBe(true);
  });
});
