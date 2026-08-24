/**
 * Turns a sampled product-style proposal into the three things §7.1 offers a
 * creator: **Blended**, **Distinct**, and **Start plain**.
 *
 * The split of responsibility matters. `brand-variants` owns the colour maths and
 * knows nothing about the wire contract; this module owns the contract and knows
 * nothing about colour science. What crosses out of here is a
 * `CustomerBrandTokenValues` — semantic roles only, per ADR-0013.
 *
 * Acceptance writes tokens. Nothing here applies anything to a live artifact:
 * `requiresConfirmation` rides through from the proposal untouched.
 */
import { CONTRAST_RATIO_TARGETS, type CustomerBrandTokenValues, type ProductStyleProposal } from '@lodariq/schema';
import {
  contrastFirstForeground,
  generateBrandVariants,
  hexToOklch,
  oklchToHex,
  type BrandVariantTokens,
  type SampledProductStyle,
  type ShadowShape,
  type WeightedColor,
} from './brand-variants';

/** Sample widths are the only size signal on the wire; assume a control-sized box. */
const ASSUMED_SAMPLE_WIDTH_PX = 40;
/** `pill` is capped at 999 in the schema, and 999px rounds anything real. */
const PILL_RADIUS_PX = 999;
const MAX_TOKEN_RADIUS_PX = 32;

export type BrandVariantId = 'blended' | 'distinct';

export interface BrandVariantOffer {
  readonly id: BrandVariantId;
  /** For the preview swatches. */
  readonly preview: BrandVariantTokens;
  /** What acceptance persists. */
  readonly values: CustomerBrandTokenValues;
}

export interface BrandThemeOffer {
  readonly proposalId: string;
  readonly variants: readonly BrandVariantOffer[];
  readonly confidence: number;
  /**
   * True whenever the sampler was not confident, and the reason `Start plain` is
   * never hidden: a theme that is 90% right irritates more than one that is
   * obviously generic (§13).
   */
  readonly requiresConfirmation: boolean;
}

export function brandThemeOffer(proposal: ProductStyleProposal): BrandThemeOffer {
  const { blended, distinct } = generateBrandVariants(sampledStyleFromProposal(proposal));
  return {
    proposalId: proposal.proposalId,
    variants: [
      { id: 'blended', preview: blended, values: brandVariantTokenValues(blended) },
      { id: 'distinct', preview: distinct, values: brandVariantTokenValues(distinct) },
    ],
    confidence: proposal.confidence,
    requiresConfirmation: proposal.requiresConfirmation,
  };
}

/**
 * Flattens the proposal's per-element samples into the weighted observations the
 * clustering wants. Heights never cross the bridge, so weight is
 * `confidence × width` — a wide, confidently-sampled CTA outranks a hairline
 * border sampled from an ancestor guess.
 */
export function sampledStyleFromProposal(proposal: ProductStyleProposal): SampledProductStyle {
  const colors: WeightedColor[] = [];
  const radii: number[] = [];
  const paddings: number[] = [];
  let shadow: ShadowShape | undefined;
  let headingFamily: string | undefined;
  let bodyFamily: string | undefined;

  for (const sample of proposal.samples) {
    const { values } = sample;
    const weight = sample.confidence * (values.widthPx ?? ASSUMED_SAMPLE_WIDTH_PX);
    for (const color of [values.backgroundColor, values.color, values.borderColor]) {
      const opaque = opaqueHex(color);
      if (opaque) colors.push({ hex: opaque, area: weight });
    }
    if (values.radiusPx !== undefined) radii.push(values.radiusPx);
    if (values.paddingBlockPx !== undefined) paddings.push(values.paddingBlockPx);
    if (values.paddingInlinePx !== undefined) paddings.push(values.paddingInlinePx);

    const layer = values.shadow?.[0];
    if (layer && !shadow) {
      shadow = { offsetY: layer.yPx, blur: layer.blurPx, color: opaqueHex(layer.color) ?? '#101828' };
    }
    const family = values.fontFamilies?.[0];
    if (family) {
      if (sample.kind === 'page_typography') headingFamily ??= family;
      bodyFamily ??= family;
    }
  }

  return {
    colors,
    radii,
    paddings,
    ...(shadow ? { shadow } : {}),
    ...(headingFamily ? { headingFamily } : {}),
    ...(bodyFamily ? { bodyFamily } : {}),
  };
}

/** Drops any alpha channel: the maths works in opaque sRGB. */
function opaqueHex(color: string | undefined): string | undefined {
  return color ? color.slice(0, 7) : undefined;
}

/**
 * Expands the compact variant into the full semantic role set. Every derived role
 * is contrast-first for the surface it sits on, so the expansion cannot introduce
 * a failing pair that the variant itself avoided.
 */
export function brandVariantTokenValues(variant: BrandVariantTokens): CustomerBrandTokenValues {
  const surface = hexToOklch(variant.surface);
  const accentHue = hexToOklch(variant.accent).hue;
  const isLight = surface.lightness > 0.5;
  const surfaceRaised = oklchToHex({
    ...surface,
    lightness: clamp01(surface.lightness + (isLight ? -0.03 : 0.05)),
  });
  const surfaceInverse = oklchToHex({
    lightness: isLight ? 0.22 : 0.97,
    chroma: 0.02,
    hue: accentHue,
  });
  const spacing = variant.spacingBasePx;

  return {
    modes: {
      light: {
        colors: {
          surface: variant.surface,
          surfaceRaised,
          surfaceInverse,
          text: variant.text,
          textMuted: variant.muted,
          textInverse: contrastFirstForeground(
            surfaceInverse,
            CONTRAST_RATIO_TARGETS.text,
            accentHue,
          ),
          border: variant.border,
          borderStrong: contrastFirstForeground(
            variant.surface,
            CONTRAST_RATIO_TARGETS.text,
            accentHue,
            0.02,
          ),
          accent: variant.accent,
          accentHover: oklchToHex({
            ...hexToOklch(variant.accent),
            lightness: clamp01(hexToOklch(variant.accent).lightness + (isLight ? -0.06 : 0.06)),
          }),
          onAccent: variant.onAccent,
          focus: variant.accent,
        },
      },
    },
    typography: {
      ...(variant.bodyFamily || variant.headingFamily
        ? { fontFamilies: [...new Set([variant.bodyFamily, variant.headingFamily].filter(isFamily))] }
        : {}),
      baseSizePx: 16,
      bodyLineHeight: 1.5,
      bodyWeight: 400,
    },
    spacing: {
      xs: spacing / 2,
      sm: spacing,
      md: spacing * 2,
      lg: spacing * 3,
      xl: spacing * 4,
    },
    radii: {
      sm: Math.min(MAX_TOKEN_RADIUS_PX, Math.max(0, Math.round(variant.radiusPx / 2))),
      md: Math.min(MAX_TOKEN_RADIUS_PX, variant.radiusPx),
      lg: Math.min(MAX_TOKEN_RADIUS_PX, variant.radiusPx * 2),
      pill: PILL_RADIUS_PX,
    },
    ...(variant.shadow
      ? {
          elevations: {
            floating: [
              {
                xPx: 0,
                yPx: Math.round(variant.shadow.offsetY),
                blurPx: Math.round(variant.shadow.blur),
                spreadPx: 0,
                color: withAlpha(variant.shadow.color, variant.shadow.opacity ?? 0.12),
              },
            ],
          },
        }
      : {}),
  };
}

function isFamily(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(clamp01(opacity) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
