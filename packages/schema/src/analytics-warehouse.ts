import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const ANALYTICS_WAREHOUSE_CONTRACT_VERSION = '2026-08-22.1' as const;

const Identifier = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$',
});
const Timestamp = Type.String({ format: 'date-time' });

export const AnalyticsWarehouseCheckpoint = Type.Object(
  {
    ingestedAt: Timestamp,
    eventId: Identifier,
  },
  { $id: 'AnalyticsWarehouseCheckpoint', additionalProperties: false },
);
export type AnalyticsWarehouseCheckpoint = Static<typeof AnalyticsWarehouseCheckpoint>;

export const AnalyticsWarehouseDestination = Type.Object(
  {
    schemaVersion: Type.Literal(ANALYTICS_WAREHOUSE_CONTRACT_VERSION),
    id: Type.String({ pattern: '^whdest_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    workspaceId: Identifier,
    environmentId: Identifier,
    documentId: Type.Optional(Identifier),
    name: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    provider: Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z][a-z0-9-]*$' }),
    credentialReference: Type.String({
      minLength: 1,
      maxLength: 256,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$',
    }),
    enabled: Type.Boolean(),
    revision: Type.Integer({ minimum: 1 }),
    checkpoint: Type.Union([Type.Ref(AnalyticsWarehouseCheckpoint), Type.Null()]),
    lastSyncedAt: Type.Union([Timestamp, Type.Null()]),
    lastErrorCode: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    createdByUserId: Identifier,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  },
  { $id: 'AnalyticsWarehouseDestination', additionalProperties: false },
);
export type AnalyticsWarehouseDestination = Static<typeof AnalyticsWarehouseDestination>;

export const CreateAnalyticsWarehouseDestinationRequest = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    provider: Type.String({ minLength: 1, maxLength: 80, pattern: '^[a-z][a-z0-9-]*$' }),
    environmentId: Identifier,
    documentId: Type.Optional(Identifier),
    credentialReference: Type.String({
      minLength: 1,
      maxLength: 256,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$',
    }),
  },
  { $id: 'CreateAnalyticsWarehouseDestinationRequest', additionalProperties: false },
);
export type CreateAnalyticsWarehouseDestinationRequest = Static<
  typeof CreateAnalyticsWarehouseDestinationRequest
>;

export const AnalyticsWarehouseDestinationList = Type.Object(
  { destinations: Type.Array(Type.Ref(AnalyticsWarehouseDestination), { maxItems: 100 }) },
  { $id: 'AnalyticsWarehouseDestinationList', additionalProperties: false },
);

export const AnalyticsWarehouseSyncRun = Type.Object(
  {
    id: Type.String({ pattern: '^whrun_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    destinationId: Type.String({ pattern: '^whdest_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    status: Type.Union([Type.Literal('succeeded'), Type.Literal('failed')]),
    eventCount: Type.Integer({ minimum: 0, maximum: 1_000 }),
    batchHash: Type.Union([
      Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
      Type.Null(),
    ]),
    providerBatchId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    checkpoint: Type.Union([Type.Ref(AnalyticsWarehouseCheckpoint), Type.Null()]),
    attemptCount: Type.Integer({ minimum: 1, maximum: 8 }),
    errorCode: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    occurredAt: Timestamp,
  },
  { $id: 'AnalyticsWarehouseSyncRun', additionalProperties: false },
);
export type AnalyticsWarehouseSyncRun = Static<typeof AnalyticsWarehouseSyncRun>;

export const AnalyticsWarehouseSyncRunList = Type.Object(
  { runs: Type.Array(Type.Ref(AnalyticsWarehouseSyncRun), { maxItems: 100 }) },
  { $id: 'AnalyticsWarehouseSyncRunList', additionalProperties: false },
);

export const ANALYTICS_WAREHOUSE_REFERENCE_SCHEMAS: TSchema[] = [
  AnalyticsWarehouseCheckpoint,
  AnalyticsWarehouseDestination,
  AnalyticsWarehouseSyncRun,
];

export const ANALYTICS_WAREHOUSE_SCHEMAS: TSchema[] = [
  CreateAnalyticsWarehouseDestinationRequest,
  AnalyticsWarehouseDestinationList,
  AnalyticsWarehouseSyncRunList,
];
