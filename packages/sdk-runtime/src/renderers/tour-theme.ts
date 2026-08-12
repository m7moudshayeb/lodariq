import type {
  BrandThemeSnapshot,
  CompiledDocument,
  ExperienceAppearance,
  ThemeColorTokens,
  ThemeShadowLayer,
  TourRendererRecipe,
} from '@lodariq/schema';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  hasRenderableBrandThemeSnapshot,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  resolveExperienceAppearance,
} from '@lodariq/schema/brand-runtime';

const TOUR_WIDTH_TOKEN_BY_APPEARANCE = {
  narrow: 'tourNarrowPx',
  standard: 'tourStandardPx',
  wide: 'tourWidePx',
} as const satisfies Readonly<
  Record<ExperienceAppearance['width'], keyof BrandThemeSnapshot['definition']['tokens']['sizing']>
>;

const MOTION_EASING_VALUES = {
  accelerate: 'cubic-bezier(.4, 0, 1, 1)',
  decelerate: 'cubic-bezier(0, 0, .2, 1)',
  standard: 'cubic-bezier(.2, 0, 0, 1)',
} as const satisfies Readonly<
  Record<BrandThemeSnapshot['definition']['tokens']['motion']['easing'], string>
>;

const DENSITY_SCALE = {
  comfortable: 1,
  compact: 0.78,
} as const satisfies Readonly<Record<ExperienceAppearance['density'], number>>;

const TOUR_STYLE_VARIABLES = {
  actionFontWeight: '--lq-tour-action-font-weight',
  baseFontSize: '--lq-tour-base-font-size',
  bodyLineHeight: '--lq-tour-body-line-height',
  borderColor: '--lq-tour-border-color',
  borderWidth: '--lq-tour-border-width',
  borderWidthStrong: '--lq-tour-border-width-strong',
  borderWidthSubtle: '--lq-tour-border-width-subtle',
  elevation: '--lq-tour-elevation',
  elevationFloating: '--lq-tour-elevation-floating',
  elevationResting: '--lq-tour-elevation-resting',
  focusColor: '--lq-tour-focus-color',
  focusHaloColor: '--lq-tour-focus-halo-color',
  fontFamily: '--lq-tour-font-family',
  headingFontWeight: '--lq-tour-heading-font-weight',
  headingLineHeight: '--lq-tour-heading-line-height',
  motionDuration: '--lq-tour-motion-duration',
  motionEasing: '--lq-tour-motion-easing',
  mutedTextColor: '--lq-tour-muted-text-color',
  primarySurface: '--lq-tour-primary-surface',
  primaryText: '--lq-tour-primary-text',
  radius: '--lq-tour-radius',
  radiusLg: '--lq-tour-radius-lg',
  radiusSm: '--lq-tour-radius-sm',
  secondarySurface: '--lq-tour-secondary-surface',
  secondaryText: '--lq-tour-secondary-text',
  smallFontSize: '--lq-tour-small-font-size',
  spacing: '--lq-tour-spacing',
  spacingXs: '--lq-tour-space-xs',
  spacingSm: '--lq-tour-space-sm',
  spacingMd: '--lq-tour-space-md',
  spacingLg: '--lq-tour-space-lg',
  spacingXl: '--lq-tour-space-xl',
  surface: '--lq-tour-surface',
  textColor: '--lq-tour-text-color',
  width: '--lq-tour-width',
} as const;

export interface ResolvedTourThemeStyle {
  appearance: ExperienceAppearance;
  colorMode: 'dark' | 'light';
  theme: BrandThemeSnapshot;
  variables: Readonly<
    Record<(typeof TOUR_STYLE_VARIABLES)[keyof typeof TOUR_STYLE_VARIABLES], string>
  >;
}

export interface TourThemeStyleInput {
  appearance?: ExperienceAppearance;
  theme?: BrandThemeSnapshot;
}

/**
 * Applies only allowlisted semantic values to the renderer host. No creator
 * value is concatenated into a stylesheet, selector, or declaration name.
 */
export function applyCompiledTourTheme(host: HTMLElement, document: CompiledDocument): () => void {
  const view = host.ownerDocument.defaultView;
  const colorSchemeMedia = view?.matchMedia?.('(prefers-color-scheme: dark)');
  const reducedMotionMedia = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const apply = (): void => {
    const resolved = resolveCompiledTourTheme(
      document,
      Boolean(colorSchemeMedia?.matches),
      Boolean(reducedMotionMedia?.matches),
    );
    host.dataset['lodariqColorMode'] = resolved.colorMode;
    for (const [property, value] of Object.entries(resolved.variables)) {
      host.style.setProperty(property, value);
    }
  };

  apply();
  if (resolveCompiledTourTheme(document).appearance.colorMode === 'system') {
    colorSchemeMedia?.addEventListener?.('change', apply);
  }
  reducedMotionMedia?.addEventListener?.('change', apply);
  return () => {
    colorSchemeMedia?.removeEventListener?.('change', apply);
    reducedMotionMedia?.removeEventListener?.('change', apply);
  };
}

export function resolveCompiledTourTheme(
  document: CompiledDocument,
  prefersDark = false,
  prefersReducedMotion = false,
): ResolvedTourThemeStyle {
  return resolveTourThemeStyle(
    compiledTourThemeStyleInput(document),
    prefersDark,
    prefersReducedMotion,
  );
}

/**
 * Resolves the same allowlisted Tour recipe for creator previews and compiled
 * delivery. Authoring surfaces use this instead of maintaining a second set
 * of visual defaults for the popup shown on their canvas.
 */
export function resolveTourThemeStyle(
  input: TourThemeStyleInput = {},
  prefersDark = false,
  prefersReducedMotion = false,
): ResolvedTourThemeStyle {
  const theme = resolvedTheme(input.theme);
  const appearance = resolvedAppearance(input.appearance);
  const colorMode = resolvedColorMode(theme, appearance, prefersDark);
  const colors =
    theme.definition.tokens.modes[colorMode]?.colors ?? theme.definition.tokens.modes.light.colors;
  const recipe = theme.definition.recipes.tour[appearance.preset];
  const tokens = theme.definition.tokens;
  const spacing = Math.round(
    tokens.spacing[recipe.spacingRole] * DENSITY_SCALE[appearance.density],
  );
  const widthToken = TOUR_WIDTH_TOKEN_BY_APPEARANCE[appearance.width];
  const focusColor = colorForRole(colors, recipe.focusRole);

  return {
    appearance,
    colorMode,
    theme,
    variables: {
      [TOUR_STYLE_VARIABLES.actionFontWeight]: String(tokens.typography.actionWeight),
      [TOUR_STYLE_VARIABLES.baseFontSize]: `${tokens.typography.baseSizePx}px`,
      [TOUR_STYLE_VARIABLES.bodyLineHeight]: String(tokens.typography.bodyLineHeight),
      [TOUR_STYLE_VARIABLES.borderColor]: colorForRole(colors, recipe.borderRole),
      [TOUR_STYLE_VARIABLES.borderWidth]: borderWidth(tokens.borders, recipe),
      [TOUR_STYLE_VARIABLES.borderWidthStrong]: `${tokens.borders.strongWidthPx}px`,
      [TOUR_STYLE_VARIABLES.borderWidthSubtle]: `${tokens.borders.defaultWidthPx}px`,
      [TOUR_STYLE_VARIABLES.elevation]: elevationValue(tokens.elevations, recipe),
      [TOUR_STYLE_VARIABLES.elevationFloating]: shadowLayersValue(tokens.elevations.floating),
      [TOUR_STYLE_VARIABLES.elevationResting]: shadowLayersValue(tokens.elevations.resting),
      [TOUR_STYLE_VARIABLES.focusColor]: focusColor,
      [TOUR_STYLE_VARIABLES.focusHaloColor]: `${focusColor}33`,
      [TOUR_STYLE_VARIABLES.fontFamily]: tokens.typography.fontFamilies.join(', '),
      [TOUR_STYLE_VARIABLES.headingFontWeight]: String(tokens.typography.headingWeight),
      [TOUR_STYLE_VARIABLES.headingLineHeight]: String(tokens.typography.headingLineHeight),
      [TOUR_STYLE_VARIABLES.motionDuration]: prefersReducedMotion
        ? '0ms'
        : `${tokens.motion.normalMs}ms`,
      [TOUR_STYLE_VARIABLES.motionEasing]: MOTION_EASING_VALUES[tokens.motion.easing],
      [TOUR_STYLE_VARIABLES.mutedTextColor]: colorForRole(colors, recipe.mutedTextRole),
      [TOUR_STYLE_VARIABLES.primarySurface]: colorForRole(colors, recipe.primarySurfaceRole),
      [TOUR_STYLE_VARIABLES.primaryText]: colorForRole(colors, recipe.primaryTextRole),
      [TOUR_STYLE_VARIABLES.radius]: `${tokens.radii[recipe.radiusRole]}px`,
      [TOUR_STYLE_VARIABLES.radiusLg]: `${tokens.radii.lg}px`,
      [TOUR_STYLE_VARIABLES.radiusSm]: `${tokens.radii.sm}px`,
      [TOUR_STYLE_VARIABLES.secondarySurface]: colorForRole(colors, recipe.secondarySurfaceRole),
      [TOUR_STYLE_VARIABLES.secondaryText]: colorForRole(colors, recipe.secondaryTextRole),
      [TOUR_STYLE_VARIABLES.smallFontSize]: `${tokens.typography.smallSizePx}px`,
      [TOUR_STYLE_VARIABLES.spacing]: `${spacing}px`,
      [TOUR_STYLE_VARIABLES.spacingXs]: `${tokens.spacing.xs}px`,
      [TOUR_STYLE_VARIABLES.spacingSm]: `${tokens.spacing.sm}px`,
      [TOUR_STYLE_VARIABLES.spacingMd]: `${tokens.spacing.md}px`,
      [TOUR_STYLE_VARIABLES.spacingLg]: `${tokens.spacing.lg}px`,
      [TOUR_STYLE_VARIABLES.spacingXl]: `${tokens.spacing.xl}px`,
      [TOUR_STYLE_VARIABLES.surface]: colorForRole(colors, recipe.surfaceRole),
      [TOUR_STYLE_VARIABLES.textColor]: colorForRole(colors, recipe.textRole),
      [TOUR_STYLE_VARIABLES.width]: `${tokens.sizing[widthToken]}px`,
    },
  };
}

function resolvedTheme(candidate: BrandThemeSnapshot | undefined): BrandThemeSnapshot {
  return candidate && hasRenderableBrandThemeSnapshot(candidate)
    ? candidate
    : LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
}

function resolvedAppearance(candidate: ExperienceAppearance | undefined): ExperienceAppearance {
  return resolveExperienceAppearance(candidate ?? DEFAULT_EXPERIENCE_APPEARANCE);
}

function compiledTourThemeStyleInput(document: CompiledDocument): TourThemeStyleInput {
  if (!('theme' in document) || !('appearance' in document)) return {};
  return {
    theme: document.theme as BrandThemeSnapshot,
    appearance: document.appearance as ExperienceAppearance,
  };
}

function resolvedColorMode(
  theme: BrandThemeSnapshot,
  appearance: ExperienceAppearance,
  prefersDark: boolean,
): 'dark' | 'light' {
  const requestedDark =
    appearance.colorMode === 'dark' || (appearance.colorMode === 'system' && prefersDark);
  return requestedDark && theme.definition.tokens.modes.dark ? 'dark' : 'light';
}

function colorForRole(colors: ThemeColorTokens, role: keyof ThemeColorTokens): string {
  return colors[role];
}

function borderWidth(
  borders: BrandThemeSnapshot['definition']['tokens']['borders'],
  recipe: TourRendererRecipe,
): string {
  if (recipe.borderStyle === 'none') return '0px';
  return `${recipe.borderStyle === 'strong' ? borders.strongWidthPx : borders.defaultWidthPx}px`;
}

function elevationValue(
  elevations: BrandThemeSnapshot['definition']['tokens']['elevations'],
  recipe: TourRendererRecipe,
): string {
  if (recipe.elevationRole === 'none') return 'none';
  return shadowLayersValue(elevations[recipe.elevationRole]);
}

function shadowLayersValue(layers: ThemeShadowLayer[]): string {
  return layers.length ? layers.map(serializeShadowLayer).join(', ') : 'none';
}

function serializeShadowLayer(layer: ThemeShadowLayer): string {
  return `${layer.xPx}px ${layer.yPx}px ${layer.blurPx}px ${layer.spreadPx}px ${layer.color}`;
}
