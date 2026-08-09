import { Type, type Static } from '@sinclair/typebox';
import {
  EXPERIENCE_APPEARANCE_DENSITIES,
  EXPERIENCE_APPEARANCE_PRESETS,
  EXPERIENCE_APPEARANCE_WIDTHS,
  EXPERIENCE_COLOR_MODES,
} from './brand-runtime';
import { PRODUCT_STYLE_MAX_REGISTERED_SOURCES } from './brand-registration-runtime';
import { BRAND_THEME_CONTRACT_VERSION, BRAND_THEME_SCHEMA_VERSION } from './version';

export * from './brand-runtime';
export { PRODUCT_STYLE_MAX_REGISTERED_SOURCES } from './brand-registration-runtime';

const OPAQUE_SRGB_PATTERN = '^#[0-9a-f]{6}$';
const SRGB_WITH_OPTIONAL_ALPHA_PATTERN = '^#[0-9a-f]{6}(?:[0-9a-f]{2})?$';
const SAFE_FONT_FAMILY_PATTERN =
  '^(?!.*(?:[uU][rR][lL]\\(|[hH][tT][tT][pP][sS]?://|[dD][aA][tT][aA]:|[vV][aA][rR]\\(|[;{}])).+$';
const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';
const PRODUCT_STYLE_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$';
const PRODUCT_STYLE_TIMESTAMP_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$';

export const PRODUCT_STYLE_SOURCE_KINDS = [
  'registered_tokens',
  'selected_element',
  'page_typography',
  'ancestor_context',
  'nearby_control',
  'fallback',
] as const;

/** Highest-priority source first. Keep inference precedence centralized here. */
export const PRODUCT_STYLE_SOURCE_PRIORITY = [
  'registered_tokens',
  'selected_element',
  'nearby_control',
  'page_typography',
  'ancestor_context',
  'fallback',
] as const satisfies readonly (typeof PRODUCT_STYLE_SOURCE_KINDS)[number][];

export const PRODUCT_STYLE_SAMPLE_KINDS = [
  'selected_element',
  'page_typography',
  'ancestor_context',
  'nearby_control',
] as const;

export const PRODUCT_STYLE_MAX_ANCESTORS = 6;
export const PRODUCT_STYLE_MAX_NEARBY_CONTROLS = 20;
export const PRODUCT_STYLE_MAX_SAMPLES =
  2 + PRODUCT_STYLE_MAX_ANCESTORS + PRODUCT_STYLE_MAX_NEARBY_CONTROLS;
export const PRODUCT_STYLE_MAX_SOURCES =
  PRODUCT_STYLE_MAX_REGISTERED_SOURCES + PRODUCT_STYLE_SOURCE_KINDS.length - 1;

export const OpaqueSrgbColor = Type.String({
  $id: 'OpaqueSrgbColor',
  pattern: OPAQUE_SRGB_PATTERN,
});
export type OpaqueSrgbColor = Static<typeof OpaqueSrgbColor>;

export const SrgbColorWithOptionalAlpha = Type.String({
  $id: 'SrgbColorWithOptionalAlpha',
  pattern: SRGB_WITH_OPTIONAL_ALPHA_PATTERN,
});
export type SrgbColorWithOptionalAlpha = Static<typeof SrgbColorWithOptionalAlpha>;

export const SafeFontFamily = Type.String({
  $id: 'SafeFontFamily',
  minLength: 1,
  maxLength: 80,
  pattern: SAFE_FONT_FAMILY_PATTERN,
});
export type SafeFontFamily = Static<typeof SafeFontFamily>;

export const ThemeColorTokens = Type.Object(
  {
    surface: Type.Ref(OpaqueSrgbColor),
    surfaceRaised: Type.Ref(OpaqueSrgbColor),
    surfaceInverse: Type.Ref(OpaqueSrgbColor),
    text: Type.Ref(OpaqueSrgbColor),
    textMuted: Type.Ref(OpaqueSrgbColor),
    textInverse: Type.Ref(OpaqueSrgbColor),
    border: Type.Ref(OpaqueSrgbColor),
    borderStrong: Type.Ref(OpaqueSrgbColor),
    accent: Type.Ref(OpaqueSrgbColor),
    accentHover: Type.Ref(OpaqueSrgbColor),
    onAccent: Type.Ref(OpaqueSrgbColor),
    focus: Type.Ref(OpaqueSrgbColor),
    success: Type.Ref(OpaqueSrgbColor),
    onSuccess: Type.Ref(OpaqueSrgbColor),
    warning: Type.Ref(OpaqueSrgbColor),
    onWarning: Type.Ref(OpaqueSrgbColor),
    danger: Type.Ref(OpaqueSrgbColor),
    onDanger: Type.Ref(OpaqueSrgbColor),
    overlay: Type.Ref(SrgbColorWithOptionalAlpha),
  },
  { $id: 'ThemeColorTokens', additionalProperties: false },
);
export type ThemeColorTokens = Static<typeof ThemeColorTokens>;

export const ThemeTypographyTokens = Type.Object(
  {
    fontFamilies: Type.Array(Type.Ref(SafeFontFamily), {
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
    }),
    baseSizePx: Type.Integer({ minimum: 12, maximum: 20 }),
    smallSizePx: Type.Integer({ minimum: 10, maximum: 18 }),
    bodyLineHeight: Type.Number({ minimum: 1.2, maximum: 2 }),
    headingLineHeight: Type.Number({ minimum: 1, maximum: 1.6 }),
    bodyWeight: Type.Union([Type.Literal(400), Type.Literal(500)]),
    headingWeight: Type.Union([Type.Literal(500), Type.Literal(600), Type.Literal(700)]),
    actionWeight: Type.Union([Type.Literal(500), Type.Literal(600), Type.Literal(700)]),
  },
  { $id: 'ThemeTypographyTokens', additionalProperties: false },
);
export type ThemeTypographyTokens = Static<typeof ThemeTypographyTokens>;

export const ThemeSpacingTokens = Type.Object(
  {
    xs: Type.Integer({ minimum: 0, maximum: 64 }),
    sm: Type.Integer({ minimum: 0, maximum: 64 }),
    md: Type.Integer({ minimum: 0, maximum: 64 }),
    lg: Type.Integer({ minimum: 0, maximum: 64 }),
    xl: Type.Integer({ minimum: 0, maximum: 64 }),
  },
  { $id: 'ThemeSpacingTokens', additionalProperties: false },
);
export type ThemeSpacingTokens = Static<typeof ThemeSpacingTokens>;

export const ThemeRadiusTokens = Type.Object(
  {
    sm: Type.Integer({ minimum: 0, maximum: 32 }),
    md: Type.Integer({ minimum: 0, maximum: 32 }),
    lg: Type.Integer({ minimum: 0, maximum: 32 }),
    pill: Type.Integer({ minimum: 0, maximum: 999 }),
  },
  { $id: 'ThemeRadiusTokens', additionalProperties: false },
);
export type ThemeRadiusTokens = Static<typeof ThemeRadiusTokens>;

export const ThemeBorderTokens = Type.Object(
  {
    defaultWidthPx: Type.Integer({ minimum: 0, maximum: 4 }),
    strongWidthPx: Type.Integer({ minimum: 1, maximum: 6 }),
  },
  { $id: 'ThemeBorderTokens', additionalProperties: false },
);
export type ThemeBorderTokens = Static<typeof ThemeBorderTokens>;

export const ThemeSizingTokens = Type.Object(
  {
    tourNarrowPx: Type.Integer({ minimum: 220, maximum: 360 }),
    tourStandardPx: Type.Integer({ minimum: 280, maximum: 480 }),
    tourWidePx: Type.Integer({ minimum: 360, maximum: 640 }),
  },
  { $id: 'ThemeSizingTokens', additionalProperties: false },
);
export type ThemeSizingTokens = Static<typeof ThemeSizingTokens>;

export const ThemeMotionTokens = Type.Object(
  {
    fastMs: Type.Integer({ minimum: 0, maximum: 1000 }),
    normalMs: Type.Integer({ minimum: 0, maximum: 1000 }),
    slowMs: Type.Integer({ minimum: 0, maximum: 1000 }),
    easing: Type.Union([
      Type.Literal('standard'),
      Type.Literal('decelerate'),
      Type.Literal('accelerate'),
    ]),
  },
  { $id: 'ThemeMotionTokens', additionalProperties: false },
);
export type ThemeMotionTokens = Static<typeof ThemeMotionTokens>;

export const ThemeShadowLayer = Type.Object(
  {
    xPx: Type.Integer({ minimum: -32, maximum: 32 }),
    yPx: Type.Integer({ minimum: -32, maximum: 32 }),
    blurPx: Type.Integer({ minimum: 0, maximum: 64 }),
    spreadPx: Type.Integer({ minimum: -16, maximum: 16 }),
    color: Type.Ref(SrgbColorWithOptionalAlpha),
  },
  { $id: 'ThemeShadowLayer', additionalProperties: false },
);
export type ThemeShadowLayer = Static<typeof ThemeShadowLayer>;

export const ThemeElevationTokens = Type.Object(
  {
    resting: Type.Array(Type.Ref(ThemeShadowLayer), { maxItems: 3 }),
    floating: Type.Array(Type.Ref(ThemeShadowLayer), { maxItems: 3 }),
  },
  { $id: 'ThemeElevationTokens', additionalProperties: false },
);
export type ThemeElevationTokens = Static<typeof ThemeElevationTokens>;

export const ThemeModeTokens = Type.Object(
  { colors: Type.Ref(ThemeColorTokens) },
  { $id: 'ThemeModeTokens', additionalProperties: false },
);
export type ThemeModeTokens = Static<typeof ThemeModeTokens>;

export const ThemeTokens = Type.Object(
  {
    modes: Type.Object(
      {
        light: Type.Ref(ThemeModeTokens),
        dark: Type.Optional(Type.Ref(ThemeModeTokens)),
      },
      { additionalProperties: false },
    ),
    typography: Type.Ref(ThemeTypographyTokens),
    spacing: Type.Ref(ThemeSpacingTokens),
    radii: Type.Ref(ThemeRadiusTokens),
    borders: Type.Ref(ThemeBorderTokens),
    sizing: Type.Ref(ThemeSizingTokens),
    motion: Type.Ref(ThemeMotionTokens),
    elevations: Type.Ref(ThemeElevationTokens),
  },
  { $id: 'ThemeTokens', additionalProperties: false },
);
export type ThemeTokens = Static<typeof ThemeTokens>;

const ThemeColorRole = Type.Union([
  Type.Literal('surface'),
  Type.Literal('surfaceRaised'),
  Type.Literal('surfaceInverse'),
  Type.Literal('text'),
  Type.Literal('textMuted'),
  Type.Literal('textInverse'),
  Type.Literal('border'),
  Type.Literal('borderStrong'),
  Type.Literal('accent'),
  Type.Literal('accentHover'),
  Type.Literal('onAccent'),
  Type.Literal('focus'),
  Type.Literal('success'),
  Type.Literal('onSuccess'),
  Type.Literal('warning'),
  Type.Literal('onWarning'),
  Type.Literal('danger'),
  Type.Literal('onDanger'),
]);

export const TourRendererRecipe = Type.Object(
  {
    surfaceRole: ThemeColorRole,
    textRole: ThemeColorRole,
    mutedTextRole: ThemeColorRole,
    borderRole: ThemeColorRole,
    borderStyle: Type.Union([Type.Literal('none'), Type.Literal('subtle'), Type.Literal('strong')]),
    primarySurfaceRole: ThemeColorRole,
    primaryTextRole: ThemeColorRole,
    secondarySurfaceRole: ThemeColorRole,
    secondaryTextRole: ThemeColorRole,
    focusRole: ThemeColorRole,
    radiusRole: Type.Union([
      Type.Literal('sm'),
      Type.Literal('md'),
      Type.Literal('lg'),
      Type.Literal('pill'),
    ]),
    spacingRole: Type.Union([Type.Literal('sm'), Type.Literal('md'), Type.Literal('lg')]),
    elevationRole: Type.Union([
      Type.Literal('none'),
      Type.Literal('resting'),
      Type.Literal('floating'),
    ]),
    widthRole: Type.Union([
      Type.Literal('tourNarrowPx'),
      Type.Literal('tourStandardPx'),
      Type.Literal('tourWidePx'),
    ]),
  },
  { $id: 'TourRendererRecipe', additionalProperties: false },
);
export type TourRendererRecipe = Static<typeof TourRendererRecipe>;

export const RendererRecipes = Type.Object(
  {
    tour: Type.Object(
      {
        default: Type.Ref(TourRendererRecipe),
        accent: Type.Ref(TourRendererRecipe),
        inverse: Type.Ref(TourRendererRecipe),
        success: Type.Ref(TourRendererRecipe),
        warning: Type.Ref(TourRendererRecipe),
        minimal: Type.Ref(TourRendererRecipe),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'RendererRecipes', additionalProperties: false },
);
export type RendererRecipes = Static<typeof RendererRecipes>;

export const BrandThemeDefinition = Type.Object(
  {
    tokens: Type.Ref(ThemeTokens),
    recipes: Type.Ref(RendererRecipes),
  },
  { $id: 'BrandThemeDefinition', additionalProperties: false },
);
export type BrandThemeDefinition = Static<typeof BrandThemeDefinition>;

/**
 * Safe, partial semantic tokens explicitly registered by a customer product.
 * This deliberately mirrors the Brand Theme value domains while forbidding
 * arbitrary property maps, CSS syntax, URLs, selectors, and declarations.
 */
export const CustomerBrandColorTokens = Type.Partial(ThemeColorTokens, {
  $id: 'CustomerBrandColorTokens',
  additionalProperties: false,
});
export type CustomerBrandColorTokens = Static<typeof CustomerBrandColorTokens>;

export const CustomerBrandTypographyTokens = Type.Partial(ThemeTypographyTokens, {
  $id: 'CustomerBrandTypographyTokens',
  additionalProperties: false,
});
export type CustomerBrandTypographyTokens = Static<typeof CustomerBrandTypographyTokens>;

export const CustomerBrandSpacingTokens = Type.Partial(ThemeSpacingTokens, {
  $id: 'CustomerBrandSpacingTokens',
  additionalProperties: false,
});
export type CustomerBrandSpacingTokens = Static<typeof CustomerBrandSpacingTokens>;

export const CustomerBrandRadiusTokens = Type.Partial(ThemeRadiusTokens, {
  $id: 'CustomerBrandRadiusTokens',
  additionalProperties: false,
});
export type CustomerBrandRadiusTokens = Static<typeof CustomerBrandRadiusTokens>;

export const CustomerBrandBorderTokens = Type.Partial(ThemeBorderTokens, {
  $id: 'CustomerBrandBorderTokens',
  additionalProperties: false,
});
export type CustomerBrandBorderTokens = Static<typeof CustomerBrandBorderTokens>;

export const CustomerBrandSizingTokens = Type.Partial(ThemeSizingTokens, {
  $id: 'CustomerBrandSizingTokens',
  additionalProperties: false,
});
export type CustomerBrandSizingTokens = Static<typeof CustomerBrandSizingTokens>;

export const CustomerBrandMotionTokens = Type.Partial(ThemeMotionTokens, {
  $id: 'CustomerBrandMotionTokens',
  additionalProperties: false,
});
export type CustomerBrandMotionTokens = Static<typeof CustomerBrandMotionTokens>;

export const CustomerBrandElevationTokens = Type.Partial(ThemeElevationTokens, {
  $id: 'CustomerBrandElevationTokens',
  additionalProperties: false,
});
export type CustomerBrandElevationTokens = Static<typeof CustomerBrandElevationTokens>;

export const CustomerBrandModeTokens = Type.Object(
  {
    colors: Type.Optional(Type.Ref(CustomerBrandColorTokens)),
    /** Allows the documented per-mode font-family registration shape. */
    typography: Type.Optional(Type.Ref(CustomerBrandTypographyTokens)),
  },
  { $id: 'CustomerBrandModeTokens', additionalProperties: false },
);
export type CustomerBrandModeTokens = Static<typeof CustomerBrandModeTokens>;

export const CustomerBrandTokenValues = Type.Object(
  {
    modes: Type.Optional(
      Type.Object(
        {
          light: Type.Optional(Type.Ref(CustomerBrandModeTokens)),
          dark: Type.Optional(Type.Ref(CustomerBrandModeTokens)),
        },
        { additionalProperties: false },
      ),
    ),
    typography: Type.Optional(Type.Ref(CustomerBrandTypographyTokens)),
    spacing: Type.Optional(Type.Ref(CustomerBrandSpacingTokens)),
    radii: Type.Optional(Type.Ref(CustomerBrandRadiusTokens)),
    borders: Type.Optional(Type.Ref(CustomerBrandBorderTokens)),
    sizing: Type.Optional(Type.Ref(CustomerBrandSizingTokens)),
    motion: Type.Optional(Type.Ref(CustomerBrandMotionTokens)),
    elevations: Type.Optional(Type.Ref(CustomerBrandElevationTokens)),
  },
  { $id: 'CustomerBrandTokenValues', additionalProperties: false },
);
export type CustomerBrandTokenValues = Static<typeof CustomerBrandTokenValues>;

/** Explicit, memory-only customer design-token registration. */
export const CustomerBrandTokenRegistration = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    sourceId: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    revision: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    ...CustomerBrandTokenValues.properties,
  },
  { $id: 'CustomerBrandTokenRegistration', additionalProperties: false },
);
export type CustomerBrandTokenRegistration = Static<typeof CustomerBrandTokenRegistration>;

export const ProductStyleSourceKind = Type.Union(
  PRODUCT_STYLE_SOURCE_KINDS.map((value) => Type.Literal(value)),
  { $id: 'ProductStyleSourceKind' },
);
export type ProductStyleSourceKind = Static<typeof ProductStyleSourceKind>;

export const ProductStyleSampleKind = Type.Union(
  PRODUCT_STYLE_SAMPLE_KINDS.map((value) => Type.Literal(value)),
  { $id: 'ProductStyleSampleKind' },
);
export type ProductStyleSampleKind = Static<typeof ProductStyleSampleKind>;

/**
 * Normalized resolved values from one bounded product element. Raw computed
 * style strings never cross this contract.
 */
export const ProductStyleSampleValues = Type.Object(
  {
    color: Type.Optional(Type.Ref(SrgbColorWithOptionalAlpha)),
    backgroundColor: Type.Optional(Type.Ref(SrgbColorWithOptionalAlpha)),
    fontFamilies: Type.Optional(
      Type.Array(Type.Ref(SafeFontFamily), {
        minItems: 1,
        maxItems: 5,
        uniqueItems: true,
      }),
    ),
    fontSizePx: Type.Optional(Type.Number({ minimum: 8, maximum: 96 })),
    fontWeight: Type.Optional(Type.Integer({ minimum: 100, maximum: 900, multipleOf: 100 })),
    lineHeight: Type.Optional(Type.Number({ minimum: 1, maximum: 3 })),
    borderColor: Type.Optional(Type.Ref(SrgbColorWithOptionalAlpha)),
    borderWidthPx: Type.Optional(Type.Number({ minimum: 0, maximum: 6 })),
    radiusPx: Type.Optional(Type.Number({ minimum: 0, maximum: 32 })),
    paddingBlockPx: Type.Optional(Type.Number({ minimum: 0, maximum: 64 })),
    paddingInlinePx: Type.Optional(Type.Number({ minimum: 0, maximum: 64 })),
    shadow: Type.Optional(Type.Array(Type.Ref(ThemeShadowLayer), { maxItems: 3 })),
    widthPx: Type.Optional(Type.Number({ minimum: 1, maximum: 4_096 })),
    maxWidthPx: Type.Optional(Type.Number({ minimum: 1, maximum: 4_096 })),
  },
  { $id: 'ProductStyleSampleValues', additionalProperties: false },
);
export type ProductStyleSampleValues = Static<typeof ProductStyleSampleValues>;

export const ProductStyleSample = Type.Object(
  {
    sampleId: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    sourceId: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    kind: Type.Ref(ProductStyleSampleKind),
    confidence: Type.Integer({ minimum: 0, maximum: 100 }),
    values: Type.Ref(ProductStyleSampleValues),
  },
  { $id: 'ProductStyleSample', additionalProperties: false },
);
export type ProductStyleSample = Static<typeof ProductStyleSample>;

/** Privacy-safe provenance for one registered or inferred style source. */
export const ProductStyleSource = Type.Object(
  {
    sourceId: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    kind: Type.Ref(ProductStyleSourceKind),
    revision: Type.Optional(
      Type.String({ minLength: 1, maxLength: 120, pattern: PRODUCT_STYLE_ID_PATTERN }),
    ),
    confidence: Type.Integer({ minimum: 0, maximum: 100 }),
    fingerprintHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    capturedAt: Type.String({
      minLength: 20,
      maxLength: 64,
      pattern: PRODUCT_STYLE_TIMESTAMP_PATTERN,
    }),
  },
  { $id: 'ProductStyleSource', additionalProperties: false },
);
export type ProductStyleSource = Static<typeof ProductStyleSource>;

/**
 * A bounded semantic proposal. Lower-confidence inferred changes remain a
 * proposal until a creator explicitly confirms them; they never mutate an
 * approved Brand Theme or live artifact by themselves.
 */
export const ProductStyleProposal = Type.Object(
  {
    schemaVersion: Type.Literal('1'),
    proposalId: Type.String({
      minLength: 1,
      maxLength: 120,
      pattern: PRODUCT_STYLE_ID_PATTERN,
    }),
    sources: Type.Array(Type.Ref(ProductStyleSource), {
      minItems: 1,
      maxItems: PRODUCT_STYLE_MAX_SOURCES,
    }),
    samples: Type.Array(Type.Ref(ProductStyleSample), {
      maxItems: PRODUCT_STYLE_MAX_SAMPLES,
    }),
    tokens: Type.Ref(CustomerBrandTokenValues),
    confidence: Type.Integer({ minimum: 0, maximum: 100 }),
    requiresConfirmation: Type.Boolean(),
    createdAt: Type.String({
      minLength: 20,
      maxLength: 64,
      pattern: PRODUCT_STYLE_TIMESTAMP_PATTERN,
    }),
  },
  { $id: 'ProductStyleProposal', additionalProperties: false },
);
export type ProductStyleProposal = Static<typeof ProductStyleProposal>;

export const BrandThemeSnapshot = Type.Object(
  {
    schemaVersion: Type.Literal(BRAND_THEME_SCHEMA_VERSION),
    contractVersion: Type.Literal(BRAND_THEME_CONTRACT_VERSION),
    themeId: Type.String({ minLength: 1, maxLength: 120 }),
    themeVersionId: Type.String({ minLength: 1, maxLength: 120 }),
    version: Type.Integer({ minimum: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    definition: Type.Ref(BrandThemeDefinition),
  },
  { $id: 'BrandThemeSnapshot', additionalProperties: false },
);
export type BrandThemeSnapshot = Static<typeof BrandThemeSnapshot>;

export const ThemeBinding = Type.Union(
  [
    Type.Object(
      {
        policy: Type.Literal('workspace-current'),
        themeId: Type.String({ minLength: 1 }),
        acknowledgedThemeVersionId: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        policy: Type.Literal('pinned'),
        themeId: Type.String({ minLength: 1 }),
        themeVersionId: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'ThemeBinding' },
);
export type ThemeBinding = Static<typeof ThemeBinding>;

export const ExperienceAppearance = Type.Object(
  {
    preset: Type.Union(EXPERIENCE_APPEARANCE_PRESETS.map((value) => Type.Literal(value))),
    density: Type.Union(EXPERIENCE_APPEARANCE_DENSITIES.map((value) => Type.Literal(value))),
    width: Type.Union(EXPERIENCE_APPEARANCE_WIDTHS.map((value) => Type.Literal(value))),
    colorMode: Type.Union(EXPERIENCE_COLOR_MODES.map((value) => Type.Literal(value))),
  },
  { $id: 'ExperienceAppearance', additionalProperties: false },
);
export type ExperienceAppearance = Static<typeof ExperienceAppearance>;

export const BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION = '1' as const;
export const BASIC_VISUAL_PREFLIGHT_MAX_ISSUES = 512;
export const BASIC_VISUAL_PREFLIGHT_STATUSES = ['passed', 'warnings', 'blocked'] as const;
export const BASIC_VISUAL_PREFLIGHT_SEVERITIES = ['warning', 'blocker'] as const;
export const BASIC_VISUAL_PREFLIGHT_CONTRAST_SUBJECTS = [
  'body_text',
  'muted_text',
  'primary_control',
  'secondary_control',
  'focus_indicator',
] as const;
export const BASIC_VISUAL_PREFLIGHT_ISSUE_CODES = [
  'artifact_schema_invalid',
  'artifact_identity_invalid',
  'theme_identity_invalid',
  'renderer_contract_incompatible',
  'contrast_unusable',
  'contrast_below_target',
  'long_copy_risk',
  'compact_viewport_risk',
] as const;

export const BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS = {
  artifact_schema_invalid: 'Invalid compiled artifact',
  artifact_identity_invalid: 'Artifact identity mismatch',
  theme_identity_invalid: 'Theme identity mismatch',
  renderer_contract_incompatible: 'Incompatible renderer',
  contrast_unusable: 'Unusable contrast',
  contrast_below_target: 'Contrast needs improvement',
  long_copy_risk: 'Long copy may overflow',
  compact_viewport_risk: 'Compact viewport may clip content',
} as const satisfies Record<(typeof BASIC_VISUAL_PREFLIGHT_ISSUE_CODES)[number], string>;

export const BASIC_VISUAL_PREFLIGHT_CONTRAST_SUBJECT_LABELS = {
  body_text: 'Body text',
  muted_text: 'Supporting text',
  primary_control: 'Primary control',
  secondary_control: 'Secondary control',
  focus_indicator: 'Focus indicator',
} as const satisfies Record<(typeof BASIC_VISUAL_PREFLIGHT_CONTRAST_SUBJECTS)[number], string>;

export const BasicVisualPreflightStatus = Type.Union(
  BASIC_VISUAL_PREFLIGHT_STATUSES.map((value) => Type.Literal(value)),
  { $id: 'BasicVisualPreflightStatus' },
);
export type BasicVisualPreflightStatus = Static<typeof BasicVisualPreflightStatus>;

export const BasicVisualPreflightSeverity = Type.Union(
  BASIC_VISUAL_PREFLIGHT_SEVERITIES.map((value) => Type.Literal(value)),
  { $id: 'BasicVisualPreflightSeverity' },
);
export type BasicVisualPreflightSeverity = Static<typeof BasicVisualPreflightSeverity>;

export const BasicVisualPreflightContrastSubject = Type.Union(
  BASIC_VISUAL_PREFLIGHT_CONTRAST_SUBJECTS.map((value) => Type.Literal(value)),
  { $id: 'BasicVisualPreflightContrastSubject' },
);
export type BasicVisualPreflightContrastSubject = Static<
  typeof BasicVisualPreflightContrastSubject
>;

export const BasicVisualPreflightIssueCode = Type.Union(
  BASIC_VISUAL_PREFLIGHT_ISSUE_CODES.map((value) => Type.Literal(value)),
  { $id: 'BasicVisualPreflightIssueCode' },
);
export type BasicVisualPreflightIssueCode = Static<typeof BasicVisualPreflightIssueCode>;

const BasicVisualPreflightIdentityIssue = Type.Object(
  {
    code: Type.Union([
      Type.Literal('artifact_schema_invalid'),
      Type.Literal('artifact_identity_invalid'),
      Type.Literal('theme_identity_invalid'),
      Type.Literal('renderer_contract_incompatible'),
    ]),
    severity: Type.Literal('blocker'),
  },
  { additionalProperties: false },
);

const BasicVisualPreflightContrastIssue = Type.Union([
  Type.Object(
    {
      code: Type.Literal('contrast_unusable'),
      severity: Type.Literal('blocker'),
      subject: Type.Ref(BasicVisualPreflightContrastSubject),
      colorMode: Type.Union([Type.Literal('light'), Type.Literal('dark')]),
      measuredRatio: Type.Number({ minimum: 1, maximum: 21 }),
      requiredRatio: Type.Number({ minimum: 1, maximum: 21 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      code: Type.Literal('contrast_below_target'),
      severity: Type.Literal('warning'),
      subject: Type.Ref(BasicVisualPreflightContrastSubject),
      colorMode: Type.Union([Type.Literal('light'), Type.Literal('dark')]),
      measuredRatio: Type.Number({ minimum: 1, maximum: 21 }),
      requiredRatio: Type.Number({ minimum: 1, maximum: 21 }),
    },
    { additionalProperties: false },
  ),
]);

const BasicVisualPreflightLongCopyIssue = Type.Object(
  {
    code: Type.Literal('long_copy_risk'),
    severity: Type.Literal('warning'),
    stepIndex: Type.Integer({ minimum: 0 }),
    nodeIndex: Type.Integer({ minimum: 0 }),
    characterCount: Type.Integer({ minimum: 1 }),
    recommendedMaximum: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const BasicVisualPreflightCompactViewportIssue = Type.Object(
  {
    code: Type.Literal('compact_viewport_risk'),
    severity: Type.Literal('warning'),
    stepIndex: Type.Integer({ minimum: 0 }),
    estimatedLines: Type.Integer({ minimum: 1 }),
    comfortableLineLimit: Type.Integer({ minimum: 1 }),
    viewportWidthPx: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

/**
 * Bounded visual-check evidence. It deliberately carries codes, indexes, and
 * numeric measurements only: never creator copy, URLs, CSS, selectors, DOM,
 * screenshots, or free-form diagnostic messages.
 */
export const BasicVisualPreflightIssue = Type.Union(
  [
    BasicVisualPreflightIdentityIssue,
    BasicVisualPreflightContrastIssue,
    BasicVisualPreflightLongCopyIssue,
    BasicVisualPreflightCompactViewportIssue,
  ],
  { $id: 'BasicVisualPreflightIssue' },
);
export type BasicVisualPreflightIssue = Static<typeof BasicVisualPreflightIssue>;

export const BasicVisualPreflightReport = Type.Object(
  {
    schemaVersion: Type.Literal(BASIC_VISUAL_PREFLIGHT_REPORT_SCHEMA_VERSION),
    checkedAt: Type.String({ format: 'date-time' }),
    status: Type.Ref(BasicVisualPreflightStatus),
    issues: Type.Array(Type.Ref(BasicVisualPreflightIssue), {
      maxItems: BASIC_VISUAL_PREFLIGHT_MAX_ISSUES,
    }),
  },
  { $id: 'BasicVisualPreflightReport', additionalProperties: false },
);
export type BasicVisualPreflightReport = Static<typeof BasicVisualPreflightReport>;

export function basicVisualPreflightIssueLabel(code: BasicVisualPreflightIssueCode): string {
  return BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS[code];
}
