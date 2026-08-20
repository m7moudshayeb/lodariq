import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { StepChoreographyWait } from './choreography';

export const APPROACH_MAX_LEGS = 8;
export const APPROACH_LABEL_MAX_LENGTH = 120;
export const APPROACH_OUTCOMES = ['pass', 'fail', 'unknown'] as const;

const ApproachIdentifier = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});

/** What Lodariq does on this leg. Never a selector, never a coordinate. */
export const TargetApproachAct = Type.Union([
  Type.Object(
    { kind: Type.Literal('activateTarget'), targetId: ApproachIdentifier },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('navigate'), routePatternId: ApproachIdentifier },
    { additionalProperties: false },
  ),
  Type.Object({ kind: Type.Literal('observe') }, { additionalProperties: false }),
]);
export type TargetApproachAct = Static<typeof TargetApproachAct>;

export const TargetApproachLeg = Type.Object(
  {
    act: TargetApproachAct,
    /** Semantic condition, never a timer. */
    wait: Type.Optional(Type.Ref(StepChoreographyWait)),
    /** Plain-language line rendered in the inspector. */
    label: Type.String({ minLength: 1, maxLength: APPROACH_LABEL_MAX_LENGTH }),
  },
  { $id: 'TargetApproachLeg', additionalProperties: false },
);
export type TargetApproachLeg = Static<typeof TargetApproachLeg>;

/**
 * How the runtime reaches a target that is not on the current screen. Recorded
 * from the route the creator actually took, replayable, and editable per leg.
 */
export const TargetApproach = Type.Object(
  {
    legs: Type.Array(Type.Ref(TargetApproachLeg), { minItems: 1, maxItems: APPROACH_MAX_LEGS }),
    lastOutcome: Type.Optional(
      Type.Union(APPROACH_OUTCOMES.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'TargetApproach', additionalProperties: false },
);
export type TargetApproach = Static<typeof TargetApproach>;

const APPROACH_REFERENCES = [StepChoreographyWait, TargetApproachLeg];

export function sanitizeTargetApproach(value: unknown): TargetApproach | undefined {
  if (!Value.Check(TargetApproach, APPROACH_REFERENCES, value)) return undefined;
  return structuredClone(value as TargetApproach);
}
