import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const TOUR_MOTION_RECIPE_VALUES = ['fade', 'lift', 'scale', 'pulse'] as const;
export const TOUR_MOTION_EASING_VALUES = ['standard', 'emphasized', 'linear'] as const;

export const TourMotionPresentation = Type.Object(
  {
    recipe: Type.Union(TOUR_MOTION_RECIPE_VALUES.map((value) => Type.Literal(value))),
    durationMs: Type.Integer({ minimum: 100, maximum: 1_200 }),
    easing: Type.Union(TOUR_MOTION_EASING_VALUES.map((value) => Type.Literal(value))),
    /** Every recipe has a deterministic non-animated equivalent. */
    reducedMotion: Type.Literal('none'),
  },
  { $id: 'TourMotionPresentation', additionalProperties: false },
);
export type TourMotionPresentation = Static<typeof TourMotionPresentation>;

export const ResponsiveStepOverride = Type.Object(
  {
    placement: Type.Optional(
      Type.Union(['top', 'right', 'bottom', 'left'].map((value) => Type.Literal(value))),
    ),
    widthPx: Type.Optional(Type.Integer({ minimum: 240, maximum: 720, multipleOf: 4 })),
    actionLayout: Type.Optional(Type.Union([Type.Literal('inline'), Type.Literal('stack')])),
    mediaVisible: Type.Optional(Type.Boolean()),
  },
  { $id: 'ResponsiveStepOverride', additionalProperties: false, minProperties: 1 },
);
export type ResponsiveStepOverride = Static<typeof ResponsiveStepOverride>;

export const ResponsiveStepPresentation = Type.Object(
  {
    compact: Type.Optional(Type.Ref(ResponsiveStepOverride)),
    medium: Type.Optional(Type.Ref(ResponsiveStepOverride)),
    wide: Type.Optional(Type.Ref(ResponsiveStepOverride)),
  },
  { $id: 'ResponsiveStepPresentation', additionalProperties: false, minProperties: 1 },
);
export type ResponsiveStepPresentation = Static<typeof ResponsiveStepPresentation>;

const ASSET_ID = Type.String({
  minLength: 1,
  maxLength: 160,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

export const MEDIA_ASPECT_RATIO_VALUES = ['16:9', '4:3', '1:1'] as const;
export const MEDIA_FIT_VALUES = ['contain', 'cover', 'fill'] as const;
const MediaAspectRatio = Type.Union(MEDIA_ASPECT_RATIO_VALUES.map((value) => Type.Literal(value)));
const MediaFit = Type.Union(MEDIA_FIT_VALUES.map((value) => Type.Literal(value)));
export const MEDIA_WIDTH_PERCENT_LIMITS = { min: 20, max: 100 } as const;
export const MEDIA_HEIGHT_PX_LIMITS = { min: 64, max: 800 } as const;
const MediaWidthPercent = Type.Integer({
  minimum: MEDIA_WIDTH_PERCENT_LIMITS.min,
  maximum: MEDIA_WIDTH_PERCENT_LIMITS.max,
});
const MediaHeightPx = Type.Integer({
  minimum: MEDIA_HEIGHT_PX_LIMITS.min,
  maximum: MEDIA_HEIGHT_PX_LIMITS.max,
});

const MediaLocale = Type.String({ minLength: 2, maxLength: 35 });
export const LocalizedMediaVariant = Type.Object(
  {
    locale: MediaLocale,
    assetId: ASSET_ID,
    captionsAssetId: Type.Optional(ASSET_ID),
    accessibilityName: Type.String({ minLength: 1, maxLength: 300 }),
  },
  { $id: 'LocalizedMediaVariant', additionalProperties: false },
);
export type LocalizedMediaVariant = Static<typeof LocalizedMediaVariant>;

const LocalizedMediaProperties = {
  localeVariants: Type.Optional(Type.Array(Type.Ref(LocalizedMediaVariant), { maxItems: 50 })),
  fallbackLocale: Type.Optional(MediaLocale),
} as const;

export const MediaPresentation = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('image'),
        assetId: ASSET_ID,
        accessibilityName: Type.String({ minLength: 1, maxLength: 300 }),
        aspectRatio: Type.Optional(MediaAspectRatio),
        heightPx: Type.Optional(MediaHeightPx),
        fit: Type.Optional(MediaFit),
        widthPercent: Type.Optional(MediaWidthPercent),
        ...LocalizedMediaProperties,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('video'),
        assetId: ASSET_ID,
        accessibilityName: Type.String({ minLength: 1, maxLength: 300 }),
        posterAssetId: Type.Optional(ASSET_ID),
        captionsAssetId: Type.Optional(ASSET_ID),
        aspectRatio: Type.Optional(MediaAspectRatio),
        heightPx: Type.Optional(MediaHeightPx),
        fit: Type.Optional(MediaFit),
        widthPercent: Type.Optional(MediaWidthPercent),
        ...LocalizedMediaProperties,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'MediaPresentation' },
);
export type MediaPresentation = Static<typeof MediaPresentation>;

/** Selects only approved locale media metadata; the base asset remains the explicit fallback. */
export function resolveMediaPresentationForLocale(
  media: MediaPresentation,
  locale: string | undefined,
): MediaPresentation {
  if (!locale || !media.localeVariants?.length) return structuredClone(media);
  const normalizedLocale = locale.toLowerCase();
  const exact = media.localeVariants.find(
    (variant) => variant.locale.toLowerCase() === normalizedLocale,
  );
  const language = normalizedLocale.split('-')[0];
  const languageMatch = media.localeVariants.find(
    (variant) => variant.locale.toLowerCase().split('-')[0] === language,
  );
  const fallback = media.fallbackLocale
    ? media.localeVariants.find(
        (variant) => variant.locale.toLowerCase() === media.fallbackLocale!.toLowerCase(),
      )
    : undefined;
  const variant = exact ?? languageMatch ?? fallback;
  if (!variant) return structuredClone(media);
  const selected = {
    ...structuredClone(media),
    assetId: variant.assetId,
    accessibilityName: variant.accessibilityName,
  } as MediaPresentation;
  if ('captionsAssetId' in variant && variant.captionsAssetId) {
    if ('captionsAssetId' in selected) selected.captionsAssetId = variant.captionsAssetId;
  }
  return selected;
}

/** Closed form-control recipe. Values stay in the player; Lodariq does not read a customer database. */
export const FORM_FIELD_CONTROL_VALUES = ['checkbox', 'text', 'radio'] as const;
export type FormFieldControl = (typeof FORM_FIELD_CONTROL_VALUES)[number];
export const FORM_FIELD_SIZE_VALUES = ['compact', 'regular'] as const;
export type FormFieldSize = (typeof FORM_FIELD_SIZE_VALUES)[number];
export const FORM_FIELD_RADIUS_VALUES = ['theme', 'square', 'soft', 'round'] as const;
export type FormFieldRadius = (typeof FORM_FIELD_RADIUS_VALUES)[number];

/**
 * How the label and its control sit together.
 *
 * `hidden` keeps the label in the document and takes it off the screen — the
 * accessible name is never dropped, only the visible caption, so a field styled
 * down to a bare box still announces what it asks for.
 */
export const FORM_FIELD_LABEL_PLACEMENT_VALUES = ['above', 'beside', 'hidden'] as const;
export type FormFieldLabelPlacement = (typeof FORM_FIELD_LABEL_PLACEMENT_VALUES)[number];
export const FORM_FIELD_LABEL_SIZE_VALUES = ['small', 'regular', 'large'] as const;
export type FormFieldLabelSize = (typeof FORM_FIELD_LABEL_SIZE_VALUES)[number];
export const FORM_FIELD_LABEL_WEIGHT_VALUES = ['regular', 'medium', 'bold'] as const;
export type FormFieldLabelWeight = (typeof FORM_FIELD_LABEL_WEIGHT_VALUES)[number];
/** How much of the card the control itself takes. */
export const FORM_FIELD_CONTROL_WIDTH_VALUES = ['full', 'half', 'auto'] as const;
export type FormFieldControlWidth = (typeof FORM_FIELD_CONTROL_WIDTH_VALUES)[number];
export const FORM_FIELD_GAP_PX_LIMITS = { min: 0, max: 24 } as const;

const FORM_FIELD_CONTROL_SET = new Set<string>(FORM_FIELD_CONTROL_VALUES);
const FORM_FIELD_SIZE_SET = new Set<string>(FORM_FIELD_SIZE_VALUES);
const FORM_FIELD_RADIUS_SET = new Set<string>(FORM_FIELD_RADIUS_VALUES);
const FORM_FIELD_LABEL_PLACEMENT_SET = new Set<string>(FORM_FIELD_LABEL_PLACEMENT_VALUES);
const FORM_FIELD_LABEL_SIZE_SET = new Set<string>(FORM_FIELD_LABEL_SIZE_VALUES);
const FORM_FIELD_LABEL_WEIGHT_SET = new Set<string>(FORM_FIELD_LABEL_WEIGHT_VALUES);
const FORM_FIELD_CONTROL_WIDTH_SET = new Set<string>(FORM_FIELD_CONTROL_WIDTH_VALUES);
const FORM_FIELD_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u;
const FORM_FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const FORM_FIELD_OPTION_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

export const FormFieldPresentation = Type.Object(
  {
    control: Type.Union(FORM_FIELD_CONTROL_VALUES.map((value) => Type.Literal(value))),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' })),
    required: Type.Optional(Type.Boolean()),
    placeholder: Type.Optional(Type.String({ maxLength: 120 })),
    options: Type.Optional(
      Type.Array(
        Type.Object(
          {
            id: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' }),
            label: Type.String({ minLength: 1, maxLength: 80 }),
          },
          { additionalProperties: false },
        ),
        { minItems: 2, maxItems: 8 },
      ),
    ),
    fillColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
    textColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
    labelColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
    borderColor: Type.Optional(Type.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
    size: Type.Optional(Type.Union(FORM_FIELD_SIZE_VALUES.map((value) => Type.Literal(value)))),
    radius: Type.Optional(Type.Union(FORM_FIELD_RADIUS_VALUES.map((value) => Type.Literal(value)))),
    labelPlacement: Type.Optional(
      Type.Union(FORM_FIELD_LABEL_PLACEMENT_VALUES.map((value) => Type.Literal(value))),
    ),
    labelSize: Type.Optional(
      Type.Union(FORM_FIELD_LABEL_SIZE_VALUES.map((value) => Type.Literal(value))),
    ),
    labelWeight: Type.Optional(
      Type.Union(FORM_FIELD_LABEL_WEIGHT_VALUES.map((value) => Type.Literal(value))),
    ),
    controlWidth: Type.Optional(
      Type.Union(FORM_FIELD_CONTROL_WIDTH_VALUES.map((value) => Type.Literal(value))),
    ),
    /** Space between the label and its control, in CSS px. */
    gapPx: Type.Optional(
      Type.Integer({
        minimum: FORM_FIELD_GAP_PX_LIMITS.min,
        maximum: FORM_FIELD_GAP_PX_LIMITS.max,
      }),
    ),
  },
  { $id: 'FormFieldPresentation', additionalProperties: false },
);
export type FormFieldPresentation = Static<typeof FormFieldPresentation>;

export const SpotlightPresentation = Type.Object(
  {
    emphasis: Type.Union([
      Type.Literal('subtle'),
      Type.Literal('standard'),
      Type.Literal('strong'),
    ]),
    pulse: Type.Optional(Type.Boolean()),
  },
  { $id: 'SpotlightPresentation', additionalProperties: false },
);
export type SpotlightPresentation = Static<typeof SpotlightPresentation>;

export const CALLOUT_TONE_VALUES = ['info', 'success', 'warning'] as const;
export const STAT_EMPHASIS_VALUES = ['standard', 'strong'] as const;
export const ICON_RECIPE_VALUES = [
  'info',
  'check',
  'warning',
  'star',
  'rocket',
  'search',
  'link',
  'lock',
  'target',
  'settings',
  'heart',
  'sparkles',
  'play',
  'flag',
  'bell',
  'calendar',
  'circle-check',
  'triangle-alert',
  'lock-keyhole',
  'home',
  'user',
  'users',
  'mail',
  'phone',
  'map-pin',
  'globe',
  'clock',
  'camera',
  'image',
  'video',
  'music',
  'download',
  'upload',
  'share-2',
  'copy',
  'x',
  'plus',
  'minus',
  'arrow-right',
  'arrow-left',
  'chevron-right',
  'external-link',
  'eye',
  'eye-off',
  'shield',
  'key-round',
  'zap',
  'lightbulb',
  'gift',
  'trophy',
  'badge-check',
  'thumbs-up',
  'message-circle',
  'circle-help',
  'circle-dollar-sign',
  'chart-no-axes-column',
  'trending-up',
  'calendar-days',
  'bookmark',
  'tag',
  'shopping-cart',
  'credit-card',
  'package',
  'truck',
  'wrench',
  'laptop',
  'smartphone',
  'smile',
  'laugh',
  'party-popper',
] as const;
export const STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES = ['callout', 'stat', 'icon'] as const;

/** Deterministic renderer recipes for richer structured content blocks. */
export const StructuredCompositionPresentation = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('callout'),
        tone: Type.Union(CALLOUT_TONE_VALUES.map((value) => Type.Literal(value))),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('stat'),
        emphasis: Type.Union(STAT_EMPHASIS_VALUES.map((value) => Type.Literal(value))),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('icon'),
        icon: Type.Union(ICON_RECIPE_VALUES.map((value) => Type.Literal(value))),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'StructuredCompositionPresentation' },
);
export type StructuredCompositionPresentation = Static<typeof StructuredCompositionPresentation>;

export function sanitizeTourMotionPresentation(value: unknown): TourMotionPresentation | undefined {
  return checkedClone<TourMotionPresentation>(TourMotionPresentation, value);
}

export function sanitizeResponsiveStepPresentation(
  value: unknown,
): ResponsiveStepPresentation | undefined {
  return checkedClone<ResponsiveStepPresentation>(ResponsiveStepPresentation, value, [
    ResponsiveStepOverride,
  ]);
}

export function sanitizeMediaPresentation(value: unknown): MediaPresentation | undefined {
  return checkedClone<MediaPresentation>(MediaPresentation, value, [LocalizedMediaVariant]);
}

export function sanitizeFormFieldPresentation(value: unknown): FormFieldPresentation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (!FORM_FIELD_CONTROL_SET.has(record.control as string)) return undefined;
  const next: FormFieldPresentation = { control: record.control as FormFieldControl };
  if (typeof record.name === 'string' && FORM_FIELD_NAME_PATTERN.test(record.name)) {
    next.name = record.name;
  }
  if (record.required === true) next.required = true;
  if (typeof record.placeholder === 'string') {
    const placeholder = record.placeholder.trim().slice(0, 120);
    if (placeholder) next.placeholder = placeholder;
  }
  if (next.control === 'radio' && Array.isArray(record.options)) {
    const options = record.options.flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const item = option as Record<string, unknown>;
      if (typeof item.id !== 'string' || !FORM_FIELD_OPTION_ID_PATTERN.test(item.id)) return [];
      if (typeof item.label !== 'string') return [];
      const label = item.label.trim().slice(0, 80);
      return label ? [{ id: item.id, label }] : [];
    });
    if (options.length >= 2) next.options = options.slice(0, 8);
  }
  const fillColor = formFieldColor(record.fillColor);
  if (fillColor) next.fillColor = fillColor;
  const textColor = formFieldColor(record.textColor);
  if (textColor) next.textColor = textColor;
  const labelColor = formFieldColor(record.labelColor);
  if (labelColor) next.labelColor = labelColor;
  const borderColor = formFieldColor(record.borderColor);
  if (borderColor) next.borderColor = borderColor;
  if (typeof record.size === 'string' && FORM_FIELD_SIZE_SET.has(record.size)) {
    next.size = record.size as FormFieldSize;
  }
  if (typeof record.radius === 'string' && FORM_FIELD_RADIUS_SET.has(record.radius)) {
    next.radius = record.radius as FormFieldRadius;
  }
  if (
    typeof record.labelPlacement === 'string' &&
    FORM_FIELD_LABEL_PLACEMENT_SET.has(record.labelPlacement)
  ) {
    next.labelPlacement = record.labelPlacement as FormFieldLabelPlacement;
  }
  if (typeof record.labelSize === 'string' && FORM_FIELD_LABEL_SIZE_SET.has(record.labelSize)) {
    next.labelSize = record.labelSize as FormFieldLabelSize;
  }
  if (
    typeof record.labelWeight === 'string' &&
    FORM_FIELD_LABEL_WEIGHT_SET.has(record.labelWeight)
  ) {
    next.labelWeight = record.labelWeight as FormFieldLabelWeight;
  }
  if (
    typeof record.controlWidth === 'string' &&
    FORM_FIELD_CONTROL_WIDTH_SET.has(record.controlWidth)
  ) {
    next.controlWidth = record.controlWidth as FormFieldControlWidth;
  }
  if (
    typeof record.gapPx === 'number' &&
    Number.isInteger(record.gapPx) &&
    record.gapPx >= FORM_FIELD_GAP_PX_LIMITS.min &&
    record.gapPx <= FORM_FIELD_GAP_PX_LIMITS.max
  ) {
    next.gapPx = record.gapPx;
  }
  return next;
}

function formFieldColor(value: unknown): string | undefined {
  return typeof value === 'string' && FORM_FIELD_COLOR_PATTERN.test(value) ? value : undefined;
}

export function sanitizeSpotlightPresentation(value: unknown): SpotlightPresentation | undefined {
  return checkedClone<SpotlightPresentation>(SpotlightPresentation, value);
}

export function sanitizeStructuredCompositionPresentation(
  value: unknown,
): StructuredCompositionPresentation | undefined {
  return checkedClone<StructuredCompositionPresentation>(StructuredCompositionPresentation, value);
}

function checkedClone<T>(schema: object, value: unknown, references: object[] = []): T | undefined {
  if (!Value.Check(schema as never, references as never, value)) return undefined;
  return structuredClone(value as T);
}
