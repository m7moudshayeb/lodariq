import { Type, type Static } from '@sinclair/typebox';
import { ApplicationSummary } from './application';
import {
  AdaptivePolicy,
  AdoptionImpact,
  EXPERIMENT_ARM_IDS,
  EXPERIMENT_MAX_ARMS,
  EXPERIMENT_STATUSES,
  EXPERIMENT_VARIES,
  Experiment,
  ExperimentArm,
  ExperimentResults,
  SUCCESS_EVENT_WINDOW_DAYS,
  SuccessEvent,
} from './measurement';

/**
 * The control-plane surface behind the Operations sheet.
 *
 * Everything here is *about* an experience rather than part of it, which is why
 * none of it is compiled into the artifact: a success event can change without
 * republishing, and a running experiment must not force a new content hash.
 */

export const DocumentIdParam = Type.Object(
  { documentId: Type.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false },
);
export type DocumentIdParam = Static<typeof DocumentIdParam>;

/** Steps carry no counts of their own; the funnel is derived from delivery events. */
export const ExperienceFunnelStep = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    reached: Type.Integer({ minimum: 0 }),
    completed: Type.Integer({ minimum: 0 }),
  },
  { $id: 'ExperienceFunnelStep', additionalProperties: false },
);
export type ExperienceFunnelStep = Static<typeof ExperienceFunnelStep>;

export const ExperienceFormResponseSummary = Type.Object(
  {
    blockId: Type.String({ minLength: 1, maxLength: 128 }),
    label: Type.String({ minLength: 1, maxLength: 200 }),
    answerCount: Type.Integer({ minimum: 0 }),
    topAnswer: Type.Union([Type.String({ maxLength: 2_000 }), Type.Null()]),
  },
  { $id: 'ExperienceFormResponseSummary', additionalProperties: false },
);
export type ExperienceFormResponseSummary = Static<typeof ExperienceFormResponseSummary>;

export const ExperienceAnalytics = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 128 }),
    environmentId: Type.String({ minLength: 1, maxLength: 128 }),
    shown: Type.Integer({ minimum: 0 }),
    completed: Type.Integer({ minimum: 0 }),
    dismissed: Type.Integer({ minimum: 0 }),
    funnel: Type.Array(Type.Ref(ExperienceFunnelStep), { maxItems: 200 }),
    adoption: Type.Array(Type.Ref(AdoptionImpact), { maxItems: 8 }),
    formResponses: Type.Array(Type.Ref(ExperienceFormResponseSummary), { maxItems: 100 }),
  },
  { $id: 'ExperienceAnalytics', additionalProperties: false },
);
export type ExperienceAnalytics = Static<typeof ExperienceAnalytics>;

export const EXPERIENCE_SESSION_OUTCOMES = [
  'completed',
  'dismissed',
  'skipped',
  'abandoned',
] as const;

/**
 * One beat of one visitor's pass through the experience. Deliberately narrow:
 * what the experience did, not what the page did. ADR-0015 forbids recording
 * pointer or keystroke streams, and nothing here would let one be reconstructed.
 */
export const ExperienceSessionBeat = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 64 }),
    at: Type.String({ format: 'date-time' }),
    offsetMs: Type.Integer({ minimum: 0 }),
    stepId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    resolved: Type.Optional(Type.Boolean()),
    reasonCode: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { $id: 'ExperienceSessionBeat', additionalProperties: false },
);
export type ExperienceSessionBeat = Static<typeof ExperienceSessionBeat>;

export const ExperienceSession = Type.Object(
  {
    correlationId: Type.String({ minLength: 1, maxLength: 128 }),
    startedAt: Type.String({ format: 'date-time' }),
    endedAt: Type.String({ format: 'date-time' }),
    durationMs: Type.Integer({ minimum: 0 }),
    outcome: Type.Union(EXPERIENCE_SESSION_OUTCOMES.map((value) => Type.Literal(value))),
    stepsReached: Type.Integer({ minimum: 0 }),
    unresolvedStepIds: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 200 }),
    beats: Type.Array(Type.Ref(ExperienceSessionBeat), { maxItems: 200 }),
  },
  { $id: 'ExperienceSession', additionalProperties: false },
);
export type ExperienceSession = Static<typeof ExperienceSession>;
export type ExperienceSessionOutcome = ExperienceSession['outcome'];

export const ExperienceSessionsResponse = Type.Object(
  { sessions: Type.Array(Type.Ref(ExperienceSession), { maxItems: 100 }) },
  { $id: 'ExperienceSessionsResponse', additionalProperties: false },
);
export type ExperienceSessionsResponse = Static<typeof ExperienceSessionsResponse>;

export const ExperienceMeasurementConfig = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 128 }),
    successEvent: Type.Optional(Type.Ref(SuccessEvent)),
    adaptivePolicy: Type.Ref(AdaptivePolicy),
  },
  { $id: 'ExperienceMeasurementConfig', additionalProperties: false },
);
export type ExperienceMeasurementConfig = Static<typeof ExperienceMeasurementConfig>;

export const UpdateExperienceMeasurementBody = Type.Object(
  {
    successEvent: Type.Optional(
      Type.Union([
        Type.Object(
          {
            eventName: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' }),
            windowDays: Type.Union(SUCCESS_EVENT_WINDOW_DAYS.map((value) => Type.Literal(value))),
            label: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
          },
          { additionalProperties: false },
        ),
        Type.Null(),
      ]),
    ),
    adaptivePolicy: Type.Optional(Type.Ref(AdaptivePolicy)),
  },
  { $id: 'UpdateExperienceMeasurementBody', additionalProperties: false, minProperties: 1 },
);
export type UpdateExperienceMeasurementBody = Static<typeof UpdateExperienceMeasurementBody>;

export const CreateExperimentBody = Type.Object(
  {
    varies: Type.Union(EXPERIMENT_VARIES.map((value) => Type.Literal(value))),
    successEventName: Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9_]*$' }),
    arms: Type.Array(Type.Ref(ExperimentArm), { minItems: 2, maxItems: EXPERIMENT_MAX_ARMS }),
  },
  { $id: 'CreateExperimentBody', additionalProperties: false },
);
export type CreateExperimentBody = Static<typeof CreateExperimentBody>;

export const UpdateExperimentBody = Type.Object(
  {
    status: Type.Optional(Type.Union(EXPERIMENT_STATUSES.map((value) => Type.Literal(value)))),
    arms: Type.Optional(
      Type.Array(Type.Ref(ExperimentArm), { minItems: 2, maxItems: EXPERIMENT_MAX_ARMS }),
    ),
    promotedArmId: Type.Optional(
      Type.Union(EXPERIMENT_ARM_IDS.map((value) => Type.Literal(value))),
    ),
  },
  { $id: 'UpdateExperimentBody', additionalProperties: false, minProperties: 1 },
);
export type UpdateExperimentBody = Static<typeof UpdateExperimentBody>;

export const ExperimentResponse = Type.Object(
  {
    experiment: Type.Union([Type.Ref(Experiment), Type.Null()]),
    results: Type.Union([Type.Ref(ExperimentResults), Type.Null()]),
  },
  { $id: 'ExperimentResponse', additionalProperties: false },
);
export type ExperimentResponse = Static<typeof ExperimentResponse>;

export const ExperienceComment = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    author: Type.String({ minLength: 1, maxLength: 160 }),
    body: Type.String({ minLength: 1, maxLength: 2_000 }),
    resolved: Type.Boolean(),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceComment', additionalProperties: false },
);
export type ExperienceComment = Static<typeof ExperienceComment>;

export const CreateExperienceCommentBody = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    body: Type.String({ minLength: 1, maxLength: 2_000 }),
  },
  { $id: 'CreateExperienceCommentBody', additionalProperties: false },
);
export type CreateExperienceCommentBody = Static<typeof CreateExperienceCommentBody>;

export const ResolveExperienceCommentBody = Type.Object(
  { resolved: Type.Boolean() },
  { $id: 'ResolveExperienceCommentBody', additionalProperties: false },
);
export type ResolveExperienceCommentBody = Static<typeof ResolveExperienceCommentBody>;

/** A lease, not a lock: it lapses so a closed laptop never blocks a colleague. */
export const EXPERIENCE_STEP_LOCK_TTL_SECONDS = 180;

export const ExperienceStepLock = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    holderName: Type.String({ minLength: 1, maxLength: 160 }),
    holderUserId: Type.String({ minLength: 1, maxLength: 128 }),
    expiresAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceStepLock', additionalProperties: false },
);
export type ExperienceStepLock = Static<typeof ExperienceStepLock>;

export const ClaimExperienceStepLockBody = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    sessionId: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { $id: 'ClaimExperienceStepLockBody', additionalProperties: false },
);
export type ClaimExperienceStepLockBody = Static<typeof ClaimExperienceStepLockBody>;

export const ExperienceStepLocksResponse = Type.Object(
  { locks: Type.Array(Type.Ref(ExperienceStepLock), { maxItems: 200 }) },
  { $id: 'ExperienceStepLocksResponse', additionalProperties: false },
);
export type ExperienceStepLocksResponse = Static<typeof ExperienceStepLocksResponse>;

export const ExperienceCommentsResponse = Type.Object(
  { comments: Type.Array(Type.Ref(ExperienceComment), { maxItems: 500 }) },
  { $id: 'ExperienceCommentsResponse', additionalProperties: false },
);
export type ExperienceCommentsResponse = Static<typeof ExperienceCommentsResponse>;

export const WorkspaceApplicationsResponse = Type.Object(
  { applications: Type.Array(Type.Ref(ApplicationSummary), { maxItems: 64 }) },
  { $id: 'WorkspaceApplicationsResponse', additionalProperties: false },
);
export type WorkspaceApplicationsResponse = Static<typeof WorkspaceApplicationsResponse>;

export const UpsertWorkspaceApplicationBody = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$' }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    originPatterns: Type.Array(Type.String({ minLength: 1, maxLength: 253 }), {
      minItems: 1,
      maxItems: 32,
    }),
    themeId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    isPrimary: Type.Boolean(),
  },
  { $id: 'UpsertWorkspaceApplicationBody', additionalProperties: false },
);
export type UpsertWorkspaceApplicationBody = Static<typeof UpsertWorkspaceApplicationBody>;

/** Answers are captured through their own endpoint, never as an analytics payload. */
export const RecordFormResponsesBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 128 }),
    responses: Type.Array(
      Type.Object(
        {
          stepId: Type.String({ minLength: 1, maxLength: 128 }),
          blockId: Type.String({ minLength: 1, maxLength: 128 }),
          label: Type.String({ minLength: 1, maxLength: 200 }),
          answer: Type.String({ minLength: 1, maxLength: 2_000 }),
          correlationId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
          occurredAt: Type.String({ format: 'date-time' }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { $id: 'RecordFormResponsesBody', additionalProperties: false },
);
export type RecordFormResponsesBody = Static<typeof RecordFormResponsesBody>;

/**
 * The visitor-facing half of answer capture. The environment and workspace come
 * from the SDK credential, never from the body — a page can say which experience
 * it is running, not which workspace it belongs to.
 */
export const SdkFormResponsesBody = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 128 }),
    responses: Type.Array(
      Type.Object(
        {
          stepId: Type.String({ minLength: 1, maxLength: 128 }),
          blockId: Type.String({ minLength: 1, maxLength: 128 }),
          label: Type.String({ minLength: 1, maxLength: 200 }),
          answer: Type.String({ minLength: 1, maxLength: 2_000 }),
          correlationId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
          occurredAt: Type.String({ format: 'date-time' }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 50 },
    ),
  },
  { $id: 'SdkFormResponsesBody', additionalProperties: false },
);
export type SdkFormResponsesBody = Static<typeof SdkFormResponsesBody>;

export const EXPERIENCE_MEASUREMENT_SCHEMAS = [
  ExperienceFunnelStep,
  ExperienceFormResponseSummary,
  ExperienceAnalytics,
  ExperienceSessionBeat,
  ExperienceSession,
  ExperienceSessionsResponse,
  ExperienceMeasurementConfig,
  UpdateExperienceMeasurementBody,
  CreateExperimentBody,
  UpdateExperimentBody,
  ExperimentResponse,
  ExperienceComment,
  CreateExperienceCommentBody,
  ResolveExperienceCommentBody,
  ExperienceStepLock,
  ClaimExperienceStepLockBody,
  ExperienceStepLocksResponse,
  ExperienceCommentsResponse,
  WorkspaceApplicationsResponse,
  UpsertWorkspaceApplicationBody,
  RecordFormResponsesBody,
  SdkFormResponsesBody,
] as const;
