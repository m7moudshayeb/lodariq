import { randomUUID } from 'node:crypto';
import { and, asc, countDistinct, desc, eq, lte, max, or, sql } from 'drizzle-orm';
import {
  DATA_CATALOG_SCHEMA_VERSION,
  type DataCatalogEntry,
  type DataCatalogValueType,
  type DeliveryTransitionHistoryEntry,
  type Environment,
  type WorkspaceDataCatalog,
} from '@lodariq/schema';
import {
  DeploymentScheduleConflictError,
  type CancelDeploymentScheduleInput,
  type CreateDeploymentScheduleInput,
  type DeliveryScheduleJobResult,
  type ObserveWorkspaceDataCatalogInput,
  type PersistedDeliveryScheduleJob,
  type PersistedDeploymentSchedule,
  type RunDueDeliveryScheduleJobsInput,
  normalizeDeploymentScheduleTimes,
} from '../domains/delivery-orchestration';
import { assertReleaseMutationGuardInput } from '../domains/authoring-policy';
import {
  assertCommercialFeature,
  CommercialEntitlementError,
} from '../domains/commercial-entitlements';
import { IdempotencyConflictError } from '../domains/releases';
import {
  deliveryScheduleJobs,
  deliveryTransitionHistory,
  deploymentSchedules,
  documentDeployments,
  environments,
  publications,
  publicationVerifications,
  workspaceDataCatalogEntries,
  workspaceMemberships,
} from '../schema';
import { runWithDeliveryWorkerScope } from '../scoped-transaction';
import type { LodariqTransaction } from './types';
import { toIsoString } from './helpers';
import { DrizzleRepositoryCommercialEntitlements } from './commercial-entitlements';

const DEFAULT_JOB_LIMIT = 25;
const DEFAULT_LEASE_MS = 30_000;

export class DrizzleRepositoryDeliveryOrchestration extends DrizzleRepositoryCommercialEntitlements {
  async createDeploymentSchedule(
    input: CreateDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule> {
    assertReleaseMutationGuardInput(input);
    const times = normalizeDeploymentScheduleTimes(input.startAt, input.endAt);
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(deploymentSchedules)
        .where(
          and(
            eq(deploymentSchedules.workspaceId, input.workspaceId),
            eq(deploymentSchedules.environmentId, input.environmentId),
            eq(deploymentSchedules.documentId, input.documentId),
            eq(deploymentSchedules.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new IdempotencyConflictError(input.idempotencyKey);
        }
        return toPersistedDeploymentSchedule(existing);
      }

      const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements;
      assertCommercialFeature(entitlements, 'scheduling');
      const [scope] = await tx
        .select({ environment: environments, role: workspaceMemberships.role })
        .from(environments)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, environments.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('share');
      if (
        !scope ||
        !scope.environment.releasePolicy.publisherRoles.some((role) => role === scope.role)
      ) {
        throw new DeploymentScheduleConflictError('workspace membership cannot schedule releases');
      }
      const [sourcePublication] = await tx
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.workspaceId, input.workspaceId),
            eq(publications.documentId, input.documentId),
            eq(publications.id, input.publicationId),
          ),
        )
        .limit(1);
      if (!sourcePublication) {
        throw new DeploymentScheduleConflictError(
          'publication is outside the scheduled deployment',
        );
      }

      await this.lockSortedReleaseDocumentEnvironments(tx, input.workspaceId, input.documentId, [
        input.environmentId,
      ]);
      const [deployment] = await tx
        .select()
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, input.workspaceId),
            eq(documentDeployments.environmentId, input.environmentId),
            eq(documentDeployments.documentId, input.documentId),
          ),
        )
        .limit(1)
        .for('update');
      if ((deployment?.generation ?? 0) !== input.expectedGeneration) {
        throw new DeploymentScheduleConflictError('document deployment changed before scheduling');
      }

      const now = new Date();
      const scheduleId = `schedule_${randomUUID()}`;
      let publication = sourcePublication;
      if (sourcePublication.environmentId !== input.environmentId) {
        if (scope.environment.releasePolicy.requiredApprovalCount > 0) {
          throw new DeploymentScheduleConflictError(
            'target production policy requires an approved release before scheduling',
          );
        }
        const [verification] = await tx
          .select({ id: publicationVerifications.id })
          .from(publicationVerifications)
          .where(
            and(
              eq(publicationVerifications.workspaceId, input.workspaceId),
              eq(publicationVerifications.publicationId, sourcePublication.id),
              eq(publicationVerifications.result, 'passed'),
            ),
          )
          .orderBy(desc(publicationVerifications.createdAt))
          .limit(1);
        if (!verification) {
          throw new DeploymentScheduleConflictError(
            'source publication must pass browser verification before scheduling promotion',
          );
        }
        const [promoted] = await tx
          .insert(publications)
          .values({
            id: `pub_${randomUUID()}`,
            correlationId: `schedule_${input.idempotencyKey}`,
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            documentVersionId: sourcePublication.documentVersionId,
            compiledArtifactId: sourcePublication.compiledArtifactId,
            contentHash: sourcePublication.contentHash,
            action: 'promote',
            sourcePublicationId: sourcePublication.id,
            previousPublicationId:
              deployment?.state === 'active' ? deployment.activePublicationId : null,
            releaseOperationId: null,
            publishedByUserId: input.actorUserId,
            publishedAt: now,
          })
          .returning();
        if (!promoted) throw new Error('failed to pin scheduled promotion publication');
        publication = promoted;
      }
      const [created] = await tx
        .insert(deploymentSchedules)
        .values({
          id: scheduleId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          publicationId: publication.id,
          artifactId: publication.compiledArtifactId,
          contentHash: publication.contentHash,
          startAt: new Date(times.startAt),
          endAt: times.endAt ? new Date(times.endAt) : null,
          expectedGeneration: input.expectedGeneration,
          status: 'scheduled',
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          revision: 1,
          createdByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error('failed to create deployment schedule');
      const jobs = [
        scheduleJobValues(created, 'start', created.startAt, created.expectedGeneration),
        ...(created.endAt ? [scheduleJobValues(created, 'end', created.endAt, null)] : []),
      ];
      await tx.insert(deliveryScheduleJobs).values(jobs);
      return toPersistedDeploymentSchedule(created);
    });
  }

  async cancelDeploymentSchedule(
    input: CancelDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule | null> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      const [membership] = await tx
        .select({ role: workspaceMemberships.role, environment: environments })
        .from(environments)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, environments.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (
        !membership ||
        !membership.environment.releasePolicy.publisherRoles.some(
          (role) => role === membership.role,
        )
      ) {
        throw new DeploymentScheduleConflictError('workspace membership cannot cancel releases');
      }
      const now = new Date();
      const [updated] = await tx
        .update(deploymentSchedules)
        .set({ status: 'cancelled', revision: input.expectedRevision + 1, updatedAt: now })
        .where(
          and(
            eq(deploymentSchedules.workspaceId, input.workspaceId),
            eq(deploymentSchedules.environmentId, input.environmentId),
            eq(deploymentSchedules.documentId, input.documentId),
            eq(deploymentSchedules.id, input.scheduleId),
            eq(deploymentSchedules.status, 'scheduled'),
            eq(deploymentSchedules.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (!updated) {
        const [exists] = await tx
          .select({ id: deploymentSchedules.id })
          .from(deploymentSchedules)
          .where(
            and(
              eq(deploymentSchedules.workspaceId, input.workspaceId),
              eq(deploymentSchedules.id, input.scheduleId),
            ),
          )
          .limit(1);
        if (!exists) return null;
        throw new DeploymentScheduleConflictError(
          'deployment schedule changed before cancellation',
        );
      }
      await tx
        .update(deliveryScheduleJobs)
        .set({ status: 'cancelled', processedAt: now })
        .where(
          and(
            eq(deliveryScheduleJobs.workspaceId, input.workspaceId),
            eq(deliveryScheduleJobs.scheduleId, input.scheduleId),
            eq(deliveryScheduleJobs.status, 'pending'),
          ),
        );
      return toPersistedDeploymentSchedule(updated);
    });
  }

  async listDeploymentSchedules(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDeploymentSchedule[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(deploymentSchedules)
        .where(
          and(
            eq(deploymentSchedules.workspaceId, workspaceId),
            eq(deploymentSchedules.environmentId, environmentId),
            eq(deploymentSchedules.documentId, documentId),
          ),
        )
        .orderBy(desc(deploymentSchedules.createdAt), desc(deploymentSchedules.id));
      return rows.map(toPersistedDeploymentSchedule);
    });
  }

  async listDeliveryTransitionHistory(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<DeliveryTransitionHistoryEntry[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(deliveryTransitionHistory)
        .where(
          and(
            eq(deliveryTransitionHistory.workspaceId, workspaceId),
            eq(deliveryTransitionHistory.environmentId, environmentId),
            eq(deliveryTransitionHistory.documentId, documentId),
          ),
        )
        .orderBy(desc(deliveryTransitionHistory.occurredAt), desc(deliveryTransitionHistory.id));
      return rows.map(toDeliveryTransitionHistoryEntry);
    });
  }

  async runDueDeliveryScheduleJobs(
    input: RunDueDeliveryScheduleJobsInput,
  ): Promise<DeliveryScheduleJobResult[]> {
    const now = new Date(input.now);
    if (!Number.isFinite(now.getTime())) throw new Error('delivery worker time is invalid');
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_JOB_LIMIT, 100));
    const leaseMs = Math.max(1_000, Math.min(input.leaseMs ?? DEFAULT_LEASE_MS, 300_000));
    const claimed = await runWithDeliveryWorkerScope(this.database, async (tx) => {
      const rows = await tx
        .select()
        .from(deliveryScheduleJobs)
        .where(
          and(
            sql`${deliveryScheduleJobs.expectedGeneration} is not null`,
            lte(deliveryScheduleJobs.availableAt, now),
            or(
              eq(deliveryScheduleJobs.status, 'pending'),
              and(
                eq(deliveryScheduleJobs.status, 'leased'),
                lte(deliveryScheduleJobs.leasedUntil, now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(deliveryScheduleJobs.availableAt),
          asc(deliveryScheduleJobs.createdAt),
          asc(deliveryScheduleJobs.id),
        )
        .limit(limit)
        .for('update', { skipLocked: true });
      const leased: PersistedDeliveryScheduleJob[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(deliveryScheduleJobs)
          .set({
            status: 'leased',
            attempts: row.attempts + 1,
            leaseOwner: input.workerId,
            leaseVersion: row.leaseVersion + 1,
            leasedUntil: new Date(now.getTime() + leaseMs),
          })
          .where(eq(deliveryScheduleJobs.id, row.id))
          .returning();
        if (updated) leased.push(toPersistedDeliveryScheduleJob(updated));
      }
      return leased;
    });

    const results: DeliveryScheduleJobResult[] = [];
    for (const job of claimed) {
      try {
        results.push(await this.processClaimedJob(job, now, input.workerId));
      } catch (error) {
        results.push(await this.retryClaimedJob(job, now, input.workerId, error));
      }
    }
    return results;
  }

  async observeWorkspaceDataCatalog(
    input: ObserveWorkspaceDataCatalogInput,
  ): Promise<WorkspaceDataCatalog> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      if (input.observations.length > 0) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`data-catalog:${input.workspaceId}`}, 0))`,
        );
        const [current] = await tx
          .select({ version: max(workspaceDataCatalogEntries.catalogVersion) })
          .from(workspaceDataCatalogEntries)
          .where(eq(workspaceDataCatalogEntries.workspaceId, input.workspaceId));
        const version = Number(current?.version ?? 0) + 1;
        const observations = dedupeCatalogObservations(input.observations);
        for (const observation of observations) {
          const observedAt = new Date(observation.observedAt);
          await tx
            .insert(workspaceDataCatalogEntries)
            .values({
              id: `catalog_${randomUUID()}`,
              workspaceId: input.workspaceId,
              environmentId: input.environmentId,
              source: observation.source,
              key: observation.key,
              valueType: observation.valueType,
              catalogVersion: version,
              firstSeenAt: observedAt,
              lastSeenAt: observedAt,
              createdAt: observedAt,
              updatedAt: observedAt,
            })
            .onConflictDoUpdate({
              target: [
                workspaceDataCatalogEntries.workspaceId,
                workspaceDataCatalogEntries.environmentId,
                workspaceDataCatalogEntries.source,
                workspaceDataCatalogEntries.key,
              ],
              set: {
                valueType: sql`case
                  when ${workspaceDataCatalogEntries.valueType} = ${observation.valueType}
                    then ${workspaceDataCatalogEntries.valueType}
                  else 'unknown'
                end`,
                catalogVersion: version,
                lastSeenAt: sql`greatest(${workspaceDataCatalogEntries.lastSeenAt}, ${observedAt})`,
                updatedAt: observedAt,
              },
            });
        }
      }
      return this.readWorkspaceDataCatalogTx(tx, input.workspaceId);
    });
  }

  async readWorkspaceDataCatalog(workspaceId: string): Promise<WorkspaceDataCatalog> {
    return this.scoped(workspaceId, (tx) => this.readWorkspaceDataCatalogTx(tx, workspaceId));
  }

  private async processClaimedJob(
    claimed: PersistedDeliveryScheduleJob,
    now: Date,
    workerId: string,
  ): Promise<DeliveryScheduleJobResult> {
    return this.scoped(claimed.workspaceId, async (tx) => {
      await this.lockSortedReleaseDocumentEnvironments(
        tx,
        claimed.workspaceId,
        claimed.documentId,
        [claimed.environmentId],
      );
      const [job] = await tx
        .select()
        .from(deliveryScheduleJobs)
        .where(
          and(
            eq(deliveryScheduleJobs.workspaceId, claimed.workspaceId),
            eq(deliveryScheduleJobs.id, claimed.id),
            eq(deliveryScheduleJobs.status, 'leased'),
            eq(deliveryScheduleJobs.leaseOwner, workerId),
            eq(deliveryScheduleJobs.leaseVersion, claimed.leaseVersion),
          ),
        )
        .limit(1)
        .for('update');
      if (!job) return staleLeaseResult(claimed);
      const [schedule] = await tx
        .select()
        .from(deploymentSchedules)
        .where(
          and(
            eq(deploymentSchedules.workspaceId, claimed.workspaceId),
            eq(deploymentSchedules.id, claimed.scheduleId),
          ),
        )
        .limit(1)
        .for('update');
      if (!schedule || schedule.status === 'cancelled' || schedule.status === 'failed') {
        return this.failClaimedJob(tx, job, schedule, now, 'schedule_inactive');
      }
      const [deployment] = await tx
        .select()
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, job.workspaceId),
            eq(documentDeployments.environmentId, job.environmentId),
            eq(documentDeployments.documentId, job.documentId),
          ),
        )
        .limit(1)
        .for('update');
      const generation = deployment?.generation ?? 0;
      if (generation !== job.expectedGeneration) {
        return this.failClaimedJob(tx, job, schedule, now, 'deployment_changed', deployment);
      }
      const [publication] = await tx
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.workspaceId, job.workspaceId),
            eq(publications.environmentId, job.environmentId),
            eq(publications.documentId, job.documentId),
            eq(publications.id, job.publicationId),
            eq(publications.compiledArtifactId, schedule.artifactId),
            eq(publications.contentHash, schedule.contentHash),
          ),
        )
        .limit(1);
      if (!publication) {
        return this.failClaimedJob(tx, job, schedule, now, 'publication_pin_changed', deployment);
      }

      if (job.transition === 'end') {
        if (
          deployment?.state !== 'active' ||
          deployment.activePublicationId !== job.publicationId
        ) {
          return this.failClaimedJob(
            tx,
            job,
            schedule,
            now,
            'active_publication_changed',
            deployment,
          );
        }
        const [next] = await tx
          .update(documentDeployments)
          .set({
            state: 'inactive',
            activePublicationId: null,
            pendingReleaseOperationId: null,
            generation: generation + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(documentDeployments.workspaceId, job.workspaceId),
              eq(documentDeployments.environmentId, job.environmentId),
              eq(documentDeployments.documentId, job.documentId),
              eq(documentDeployments.generation, generation),
              eq(documentDeployments.activePublicationId, job.publicationId),
            ),
          )
          .returning();
        if (!next)
          return this.failClaimedJob(tx, job, schedule, now, 'deployment_changed', deployment);
        await this.completeClaimedJob(tx, job, schedule, next, now, job.publicationId, null);
        return appliedResult(job, next.generation);
      }

      await this.assertLiveStockAvailable(tx, job.workspaceId, job.documentId);
      const [next] = deployment
        ? await tx
            .update(documentDeployments)
            .set({
              state: 'active',
              activePublicationId: job.publicationId,
              pendingReleaseOperationId: null,
              generation: generation + 1,
              updatedAt: now,
            })
            .where(
              and(
                eq(documentDeployments.workspaceId, job.workspaceId),
                eq(documentDeployments.environmentId, job.environmentId),
                eq(documentDeployments.documentId, job.documentId),
                eq(documentDeployments.generation, generation),
              ),
            )
            .returning()
        : await tx
            .insert(documentDeployments)
            .values({
              workspaceId: job.workspaceId,
              environmentId: job.environmentId,
              documentId: job.documentId,
              state: 'active',
              activePublicationId: job.publicationId,
              pendingReleaseOperationId: null,
              generation: 1,
              updatedAt: now,
            })
            .returning();
      if (!next)
        return this.failClaimedJob(tx, job, schedule, now, 'deployment_changed', deployment);
      await this.completeClaimedJob(
        tx,
        job,
        schedule,
        next,
        now,
        deployment?.state === 'active' ? deployment.activePublicationId : null,
        job.publicationId,
      );
      await tx
        .update(deliveryScheduleJobs)
        .set({ expectedGeneration: next.generation })
        .where(
          and(
            eq(deliveryScheduleJobs.workspaceId, job.workspaceId),
            eq(deliveryScheduleJobs.scheduleId, schedule.id),
            eq(deliveryScheduleJobs.transition, 'end'),
            eq(deliveryScheduleJobs.status, 'pending'),
          ),
        );
      return appliedResult(job, next.generation);
    });
  }

  private async completeClaimedJob(
    tx: LodariqTransaction,
    job: typeof deliveryScheduleJobs.$inferSelect,
    schedule: typeof deploymentSchedules.$inferSelect,
    deployment: typeof documentDeployments.$inferSelect,
    now: Date,
    fromPublicationId: string | null,
    toPublicationId: string | null,
  ): Promise<void> {
    await tx
      .update(deliveryScheduleJobs)
      .set({
        status: 'completed',
        leaseOwner: null,
        leasedUntil: null,
        resultGeneration: deployment.generation,
        errorCode: null,
        processedAt: now,
      })
      .where(eq(deliveryScheduleJobs.id, job.id));
    await tx
      .update(deploymentSchedules)
      .set({
        status: job.transition === 'start' && schedule.endAt ? 'active' : 'completed',
        revision: schedule.revision + 1,
        updatedAt: now,
      })
      .where(eq(deploymentSchedules.id, schedule.id));
    await tx.insert(deliveryTransitionHistory).values({
      id: `delivery_transition_${randomUUID()}`,
      workspaceId: job.workspaceId,
      environmentId: job.environmentId,
      documentId: job.documentId,
      scheduleId: schedule.id,
      jobId: job.id,
      transition: job.transition,
      outcome: 'applied',
      fromGeneration: deployment.generation - 1,
      toGeneration: deployment.generation,
      fromPublicationId,
      toPublicationId,
      reasonCode: null,
      occurredAt: now,
    });
  }

  private async failClaimedJob(
    tx: LodariqTransaction,
    job: typeof deliveryScheduleJobs.$inferSelect,
    schedule: typeof deploymentSchedules.$inferSelect | undefined,
    now: Date,
    reasonCode: string,
    deployment?: typeof documentDeployments.$inferSelect,
  ): Promise<DeliveryScheduleJobResult> {
    const generation = deployment?.generation ?? 0;
    await tx
      .update(deliveryScheduleJobs)
      .set({
        status: 'failed',
        leaseOwner: null,
        leasedUntil: null,
        resultGeneration: generation,
        errorCode: reasonCode,
        processedAt: now,
      })
      .where(eq(deliveryScheduleJobs.id, job.id));
    if (schedule) {
      await tx
        .update(deploymentSchedules)
        .set({ status: 'failed', revision: schedule.revision + 1, updatedAt: now })
        .where(eq(deploymentSchedules.id, schedule.id));
    }
    await tx.insert(deliveryTransitionHistory).values({
      id: `delivery_transition_${randomUUID()}`,
      workspaceId: job.workspaceId,
      environmentId: job.environmentId,
      documentId: job.documentId,
      scheduleId: job.scheduleId,
      jobId: job.id,
      transition: job.transition,
      outcome: 'conflict',
      fromGeneration: generation,
      toGeneration: generation,
      fromPublicationId: deployment?.activePublicationId ?? null,
      toPublicationId: deployment?.activePublicationId ?? null,
      reasonCode,
      occurredAt: now,
    });
    return {
      jobId: job.id,
      scheduleId: job.scheduleId,
      transition: job.transition,
      outcome: 'conflict',
      generation,
      reasonCode,
    };
  }

  private async retryClaimedJob(
    job: PersistedDeliveryScheduleJob,
    now: Date,
    workerId: string,
    error: unknown,
  ): Promise<DeliveryScheduleJobResult> {
    if (error instanceof CommercialEntitlementError) {
      return this.scoped(job.workspaceId, async (tx) => {
        const [row] = await tx
          .select()
          .from(deliveryScheduleJobs)
          .where(eq(deliveryScheduleJobs.id, job.id))
          .limit(1)
          .for('update');
        const [schedule] = await tx
          .select()
          .from(deploymentSchedules)
          .where(eq(deploymentSchedules.id, job.scheduleId))
          .limit(1)
          .for('update');
        if (!row || row.leaseOwner !== workerId || row.leaseVersion !== job.leaseVersion) {
          return staleLeaseResult(job);
        }
        return this.failClaimedJob(tx, row, schedule, now, 'live_experience_limit');
      });
    }
    if (job.attempts >= job.maxAttempts) {
      return this.scoped(job.workspaceId, async (tx) => {
        const [row] = await tx
          .select()
          .from(deliveryScheduleJobs)
          .where(eq(deliveryScheduleJobs.id, job.id))
          .limit(1)
          .for('update');
        const [schedule] = await tx
          .select()
          .from(deploymentSchedules)
          .where(eq(deploymentSchedules.id, job.scheduleId))
          .limit(1)
          .for('update');
        if (!row || row.leaseOwner !== workerId || row.leaseVersion !== job.leaseVersion) {
          return staleLeaseResult(job);
        }
        return this.failClaimedJob(tx, row, schedule, now, 'retry_exhausted');
      });
    }
    const delayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, job.attempts - 1));
    return this.scoped(job.workspaceId, async (tx) => {
      const [updated] = await tx
        .update(deliveryScheduleJobs)
        .set({
          status: 'pending',
          leaseOwner: null,
          leasedUntil: null,
          availableAt: new Date(now.getTime() + delayMs),
          errorCode: 'transient_failure',
        })
        .where(
          and(
            eq(deliveryScheduleJobs.id, job.id),
            eq(deliveryScheduleJobs.status, 'leased'),
            eq(deliveryScheduleJobs.leaseOwner, workerId),
            eq(deliveryScheduleJobs.leaseVersion, job.leaseVersion),
          ),
        )
        .returning({ id: deliveryScheduleJobs.id });
      if (!updated) return staleLeaseResult(job);
      return {
        jobId: job.id,
        scheduleId: job.scheduleId,
        transition: job.transition,
        outcome: 'retrying',
        generation: null,
        reasonCode: 'transient_failure',
      };
    });
  }

  private async assertLiveStockAvailable(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
  ): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`live-stock:${workspaceId}`}, 0))`,
    );
    const limit = (await this.resolveWorkspaceEntitlements(tx, workspaceId)).entitlements
      .liveExperiences;
    if (limit === null) return;
    const [stock, existing] = await Promise.all([
      tx
        .select({ used: countDistinct(documentDeployments.documentId) })
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.state, 'active'),
          ),
        ),
      tx
        .select({ documentId: documentDeployments.documentId })
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.documentId, documentId),
            eq(documentDeployments.state, 'active'),
          ),
        )
        .limit(1),
    ]);
    const used = Number(stock[0]?.used ?? 0);
    if (!existing[0] && used + 1 > limit) {
      throw new CommercialEntitlementError('live-experiences', used, limit);
    }
  }

  private async readWorkspaceDataCatalogTx(
    tx: LodariqTransaction,
    workspaceId: string,
  ): Promise<WorkspaceDataCatalog> {
    const rows = await tx
      .select({ entry: workspaceDataCatalogEntries, environment: environments.kind })
      .from(workspaceDataCatalogEntries)
      .innerJoin(
        environments,
        and(
          eq(workspaceDataCatalogEntries.workspaceId, environments.workspaceId),
          eq(workspaceDataCatalogEntries.environmentId, environments.id),
        ),
      )
      .where(eq(workspaceDataCatalogEntries.workspaceId, workspaceId))
      .orderBy(
        asc(workspaceDataCatalogEntries.source),
        asc(workspaceDataCatalogEntries.key),
        asc(environments.kind),
      );
    const grouped = new Map<string, DataCatalogEntry>();
    let version = 0;
    let updatedAt: string | undefined;
    for (const row of rows) {
      version = Math.max(version, row.entry.catalogVersion);
      const identity = `${row.entry.source}:${row.entry.key}`;
      const current = grouped.get(identity);
      const environmentSet = new Set(current?.environments ?? []);
      environmentSet.add(row.environment as Environment);
      const lastSeenAt = laterIso(current?.lastSeenAt, row.entry.lastSeenAt.toISOString());
      grouped.set(identity, {
        id: current?.id ?? row.entry.id,
        source: row.entry.source,
        key: row.entry.key,
        environments: [...environmentSet].sort(),
        valueType: mergeValueType(current?.valueType, row.entry.valueType as DataCatalogValueType),
        lastSeenAt,
      });
      updatedAt = laterIso(updatedAt, row.entry.updatedAt.toISOString());
    }
    return {
      schemaVersion: DATA_CATALOG_SCHEMA_VERSION,
      version,
      entries: [...grouped.values()],
      ...(updatedAt ? { updatedAt } : {}),
    };
  }
}

function scheduleJobValues(
  schedule: typeof deploymentSchedules.$inferSelect,
  transition: 'start' | 'end',
  availableAt: Date,
  expectedGeneration: number | null,
): typeof deliveryScheduleJobs.$inferInsert {
  return {
    id: `delivery_job_${randomUUID()}`,
    workspaceId: schedule.workspaceId,
    scheduleId: schedule.id,
    environmentId: schedule.environmentId,
    documentId: schedule.documentId,
    publicationId: schedule.publicationId,
    transition,
    status: 'pending',
    expectedGeneration,
    availableAt,
    attempts: 0,
    maxAttempts: 8,
    leaseOwner: null,
    leaseVersion: 0,
    leasedUntil: null,
    resultGeneration: null,
    errorCode: null,
    createdAt: schedule.createdAt,
    processedAt: null,
  };
}

function toPersistedDeploymentSchedule(
  row: typeof deploymentSchedules.$inferSelect,
): PersistedDeploymentSchedule {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    publicationId: row.publicationId,
    artifactId: row.artifactId,
    contentHash: row.contentHash,
    startAt: toIsoString(row.startAt),
    ...(row.endAt ? { endAt: toIsoString(row.endAt) } : {}),
    expectedGeneration: row.expectedGeneration,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    revision: row.revision,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toPersistedDeliveryScheduleJob(
  row: typeof deliveryScheduleJobs.$inferSelect,
): PersistedDeliveryScheduleJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    scheduleId: row.scheduleId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    publicationId: row.publicationId,
    transition: row.transition,
    status: row.status,
    expectedGeneration: row.expectedGeneration,
    availableAt: toIsoString(row.availableAt),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    leaseOwner: row.leaseOwner,
    leaseVersion: row.leaseVersion,
    leasedUntil: row.leasedUntil ? toIsoString(row.leasedUntil) : null,
    resultGeneration: row.resultGeneration,
    errorCode: row.errorCode,
    createdAt: toIsoString(row.createdAt),
    processedAt: row.processedAt ? toIsoString(row.processedAt) : null,
  };
}

function toDeliveryTransitionHistoryEntry(
  row: typeof deliveryTransitionHistory.$inferSelect,
): DeliveryTransitionHistoryEntry {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    scheduleId: row.scheduleId,
    jobId: row.jobId,
    transition: row.transition,
    outcome: row.outcome,
    fromGeneration: row.fromGeneration,
    toGeneration: row.toGeneration,
    ...(row.fromPublicationId ? { fromPublicationId: row.fromPublicationId } : {}),
    ...(row.toPublicationId ? { toPublicationId: row.toPublicationId } : {}),
    ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}),
    occurredAt: toIsoString(row.occurredAt),
  };
}

function appliedResult(
  job: typeof deliveryScheduleJobs.$inferSelect,
  generation: number,
): DeliveryScheduleJobResult {
  return {
    jobId: job.id,
    scheduleId: job.scheduleId,
    transition: job.transition,
    outcome: 'applied',
    generation,
  };
}

function staleLeaseResult(job: PersistedDeliveryScheduleJob): DeliveryScheduleJobResult {
  return {
    jobId: job.id,
    scheduleId: job.scheduleId,
    transition: job.transition,
    outcome: 'conflict',
    generation: null,
    reasonCode: 'lease_changed',
  };
}

function dedupeCatalogObservations(
  observations: ObserveWorkspaceDataCatalogInput['observations'],
): ObserveWorkspaceDataCatalogInput['observations'] {
  const deduped = new Map<string, ObserveWorkspaceDataCatalogInput['observations'][number]>();
  for (const observation of observations) {
    const identity = `${observation.source}:${observation.key}`;
    const current = deduped.get(identity);
    if (!current) {
      deduped.set(identity, observation);
      continue;
    }
    deduped.set(identity, {
      ...observation,
      valueType: mergeValueType(current.valueType, observation.valueType),
      observedAt: laterIso(current.observedAt, observation.observedAt),
    });
  }
  return [...deduped.values()];
}

function mergeValueType(
  current: DataCatalogValueType | undefined,
  next: DataCatalogValueType | undefined,
): DataCatalogValueType {
  if (!current) return next ?? 'unknown';
  if (!next || current === next) return current;
  return 'unknown';
}

function laterIso(left: string | undefined, right: string): string {
  if (!left) return right;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}
