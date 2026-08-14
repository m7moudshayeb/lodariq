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
