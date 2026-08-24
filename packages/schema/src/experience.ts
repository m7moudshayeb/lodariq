import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const ANNOUNCEMENT_FREQUENCY_MODES = ['always', 'session', 'visitor'] as const;
export const HOTSPOT_MARKER_FORMS = ['pulse', 'dot', 'ring', 'number'] as const;
export const HOTSPOT_ACTIVATION_MODES = ['click', 'hover', 'focus'] as const;
export const SURVEY_SUBMISSION_MODES = ['once', 'repeatable'] as const;

export const TOUR_STEP_INDICATOR_STYLES = ['none', 'count', 'dots', 'bar'] as const;
/** `inline` shares the action row; `block` takes its own line above the actions. */
export const TOUR_STEP_INDICATOR_PLACEMENTS = ['block', 'inline'] as const;
/** Wording preset for the `count` style. Localized at render time — never authored free text. */
export const TOUR_STEP_INDICATOR_COUNT_FORMS = ['bare', 'labeled'] as const;
/** Past this many steps a dot row stops being readable, so `dots` degrades to `count`. */
export const TOUR_STEP_INDICATOR_DOTS_MAX_STEPS = 8;

export const AnnouncementBehavior = Type.Object(
  {
    type: Type.Literal('announcement'),
    frequency: Type.Union(ANNOUNCEMENT_FREQUENCY_MODES.map((value) => Type.Literal(value))),
    dismissible: Type.Boolean(),
  },
  { $id: 'AnnouncementBehavior', additionalProperties: false },
);
export type AnnouncementBehavior = Static<typeof AnnouncementBehavior>;

export const HotspotBehavior = Type.Object(
  {
    type: Type.Literal('hotspot'),
    marker: Type.Union(HOTSPOT_MARKER_FORMS.map((value) => Type.Literal(value))),
    activation: Type.Union(HOTSPOT_ACTIVATION_MODES.map((value) => Type.Literal(value))),
  },
  { $id: 'HotspotBehavior', additionalProperties: false },
);
export type HotspotBehavior = Static<typeof HotspotBehavior>;

export const SurveyBehavior = Type.Object(
  {
    type: Type.Literal('survey'),
    submission: Type.Union(SURVEY_SUBMISSION_MODES.map((value) => Type.Literal(value))),
    requireAnswer: Type.Boolean(),
  },
  { $id: 'SurveyBehavior', additionalProperties: false },
);
export type SurveyBehavior = Static<typeof SurveyBehavior>;

export const ChecklistBehavior = Type.Object(
  {
    type: Type.Literal('checklist'),
    showProgress: Type.Boolean(),
    completion: Type.Literal('allItems'),
  },
  { $id: 'ChecklistBehavior', additionalProperties: false },
);
export type ChecklistBehavior = Static<typeof ChecklistBehavior>;

export const TourBehavior = Type.Object(
  {
    type: Type.Literal('tour'),
    /**
     * Step position indicator. Absent — or `none` — renders the card exactly as it
     * did before this field existed, which is what every pre-existing tour gets.
     */
    stepIndicator: Type.Optional(
      Type.Union(TOUR_STEP_INDICATOR_STYLES.map((value) => Type.Literal(value))),
    ),
    stepIndicatorPlacement: Type.Optional(
      Type.Union(TOUR_STEP_INDICATOR_PLACEMENTS.map((value) => Type.Literal(value))),
    ),
    stepIndicatorCountForm: Type.Optional(
      Type.Union(TOUR_STEP_INDICATOR_COUNT_FORMS.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'TourBehavior', additionalProperties: false },
);
export type TourBehavior = Static<typeof TourBehavior>;

/** Closed authoring behavior for every experience the creator can release. */
export const ExperienceBehavior = Type.Union(
  [
    Type.Ref(TourBehavior),
    Type.Ref(AnnouncementBehavior),
    Type.Ref(HotspotBehavior),
    Type.Ref(SurveyBehavior),
    Type.Ref(ChecklistBehavior),
  ],
  { $id: 'ExperienceBehavior' },
);
export type ExperienceBehavior = Static<typeof ExperienceBehavior>;

export const DEFAULT_EXPERIENCE_BEHAVIORS = Object.freeze({
  tour: Object.freeze({ type: 'tour' as const }),
  announcement: Object.freeze({
    type: 'announcement' as const,
    frequency: 'session' as const,
    dismissible: true,
  }),
  hotspot: Object.freeze({
    type: 'hotspot' as const,
    marker: 'pulse' as const,
    activation: 'click' as const,
  }),
  survey: Object.freeze({
    type: 'survey' as const,
    submission: 'once' as const,
    requireAnswer: true,
  }),
  checklist: Object.freeze({
    type: 'checklist' as const,
    showProgress: true,
    completion: 'allItems' as const,
  }),
});

export type DeliverableExperienceType = keyof typeof DEFAULT_EXPERIENCE_BEHAVIORS;

export function defaultExperienceBehavior(type: DeliverableExperienceType): ExperienceBehavior {
  return structuredClone(DEFAULT_EXPERIENCE_BEHAVIORS[type]);
}

export function sanitizeExperienceBehavior(
  type: DeliverableExperienceType,
  value: unknown,
): ExperienceBehavior {
  if (isExperienceBehaviorForType(type, value)) {
    return structuredClone(value);
  }
  return defaultExperienceBehavior(type);
}

export function isExperienceBehaviorForType(
  type: DeliverableExperienceType,
  value: unknown,
): value is ExperienceBehavior {
  const behaviorSchemas = {
    announcement: AnnouncementBehavior,
    checklist: ChecklistBehavior,
    hotspot: HotspotBehavior,
    survey: SurveyBehavior,
    tour: TourBehavior,
  } as const;
  return Value.Check(behaviorSchemas[type], value);
}

export function isDeliverableExperienceType(value: unknown): value is DeliverableExperienceType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(DEFAULT_EXPERIENCE_BEHAVIORS, value)
  );
}

const CompiledBlockId = Type.String({ minLength: 1, maxLength: 128 });

/** Renderer-ready behavior. Surface form is explicit and content identities stay semantic. */
export const CompiledExperienceBehavior = Type.Union(
  [
    Type.Object(
      { ...TourBehavior.properties, surface: Type.Literal('popup') },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...AnnouncementBehavior.properties,
        surface: Type.Union([
          Type.Literal('modal'),
          Type.Literal('banner'),
          Type.Literal('slideIn'),
        ]),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...HotspotBehavior.properties,
        surface: Type.Literal('hotspot'),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...SurveyBehavior.properties,
        surface: Type.Literal('modal'),
        questionBlockIds: Type.Array(CompiledBlockId, { maxItems: 50, uniqueItems: true }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...ChecklistBehavior.properties,
        surface: Type.Union([Type.Literal('drawer'), Type.Literal('floating')]),
        itemBlockIds: Type.Array(CompiledBlockId, { maxItems: 100, uniqueItems: true }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'CompiledExperienceBehavior' },
);
export type CompiledExperienceBehavior = Static<typeof CompiledExperienceBehavior>;
