/**
 * The Brand Theme the hero tour is compiled with.
 *
 * This is Lodariq's own Brand System doing its job: the demo card doesn't use
 * the accessible fallback look, it uses a designed theme — graphite surface,
 * indigo action color, soft floating elevation — expressed purely as semantic
 * tokens. `contentHash` is recomputed through the compiler's own hasher, so
 * the compiled artifact passes the same immutability check every real
 * publication passes.
 */
import { computeBrandThemeContentHash } from '@lodariq/compiler';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1, type BrandThemeSnapshot } from '@lodariq/schema';

let themePromise: Promise<BrandThemeSnapshot> | null = null;

export function demoBrandTheme(): Promise<BrandThemeSnapshot> {
  themePromise ??= buildTheme();
  return themePromise;
}

async function buildTheme(): Promise<BrandThemeSnapshot> {
  const theme = structuredClone(
    LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  ) as unknown as BrandThemeSnapshot;

  theme.themeId = 'theme_lodariq_demo';
  theme.themeVersionId = 'themev_lodariq_demo_v1';
  theme.name = 'Lodariq demo · graphite & indigo';

  const tokens = theme.definition.tokens;
  tokens.modes.light.colors = {
    surface: '#181b23',
    surfaceRaised: '#14161c',
    surfaceInverse: '#f7faf9',
    text: '#f2f4f8',
    textMuted: '#9aa3b2',
    textInverse: '#14161c',
    border: '#2c313d',
    borderStrong: '#3a404e',
    accent: '#7c8cff',
    accentHover: '#96a3ff',
    onAccent: '#0b0d11',
    focus: '#7c8cff',
    success: '#3ecf8e',
    onSuccess: '#062b1c',
    warning: '#f5a524',
    onWarning: '#2b1c02',
    danger: '#f2555a',
    onDanger: '#2b0505',
    overlay: '#020617cc',
  };
  tokens.typography = {
    ...tokens.typography,
    fontFamilies: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
    baseSizePx: 15,
    smallSizePx: 13,
    headingWeight: 600,
    actionWeight: 600,
    bodyLineHeight: 1.55,
  };
  tokens.spacing = { xs: 4, sm: 8, md: 14, lg: 18, xl: 24 };
  tokens.radii = { sm: 8, md: 14, lg: 18, pill: 999 };
  tokens.motion = { fastMs: 120, normalMs: 200, slowMs: 260, easing: 'standard' };
  tokens.elevations = {
    resting: [{ xPx: 0, yPx: 1, blurPx: 3, spreadPx: 0, color: '#02061733' }],
    floating: [
      { xPx: 0, yPx: 24, blurPx: 48, spreadPx: -12, color: '#0206178c' },
      { xPx: 0, yPx: 2, blurPx: 8, spreadPx: 0, color: '#02061766' },
    ],
  };

  theme.contentHash = await computeBrandThemeContentHash(theme);
  return theme;
}
