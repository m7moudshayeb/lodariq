import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const BACKDROP_CLICK_BEHAVIORS = ['none', 'advance', 'dismiss'] as const;
export const EMPHASIS_TOKEN_ROLES = ['accent', 'ink', 'border', 'onAccent'] as const;
export const TARGET_OUTLINE_LINES = ['solid', 'dashed', 'dotted'] as const;
export const VIEWPORT_FOCUS_BEHAVIORS = ['scroll-into-view', 'zoom'] as const;

export const BACKDROP_DIM_PERCENT_LIMITS = { min: 0, max: 90 } as const;
export const TARGET_OUTLINE_WEIGHT_PX_LIMITS = { min: 1, max: 6 } as const;
export const TARGET_OUTLINE_OFFSET_PX_LIMITS = { min: 0, max: 24 } as const;
export const TARGET_OUTLINE_RADIUS_PX_LIMITS = { min: 0, max: 48 } as const;
export const VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS = { min: 100, max: 200 } as const;

const EmphasisTokenRole = Type.Union(EMPHASIS_TOKEN_ROLES.map((value) => Type.Literal(value)));

/** Dims everything except the target. Colour derives from a theme role, never a literal. */
export const StepBackdrop = Type.Object(
  {
    dimPercent: Type.Integer({
      minimum: BACKDROP_DIM_PERCENT_LIMITS.min,
      maximum: BACKDROP_DIM_PERCENT_LIMITS.max,
    }),
    clickBehavior: Type.Union(BACKDROP_CLICK_BEHAVIORS.map((value) => Type.Literal(value))),
    tintRole: Type.Optional(EmphasisTokenRole),
  },
  { $id: 'StepBackdrop', additionalProperties: false },
);
export type StepBackdrop = Static<typeof StepBackdrop>;

/** Per-step ring treatment layered on the theme default (ADR-0013: roles, not hex). */
/** Same six-digit hex the popup surface accepts; a role stays the default. */
const OUTLINE_COLOR_PATTERN = '^#[0-9a-fA-F]{6}$';

export const TargetOutline = Type.Object(
  {
    colorRole: Type.Optional(EmphasisTokenRole),
    /** A literal override for one step. Absent means the theme role decides. */
    color: Type.Optional(Type.String({ pattern: OUTLINE_COLOR_PATTERN })),
    weightPx: Type.Optional(
      Type.Integer({
        minimum: TARGET_OUTLINE_WEIGHT_PX_LIMITS.min,
        maximum: TARGET_OUTLINE_WEIGHT_PX_LIMITS.max,
      }),
    ),
    offsetPx: Type.Optional(
      Type.Integer({
        minimum: TARGET_OUTLINE_OFFSET_PX_LIMITS.min,
        maximum: TARGET_OUTLINE_OFFSET_PX_LIMITS.max,
      }),
    ),
    line: Type.Optional(Type.Union(TARGET_OUTLINE_LINES.map((value) => Type.Literal(value)))),
    glow: Type.Optional(Type.Boolean()),
    pulse: Type.Optional(Type.Boolean()),
    /** Inheriting the element's own radius is what makes the ring read as part of the product. */
    followTargetRadius: Type.Optional(Type.Boolean()),
    radiusPx: Type.Optional(
      Type.Integer({
        minimum: TARGET_OUTLINE_RADIUS_PX_LIMITS.min,
        maximum: TARGET_OUTLINE_RADIUS_PX_LIMITS.max,
      }),
    ),
  },
  { $id: 'TargetOutline', additionalProperties: false, minProperties: 1 },
);
export type TargetOutline = Static<typeof TargetOutline>;

/**
 * `scroll-into-view` is the default because a page-level transform fights the host's
 * own sticky headers and rect-based positioning. `zoom` is opt-in per step.
 */
export const ViewportFocus = Type.Object(
  {
    behavior: Type.Union(VIEWPORT_FOCUS_BEHAVIORS.map((value) => Type.Literal(value))),
    scalePercent: Type.Optional(
      Type.Integer({
        minimum: VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS.min,
        maximum: VIEWPORT_FOCUS_SCALE_PERCENT_LIMITS.max,
      }),
    ),
  },
  { $id: 'ViewportFocus', additionalProperties: false },
);
export type ViewportFocus = Static<typeof ViewportFocus>;

export const StepEmphasis = Type.Object(
  {
    backdrop: Type.Optional(Type.Ref(StepBackdrop)),
    targetOutline: Type.Optional(Type.Ref(TargetOutline)),
    viewportFocus: Type.Optional(Type.Ref(ViewportFocus)),
  },
  { $id: 'StepEmphasis', additionalProperties: false, minProperties: 1 },
);
export type StepEmphasis = Static<typeof StepEmphasis>;

const EMPHASIS_REFERENCES = [StepBackdrop, TargetOutline, ViewportFocus];

export function sanitizeStepEmphasis(value: unknown): StepEmphasis | undefined {
  if (!Value.Check(StepEmphasis, EMPHASIS_REFERENCES, value)) return undefined;
  return structuredClone(value as StepEmphasis);
}
