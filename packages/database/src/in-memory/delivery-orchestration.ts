import { randomUUID } from 'node:crypto';
import {
  DATA_CATALOG_SCHEMA_VERSION,
  createDefaultEnvironmentReleasePolicy,
  type DataCatalogEntry,
  type DataCatalogValueType,
  type DeliveryTransitionHistoryEntry,
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
import { IdempotencyConflictError, type PersistedDocumentDeployment } from '../domains/releases';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryCommercialEntitlements } from './commercial-entitlements';

const DEFAULT_JOB_LIMIT = 25;
const DEFAULT_LEASE_MS = 30_000;

export class InMemoryRepositoryDeliveryOrchestration extends InMemoryRepositoryCommercialEntitlements {
  async createDeploymentSchedule(
    input: CreateDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule> {
    assertReleaseMutationGuardInput(input);
    const times = normalizeDeploymentScheduleTimes(input.startAt, input.endAt);
    const identityKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.documentId,
      input.idempotencyKey,
    );
    const existing = [...this.deploymentSchedules.values()].find(
      (candidate) =>
        this.key(
          candidate.workspaceId,
          candidate.environmentId,
          candidate.documentId,
          candidate.idempotencyKey,
        ) === identityKey,
    );
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new IdempotencyConflictError(input.idempotencyKey);
      }
      return clone(existing);
    }

    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    assertCommercialFeature(entitlements, 'scheduling');
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) throw new Error('environment not found in workspace');
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !membership ||
      !(
        environment.releasePolicy ?? createDefaultEnvironmentReleasePolicy(environment.kind)
      ).publisherRoles.some((role) => role === membership.role)
    ) {
      throw new DeploymentScheduleConflictError('workspace membership cannot schedule releases');
    }
    const sourcePublication = this.findPublicationById(input.workspaceId, input.publicationId);
    if (!sourcePublication || sourcePublication.documentId !== input.documentId) {
      throw new DeploymentScheduleConflictError('publication is outside the scheduled deployment');
    }
    const deployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.environmentId, input.documentId),
    );
    const generation = deployment?.generation ?? 0;
    if (generation !== input.expectedGeneration) {
      throw new DeploymentScheduleConflictError('document deployment changed before scheduling');
    }

    let publication = sourcePublication;
    if (sourcePublication.environmentId !== input.environmentId) {
      const releasePolicy =
        environment.releasePolicy ?? createDefaultEnvironmentReleasePolicy(environment.kind);
      if (releasePolicy.requiredApprovalCount > 0) {
        throw new DeploymentScheduleConflictError(
          'target production policy requires an approved release before scheduling',
        );
      }
      const verification = (
        this.publicationVerifications.get(this.key(input.workspaceId, sourcePublication.id)) ?? []
      )
        .filter((entry) => entry.result === 'passed')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
      if (!verification) {
        throw new DeploymentScheduleConflictError(
          'source publication must pass browser verification before scheduling promotion',
        );
      }
      publication = this.createPublication(
        {
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          correlationId: `schedule_${input.idempotencyKey}`,
          artifact: sourcePublication.artifact,
          actorUserId: input.actorUserId,
        },
        {
          action: 'promote',
          sourcePublicationId: sourcePublication.id,
          previousPublicationId:
            deployment?.state === 'active' ? deployment.activePublicationId : null,
          releaseOperationId: null,
        },
      );
    }

    const now = new Date().toISOString();
    const schedule: PersistedDeploymentSchedule = {
      id: `schedule_${randomUUID()}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      publicationId: publication.id,
      artifactId: publication.artifact.id,
      contentHash: publication.contentHash,
      startAt: times.startAt,
      ...(times.endAt ? { endAt: times.endAt } : {}),
      expectedGeneration: input.expectedGeneration,
      status: 'scheduled',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      revision: 1,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.deploymentSchedules.set(schedule.id, schedule);
    this.rememberScheduleJob(schedule, 'start', schedule.startAt, schedule.expectedGeneration);
    if (schedule.endAt) this.rememberScheduleJob(schedule, 'end', schedule.endAt, null);
    return clone(schedule);
  }

  async cancelDeploymentSchedule(
    input: CancelDeploymentScheduleInput,
  ): Promise<PersistedDeploymentSchedule | null> {
    const schedule = this.deploymentSchedules.get(input.scheduleId);
    if (
      !schedule ||
      schedule.workspaceId !== input.workspaceId ||
      schedule.environmentId !== input.environmentId ||
      schedule.documentId !== input.documentId
    ) {
      return null;
    }
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (
      !membership ||
      !environment ||
      !(
        environment.releasePolicy ?? createDefaultEnvironmentReleasePolicy(environment.kind)
      ).publisherRoles.some((role) => role === membership.role)
    ) {
      throw new DeploymentScheduleConflictError('workspace membership cannot cancel releases');
    }
    if (schedule.revision !== input.expectedRevision || schedule.status !== 'scheduled') {
      throw new DeploymentScheduleConflictError('deployment schedule changed before cancellation');
    }
    const updated: PersistedDeploymentSchedule = {
      ...schedule,
      status: 'cancelled',
      revision: schedule.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.deploymentSchedules.set(schedule.id, updated);
    for (const [jobId, job] of this.deliveryScheduleJobs) {
      if (job.scheduleId !== schedule.id || job.status !== 'pending') continue;
      this.deliveryScheduleJobs.set(jobId, {
        ...job,
        status: 'cancelled',
        processedAt: updated.updatedAt,
      });
    }
    return clone(updated);
  }

  async listDeploymentSchedules(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDeploymentSchedule[]> {
    return [...this.deploymentSchedules.values()]
      .filter(
        (schedule) =>
          schedule.workspaceId === workspaceId &&
          schedule.environmentId === environmentId &&
          schedule.documentId === documentId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  async listDeliveryTransitionHistory(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<DeliveryTransitionHistoryEntry[]> {
    return this.deliveryTransitionHistory
      .filter(
        (entry) =>
          entry.workspaceId === workspaceId &&
          entry.environmentId === environmentId &&
          entry.documentId === documentId,
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }

  async runDueDeliveryScheduleJobs(
    input: RunDueDeliveryScheduleJobsInput,
  ): Promise<DeliveryScheduleJobResult[]> {
    const now = new Date(input.now);
    if (!Number.isFinite(now.getTime())) throw new Error('delivery worker time is invalid');
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_JOB_LIMIT, 100));
    const leaseMs = Math.max(1_000, Math.min(input.leaseMs ?? DEFAULT_LEASE_MS, 300_000));
    const due = [...this.deliveryScheduleJobs.values()]
      .filter(
        (job) =>
          job.expectedGeneration !== null &&
          Date.parse(job.availableAt) <= now.getTime() &&
          (job.status === 'pending' ||
            (job.status === 'leased' && Date.parse(job.leasedUntil ?? '') <= now.getTime())),
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))
      .slice(0, limit);

    const results: DeliveryScheduleJobResult[] = [];
    for (const candidate of due) {
      const claimed: PersistedDeliveryScheduleJob = {
        ...candidate,
        status: 'leased',
        attempts: candidate.attempts + 1,
        leaseOwner: input.workerId,
        leaseVersion: candidate.leaseVersion + 1,
        leasedUntil: new Date(now.getTime() + leaseMs).toISOString(),
      };
      this.deliveryScheduleJobs.set(claimed.id, claimed);
      try {
        results.push(this.applyClaimedJob(claimed, now));
      } catch (error) {
        results.push(
          error instanceof CommercialEntitlementError
            ? this.finishJobConflict(
                claimed,
                this.deploymentSchedules.get(claimed.scheduleId),
                now,
                'live_experience_limit',
              )
            : this.retryClaimedJob(claimed, now),
        );
      }
    }
    return results;
  }

  async observeWorkspaceDataCatalog(
    input: ObserveWorkspaceDataCatalogInput,
  ): Promise<WorkspaceDataCatalog> {
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('environment not found in workspace');
    }
    if (input.observations.length > 0) {
      const version = (this.workspaceDataCatalogVersions.get(input.workspaceId) ?? 0) + 1;
      this.workspaceDataCatalogVersions.set(input.workspaceId, version);
      for (const observation of input.observations) {
        const key = this.key(
          input.workspaceId,
          input.environmentId,
          observation.source,
          observation.key,
        );
        const existing = this.workspaceDataCatalogEntries.get(key);
        const lastSeenAt = newerTimestamp(existing?.lastSeenAt, observation.observedAt);
        this.workspaceDataCatalogEntries.set(key, {
          id: existing?.id ?? `catalog_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          source: observation.source,
          key: observation.key,
          environments: [
            environmentKind(
              this.environments.get(this.key(input.workspaceId, input.environmentId))!.kind,
            ),
          ],
          valueType: mergeValueType(existing?.valueType, observation.valueType),
          lastSeenAt,
          catalogVersion: version,
        });
      }
    }
    return this.readWorkspaceDataCatalog(input.workspaceId);
  }

  async readWorkspaceDataCatalog(workspaceId: string): Promise<WorkspaceDataCatalog> {
    const grouped = new Map<string, DataCatalogEntry>();
    let updatedAt: string | undefined;
    for (const row of this.workspaceDataCatalogEntries.values()) {
      if (row.workspaceId !== workspaceId) continue;
      const key = `${row.source}:${row.key}`;
      const existing = grouped.get(key);
      const environments = new Set(existing?.environments ?? []);
      environments.add(row.environments[0]!);
      const lastSeenAt = newerTimestamp(existing?.lastSeenAt, row.lastSeenAt);
      grouped.set(key, {
        id: existing?.id ?? row.id,
        source: row.source,
        key: row.key,
        environments: [...environments].sort() as DataCatalogEntry['environments'],
        valueType: mergeValueType(existing?.valueType, row.valueType),
        ...(lastSeenAt ? { lastSeenAt } : {}),
      });
      updatedAt = newerTimestamp(updatedAt, row.lastSeenAt);
    }
    return {
      schemaVersion: DATA_CATALOG_SCHEMA_VERSION,
      version: this.workspaceDataCatalogVersions.get(workspaceId) ?? 0,
      entries: [...grouped.values()].sort((left, right) =>
        `${left.source}:${left.key}`.localeCompare(`${right.source}:${right.key}`),
      ),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  private rememberScheduleJob(
    schedule: PersistedDeploymentSchedule,
    transition: 'start' | 'end',
    availableAt: string,
    expectedGeneration: number | null,
  ): void {
    const job: PersistedDeliveryScheduleJob = {
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
    this.deliveryScheduleJobs.set(job.id, job);
  }

  private applyClaimedJob(job: PersistedDeliveryScheduleJob, now: Date): DeliveryScheduleJobResult {
    const schedule = this.deploymentSchedules.get(job.scheduleId);
    if (!schedule || schedule.status === 'cancelled' || schedule.status === 'failed') {
      return this.finishJobConflict(job, schedule, now, 'schedule_inactive');
    }
    const deploymentKey = this.key(job.workspaceId, job.environmentId, job.documentId);
    const deployment = this.documentDeployments.get(deploymentKey);
    const generation = deployment?.generation ?? 0;
    if (generation !== job.expectedGeneration) {
      return this.finishJobConflict(job, schedule, now, 'deployment_changed');
    }
    const publication = this.findPublicationById(job.workspaceId, job.publicationId);
    if (
      !publication ||
      publication.environmentId !== job.environmentId ||
      publication.documentId !== job.documentId ||
      publication.artifact.id !== schedule.artifactId ||
      publication.contentHash !== schedule.contentHash
    ) {
      return this.finishJobConflict(job, schedule, now, 'publication_pin_changed');
    }

    if (job.transition === 'end') {
      if (deployment?.state !== 'active' || deployment.activePublicationId !== job.publicationId) {
        return this.finishJobConflict(job, schedule, now, 'active_publication_changed');
      }
      const next: PersistedDocumentDeployment = {
        workspaceId: job.workspaceId,
        environmentId: job.environmentId,
        documentId: job.documentId,
        state: 'inactive',
        activePublicationId: null,
        pendingReleaseOperationId: null,
        generation: generation + 1,
        updatedAt: now.toISOString(),
      };
      this.documentDeployments.set(deploymentKey, next);
      this.completeJob(job, schedule, next, now, deployment.activePublicationId, undefined);
      return {
        jobId: job.id,
        scheduleId: schedule.id,
        transition: job.transition,
        outcome: 'applied',
        generation: next.generation,
      };
    }

    this.assertLiveStockAvailable(job.workspaceId, job.documentId);
    const next: PersistedDocumentDeployment = {
      workspaceId: job.workspaceId,
      environmentId: job.environmentId,
      documentId: job.documentId,
      state: 'active',
      activePublicationId: job.publicationId,
      pendingReleaseOperationId: null,
      generation: generation + 1,
      updatedAt: now.toISOString(),
    };
    this.documentDeployments.set(deploymentKey, next);
    this.completeJob(
      job,
      schedule,
      next,
      now,
      deployment?.state === 'active' ? deployment.activePublicationId : undefined,
      job.publicationId,
    );
    const endJob = [...this.deliveryScheduleJobs.values()].find(
      (candidate) => candidate.scheduleId === schedule.id && candidate.transition === 'end',
    );
    if (endJob) {
      this.deliveryScheduleJobs.set(endJob.id, { ...endJob, expectedGeneration: next.generation });
    }
    return {
      jobId: job.id,
      scheduleId: schedule.id,
      transition: job.transition,
      outcome: 'applied',
      generation: next.generation,
    };
  }

  private completeJob(
    job: PersistedDeliveryScheduleJob,
    schedule: PersistedDeploymentSchedule,
    deployment: PersistedDocumentDeployment,
    now: Date,
    fromPublicationId?: string,
    toPublicationId?: string,
  ): void {
    this.deliveryScheduleJobs.set(job.id, {
      ...job,
      status: 'completed',
      leaseOwner: null,
      leasedUntil: null,
      resultGeneration: deployment.generation,
      processedAt: now.toISOString(),
    });
    const hasEnd = Boolean(schedule.endAt);
    const status = job.transition === 'start' && hasEnd ? 'active' : 'completed';
    this.deploymentSchedules.set(schedule.id, {
      ...schedule,
      status,
      revision: schedule.revision + 1,
      updatedAt: now.toISOString(),
    });
    this.deliveryTransitionHistory.push({
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
      ...(fromPublicationId ? { fromPublicationId } : {}),
      ...(toPublicationId ? { toPublicationId } : {}),
      occurredAt: now.toISOString(),
    });
  }

  private finishJobConflict(
    job: PersistedDeliveryScheduleJob,
    schedule: PersistedDeploymentSchedule | undefined,
    now: Date,
    reasonCode: string,
  ): DeliveryScheduleJobResult {
    const deployment = this.documentDeployments.get(
      this.key(job.workspaceId, job.environmentId, job.documentId),
    );
    const generation = deployment?.generation ?? 0;
    this.deliveryScheduleJobs.set(job.id, {
      ...job,
      status: 'failed',
      leaseOwner: null,
      leasedUntil: null,
      resultGeneration: generation,
      errorCode: reasonCode,
      processedAt: now.toISOString(),
    });
    if (schedule) {
      this.deploymentSchedules.set(schedule.id, {
        ...schedule,
        status: 'failed',
        revision: schedule.revision + 1,
        updatedAt: now.toISOString(),
      });
    }
    this.deliveryTransitionHistory.push({
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
      ...(deployment?.state === 'active'
        ? {
            fromPublicationId: deployment.activePublicationId,
            toPublicationId: deployment.activePublicationId,
          }
        : {}),
      reasonCode,
      occurredAt: now.toISOString(),
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

  private retryClaimedJob(job: PersistedDeliveryScheduleJob, now: Date): DeliveryScheduleJobResult {
    if (job.attempts >= job.maxAttempts) {
      return this.finishJobConflict(
        job,
        this.deploymentSchedules.get(job.scheduleId),
        now,
        'retry_exhausted',
      );
    }
    const delayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, job.attempts - 1));
    this.deliveryScheduleJobs.set(job.id, {
      ...job,
      status: 'pending',
      leaseOwner: null,
      leasedUntil: null,
      availableAt: new Date(now.getTime() + delayMs).toISOString(),
      errorCode: 'transient_failure',
    });
    return {
      jobId: job.id,
      scheduleId: job.scheduleId,
      transition: job.transition,
      outcome: 'retrying',
      generation: null,
      reasonCode: 'transient_failure',
    };
  }

  private assertLiveStockAvailable(workspaceId: string, documentId: string): void {
    const limit = this.resolveWorkspaceEntitlements(workspaceId).entitlements.liveExperiences;
    if (limit === null) return;
    const live = new Set(
      [...this.documentDeployments.values()]
        .filter(
          (deployment) => deployment.workspaceId === workspaceId && deployment.state === 'active',
        )
        .map((deployment) => deployment.documentId),
    );
    if (!live.has(documentId) && live.size + 1 > limit) {
      throw new CommercialEntitlementError('live-experiences', live.size, limit);
    }
  }
}

function mergeValueType(
  current: DataCatalogValueType | undefined,
  next: DataCatalogValueType | undefined,
): DataCatalogValueType {
  if (!current) return next ?? 'unknown';
  if (!next || current === next) return current;
  return 'unknown';
}

function newerTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function environmentKind(value: string): 'development' | 'staging' | 'production' {
  if (value === 'development' || value === 'staging' || value === 'production') return value;
  throw new Error('unsupported environment kind');
}
