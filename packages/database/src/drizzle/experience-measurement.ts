import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import {
  EXPERIENCE_STEP_LOCK_TTL_SECONDS,
  type ApplicationSummary,
  type ExperienceAnalytics,
  type ExperienceComment,
  type ExperienceSession,
  type ExperienceStepLock,
  type Experiment,
  type ExperimentArm,
  type ExperimentResults,
} from '@lodariq/schema';
import {
  DEFAULT_ADAPTIVE_POLICY,
  EXPERIENCE_COMPLETED_EVENT,
  EXPERIENCE_DISMISSED_EVENT,
  EXPERIENCE_SHOWN_EVENT,
  EXPERIENCE_STEP_EVENT,
  assertExperimentArms,
  buildExperienceSessions,
  countDistinctCorrelations,
  deriveAdoptionImpact,
  deriveExperimentResults,
  deriveFunnel,
  summarizeFormResponses,
  type ClaimStepLockInput,
  type CreateExperienceCommentInput,
  type CreateExperimentInput,
  type ExperienceMeasurementRecord,
  type ExperienceScope,
  type ListExperienceSessionsInput,
  type MeasurableEvent,
  type QueryExperienceAnalyticsInput,
  type RecordFormResponsesInput,
  type ResolveExperienceCommentInput,
  type UpdateExperienceMeasurementInput,
  type UpdateExperimentInput,
  type UpsertWorkspaceApplicationInput,
} from '../repository';
import {
  authoritativeAnalyticsEvents,
  experienceComments,
  experienceExperiments,
  experienceFormResponses,
  experienceMeasurement,
  experienceStepLocks,
  workspaceApplications,
} from '../schema';
import { toIsoString } from './helpers';
import { DrizzleRepositoryAnalytics } from './analytics';

/**
 * Booleans are stored as `'true'`/`'false'` text so a check constraint can name
 * the allowed values, matching how the rest of this schema encodes enums.
 */
const TRUE = 'true';
const FALSE = 'false';

/**
 * Sessions are rebuilt from raw beats, so the scan is bounded rather than the
 * result: a busy experience must not pull its whole event history to show the
 * last few runs.
 */
const SESSION_EVENT_SCAN_LIMIT = 5_000;

export class DrizzleRepositoryExperienceMeasurement extends DrizzleRepositoryAnalytics {
  async readExperienceMeasurement(scope: ExperienceScope): Promise<ExperienceMeasurementRecord> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(experienceMeasurement)
        .where(
          and(
            eq(experienceMeasurement.workspaceId, scope.workspaceId),
            eq(experienceMeasurement.documentId, scope.documentId),
          ),
        )
        .limit(1);
      return row ? toMeasurementRecord(row) : defaultMeasurement(scope);
    });
  }

  async updateExperienceMeasurement(
    input: UpdateExperienceMeasurementInput,
  ): Promise<ExperienceMeasurementRecord> {
    const current = await this.readExperienceMeasurement(input);
    const successEvent =
      input.successEvent === undefined ? current.successEvent : (input.successEvent ?? undefined);
    const adaptive = input.adaptivePolicy ?? current.adaptivePolicy;
    return this.scoped(input.workspaceId, async (tx) => {
      const values = {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        successEventName: successEvent?.eventName ?? null,
        successWindowDays: successEvent?.windowDays ?? null,
        successLabel: successEvent?.label ?? null,
        adaptiveEnabled: adaptive.enabled ? TRUE : FALSE,
        adaptiveMinimumOccurrences: adaptive.minimumOccurrences,
        adaptiveLookbackDays: adaptive.lookbackDays,
        updatedByUserId: input.actorUserId,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(experienceMeasurement)
        .values(values)
        .onConflictDoUpdate({
          target: [experienceMeasurement.workspaceId, experienceMeasurement.documentId],
          set: values,
        })
        .returning();
      return toMeasurementRecord(row!);
    });
  }

  async readExperienceAnalytics(
    input: QueryExperienceAnalyticsInput,
  ): Promise<ExperienceAnalytics> {
    const measurement = await this.readExperienceMeasurement(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const rows = await tx
        .select({
          name: authoritativeAnalyticsEvents.name,
          documentId: authoritativeAnalyticsEvents.documentId,
          stepId: authoritativeAnalyticsEvents.stepId,
          correlationId: authoritativeAnalyticsEvents.correlationId,
          occurredAt: authoritativeAnalyticsEvents.occurredAt,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
          ),
        );
      const events: MeasurableEvent[] = rows.map((row) => ({
        name: row.name,
        documentId: row.documentId,
        stepId: row.stepId,
        correlationId: row.correlationId,
        occurredAt: toIsoString(row.occurredAt),
        props: row.props,
      }));
      const scoped = events.filter((event) => event.documentId === input.documentId);

      const responses = await tx
        .select()
        .from(experienceFormResponses)
        .where(
          and(
            eq(experienceFormResponses.workspaceId, input.workspaceId),
            eq(experienceFormResponses.environmentId, input.environmentId),
            eq(experienceFormResponses.documentId, input.documentId),
          ),
        );

      return {
        documentId: input.documentId,
        environmentId: input.environmentId,
        shown: countDistinctCorrelations(scoped, EXPERIENCE_SHOWN_EVENT),
        completed: countDistinctCorrelations(scoped, EXPERIENCE_COMPLETED_EVENT),
        dismissed: countDistinctCorrelations(scoped, EXPERIENCE_DISMISSED_EVENT),
        funnel: deriveFunnel(scoped, input.stepIdsInOrder),
        adoption: measurement.successEvent
          ? [deriveAdoptionImpact(measurement.successEvent, scoped, events)]
          : [],
        formResponses: summarizeFormResponses(
          responses.map((row) => ({
            ...row,
            correlationId: row.correlationId ?? undefined,
            occurredAt: toIsoString(row.occurredAt),
          })),
        ),
      };
    });
  }

  async listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]> {
    return this.scoped(input.workspaceId, async (tx) => {
      const rows = await tx
        .select({
          name: authoritativeAnalyticsEvents.name,
          documentId: authoritativeAnalyticsEvents.documentId,
          stepId: authoritativeAnalyticsEvents.stepId,
          correlationId: authoritativeAnalyticsEvents.correlationId,
          occurredAt: authoritativeAnalyticsEvents.occurredAt,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
            eq(authoritativeAnalyticsEvents.documentId, input.documentId),
          ),
        )
        .orderBy(desc(authoritativeAnalyticsEvents.occurredAt))
        .limit(SESSION_EVENT_SCAN_LIMIT);
      return buildExperienceSessions(
        rows.map((row) => ({
          name: row.name,
          documentId: row.documentId,
          stepId: row.stepId,
          correlationId: row.correlationId,
          occurredAt: toIsoString(row.occurredAt),
          props: row.props,
        })),
        input.limit,
      );
    });
  }

  async recordFormResponses(input: RecordFormResponsesInput): Promise<number> {
    return this.scoped(input.workspaceId, async (tx) => {
      const inserted = await tx
        .insert(experienceFormResponses)
        .values(
          input.responses.map((response) => ({
            id: `frm_${randomUUID()}`,
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            stepId: response.stepId,
            blockId: response.blockId,
            label: response.label,
            answer: response.answer,
            correlationId: response.correlationId ?? null,
            occurredAt: new Date(response.occurredAt),
          })),
        )
        .returning({ id: experienceFormResponses.id });
      return inserted.length;
    });
  }

  async readExperiment(
    scope: ExperienceScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(experienceExperiments)
        .where(
          and(
            eq(experienceExperiments.workspaceId, scope.workspaceId),
            eq(experienceExperiments.documentId, scope.documentId),
            inArray(experienceExperiments.status, ['draft', 'running']),
          ),
        )
        .limit(1);
      if (!row) return { experiment: null, results: null };
      const experiment = toExperiment(row);
      const rows = await tx
        .select({
          name: authoritativeAnalyticsEvents.name,
          documentId: authoritativeAnalyticsEvents.documentId,
          stepId: authoritativeAnalyticsEvents.stepId,
          correlationId: authoritativeAnalyticsEvents.correlationId,
          occurredAt: authoritativeAnalyticsEvents.occurredAt,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, scope.workspaceId),
            eq(authoritativeAnalyticsEvents.documentId, scope.documentId),
          ),
        );
      return {
        experiment,
        results: deriveExperimentResults(
          experiment,
          rows.map((event) => ({ ...event, occurredAt: toIsoString(event.occurredAt) })),
        ),
      };
    });
  }

  async createExperiment(input: CreateExperimentInput): Promise<Experiment> {
    assertExperimentArms(input.arms);
    return this.scoped(input.workspaceId, async (tx) => {
      const [row] = await tx
        .insert(experienceExperiments)
        .values({
          id: `exp_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          status: 'draft',
          varies: input.varies,
          successEventName: input.successEventName,
          arms: [...input.arms],
          createdByUserId: input.actorUserId,
        })
        .returning();
      return toExperiment(row!);
    });
  }

  async updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null> {
    if (input.arms) assertExperimentArms(input.arms);
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(experienceExperiments)
        .where(
          and(
            eq(experienceExperiments.workspaceId, input.workspaceId),
            eq(experienceExperiments.id, input.experimentId),
            ...(input.documentId ? [eq(experienceExperiments.documentId, input.documentId)] : []),
          ),
        )
        .limit(1);
      if (!current) return null;
      const status = input.promotedArmId ? 'promoted' : (input.status ?? current.status);
      // Promotion is what ends the split: the winner takes all remaining traffic.
      const arms = input.promotedArmId
        ? (input.arms ?? current.arms).map((arm) => ({
            ...arm,
            trafficPercent: arm.id === input.promotedArmId ? 100 : 0,
          }))
        : (input.arms ?? current.arms);
      const now = new Date();
      const [row] = await tx
        .update(experienceExperiments)
        .set({
          status,
          arms: [...arms],
          ...(input.promotedArmId ? { promotedArmId: input.promotedArmId } : {}),
          ...(status !== 'draft' && !current.startedAt ? { startedAt: now } : {}),
          ...((status === 'stopped' || status === 'promoted') && !current.stoppedAt
            ? { stoppedAt: now }
            : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(experienceExperiments.workspaceId, input.workspaceId),
            eq(experienceExperiments.id, input.experimentId),
            ...(input.documentId ? [eq(experienceExperiments.documentId, input.documentId)] : []),
          ),
        )
        .returning();
      return row ? toExperiment(row) : null;
    });
  }

  async listExperienceComments(scope: ExperienceScope): Promise<ExperienceComment[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(experienceComments)
        .where(
          and(
            eq(experienceComments.workspaceId, scope.workspaceId),
            eq(experienceComments.documentId, scope.documentId),
          ),
        )
        .orderBy(asc(experienceComments.createdAt));
      return rows.map((row) => toComment(row));
    });
  }

  async createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [row] = await tx
        .insert(experienceComments)
        .values({
          id: `cmt_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          stepId: input.stepId,
          body: input.body,
          authorUserId: input.authorUserId,
          authorName: input.authorName,
        })
        .returning();
      return toComment(row!);
    });
  }

  async resolveExperienceComment(
    input: ResolveExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [row] = await tx
        .update(experienceComments)
        .set(
          input.resolved
            ? { resolvedAt: new Date(), resolvedByUserId: input.actorUserId }
            : { resolvedAt: null, resolvedByUserId: null },
        )
        .where(
          and(
            eq(experienceComments.workspaceId, input.workspaceId),
            eq(experienceComments.id, input.commentId),
            ...(input.documentId ? [eq(experienceComments.documentId, input.documentId)] : []),
          ),
        )
        .returning();
      return row ? toComment(row) : null;
    });
  }

  async listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(experienceStepLocks)
        .where(
          and(
            eq(experienceStepLocks.workspaceId, scope.workspaceId),
            eq(experienceStepLocks.documentId, scope.documentId),
            gt(experienceStepLocks.expiresAt, new Date()),
          ),
        );
      return rows.map((row) => toStepLock(row));
    });
  }

  /**
   * Compare-and-set on expiry: the update only lands when the current lease has
   * lapsed or already belongs to this user, so two creators racing for the same
   * step produce one winner rather than a last-write-wins overwrite.
   */
  async claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLock> {
    return this.scoped(input.workspaceId, async (tx) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPERIENCE_STEP_LOCK_TTL_SECONDS * 1000);
      const [row] = await tx
        .insert(experienceStepLocks)
        .values({
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          stepId: input.stepId,
          holderUserId: input.holderUserId,
          holderName: input.holderName,
          sessionId: input.sessionId,
          acquiredAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            experienceStepLocks.workspaceId,
            experienceStepLocks.documentId,
            experienceStepLocks.stepId,
          ],
          set: {
            holderUserId: input.holderUserId,
            holderName: input.holderName,
            sessionId: input.sessionId,
            acquiredAt: now,
            expiresAt,
          },
          setWhere: sql`${experienceStepLocks.expiresAt} <= now()
            or (${experienceStepLocks.holderUserId} = ${input.holderUserId}
              and ${experienceStepLocks.sessionId} = ${input.sessionId})`,
        })
        .returning();
      if (row) return toStepLock(row);
      const [held] = await tx
        .select()
        .from(experienceStepLocks)
        .where(
          and(
            eq(experienceStepLocks.workspaceId, input.workspaceId),
            eq(experienceStepLocks.documentId, input.documentId),
            eq(experienceStepLocks.stepId, input.stepId),
          ),
        )
        .limit(1);
      return toStepLock(held!);
    });
  }

  async releaseExperienceStepLock(input: ClaimStepLockInput): Promise<void> {
    await this.scoped(input.workspaceId, async (tx) => {
      await tx
        .delete(experienceStepLocks)
        .where(
          and(
            eq(experienceStepLocks.workspaceId, input.workspaceId),
            eq(experienceStepLocks.documentId, input.documentId),
            eq(experienceStepLocks.stepId, input.stepId),
            eq(experienceStepLocks.holderUserId, input.holderUserId),
            eq(experienceStepLocks.sessionId, input.sessionId),
          ),
        );
    });
  }

  async listWorkspaceApplications(workspaceId: string): Promise<ApplicationSummary[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(workspaceApplications)
        .where(eq(workspaceApplications.workspaceId, workspaceId))
        .orderBy(asc(workspaceApplications.id));
      return rows.map((row) => toApplication(row));
    });
  }

  async upsertWorkspaceApplication(
    input: UpsertWorkspaceApplicationInput,
  ): Promise<ApplicationSummary> {
    return this.scoped(input.workspaceId, async (tx) => {
      // Demote first: the partial unique index allows exactly one primary.
      if (input.isPrimary) {
        await tx
          .update(workspaceApplications)
          .set({ isPrimary: FALSE })
          .where(
            and(
              eq(workspaceApplications.workspaceId, input.workspaceId),
              eq(workspaceApplications.isPrimary, TRUE),
            ),
          );
      }
      const values = {
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        originPatterns: [...input.originPatterns],
        themeId: input.themeId ?? null,
        isPrimary: input.isPrimary ? TRUE : FALSE,
        updatedAt: new Date(),
      };
      const [row] = await tx
        .insert(workspaceApplications)
        .values(values)
        .onConflictDoUpdate({
          target: [workspaceApplications.workspaceId, workspaceApplications.id],
          set: values,
        })
        .returning();
      return toApplication(row!);
    });
  }
}

function defaultMeasurement(scope: ExperienceScope): ExperienceMeasurementRecord {
  return {
    workspaceId: scope.workspaceId,
    documentId: scope.documentId,
    adaptivePolicy: { ...DEFAULT_ADAPTIVE_POLICY },
    updatedAt: new Date(0).toISOString(),
  };
}

function toMeasurementRecord(row: {
  workspaceId: string;
  documentId: string;
  successEventName: string | null;
  successWindowDays: number | null;
  successLabel: string | null;
  adaptiveEnabled: string;
  adaptiveMinimumOccurrences: number;
  adaptiveLookbackDays: number;
  updatedAt: Date;
}): ExperienceMeasurementRecord {
  return {
    workspaceId: row.workspaceId,
    documentId: row.documentId,
    ...(row.successEventName && row.successWindowDays
      ? {
          successEvent: {
            eventName: row.successEventName,
            windowDays: row.successWindowDays as 1 | 7 | 14 | 30 | 90,
            ...(row.successLabel ? { label: row.successLabel } : {}),
          },
        }
      : {}),
    adaptivePolicy: {
      enabled: row.adaptiveEnabled === TRUE,
      minimumOccurrences: row.adaptiveMinimumOccurrences,
      lookbackDays: row.adaptiveLookbackDays,
    },
    updatedAt: toIsoString(row.updatedAt),
  };
}

function toExperiment(row: {
  id: string;
  status: string;
  varies: string;
  successEventName: string;
  arms: ExperimentArm[];
}): Experiment {
  return {
    id: row.id,
    status: row.status as Experiment['status'],
    varies: row.varies as Experiment['varies'],
    successEventName: row.successEventName,
    arms: row.arms,
  };
}

function toComment(row: {
  id: string;
  stepId: string;
  authorName: string;
  body: string;
  resolvedAt: Date | null;
  createdAt: Date;
}): ExperienceComment {
  return {
    id: row.id,
    stepId: row.stepId,
    author: row.authorName,
    body: row.body,
    resolved: row.resolvedAt !== null,
    createdAt: toIsoString(row.createdAt),
  };
}

function toStepLock(row: {
  stepId: string;
  holderName: string;
  holderUserId: string;
  expiresAt: Date;
}): ExperienceStepLock {
  return {
    stepId: row.stepId,
    holderName: row.holderName,
    holderUserId: row.holderUserId,
    expiresAt: toIsoString(row.expiresAt),
  };
}

function toApplication(row: {
  id: string;
  name: string;
  originPatterns: string[];
  themeId: string | null;
  isPrimary: string;
}): ApplicationSummary {
  return {
    id: row.id,
    name: row.name,
    originPatterns: row.originPatterns,
    ...(row.themeId ? { themeId: row.themeId } : {}),
    isPrimary: row.isPrimary === TRUE,
  };
}

export { EXPERIENCE_STEP_EVENT };
