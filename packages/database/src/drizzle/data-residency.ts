import { and, asc, eq, inArray, isNull, lt, lte, or } from 'drizzle-orm';
import { canTransitionDataResidencyMigration, dataResidencyRouteKey } from '@lodariq/schema';
import type {
  DataResidencyMigrationRecord,
  GovernanceMutationResult,
  RequestDataResidencyMigrationInput,
  TransitionDataResidencyMigrationInput,
} from '../domains/governance';
import type { TenantReadResult } from '../domains/tenant-administration';
import type { WorkspaceDataResidencyState } from '@lodariq/schema';
import {
  dataResidencyMigrationEvidence,
  dataResidencyMigrationHistory,
  dataResidencyMigrations,
  governanceAuditEvents,
  workspaceDataPlacements,
} from '../schema';
import {
  assertDataResidencyEvidence,
  DATA_RESIDENCY_LEASE_MS,
  DATA_RESIDENCY_MAX_PHASE_ATTEMPTS,
  DATA_RESIDENCY_WORKER_ACTOR_ID,
  compareDataResidencyEvidence,
  dataResidencyEvidenceMatches,
  dataResidencyEvidencePhaseForStatus,
  type ClaimDataResidencyMigrationsInput,
  type CompleteDataResidencyMigrationPhaseInput,
  type DataResidencyMigrationEvidenceRecord,
  type LeasedDataResidencyMigration,
  type RetryDataResidencyMigrationPhaseInput,
} from '../domains/data-residency';
import { runWithDataResidencyWorkerScope } from '../scoped-transaction';
import { toIsoString } from './helpers';
import { isUniqueConstraintViolation } from './helpers/theme';
import { canManageGovernance, governanceMembershipRole } from './governance';
import { DrizzleRepositoryAuthoringRoadmap } from './authoring-roadmap';

export class DrizzleRepositoryDataResidency extends DrizzleRepositoryAuthoringRoadmap {
  async getWorkspaceDataResidencyState(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceDataResidencyState>> {
    return this.actorScoped(workspaceId, actorUserId, async (tx) => {
      if (!canManageGovernance(await governanceMembershipRole(tx, workspaceId, actorUserId))) {
        return { status: 'forbidden' };
      }
      let [placement] = await tx
        .select()
        .from(workspaceDataPlacements)
        .where(eq(workspaceDataPlacements.workspaceId, workspaceId))
        .limit(1);
      if (!placement) {
        [placement] = await tx
          .insert(workspaceDataPlacements)
          .values({ workspaceId, region: 'us', generation: 0, activeMigrationId: null })
          .onConflictDoNothing({ target: workspaceDataPlacements.workspaceId })
          .returning();
        if (!placement) {
          [placement] = await tx
            .select()
            .from(workspaceDataPlacements)
            .where(eq(workspaceDataPlacements.workspaceId, workspaceId))
            .limit(1);
        }
      }
      if (!placement) throw new Error('workspace data placement is unavailable');
      const migration = placement.activeMigrationId
        ? await tx
            .select()
            .from(dataResidencyMigrations)
            .where(
              and(
                eq(dataResidencyMigrations.workspaceId, workspaceId),
                eq(dataResidencyMigrations.id, placement.activeMigrationId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null;
      return {
        status: 'ok',
        value: {
          placement: {
            workspaceId,
            region: placement.region,
            generation: placement.generation,
            activeMigrationId: placement.activeMigrationId,
            updatedAt: toIsoString(placement.updatedAt),
          },
          migration: migration ? migrationRecord(migration) : null,
        },
      };
    });
  }

  async requestDataResidencyMigration(
    input: RequestDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    try {
      return await this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
        if (
          !canManageGovernance(
            await governanceMembershipRole(tx, input.workspaceId, input.actorUserId),
          )
        ) {
          return { status: 'forbidden' };
        }
        const [replay] = await tx
          .select()
          .from(dataResidencyMigrations)
          .where(
            and(
              eq(dataResidencyMigrations.workspaceId, input.workspaceId),
              eq(dataResidencyMigrations.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (replay) {
          return replay.targetRegion === input.targetRegion &&
            replay.expectedPlacementGeneration === input.expectedPlacementGeneration
            ? { status: 'completed', value: migrationRecord(replay) }
            : { status: 'conflict' };
        }
        await tx
          .insert(workspaceDataPlacements)
          .values({
            workspaceId: input.workspaceId,
            region: 'us',
            generation: 0,
            activeMigrationId: null,
            updatedAt: new Date(input.requestedAt),
          })
          .onConflictDoNothing({ target: workspaceDataPlacements.workspaceId });
        const [placement] = await tx
          .select()
          .from(workspaceDataPlacements)
          .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId))
          .limit(1)
          .for('update');
        if (
          !placement ||
          placement.generation !== input.expectedPlacementGeneration ||
          placement.activeMigrationId ||
          placement.region === input.targetRegion
        ) {
          return { status: 'conflict' };
        }
        const [created] = await tx
          .insert(dataResidencyMigrations)
          .values({
            id: input.migrationId,
            workspaceId: input.workspaceId,
            sourceRegion: placement.region,
            targetRegion: input.targetRegion,
            status: 'requested',
            expectedPlacementGeneration: input.expectedPlacementGeneration,
            idempotencyKey: input.idempotencyKey,
            requestedByUserId: input.actorUserId,
            failureCode: null,
            attemptCount: 0,
            availableAt: new Date(input.requestedAt),
            leaseOwner: null,
            leasedUntil: null,
            lastErrorCode: null,
            createdAt: new Date(input.requestedAt),
            updatedAt: new Date(input.requestedAt),
          })
          .returning();
        if (!created) return { status: 'conflict' };
        const [claimed] = await tx
          .update(workspaceDataPlacements)
          .set({
            activeMigrationId: input.migrationId,
            updatedAt: new Date(input.requestedAt),
          })
          .where(
            and(
              eq(workspaceDataPlacements.workspaceId, input.workspaceId),
              eq(workspaceDataPlacements.generation, input.expectedPlacementGeneration),
            ),
          )
          .returning();
        if (!claimed) return { status: 'conflict' };
        await tx.insert(dataResidencyMigrationHistory).values({
          id: input.historyId,
          workspaceId: input.workspaceId,
          migrationId: input.migrationId,
          previousStatus: null,
          nextStatus: 'requested',
          actorId: input.actorUserId,
          failureCode: null,
          occurredAt: new Date(input.requestedAt),
        });
        await appendResidencyAudit(tx, input.auditEventId, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          eventType: 'residency_migration_requested',
          resourceId: input.migrationId,
          occurredAt: input.requestedAt,
        });
        return { status: 'completed', value: migrationRecord(created) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async transitionDataResidencyMigration(
    input: TransitionDataResidencyMigrationInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    try {
      return await this.actorScoped(input.workspaceId, input.actorId, async (tx) => {
        if (
          input.actorId !== DATA_RESIDENCY_WORKER_ACTOR_ID &&
          !canManageGovernance(await governanceMembershipRole(tx, input.workspaceId, input.actorId))
        ) {
          return { status: 'forbidden' };
        }
        const [current] = await tx
          .select()
          .from(dataResidencyMigrations)
          .where(
            and(
              eq(dataResidencyMigrations.workspaceId, input.workspaceId),
              eq(dataResidencyMigrations.id, input.migrationId),
            ),
          )
          .limit(1)
          .for('update');
        if (!current) return { status: 'not_found' };
        if (current.status === input.nextStatus) {
          return { status: 'completed', value: migrationRecord(current) };
        }
        if (
          current.status !== input.expectedStatus ||
          !canTransitionDataResidencyMigration(current.status, input.nextStatus)
        ) {
          return { status: 'conflict' };
        }
        const [placement] = await tx
          .select()
          .from(workspaceDataPlacements)
          .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId))
          .limit(1)
          .for('update');
        if (!placement || placement.activeMigrationId !== current.id) {
          return { status: 'conflict' };
        }
        const failureCode =
          input.nextStatus === 'failed' ? (input.failureCode ?? 'migration_failed') : null;
        const [updated] = await tx
          .update(dataResidencyMigrations)
          .set({
            status: input.nextStatus,
            failureCode,
            attemptCount: 0,
            availableAt: new Date(input.transitionedAt),
            leaseOwner: null,
            leasedUntil: null,
            lastErrorCode: null,
            updatedAt: new Date(input.transitionedAt),
          })
          .where(
            and(
              eq(dataResidencyMigrations.workspaceId, input.workspaceId),
              eq(dataResidencyMigrations.id, input.migrationId),
              eq(dataResidencyMigrations.status, input.expectedStatus),
            ),
          )
          .returning();
        if (!updated) return { status: 'conflict' };
        if (input.nextStatus === 'completed') {
          await tx
            .update(workspaceDataPlacements)
            .set({
              region: current.targetRegion,
              generation: placement.generation + 1,
              activeMigrationId: null,
              updatedAt: new Date(input.transitionedAt),
            })
            .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId));
        } else if (input.nextStatus === 'failed' || input.nextStatus === 'cancelled') {
          await tx
            .update(workspaceDataPlacements)
            .set({ activeMigrationId: null, updatedAt: new Date(input.transitionedAt) })
            .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId));
        }
        await tx.insert(dataResidencyMigrationHistory).values({
          id: input.historyId,
          workspaceId: input.workspaceId,
          migrationId: input.migrationId,
          previousStatus: current.status,
          nextStatus: input.nextStatus,
          actorId: input.actorId,
          failureCode,
          occurredAt: new Date(input.transitionedAt),
        });
        await appendResidencyAudit(tx, input.auditEventId, {
          workspaceId: input.workspaceId,
          actorUserId:
            input.actorId === DATA_RESIDENCY_WORKER_ACTOR_ID
              ? current.requestedByUserId
              : input.actorId,
          eventType: 'residency_migration_transitioned',
          resourceId: input.migrationId,
          occurredAt: input.transitionedAt,
        });
        return { status: 'completed', value: migrationRecord(updated) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async claimDataResidencyMigrations(
    input: ClaimDataResidencyMigrationsInput,
  ): Promise<LeasedDataResidencyMigration[]> {
    const now = new Date(input.now);
    const leaseExpiresAt = new Date(now.getTime() + DATA_RESIDENCY_LEASE_MS);
    const limit = Math.max(1, Math.min(input.limit, 25));
    return runWithDataResidencyWorkerScope(this.database, async (tx) => {
      const rows = await tx
        .select()
        .from(dataResidencyMigrations)
        .where(
          and(
            inArray(dataResidencyMigrations.status, [
              'requested',
              'copying',
              'verifying',
              'cutover-ready',
            ]),
            lt(dataResidencyMigrations.attemptCount, DATA_RESIDENCY_MAX_PHASE_ATTEMPTS),
            lte(dataResidencyMigrations.availableAt, now),
            or(
              isNull(dataResidencyMigrations.leasedUntil),
              lte(dataResidencyMigrations.leasedUntil, now),
            ),
          ),
        )
        .orderBy(asc(dataResidencyMigrations.availableAt), asc(dataResidencyMigrations.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: LeasedDataResidencyMigration[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(dataResidencyMigrations)
          .set({
            attemptCount: row.attemptCount + 1,
            leaseOwner: input.workerId,
            leasedUntil: leaseExpiresAt,
            lastErrorCode: null,
            updatedAt: now,
          })
          .where(eq(dataResidencyMigrations.id, row.id))
          .returning();
        if (updated) claimed.push(leasedMigrationRecord(updated));
      }
      return claimed;
    });
  }

  async completeDataResidencyMigrationPhase(
    input: CompleteDataResidencyMigrationPhaseInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    if (input.evidence) assertDataResidencyEvidence(input.evidence);
    try {
      return await this.scoped(input.workspaceId, async (tx) => {
        const [current] = await tx
          .select()
          .from(dataResidencyMigrations)
          .where(
            and(
              eq(dataResidencyMigrations.workspaceId, input.workspaceId),
              eq(dataResidencyMigrations.id, input.migrationId),
            ),
          )
          .limit(1)
          .for('update');
        if (!current) return { status: 'not_found' };
        if (
          current.status !== input.expectedStatus ||
          current.leaseOwner !== input.workerId ||
          !canTransitionDataResidencyMigration(current.status, input.nextStatus)
        ) {
          return { status: 'conflict' };
        }
        const requiredEvidencePhase = dataResidencyEvidencePhaseForStatus(current.status);
        if (
          (requiredEvidencePhase === null) !== (input.evidence === undefined) ||
          (requiredEvidencePhase !== null && input.evidence?.phase !== requiredEvidencePhase) ||
          (input.evidence &&
            (input.evidence.workspaceId !== input.workspaceId ||
              input.evidence.migrationId !== input.migrationId))
        ) {
          return { status: 'conflict' };
        }
        const [placement] = await tx
          .select()
          .from(workspaceDataPlacements)
          .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId))
          .limit(1)
          .for('update');
        if (!placement || placement.activeMigrationId !== current.id) {
          return { status: 'conflict' };
        }
        if (input.evidence) {
          const [existing] = await tx
            .select()
            .from(dataResidencyMigrationEvidence)
            .where(
              and(
                eq(dataResidencyMigrationEvidence.workspaceId, input.workspaceId),
                eq(dataResidencyMigrationEvidence.migrationId, input.migrationId),
                eq(dataResidencyMigrationEvidence.phase, input.evidence.phase),
              ),
            )
            .limit(1);
          if (existing && !dataResidencyEvidenceMatches(evidenceRecord(existing), input.evidence)) {
            return { status: 'conflict' };
          }
          if (!existing) {
            await tx.insert(dataResidencyMigrationEvidence).values({
              ...input.evidence,
              occurredAt: new Date(input.evidence.occurredAt),
            });
          }
        }
        const failureCode =
          input.nextStatus === 'failed' ? (input.failureCode ?? 'migration_failed') : null;
        const completedAt = new Date(input.completedAt);
        const [updated] = await tx
          .update(dataResidencyMigrations)
          .set({
            status: input.nextStatus,
            failureCode,
            attemptCount: 0,
            availableAt: completedAt,
            leaseOwner: null,
            leasedUntil: null,
            lastErrorCode: null,
            updatedAt: completedAt,
          })
          .where(
            and(
              eq(dataResidencyMigrations.workspaceId, input.workspaceId),
              eq(dataResidencyMigrations.id, input.migrationId),
              eq(dataResidencyMigrations.status, input.expectedStatus),
              eq(dataResidencyMigrations.leaseOwner, input.workerId),
            ),
          )
          .returning();
        if (!updated) return { status: 'conflict' };
        await updatePlacementAfterResidencyTransition(
          tx,
          placement,
          current,
          input.nextStatus,
          completedAt,
        );
        await tx.insert(dataResidencyMigrationHistory).values({
          id: input.historyId,
          workspaceId: input.workspaceId,
          migrationId: input.migrationId,
          previousStatus: current.status,
          nextStatus: input.nextStatus,
          actorId: DATA_RESIDENCY_WORKER_ACTOR_ID,
          failureCode,
          occurredAt: completedAt,
        });
        await appendResidencyAudit(tx, input.auditEventId, {
          workspaceId: input.workspaceId,
          actorUserId: current.requestedByUserId,
          eventType: 'residency_migration_transitioned',
          resourceId: input.migrationId,
          occurredAt: input.completedAt,
        });
        return { status: 'completed', value: migrationRecord(updated) };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return { status: 'conflict' };
      throw error;
    }
  }

  async retryDataResidencyMigrationPhase(
    input: RetryDataResidencyMigrationPhaseInput,
  ): Promise<GovernanceMutationResult<DataResidencyMigrationRecord>> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(dataResidencyMigrations)
        .where(
          and(
            eq(dataResidencyMigrations.workspaceId, input.workspaceId),
            eq(dataResidencyMigrations.id, input.migrationId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) return { status: 'not_found' };
      if (current.status !== input.expectedStatus || current.leaseOwner !== input.workerId) {
        return { status: 'conflict' };
      }
      const failedAt = new Date(input.failedAt);
      if (current.attemptCount < DATA_RESIDENCY_MAX_PHASE_ATTEMPTS) {
        const [updated] = await tx
          .update(dataResidencyMigrations)
          .set({
            availableAt: new Date(input.nextAvailableAt),
            leaseOwner: null,
            leasedUntil: null,
            lastErrorCode: input.errorCode,
            updatedAt: failedAt,
          })
          .where(eq(dataResidencyMigrations.id, current.id))
          .returning();
        return updated
          ? { status: 'completed', value: migrationRecord(updated) }
          : { status: 'conflict' };
      }
      const [placement] = await tx
        .select()
        .from(workspaceDataPlacements)
        .where(eq(workspaceDataPlacements.workspaceId, input.workspaceId))
        .limit(1)
        .for('update');
      if (!placement || placement.activeMigrationId !== current.id) {
        return { status: 'conflict' };
      }
      const [updated] = await tx
        .update(dataResidencyMigrations)
        .set({
          status: 'failed',
          failureCode: input.errorCode,
          availableAt: failedAt,
          leaseOwner: null,
          leasedUntil: null,
          lastErrorCode: input.errorCode,
          updatedAt: failedAt,
        })
        .where(eq(dataResidencyMigrations.id, current.id))
        .returning();
      if (!updated) return { status: 'conflict' };
      await updatePlacementAfterResidencyTransition(tx, placement, current, 'failed', failedAt);
      await tx.insert(dataResidencyMigrationHistory).values({
        id: input.historyId,
        workspaceId: input.workspaceId,
        migrationId: input.migrationId,
        previousStatus: current.status,
        nextStatus: 'failed',
        actorId: DATA_RESIDENCY_WORKER_ACTOR_ID,
        failureCode: input.errorCode,
        occurredAt: failedAt,
      });
      await appendResidencyAudit(tx, input.auditEventId, {
        workspaceId: input.workspaceId,
        actorUserId: current.requestedByUserId,
        eventType: 'residency_migration_transitioned',
        resourceId: input.migrationId,
        occurredAt: input.failedAt,
      });
      return { status: 'completed', value: migrationRecord(updated) };
    });
  }

  async listDataResidencyMigrationEvidence(
    workspaceId: string,
    migrationId: string,
  ): Promise<DataResidencyMigrationEvidenceRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(dataResidencyMigrationEvidence)
        .where(
          and(
            eq(dataResidencyMigrationEvidence.workspaceId, workspaceId),
            eq(dataResidencyMigrationEvidence.migrationId, migrationId),
          ),
        )
        .orderBy(
          asc(dataResidencyMigrationEvidence.occurredAt),
          asc(dataResidencyMigrationEvidence.id),
        );
      return rows.map(evidenceRecord).sort(compareDataResidencyEvidence);
    });
  }

  async resolveWorkspaceDataRoute(workspaceId: string) {
    return this.scoped(workspaceId, async (tx) => {
      const [placement] = await tx
        .select()
        .from(workspaceDataPlacements)
        .where(eq(workspaceDataPlacements.workspaceId, workspaceId))
        .limit(1);
      const region = placement?.region ?? 'us';
      return {
        workspaceId,
        region,
        routeKey: dataResidencyRouteKey(region),
        generation: placement?.generation ?? 0,
      };
    });
  }
}

function leasedMigrationRecord(
  row: typeof dataResidencyMigrations.$inferSelect,
): LeasedDataResidencyMigration {
  return {
    migration: migrationRecord(row),
    execution: {
      workspaceId: row.workspaceId,
      migrationId: row.id,
      attemptCount: row.attemptCount,
      availableAt: toIsoString(row.availableAt),
      ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}),
      ...(row.leasedUntil ? { leaseExpiresAt: toIsoString(row.leasedUntil) } : {}),
      ...(row.lastErrorCode ? { lastErrorCode: row.lastErrorCode } : {}),
    },
  };
}

function evidenceRecord(
  row: typeof dataResidencyMigrationEvidence.$inferSelect,
): DataResidencyMigrationEvidenceRecord {
  return {
    ...row,
    occurredAt: toIsoString(row.occurredAt),
  };
}

async function updatePlacementAfterResidencyTransition(
  tx: Parameters<typeof governanceMembershipRole>[0],
  placement: typeof workspaceDataPlacements.$inferSelect,
  migration: typeof dataResidencyMigrations.$inferSelect,
  nextStatus: typeof dataResidencyMigrations.$inferSelect.status,
  transitionedAt: Date,
): Promise<void> {
  if (nextStatus === 'completed') {
    await tx
      .update(workspaceDataPlacements)
      .set({
        region: migration.targetRegion,
        generation: placement.generation + 1,
        activeMigrationId: null,
        updatedAt: transitionedAt,
      })
      .where(eq(workspaceDataPlacements.workspaceId, migration.workspaceId));
    return;
  }
  if (nextStatus === 'failed' || nextStatus === 'cancelled') {
    await tx
      .update(workspaceDataPlacements)
      .set({ activeMigrationId: null, updatedAt: transitionedAt })
      .where(eq(workspaceDataPlacements.workspaceId, migration.workspaceId));
  }
}

function migrationRecord(
  row: typeof dataResidencyMigrations.$inferSelect,
): DataResidencyMigrationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sourceRegion: row.sourceRegion,
    targetRegion: row.targetRegion,
    status: row.status,
    expectedPlacementGeneration: row.expectedPlacementGeneration,
    idempotencyKey: row.idempotencyKey,
    requestedByUserId: row.requestedByUserId,
    failureCode: row.failureCode,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function appendResidencyAudit(
  tx: Parameters<typeof governanceMembershipRole>[0],
  id: string,
  input: {
    workspaceId: string;
    actorUserId: string;
    eventType: 'residency_migration_requested' | 'residency_migration_transitioned';
    resourceId: string;
    occurredAt: string;
  },
): Promise<void> {
  await tx.insert(governanceAuditEvents).values({
    id,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    targetUserId: null,
    environmentId: null,
    resourceId: input.resourceId,
    occurredAt: new Date(input.occurredAt),
  });
}
