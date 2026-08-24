import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  inArray,
  lte,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
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
import {
  DEFAULT_ADAPTIVE_POLICY,
  EXPERIENCE_COMPLETED_EVENT,
  EXPERIENCE_DISMISSED_EVENT,
  EXPERIENCE_SHOWN_EVENT,
  EXPERIENCE_STEP_EVENT,
  audienceSegmentPublicationKey,
  assignExperimentArm,
  assertExperimentArms,
  buildExperienceSessions,
  countDistinctCorrelations,
  deriveAdoptionImpact,
  deriveExperienceAnalyticsBreakdown,
  deriveExperimentResults,
  deriveFunnel,
  experimentAllocationChanged,
  ExperimentRuleError,
  experimentVariantContentChanged,
  hashExperimentAssignmentKey,
  summarizeFormResponses,
  type ClaimStepLockInput,
  type AuthoringPresenceRecord,
  type CreateExperienceCommentInput,
  type CreateExperimentInput,
  type ExperienceExperimentAssignmentRecord,
  type ExperienceExperimentScope,
  type ExperienceMeasurementRecord,
  type ExperienceStepLockClaimResult,
  type ExperienceStepLockRecord,
  type ExperienceScope,
  type HeartbeatAuthoringPresenceInput,
  type LeaveAuthoringPresenceInput,
  type ListExperienceSessionsInput,
  type MeasurableEvent,
  type QueryExperienceAnalyticsInput,
  type ReadAdaptiveBehaviorEvidenceInput,
  type RecordFormResponsesInput,
  type ReplyExperienceCommentInput,
  type ResolveExperienceCommentInput,
  type ResolveExperimentAssignmentInput,
  type UpdateExperienceMeasurementInput,
  type UpdateExperimentInput,
  type UpsertWorkspaceApplicationInput,
  assertCommercialFeature,
  analyticsExportLimitForSnapshot,
  CommercialEntitlementError,
  calendarMonthPeriod,
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
  deriveAnalyticsAudienceSegment,
  IdempotencyConflictError,
  type AnalyticsExportAuditEventRecord,
  type AnalyticsExportScope,
  type ClaimAnalyticsExportJobsInput,
  type CompleteAnalyticsExportJobInput,
  type CreateAnalyticsExportJobInput,
  type FailAnalyticsExportJobInput,
  type PersistedAnalyticsEventRecord,
  type PersistedAnalyticsExportJob,
  type ReadAnalyticsExportEventsInput,
} from '../repository';
import {
  analyticsExportAuditEvents,
  analyticsExportJobs,
  authoritativeAnalyticsEvents,
  authoringPresence,
  compiledArtifacts,
  documents,
  environments,
  experienceCommentAuditEvents,
  experienceComments,
  experienceExperimentAllocations,
  experienceExperimentAssignments,
  experienceExperiments,
  experienceFormResponses,
  experienceMeasurement,
  experienceStepLocks,
  publications,
  workspaceApplications,
} from '../schema';
import { toIsoString } from './helpers';
import { DrizzleRepositoryAnalytics } from './analytics';
import { runWithAnalyticsExportWorkerScope } from '../scoped-transaction';

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
  async readAdaptiveBehaviorEvidence(
    input: ReadAdaptiveBehaviorEvidenceInput,
  ): Promise<AdaptiveBehaviorEvidence[]> {
    const names = [...new Set(input.eventNames)]
      .filter((name) => /^[a-z][a-z0-9_]{0,63}$/u.test(name))
      .slice(0, 200);
    const evaluatedAt = new Date(input.evaluatedAt);
    if (
      names.length === 0 ||
      !/^[0-9a-f]{64}$/u.test(input.adaptiveVisitorKeyHash) ||
      !Number.isInteger(input.lookbackDays) ||
      input.lookbackDays < 1 ||
      input.lookbackDays > 365 ||
      !Number.isFinite(evaluatedAt.getTime())
    ) {
      return [];
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements;
      const retentionDays = entitlements.analyticsRetentionDays;
      const lookbackDays = Math.min(input.lookbackDays, retentionDays);
      const cutoff = new Date(evaluatedAt.getTime() - lookbackDays * 24 * 60 * 60 * 1_000);
      const rows = await tx
        .select({
          eventName: authoritativeAnalyticsEvents.name,
          occurrences: sql<number>`least(count(*), 20)::integer`,
          lastObservedAt: sql<Date>`max(${authoritativeAnalyticsEvents.occurredAt})`,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
            eq(authoritativeAnalyticsEvents.adaptiveVisitorKeyHash, input.adaptiveVisitorKeyHash),
            inArray(authoritativeAnalyticsEvents.name, names),
            gte(authoritativeAnalyticsEvents.occurredAt, cutoff),
            lte(authoritativeAnalyticsEvents.occurredAt, evaluatedAt),
          ),
        )
        .groupBy(authoritativeAnalyticsEvents.name)
        .orderBy(asc(authoritativeAnalyticsEvents.name));
      return rows.map((row) => ({
        eventName: row.eventName,
        occurrences: Number(row.occurrences),
        lastObservedAt: toIsoString(row.lastObservedAt),
      }));
    });
  }

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
      if (input.successEvent) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`adoption:${input.workspaceId}`}, 0))`,
        );
        const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
          .entitlements;
        assertCommercialFeature(entitlements, 'adoption-impact');
        const [declared] = await tx
          .select({ used: count() })
          .from(experienceMeasurement)
          .where(
            and(
              eq(experienceMeasurement.workspaceId, input.workspaceId),
              ne(experienceMeasurement.documentId, input.documentId),
              isNotNull(experienceMeasurement.successEventName),
            ),
          );
        const used = Number(declared?.used ?? 0);
        const limit = entitlements.adoptionSuccessEvents;
        if (limit !== null && used + 1 > limit) {
          throw new CommercialEntitlementError('adoption-success-events', used, limit);
        }
      }
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
      const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements;
      const retentionDays = entitlements.analyticsRetentionDays;
      const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
      const asOfDate = input.asOf ? new Date(input.asOf) : new Date();
      if (!Number.isFinite(asOfDate.getTime())) {
        throw new Error('analytics asOf must be a valid timestamp');
      }
      const asOf = asOfDate.toISOString();
      const cutoff = new Date(asOfDate.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
      const rows = await tx
        .select({
          name: authoritativeAnalyticsEvents.name,
          documentId: authoritativeAnalyticsEvents.documentId,
          publicationId: authoritativeAnalyticsEvents.publicationId,
          contentHash: authoritativeAnalyticsEvents.contentHash,
          pointerGeneration: authoritativeAnalyticsEvents.pointerGeneration,
          visitorKeyHash: authoritativeAnalyticsEvents.adaptiveVisitorKeyHash,
          stepId: authoritativeAnalyticsEvents.stepId,
          correlationId: authoritativeAnalyticsEvents.correlationId,
          occurredAt: authoritativeAnalyticsEvents.occurredAt,
          experimentId: authoritativeAnalyticsEvents.experimentId,
          armId: authoritativeAnalyticsEvents.experimentArmId,
          experimentAllocationRevision: authoritativeAnalyticsEvents.experimentAllocationRevision,
          audienceSegmentId: authoritativeAnalyticsEvents.audienceSegmentId,
          audienceSegmentDefinitionVersion:
            authoritativeAnalyticsEvents.audienceSegmentDefinitionVersion,
          audienceSegmentRuleCount: authoritativeAnalyticsEvents.audienceSegmentRuleCount,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
            /*
             * Scoped in SQL. Every consumer of the rich row set filters to this
             * document anyway — `deriveExperienceAnalyticsBreakdown` does it on
             * its first line — so fetching the environment's whole event
             * history, `props` JSONB included, to then discard most of it in
             * JavaScript was pure heap. Only adoption needs a wider set, and it
             * reads three columns; that query is below and runs only when an
             * adoption success event is actually configured.
             */
            eq(authoritativeAnalyticsEvents.documentId, input.documentId),
            gte(authoritativeAnalyticsEvents.occurredAt, cutoff),
            lte(authoritativeAnalyticsEvents.occurredAt, asOfDate),
          ),
        );
      const scoped: MeasurableEvent[] = rows.map((row) => ({
        name: row.name,
        documentId: row.documentId,
        publicationId: row.publicationId,
        contentHash: row.contentHash,
        pointerGeneration: row.pointerGeneration,
        visitorKeyHash: row.visitorKeyHash,
        stepId: row.stepId,
        correlationId: row.correlationId,
        occurredAt: toIsoString(row.occurredAt),
        experimentId: row.experimentId,
        armId: row.armId as ExperimentArm['id'] | null,
        experimentAllocationRevision: row.experimentAllocationRevision,
        audienceSegment: row.audienceSegmentId
          ? {
              id: row.audienceSegmentId,
              definitionVersion: row.audienceSegmentDefinitionVersion as 1,
              ruleCount: row.audienceSegmentRuleCount!,
            }
          : null,
        props: row.props,
      }));

      /*
       * Adoption compares people who saw this experience against everyone else
       * in the environment, so its cohort genuinely is unscoped — but it reads
       * only the name, the correlation id and the timestamp, and it is not
       * computed at all unless a success event is configured.
       */
      let adoptionCohort: MeasurableEvent[] = scoped;
      if (measurement.successEvent) {
        const cohortRows = await tx
          .select({
            name: authoritativeAnalyticsEvents.name,
            documentId: authoritativeAnalyticsEvents.documentId,
            correlationId: authoritativeAnalyticsEvents.correlationId,
            occurredAt: authoritativeAnalyticsEvents.occurredAt,
          })
          .from(authoritativeAnalyticsEvents)
          .where(
            and(
              eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
              eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
              gte(authoritativeAnalyticsEvents.occurredAt, cutoff),
              lte(authoritativeAnalyticsEvents.occurredAt, asOfDate),
            ),
          );
        adoptionCohort = cohortRows.map((row) => ({
          name: row.name,
          documentId: row.documentId,
          publicationId: null,
          contentHash: null,
          pointerGeneration: null,
          visitorKeyHash: null,
          stepId: null,
          correlationId: row.correlationId,
          occurredAt: toIsoString(row.occurredAt),
          experimentId: null,
          armId: null,
          experimentAllocationRevision: null,
          audienceSegment: null,
          props: null,
        }));
      }

      const responses = await tx
        .select()
        .from(experienceFormResponses)
        .where(
          and(
            eq(experienceFormResponses.workspaceId, input.workspaceId),
            eq(experienceFormResponses.environmentId, input.environmentId),
            eq(experienceFormResponses.documentId, input.documentId),
            gte(experienceFormResponses.occurredAt, cutoff),
            lte(experienceFormResponses.occurredAt, asOfDate),
          ),
        );

      const normalizedResponses = responses.map((row) => ({
        ...row,
        correlationId: row.correlationId ?? undefined,
        occurredAt: toIsoString(row.occurredAt),
      }));
      const audienceSegmentsByPublication = new Map<string, AnalyticsAudienceSegmentIdentity>();
      const needsHistoricalAttribution = scoped.some(
        (event) => !event.audienceSegment && event.publicationId && event.contentHash,
      );
      if (includeAudienceSegments && needsHistoricalAttribution) {
        const segmentSources = await tx
          .select({
            publicationId: publications.id,
            contentHash: publications.contentHash,
            compiled: compiledArtifacts.compiled,
          })
          .from(publications)
          .innerJoin(
            compiledArtifacts,
            and(
              eq(compiledArtifacts.workspaceId, publications.workspaceId),
              eq(compiledArtifacts.documentId, publications.documentId),
              eq(compiledArtifacts.id, publications.compiledArtifactId),
            ),
          )
          .where(
            and(
              eq(publications.workspaceId, input.workspaceId),
              eq(publications.environmentId, input.environmentId),
              eq(publications.documentId, input.documentId),
            ),
          );
        for (const source of segmentSources) {
          audienceSegmentsByPublication.set(
            audienceSegmentPublicationKey(source.publicationId, source.contentHash),
            deriveAnalyticsAudienceSegment(
              'audience' in source.compiled ? source.compiled.audience : { rules: [] },
            ),
          );
        }
      }
      return {
        documentId: input.documentId,
        environmentId: input.environmentId,
        shown: countDistinctCorrelations(scoped, EXPERIENCE_SHOWN_EVENT),
        completed: countDistinctCorrelations(scoped, EXPERIENCE_COMPLETED_EVENT),
        dismissed: countDistinctCorrelations(scoped, EXPERIENCE_DISMISSED_EVENT),
        funnel: deriveFunnel(scoped, input.stepIdsInOrder),
        adoption: measurement.successEvent
          ? [deriveAdoptionImpact(measurement.successEvent, scoped, adoptionCohort)]
          : [],
        formResponses: summarizeFormResponses(normalizedResponses),
        breakdown: deriveExperienceAnalyticsBreakdown({
          documentId: input.documentId,
          events: scoped,
          responses: normalizedResponses,
          stepIdsInOrder: input.stepIdsInOrder,
          retentionDays,
          asOf,
          includeAudienceSegments,
          audienceSegmentsByPublication,
          ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
        }),
      };
    });
  }

  async createAnalyticsExportJob(
    input: CreateAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob> {
    assertAnalyticsExportRequest(input);
    return this.scoped(input.workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`analytics-export:${input.workspaceId}`}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, input.workspaceId),
            eq(analyticsExportJobs.operationId, input.operationId),
          ),
        )
        .limit(1);
      if (existing) {
        if (!analyticsExportRequestMatches(toPersistedAnalyticsExportJob(existing), input)) {
          throw new IdempotencyConflictError(input.operationId);
        }
        return toPersistedAnalyticsExportJob(existing);
      }
      const snapshot = await this.resolveWorkspaceEntitlements(tx, input.workspaceId);
      const entitlements = snapshot.entitlements;
      assertCommercialFeature(entitlements, ANALYTICS_EXPORT_FEATURES[input.kind]);
      const [active] = await tx
        .select({ used: count() })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, input.workspaceId),
            inArray(analyticsExportJobs.status, ['queued', 'processing']),
          ),
        );
      if (Number(active?.used ?? 0) >= ANALYTICS_EXPORT_MAX_ACTIVE_JOBS) {
        throw new AnalyticsExportBackpressureError();
      }
      const requestedAt = new Date(input.requestedAt);
      const period = calendarMonthPeriod(requestedAt);
      const [usage] = await tx
        .select({ used: count() })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, input.workspaceId),
            gte(analyticsExportJobs.createdAt, period.start),
            lt(analyticsExportJobs.createdAt, period.end),
          ),
        );
      const used = Number(usage?.used ?? 0);
      const quota = analyticsExportLimitForSnapshot(snapshot);
      if (quota !== null && used + 1 > quota) {
        throw new CommercialEntitlementError('analytics-export-jobs', used, quota);
      }
      const [environment, document, publication] = await Promise.all([
        tx
          .select({ id: environments.id })
          .from(environments)
          .where(
            and(
              eq(environments.workspaceId, input.workspaceId),
              eq(environments.id, input.environmentId),
            ),
          )
          .limit(1),
        tx
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)),
          )
          .limit(1),
        input.release
          ? tx
              .select({ id: publications.id })
              .from(publications)
              .where(
                and(
                  eq(publications.workspaceId, input.workspaceId),
                  eq(publications.environmentId, input.environmentId),
                  eq(publications.documentId, input.documentId),
                  eq(publications.id, input.release.publicationId),
                  eq(publications.contentHash, input.release.contentHash),
                ),
              )
              .limit(1)
          : Promise.resolve([{ id: 'all' }]),
      ]);
      if (!environment[0] || !document[0] || !publication[0]) {
        throw new Error('analytics export scope was not found');
      }
      const id = `anx_${randomUUID().replace(/-/gu, '')}`;
      const retentionDays =
        input.kind === 'raw-events-jsonl'
          ? Math.min(entitlements.analyticsRetentionDays, ANALYTICS_RAW_EXPORT_RETENTION_DAYS)
          : entitlements.analyticsRetentionDays;
      const retentionCutoff = new Date(
        requestedAt.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
      );
      const [created] = await tx
        .insert(analyticsExportJobs)
        .values({
          id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          operationId: input.operationId,
          requestHash: input.requestHash,
          kind: input.kind,
          status: 'queued',
          definitionVersion: 1,
          publicationId: input.release?.publicationId ?? null,
          contentHash: input.release?.contentHash ?? null,
          pointerGeneration: input.release?.pointerGeneration ?? null,
          retentionCutoff,
          attemptCount: 0,
          maxAttempts: ANALYTICS_EXPORT_MAX_ATTEMPTS,
          nextAttemptAt: requestedAt,
          requestedByUserId: input.actorUserId,
          createdAt: requestedAt,
          updatedAt: requestedAt,
        })
        .returning();
      if (!created) throw new Error('analytics export job was not created');
      await tx.insert(analyticsExportAuditEvents).values({
        id: `anxaud_${randomUUID()}`,
        workspaceId: input.workspaceId,
        jobId: id,
        eventType: 'requested',
        actorUserId: input.actorUserId,
        occurredAt: requestedAt,
      });
      return toPersistedAnalyticsExportJob(created);
    });
  }

  async listAnalyticsExportJobs(
    scope: AnalyticsExportScope,
  ): Promise<PersistedAnalyticsExportJob[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, scope.workspaceId),
            eq(analyticsExportJobs.environmentId, scope.environmentId),
            eq(analyticsExportJobs.documentId, scope.documentId),
          ),
        )
        .orderBy(desc(analyticsExportJobs.createdAt), desc(analyticsExportJobs.id))
        .limit(100);
      return rows.map(toPersistedAnalyticsExportJob);
    });
  }

  async getAnalyticsExportJob(
    workspaceId: string,
    jobId: string,
  ): Promise<PersistedAnalyticsExportJob | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(analyticsExportJobs)
        .where(
          and(eq(analyticsExportJobs.workspaceId, workspaceId), eq(analyticsExportJobs.id, jobId)),
        )
        .limit(1);
      return row ? toPersistedAnalyticsExportJob(row) : null;
    });
  }

  async claimAnalyticsExportJobs(
    input: ClaimAnalyticsExportJobsInput,
  ): Promise<PersistedAnalyticsExportJob[]> {
    const now = new Date(input.now);
    if (!Number.isFinite(now.getTime())) throw new Error('analytics export worker time is invalid');
    await this.expireAnalyticsExportJobs(input.now);
    const limit = Math.max(1, Math.min(input.limit, 10));
    return runWithAnalyticsExportWorkerScope(this.database, async (tx) => {
      // Same reason as the expiry sweep below: this only writes a status.
      const exhausted = await tx
        .select({
          id: analyticsExportJobs.id,
          workspaceId: analyticsExportJobs.workspaceId,
          requestedByUserId: analyticsExportJobs.requestedByUserId,
        })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.status, 'processing'),
            lte(analyticsExportJobs.leaseExpiresAt, now),
            sql`${analyticsExportJobs.attemptCount} >= ${analyticsExportJobs.maxAttempts}`,
          ),
        )
        .limit(100)
        .for('update', { skipLocked: true });
      for (const row of exhausted) {
        await tx
          .update(analyticsExportJobs)
          .set({
            status: 'failed',
            leaseWorkerId: null,
            leaseExpiresAt: null,
            errorCode: 'generation_failed',
            updatedAt: now,
          })
          .where(eq(analyticsExportJobs.id, row.id));
        await tx.insert(analyticsExportAuditEvents).values({
          id: `anxaud_${randomUUID()}`,
          workspaceId: row.workspaceId,
          jobId: row.id,
          eventType: 'failed',
          actorUserId: row.requestedByUserId,
          errorCode: 'generation_failed',
          occurredAt: now,
        });
      }
      const rows = await tx
        .select()
        .from(analyticsExportJobs)
        .where(
          and(
            lte(analyticsExportJobs.nextAttemptAt, now),
            sql`${analyticsExportJobs.attemptCount} < ${analyticsExportJobs.maxAttempts}`,
            or(
              eq(analyticsExportJobs.status, 'queued'),
              and(
                eq(analyticsExportJobs.status, 'processing'),
                lte(analyticsExportJobs.leaseExpiresAt, now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(analyticsExportJobs.nextAttemptAt),
          asc(analyticsExportJobs.createdAt),
          asc(analyticsExportJobs.id),
        )
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: PersistedAnalyticsExportJob[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(analyticsExportJobs)
          .set({
            status: 'processing',
            attemptCount: row.attemptCount + 1,
            leaseWorkerId: input.workerId,
            leaseExpiresAt: new Date(now.getTime() + ANALYTICS_EXPORT_LEASE_MS),
            startedAt: row.startedAt ?? now,
            errorCode: null,
            updatedAt: now,
          })
          .where(eq(analyticsExportJobs.id, row.id))
          .returning();
        if (updated) claimed.push(toPersistedAnalyticsExportJob(updated));
      }
      return claimed;
    });
  }

  async readAnalyticsExportEvents(
    input: ReadAnalyticsExportEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]> {
    return this.scoped(input.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
            eq(authoritativeAnalyticsEvents.documentId, input.documentId),
            gte(authoritativeAnalyticsEvents.occurredAt, new Date(input.retentionCutoff)),
            lte(authoritativeAnalyticsEvents.occurredAt, new Date(input.requestedAt)),
            input.release
              ? eq(authoritativeAnalyticsEvents.publicationId, input.release.publicationId)
              : undefined,
            input.release
              ? eq(authoritativeAnalyticsEvents.contentHash, input.release.contentHash)
              : undefined,
            input.release
              ? eq(authoritativeAnalyticsEvents.pointerGeneration, input.release.pointerGeneration)
              : undefined,
          ),
        )
        .orderBy(asc(authoritativeAnalyticsEvents.occurredAt), asc(authoritativeAnalyticsEvents.id))
        .limit(ANALYTICS_EXPORT_MAX_SOURCE_EVENTS + 1);
      if (rows.length > ANALYTICS_EXPORT_MAX_SOURCE_EVENTS) {
        throw new AnalyticsExportGenerationError('result_too_large');
      }
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        documentId: row.documentId,
        publicationId: row.publicationId,
        contentHash: row.contentHash,
        pointerGeneration: row.pointerGeneration,
        ...(row.experimentId ? { experimentId: row.experimentId } : {}),
        ...(row.experimentArmId ? { armId: row.experimentArmId as ExperimentArm['id'] } : {}),
        ...(row.experimentAllocationRevision
          ? { experimentAllocationRevision: row.experimentAllocationRevision }
          : {}),
        ...(row.adaptiveVisitorKeyHash
          ? { adaptiveVisitorKeyHash: row.adaptiveVisitorKeyHash }
          : {}),
        name: row.name,
        ...(row.stepId ? { stepId: row.stepId } : {}),
        sdkVersion: row.sdkVersion,
        ...(row.correlationId ? { correlationId: row.correlationId } : {}),
        timestamp: toIsoString(row.occurredAt),
        ...(row.props ? { props: row.props } : {}),
        ingestedAt: toIsoString(row.ingestedAt),
      }));
    });
  }

  async completeAnalyticsExportJob(
    input: CompleteAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null> {
    assertAnalyticsExportResult(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const completedAt = new Date(input.completedAt);
      const [row] = await tx
        .update(analyticsExportJobs)
        .set({
          status: 'completed',
          leaseWorkerId: null,
          leaseExpiresAt: null,
          filename: input.filename,
          resultContentType: input.contentType,
          resultByteLength: input.byteLength,
          resultContentHash: input.contentHash,
          resultContentBase64: input.contentBase64,
          errorCode: null,
          completedAt,
          resultExpiresAt: new Date(completedAt.getTime() + ANALYTICS_EXPORT_RESULT_RETENTION_MS),
          updatedAt: completedAt,
        })
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, input.workspaceId),
            eq(analyticsExportJobs.id, input.jobId),
            eq(analyticsExportJobs.status, 'processing'),
            eq(analyticsExportJobs.leaseWorkerId, input.workerId),
          ),
        )
        .returning();
      if (!row) return null;
      await tx.insert(analyticsExportAuditEvents).values({
        id: `anxaud_${randomUUID()}`,
        workspaceId: row.workspaceId,
        jobId: row.id,
        eventType: 'completed',
        actorUserId: row.requestedByUserId,
        occurredAt: completedAt,
      });
      return toPersistedAnalyticsExportJob(row);
    });
  }

  async failAnalyticsExportJob(
    input: FailAnalyticsExportJobInput,
  ): Promise<PersistedAnalyticsExportJob | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, input.workspaceId),
            eq(analyticsExportJobs.id, input.jobId),
            eq(analyticsExportJobs.status, 'processing'),
            eq(analyticsExportJobs.leaseWorkerId, input.workerId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) return null;
      const failedAt = new Date(input.failedAt);
      const final =
        current.attemptCount >= current.maxAttempts || input.errorCode === 'result_too_large';
      const [row] = await tx
        .update(analyticsExportJobs)
        .set({
          status: final ? 'failed' : 'queued',
          leaseWorkerId: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            failedAt.getTime() + Math.min(60_000, 1_000 * 2 ** (current.attemptCount - 1)),
          ),
          errorCode: final ? input.errorCode : null,
          updatedAt: failedAt,
        })
        .where(eq(analyticsExportJobs.id, current.id))
        .returning();
      if (!row) return null;
      if (final) {
        await tx.insert(analyticsExportAuditEvents).values({
          id: `anxaud_${randomUUID()}`,
          workspaceId: row.workspaceId,
          jobId: row.id,
          eventType: 'failed',
          actorUserId: row.requestedByUserId,
          errorCode: input.errorCode,
          occurredAt: failedAt,
        });
      }
      return toPersistedAnalyticsExportJob(row);
    });
  }

  async markAnalyticsExportDownloaded(
    workspaceId: string,
    jobId: string,
    actorUserId: string,
    downloadedAt: string,
  ): Promise<boolean> {
    return this.scoped(workspaceId, async (tx) => {
      const at = new Date(downloadedAt);
      // Existence, not content: the predicate already asserts the blob is there.
      const [job] = await tx
        .select({ id: analyticsExportJobs.id })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, workspaceId),
            eq(analyticsExportJobs.id, jobId),
            eq(analyticsExportJobs.status, 'completed'),
            gt(analyticsExportJobs.resultExpiresAt, at),
            isNotNull(analyticsExportJobs.resultContentBase64),
          ),
        )
        .limit(1);
      if (!job) return false;
      await tx.insert(analyticsExportAuditEvents).values({
        id: `anxaud_${randomUUID()}`,
        workspaceId,
        jobId,
        eventType: 'downloaded',
        actorUserId,
        occurredAt: at,
      });
      return true;
    });
  }

  async expireAnalyticsExportJobs(now: string): Promise<number> {
    const at = new Date(now);
    if (!Number.isFinite(at.getTime())) throw new Error('analytics export expiry time is invalid');
    return runWithAnalyticsExportWorkerScope(this.database, async (tx) => {
      /*
       * A projection, not `select()`. The row carries `result_content_base64`,
       * capped at 16 MiB, and this runs on every worker tick to set that very
       * column to null — so the old shape moved up to 1.6 GB across the wire
       * every five seconds to write nothing but nulls.
       */
      const rows = await tx
        .select({
          id: analyticsExportJobs.id,
          workspaceId: analyticsExportJobs.workspaceId,
          requestedByUserId: analyticsExportJobs.requestedByUserId,
        })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.status, 'completed'),
            lte(analyticsExportJobs.resultExpiresAt, at),
          ),
        )
        .limit(100)
        .for('update', { skipLocked: true });
      for (const row of rows) {
        await tx
          .update(analyticsExportJobs)
          .set({
            status: 'expired',
            filename: null,
            resultContentType: null,
            resultByteLength: null,
            resultContentHash: null,
            resultContentBase64: null,
            updatedAt: at,
          })
          .where(eq(analyticsExportJobs.id, row.id));
        await tx.insert(analyticsExportAuditEvents).values({
          id: `anxaud_${randomUUID()}`,
          workspaceId: row.workspaceId,
          jobId: row.id,
          eventType: 'expired',
          actorUserId: row.requestedByUserId,
          occurredAt: at,
        });
      }
      return rows.length;
    });
  }

  async listAnalyticsExportAuditEvents(
    scope: AnalyticsExportScope,
  ): Promise<AnalyticsExportAuditEventRecord[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const jobs = await tx
        .select({ id: analyticsExportJobs.id })
        .from(analyticsExportJobs)
        .where(
          and(
            eq(analyticsExportJobs.workspaceId, scope.workspaceId),
            eq(analyticsExportJobs.environmentId, scope.environmentId),
            eq(analyticsExportJobs.documentId, scope.documentId),
          ),
        );
      if (!jobs.length) return [];
      const rows = await tx
        .select()
        .from(analyticsExportAuditEvents)
        .where(
          and(
            eq(analyticsExportAuditEvents.workspaceId, scope.workspaceId),
            inArray(
              analyticsExportAuditEvents.jobId,
              jobs.map((job) => job.id),
            ),
          ),
        )
        .orderBy(asc(analyticsExportAuditEvents.occurredAt), asc(analyticsExportAuditEvents.id));
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        jobId: row.jobId,
        eventType: row.eventType as AnalyticsExportAuditEventRecord['eventType'],
        actorUserId: row.actorUserId,
        ...(row.errorCode
          ? { errorCode: row.errorCode as AnalyticsExportAuditEventRecord['errorCode'] }
          : {}),
        occurredAt: toIsoString(row.occurredAt),
      }));
    });
  }

  async listExperienceSessions(input: ListExperienceSessionsInput): Promise<ExperienceSession[]> {
    return this.scoped(input.workspaceId, async (tx) => {
      const retentionDays = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements.analyticsRetentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
      const rows = await tx
        .select({
          name: authoritativeAnalyticsEvents.name,
          documentId: authoritativeAnalyticsEvents.documentId,
          stepId: authoritativeAnalyticsEvents.stepId,
          correlationId: authoritativeAnalyticsEvents.correlationId,
          occurredAt: authoritativeAnalyticsEvents.occurredAt,
          experimentId: authoritativeAnalyticsEvents.experimentId,
          armId: authoritativeAnalyticsEvents.experimentArmId,
          experimentAllocationRevision: authoritativeAnalyticsEvents.experimentAllocationRevision,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, input.environmentId),
            eq(authoritativeAnalyticsEvents.documentId, input.documentId),
            gte(authoritativeAnalyticsEvents.occurredAt, cutoff),
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
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'form-response-capture',
      );
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
    scope: ExperienceExperimentScope,
  ): Promise<{ experiment: Experiment | null; results: ExperimentResults | null }> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const retentionDays = (await this.resolveWorkspaceEntitlements(tx, scope.workspaceId))
        .entitlements.analyticsRetentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
      const [row] = await tx
        .select()
        .from(experienceExperiments)
        .where(
          and(
            eq(experienceExperiments.workspaceId, scope.workspaceId),
            eq(experienceExperiments.documentId, scope.documentId),
          ),
        )
        .orderBy(
          sql`case when ${experienceExperiments.status} in ('draft', 'running') then 0 else 1 end`,
          desc(experienceExperiments.updatedAt),
          desc(experienceExperiments.id),
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
          experimentId: authoritativeAnalyticsEvents.experimentId,
          armId: authoritativeAnalyticsEvents.experimentArmId,
          experimentAllocationRevision: authoritativeAnalyticsEvents.experimentAllocationRevision,
          props: authoritativeAnalyticsEvents.props,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, scope.workspaceId),
            eq(authoritativeAnalyticsEvents.documentId, scope.documentId),
            ...(scope.environmentId
              ? [eq(authoritativeAnalyticsEvents.environmentId, scope.environmentId)]
              : []),
            gte(authoritativeAnalyticsEvents.occurredAt, cutoff),
          ),
        );
      return {
        experiment,
        results: {
          ...deriveExperimentResults(
            experiment,
            rows.map((event) => ({
              ...event,
              armId: event.armId as ExperimentArm['id'] | null,
              occurredAt: toIsoString(event.occurredAt),
            })),
          ),
          ...(scope.environmentId ? { environmentId: scope.environmentId } : {}),
        },
      };
    });
  }

  async createExperiment(input: CreateExperimentInput): Promise<Experiment> {
    assertExperimentArms(input.arms);
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'experiments',
      );
      const [row] = await tx
        .insert(experienceExperiments)
        .values({
          id: `exp_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          status: 'draft',
          varies: input.varies === 'conditions' ? 'copy' : input.varies,
          variationKind: input.varies,
          successEventName: input.successEventName,
          arms: [...input.arms],
          createdByUserId: input.actorUserId,
        })
        .returning();
      await tx.insert(experienceExperimentAllocations).values({
        workspaceId: row!.workspaceId,
        experimentId: row!.id,
        revision: row!.allocationRevision,
        arms: [...row!.arms],
      });
      return toExperiment(row!);
    });
  }

  async updateExperiment(input: UpdateExperimentInput): Promise<Experiment | null> {
    if (input.arms) assertExperimentArms(input.arms);
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'experiments',
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`experiment:${input.workspaceId}:${input.experimentId}`}, 0))`,
      );
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
      if (
        input.arms &&
        current.status !== 'draft' &&
        experimentVariantContentChanged(current.arms, input.arms)
      ) {
        throw new ExperimentRuleError(
          'experiment variant content is immutable after the experiment starts',
        );
      }
      const status = input.promotedArmId ? 'promoted' : (input.status ?? current.status);
      const arms = input.arms ?? current.arms;
      if (input.promotedArmId && !arms.some((arm) => arm.id === input.promotedArmId)) {
        throw new ExperimentRuleError('promoted experiment arm does not exist');
      }
      const allocationChanged = Boolean(
        input.arms && experimentAllocationChanged(current.arms, input.arms),
      );
      const allocationRevision = allocationChanged
        ? current.allocationRevision + 1
        : current.allocationRevision;
      const now = new Date();
      const [row] = await tx
        .update(experienceExperiments)
        .set({
          status,
          arms: [...arms],
          allocationRevision,
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
      if (row && allocationChanged) {
        await tx.insert(experienceExperimentAllocations).values({
          workspaceId: row.workspaceId,
          experimentId: row.id,
          revision: row.allocationRevision,
          arms: [...row.arms],
          createdAt: now,
        });
      }
      return row ? toExperiment(row) : null;
    });
  }

  async getOrCreateExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const assignmentKeyHash = hashExperimentAssignmentKey(input);
      const [existing] = await tx
        .select()
        .from(experienceExperimentAssignments)
        .where(experimentAssignmentWhere(input, assignmentKeyHash))
        .limit(1);
      if (existing) return toExperimentAssignment(existing);

      const [experiment] = await tx
        .select()
        .from(experienceExperiments)
        .where(
          and(
            eq(experienceExperiments.workspaceId, input.workspaceId),
            eq(experienceExperiments.documentId, input.documentId),
            eq(experienceExperiments.id, input.experimentId),
            eq(experienceExperiments.status, 'running'),
          ),
        )
        .limit(1);
      if (!experiment) return null;

      const [inserted] = await tx
        .insert(experienceExperimentAssignments)
        .values({
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          experimentId: input.experimentId,
          assignmentKeyHash,
          armId: assignExperimentArm(experiment.arms, assignmentKeyHash),
          allocationRevision: experiment.allocationRevision,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return toExperimentAssignment(inserted);
      const [winner] = await tx
        .select()
        .from(experienceExperimentAssignments)
        .where(experimentAssignmentWhere(input, assignmentKeyHash))
        .limit(1);
      return winner ? toExperimentAssignment(winner) : null;
    });
  }

  async findExperimentAssignment(
    input: ResolveExperimentAssignmentInput,
  ): Promise<ExperienceExperimentAssignmentRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const assignmentKeyHash = hashExperimentAssignmentKey(input);
      const [row] = await tx
        .select()
        .from(experienceExperimentAssignments)
        .where(experimentAssignmentWhere(input, assignmentKeyHash))
        .limit(1);
      return row ? toExperimentAssignment(row) : null;
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
      return toCommentThreads(rows);
    });
  }

  async createExperienceComment(input: CreateExperienceCommentInput): Promise<ExperienceComment> {
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'comments',
      );
      const [row] = await tx
        .insert(experienceComments)
        .values({
          id: `cmt_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          stepId: input.anchor.stepId,
          ...(input.anchor.type === 'target' ? { targetId: input.anchor.targetId } : {}),
          body: input.body,
          authorUserId: input.authorUserId,
          authorName: input.authorName,
        })
        .returning();
      await tx.insert(experienceCommentAuditEvents).values({
        id: `cmtaud_${randomUUID().replace(/-/gu, '')}`,
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        threadId: row!.id,
        commentId: row!.id,
        eventType: 'thread_created',
        actorUserId: input.authorUserId,
      });
      return toCommentThread(row!, []);
    });
  }

  async replyToExperienceComment(
    input: ReplyExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'comments',
      );
      const [root] = await tx
        .select()
        .from(experienceComments)
        .where(
          and(
            eq(experienceComments.workspaceId, input.workspaceId),
            eq(experienceComments.id, input.threadId),
            isNull(experienceComments.parentCommentId),
            ...(input.documentId ? [eq(experienceComments.documentId, input.documentId)] : []),
          ),
        )
        .limit(1);
      if (!root) return null;
      const [reply] = await tx
        .insert(experienceComments)
        .values({
          id: `cmt_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: root.workspaceId,
          documentId: root.documentId,
          stepId: root.stepId,
          targetId: root.targetId,
          parentCommentId: root.id,
          body: input.body,
          authorUserId: input.authorUserId,
          authorName: input.authorName,
        })
        .returning();
      await tx.insert(experienceCommentAuditEvents).values({
        id: `cmtaud_${randomUUID().replace(/-/gu, '')}`,
        workspaceId: root.workspaceId,
        documentId: root.documentId,
        threadId: root.id,
        commentId: reply!.id,
        eventType: 'reply_added',
        actorUserId: input.authorUserId,
      });
      const replies = await tx
        .select()
        .from(experienceComments)
        .where(
          and(
            eq(experienceComments.workspaceId, root.workspaceId),
            eq(experienceComments.parentCommentId, root.id),
          ),
        )
        .orderBy(asc(experienceComments.createdAt));
      return toCommentThread(root, replies);
    });
  }

  async resolveExperienceComment(
    input: ResolveExperienceCommentInput,
  ): Promise<ExperienceComment | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'comments',
      );
      const [current] = await tx
        .select()
        .from(experienceComments)
        .where(
          and(
            eq(experienceComments.workspaceId, input.workspaceId),
            eq(experienceComments.id, input.commentId),
            isNull(experienceComments.parentCommentId),
            ...(input.documentId ? [eq(experienceComments.documentId, input.documentId)] : []),
          ),
        )
        .limit(1);
      if (!current) return null;
      const alreadyResolved = current.resolvedAt !== null;
      const row =
        alreadyResolved === input.resolved
          ? current
          : (
              await tx
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
                    isNull(experienceComments.parentCommentId),
                    ...(input.documentId
                      ? [eq(experienceComments.documentId, input.documentId)]
                      : []),
                  ),
                )
                .returning()
            )[0];
      if (!row) return null;
      if (alreadyResolved !== input.resolved) {
        await tx.insert(experienceCommentAuditEvents).values({
          id: `cmtaud_${randomUUID().replace(/-/gu, '')}`,
          workspaceId: row.workspaceId,
          documentId: row.documentId,
          threadId: row.id,
          commentId: row.id,
          eventType: input.resolved ? 'thread_resolved' : 'thread_reopened',
          actorUserId: input.actorUserId,
        });
      }
      const replies = await tx
        .select()
        .from(experienceComments)
        .where(
          and(
            eq(experienceComments.workspaceId, row.workspaceId),
            eq(experienceComments.parentCommentId, row.id),
          ),
        )
        .orderBy(asc(experienceComments.createdAt));
      return toCommentThread(row, replies);
    });
  }

  async listExperienceCommentAuditEvents(
    scope: ExperienceScope,
  ): Promise<ExperienceCommentAuditEvent[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(experienceCommentAuditEvents)
        .where(
          and(
            eq(experienceCommentAuditEvents.workspaceId, scope.workspaceId),
            eq(experienceCommentAuditEvents.documentId, scope.documentId),
          ),
        )
        .orderBy(asc(experienceCommentAuditEvents.occurredAt));
      return rows.map((row) => ({
        id: row.id,
        threadId: row.threadId,
        commentId: row.commentId,
        eventType: row.eventType as ExperienceCommentAuditEvent['eventType'],
        actorUserId: row.actorUserId,
        occurredAt: toIsoString(row.occurredAt),
      }));
    });
  }

  async listExperienceStepLocks(scope: ExperienceScope): Promise<ExperienceStepLock[]> {
    return (await this.listExperienceStepLockRecords(scope)).map((row) => ({
      stepId: row.stepId,
      holderName: row.holderName,
      expiresAt: row.expiresAt,
    }));
  }

  async listExperienceStepLockRecords(scope: ExperienceScope): Promise<ExperienceStepLockRecord[]> {
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
      return rows.map((row) => toStepLockRecord(row));
    });
  }

  async findExperienceStepLock(
    scope: ExperienceScope,
    stepId: string,
  ): Promise<ExperienceStepLockRecord | null> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(experienceStepLocks)
        .where(
          and(
            eq(experienceStepLocks.workspaceId, scope.workspaceId),
            eq(experienceStepLocks.documentId, scope.documentId),
            eq(experienceStepLocks.stepId, stepId),
            gt(experienceStepLocks.expiresAt, new Date()),
          ),
        )
        .limit(1);
      return row ? toStepLockRecord(row) : null;
    });
  }

  /**
   * Compare-and-set on expiry: the update only lands when the current lease has
   * lapsed or already belongs to this user, so two creators racing for the same
   * step produce one winner rather than a last-write-wins overwrite.
   */
  async claimExperienceStepLock(input: ClaimStepLockInput): Promise<ExperienceStepLockClaimResult> {
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'step-locks',
      );
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
          setWhere: input.takeover
            ? sql`true`
            : sql`${experienceStepLocks.expiresAt} <= now()
              or (${experienceStepLocks.holderUserId} = ${input.holderUserId}
                and ${experienceStepLocks.sessionId} = ${input.sessionId})`,
        })
        .returning();
      if (row) return { lock: toStepLock(row), acquired: true };
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
      return { lock: toStepLock(held!), acquired: false };
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

  async heartbeatAuthoringPresence(
    input: HeartbeatAuthoringPresenceInput,
  ): Promise<AuthoringPresenceRecord> {
    return this.scoped(input.workspaceId, async (tx) => {
      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'presence',
      );
      const now = new Date();
      const expiresAt = new Date(now.getTime() + AUTHORING_PRESENCE_TTL_SECONDS * 1_000);
      const selectionType = input.selection?.type ?? null;
      const selectionId = authoringPresenceSelectionId(input.selection);
      const [row] = await tx
        .insert(authoringPresence)
        .values({
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          sessionId: input.sessionId,
          creatorId: input.creatorId,
          creatorName: input.creatorName,
          stepId: input.stepId,
          selectionType,
          selectionId,
          documentUpdatedAt: input.documentUpdatedAt ? new Date(input.documentUpdatedAt) : null,
          lastSeenAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [
            authoringPresence.workspaceId,
            authoringPresence.documentId,
            authoringPresence.sessionId,
          ],
          set: {
            creatorId: input.creatorId,
            creatorName: input.creatorName,
            stepId: input.stepId,
            selectionType,
            selectionId,
            documentUpdatedAt: input.documentUpdatedAt ? new Date(input.documentUpdatedAt) : null,
            lastSeenAt: now,
            expiresAt,
          },
        })
        .returning();
      return toAuthoringPresenceRecord(row!);
    });
  }

  async listAuthoringPresence(scope: ExperienceScope): Promise<AuthoringPresenceRecord[]> {
    return this.scoped(scope.workspaceId, async (tx) => {
      const now = new Date();
      await tx
        .delete(authoringPresence)
        .where(
          and(
            eq(authoringPresence.workspaceId, scope.workspaceId),
            eq(authoringPresence.documentId, scope.documentId),
            lte(authoringPresence.expiresAt, now),
          ),
        );
      const rows = await tx
        .select()
        .from(authoringPresence)
        .where(
          and(
            eq(authoringPresence.workspaceId, scope.workspaceId),
            eq(authoringPresence.documentId, scope.documentId),
            gt(authoringPresence.expiresAt, now),
          ),
        )
        .orderBy(asc(authoringPresence.creatorName), asc(authoringPresence.sessionId));
      return rows.map(toAuthoringPresenceRecord);
    });
  }

  async leaveAuthoringPresence(input: LeaveAuthoringPresenceInput): Promise<void> {
    await this.scoped(input.workspaceId, async (tx) => {
      await tx
        .delete(authoringPresence)
        .where(
          and(
            eq(authoringPresence.workspaceId, input.workspaceId),
            eq(authoringPresence.documentId, input.documentId),
            eq(authoringPresence.sessionId, input.sessionId),
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
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`applications:${input.workspaceId}`}, 0))`,
      );
      const limit = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements
        .applications;
      const [existing, total] = await Promise.all([
        tx
          .select({ id: workspaceApplications.id })
          .from(workspaceApplications)
          .where(
            and(
              eq(workspaceApplications.workspaceId, input.workspaceId),
              eq(workspaceApplications.id, input.id),
            ),
          )
          .limit(1),
        tx
          .select({ used: count() })
          .from(workspaceApplications)
          .where(eq(workspaceApplications.workspaceId, input.workspaceId)),
      ]);
      const used = Number(total[0]?.used ?? 0);
      if (!existing[0] && limit !== null && used + 1 > limit) {
        throw new CommercialEntitlementError('applications', used, limit);
      }
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
  variationKind: string | null;
  successEventName: string;
  arms: ExperimentArm[];
  allocationRevision: number;
  promotedArmId: string | null;
}): Experiment {
  return {
    id: row.id,
    status: row.status as Experiment['status'],
    varies: (row.variationKind ?? row.varies) as Experiment['varies'],
    successEventName: row.successEventName,
    arms: row.arms,
    allocationRevision: row.allocationRevision,
    ...(row.promotedArmId ? { promotedArmId: row.promotedArmId as ExperimentArm['id'] } : {}),
  };
}

function experimentAssignmentWhere(
  input: ResolveExperimentAssignmentInput,
  assignmentKeyHash: string,
) {
  return and(
    eq(experienceExperimentAssignments.workspaceId, input.workspaceId),
    eq(experienceExperimentAssignments.environmentId, input.environmentId),
    eq(experienceExperimentAssignments.experimentId, input.experimentId),
    eq(experienceExperimentAssignments.assignmentKeyHash, assignmentKeyHash),
  );
}

function toExperimentAssignment(
  row: typeof experienceExperimentAssignments.$inferSelect,
): ExperienceExperimentAssignmentRecord {
  return {
    ...row,
    armId: row.armId as ExperimentArm['id'],
    createdAt: toIsoString(row.createdAt),
  };
}

type ExperienceCommentRow = typeof experienceComments.$inferSelect;

function toCommentThreads(rows: readonly ExperienceCommentRow[]): ExperienceComment[] {
  return rows
    .filter((row) => row.parentCommentId === null)
    .map((root) => toCommentThread(root, rows));
}

function toCommentThread(
  row: ExperienceCommentRow,
  rows: readonly ExperienceCommentRow[],
): ExperienceComment {
  return {
    id: row.id,
    anchor: row.targetId
      ? { type: 'target', stepId: row.stepId, targetId: row.targetId }
      : { type: 'step', stepId: row.stepId },
    author: row.authorName,
    body: row.body,
    replies: rows
      .filter((reply) => reply.parentCommentId === row.id)
      .map((reply) => ({
        id: reply.id,
        author: reply.authorName,
        body: reply.body,
        createdAt: toIsoString(reply.createdAt),
      })),
    resolved: row.resolvedAt !== null,
    ...(row.resolvedAt ? { resolvedAt: toIsoString(row.resolvedAt) } : {}),
    createdAt: toIsoString(row.createdAt),
  };
}

function toPersistedAnalyticsExportJob(
  row: typeof analyticsExportJobs.$inferSelect,
): PersistedAnalyticsExportJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    operationId: row.operationId,
    requestHash: row.requestHash,
    kind: row.kind,
    status: row.status,
    definitionVersion: 1,
    ...(row.publicationId && row.contentHash && row.pointerGeneration
      ? {
          release: {
            publicationId: row.publicationId,
            contentHash: row.contentHash,
            pointerGeneration: row.pointerGeneration,
          },
        }
      : {}),
    retentionCutoff: toIsoString(row.retentionCutoff),
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: toIsoString(row.nextAttemptAt),
    ...(row.leaseWorkerId ? { leaseWorkerId: row.leaseWorkerId } : {}),
    ...(row.leaseExpiresAt ? { leaseExpiresAt: toIsoString(row.leaseExpiresAt) } : {}),
    ...(row.filename ? { filename: row.filename } : {}),
    ...(row.resultContentType ? { contentType: row.resultContentType } : {}),
    ...(row.resultByteLength !== null ? { byteLength: row.resultByteLength } : {}),
    ...(row.resultContentHash ? { contentHash: row.resultContentHash } : {}),
    ...(row.resultContentBase64 ? { contentBase64: row.resultContentBase64 } : {}),
    ...(row.errorCode
      ? { errorCode: row.errorCode as PersistedAnalyticsExportJob['errorCode'] }
      : {}),
    requestedByUserId: row.requestedByUserId,
    createdAt: toIsoString(row.createdAt),
    ...(row.startedAt ? { startedAt: toIsoString(row.startedAt) } : {}),
    ...(row.completedAt ? { completedAt: toIsoString(row.completedAt) } : {}),
    ...(row.resultExpiresAt ? { resultExpiresAt: toIsoString(row.resultExpiresAt) } : {}),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function assertAnalyticsExportRequest(input: CreateAnalyticsExportJobInput): void {
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

function toStepLock(row: {
  stepId: string;
  holderName: string;
  holderUserId: string;
  expiresAt: Date;
}): ExperienceStepLock {
  return {
    stepId: row.stepId,
    holderName: row.holderName,
    expiresAt: toIsoString(row.expiresAt),
  };
}

function toStepLockRecord(row: {
  workspaceId: string;
  documentId: string;
  stepId: string;
  holderName: string;
  holderUserId: string;
  sessionId: string;
  acquiredAt: Date;
  expiresAt: Date;
}): ExperienceStepLockRecord {
  return {
    workspaceId: row.workspaceId,
    documentId: row.documentId,
    stepId: row.stepId,
    holderName: row.holderName,
    holderUserId: row.holderUserId,
    sessionId: row.sessionId,
    acquiredAt: toIsoString(row.acquiredAt),
    expiresAt: toIsoString(row.expiresAt),
  };
}

function toAuthoringPresenceRecord(
  row: typeof authoringPresence.$inferSelect,
): AuthoringPresenceRecord {
  const selection = authoringPresenceSelection(row.selectionType, row.selectionId);
  return {
    workspaceId: row.workspaceId,
    documentId: row.documentId,
    sessionId: row.sessionId,
    creatorId: row.creatorId,
    creatorName: row.creatorName,
    stepId: row.stepId,
    selection,
    ...(row.documentUpdatedAt ? { documentUpdatedAt: toIsoString(row.documentUpdatedAt) } : {}),
    lastSeenAt: toIsoString(row.lastSeenAt),
    expiresAt: toIsoString(row.expiresAt),
  };
}

function authoringPresenceSelectionId(
  selection: HeartbeatAuthoringPresenceInput['selection'],
): string | null {
  if (!selection) return null;
  return selection.type === 'block' ? selection.blockId : selection.targetId;
}

function authoringPresenceSelection(
  selectionType: string | null,
  selectionId: string | null,
): AuthoringPresenceRecord['selection'] {
  if (!selectionId) return null;
  if (selectionType === 'block') return { type: 'block', blockId: selectionId };
  if (selectionType === 'target') return { type: 'target', targetId: selectionId };
  return null;
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
