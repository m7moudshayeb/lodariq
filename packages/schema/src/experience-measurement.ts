import { Type, type Static } from '@sinclair/typebox';
import { ApplicationSummary } from './application';
import { ContentLocale } from './document-localization';
import { AnalyticsAudienceSegmentIdentity } from './events';
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
 * Measurement stays mutable; closed experiment variants compile into the next
 * immutable artifact while traffic allocation remains operational state.
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

const ExperienceAnalyticsCounts = {
  shown: Type.Integer({ minimum: 0 }),
  completed: Type.Integer({ minimum: 0 }),
  dismissed: Type.Integer({ minimum: 0 }),
  funnel: Type.Array(Type.Ref(ExperienceFunnelStep), { maxItems: 200 }),
  adoption: Type.Array(Type.Ref(AdoptionImpact), { maxItems: 8 }),
  formResponses: Type.Array(Type.Ref(ExperienceFormResponseSummary), { maxItems: 100 }),
};

export const ExperienceReleaseAnalytics = Type.Object(
  {
    publicationId: Type.String({ minLength: 1, maxLength: 128 }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    pointerGeneration: Type.Integer({ minimum: 1 }),
    audienceSegment: Type.Optional(Type.Ref(AnalyticsAudienceSegmentIdentity)),
    ...ExperienceAnalyticsCounts,
  },
  { $id: 'ExperienceReleaseAnalytics', additionalProperties: false },
);
export type ExperienceReleaseAnalytics = Static<typeof ExperienceReleaseAnalytics>;

export const ExperienceLocaleAnalytics = Type.Object(
  {
    locale: Type.Ref(ContentLocale),
    ...ExperienceAnalyticsCounts,
  },
  { $id: 'ExperienceLocaleAnalytics', additionalProperties: false },
);
export type ExperienceLocaleAnalytics = Static<typeof ExperienceLocaleAnalytics>;

export const ExperienceAudienceSegmentAnalytics = Type.Object(
  {
    ...AnalyticsAudienceSegmentIdentity.properties,
    ...ExperienceAnalyticsCounts,
  },
  { $id: 'ExperienceAudienceSegmentAnalytics', additionalProperties: false },
);
export type ExperienceAudienceSegmentAnalytics = Static<typeof ExperienceAudienceSegmentAnalytics>;

export const ExperienceRetentionWeek = Type.Object(
  {
    week: Type.Integer({ minimum: 0, maximum: 51 }),
    exposedCohort: Type.Integer({ minimum: 0 }),
    exposedReturned: Type.Integer({ minimum: 0 }),
    baselineCohort: Type.Integer({ minimum: 0 }),
    baselineReturned: Type.Integer({ minimum: 0 }),
  },
  { $id: 'ExperienceRetentionWeek', additionalProperties: false },
);
export type ExperienceRetentionWeek = Static<typeof ExperienceRetentionWeek>;

export const ExperienceAnalyticsBreakdown = Type.Object(
  {
    definitionVersion: Type.Literal(1),
    asOf: Type.String({ format: 'date-time' }),
    retentionDays: Type.Integer({ minimum: 1, maximum: 3_650 }),
    retentionCutoff: Type.String({ format: 'date-time' }),
    releases: Type.Array(Type.Ref(ExperienceReleaseAnalytics), { maxItems: 100 }),
    locales: Type.Array(Type.Ref(ExperienceLocaleAnalytics), { maxItems: 50 }),
    audienceSegments: Type.Optional(
      Type.Array(Type.Ref(ExperienceAudienceSegmentAnalytics), { maxItems: 100 }),
    ),
    retention: Type.Array(Type.Ref(ExperienceRetentionWeek), { maxItems: 52 }),
  },
  { $id: 'ExperienceAnalyticsBreakdown', additionalProperties: false },
);
export type ExperienceAnalyticsBreakdown = Static<typeof ExperienceAnalyticsBreakdown>;

export const ExperienceAnalytics = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 128 }),
    environmentId: Type.String({ minLength: 1, maxLength: 128 }),
    ...ExperienceAnalyticsCounts,
    breakdown: Type.Optional(Type.Ref(ExperienceAnalyticsBreakdown)),
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

export const ExperienceCommentAnchor = Type.Union(
  [
    Type.Object(
      {
        type: Type.Literal('step'),
        stepId: Type.String({ minLength: 1, maxLength: 128 }),
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        type: Type.Literal('target'),
        stepId: Type.String({ minLength: 1, maxLength: 128 }),
        targetId: Type.String({ minLength: 1, maxLength: 128 }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'ExperienceCommentAnchor' },
);
export type ExperienceCommentAnchor = Static<typeof ExperienceCommentAnchor>;

export const ExperienceCommentReply = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    author: Type.String({ minLength: 1, maxLength: 160 }),
    body: Type.String({ minLength: 1, maxLength: 2_000 }),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceCommentReply', additionalProperties: false },
);
export type ExperienceCommentReply = Static<typeof ExperienceCommentReply>;

export const ExperienceComment = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    anchor: Type.Ref(ExperienceCommentAnchor),
    author: Type.String({ minLength: 1, maxLength: 160 }),
    body: Type.String({ minLength: 1, maxLength: 2_000 }),
    replies: Type.Array(Type.Ref(ExperienceCommentReply), { maxItems: 200 }),
    resolved: Type.Boolean(),
    resolvedAt: Type.Optional(Type.String({ format: 'date-time' })),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceComment', additionalProperties: false },
);
export type ExperienceComment = Static<typeof ExperienceComment>;

export const CreateExperienceCommentBody = Type.Object(
  {
    anchor: Type.Ref(ExperienceCommentAnchor),
    body: Type.String({ minLength: 1, maxLength: 2_000 }),
  },
  { $id: 'CreateExperienceCommentBody', additionalProperties: false },
);
export type CreateExperienceCommentBody = Static<typeof CreateExperienceCommentBody>;

export const ReplyExperienceCommentBody = Type.Object(
  { body: Type.String({ minLength: 1, maxLength: 2_000 }) },
  { $id: 'ReplyExperienceCommentBody', additionalProperties: false },
);
export type ReplyExperienceCommentBody = Static<typeof ReplyExperienceCommentBody>;

export const ResolveExperienceCommentBody = Type.Object(
  { resolved: Type.Boolean() },
  { $id: 'ResolveExperienceCommentBody', additionalProperties: false },
);
export type ResolveExperienceCommentBody = Static<typeof ResolveExperienceCommentBody>;

export const EXPERIENCE_COMMENT_AUDIT_EVENT_TYPES = [
  'thread_created',
  'reply_added',
  'thread_resolved',
  'thread_reopened',
] as const;

export const ExperienceCommentAuditEvent = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 128 }),
    threadId: Type.String({ minLength: 1, maxLength: 128 }),
    commentId: Type.String({ minLength: 1, maxLength: 128 }),
    eventType: Type.Union(EXPERIENCE_COMMENT_AUDIT_EVENT_TYPES.map((value) => Type.Literal(value))),
    actorUserId: Type.String({ minLength: 1, maxLength: 128 }),
    occurredAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceCommentAuditEvent', additionalProperties: false },
);
export type ExperienceCommentAuditEvent = Static<typeof ExperienceCommentAuditEvent>;

/**
 * Collaboration is semantic and deliberately small. It reports where a creator
 * is inside the canonical document without carrying DOM paths, selectors,
 * coordinates, text input, or editor state.
 */
export const AUTHORING_PRESENCE_TTL_SECONDS = 30;
export const AUTHORING_PRESENCE_HEARTBEAT_SECONDS = 10;

export const AuthoringPresenceSelection = Type.Union(
  [
    Type.Object(
      { type: Type.Literal('block'), blockId: Type.String({ minLength: 1, maxLength: 128 }) },
      { additionalProperties: false },
    ),
    Type.Object(
      { type: Type.Literal('target'), targetId: Type.String({ minLength: 1, maxLength: 128 }) },
      { additionalProperties: false },
    ),
  ],
  { $id: 'AuthoringPresenceSelection' },
);
export type AuthoringPresenceSelection = Static<typeof AuthoringPresenceSelection>;

export const AuthoringPresenceHeartbeatBody = Type.Object(
  {
    stepId: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
    selection: Type.Union([Type.Ref(AuthoringPresenceSelection), Type.Null()]),
    /** Exact draft version held by this client, when its host exposes one. */
    documentUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { $id: 'AuthoringPresenceHeartbeatBody', additionalProperties: false },
);
export type AuthoringPresenceHeartbeatBody = Static<typeof AuthoringPresenceHeartbeatBody>;

export const AuthoringPresencePeer = Type.Object(
  {
    participantId: Type.String({ pattern: '^presence_[a-f0-9]{24}$' }),
    creatorId: Type.String({ minLength: 1, maxLength: 128 }),
    name: Type.String({ minLength: 1, maxLength: 160 }),
    stepId: Type.Union([Type.String({ minLength: 1, maxLength: 128 }), Type.Null()]),
    selection: Type.Union([Type.Ref(AuthoringPresenceSelection), Type.Null()]),
    lastSeenAt: Type.String({ format: 'date-time' }),
    /** True for another active authoring session owned by the current creator. */
    sameCreator: Type.Boolean(),
  },
  { $id: 'AuthoringPresencePeer', additionalProperties: false },
);
export type AuthoringPresencePeer = Static<typeof AuthoringPresencePeer>;

/** `holderParticipantId` is the opaque handle a peer is addressed by; the
 * holder's user id is not part of the snapshot. */
export const AuthoringCollaborationStepLock = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    holderName: Type.String({ minLength: 1, maxLength: 160 }),
    holderParticipantId: Type.Optional(Type.String({ pattern: '^presence_[a-f0-9]{24}$' })),
    expiresAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'AuthoringCollaborationStepLock', additionalProperties: false },
);
export type AuthoringCollaborationStepLock = Static<typeof AuthoringCollaborationStepLock>;

export const AuthoringCollaborationSnapshot = Type.Object(
  {
    selfParticipantId: Type.String({ pattern: '^presence_[a-f0-9]{24}$' }),
    generatedAt: Type.String({ format: 'date-time' }),
    documentUpdatedAt: Type.String({ format: 'date-time' }),
    /** The canonical draft moved beyond the exact version this client reported. */
    draftChanged: Type.Boolean(),
    peers: Type.Array(Type.Ref(AuthoringPresencePeer), { maxItems: 100 }),
    locks: Type.Array(Type.Ref(AuthoringCollaborationStepLock), { maxItems: 200 }),
    comments: Type.Array(Type.Ref(ExperienceComment), { maxItems: 500 }),
  },
  { $id: 'AuthoringCollaborationSnapshot', additionalProperties: false },
);
export type AuthoringCollaborationSnapshot = Static<typeof AuthoringCollaborationSnapshot>;

export const AuthoringCollaborationEvent = Type.Object(
  {
    eventId: Type.String({ minLength: 1, maxLength: 80 }),
    snapshot: Type.Ref(AuthoringCollaborationSnapshot),
  },
  { $id: 'AuthoringCollaborationEvent', additionalProperties: false },
);
export type AuthoringCollaborationEvent = Static<typeof AuthoringCollaborationEvent>;

/** A lease, not a lock: it lapses so a closed laptop never blocks a colleague. */
export const EXPERIENCE_STEP_LOCK_TTL_SECONDS = 180;
export const EXPERIENCE_STEP_LOCK_HEARTBEAT_SECONDS = EXPERIENCE_STEP_LOCK_TTL_SECONDS / 2;

/**
 * What a colleague is allowed to know: which step, who by name, and until when.
 * The holder's internal user id stays server-side — `holderName` is the whole
 * UX intent, and the id is a workspace-wide identifier this response has no
 * reason to hand to a page.
 */
export const ExperienceStepLock = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    holderName: Type.String({ minLength: 1, maxLength: 160 }),
    expiresAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'ExperienceStepLock', additionalProperties: false },
);
export type ExperienceStepLock = Static<typeof ExperienceStepLock>;

export const ClaimExperienceStepLockBody = Type.Object(
  {
    stepId: Type.String({ minLength: 1, maxLength: 128 }),
    /** Required by control-plane callers; authoring routes bind the authenticated session. */
    sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    takeover: Type.Optional(Type.Boolean()),
  },
  { $id: 'ClaimExperienceStepLockBody', additionalProperties: false },
);
export type ClaimExperienceStepLockBody = Static<typeof ClaimExperienceStepLockBody>;

export const ExperienceStepLockClaimResponse = Type.Object(
  {
    lock: Type.Ref(ExperienceStepLock),
    acquired: Type.Boolean(),
    canTakeover: Type.Boolean(),
  },
  { $id: 'ExperienceStepLockClaimResponse', additionalProperties: false },
);
export type ExperienceStepLockClaimResponse = Static<typeof ExperienceStepLockClaimResponse>;

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
  ExperienceReleaseAnalytics,
  ExperienceLocaleAnalytics,
  ExperienceAudienceSegmentAnalytics,
  ExperienceRetentionWeek,
  ExperienceAnalyticsBreakdown,
  ExperienceAnalytics,
  ExperienceSessionBeat,
  ExperienceSession,
  ExperienceSessionsResponse,
  ExperienceMeasurementConfig,
  UpdateExperienceMeasurementBody,
  CreateExperimentBody,
  UpdateExperimentBody,
  ExperimentResponse,
  ExperienceCommentAnchor,
  ExperienceCommentReply,
  ExperienceComment,
  CreateExperienceCommentBody,
  ReplyExperienceCommentBody,
  ResolveExperienceCommentBody,
  ExperienceCommentAuditEvent,
  AuthoringPresenceSelection,
  AuthoringPresenceHeartbeatBody,
  AuthoringPresencePeer,
  AuthoringCollaborationStepLock,
  AuthoringCollaborationSnapshot,
  AuthoringCollaborationEvent,
  ExperienceStepLock,
  ClaimExperienceStepLockBody,
  ExperienceStepLockClaimResponse,
  ExperienceStepLocksResponse,
  ExperienceCommentsResponse,
  WorkspaceApplicationsResponse,
  UpsertWorkspaceApplicationBody,
  RecordFormResponsesBody,
  SdkFormResponsesBody,
] as const;
