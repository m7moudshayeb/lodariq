import {
  analyticsWarehouseBatchHash,
  analyticsWarehouseCheckpoint,
  ANALYTICS_WAREHOUSE_LEASE_MS,
  ANALYTICS_WAREHOUSE_MAX_ATTEMPTS,
  AnalyticsWarehouseDestinationConflictError,
  compareAnalyticsEventsForWarehouse,
  type AnalyticsWarehouseDestinationRecord,
  type AnalyticsWarehouseSyncRunRecord,
  type ClaimAnalyticsWarehouseDestinationsInput,
  type CompleteAnalyticsWarehouseDeliveryInput,
  type CreateAnalyticsWarehouseDestinationInput,
  type FailAnalyticsWarehouseDeliveryInput,
  type ReadAnalyticsWarehouseEventsInput,
} from '../domains/analytics-warehouse';
import { assertCommercialFeature } from '../domains/commercial-entitlements';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryAuthoringRoadmap } from './authoring-roadmap';

export class InMemoryRepositoryAnalyticsWarehouse extends InMemoryRepositoryAuthoringRoadmap {
  async listAnalyticsWarehouseDestinations(
    workspaceId: string,
  ): Promise<AnalyticsWarehouseDestinationRecord[]> {
    return [...this.analyticsWarehouseDestinations.values()]
      .filter((destination) => destination.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async createAnalyticsWarehouseDestination(
    input: CreateAnalyticsWarehouseDestinationInput,
  ): Promise<AnalyticsWarehouseDestinationRecord> {
    const destination = input.destination;
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(destination.workspaceId).entitlements,
      'warehouse-sync',
    );
    const replay = [...this.analyticsWarehouseDestinations.values()].find(
      (candidate) =>
        candidate.workspaceId === destination.workspaceId &&
        candidate.operationId === destination.operationId,
    );
    if (replay) {
      if (replay.requestHash !== destination.requestHash) {
        throw new AnalyticsWarehouseDestinationConflictError();
      }
      return clone(replay);
    }
    const environment = this.environments.get(
      this.key(destination.workspaceId, destination.environmentId),
    );
    const document = destination.documentId
      ? this.documents.get(this.key(destination.workspaceId, destination.documentId))
      : undefined;
    const nameConflict = [...this.analyticsWarehouseDestinations.values()].some(
      (candidate) =>
        candidate.workspaceId === destination.workspaceId &&
        candidate.name.toLocaleLowerCase() === destination.name.toLocaleLowerCase(),
    );
    if (!environment || (destination.documentId && !document) || nameConflict) {
      throw new AnalyticsWarehouseDestinationConflictError();
    }
    const key = this.key(destination.workspaceId, destination.id);
    if (this.analyticsWarehouseDestinations.has(key)) {
      throw new AnalyticsWarehouseDestinationConflictError();
    }
    this.analyticsWarehouseDestinations.set(key, clone(destination));
    return clone(destination);
  }

  async disableAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    expectedRevision: number,
    disabledAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null> {
    const key = this.key(workspaceId, destinationId);
    const current = this.analyticsWarehouseDestinations.get(key);
    if (!current || current.revision !== expectedRevision) return null;
    const updated = {
      ...current,
      enabled: false,
      revision: current.revision + 1,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: disabledAt,
    };
    this.analyticsWarehouseDestinations.set(key, updated);
    return clone(updated);
  }

  async triggerAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    triggeredAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null> {
    const key = this.key(workspaceId, destinationId);
    const current = this.analyticsWarehouseDestinations.get(key);
    if (!current || !current.enabled) return null;
    const updated = {
      ...current,
      attemptCount: 0,
      nextAttemptAt: triggeredAt,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: null,
      updatedAt: triggeredAt,
    };
    this.analyticsWarehouseDestinations.set(key, updated);
    return clone(updated);
  }

  async claimAnalyticsWarehouseDestinations(
    input: ClaimAnalyticsWarehouseDestinationsInput,
  ): Promise<AnalyticsWarehouseDestinationRecord[]> {
    const now = Date.parse(input.now);
    const candidates = [...this.analyticsWarehouseDestinations.values()]
      .filter(
        (destination) =>
          destination.enabled &&
          destination.attemptCount < ANALYTICS_WAREHOUSE_MAX_ATTEMPTS &&
          Date.parse(destination.nextAttemptAt) <= now &&
          (!destination.leaseExpiresAt || Date.parse(destination.leaseExpiresAt) <= now),
      )
      .sort(
        (left, right) =>
          left.nextAttemptAt.localeCompare(right.nextAttemptAt) || left.id.localeCompare(right.id),
      )
      .slice(0, Math.max(1, Math.min(input.limit, 25)));
    const leaseExpiresAt = new Date(now + ANALYTICS_WAREHOUSE_LEASE_MS).toISOString();
    for (const destination of candidates) {
      const updated = {
        ...destination,
        attemptCount: destination.attemptCount + 1,
        leaseWorkerId: input.workerId,
        leaseExpiresAt,
        lastErrorCode: null,
        updatedAt: input.now,
      };
      this.analyticsWarehouseDestinations.set(
        this.key(destination.workspaceId, destination.id),
        updated,
      );
      Object.assign(destination, updated);
    }
    return clone(candidates);
  }

  async readAnalyticsWarehouseEvents(
    input: ReadAnalyticsWarehouseEventsInput,
  ) {
    const checkpoint = input.destination.checkpoint;
    return this.analyticsEvents
      .filter(
        (event) =>
          event.workspaceId === input.destination.workspaceId &&
          event.environmentId === input.destination.environmentId &&
          (!input.destination.documentId || event.documentId === input.destination.documentId) &&
          isAfterCheckpoint(event.ingestedAt, event.id, checkpoint),
      )
      .sort(compareAnalyticsEventsForWarehouse)
      .slice(0, Math.max(1, Math.min(input.limit ?? 1_000, 1_000)))
      .map(clone);
  }

  async completeAnalyticsWarehouseDelivery(
    input: CompleteAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null> {
    const key = this.key(input.workspaceId, input.destinationId);
    const current = this.analyticsWarehouseDestinations.get(key);
    if (!current || current.leaseWorkerId !== input.workerId || input.events.length === 0) {
      return null;
    }
    const batchHash = analyticsWarehouseBatchHash(input.events);
    const checkpoint = analyticsWarehouseCheckpoint(input.events);
    if (!checkpoint) return null;
    const reconciled =
      input.reportedEventCount === input.events.length && input.reportedBatchHash === batchHash;
    const run: AnalyticsWarehouseSyncRunRecord = {
      id: input.runId,
      workspaceId: input.workspaceId,
      destinationId: input.destinationId,
      status: reconciled ? 'succeeded' : 'failed',
      eventCount: input.events.length,
      batchHash,
      providerBatchId: input.providerBatchId,
      checkpoint: reconciled ? checkpoint : null,
      attemptCount: current.attemptCount,
      errorCode: reconciled ? null : 'reconciliation_mismatch',
      occurredAt: input.completedAt,
    };
    this.analyticsWarehouseSyncRuns.push(run);
    this.analyticsWarehouseDestinations.set(key, {
      ...current,
      checkpoint: reconciled ? checkpoint : current.checkpoint,
      attemptCount: reconciled ? 0 : ANALYTICS_WAREHOUSE_MAX_ATTEMPTS,
      nextAttemptAt: input.completedAt,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastSyncedAt: reconciled ? input.completedAt : current.lastSyncedAt,
      lastErrorCode: reconciled ? null : 'reconciliation_mismatch',
      updatedAt: input.completedAt,
    });
    return clone(run);
  }

  async failAnalyticsWarehouseDelivery(
    input: FailAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null> {
    const key = this.key(input.workspaceId, input.destinationId);
    const current = this.analyticsWarehouseDestinations.get(key);
    if (!current || current.leaseWorkerId !== input.workerId) return null;
    const run: AnalyticsWarehouseSyncRunRecord = {
      id: input.runId,
      workspaceId: input.workspaceId,
      destinationId: input.destinationId,
      status: 'failed',
      eventCount: 0,
      batchHash: null,
      providerBatchId: null,
      checkpoint: null,
      attemptCount: current.attemptCount,
      errorCode: input.errorCode,
      occurredAt: input.failedAt,
    };
    this.analyticsWarehouseSyncRuns.push(run);
    this.analyticsWarehouseDestinations.set(key, {
      ...current,
      nextAttemptAt: input.nextAttemptAt,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: input.errorCode,
      updatedAt: input.failedAt,
    });
    return clone(run);
  }

  async releaseEmptyAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    workerId: string,
    checkedAt: string,
    nextAttemptAt: string,
  ): Promise<boolean> {
    const key = this.key(workspaceId, destinationId);
    const current = this.analyticsWarehouseDestinations.get(key);
    if (!current || current.leaseWorkerId !== workerId) return false;
    this.analyticsWarehouseDestinations.set(key, {
      ...current,
      attemptCount: 0,
      nextAttemptAt,
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: checkedAt,
    });
    return true;
  }

  async listAnalyticsWarehouseSyncRuns(
    workspaceId: string,
    destinationId?: string,
  ): Promise<AnalyticsWarehouseSyncRunRecord[]> {
    return this.analyticsWarehouseSyncRuns
      .filter(
        (run) =>
          run.workspaceId === workspaceId &&
          (destinationId === undefined || run.destinationId === destinationId),
      )
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
      )
      .slice(0, 100)
      .map(clone);
  }
}

function isAfterCheckpoint(
  ingestedAt: string,
  eventId: string,
  checkpoint: AnalyticsWarehouseDestinationRecord['checkpoint'],
): boolean {
  if (!checkpoint) return true;
  return ingestedAt > checkpoint.ingestedAt ||
    (ingestedAt === checkpoint.ingestedAt && eventId > checkpoint.eventId);
}
