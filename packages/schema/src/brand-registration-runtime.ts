/** Maximum number of customer-owned Brand token sources retained in page memory. */
export const PRODUCT_STYLE_MAX_REGISTERED_SOURCES = 16;

type ValueValidator = (value: unknown) => boolean;

const PRODUCT_STYLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SRGB_WITH_OPTIONAL_ALPHA_PATTERN = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/;
const SAFE_FONT_FAMILY_PATTERN =
  /^(?!.*(?:[uU][rR][lL]\(|[hH][tT][tT][pP][sS]?:\/\/|[dD][aA][tT][aA]:|[vV][aA][rR]\(|[;{}])).+$/;

const COLOR_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  surface: isOpaqueColor,
  surfaceRaised: isOpaqueColor,
  surfaceInverse: isOpaqueColor,
  text: isOpaqueColor,
  textMuted: isOpaqueColor,
  textInverse: isOpaqueColor,
  border: isOpaqueColor,
  borderStrong: isOpaqueColor,
  accent: isOpaqueColor,
  accentHover: isOpaqueColor,
  onAccent: isOpaqueColor,
  focus: isOpaqueColor,
  success: isOpaqueColor,
  onSuccess: isOpaqueColor,
  warning: isOpaqueColor,
  onWarning: isOpaqueColor,
  danger: isOpaqueColor,
  onDanger: isOpaqueColor,
  overlay: isColorWithOptionalAlpha,
};

const TYPOGRAPHY_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  fontFamilies: isSafeFontFamilies,
  baseSizePx: (value) => isIntegerBetween(value, 12, 20),
  smallSizePx: (value) => isIntegerBetween(value, 10, 18),
  bodyLineHeight: (value) => isNumberBetween(value, 1.2, 2),
  headingLineHeight: (value) => isNumberBetween(value, 1, 1.6),
  bodyWeight: (value) => value === 400 || value === 500,
  headingWeight: (value) => value === 500 || value === 600 || value === 700,
  actionWeight: (value) => value === 500 || value === 600 || value === 700,
};

const SPACING_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  xs: isSpacingToken,
  sm: isSpacingToken,
  md: isSpacingToken,
  lg: isSpacingToken,
  xl: isSpacingToken,
};
const RADIUS_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  sm: (value) => isIntegerBetween(value, 0, 32),
  md: (value) => isIntegerBetween(value, 0, 32),
  lg: (value) => isIntegerBetween(value, 0, 32),
  pill: (value) => isIntegerBetween(value, 0, 999),
};
const BORDER_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  defaultWidthPx: (value) => isIntegerBetween(value, 0, 4),
  strongWidthPx: (value) => isIntegerBetween(value, 1, 6),
};
const SIZING_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  tourNarrowPx: (value) => isIntegerBetween(value, 220, 360),
  tourStandardPx: (value) => isIntegerBetween(value, 280, 480),
  tourWidePx: (value) => isIntegerBetween(value, 360, 640),
};
const MOTION_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  fastMs: (value) => isIntegerBetween(value, 0, 1_000),
  normalMs: (value) => isIntegerBetween(value, 0, 1_000),
  slowMs: (value) => isIntegerBetween(value, 0, 1_000),
  easing: (value) => value === 'standard' || value === 'decelerate' || value === 'accelerate',
};
const ELEVATION_TOKEN_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  resting: isShadowLayers,
  floating: isShadowLayers,
};

const REGISTRATION_VALUE_VALIDATORS: Readonly<Record<string, ValueValidator>> = {
  modes: isModeTokens,
  typography: (value) => isPartialTokenRecord(value, TYPOGRAPHY_TOKEN_VALIDATORS),
  spacing: (value) => isPartialTokenRecord(value, SPACING_TOKEN_VALIDATORS),
  radii: (value) => isPartialTokenRecord(value, RADIUS_TOKEN_VALIDATORS),
  borders: (value) => isPartialTokenRecord(value, BORDER_TOKEN_VALIDATORS),
  sizing: (value) => isPartialTokenRecord(value, SIZING_TOKEN_VALIDATORS),
  motion: (value) => isPartialTokenRecord(value, MOTION_TOKEN_VALIDATORS),
  elevations: (value) => isPartialTokenRecord(value, ELEVATION_TOKEN_VALIDATORS),
};

/**
 * Browser-sized guard for the canonical CustomerBrandTokenRegistration schema
 * plus the registry's non-empty-value requirement. Keep this aligned with the
 * TypeBox contract in `brand.ts`; this avoids loading TypeBox and the complete
 * schema registry into the public bootstrap.
 */
export function isRegistrableCustomerBrandTokenRegistration(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const allowedKeys = [
    'schemaVersion',
    'sourceId',
    'revision',
    ...Object.keys(REGISTRATION_VALUE_VALIDATORS),
  ];
  return (
    hasOnlyKeys(value, allowedKeys) &&
    value['schemaVersion'] === '1' &&
    isProductStyleId(value['sourceId']) &&
    isProductStyleId(value['revision']) &&
    Object.entries(REGISTRATION_VALUE_VALIDATORS).every(([key, validate]) =>
      isOptionalValid(value[key], validate),
    ) &&
    Object.entries(value).some(
      ([key, candidate]) => key in REGISTRATION_VALUE_VALIDATORS && containsLeafValue(candidate),
    )
  );
}

function isModeTokens(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['light', 'dark'])) return false;
  return ['light', 'dark'].every((key) => isOptionalValid(value[key], isModeToken));
}

function isModeToken(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['colors', 'typography'])) return false;
  return (
    isOptionalValid(value['colors'], (candidate) =>
      isPartialTokenRecord(candidate, COLOR_TOKEN_VALIDATORS),
    ) &&
    isOptionalValid(value['typography'], (candidate) =>
      isPartialTokenRecord(candidate, TYPOGRAPHY_TOKEN_VALIDATORS),
    )
  );
}

function isPartialTokenRecord(
  value: unknown,
  validators: Readonly<Record<string, ValueValidator>>,
): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, Object.keys(validators))) return false;
  return Object.entries(validators).every(([key, validate]) =>
    isOptionalValid(value[key], validate),
  );
}

function isShadowLayers(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 3 && Array.from(value).every(isShadowLayer);
}

function isShadowLayer(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, ['xPx', 'yPx', 'blurPx', 'spreadPx', 'color'])) {
    return false;
  }
  return (
    isIntegerBetween(value['xPx'], -32, 32) &&
    isIntegerBetween(value['yPx'], -32, 32) &&
    isIntegerBetween(value['blurPx'], 0, 64) &&
    isIntegerBetween(value['spreadPx'], -16, 16) &&
    isColorWithOptionalAlpha(value['color'])
  );
}

function isSafeFontFamilies(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= 5 &&
    new Set(value).size === value.length &&
    Array.from(value).every(
      (family) =>
        typeof family === 'string' && family.length <= 80 && SAFE_FONT_FAMILY_PATTERN.test(family),
    )
  );
}

function isProductStyleId(value: unknown): boolean {
  return typeof value === 'string' && PRODUCT_STYLE_ID_PATTERN.test(value);
}

function isOpaqueColor(value: unknown): boolean {
  return (
    typeof value === 'string' && value.length === 7 && SRGB_WITH_OPTIONAL_ALPHA_PATTERN.test(value)
  );
}

function isColorWithOptionalAlpha(value: unknown): boolean {
  return typeof value === 'string' && SRGB_WITH_OPTIONAL_ALPHA_PATTERN.test(value);
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isNumberBetween(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function isOptionalValid(value: unknown, validate: ValueValidator): boolean {
  return value === undefined || validate(value);
}

function isSpacingToken(value: unknown): boolean {
  return isIntegerBetween(value, 0, 64);
}

function containsLeafValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!isRecord(value)) return value !== undefined;
  return Object.values(value).some(containsLeafValue);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.getOwnPropertyNames(value).every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
