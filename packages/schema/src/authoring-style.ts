import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ButtonStyleProps, TextStyleProps, TooltipLayoutProps, TooltipStyleProps } from './block';

export const TOUR_STEP_STYLE_CONTENT_ROLES = ['heading', 'body', 'list'] as const;

export const TourStepStyleContent = Type.Object(
  {
    role: Type.Union(TOUR_STEP_STYLE_CONTENT_ROLES.map((role) => Type.Literal(role))),
    style: Type.Ref(TextStyleProps),
  },
  { $id: 'TourStepStyleContent', additionalProperties: false },
);
export type TourStepStyleContent = Static<typeof TourStepStyleContent>;

/**
 * Sanitized semantic projection used by authoring copy/paste and recipes.
 * Targets, authored copy, URLs, actions, conditions, and choreography are
 * intentionally impossible to represent here.
 */
export const TourStepStyleSnapshot = Type.Object(
  {
    popupLayout: Type.Optional(Type.Ref(TooltipLayoutProps)),
    popupStyle: Type.Optional(Type.Ref(TooltipStyleProps)),
    primaryActionStyle: Type.Optional(Type.Ref(ButtonStyleProps)),
    contentStyles: Type.Optional(
      Type.Array(Type.Ref(TourStepStyleContent), {
        maxItems: TOUR_STEP_STYLE_CONTENT_ROLES.length,
      }),
    ),
  },
  { $id: 'TourStepStyleSnapshot', additionalProperties: false },
);
export type TourStepStyleSnapshot = Static<typeof TourStepStyleSnapshot>;

export function isTourStepStyleSnapshot(value: unknown): value is TourStepStyleSnapshot {
  return Value.Check(
    TourStepStyleSnapshot,
    [TooltipLayoutProps, TooltipStyleProps, ButtonStyleProps, TextStyleProps, TourStepStyleContent],
    value,
  );
}
