export const CONTRAST_RATIO_TARGETS = {
  text: 4.5,
  textUnusable: 3,
  focus: 3,
  focusUnusable: 2,
} as const;

export type ContrastEvaluationState = 'pass' | 'warning' | 'blocker';

export interface ContrastEvaluation {
  ratio: number;
  requiredRatio: number;
  state: ContrastEvaluationState;
}

/** DOM-free WCAG relative-luminance contrast shared by compiler and authoring. */
export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateContrast(
  foreground: string,
  background: string,
  targetRatio: number,
  unusableRatio: number,
): ContrastEvaluation {
  const ratio = roundContrastRatio(contrastRatio(foreground, background));
  if (ratio < unusableRatio) return { ratio, requiredRatio: unusableRatio, state: 'blocker' };
  if (ratio < targetRatio) return { ratio, requiredRatio: targetRatio, state: 'warning' };
  return { ratio, requiredRatio: targetRatio, state: 'pass' };
}

function relativeLuminance(color: string): number {
  const normalized = normalizeHexColor(color);
  const red = linearSrgbChannel(Number.parseInt(normalized.slice(1, 3), 16) / 255);
  const green = linearSrgbChannel(Number.parseInt(normalized.slice(3, 5), 16) / 255);
  const blue = linearSrgbChannel(Number.parseInt(normalized.slice(5, 7), 16) / 255);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function normalizeHexColor(color: string): string {
  if (/^#[0-9a-f]{6}$/iu.test(color)) return color;
  throw new Error('Contrast colors must be opaque six-digit hexadecimal values');
}

function linearSrgbChannel(channel: number): number {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function roundContrastRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * APCA lightness contrast, as a **secondary** readout beside WCAG 2.x (§7.2).
 *
 * WCAG 2.x stays the gate because it is what the accessibility contract commits
 * to. APCA is shown alongside it because it models perceived contrast far better
 * at the light-on-light and dark-on-dark extremes where WCAG is known to be
 * wrong — so a creator seeing both learns when a passing ratio still looks bad.
 *
 * Returns Lc, roughly -108…106. Sign carries polarity; magnitude is what matters:
 * Lc 75 ≈ body text, Lc 60 ≈ large text, Lc 45 ≈ non-text boundaries.
 */
export function apcaLightnessContrast(foreground: string, background: string): number {
  const textY = apcaLuminance(foreground);
  const backgroundY = apcaLuminance(background);
  const text = apcaClampLuminance(textY);
  const back = apcaClampLuminance(backgroundY);
  if (Math.abs(text - back) < 0.0005) return 0;
  // Normal polarity: dark text on a light background.
  if (back > text) {
    const contrast = (back ** 0.56 - text ** 0.57) * 1.14;
    return Math.abs(contrast) < 0.1 ? 0 : roundContrastRatio((contrast - 0.027) * 100);
  }
  const contrast = (back ** 0.65 - text ** 0.62) * 1.14;
  return Math.abs(contrast) < 0.1 ? 0 : roundContrastRatio((contrast + 0.027) * 100);
}

/** Lc thresholds APCA publishes for the uses Lodariq renders. */
export const APCA_TARGETS = {
  bodyText: 75,
  largeText: 60,
  nonText: 45,
} as const;

function apcaLuminance(color: string): number {
  const normalized = normalizeHexColor(color);
  const red = (Number.parseInt(normalized.slice(1, 3), 16) / 255) ** 2.4;
  const green = (Number.parseInt(normalized.slice(3, 5), 16) / 255) ** 2.4;
  const blue = (Number.parseInt(normalized.slice(5, 7), 16) / 255) ** 2.4;
  return red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
}

/** APCA's soft black clamp, which keeps very dark pairs from over-reporting. */
function apcaClampLuminance(luminance: number): number {
  return luminance > 0.022 ? luminance : luminance + (0.022 - luminance) ** 1.414;
}
