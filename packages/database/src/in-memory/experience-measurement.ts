import { randomUUID } from 'node:crypto';
import {
  EXPERIENCE_STEP_LOCK_TTL_SECONDS,
  type ApplicationSummary,
  type ExperienceAnalytics,
  type ExperienceComment,
  type ExperienceSession,
  type ExperienceStepLock,
  type Experiment,
  type ExperimentResults,
} from '@lodariq/schema';
import { clone } from '../domains/in-memory-helpers';
import {
  DEFAULT_ADAPTIVE_POLICY,
  EXPERIENCE_COMPLETED_EVENT,
  EXPERIENCE_DISMISSED_EVENT,
  EXPERIENCE_SHOWN_EVENT,
  activeStepLocks,
  assertExperimentArms,
  canClaimStepLock,
  deriveAdoptionImpact,
  deriveExperimentResults,
  deriveFunnel,
  countDistinctCorrelations,
  summarizeFormResponses,
  type ExperienceExperimentRecord,
  type ExperienceMeasurementRecord,
  type MeasurableEvent,
  type WorkspaceApplicationRecord,
} from '../domains/experience-measurement';
import {
  buildExperienceSessions,
  type ListExperienceSessionsInput,
} from '../domains/experience-sessions';
import { InMemoryRepositoryAnalytics } from './analytics';
import type {
  ClaimStepLockInput,
  CreateExperienceCommentInput,
  CreateExperimentInput,
  ExperienceScope,
  QueryExperienceAnalyticsInput,
  RecordFormResponsesInput,
  ResolveExperienceCommentInput,
  UpdateExperienceMeasurementInput,
  UpdateExperimentInput,
  UpsertWorkspaceApplicationInput,
} from '../domains/experience-measurement-repository';

export class InMemoryRepositoryExperienceMeasurement extends InMemoryRepositoryAnalytics {
  async readExperienceMeasurement(scope: ExperienceScope): Promise<ExperienceMeasurementRecord> {
    return clone(this.measurementFor(scope));
  }

  async updateExperienceMeasurement(
    input: UpdateExperienceMeasurementInput,
  ): Promise<ExperienceMeasurementRecord> {
    const current = this.measurementFor(input);
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
    const events = this.measurableEvents(input.workspaceId, input.environmentId);
    const scoped = events.filter((event) => event.documentId === input.documentId);
    const responses = this.experienceFormResponses.filter(
      (response) =>
        response.workspaceId === input.workspaceId &&
        response.environmentId === input.environmentId &&
        response.documentId === input.documentId,
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
    };
  }

  async listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]> {
    const events = this.measurableEvents(input.workspaceId, input.environmentId).filter(
      (event) => event.documentId === input.documentId,
    );
    return buildExperienceSessions(events, input.limit);
  }

  async recordFormResponses(input: RecordFormResponsesInput): Promise<number> {
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
    scope: ExperienceScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }> {
    const record = this.experimentFor(scope);
    if (!record) return { experiment: null, results: null };
    const experiment = toExperiment(record);
    const events = this.measurableEvents(scope.workspaceId).filter(
      (event) => event.documentId === scope.documentId,
    );
    return { experiment, results: deriveExperimentResults(experiment, events) };
  }

  async createExperiment(input: CreateExperimentInput): Promise<Experiment> {
    if (this.experimentFor(input)) throw new Error('one live experiment per experience');
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
      createdAt: now,
      updatedAt: now,
    };
    this.experienceExperiments.set(record.id, record);
    return toExperiment(record);
  }

  async updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null> {
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
    const next: ExperienceExperimentRecord = {
      ...record,
      ...(input.arms ? { arms: clone([...input.arms]) } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.promotedArmId ? { promotedArmId: input.promotedArmId, status: 'promoted' } : {}),
      updatedAt: now,
    };
    if (next.status !== 'draft' && !next.startedAt) next.startedAt = now;
    if ((next.status === 'stopped' || next.status === 'promoted') && !next.stoppedAt) {
      next.stoppedAt = now;
    }
    // Promotion is what ends the split: the winner takes all remaining traffic.
    if (next.promotedArmId) {
      next.arms = next.arms.map((arm) => ({
        ...arm,
        trafficPercent: arm.id === next.promotedArmId ? 100 : 0,
      }));
    }
    this.experienceExperiments.set(next.id, next);
    return toExperiment(next);
  }

  async listExperienceComments(scope: ExperienceScope): Promise<ExperienceComment[]> {
    return [...this.experienceComments.values()]
      .filter(
        (comment) =>
          comment.workspaceId === scope.workspaceId && comment.documentId === scope.documentId,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((comment) => toComment(comment));
  }

  async createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment> {
    const record = {
      id: `cmt_${randomUUID().replace(/-/gu, '')}`,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      stepId: input.stepId,
      body: input.body,
      author: input.authorName,
      authorUserId: input.authorUserId,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    this.experienceComments.set(record.id, record);
    return toComment(record);
  }

  async resolveExperienceComment(
    input: ResolveExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    const record = this.experienceComments.get(input.commentId);
    if (
      !record ||
      record.workspaceId !== input.workspaceId ||
      (input.documentId !== undefined && record.documentId !== input.documentId)
    ) {
      return null;
    }
    const next = {
      ...record,
      resolved: input.resolved,
      ...(input.resolved
        ? { resolvedByUserId: input.actorUserId }
        : { resolvedByUserId: undefined }),
    };
    this.experienceComments.set(next.id, next);
    return toComment(next);
  }

  async listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]> {
    const locks = [...this.experienceStepLocks.values()].filter(
      (lock) => lock.workspaceId === scope.workspaceId && lock.documentId === scope.documentId,
    );
    return activeStepLocks(locks, Date.now()).map((lock) => ({
      stepId: lock.stepId,
      holderName: lock.holderName,
      holderUserId: lock.holderUserId,
      expiresAt: lock.expiresAt,
    }));
  }

  /** Returns the winning lease, which may belong to someone else. */
  async claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLock> {
    const key = this.key(input.workspaceId, input.documentId, input.stepId);
    const existing = this.experienceStepLocks.get(key);
    const now = Date.now();
    if (!canClaimStepLock(existing, input.holderUserId, input.sessionId, now)) {
      return {
        stepId: existing!.stepId,
        holderName: existing!.holderName,
        holderUserId: existing!.holderUserId,
        expiresAt: existing!.expiresAt,
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
      stepId: next.stepId,
      holderName: next.holderName,
      holderUserId: next.holderUserId,
      expiresAt: next.expiresAt,
    };
  }

  async releaseExperienceStepLock(input: ClaimStepLockInput): Promise<void> {
    const key = this.key(input.workspaceId, input.documentId, input.stepId);
    const existing = this.experienceStepLocks.get(key);
    if (existing?.holderUserId === input.holderUserId && existing.sessionId === input.sessionId) {
      this.experienceStepLocks.delete(key);
    }
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
    return [...this.experienceExperiments.values()].find(
      (experiment) =>
        experiment.workspaceId === scope.workspaceId &&
        experiment.documentId === scope.documentId &&
        (experiment.status === 'draft' || experiment.status === 'running'),
    );
  }

  private measurableEvents(workspaceId: string, environmentId?: string): MeasurableEvent[] {
    return this.analyticsEvents
      .filter(
        (event) =>
          event.workspaceId === workspaceId &&
          (!environmentId || event.environmentId === environmentId),
      )
      .map((event) => ({
        name: event.name,
        documentId: event.documentId,
        stepId: event.stepId ?? null,
        correlationId: event.correlationId ?? null,
        occurredAt: event.timestamp,
        props: event.props ?? null,
      }));
  }
}

function toExperiment(record: ExperienceExperimentRecord): Experiment {
  return {
    id: record.id,
    status: record.status,
    varies: record.varies,
    successEventName: record.successEventName,
    arms: clone(record.arms),
  };
}

function toComment(record: {
  id: string;
  stepId: string;
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}): ExperienceComment {
  return {
    id: record.id,
    stepId: record.stepId,
    author: record.author,
    body: record.body,
    resolved: record.resolved,
    createdAt: record.createdAt,
  };
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
