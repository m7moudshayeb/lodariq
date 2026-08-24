import { randomUUID } from 'node:crypto';
import {
  ANALYTICS_EXPORT_DEFINITION_VERSION,
  AUTHORING_PRESENCE_TTL_SECONDS,
  EXPERIENCE_STEP_LOCK_TTL_SECONDS,
  type AnalyticsAudienceSegmentIdentity,
  type ApplicationSummary,
  type AdaptiveBehaviorEvidence,
  type ExperienceAnalytics,
  type ExperienceComment,
  type ExperienceCommentAuditEvent,
  type ExperienceSession,
  type ExperienceStepLock,
  type Experiment,
  type ExperimentArm,
  type ExperimentResults,
} from '@lodariq/schema';
import { clone } from '../domains/in-memory-helpers';
import {
  deriveAnalyticsAudienceSegment,
  type PersistedAnalyticsEventRecord,
} from '../domains/analytics';
import {
  DEFAULT_ADAPTIVE_POLICY,
  EXPERIENCE_COMPLETED_EVENT,
  EXPERIENCE_DISMISSED_EVENT,
  EXPERIENCE_SHOWN_EVENT,
  activeStepLocks,
  audienceSegmentPublicationKey,
  assignExperimentArm,
  assertExperimentArms,
  ExperimentRuleError,
  canClaimStepLock,
  deriveAdoptionImpact,
  deriveExperienceAnalyticsBreakdown,
  deriveAdaptiveBehaviorEvidence,
  deriveExperimentResults,
  deriveFunnel,
  experimentAllocationChanged,
  experimentVariantContentChanged,
  countDistinctCorrelations,
  hashExperimentAssignmentKey,
  summarizeFormResponses,
  type ExperienceExperimentRecord,
  type ExperienceExperimentAssignmentRecord,
  type ExperienceCommentAuditEventRecord,
  type ExperienceCommentRecord,
  type AuthoringPresenceRecord,
  type ExperienceMeasurementRecord,
  type ExperienceStepLockRecord,
  type MeasurableEvent,
  type ReadAdaptiveBehaviorEvidenceInput,
  type WorkspaceApplicationRecord,
} from '../domains/experience-measurement';
import {
  buildExperienceSessions,
  type ListExperienceSessionsInput,
} from '../domains/experience-sessions';
import { InMemoryRepositoryAnalytics } from './analytics';
import {
  analyticsExportLimitForSnapshot,
  assertCommercialFeature,
  calendarMonthPeriod,
  CommercialEntitlementError,
} from '../domains/commercial-entitlements';
import {
  ANALYTICS_EXPORT_FEATURES,
  ANALYTICS_EXPORT_LEASE_MS,
  ANALYTICS_EXPORT_MAX_ACTIVE_JOBS,
  ANALYTICS_EXPORT_MAX_ATTEMPTS,
  ANALYTICS_EXPORT_MAX_SOURCE_EVENTS,
  ANALYTICS_RAW_EXPORT_RETENTION_DAYS,
  ANALYTICS_EXPORT_RESULT_RETENTION_MS,
  AnalyticsExportBackpressureError,
  AnalyticsExportGenerationError,
  assertAnalyticsExportResult,
  type AnalyticsExportAuditEventRecord,
  type AnalyticsExportScope,
  type ClaimAnalyticsExportJobsInput,
  type CompleteAnalyticsExportJobInput,
  type CreateAnalyticsExportJobInput,
  type FailAnalyticsExportJobInput,
  type PersistedAnalyticsExportJob,
  type ReadAnalyticsExportEventsInput,
} from '../domains/analytics-exports';
import { IdempotencyConflictError } from '../domains/releases';
import type {
  ClaimStepLockInput,
  CreateExperienceCommentInput,
  CreateExperimentInput,
  ExperienceStepLockClaimResult,
  ExperienceScope,
  HeartbeatAuthoringPresenceInput,
  LeaveAuthoringPresenceInput,
  ExperienceExperimentScope,
  QueryExperienceAnalyticsInput,
  RecordFormResponsesInput,
  ResolveExperimentAssignmentInput,
  ReplyExperienceCommentInput,
  ResolveExperienceCommentInput,
  UpdateExperienceMeasurementInput,
  UpdateExperimentInput,
  UpsertWorkspaceApplicationInput,
} from '../domains/experience-measurement-repository';

export class InMemoryRepositoryExperienceMeasurement extends InMemoryRepositoryAnalytics {
  async readAdaptiveBehaviorEvidence(
    input: ReadAdaptiveBehaviorEvidenceInput,
  ): Promise<AdaptiveBehaviorEvidence[]> {
    const retentionDays = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements
      .analyticsRetentionDays;
    return deriveAdaptiveBehaviorEvidence(this.analyticsEvents, {
      ...input,
      lookbackDays: Math.min(input.lookbackDays, retentionDays),
    });
  }

  async readExperienceMeasurement(scope: ExperienceScope): Promise<ExperienceMeasurementRecord> {
    return clone(this.measurementFor(scope));
  }

  async updateExperienceMeasurement(
    input: UpdateExperienceMeasurementInput,
  ): Promise<ExperienceMeasurementRecord> {
    const current = this.measurementFor(input);
    if (input.successEvent) {
      const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
      assertCommercialFeature(entitlements, 'adoption-impact');
      const used = [...this.experienceMeasurement.values()].filter(
        (measurement) =>
          measurement.workspaceId === input.workspaceId &&
          measurement.documentId !== input.documentId &&
          measurement.successEvent,
      ).length;
      const limit = entitlements.adoptionSuccessEvents;
      if (limit !== null && used + 1 > limit) {
        throw new CommercialEntitlementError('adoption-success-events', used, limit);
      }
    }
    const next: ExperienceMeasurementRecord = {
      ...current,
      ...(input.successEvent === undefined
        ? {}
        : input.successEvent === null
          ? { successEvent: undefined }
          : { successEvent: clone(input.successEvent) }),
      ...(input.adaptivePolicy ? { adaptivePolicy: clone(input.adaptivePolicy) } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.experienceMeasurement.set(this.key(input.workspaceId, input.documentId), next);
    return clone(next);
  }

  async readExperienceAnalytics(
    input: QueryExperienceAnalyticsInput,
  ): Promise<ExperienceAnalytics> {
    const measurement = this.measurementFor(input);
    const asOf = input.asOf ?? new Date().toISOString();
    const asOfMs = Date.parse(asOf);
    if (!Number.isFinite(asOfMs)) throw new Error('analytics asOf must be a valid timestamp');
    const events = this.measurableEvents(input.workspaceId, input.environmentId, asOfMs);
    const scoped = events.filter((event) => event.documentId === input.documentId);
    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    const retentionDays = entitlements.analyticsRetentionDays;
    const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
    const audienceSegmentsByPublication = new Map<string, AnalyticsAudienceSegmentIdentity>();
    const needsHistoricalAttribution = scoped.some(
      (event) => !event.audienceSegment && event.publicationId && event.contentHash,
    );
    if (includeAudienceSegments && needsHistoricalAttribution) {
      for (const publications of this.publications.values()) {
        for (const publication of publications) {
          if (
            publication.workspaceId !== input.workspaceId ||
            publication.environmentId !== input.environmentId ||
            publication.documentId !== input.documentId
          ) {
            continue;
          }
          const compiled = publication.artifact.compiled;
          audienceSegmentsByPublication.set(
            audienceSegmentPublicationKey(publication.id, publication.contentHash),
            deriveAnalyticsAudienceSegment(
              'audience' in compiled ? compiled.audience : { rules: [] },
            ),
          );
        }
      }
    }
    const cutoff = asOfMs - retentionDays * 24 * 60 * 60 * 1_000;
    const responses = this.experienceFormResponses.filter(
      (response) =>
        response.workspaceId === input.workspaceId &&
        response.environmentId === input.environmentId &&
        response.documentId === input.documentId &&
        Date.parse(response.occurredAt) >= cutoff &&
        Date.parse(response.occurredAt) <= asOfMs,
    );
    return {
      documentId: input.documentId,
      environmentId: input.environmentId,
      shown: countDistinctCorrelations(scoped, EXPERIENCE_SHOWN_EVENT),
      completed: countDistinctCorrelations(scoped, EXPERIENCE_COMPLETED_EVENT),
      dismissed: countDistinctCorrelations(scoped, EXPERIENCE_DISMISSED_EVENT),
      funnel: deriveFunnel(scoped, input.stepIdsInOrder),
      // Success events are emitted by the product, so they are matched across
      // the whole environment rather than only inside this experience.
      adoption: measurement.successEvent
        ? [deriveAdoptionImpact(measurement.successEvent, scoped, events)]
        : [],
      formResponses: summarizeFormResponses(responses),
      breakdown: deriveExperienceAnalyticsBreakdown({
        documentId: input.documentId,
        events,
        responses,
        stepIdsInOrder: input.stepIdsInOrder,
        retentionDays,
        asOf,
        includeAudienceSegments,
        audienceSegmentsByPublication,
        ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
      }),
    };
  }

  async createAnalyticsExportJob(
    input: CreateAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob> {
    assertAnalyticsExportInput(input);
    const existing = [...this.analyticsExportJobs.values()].find(
      (job) => job.workspaceId === input.workspaceId && job.operationId === input.operationId,
    );
    if (existing) {
      if (!analyticsExportRequestMatches(existing, input)) {
        throw new IdempotencyConflictError(input.operationId);
      }
      return clone(existing);
    }
    const snapshot = this.resolveWorkspaceEntitlements(input.workspaceId);
    const entitlement = snapshot.entitlements;
    assertCommercialFeature(entitlement, ANALYTICS_EXPORT_FEATURES[input.kind]);
    const active = [...this.analyticsExportJobs.values()].filter(
      (job) =>
        job.workspaceId === input.workspaceId &&
        (job.status === 'queued' || job.status === 'processing'),
    ).length;
    if (active >= ANALYTICS_EXPORT_MAX_ACTIVE_JOBS) throw new AnalyticsExportBackpressureError();
    const period = calendarMonthPeriod(input.requestedAt);
    const periodStart = period.start.toISOString();
    const used = [...this.analyticsExportJobs.values()].filter(
      (job) =>
        job.workspaceId === input.workspaceId &&
        job.createdAt >= periodStart &&
        job.createdAt < period.end.toISOString(),
    ).length;
    const limit = analyticsExportLimitForSnapshot(snapshot);
    if (limit !== null && used + 1 > limit) {
      throw new CommercialEntitlementError('analytics-export-jobs', used, limit);
    }
    this.assertAnalyticsExportScope(input);
    const id = `anx_${randomUUID().replace(/-/gu, '')}`;
    const retentionDays =
      input.kind === 'raw-events-jsonl'
        ? Math.min(entitlement.analyticsRetentionDays, ANALYTICS_RAW_EXPORT_RETENTION_DAYS)
        : entitlement.analyticsRetentionDays;
    const retentionCutoff = new Date(
      Date.parse(input.requestedAt) - retentionDays * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const job: PersistedAnalyticsExportJob = {
      id,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      operationId: input.operationId,
      requestHash: input.requestHash,
      kind: input.kind,
      status: 'queued',
      definitionVersion: ANALYTICS_EXPORT_DEFINITION_VERSION,
      ...(input.release ? { release: clone(input.release) } : {}),
      retentionCutoff,
      attemptCount: 0,
      maxAttempts: ANALYTICS_EXPORT_MAX_ATTEMPTS,
      nextAttemptAt: input.requestedAt,
      requestedByUserId: input.actorUserId,
      createdAt: input.requestedAt,
      updatedAt: input.requestedAt,
    };
    this.analyticsExportJobs.set(this.key(input.workspaceId, id), job);
    this.appendAnalyticsExportAudit(job, 'requested', input.requestedAt);
    return clone(job);
  }

  async listAnalyticsExportJobs(
    scope: AnalyticsExportScope,
  ): Promise<PersistedAnalyticsExportJob[]> {
    return [...this.analyticsExportJobs.values()]
      .filter(
        (job) =>
          job.workspaceId === scope.workspaceId &&
          job.environmentId === scope.environmentId &&
          job.documentId === scope.documentId,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      )
      .slice(0, 100)
      .map(clone);
  }

  async getAnalyticsExportJob(
    workspaceId: string,
    jobId: string,
  ): Promise<PersistedAnalyticsExportJob | null> {
    const job = this.analyticsExportJobs.get(this.key(workspaceId, jobId));
    return job ? clone(job) : null;
  }

  async claimAnalyticsExportJobs(
    input: ClaimAnalyticsExportJobsInput,
  ): Promise<PersistedAnalyticsExportJob[]> {
    const nowMs = Date.parse(input.now);
    if (!Number.isFinite(nowMs)) throw new Error('analytics export worker time is invalid');
    await this.expireAnalyticsExportJobs(input.now);
    for (const [key, job] of this.analyticsExportJobs) {
      if (
        job.status === 'processing' &&
        job.leaseExpiresAt &&
        Date.parse(job.leaseExpiresAt) <= nowMs &&
        job.attemptCount >= job.maxAttempts
      ) {
        const failed = {
          ...job,
          status: 'failed' as const,
          leaseWorkerId: undefined,
          leaseExpiresAt: undefined,
          errorCode: 'generation_failed' as const,
          updatedAt: input.now,
        };
        this.analyticsExportJobs.set(key, failed);
        this.appendAnalyticsExportAudit(failed, 'failed', input.now, failed.errorCode);
      }
    }
    const limit = Math.max(1, Math.min(input.limit, 10));
    const candidates = [...this.analyticsExportJobs.entries()]
      .filter(([, job]) => {
        if (job.attemptCount >= job.maxAttempts) return false;
        if (job.status === 'queued') return Date.parse(job.nextAttemptAt) <= nowMs;
        return (
          job.status === 'processing' &&
          Boolean(job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) <= nowMs)
        );
      })
      .sort(
        ([, left], [, right]) =>
          left.nextAttemptAt.localeCompare(right.nextAttemptAt) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit);
    return candidates.map(([key, job]) => {
      const claimed: PersistedAnalyticsExportJob = {
        ...job,
        status: 'processing',
        attemptCount: job.attemptCount + 1,
        leaseWorkerId: input.workerId,
        leaseExpiresAt: new Date(nowMs + ANALYTICS_EXPORT_LEASE_MS).toISOString(),
        startedAt: job.startedAt ?? input.now,
        errorCode: undefined,
        updatedAt: input.now,
      };
      this.analyticsExportJobs.set(key, claimed);
      return clone(claimed);
    });
  }

  async readAnalyticsExportEvents(
    input: ReadAnalyticsExportEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]> {
    const matches = this.analyticsEvents
      .filter(
        (event) =>
          event.workspaceId === input.workspaceId &&
          event.environmentId === input.environmentId &&
          event.documentId === input.documentId &&
          event.timestamp >= input.retentionCutoff &&
          event.timestamp <= input.requestedAt &&
          (!input.release ||
            (event.publicationId === input.release.publicationId &&
              event.contentHash === input.release.contentHash &&
              event.pointerGeneration === input.release.pointerGeneration)),
      )
      .sort(
        (left, right) =>
          left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id),
      );
    if (matches.length > ANALYTICS_EXPORT_MAX_SOURCE_EVENTS) {
      throw new AnalyticsExportGenerationError('result_too_large');
    }
    return matches.map(clone);
  }

  async completeAnalyticsExportJob(
    input: CompleteAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null> {
    assertAnalyticsExportResult(input);
    const key = this.key(input.workspaceId, input.jobId);
    const job = this.analyticsExportJobs.get(key);
    if (
      !job ||
      job.status !== 'processing' ||
      job.leaseWorkerId !== input.workerId ||
      !/^sha256-[0-9a-f]{64}$/u.test(input.contentHash)
    ) {
      return null;
    }
    const completed: PersistedAnalyticsExportJob = {
      ...job,
      status: 'completed',
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      filename: input.filename,
      contentType: input.contentType,
      byteLength: input.byteLength,
      contentHash: input.contentHash,
      contentBase64: input.contentBase64,
      errorCode: undefined,
      completedAt: input.completedAt,
      resultExpiresAt: new Date(
        Date.parse(input.completedAt) + ANALYTICS_EXPORT_RESULT_RETENTION_MS,
      ).toISOString(),
      updatedAt: input.completedAt,
    };
    this.analyticsExportJobs.set(key, completed);
    this.appendAnalyticsExportAudit(completed, 'completed', input.completedAt);
    return clone(completed);
  }

  async failAnalyticsExportJob(
    input: FailAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null> {
    const key = this.key(input.workspaceId, input.jobId);
    const job = this.analyticsExportJobs.get(key);
    if (job?.status !== 'processing' || job.leaseWorkerId !== input.workerId) return null;
    const final = job.attemptCount >= job.maxAttempts || input.errorCode === 'result_too_large';
    const failed: PersistedAnalyticsExportJob = {
      ...job,
      status: final ? 'failed' : 'queued',
      leaseWorkerId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: new Date(
        Date.parse(input.failedAt) + Math.min(60_000, 1_000 * 2 ** (job.attemptCount - 1)),
      ).toISOString(),
      ...(final ? { errorCode: input.errorCode } : { errorCode: undefined }),
      updatedAt: input.failedAt,
    };
    this.analyticsExportJobs.set(key, failed);
    if (final) this.appendAnalyticsExportAudit(failed, 'failed', input.failedAt, input.errorCode);
    return clone(failed);
  }

  async markAnalyticsExportDownloaded(
    workspaceId: string,
    jobId: string,
    actorUserId: string,
    downloadedAt: string,
  ): Promise<boolean> {
    const job = this.analyticsExportJobs.get(this.key(workspaceId, jobId));
    if (
      !job ||
      job.status !== 'completed' ||
      !job.contentBase64 ||
      !job.resultExpiresAt ||
      job.resultExpiresAt <= downloadedAt
    ) {
      return false;
    }
    this.appendAnalyticsExportAudit(job, 'downloaded', downloadedAt, undefined, actorUserId);
    return true;
  }

  async expireAnalyticsExportJobs(now: string): Promise<number> {
    let expired = 0;
    for (const [key, job] of this.analyticsExportJobs) {
      if (job.status !== 'completed' || !job.resultExpiresAt || job.resultExpiresAt > now) continue;
      const next: PersistedAnalyticsExportJob = {
        ...job,
        status: 'expired',
        filename: undefined,
        contentType: undefined,
        byteLength: undefined,
        contentHash: undefined,
        contentBase64: undefined,
        updatedAt: now,
      };
      this.analyticsExportJobs.set(key, next);
      this.appendAnalyticsExportAudit(next, 'expired', now);
      expired += 1;
    }
    return expired;
  }

  async listAnalyticsExportAuditEvents(
    scope: AnalyticsExportScope,
  ): Promise<AnalyticsExportAuditEventRecord[]> {
    const jobIds = new Set(
      [...this.analyticsExportJobs.values()]
        .filter(
          (job) =>
            job.workspaceId === scope.workspaceId &&
            job.environmentId === scope.environmentId &&
            job.documentId === scope.documentId,
        )
        .map((job) => job.id),
    );
    return this.analyticsExportAuditEvents
      .filter((event) => event.workspaceId === scope.workspaceId && jobIds.has(event.jobId))
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]> {
    const events = this.measurableEvents(input.workspaceId, input.environmentId).filter(
      (event) => event.documentId === input.documentId,
    );
    return buildExperienceSessions(events, input.limit);
  }

  async recordFormResponses(input: RecordFormResponsesInput): Promise<number> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'form-response-capture',
    );
    for (const response of input.responses) {
      this.experienceFormResponses.push({
        id: `frm_${randomUUID()}`,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        ...clone(response),
      });
    }
    return input.responses.length;
  }

  async readExperiment(
    scope: ExperienceExperimentScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }> {
    const record = this.experimentFor(scope);
    if (!record) return { experiment: null, results: null };
    const experiment = toExperiment(record);
    const events = this.measurableEvents(scope.workspaceId, scope.environmentId).filter(
      (event) => event.documentId === scope.documentId,
    );
    const results = deriveExperimentResults(experiment, events);
    return {
      experiment,
      results: {
        ...results,
        ...(scope.environmentId ? { environmentId: scope.environmentId } : {}),
      },
    };
  }

  async createExperiment(input: CreateExperimentInput): Promise<Experiment> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'experiments',
    );
    if (this.liveExperimentFor(input)) {
      throw new ExperimentRuleError('one live experiment per experience');
    }
    assertExperimentArms(input.arms);
    const now = new Date().toISOString();
    const record: ExperienceExperimentRecord = {
      id: `exp_${randomUUID().replace(/-/gu, '')}`,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      status: 'draft',
      varies: input.varies,
      successEventName: input.successEventName,
      arms: clone([...input.arms]),
      allocationRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.experienceExperiments.set(record.id, record);
    this.experienceExperimentAllocations.set(record.id, [
      {
        workspaceId: record.workspaceId,
        experimentId: record.id,
        revision: 1,
        arms: clone(record.arms),
        createdAt: now,
      },
    ]);
    return toExperiment(record);
  }

  async updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'experiments',
    );
    const record = this.experienceExperiments.get(input.experimentId);
    if (
      !record ||
      record.workspaceId !== input.workspaceId ||
      (input.documentId !== undefined && record.documentId !== input.documentId)
    ) {
      return null;
    }
    if (input.arms) assertExperimentArms(input.arms);
    const now = new Date().toISOString();
    if (
      input.arms &&
      record.status !== 'draft' &&
      experimentVariantContentChanged(record.arms, input.arms)
    ) {
      throw new ExperimentRuleError(
        'experiment variant content is immutable after the experiment starts',
      );
    }
    const allocationChanged = Boolean(
      input.arms && experimentAllocationChanged(record.arms, input.arms),
    );
    const next: ExperienceExperimentRecord = {
      ...record,
      ...(input.arms ? { arms: clone([...input.arms]) } : {}),
      allocationRevision: allocationChanged
        ? record.allocationRevision + 1
        : record.allocationRevision,
      ...(input.status ? { status: input.status } : {}),
      ...(input.promotedArmId ? { promotedArmId: input.promotedArmId, status: 'promoted' } : {}),
      updatedAt: now,
    };
    if (next.status !== 'draft' && !next.startedAt) next.startedAt = now;
    if ((next.status === 'stopped' || next.status === 'promoted') && !next.stoppedAt) {
      next.stoppedAt = now;
    }
    if (input.promotedArmId && !next.arms.some((arm) => arm.id === input.promotedArmId)) {
      throw new ExperimentRuleError('promoted experiment arm does not exist');
    }
    this.experienceExperiments.set(next.id, next);
    if (allocationChanged) {
      const history = this.experienceExperimentAllocations.get(next.id) ?? [];
      history.push({
        workspaceId: next.workspaceId,
        experimentId: next.id,
        revision: next.allocationRevision,
        arms: clone(next.arms),
        createdAt: now,
      });
      this.experienceExperimentAllocations.set(next.id, history);
    }
    return toExperiment(next);
  }

  async getOrCreateExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null> {
    const existing = await this.findExperimentAssignment(input);
    if (existing) return existing;
    const experiment = this.experienceExperiments.get(input.experimentId);
    if (
      !experiment ||
      experiment.workspaceId !== input.workspaceId ||
      experiment.documentId !== input.documentId ||
      experiment.status !== 'running'
    ) {
      return null;
    }
    const assignmentKeyHash = hashExperimentAssignmentKey(input);
    const record: ExperienceExperimentAssignmentRecord = {
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      experimentId: experiment.id,
      assignmentKeyHash,
      armId: assignExperimentArm(experiment.arms, assignmentKeyHash),
      allocationRevision: experiment.allocationRevision,
      createdAt: new Date().toISOString(),
    };
    const key = experimentAssignmentIdentity(input, assignmentKeyHash);
    const winner = this.experienceExperimentAssignments.get(key) ?? record;
    this.experienceExperimentAssignments.set(key, winner);
    return clone(winner);
  }

  async findExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null> {
    const assignmentKeyHash = hashExperimentAssignmentKey(input);
    const record = this.experienceExperimentAssignments.get(
      experimentAssignmentIdentity(input, assignmentKeyHash),
    );
    return record ? clone(record) : null;
  }

  async listExperienceComments(scope: ExperienceScope): Promise<ExperienceComment[]> {
    const records = [...this.experienceComments.values()].filter(
      (comment) =>
        comment.workspaceId === scope.workspaceId && comment.documentId === scope.documentId,
    );
    return records
      .filter((comment) => comment.parentCommentId === undefined)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((comment) => toCommentThread(comment, records));
  }

  async createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'comments',
    );
    const record: ExperienceCommentRecord = {
      id: `cmt_${randomUUID().replace(/-/gu, '')}`,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      stepId: input.anchor.stepId,
      ...(input.anchor.type === 'target' ? { targetId: input.anchor.targetId } : {}),
      body: input.body,
      author: input.authorName,
      authorUserId: input.authorUserId,
      createdAt: new Date().toISOString(),
    };
    this.experienceComments.set(record.id, record);
    this.appendCommentAuditEvent({
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      threadId: record.id,
      commentId: record.id,
      eventType: 'thread_created',
      actorUserId: input.authorUserId,
    });
    return toCommentThread(record, [record]);
  }

  async replyToExperienceComment(
    input: ReplyExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'comments',
    );
    const root = this.experienceComments.get(input.threadId);
    if (
      !root ||
      root.parentCommentId !== undefined ||
      root.workspaceId !== input.workspaceId ||
      (input.documentId !== undefined && root.documentId !== input.documentId)
    ) {
      return null;
    }
    const reply: ExperienceCommentRecord = {
      id: `cmt_${randomUUID().replace(/-/gu, '')}`,
      workspaceId: root.workspaceId,
      documentId: root.documentId,
      stepId: root.stepId,
      ...(root.targetId ? { targetId: root.targetId } : {}),
      parentCommentId: root.id,
      body: input.body,
      author: input.authorName,
      authorUserId: input.authorUserId,
      createdAt: new Date().toISOString(),
    };
    this.experienceComments.set(reply.id, reply);
    this.appendCommentAuditEvent({
      workspaceId: root.workspaceId,
      documentId: root.documentId,
      threadId: root.id,
      commentId: reply.id,
      eventType: 'reply_added',
      actorUserId: input.authorUserId,
    });
    return toCommentThread(root, [...this.experienceComments.values()]);
  }

  async resolveExperienceComment(
    input: ResolveExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'comments',
    );
    const record = this.experienceComments.get(input.commentId);
    if (
      !record ||
      record.workspaceId !== input.workspaceId ||
      (input.documentId !== undefined && record.documentId !== input.documentId)
    ) {
      return null;
    }
    if (record.parentCommentId !== undefined) return null;
    if ((record.resolvedAt !== undefined) === input.resolved) {
      return toCommentThread(record, [...this.experienceComments.values()]);
    }
    const next: ExperienceCommentRecord = input.resolved
      ? {
          ...record,
          resolvedAt: new Date().toISOString(),
          resolvedByUserId: input.actorUserId,
        }
      : withoutCommentResolution(record);
    this.experienceComments.set(next.id, next);
    this.appendCommentAuditEvent({
      workspaceId: next.workspaceId,
      documentId: next.documentId,
      threadId: next.id,
      commentId: next.id,
      eventType: input.resolved ? 'thread_resolved' : 'thread_reopened',
      actorUserId: input.actorUserId,
    });
    return toCommentThread(next, [...this.experienceComments.values()]);
  }

  async listExperienceCommentAuditEvents(
    scope: ExperienceScope,
  ): Promise<ExperienceCommentAuditEvent[]> {
    return [...this.experienceCommentAuditEvents.values()]
      .filter(
        (event) => event.workspaceId === scope.workspaceId && event.documentId === scope.documentId,
      )
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map(({ workspaceId: _workspaceId, documentId: _documentId, ...event }) => clone(event));
  }

  private appendCommentAuditEvent(
    input: Omit<ExperienceCommentAuditEventRecord, 'id' | 'occurredAt'>,
  ): void {
    const event: ExperienceCommentAuditEventRecord = {
      ...input,
      id: `cmtaud_${randomUUID().replace(/-/gu, '')}`,
      occurredAt: new Date().toISOString(),
    };
    this.experienceCommentAuditEvents.set(event.id, event);
  }

  async listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]> {
    return (await this.listExperienceStepLockRecords(scope)).map((lock) => ({
      stepId: lock.stepId,
      holderName: lock.holderName,
      expiresAt: lock.expiresAt,
    }));
  }

  async listExperienceStepLockRecords(scope: ExperienceScope): Promise<ExperienceStepLockRecord[]> {
    const locks = [...this.experienceStepLocks.values()].filter(
      (lock) => lock.workspaceId === scope.workspaceId && lock.documentId === scope.documentId,
    );
    return activeStepLocks(locks, Date.now()).map((lock) => clone(lock));
  }

  async findExperienceStepLock(
    scope: ExperienceScope,
    stepId: string,
  ): Promise<ExperienceStepLockRecord | null> {
    const lock = this.experienceStepLocks.get(
      this.key(scope.workspaceId, scope.documentId, stepId),
    );
    if (!lock || Date.parse(lock.expiresAt) <= Date.now()) return null;
    return clone(lock);
  }

  /** Returns the winning lease, which may belong to someone else. */
  async claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLockClaimResult> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'step-locks',
    );
    const key = this.key(input.workspaceId, input.documentId, input.stepId);
    const existing = this.experienceStepLocks.get(key);
    const now = Date.now();
    if (!input.takeover && !canClaimStepLock(existing, input.holderUserId, input.sessionId, now)) {
      return {
        lock: {
          stepId: existing!.stepId,
          holderName: existing!.holderName,
          expiresAt: existing!.expiresAt,
        },
        acquired: false,
      };
    }
    const next = {
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      stepId: input.stepId,
      holderUserId: input.holderUserId,
      holderName: input.holderName,
      sessionId: input.sessionId,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPERIENCE_STEP_LOCK_TTL_SECONDS * 1000).toISOString(),
    };
    this.experienceStepLocks.set(key, next);
    return {
      lock: {
        stepId: next.stepId,
        holderName: next.holderName,
        expiresAt: next.expiresAt,
      },
      acquired: true,
    };
  }

  async releaseExperienceStepLock(input: ClaimStepLockInput): Promise<void> {
    const key = this.key(input.workspaceId, input.documentId, input.stepId);
    const existing = this.experienceStepLocks.get(key);
    if (existing?.holderUserId === input.holderUserId && existing.sessionId === input.sessionId) {
      this.experienceStepLocks.delete(key);
    }
  }

  async heartbeatAuthoringPresence(
    input: HeartbeatAuthoringPresenceInput,
  ): Promise<AuthoringPresenceRecord> {
    assertCommercialFeature(
      this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
      'presence',
    );
    const now = Date.now();
    const record: AuthoringPresenceRecord = {
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      sessionId: input.sessionId,
      creatorId: input.creatorId,
      creatorName: input.creatorName,
      stepId: input.stepId,
      selection: input.selection ? clone(input.selection) : null,
      ...(input.documentUpdatedAt ? { documentUpdatedAt: input.documentUpdatedAt } : {}),
      lastSeenAt: new Date(now).toISOString(),
      expiresAt: new Date(now + AUTHORING_PRESENCE_TTL_SECONDS * 1_000).toISOString(),
    };
    this.authoringPresence.set(
      this.key(input.workspaceId, input.documentId, input.sessionId),
      record,
    );
    return clone(record);
  }

  async listAuthoringPresence(scope: ExperienceScope): Promise<AuthoringPresenceRecord[]> {
    const now = Date.now();
    for (const [key, presence] of this.authoringPresence) {
      if (Date.parse(presence.expiresAt) <= now) this.authoringPresence.delete(key);
    }
    return [...this.authoringPresence.values()]
      .filter(
        (presence) =>
          presence.workspaceId === scope.workspaceId && presence.documentId === scope.documentId,
      )
      .sort(
        (left, right) =>
          left.creatorName.localeCompare(right.creatorName) ||
          left.sessionId.localeCompare(right.sessionId),
      )
      .map((presence) => clone(presence));
  }

  async leaveAuthoringPresence(input: LeaveAuthoringPresenceInput): Promise<void> {
    this.authoringPresence.delete(this.key(input.workspaceId, input.documentId, input.sessionId));
  }

  async listWorkspaceApplications(workspaceId: string): Promise<ApplicationSummary[]> {
    return [...this.workspaceApplications.values()]
      .filter((application) => application.workspaceId === workspaceId)
      .sort(
        (left, right) =>
          Number(right.isPrimary) - Number(left.isPrimary) || left.id.localeCompare(right.id),
      )
      .map((application) => toApplication(application));
  }

  async upsertWorkspaceApplication(
    input: UpsertWorkspaceApplicationInput,
  ): Promise<ApplicationSummary> {
    const key = this.key(input.workspaceId, input.id);
    const applicationLimit = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements
      .applications;
    const exists = this.workspaceApplications.has(key);
    const used = [...this.workspaceApplications.values()].filter(
      (application) => application.workspaceId === input.workspaceId,
    ).length;
    if (!exists && applicationLimit !== null && used + 1 > applicationLimit) {
      throw new CommercialEntitlementError('applications', used, applicationLimit);
    }
    const now = new Date().toISOString();
    if (input.isPrimary) {
      for (const [otherKey, other] of this.workspaceApplications) {
        if (other.workspaceId !== input.workspaceId || otherKey === key) continue;
        this.workspaceApplications.set(otherKey, { ...other, isPrimary: false });
      }
    }
    const record: WorkspaceApplicationRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      originPatterns: [...input.originPatterns],
      ...(input.themeId ? { themeId: input.themeId } : {}),
      isPrimary: input.isPrimary,
      createdAt: this.workspaceApplications.get(key)?.createdAt ?? now,
      updatedAt: now,
    };
    this.workspaceApplications.set(key, record);
    return toApplication(record);
  }

  private measurementFor(scope: ExperienceScope): ExperienceMeasurementRecord {
    return (
      this.experienceMeasurement.get(this.key(scope.workspaceId, scope.documentId)) ?? {
        workspaceId: scope.workspaceId,
        documentId: scope.documentId,
        adaptivePolicy: { ...DEFAULT_ADAPTIVE_POLICY },
        updatedAt: new Date(0).toISOString(),
      }
    );
  }

  private experimentFor(scope: ExperienceScope): ExperienceExperimentRecord | undefined {
    const live = this.liveExperimentFor(scope);
    if (live) return live;
    return [...this.experienceExperiments.values()]
      .filter(
        (experiment) =>
          experiment.workspaceId === scope.workspaceId &&
          experiment.documentId === scope.documentId,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  }

  private liveExperimentFor(scope: ExperienceScope): ExperienceExperimentRecord | undefined {
    return [...this.experienceExperiments.values()].find(
      (experiment) =>
        experiment.workspaceId === scope.workspaceId &&
        experiment.documentId === scope.documentId &&
        (experiment.status === 'draft' || experiment.status === 'running'),
    );
  }

  private measurableEvents(
    workspaceId: string,
    environmentId?: string,
    asOfMs = Date.now(),
  ): MeasurableEvent[] {
    const retentionDays =
      this.resolveWorkspaceEntitlements(workspaceId).entitlements.analyticsRetentionDays;
    const cutoff = asOfMs - retentionDays * 24 * 60 * 60 * 1_000;
    return this.analyticsEvents
      .filter(
        (event) =>
          event.workspaceId === workspaceId &&
          Date.parse(event.timestamp) >= cutoff &&
          Date.parse(event.timestamp) <= asOfMs &&
          (!environmentId || event.environmentId === environmentId),
      )
      .map((event) => ({
        name: event.name,
        documentId: event.documentId,
        publicationId: event.publicationId,
        contentHash: event.contentHash,
        pointerGeneration: event.pointerGeneration,
        visitorKeyHash: event.adaptiveVisitorKeyHash ?? null,
        stepId: event.stepId ?? null,
        correlationId: event.correlationId ?? null,
        occurredAt: event.timestamp,
        experimentId: event.experimentId ?? null,
        armId: (event.armId as ExperimentArm['id'] | undefined) ?? null,
        experimentAllocationRevision: event.experimentAllocationRevision ?? null,
        audienceSegment: event.audienceSegment ?? null,
        props: event.props ?? null,
      }));
  }

  private assertAnalyticsExportScope(input: CreateAnalyticsExportJobInput): void {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!environment || !document) throw new Error('analytics export scope was not found');
    if (!input.release) return;
    const publication = [...this.publications.values()]
      .flat()
      .find(
        (candidate) =>
          candidate.workspaceId === input.workspaceId &&
          candidate.environmentId === input.environmentId &&
          candidate.documentId === input.documentId &&
          candidate.id === input.release?.publicationId &&
          candidate.contentHash === input.release.contentHash,
      );
    if (!publication) throw new Error('analytics export release was not found');
  }

  private appendAnalyticsExportAudit(
    job: PersistedAnalyticsExportJob,
    eventType: AnalyticsExportAuditEventRecord['eventType'],
    occurredAt: string,
    errorCode?: AnalyticsExportAuditEventRecord['errorCode'],
    actorUserId = job.requestedByUserId,
  ): void {
    this.analyticsExportAuditEvents.push({
      id: `anxaud_${randomUUID()}`,
      workspaceId: job.workspaceId,
      jobId: job.id,
      eventType,
      actorUserId,
      ...(errorCode ? { errorCode } : {}),
      occurredAt,
    });
  }
}

function assertAnalyticsExportInput(input: CreateAnalyticsExportJobInput): void {
  if (
    !Object.prototype.hasOwnProperty.call(ANALYTICS_EXPORT_FEATURES, input.kind) ||
    !/^anxop_[A-Za-z0-9_-]{20,}$/u.test(input.operationId) ||
    !/^sha256-[0-9a-f]{64}$/u.test(input.requestHash) ||
    !Number.isFinite(Date.parse(input.requestedAt)) ||
    (input.release !== undefined &&
      (!input.release.publicationId ||
        !/^sha256-[0-9a-f]{64}$/u.test(input.release.contentHash) ||
        !Number.isInteger(input.release.pointerGeneration) ||
        input.release.pointerGeneration < 1))
  ) {
    throw new Error('analytics export request is invalid');
  }
}

function analyticsExportRequestMatches(
  job: PersistedAnalyticsExportJob,
  input: CreateAnalyticsExportJobInput,
): boolean {
  const releasesMatch =
    (!job.release && !input.release) ||
    Boolean(
      job.release &&
      input.release &&
      job.release.publicationId === input.release.publicationId &&
      job.release.contentHash === input.release.contentHash &&
      job.release.pointerGeneration === input.release.pointerGeneration,
    );
  return (
    job.requestHash === input.requestHash &&
    job.environmentId === input.environmentId &&
    job.documentId === input.documentId &&
    job.kind === input.kind &&
    job.requestedByUserId === input.actorUserId &&
    releasesMatch
  );
}

function toExperiment(record: ExperienceExperimentRecord): Experiment {
  return {
    id: record.id,
    status: record.status,
    varies: record.varies,
    successEventName: record.successEventName,
    arms: clone(record.arms),
    allocationRevision: record.allocationRevision,
    ...(record.promotedArmId ? { promotedArmId: record.promotedArmId } : {}),
  };
}

function experimentAssignmentIdentity(
  input: ResolveExperimentAssignmentInput,
  assignmentKeyHash: string,
): string {
  return `${input.workspaceId}\0${input.environmentId}\0${input.experimentId}\0${assignmentKeyHash}`;
}

function toCommentThread(
  record: ExperienceCommentRecord,
  records: readonly ExperienceCommentRecord[],
): ExperienceComment {
  return {
    id: record.id,
    anchor: record.targetId
      ? { type: 'target', stepId: record.stepId, targetId: record.targetId }
      : { type: 'step', stepId: record.stepId },
    author: record.author,
    body: record.body,
    replies: records
      .filter((candidate) => candidate.parentCommentId === record.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((reply) => ({
        id: reply.id,
        author: reply.author,
        body: reply.body,
        createdAt: reply.createdAt,
      })),
    resolved: record.resolvedAt !== undefined,
    ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
    createdAt: record.createdAt,
  };
}

function withoutCommentResolution(record: ExperienceCommentRecord): ExperienceCommentRecord {
  const { resolvedAt: _resolvedAt, resolvedByUserId: _resolvedByUserId, ...unresolved } = record;
  return unresolved;
}

function toApplication(record: WorkspaceApplicationRecord): ApplicationSummary {
  return {
    id: record.id,
    name: record.name,
    originPatterns: [...record.originPatterns],
    ...(record.themeId ? { themeId: record.themeId } : {}),
    isPrimary: record.isPrimary,
  };
}
