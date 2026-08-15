import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const CHOREOGRAPHY_IDENTIFIER_OPTIONS = {
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
} as const;
const CHOREOGRAPHY_TEXT_OPTIONS = { minLength: 1, maxLength: 512 } as const;

export const STEP_CHOREOGRAPHY_TIMEOUT_LIMITS = {
  min: 250,
  max: 60_000,
} as const;
export const STEP_CHOREOGRAPHY_MAX_WAIT_STAGES = 8;

export const StepChoreographyTrigger = Type.Union(
  [
    Type.Object(
      {
        type: Type.Literal('activateTarget'),
        targetId: Type.Optional(Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('observeTargetClick'),
        targetId: Type.Optional(Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS)),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('observeTargetFocus'),
        targetId: Type.Optional(Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS)),
      },
      { additionalProperties: false },
    ),
    Type.Object({ type: Type.Literal('manual') }, { additionalProperties: false }),
  ],
  { $id: 'StepChoreographyTrigger' },
);
export type StepChoreographyTrigger = Static<typeof StepChoreographyTrigger>;

export const StepChoreographyWait = Type.Union(
  [
    Type.Object(
      {
        type: Type.Literal('targetAvailable'),
        targetId: Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('route'),
        match: Type.Union([
          Type.Literal('exact'),
          Type.Literal('prefix'),
          Type.Literal('contains'),
        ]),
        value: Type.String(CHOREOGRAPHY_TEXT_OPTIONS),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('textVisible'),
        value: Type.String(CHOREOGRAPHY_TEXT_OPTIONS),
        locale: Type.String({ minLength: 2, maxLength: 35 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('event'),
        eventName: Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS),
      },
      { additionalProperties: false },
    ),
    Type.Object({ type: Type.Literal('networkIdle') }, { additionalProperties: false }),
  ],
  { $id: 'StepChoreographyWait' },
);
export type StepChoreographyWait = Static<typeof StepChoreographyWait>;

export const StepChoreographyTransition = Type.Union(
  [
    Type.Object({ type: Type.Literal('next') }, { additionalProperties: false }),
    Type.Object({ type: Type.Literal('complete') }, { additionalProperties: false }),
    Type.Object({ type: Type.Literal('stay') }, { additionalProperties: false }),
    Type.Object(
      {
        type: Type.Literal('step'),
        stepId: Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'StepChoreographyTransition' },
);
export type StepChoreographyTransition = Static<typeof StepChoreographyTransition>;

/**
 * Closed, cancelable product choreography. It can only activate semantically
 * resolved targets and wait on bounded Lodariq-known conditions.
 */
const StepChoreographyBase = {
  trigger: Type.Ref(StepChoreographyTrigger),
  waitFor: Type.Array(Type.Ref(StepChoreographyWait), {
    maxItems: STEP_CHOREOGRAPHY_MAX_WAIT_STAGES,
  }),
  transition: Type.Ref(StepChoreographyTransition),
  timeoutMs: Type.Integer({
    minimum: STEP_CHOREOGRAPHY_TIMEOUT_LIMITS.min,
    maximum: STEP_CHOREOGRAPHY_TIMEOUT_LIMITS.max,
  }),
} as const;

export const StepChoreography = Type.Union(
  [
    Type.Object(
      {
        ...StepChoreographyBase,
        onTimeout: Type.Union([
          Type.Literal('retry'),
          Type.Literal('stay'),
          Type.Literal('skip'),
          Type.Literal('dismiss'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...StepChoreographyBase,
        onTimeout: Type.Literal('goToStep'),
        timeoutStepId: Type.String(CHOREOGRAPHY_IDENTIFIER_OPTIONS),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'StepChoreography' },
);
export type StepChoreography = Static<typeof StepChoreography>;

export function sanitizeStepChoreography(value: unknown): StepChoreography | undefined {
  if (
    !Value.Check(
      StepChoreography,
      [StepChoreographyTrigger, StepChoreographyWait, StepChoreographyTransition],
      value,
    )
  ) {
    return undefined;
  }
  return structuredClone(value as StepChoreography);
}
