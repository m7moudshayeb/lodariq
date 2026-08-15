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
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'MediaPresentation' },
);
export type MediaPresentation = Static<typeof MediaPresentation>;

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
  return checkedClone<MediaPresentation>(MediaPresentation, value);
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
