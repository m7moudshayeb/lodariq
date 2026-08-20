import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const SUCCESS_EVENT_WINDOW_DAYS = [1, 7, 14, 30, 90] as const;
export const EXPERIMENT_STATUSES = ['draft', 'running', 'stopped', 'promoted'] as const;
export const EXPERIMENT_VARIES = ['copy', 'placement', 'style', 'media'] as const;
export const EXPERIMENT_ARM_IDS = ['A', 'B', 'C', 'D'] as const;
export const EXPERIMENT_MAX_ARMS = 4;
export const EXPERIMENT_MIN_TRAFFIC_PERCENT = 5;
export const EXPERIMENT_SIGNIFICANCE_THRESHOLD = 95;

const EventName = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: '^[a-z][a-z0-9_]*$',
});

/**
 * A behaviour in the product that proves the experience worked. Adoption impact
 * is measured against this, never against clicks on the experience itself.
 */
export const SuccessEvent = Type.Object(
  {
    eventName: EventName,
    windowDays: Type.Union(SUCCESS_EVENT_WINDOW_DAYS.map((value) => Type.Literal(value))),
    label: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { $id: 'SuccessEvent', additionalProperties: false },
);
export type SuccessEvent = Static<typeof SuccessEvent>;

export const AdoptionImpact = Type.Object(
  {
    eventName: EventName,
    windowDays: Type.Integer({ minimum: 1, maximum: 90 }),
    baselineRate: Type.Number({ minimum: 0, maximum: 1 }),
    treatedRate: Type.Number({ minimum: 0, maximum: 1 }),
    baselineCount: Type.Integer({ minimum: 0 }),
    treatedCount: Type.Integer({ minimum: 0 }),
    /** Null until both cohorts clear the reporting floor. */
    confidencePercent: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  },
  { $id: 'AdoptionImpact', additionalProperties: false },
);
export type AdoptionImpact = Static<typeof AdoptionImpact>;

export const ExperimentArm = Type.Object(
  {
    id: Type.Union(EXPERIMENT_ARM_IDS.map((value) => Type.Literal(value))),
    label: Type.String({ minLength: 1, maxLength: 160 }),
    trafficPercent: Type.Integer({ minimum: EXPERIMENT_MIN_TRAFFIC_PERCENT, maximum: 100 }),
    /** Locale-independent content overrides applied on top of the base document. */
    overridesRef: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  },
  { $id: 'ExperimentArm', additionalProperties: false },
);
export type ExperimentArm = Static<typeof ExperimentArm>;

/** Two arms of one experience consume one live slot, not two. */
export const Experiment = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    status: Type.Union(EXPERIMENT_STATUSES.map((value) => Type.Literal(value))),
    varies: Type.Union(EXPERIMENT_VARIES.map((value) => Type.Literal(value))),
    successEventName: EventName,
    arms: Type.Array(Type.Ref(ExperimentArm), { minItems: 2, maxItems: EXPERIMENT_MAX_ARMS }),
  },
  { $id: 'Experiment', additionalProperties: false },
);
export type Experiment = Static<typeof Experiment>;

export const ExperimentArmResult = Type.Object(
  {
    armId: Type.Union(EXPERIMENT_ARM_IDS.map((value) => Type.Literal(value))),
    exposures: Type.Integer({ minimum: 0 }),
    conversions: Type.Integer({ minimum: 0 }),
    conversionRate: Type.Number({ minimum: 0, maximum: 1 }),
  },
  { $id: 'ExperimentArmResult', additionalProperties: false },
);
export type ExperimentArmResult = Static<typeof ExperimentArmResult>;

export const ExperimentResults = Type.Object(
  {
    experimentId: Type.String({ minLength: 1, maxLength: 128 }),
    arms: Type.Array(Type.Ref(ExperimentArmResult), { minItems: 2, maxItems: EXPERIMENT_MAX_ARMS }),
    leadingArmId: Type.Union([
      ...EXPERIMENT_ARM_IDS.map((value) => Type.Literal(value)),
      Type.Null(),
    ]),
    confidencePercent: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  },
  { $id: 'ExperimentResults', additionalProperties: false },
);
export type ExperimentResults = Static<typeof ExperimentResults>;

/** Telemetry-derived behaviours used to skip steps the user has already shown. */
export const AdaptivePolicy = Type.Object(
  {
    enabled: Type.Boolean(),
    /** Minimum occurrences before a behaviour counts as demonstrated. */
    minimumOccurrences: Type.Integer({ minimum: 1, maximum: 20 }),
    lookbackDays: Type.Integer({ minimum: 1, maximum: 365 }),
  },
  { $id: 'AdaptivePolicy', additionalProperties: false },
);
export type AdaptivePolicy = Static<typeof AdaptivePolicy>;

export function sanitizeSuccessEvent(value: unknown): SuccessEvent | undefined {
  return check<SuccessEvent>(SuccessEvent, [], value);
}
export function sanitizeExperiment(value: unknown): Experiment | undefined {
  return check<Experiment>(Experiment, [ExperimentArm], value);
}
export function sanitizeAdaptivePolicy(value: unknown): AdaptivePolicy | undefined {
  return check<AdaptivePolicy>(AdaptivePolicy, [], value);
}

function check<T>(schema: object, references: object[], value: unknown): T | undefined {
  if (!Value.Check(schema as never, references as never, value)) return undefined;
  return structuredClone(value as T);
}
