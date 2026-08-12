import { BRAND_THEME_CONTRACT_VERSION, BRAND_THEME_SCHEMA_VERSION } from './version';

export const EXPERIENCE_APPEARANCE_PRESETS = [
  'default',
  'accent',
  'inverse',
  'success',
  'warning',
  'minimal',
] as const;
export const EXPERIENCE_APPEARANCE_DENSITIES = ['comfortable', 'compact'] as const;
export const EXPERIENCE_APPEARANCE_WIDTHS = ['narrow', 'standard', 'wide'] as const;
export const EXPERIENCE_COLOR_MODES = ['light', 'dark', 'system'] as const;

type AppearancePreset = (typeof EXPERIENCE_APPEARANCE_PRESETS)[number];
type ThemeColorRole = Exclude<keyof RuntimeThemeColors, 'overlay'>;

export interface RuntimeExperienceAppearance {
  preset: AppearancePreset;
  density: (typeof EXPERIENCE_APPEARANCE_DENSITIES)[number];
  width: (typeof EXPERIENCE_APPEARANCE_WIDTHS)[number];
  colorMode: (typeof EXPERIENCE_COLOR_MODES)[number];
  displayTargetOutline: boolean;
}

interface RuntimeThemeColors {
  surface: string;
  surfaceRaised: string;
  surfaceInverse: string;
  text: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  focus: string;
  success: string;
  onSuccess: string;
  warning: string;
  onWarning: string;
  danger: string;
  onDanger: string;
  overlay: string;
}

interface RuntimeTourRecipe {
  surfaceRole: ThemeColorRole;
  textRole: ThemeColorRole;
  mutedTextRole: ThemeColorRole;
  borderRole: ThemeColorRole;
  borderStyle: (typeof RECIPE_BORDER_STYLES)[number];
  primarySurfaceRole: ThemeColorRole;
  primaryTextRole: ThemeColorRole;
  secondarySurfaceRole: ThemeColorRole;
  secondaryTextRole: ThemeColorRole;
  focusRole: ThemeColorRole;
  radiusRole: (typeof RECIPE_RADIUS_ROLES)[number];
  spacingRole: (typeof RECIPE_SPACING_ROLES)[number];
  elevationRole: (typeof RECIPE_ELEVATION_ROLES)[number];
  widthRole: (typeof RECIPE_WIDTH_ROLES)[number];
}

interface RuntimeShadowLayer {
  xPx: number;
  yPx: number;
  blurPx: number;
  spreadPx: number;
  color: string;
}

interface RuntimeBrandThemeSnapshot {
  schemaVersion: typeof BRAND_THEME_SCHEMA_VERSION;
  contractVersion: typeof BRAND_THEME_CONTRACT_VERSION;
  themeId: string;
  themeVersionId: string;
  version: number;
  name: string;
  contentHash: string;
  definition: {
    tokens: {
      modes: { light: { colors: RuntimeThemeColors }; dark?: { colors: RuntimeThemeColors } };
      typography: {
        fontFamilies: string[];
        baseSizePx: number;
        smallSizePx: number;
        bodyLineHeight: number;
        headingLineHeight: number;
        bodyWeight: 400 | 500;
        headingWeight: 500 | 600 | 700;
        actionWeight: 500 | 600 | 700;
      };
      spacing: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>;
      radii: Record<'sm' | 'md' | 'lg' | 'pill', number>;
      borders: { defaultWidthPx: number; strongWidthPx: number };
      sizing: Record<(typeof RECIPE_WIDTH_ROLES)[number], number>;
      motion: {
        fastMs: number;
        normalMs: number;
        slowMs: number;
        easing: (typeof MOTION_EASINGS)[number];
      };
      elevations: { resting: RuntimeShadowLayer[]; floating: RuntimeShadowLayer[] };
    };
    recipes: { tour: Record<AppearancePreset, RuntimeTourRecipe> };
  };
}

const OPAQUE_SRGB_PATTERN = /^#[0-9a-f]{6}$/;
const SRGB_WITH_OPTIONAL_ALPHA_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/;
const SAFE_FONT_FAMILY_PATTERN = /^(?!.*(?:url\(|https?:\/\/|data:|var\(|[;{}])).+$/i;
const MOTION_EASINGS = ['standard', 'decelerate', 'accelerate'] as const;
const RECIPE_BORDER_STYLES = ['none', 'subtle', 'strong'] as const;
const RECIPE_RADIUS_ROLES = ['sm', 'md', 'lg', 'pill'] as const;
const RECIPE_SPACING_ROLES = ['sm', 'md', 'lg'] as const;
const RECIPE_ELEVATION_ROLES = ['none', 'resting', 'floating'] as const;
const RECIPE_WIDTH_ROLES = ['tourNarrowPx', 'tourStandardPx', 'tourWidePx'] as const;
const RECIPE_COLOR_ROLE_FIELDS = [
  'surfaceRole',
  'textRole',
  'mutedTextRole',
  'borderRole',
  'primarySurfaceRole',
  'primaryTextRole',
  'secondarySurfaceRole',
  'secondaryTextRole',
  'focusRole',
] as const;

/** The single default used by authoring, compilation, and browser playback. */
export const DEFAULT_EXPERIENCE_APPEARANCE: RuntimeExperienceAppearance = deepFreeze({
  preset: 'default',
  density: 'comfortable',
  width: 'standard',
  colorMode: 'system',
  displayTargetOutline: true,
});

const DEFAULT_RECIPE: RuntimeTourRecipe = {
  surfaceRole: 'surfaceRaised',
  textRole: 'text',
  mutedTextRole: 'textMuted',
  borderRole: 'border',
  borderStyle: 'subtle',
  primarySurfaceRole: 'accent',
  primaryTextRole: 'onAccent',
  secondarySurfaceRole: 'surface',
  secondaryTextRole: 'text',
  focusRole: 'focus',
  radiusRole: 'md',
  spacingRole: 'md',
  elevationRole: 'floating',
  widthRole: 'tourStandardPx',
};

/**
 * Safe, versioned theme used when a legacy document has no approved workspace
 * theme. Its hash covers every field except `contentHash` itself.
 */
export const LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1: RuntimeBrandThemeSnapshot = deepFreeze({
  schemaVersion: BRAND_THEME_SCHEMA_VERSION,
  contractVersion: BRAND_THEME_CONTRACT_VERSION,
  themeId: 'theme_lodariq_accessible',
  themeVersionId: 'themev_lodariq_accessible_v1',
  version: 1,
  name: 'Lodariq accessible fallback',
  contentHash: 'sha256-89ce89608f3ad13e2d4ebff9bec31450fe976a945bf02c069c44d7c7e2402155',
  definition: {
    tokens: {
      modes: {
        light: {
          colors: {
            surface: '#ffffff',
            surfaceRaised: '#ffffff',
            surfaceInverse: '#172033',
            text: '#172033',
            textMuted: '#5d6678',
            textInverse: '#ffffff',
            border: '#d7dce5',
            borderStrong: '#aab3c2',
            accent: '#2457ff',
            accentHover: '#1946dd',
            onAccent: '#ffffff',
            focus: '#0b63ce',
            success: '#157f3b',
            onSuccess: '#ffffff',
            warning: '#9a5b00',
            onWarning: '#ffffff',
            danger: '#b42318',
            onDanger: '#ffffff',
            overlay: '#101828b3',
          },
        },
        dark: {
          colors: {
            surface: '#111827',
            surfaceRaised: '#1f2937',
            surfaceInverse: '#ffffff',
            text: '#f9fafb',
            textMuted: '#cbd5e1',
            textInverse: '#172033',
            border: '#475569',
            borderStrong: '#64748b',
            accent: '#7da2ff',
            accentHover: '#a8bdff',
            onAccent: '#0b1533',
            focus: '#93c5fd',
            success: '#4ade80',
            onSuccess: '#052e16',
            warning: '#fbbf24',
            onWarning: '#422006',
            danger: '#f87171',
            onDanger: '#450a0a',
            overlay: '#020617cc',
          },
        },
      },
      typography: {
        fontFamilies: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        baseSizePx: 16,
        smallSizePx: 14,
        bodyLineHeight: 1.5,
        headingLineHeight: 1.25,
        bodyWeight: 400,
        headingWeight: 600,
        actionWeight: 600,
      },
      spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
      radii: { sm: 6, md: 10, lg: 16, pill: 999 },
      borders: { defaultWidthPx: 1, strongWidthPx: 2 },
      sizing: { tourNarrowPx: 280, tourStandardPx: 360, tourWidePx: 480 },
      motion: { fastMs: 120, normalMs: 180, slowMs: 260, easing: 'standard' },
      elevations: {
        resting: [{ xPx: 0, yPx: 1, blurPx: 2, spreadPx: 0, color: '#1018281a' }],
        floating: [{ xPx: 0, yPx: 8, blurPx: 24, spreadPx: 0, color: '#1018282e' }],
      },
    },
    recipes: {
      tour: {
        default: DEFAULT_RECIPE,
        accent: {
          ...DEFAULT_RECIPE,
          surfaceRole: 'accent',
          textRole: 'onAccent',
          mutedTextRole: 'onAccent',
          borderRole: 'accentHover',
          primarySurfaceRole: 'surfaceInverse',
          primaryTextRole: 'textInverse',
          secondarySurfaceRole: 'accentHover',
          secondaryTextRole: 'onAccent',
        },
        inverse: {
          ...DEFAULT_RECIPE,
          surfaceRole: 'surfaceInverse',
          textRole: 'textInverse',
          mutedTextRole: 'textInverse',
          borderRole: 'borderStrong',
        },
        success: {
          ...DEFAULT_RECIPE,
          primarySurfaceRole: 'success',
          primaryTextRole: 'onSuccess',
        },
        warning: {
          ...DEFAULT_RECIPE,
          primarySurfaceRole: 'warning',
          primaryTextRole: 'onWarning',
        },
        minimal: {
          ...DEFAULT_RECIPE,
          surfaceRole: 'surface',
          borderStyle: 'none',
          elevationRole: 'none',
        },
      },
    },
  },
});

/**
 * Browser-only guard for the appearance fields dereferenced by a renderer.
 * Canonical document validation remains the TypeBox schema in `brand.ts`.
 */
export function hasRenderableExperienceAppearance(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isOneOf(value['preset'], EXPERIENCE_APPEARANCE_PRESETS) &&
    isOneOf(value['density'], EXPERIENCE_APPEARANCE_DENSITIES) &&
    isOneOf(value['width'], EXPERIENCE_APPEARANCE_WIDTHS) &&
    isOneOf(value['colorMode'], EXPERIENCE_COLOR_MODES) &&
    (value['displayTargetOutline'] === undefined ||
      typeof value['displayTargetOutline'] === 'boolean')
  );
}

/**
 * Normalizes legacy appearance objects to the complete renderer contract.
 * Invalid objects fall back as one unit; a missing additive field receives its
 * explicit safe default.
 */
export function resolveExperienceAppearance(value: unknown): RuntimeExperienceAppearance {
  if (!hasRenderableExperienceAppearance(value) || !isRecord(value)) {
    return { ...DEFAULT_EXPERIENCE_APPEARANCE };
  }
  return {
    preset: value['preset'] as RuntimeExperienceAppearance['preset'],
    density: value['density'] as RuntimeExperienceAppearance['density'],
    width: value['width'] as RuntimeExperienceAppearance['width'],
    colorMode: value['colorMode'] as RuntimeExperienceAppearance['colorMode'],
    displayTargetOutline: value['displayTargetOutline'] !== false,
  };
}

/**
 * Checks the bounded semantic values the Tour renderer consumes without
 * shipping TypeBox to customer pages. Publication still performs full schema,
 * identity, and content-hash validation before an artifact becomes active.
 */
export function hasRenderableBrandThemeSnapshot(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value['schemaVersion'] !== BRAND_THEME_SCHEMA_VERSION ||
    value['contractVersion'] !== BRAND_THEME_CONTRACT_VERSION ||
    !isRecord(value['definition'])
  ) {
    return false;
  }

  const tokens = value['definition']['tokens'];
  const recipes = value['definition']['recipes'];
  if (!hasRenderableThemeTokens(tokens) || !isRecord(recipes) || !isRecord(recipes['tour'])) {
    return false;
  }
  const tourRecipes = recipes['tour'];

  return EXPERIENCE_APPEARANCE_PRESETS.every((preset) =>
    hasRenderableTourRecipe(tourRecipes[preset], tokens),
  );
}

function hasRenderableThemeTokens(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const modes = value['modes'];
  const typography = value['typography'];
  const spacing = value['spacing'];
  const radii = value['radii'];
  const borders = value['borders'];
  const sizing = value['sizing'];
  const motion = value['motion'];
  const elevations = value['elevations'];

  return (
    hasRenderableModes(modes) &&
    isRecord(typography) &&
    isSafeFontFamilies(typography['fontFamilies']) &&
    isIntegerBetween(typography['baseSizePx'], 12, 20) &&
    isIntegerBetween(typography['smallSizePx'], 10, 18) &&
    isNumberBetween(typography['bodyLineHeight'], 1.2, 2) &&
    isNumberBetween(typography['headingLineHeight'], 1, 1.6) &&
    isIntegerBetween(typography['headingWeight'], 500, 700) &&
    isIntegerBetween(typography['actionWeight'], 500, 700) &&
    isRecord(spacing) &&
    RECIPE_SPACING_ROLES.every((role) => isIntegerBetween(spacing[role], 0, 64)) &&
    isRecord(radii) &&
    RECIPE_RADIUS_ROLES.every((role) => isIntegerBetween(radii[role], 0, 999)) &&
    isRecord(borders) &&
    isIntegerBetween(borders['defaultWidthPx'], 0, 4) &&
    isIntegerBetween(borders['strongWidthPx'], 1, 6) &&
    isRecord(sizing) &&
    isIntegerBetween(sizing['tourNarrowPx'], 220, 360) &&
    isIntegerBetween(sizing['tourStandardPx'], 280, 480) &&
    isIntegerBetween(sizing['tourWidePx'], 360, 640) &&
    isRecord(motion) &&
    isIntegerBetween(motion['normalMs'], 0, 1_000) &&
    isOneOf(motion['easing'], MOTION_EASINGS) &&
    isRecord(elevations) &&
    isShadowLayers(elevations['resting']) &&
    isShadowLayers(elevations['floating'])
  );
}

function hasRenderableModes(value: unknown): boolean {
  if (!isRecord(value) || !hasColorRecord(value['light'])) return false;
  return value['dark'] === undefined || hasColorRecord(value['dark']);
}

function hasColorRecord(value: unknown): boolean {
  return isRecord(value) && isRecord(value['colors']);
}

function hasRenderableTourRecipe(value: unknown, tokens: Record<string, unknown>): boolean {
  if (!isRecord(value)) return false;
  const colorRolesValid = RECIPE_COLOR_ROLE_FIELDS.every((field) =>
    hasSafeRecipeColor(tokens['modes'], value[field]),
  );
  return (
    colorRolesValid &&
    isOneOf(value['borderStyle'], RECIPE_BORDER_STYLES) &&
    isOneOf(value['radiusRole'], RECIPE_RADIUS_ROLES) &&
    isOneOf(value['spacingRole'], RECIPE_SPACING_ROLES) &&
    isOneOf(value['elevationRole'], RECIPE_ELEVATION_ROLES) &&
    isOneOf(value['widthRole'], RECIPE_WIDTH_ROLES)
  );
}

function hasSafeRecipeColor(modes: unknown, role: unknown): boolean {
  if (!isRecord(modes) || typeof role !== 'string') return false;
  const light = modes['light'];
  const dark = modes['dark'];
  return hasSafeColor(light, role) && (dark === undefined || hasSafeColor(dark, role));
}

function hasSafeColor(mode: unknown, role: string): boolean {
  return (
    isRecord(mode) &&
    isRecord(mode['colors']) &&
    typeof mode['colors'][role] === 'string' &&
    OPAQUE_SRGB_PATTERN.test(mode['colors'][role])
  );
}

function isSafeFontFamilies(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    value.every(
      (family) =>
        typeof family === 'string' &&
        family.length >= 1 &&
        family.length <= 80 &&
        SAFE_FONT_FAMILY_PATTERN.test(family),
    )
  );
}

function isShadowLayers(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 3 && value.every(isShadowLayer);
}

function isShadowLayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    isIntegerBetween(value['xPx'], -32, 32) &&
    isIntegerBetween(value['yPx'], -32, 32) &&
    isIntegerBetween(value['blurPx'], 0, 64) &&
    isIntegerBetween(value['spreadPx'], -16, 16) &&
    typeof value['color'] === 'string' &&
    SRGB_WITH_OPTIONAL_ALPHA_PATTERN.test(value['color'])
  );
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isNumberBetween(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

function isOneOf<const Values extends readonly unknown[]>(
  value: unknown,
  values: Values,
): value is Values[number] {
  return values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
