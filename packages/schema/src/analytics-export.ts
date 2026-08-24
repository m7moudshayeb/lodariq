import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const ANALYTICS_EXPORT_DEFINITION_VERSION = 1 as const;

export const ANALYTICS_EXPORT_KINDS = ['summary-csv', 'raw-events-jsonl'] as const;
export const AnalyticsExportKind = Type.Union(
  ANALYTICS_EXPORT_KINDS.map((kind) => Type.Literal(kind)),
  { $id: 'AnalyticsExportKind' },
);
export type AnalyticsExportKind = Static<typeof AnalyticsExportKind>;

export const ANALYTICS_EXPORT_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'expired',
] as const;
export const AnalyticsExportStatus = Type.Union(
  ANALYTICS_EXPORT_STATUSES.map((status) => Type.Literal(status)),
  { $id: 'AnalyticsExportStatus' },
);
export type AnalyticsExportStatus = Static<typeof AnalyticsExportStatus>;

export const AnalyticsExportRelease = Type.Object(
  {
    publicationId: Type.String({ minLength: 1, maxLength: 128 }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    pointerGeneration: Type.Integer({ minimum: 1 }),
  },
  { $id: 'AnalyticsExportRelease', additionalProperties: false },
);
export type AnalyticsExportRelease = Static<typeof AnalyticsExportRelease>;

export const CreateAnalyticsExportRequest = Type.Object(
  {
    operationId: Type.String({ pattern: '^anxop_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    kind: Type.Ref(AnalyticsExportKind),
    release: Type.Optional(Type.Ref(AnalyticsExportRelease)),
  },
  { $id: 'CreateAnalyticsExportRequest', additionalProperties: false },
);
export type CreateAnalyticsExportRequest = Static<typeof CreateAnalyticsExportRequest>;

export const AnalyticsExportJob = Type.Object(
  {
    id: Type.String({ pattern: '^anx_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    kind: Type.Ref(AnalyticsExportKind),
    status: Type.Ref(AnalyticsExportStatus),
    definitionVersion: Type.Literal(ANALYTICS_EXPORT_DEFINITION_VERSION),
    environmentId: Type.String({ minLength: 1, maxLength: 128 }),
    documentId: Type.String({ minLength: 1, maxLength: 128 }),
    release: Type.Optional(Type.Ref(AnalyticsExportRelease)),
    retentionCutoff: Type.String({ format: 'date-time' }),
    attemptCount: Type.Integer({ minimum: 0, maximum: 3 }),
    maxAttempts: Type.Integer({ minimum: 1, maximum: 3 }),
    filename: Type.Optional(Type.String({ minLength: 1, maxLength: 240 })),
    byteLength: Type.Optional(Type.Integer({ minimum: 0, maximum: 16_777_216 })),
    contentHash: Type.Optional(Type.String({ pattern: '^sha256-[0-9a-f]{64}$' })),
    errorCode: Type.Optional(
      Type.Union([
        Type.Literal('source_unavailable'),
        Type.Literal('result_too_large'),
        Type.Literal('generation_failed'),
      ]),
    ),
    createdAt: Type.String({ format: 'date-time' }),
    startedAt: Type.Optional(Type.String({ format: 'date-time' })),
    completedAt: Type.Optional(Type.String({ format: 'date-time' })),
    resultExpiresAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { $id: 'AnalyticsExportJob', additionalProperties: false },
);
export type AnalyticsExportJob = Static<typeof AnalyticsExportJob>;

export const AnalyticsExportJobList = Type.Object(
  { jobs: Type.Array(AnalyticsExportJob, { maxItems: 100 }) },
  { $id: 'AnalyticsExportJobList', additionalProperties: false },
);
export type AnalyticsExportJobList = Static<typeof AnalyticsExportJobList>;

export const ANALYTICS_EXPORT_SCHEMAS: TSchema[] = [
  AnalyticsExportKind,
  AnalyticsExportStatus,
  AnalyticsExportRelease,
  CreateAnalyticsExportRequest,
  AnalyticsExportJob,
  AnalyticsExportJobList,
];

export const ANALYTICS_EXPORT_REFERENCE_SCHEMAS: TSchema[] = [
  AnalyticsExportKind,
  AnalyticsExportStatus,
  AnalyticsExportRelease,
];
