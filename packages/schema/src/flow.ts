import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const FLOW_IDENTIFIER = {
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
} as const;
const FLOW_VALUE = Type.Union([Type.String({ maxLength: 256 }), Type.Number(), Type.Boolean()]);

export const STEP_TRANSITION_MAX_RULES = 8;
export const STEP_TRANSITION_MAX_CONDITIONS = 4;

export const StepTransitionDestination = Type.Union(
  [
    Type.Object({ type: Type.Literal('next') }, { additionalProperties: false }),
    Type.Object({ type: Type.Literal('complete') }, { additionalProperties: false }),
    Type.Object({ type: Type.Literal('dismiss') }, { additionalProperties: false }),
    Type.Object(
      { type: Type.Literal('step'), stepId: Type.String(FLOW_IDENTIFIER) },
      { additionalProperties: false },
    ),
  ],
  { $id: 'StepTransitionDestination' },
);
export type StepTransitionDestination = Static<typeof StepTransitionDestination>;

export const StepTransitionCondition = Type.Union(
  [
    Type.Object(
      {
        source: Type.Literal('identifyTrait'),
        key: Type.String(FLOW_IDENTIFIER),
        operator: Type.Union([
          Type.Literal('equals'),
          Type.Literal('notEquals'),
          Type.Literal('exists'),
        ]),
        value: Type.Optional(FLOW_VALUE),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        source: Type.Literal('documentState'),
        key: Type.String(FLOW_IDENTIFIER),
        operator: Type.Union([
          Type.Literal('equals'),
          Type.Literal('notEquals'),
          Type.Literal('exists'),
        ]),
        value: Type.Optional(FLOW_VALUE),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      { source: Type.Literal('namedEvent'), eventName: Type.String(FLOW_IDENTIFIER) },
      { additionalProperties: false },
    ),
    Type.Object(
      { source: Type.Literal('locale'), locale: Type.String({ minLength: 2, maxLength: 35 }) },
      { additionalProperties: false },
    ),
    Type.Object(
      { source: Type.Literal('completedStep'), stepId: Type.String(FLOW_IDENTIFIER) },
      { additionalProperties: false },
    ),
  ],
  { $id: 'StepTransitionCondition' },
);
export type StepTransitionCondition = Static<typeof StepTransitionCondition>;

export const StepTransitionRule = Type.Object(
  {
    all: Type.Array(Type.Ref(StepTransitionCondition), {
      minItems: 1,
      maxItems: STEP_TRANSITION_MAX_CONDITIONS,
    }),
    to: Type.Ref(StepTransitionDestination),
  },
  { $id: 'StepTransitionRule', additionalProperties: false },
);
export type StepTransitionRule = Static<typeof StepTransitionRule>;

/** Ordered rules plus a required deterministic fallback edge. */
export const StepTransition = Type.Object(
  {
    rules: Type.Array(Type.Ref(StepTransitionRule), { maxItems: STEP_TRANSITION_MAX_RULES }),
    fallback: Type.Ref(StepTransitionDestination),
  },
  { $id: 'StepTransition', additionalProperties: false },
);
export type StepTransition = Static<typeof StepTransition>;

export function sanitizeStepTransition(value: unknown): StepTransition | undefined {
  if (
    !Value.Check(
      StepTransition,
      [StepTransitionDestination, StepTransitionCondition, StepTransitionRule],
      value,
    )
  ) {
    return undefined;
  }
  return structuredClone(value as StepTransition);
}
