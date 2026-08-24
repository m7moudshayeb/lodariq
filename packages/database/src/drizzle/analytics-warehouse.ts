import { and, asc, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm';
import {
  analyticsWarehouseBatchHash,
  analyticsWarehouseCheckpoint,
  ANALYTICS_WAREHOUSE_LEASE_MS,
  ANALYTICS_WAREHOUSE_MAX_ATTEMPTS,
  AnalyticsWarehouseDestinationConflictError,
  type AnalyticsWarehouseDestinationRecord,
  type AnalyticsWarehouseSyncRunRecord,
  type ClaimAnalyticsWarehouseDestinationsInput,
  type CompleteAnalyticsWarehouseDeliveryInput,
  type CreateAnalyticsWarehouseDestinationInput,
  type FailAnalyticsWarehouseDeliveryInput,
  type ReadAnalyticsWarehouseEventsInput,
} from '../domains/analytics-warehouse';
import { assertCommercialFeature } from '../domains/commercial-entitlements';
import {
  analyticsWarehouseDestinations,
  analyticsWarehouseSyncRuns,
  authoritativeAnalyticsEvents,
} from '../schema';
import { runWithAnalyticsWarehouseWorkerScope } from '../scoped-transaction';
import { DrizzleRepositoryDataResidency } from './data-residency';
import { toIsoString, toPersistedAnalyticsEventRecord } from './helpers';
import { isUniqueConstraintViolation } from './helpers/theme';

export class DrizzleRepositoryAnalyticsWarehouse extends DrizzleRepositoryDataResidency {
  async listAnalyticsWarehouseDestinations(
    workspaceId: string,
  ): Promise<AnalyticsWarehouseDestinationRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(analyticsWarehouseDestinations)
        .where(eq(analyticsWarehouseDestinations.workspaceId, workspaceId))
        .orderBy(
          asc(analyticsWarehouseDestinations.name),
          asc(analyticsWarehouseDestinations.id),
        );
      return rows.map(destinationRecord);
    });
  }

  async createAnalyticsWarehouseDestination(
    input: CreateAnalyticsWarehouseDestinationInput,
  ): Promise<AnalyticsWarehouseDestinationRecord> {
    const destination = input.destination;
    try {
      return await this.scoped(destination.workspaceId, async (tx) => {
        assertCommercialFeature(
          (await this.resolveWorkspaceEntitlements(tx, destination.workspaceId)).entitlements,
          'warehouse-sync',
        );
        const [replay] = await tx
          .select()
          .from(analyticsWarehouseDestinations)
          .where(
            and(
              eq(analyticsWarehouseDestinations.workspaceId, destination.workspaceId),
              eq(analyticsWarehouseDestinations.operationId, destination.operationId),
            ),
          )
          .limit(1);
        if (replay) {
          if (replay.requestHash !== destination.requestHash) {
            throw new AnalyticsWarehouseDestinationConflictError();
          }
          return destinationRecord(replay);
        }
        const [created] = await tx
          .insert(analyticsWarehouseDestinations)
          .values({
            id: destination.id,
            workspaceId: destination.workspaceId,
            environmentId: destination.environmentId,
            documentId: destination.documentId ?? null,
            name: destination.name,
            provider: destination.provider,
            credentialReference: destination.credentialReference,
            enabled: destination.enabled,
            revision: destination.revision,
            operationId: destination.operationId,
            requestHash: destination.requestHash,
            checkpointIngestedAt: destination.checkpoint
              ? new Date(destination.checkpoint.ingestedAt)
              : null,
            checkpointEventId: destination.checkpoint?.eventId ?? null,
            attemptCount: destination.attemptCount,
            nextAttemptAt: new Date(destination.nextAttemptAt),
            leaseWorkerId: destination.leaseWorkerId ?? null,
            leaseExpiresAt: destination.leaseExpiresAt
              ? new Date(destination.leaseExpiresAt)
              : null,
            lastSyncedAt: destination.lastSyncedAt
              ? new Date(destination.lastSyncedAt)
              : null,
            lastErrorCode: destination.lastErrorCode,
            createdByUserId: destination.createdByUserId,
            createdAt: new Date(destination.createdAt),
            updatedAt: new Date(destination.updatedAt),
          })
          .returning();
        if (!created) throw new AnalyticsWarehouseDestinationConflictError();
        return destinationRecord(created);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new AnalyticsWarehouseDestinationConflictError();
      }
      throw error;
    }
  }

  async disableAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    expectedRevision: number,
    disabledAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [updated] = await tx
        .update(analyticsWarehouseDestinations)
        .set({
          enabled: false,
          revision: expectedRevision + 1,
          leaseWorkerId: null,
          leaseExpiresAt: null,
          updatedAt: new Date(disabledAt),
        })
        .where(
          and(
            eq(analyticsWarehouseDestinations.workspaceId, workspaceId),
            eq(analyticsWarehouseDestinations.id, destinationId),
            eq(analyticsWarehouseDestinations.revision, expectedRevision),
          ),
        )
        .returning();
      return updated ? destinationRecord(updated) : null;
    });
  }

  async triggerAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    triggeredAt: string,
  ): Promise<AnalyticsWarehouseDestinationRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [updated] = await tx
        .update(analyticsWarehouseDestinations)
        .set({
          attemptCount: 0,
          nextAttemptAt: new Date(triggeredAt),
          leaseWorkerId: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          updatedAt: new Date(triggeredAt),
        })
        .where(
          and(
            eq(analyticsWarehouseDestinations.workspaceId, workspaceId),
            eq(analyticsWarehouseDestinations.id, destinationId),
            eq(analyticsWarehouseDestinations.enabled, true),
          ),
        )
        .returning();
      return updated ? destinationRecord(updated) : null;
    });
  }

  async claimAnalyticsWarehouseDestinations(
    input: ClaimAnalyticsWarehouseDestinationsInput,
  ): Promise<AnalyticsWarehouseDestinationRecord[]> {
    const now = new Date(input.now);
    const leaseExpiresAt = new Date(now.getTime() + ANALYTICS_WAREHOUSE_LEASE_MS);
    const limit = Math.max(1, Math.min(input.limit, 25));
    return runWithAnalyticsWarehouseWorkerScope(this.database, async (tx) => {
      const rows = await tx
        .select()
        .from(analyticsWarehouseDestinations)
        .where(
          and(
            eq(analyticsWarehouseDestinations.enabled, true),
            lt(analyticsWarehouseDestinations.attemptCount, ANALYTICS_WAREHOUSE_MAX_ATTEMPTS),
            lte(analyticsWarehouseDestinations.nextAttemptAt, now),
            or(
              isNull(analyticsWarehouseDestinations.leaseExpiresAt),
              lte(analyticsWarehouseDestinations.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(
          asc(analyticsWarehouseDestinations.nextAttemptAt),
          asc(analyticsWarehouseDestinations.id),
        )
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: AnalyticsWarehouseDestinationRecord[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(analyticsWarehouseDestinations)
          .set({
            attemptCount: row.attemptCount + 1,
            leaseWorkerId: input.workerId,
            leaseExpiresAt,
            lastErrorCode: null,
            updatedAt: now,
          })
          .where(eq(analyticsWarehouseDestinations.id, row.id))
          .returning();
        if (updated) claimed.push(destinationRecord(updated));
      }
      return claimed;
    });
  }

  async readAnalyticsWarehouseEvents(input: ReadAnalyticsWarehouseEventsInput) {
    const checkpoint = input.destination.checkpoint;
    const cursor = checkpoint
      ? or(
          gt(authoritativeAnalyticsEvents.ingestedAt, new Date(checkpoint.ingestedAt)),
          and(
            eq(authoritativeAnalyticsEvents.ingestedAt, new Date(checkpoint.ingestedAt)),
            gt(authoritativeAnalyticsEvents.id, checkpoint.eventId),
          ),
        )
      : undefined;
    return this.scoped(input.destination.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.destination.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.destination.environmentId),
            input.destination.documentId
              ? eq(authoritativeAnalyticsEvents.documentId, input.destination.documentId)
              : undefined,
            cursor,
          ),
        )
        .orderBy(asc(authoritativeAnalyticsEvents.ingestedAt), asc(authoritativeAnalyticsEvents.id))
        .limit(Math.max(1, Math.min(input.limit ?? 1_000, 1_000)));
      return rows.map(toPersistedAnalyticsEventRecord);
    });
  }

  async completeAnalyticsWarehouseDelivery(
    input: CompleteAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(analyticsWarehouseDestinations)
        .where(
          and(
            eq(analyticsWarehouseDestinations.workspaceId, input.workspaceId),
            eq(analyticsWarehouseDestinations.id, input.destinationId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current || current.leaseWorkerId !== input.workerId || input.events.length === 0) {
        return null;
      }
      const batchHash = analyticsWarehouseBatchHash(input.events);
      const checkpoint = analyticsWarehouseCheckpoint(input.events);
      if (!checkpoint) return null;
      const reconciled =
        input.reportedEventCount === input.events.length && input.reportedBatchHash === batchHash;
      const completedAt = new Date(input.completedAt);
      const [createdRun] = await tx
        .insert(analyticsWarehouseSyncRuns)
        .values({
          id: input.runId,
          workspaceId: input.workspaceId,
          destinationId: input.destinationId,
          status: reconciled ? 'succeeded' : 'failed',
          eventCount: input.events.length,
          batchHash,
          providerBatchId: input.providerBatchId,
          checkpointIngestedAt: reconciled ? new Date(checkpoint.ingestedAt) : null,
          checkpointEventId: reconciled ? checkpoint.eventId : null,
          attemptCount: current.attemptCount,
          errorCode: reconciled ? null : 'reconciliation_mismatch',
          occurredAt: completedAt,
        })
        .returning();
      const [updated] = await tx
        .update(analyticsWarehouseDestinations)
        .set({
          checkpointIngestedAt: reconciled
            ? new Date(checkpoint.ingestedAt)
            : current.checkpointIngestedAt,
          checkpointEventId: reconciled ? checkpoint.eventId : current.checkpointEventId,
          attemptCount: reconciled ? 0 : ANALYTICS_WAREHOUSE_MAX_ATTEMPTS,
          nextAttemptAt: completedAt,
          leaseWorkerId: null,
          leaseExpiresAt: null,
          lastSyncedAt: reconciled ? completedAt : current.lastSyncedAt,
          lastErrorCode: reconciled ? null : 'reconciliation_mismatch',
          updatedAt: completedAt,
        })
        .where(eq(analyticsWarehouseDestinations.id, current.id))
        .returning();
      return createdRun && updated ? syncRunRecord(createdRun) : null;
    });
  }

  async failAnalyticsWarehouseDelivery(
    input: FailAnalyticsWarehouseDeliveryInput,
  ): Promise<AnalyticsWarehouseSyncRunRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(analyticsWarehouseDestinations)
        .where(
          and(
            eq(analyticsWarehouseDestinations.workspaceId, input.workspaceId),
            eq(analyticsWarehouseDestinations.id, input.destinationId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current || current.leaseWorkerId !== input.workerId) return null;
      const failedAt = new Date(input.failedAt);
      const [createdRun] = await tx
        .insert(analyticsWarehouseSyncRuns)
        .values({
          id: input.runId,
          workspaceId: input.workspaceId,
          destinationId: input.destinationId,
          status: 'failed',
          eventCount: 0,
          batchHash: null,
          providerBatchId: null,
          checkpointIngestedAt: null,
          checkpointEventId: null,
          attemptCount: current.attemptCount,
          errorCode: input.errorCode,
          occurredAt: failedAt,
        })
        .returning();
      await tx
        .update(analyticsWarehouseDestinations)
        .set({
          nextAttemptAt: new Date(input.nextAttemptAt),
          leaseWorkerId: null,
          leaseExpiresAt: null,
          lastErrorCode: input.errorCode,
          updatedAt: failedAt,
        })
        .where(eq(analyticsWarehouseDestinations.id, current.id));
      return createdRun ? syncRunRecord(createdRun) : null;
    });
  }

  async releaseEmptyAnalyticsWarehouseDestination(
    workspaceId: string,
    destinationId: string,
    workerId: string,
    checkedAt: string,
    nextAttemptAt: string,
  ): Promise<boolean> {
    return this.scoped(workspaceId, async (tx) => {
      const [updated] = await tx
        .update(analyticsWarehouseDestinations)
        .set({
          attemptCount: 0,
          nextAttemptAt: new Date(nextAttemptAt),
          leaseWorkerId: null,
          leaseExpiresAt: null,
          updatedAt: new Date(checkedAt),
        })
        .where(
          and(
            eq(analyticsWarehouseDestinations.workspaceId, workspaceId),
            eq(analyticsWarehouseDestinations.id, destinationId),
            eq(analyticsWarehouseDestinations.leaseWorkerId, workerId),
          ),
        )
        .returning();
      return updated !== undefined;
    });
  }

  async listAnalyticsWarehouseSyncRuns(
    workspaceId: string,
    destinationId?: string,
  ): Promise<AnalyticsWarehouseSyncRunRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(analyticsWarehouseSyncRuns)
        .where(
          and(
            eq(analyticsWarehouseSyncRuns.workspaceId, workspaceId),
            destinationId
              ? eq(analyticsWarehouseSyncRuns.destinationId, destinationId)
              : undefined,
          ),
        )
        .orderBy(
          desc(analyticsWarehouseSyncRuns.occurredAt),
          desc(analyticsWarehouseSyncRuns.id),
        )
        .limit(100);
      return rows.map(syncRunRecord);
    });
  }
}

function destinationRecord(
  row: typeof analyticsWarehouseDestinations.$inferSelect,
): AnalyticsWarehouseDestinationRecord {
  const checkpoint =
    row.checkpointIngestedAt && row.checkpointEventId
      ? { ingestedAt: toIsoString(row.checkpointIngestedAt), eventId: row.checkpointEventId }
      : null;
  return {
    schemaVersion: '2026-08-22.1',
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    ...(row.documentId ? { documentId: row.documentId } : {}),
    name: row.name,
    provider: row.provider,
    credentialReference: row.credentialReference,
    enabled: row.enabled,
    revision: row.revision,
    checkpoint,
    lastSyncedAt: row.lastSyncedAt ? toIsoString(row.lastSyncedAt) : null,
    lastErrorCode: row.lastErrorCode,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    operationId: row.operationId,
    requestHash: row.requestHash,
    attemptCount: row.attemptCount,
    nextAttemptAt: toIsoString(row.nextAttemptAt),
    ...(row.leaseWorkerId ? { leaseWorkerId: row.leaseWorkerId } : {}),
    ...(row.leaseExpiresAt ? { leaseExpiresAt: toIsoString(row.leaseExpiresAt) } : {}),
  };
}

function syncRunRecord(
  row: typeof analyticsWarehouseSyncRuns.$inferSelect,
): AnalyticsWarehouseSyncRunRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    destinationId: row.destinationId,
    status: row.status,
    eventCount: row.eventCount,
    batchHash: row.batchHash,
    providerBatchId: row.providerBatchId,
    checkpoint:
      row.checkpointIngestedAt && row.checkpointEventId
        ? { ingestedAt: toIsoString(row.checkpointIngestedAt), eventId: row.checkpointEventId }
        : null,
    attemptCount: row.attemptCount,
    errorCode: row.errorCode,
    occurredAt: toIsoString(row.occurredAt),
  };
}
