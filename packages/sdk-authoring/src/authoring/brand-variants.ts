/**
 * One-click brand theme, the two-variant way (§7.1).
 *
 * Chameleon is the only product in the category that samples your UI and
 * generates a theme, and its framing is the good part: **two variants, one
 * blended into the product and one deliberately contrasting**. That turns an
 * unanswerable question ("what colours?") into a binary preference ("blend in or
 * stand out?"), with `Start plain` always available as an equal third option so a
 * near-miss of someone's brand is never the only outcome (§13).
 *
 * Everything here is pure: colour maths in, semantic tokens out. Per ADR-0013 the
 * output is **only** semantic tokens — never CSS text, selectors, class names,
 * stylesheet content, DOM snapshots, URLs or coordinates.
 *
 * Contrast is derived, not audited. Adobe Leonardo takes the target ratio as the
 * *input* and returns the colour; Material's HCT tone scale maps monotonically to
 * L*. Either way AA is guaranteed by construction rather than checked afterwards.
 */
import { CONTRAST_RATIO_TARGETS } from '@lodariq/schema';

/** Below this chroma a colour is a neutral, not a brand hue (§7.1). */
export const NEUTRAL_CHROMA_THRESHOLD = 0.03;
/** Hues within this many degrees are the same brand colour. */
export const HUE_BUCKET_DEGREES = 15;
/** Real design systems quantize their radii; snap to the ladder rather than average. */
export const RADIUS_SNAP = [0, 2, 4, 6, 8, 12, 16, 9999] as const;
/** At or above this, the intent was a pill, not a large corner. */
export const RADIUS_PILL_THRESHOLD_PX = 24;

export interface Oklch {
  /** 0…1 */
  readonly lightness: number;
  /** 0…~0.4 */
  readonly chroma: number;
  /** degrees, 0…360 */
  readonly hue: number;
}

/** One observed colour and how much of the screen it covered. */
export interface WeightedColor {
  readonly hex: string;
  /** Rendered pixel area. A 40px CTA must outrank 200 hairline borders (§7.1). */
  readonly area: number;
}

export interface BrandColorClusters {
  /** Highest-area chromatic cluster. */
  readonly primary?: string;
  /** Most hue-distant secondary cluster. */
  readonly accent?: string;
  /** Greyscale ramp, lightest first. */
  readonly neutrals: readonly string[];
}

// ── colour space ─────────────────────────────────────────────────────────────

export function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = normalizeHex(hex).map(linearize) as [number, number, number];
  const l = 0.412_221_47 * red + 0.536_332_54 * green + 0.051_445_99 * blue;
  const m = 0.211_903_5 * red + 0.680_699_55 * green + 0.107_396_96 * blue;
  const s = 0.088_302_46 * red + 0.281_718_84 * green + 0.629_978_5 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness = 0.210_454_26 * lRoot + 0.793_617_785 * mRoot - 0.004_072_047 * sRoot;
  const a = 1.977_998_495 * lRoot - 2.428_592_205 * mRoot + 0.450_593_71 * sRoot;
  const b = 0.025_904_037 * lRoot + 0.782_771_766 * mRoot - 0.808_675_766 * sRoot;
  const chroma = Math.hypot(a, b);
  const hue = chroma < 1e-6 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  return { lightness, chroma, hue: (hue + 360) % 360 };
}

export function oklchToHex({ lightness, chroma, hue }: Oklch): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.396_337_777_9 * a + 0.215_803_757_3 * b;
  const mRoot = lightness - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const sRoot = lightness - 0.089_484_177_5 * a - 1.291_485_548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const red = 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s;
  const green = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s;
  const blue = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s;
  return `#${[red, green, blue].map(toChannelHex).join('')}`;
}

function normalizeHex(hex: string): readonly number[] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value;
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
}

function linearize(channel: number): number {
  return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function delinearize(channel: number): number {
  return channel <= 0.003_130_8 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function toChannelHex(linear: number): string {
  const clamped = Math.min(1, Math.max(0, delinearize(linear)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

// ── clustering ───────────────────────────────────────────────────────────────

/**
 * Buckets observed colours in OKLCH: near-neutrals into a greyscale ramp, the
 * rest by hue, **weighted by area rather than occurrence count**.
 */
export function clusterBrandColors(colors: readonly WeightedColor[]): BrandColorClusters {
  const neutrals: { hex: string; lightness: number }[] = [];
  const buckets = new Map<number, { area: number; hue: number; hex: string }>();

  for (const color of colors) {
    const oklch = hexToOklch(color.hex);
    if (oklch.chroma < NEUTRAL_CHROMA_THRESHOLD) {
      neutrals.push({ hex: color.hex, lightness: oklch.lightness });
      continue;
    }
    const bucket = Math.round(oklch.hue / HUE_BUCKET_DEGREES);
    const existing = buckets.get(bucket);
    if (existing) {
      existing.area += color.area;
      if (color.area > 0 && color.area >= existing.area / 2) existing.hex = color.hex;
    } else {
      buckets.set(bucket, { area: color.area, hue: oklch.hue, hex: color.hex });
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => b.area - a.area);
  const primary = ranked[0];
  // The most hue-distant other cluster, so the accent actually reads as a change.
  const accent = primary
    ? ranked
        .slice(1)
        .sort((a, b) => hueDistance(b.hue, primary.hue) - hueDistance(a.hue, primary.hue))[0]
    : undefined;

  return {
    ...(primary ? { primary: primary.hex } : {}),
    ...(accent ? { accent: accent.hex } : {}),
    neutrals: [...new Set(neutrals.sort((a, b) => b.lightness - a.lightness).map((item) => item.hex))],
  };
}

function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

// ── geometry and rhythm ──────────────────────────────────────────────────────

/** The *mode* across buttons and cards, snapped — never the mean (§7.1). */
export function snapRadius(observed: readonly number[]): number {
  if (observed.length === 0) return 8;
  const counts = new Map<number, number>();
  for (const value of observed) {
    const snapped =
      value >= RADIUS_PILL_THRESHOLD_PX
        ? 9999
        : RADIUS_SNAP.reduce((best, candidate) =>
            Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
          );
    counts.set(snapped, (counts.get(snapped) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 8;
}

/** GCD over observed paddings, snapped to a 4px or 8px base (§7.1). */
export function detectSpacingBase(observed: readonly number[]): 4 | 8 {
  const positive = observed.filter((value) => value > 0).map((value) => Math.round(value));
  if (positive.length === 0) return 8;
  const divisor = positive.reduce((a, b) => greatestCommonDivisor(a, b));
  return divisor % 8 === 0 ? 8 : 4;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export interface ShadowShape {
  readonly offsetY: number;
  readonly blur: number;
  readonly color: string;
  readonly opacity?: number;
}

/** A tint is only visible above pure black; real product shadows sit here anyway. */
const SHADOW_MIN_LIGHTNESS = 0.2;

/**
 * Keeps the observed y-offset/blur ratio and re-tints the shadow toward the
 * primary hue at very low chroma. This is the detail that makes a generated theme
 * read as intentional rather than automatic (§7.1).
 */
export function retintShadow(shadow: ShadowShape, primaryHex: string | undefined): ShadowShape {
  if (!primaryHex) return shadow;
  const primary = hexToOklch(primaryHex);
  const existing = hexToOklch(shadow.color);
  return {
    ...shadow,
    color: oklchToHex({
      lightness: Math.max(SHADOW_MIN_LIGHTNESS, existing.lightness),
      chroma: Math.min(0.04, Math.max(0.01, existing.chroma)),
      hue: primary.hue,
    }),
    // Depth comes from alpha, so darkness is preserved even after the floor above.
    opacity: shadow.opacity ?? 0.12,
  };
}

// ── contrast-first derivation ────────────────────────────────────────────────

function relativeLuminance(hex: string): number {
  const [red, green, blue] = normalizeHex(hex).map(linearize) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * A foreground that meets `targetRatio` against `background` by construction,
 * carrying `hue` at low chroma so it still belongs to the palette.
 *
 * Both directions are searched, because a mid-lightness brand colour (a saturated
 * indigo CTA, say) often cannot reach AA by going darker at all — only lighter.
 * Guessing from the background's lightness alone silently returns a failing
 * colour, which is exactly the bug this function exists to prevent.
 */
export function contrastFirstForeground(
  background: string,
  targetRatio: number = CONTRAST_RATIO_TARGETS.text,
  hue = 0,
  chroma = 0.01,
): string {
  const darker = searchLightness(background, targetRatio, hue, chroma, true);
  const lighter = searchLightness(background, targetRatio, hue, chroma, false);
  const passing = [darker, lighter].filter((candidate) => candidate.ratio >= targetRatio);
  if (passing.length === 0) {
    // Nothing reaches the target: hand back the strongest available contrast.
    return (darker.ratio >= lighter.ratio ? darker : lighter).hex;
  }
  // Both directions work: prefer the gentler one, so text is not needlessly extreme.
  return passing.sort((a, b) => a.ratio - b.ratio)[0]!.hex;
}

/**
 * Binary search on OKLCH lightness toward the background. Contrast is monotonic
 * in lightness within one direction, so this converges on the *least* extreme
 * colour that passes rather than jumping to pure black or white.
 */
function searchLightness(
  background: string,
  targetRatio: number,
  hue: number,
  chroma: number,
  goDarker: boolean,
): { hex: string; ratio: number } {
  const backgroundLightness = hexToOklch(background).lightness;
  let low = goDarker ? 0 : backgroundLightness;
  let high = goDarker ? backgroundLightness : 1;

  const extreme = oklchToHex({ lightness: goDarker ? 0 : 1, chroma, hue });
  let best = { hex: extreme, ratio: contrastRatio(extreme, background) };
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    const hex = oklchToHex({ lightness: mid, chroma, hue });
    const ratio = contrastRatio(hex, background);
    if (ratio >= targetRatio) {
      best = { hex, ratio };
      if (goDarker) low = mid;
      else high = mid;
    } else if (goDarker) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
}

// ── variants ─────────────────────────────────────────────────────────────────

export interface SampledProductStyle {
  readonly colors: readonly WeightedColor[];
  readonly radii: readonly number[];
  readonly paddings: readonly number[];
  readonly shadow?: ShadowShape;
  /** First non-fallback family in each stack. */
  readonly headingFamily?: string;
  readonly bodyFamily?: string;
}

export interface BrandVariantTokens {
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly border: string;
  readonly radiusPx: number;
  readonly spacingBasePx: 4 | 8;
  readonly shadow?: ShadowShape;
  readonly headingFamily?: string;
  readonly bodyFamily?: string;
}

export interface BrandVariants {
  /** Melts into the product. */
  readonly blended: BrandVariantTokens;
  /** Deliberately stands out, while staying in the same palette. */
  readonly distinct: BrandVariantTokens;
}

const PLAIN_SURFACE = '#ffffff';
const PLAIN_ACCENT = '#4f46e5';

/**
 * The two variants. `Start plain` is not generated here — it is the untouched
 * default theme, and offering it as an equal third option is the mitigation for
 * "a theme that is 90% right is more irritating than one that is obviously
 * generic" (§13).
 */
export function generateBrandVariants(sample: SampledProductStyle): BrandVariants {
  const clusters = clusterBrandColors(sample.colors);
  const accent = clusters.primary ?? PLAIN_ACCENT;
  const accentHue = hexToOklch(accent).hue;
  const radiusPx = snapRadius(sample.radii);
  const spacingBasePx = detectSpacingBase(sample.paddings);
  const shadow = sample.shadow ? retintShadow(sample.shadow, clusters.primary) : undefined;
  const families = {
    ...(sample.headingFamily ? { headingFamily: sample.headingFamily } : {}),
    ...(sample.bodyFamily ? { bodyFamily: sample.bodyFamily } : {}),
  };

  const blendedSurface = clusters.neutrals[0] ?? PLAIN_SURFACE;
  const blended: BrandVariantTokens = {
    surface: blendedSurface,
    text: contrastFirstForeground(blendedSurface, CONTRAST_RATIO_TARGETS.text, accentHue),
    muted: contrastFirstForeground(blendedSurface, CONTRAST_RATIO_TARGETS.text, accentHue, 0.02),
    accent,
    onAccent: contrastFirstForeground(accent, CONTRAST_RATIO_TARGETS.text, accentHue),
    border: contrastFirstForeground(blendedSurface, CONTRAST_RATIO_TARGETS.focus, accentHue, 0.02),
    radiusPx,
    spacingBasePx,
    ...(shadow ? { shadow } : {}),
    ...families,
  };

  // Distinct flips the surface's polarity: the same palette, unmistakably Lodariq.
  const distinctSurface = oklchToHex({
    lightness: hexToOklch(blendedSurface).lightness > 0.5 ? 0.22 : 0.97,
    chroma: 0.02,
    hue: accentHue,
  });
  const distinct: BrandVariantTokens = {
    surface: distinctSurface,
    text: contrastFirstForeground(distinctSurface, CONTRAST_RATIO_TARGETS.text, accentHue),
    muted: contrastFirstForeground(distinctSurface, CONTRAST_RATIO_TARGETS.text, accentHue, 0.02),
    accent,
    onAccent: contrastFirstForeground(accent, CONTRAST_RATIO_TARGETS.text, accentHue),
    border: contrastFirstForeground(distinctSurface, CONTRAST_RATIO_TARGETS.focus, accentHue, 0.02),
    radiusPx,
    spacingBasePx,
    ...(shadow ? { shadow } : {}),
    ...families,
  };

  return { blended, distinct };
}

/** Both variants pass AA by construction; this is the assertion, not the mechanism. */
export function variantMeetsAa(tokens: BrandVariantTokens): boolean {
  return (
    contrastRatio(tokens.text, tokens.surface) >= CONTRAST_RATIO_TARGETS.text &&
    contrastRatio(tokens.muted, tokens.surface) >= CONTRAST_RATIO_TARGETS.text &&
    contrastRatio(tokens.onAccent, tokens.accent) >= CONTRAST_RATIO_TARGETS.text
  );
}
