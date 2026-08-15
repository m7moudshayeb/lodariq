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

export const MediaPresentation = Type.Union(
  [
    Type.Object(
      {
        kind: Type.Literal('image'),
        assetId: ASSET_ID,
        accessibilityName: Type.String({ minLength: 1, maxLength: 300 }),
        aspectRatio: Type.Optional(
          Type.Union([Type.Literal('16:9'), Type.Literal('4:3'), Type.Literal('1:1')]),
        ),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        kind: Type.Literal('video'),
        assetId: ASSET_ID,
        accessibilityName: Type.String({ minLength: 1, maxLength: 300 }),
        posterAssetId: Type.Optional(ASSET_ID),
        captionsAssetId: ASSET_ID,
        aspectRatio: Type.Optional(
          Type.Union([Type.Literal('16:9'), Type.Literal('4:3'), Type.Literal('1:1')]),
        ),
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

function checkedClone<T>(schema: object, value: unknown, references: object[] = []): T | undefined {
  if (!Value.Check(schema as never, references as never, value)) return undefined;
  return structuredClone(value as T);
}
