import { Type, type Static } from '@sinclair/typebox';

const ISO_TIMESTAMP_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$';
const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';
const IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$';

export const DEPLOYMENT_SCHEDULE_STATUSES = [
  'scheduled',
  'active',
  'completed',
  'cancelled',
  'failed',
] as const;

export const DeploymentScheduleStatus = Type.Union(
  DEPLOYMENT_SCHEDULE_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'DeploymentScheduleStatus' },
);
export type DeploymentScheduleStatus = Static<typeof DeploymentScheduleStatus>;

export const DeploymentSchedule = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1, maxLength: 256 }),
    publicationId: Type.String({ minLength: 1, maxLength: 256 }),
    artifactId: Type.String({ minLength: 1, maxLength: 512 }),
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    startAt: Type.String({ pattern: ISO_TIMESTAMP_PATTERN }),
    endAt: Type.Optional(Type.String({ pattern: ISO_TIMESTAMP_PATTERN })),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    status: Type.Ref(DeploymentScheduleStatus),
    revision: Type.Integer({ minimum: 1 }),
    createdByUserId: Type.String({ minLength: 1, maxLength: 256 }),
    createdAt: Type.String({ pattern: ISO_TIMESTAMP_PATTERN }),
    updatedAt: Type.String({ pattern: ISO_TIMESTAMP_PATTERN }),
  },
  { $id: 'DeploymentSchedule', additionalProperties: false },
);
export type DeploymentSchedule = Static<typeof DeploymentSchedule>;

export const DeploymentScheduleList = Type.Object(
  { schedules: Type.Array(DeploymentSchedule, { maxItems: 500 }) },
  { $id: 'DeploymentScheduleList', additionalProperties: false },
);
export type DeploymentScheduleList = Static<typeof DeploymentScheduleList>;

export const CreateDeploymentScheduleBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    publicationId: Type.String({ minLength: 1, maxLength: 256 }),
    startAt: Type.String({ pattern: ISO_TIMESTAMP_PATTERN }),
    endAt: Type.Optional(Type.String({ pattern: ISO_TIMESTAMP_PATTERN })),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    idempotencyKey: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: IDEMPOTENCY_KEY_PATTERN,
    }),
  },
  { $id: 'CreateDeploymentScheduleBody', additionalProperties: false },
);
export type CreateDeploymentScheduleBody = Static<typeof CreateDeploymentScheduleBody>;

export const CancelDeploymentScheduleBody = Type.Object(
  { expectedRevision: Type.Integer({ minimum: 1 }) },
  { $id: 'CancelDeploymentScheduleBody', additionalProperties: false },
);
export type CancelDeploymentScheduleBody = Static<typeof CancelDeploymentScheduleBody>;

export const DELIVERY_TRANSITION_OUTCOMES = ['applied', 'conflict', 'failed'] as const;
export const DeliveryTransitionOutcome = Type.Union(
  DELIVERY_TRANSITION_OUTCOMES.map((outcome) => Type.Literal(outcome)),
  { $id: 'DeliveryTransitionOutcome' },
);
export type DeliveryTransitionOutcome = Static<typeof DeliveryTransitionOutcome>;

export const DeliveryTransitionHistoryEntry = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1, maxLength: 256 }),
    scheduleId: Type.String({ minLength: 1, maxLength: 256 }),
    jobId: Type.String({ minLength: 1, maxLength: 256 }),
    transition: Type.Union([Type.Literal('start'), Type.Literal('end')]),
    outcome: Type.Ref(DeliveryTransitionOutcome),
    fromGeneration: Type.Integer({ minimum: 0 }),
    toGeneration: Type.Integer({ minimum: 0 }),
    fromPublicationId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    toPublicationId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    reasonCode: Type.Optional(
      Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z0-9_]+$' }),
    ),
    occurredAt: Type.String({ pattern: ISO_TIMESTAMP_PATTERN }),
  },
  { $id: 'DeliveryTransitionHistoryEntry', additionalProperties: false },
);
export type DeliveryTransitionHistoryEntry = Static<typeof DeliveryTransitionHistoryEntry>;

export const DeliveryTransitionHistoryList = Type.Object(
  { history: Type.Array(DeliveryTransitionHistoryEntry, { maxItems: 1_000 }) },
  { $id: 'DeliveryTransitionHistoryList', additionalProperties: false },
);
export type DeliveryTransitionHistoryList = Static<typeof DeliveryTransitionHistoryList>;
