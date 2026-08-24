import { createHash } from 'node:crypto';
import type {
  AnalyticsWarehouseCheckpoint,
  AnalyticsWarehouseDestination,
  AnalyticsWarehouseSyncRun,
} from '@lodariq/schema/analytics-warehouse';
import type { PersistedAnalyticsEventRecord } from './analytics';

export const ANALYTICS_WAREHOUSE_BATCH_SIZE = 1_000;
export const ANALYTICS_WAREHOUSE_MAX_ATTEMPTS = 8;
export const ANALYTICS_WAREHOUSE_LEASE_MS = 2 * 60 * 1_000;

export interface AnalyticsWarehouseDestinationRecord extends AnalyticsWarehouseDestination {
  operationId: string;
  requestHash: string;
  attemptCount: number;
  nextAttemptAt: string;
  leaseWorkerId?: string;
  leaseExpiresAt?: string;
}

export interface AnalyticsWarehouseSyncRunRecord extends AnalyticsWarehouseSyncRun {
  workspaceId: string;
}

export interface WarehouseAnalyticsEvent {
  schemaVersion: 1;
  eventId: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  publicationId: string;
  contentHash: string;
  pointerGeneration: number;
  experimentId?: string;
  armId?: string;
  experimentAllocationRevision?: number;
  audienceSegment?: PersistedAnalyticsEventRecord['audienceSegment'];
  name: string;
  stepId?: string;
  sdkVersion: string;
  correlationId?: string;
  timestamp: string;
  props?: PersistedAnalyticsEventRecord['props'];
  ingestedAt: string;
}

export interface AnalyticsWarehouseDeliveryBatch {
  contractVersion: '2026-08-22.1';
  destinationId: string;
  workspaceId: string;
  environmentId: string;
  documentId?: string;
  events: WarehouseAnalyticsEvent[];
  batchHash: string;
}

export interface CreateAnalyticsWarehouseDestinationInput {
  destination: AnalyticsWarehouseDestinationRecord;
}

export interface ClaimAnalyticsWarehouseDestinationsInput {
  workerId: string;
  now: string;
  limit: number;
}

export interface ReadAnalyticsWarehouseEventsInput {
  destination: AnalyticsWarehouseDestinationRecord;
  limit?: number;
}

export interface CompleteAnalyticsWarehouseDeliveryInput {
  workspaceId: string;
  destinationId: string;
  workerId: string;
  runId: string;
  events: readonly PersistedAnalyticsEventRecord[];
  providerBatchId: string;
  reportedEventCount: number;
  reportedBatchHash: string;
  completedAt: string;
}

export interface FailAnalyticsWarehouseDeliveryInput {
  workspaceId: string;
  destinationId: string;
  workerId: string;
  runId: string;
  errorCode: string;
  failedAt: string;
  nextAttemptAt: string;
}

export interface AnalyticsWarehouseRepository {
  listAnalyticsWarehouseDestinations(
    workspaceId: string,
  ): Promise<AnalyticsWarehouseDestinationRecord[]>;
  createAnalyticsWarehouseDestination(
    input: CreateAnalyticsWarehouseDestinationInput,
  ): Promise<AnalyticsWarehouseDestinationRecord>;
  disableAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    expectedRevision: number,
    disabledAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null>;
  triggerAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    triggeredAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null>;
  claimAnalyticsWarehouseDestinations(
    input: ClaimAnalyticsWarehouseDestinationsInput,
  ): Promise<AnalyticsWarehouseDestinationRecord[]>;
  readAnalyticsWarehouseEvents(
    input: ReadAnalyticsWarehouseEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]>;
  completeAnalyticsWarehouseDelivery(
    input: CompleteAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null>;
  failAnalyticsWarehouseDelivery(
    input: FailAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null>;
  releaseEmptyAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    workerId: string,
    checkedAt: string,
    nextAttemptAt: string,
  ): Promise<boolean>;
  listAnalyticsWarehouseSyncRuns(
    workspaceId: string,
    destinationId?: string,
  ): Promise<AnalyticsWarehouseSyncRunRecord[]>;
}

export class AnalyticsWarehouseDestinationConflictError extends Error {
  readonly code = 'analytics_warehouse_destination_conflict';

  constructor() {
    super('Warehouse destination operation conflicts with persisted state');
    this.name = 'AnalyticsWarehouseDestinationConflictError';
  }
}

export function toPublicAnalyticsWarehouseDestination(
  record: AnalyticsWarehouseDestinationRecord,
): AnalyticsWarehouseDestination {
  const {
    operationId: _operationId,
    requestHash: _requestHash,
    attemptCount: _attemptCount,
    nextAttemptAt: _nextAttemptAt,
    leaseWorkerId: _leaseWorkerId,
    leaseExpiresAt: _leaseExpiresAt,
    ...destination
  } = record;
  return structuredClone(destination);
}

export function warehouseAnalyticsEvent(
  event: PersistedAnalyticsEventRecord,
): WarehouseAnalyticsEvent {
  return {
    schemaVersion: 1,
    eventId: event.id,
    workspaceId: event.workspaceId,
    environmentId: event.environmentId,
    documentId: event.documentId,
    publicationId: event.publicationId,
    contentHash: event.contentHash,
    pointerGeneration: event.pointerGeneration,
    ...(event.experimentId ? { experimentId: event.experimentId } : {}),
    ...(event.armId ? { armId: event.armId } : {}),
    ...(event.experimentAllocationRevision
      ? { experimentAllocationRevision: event.experimentAllocationRevision }
      : {}),
    ...(event.audienceSegment ? { audienceSegment: structuredClone(event.audienceSegment) } : {}),
    name: event.name,
    ...(event.stepId ? { stepId: event.stepId } : {}),
    sdkVersion: event.sdkVersion,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    timestamp: event.timestamp,
    ...(event.props ? { props: structuredClone(event.props) } : {}),
    ingestedAt: event.ingestedAt,
  };
}

export function analyticsWarehouseBatchHash(
  events: readonly PersistedAnalyticsEventRecord[],
): string {
  const projection = events.map(warehouseAnalyticsEvent);
  return `sha256-${createHash('sha256').update(JSON.stringify(projection)).digest('hex')}`;
}

export function analyticsWarehouseCheckpoint(
  events: readonly PersistedAnalyticsEventRecord[],
): AnalyticsWarehouseCheckpoint | null {
  const last = events[events.length - 1];
  return last ? { ingestedAt: last.ingestedAt, eventId: last.id } : null;
}

export function compareAnalyticsEventsForWarehouse(
  left: PersistedAnalyticsEventRecord,
  right: PersistedAnalyticsEventRecord,
): number {
  return left.ingestedAt.localeCompare(right.ingestedAt) || left.id.localeCompare(right.id);
}
