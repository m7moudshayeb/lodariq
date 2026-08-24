import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { type AnalyticsEventAggregate } from '@lodariq/schema';
import {
  type CreateVisualCheckRunInput,
  type IngestAuthoritativeEventsInput,
  type IngestEventsInput,
  type PersistedAnalyticsEventRecord,
  type QueryAnalyticsEventsInput,
  type VisualCheckRunRecord,
  assertAnalyticsEnvironmentQuery,
  assertAuthoritativeAnalyticsBatch,
  assertCommercialFeature,
  assertVisualCheckReport,
  DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT,
  calendarMonthPeriod,
} from '../repository';
import {
  compiledArtifacts,
  authoritativeAnalyticsEvents,
  documentVersions,
  environments,
  events,
  visualCheckRuns,
  workspaceUsageLedger,
} from '../schema';
import {
  toVisualCheckRunRecord,
  toPersistedAnalyticsEventRecord,
  toAnalyticsTargetResolutionStatus,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryAuthoringSessions } from './authoring-sessions';

export class DrizzleRepositoryAnalytics extends DrizzleRepositoryAuthoringSessions {
  async createVisualCheckRun(input: CreateVisualCheckRunInput): Promise<VisualCheckRunRecord> {
    assertVisualCheckReport(input.report);
    if (!/^sha256-[0-9a-f]{64}$/u.test(input.contentHash)) {
      throw new Error('visual check contentHash must be a SHA-256 content hash');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const [documentVersion] = await tx
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, input.workspaceId),
            eq(documentVersions.documentId, input.documentId),
            eq(documentVersions.id, input.documentVersionId),
          ),
        )
        .limit(1);
      if (!documentVersion) {
        throw new Error('visual check document version not found in workspace');
      }
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.documentId, input.documentId),
            eq(compiledArtifacts.id, input.compiledArtifactId),
            eq(compiledArtifacts.documentVersionId, input.documentVersionId),
            eq(compiledArtifacts.contentHash, input.contentHash),
          ),
        )
        .limit(1);
      if (!artifact) throw new Error('visual check compiled artifact identity mismatch');
      if (artifact.themeVersionId !== input.themeVersionId) {
        throw new Error('visual check theme version does not match compiled artifact');
      }
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
      if (!environment) throw new Error('visual check environment not found in workspace');

      const [created] = await tx
        .insert(visualCheckRuns)
        .values({
          id: `vcheck_${randomUUID()}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          documentVersionId: input.documentVersionId,
          compiledArtifactId: input.compiledArtifactId,
          themeVersionId: input.themeVersionId,
          environmentId: input.environmentId,
          contentHash: input.contentHash,
          report: input.report,
          status: input.report.status,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!created) throw new Error('failed to persist visual check run');
      return toVisualCheckRunRecord(created);
    });
  }

  async listVisualCheckRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<VisualCheckRunRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(visualCheckRuns)
        .where(
          and(
            eq(visualCheckRuns.workspaceId, workspaceId),
            eq(visualCheckRuns.documentId, documentId),
          ),
        )
        .orderBy(desc(visualCheckRuns.createdAt), desc(visualCheckRuns.id));
      return rows.map(toVisualCheckRunRecord);
    });
  }

  async ingestAuthoritativeEvents(input: IngestAuthoritativeEventsInput): Promise<number> {
    assertAuthoritativeAnalyticsBatch(input);

    return this.scoped(input.workspaceId, async (tx) => {
      if (!input.events.length) return 0;

      await tx.insert(authoritativeAnalyticsEvents).values(
        input.events.map((event) => ({
          id: `aevt_${randomUUID()}`,
          workspaceId: event.workspaceId,
          environmentId: event.environmentId,
          documentId: event.documentId,
          publicationId: event.publicationId,
          contentHash: event.contentHash,
          pointerGeneration: event.pointerGeneration,
          experimentId: event.experimentId ?? null,
          experimentArmId: event.armId ?? null,
          experimentAllocationRevision: event.experimentAllocationRevision ?? null,
          audienceSegmentId: event.audienceSegment?.id ?? null,
          audienceSegmentDefinitionVersion: event.audienceSegment?.definitionVersion ?? null,
          audienceSegmentRuleCount: event.audienceSegment?.ruleCount ?? null,
          adaptiveVisitorKeyHash: input.adaptiveVisitorKeyHash ?? null,
          name: event.name,
          stepId: event.stepId ?? null,
          sdkVersion: event.sdkVersion,
          correlationId: event.correlationId ?? null,
          occurredAt: new Date(event.timestamp),
          props: event.props ?? null,
        })),
      );

      const engaged = new Map<string, (typeof input.events)[number]>();
      for (const event of input.events) {
        if (event.name === 'experience_shown' && event.engagementKey) {
          const period = calendarMonthPeriod(event.timestamp);
          engaged.set(`${period.start.toISOString()}:${event.engagementKey}`, event);
        }
      }
      if (engaged.size) {
        await tx
          .insert(workspaceUsageLedger)
          .values(
            [...engaged.values()].map((event) => {
              const period = calendarMonthPeriod(event.timestamp);
              return {
                id: `usage_${randomUUID()}`,
                workspaceId: input.workspaceId,
                environmentId: input.environmentId,
                scopeKey: input.environmentId,
                metric: 'engaged-users' as const,
                periodStart: period.start,
                periodEnd: period.end,
                quantity: 1,
                dedupeKeyHash: engagementDedupeHash(
                  input.workspaceId,
                  input.environmentId,
                  event.engagementKey!,
                ),
                occurredAt: new Date(event.timestamp),
                createdAt: new Date(),
              };
            }),
          )
          .onConflictDoNothing({
            target: [
              workspaceUsageLedger.workspaceId,
              workspaceUsageLedger.scopeKey,
              workspaceUsageLedger.metric,
              workspaceUsageLedger.periodStart,
              workspaceUsageLedger.dedupeKeyHash,
            ],
          });
      }

      return input.events.length;
    });
  }

  async listAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    const query = input.query;
    return this.scoped(input.workspaceId, async (tx) => {
      const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements;
      const retentionDays = entitlements.analyticsRetentionDays;
      const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
      if (query.audienceSegmentId) {
        assertCommercialFeature(entitlements, 'audience-segment-results');
      }
      const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
      const rows = await tx
        .select()
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, query.environmentId),
            query.documentId
              ? eq(authoritativeAnalyticsEvents.documentId, query.documentId)
              : undefined,
            query.publicationId
              ? eq(authoritativeAnalyticsEvents.publicationId, query.publicationId)
              : undefined,
            query.contentHash
              ? eq(authoritativeAnalyticsEvents.contentHash, query.contentHash)
              : undefined,
            query.audienceSegmentId
              ? eq(authoritativeAnalyticsEvents.audienceSegmentId, query.audienceSegmentId)
              : undefined,
            query.locale
              ? eq(sql`${authoritativeAnalyticsEvents.props} ->> 'locale'`, query.locale)
              : undefined,
            query.from
              ? gte(authoritativeAnalyticsEvents.occurredAt, new Date(query.from))
              : undefined,
            gte(authoritativeAnalyticsEvents.occurredAt, retentionCutoff),
            query.to ? lte(authoritativeAnalyticsEvents.occurredAt, new Date(query.to)) : undefined,
          ),
        )
        .orderBy(
          desc(authoritativeAnalyticsEvents.occurredAt),
          desc(authoritativeAnalyticsEvents.id),
        )
        .limit(query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT);
      return rows.map((row) => {
        const event = toPersistedAnalyticsEventRecord(row);
        if (includeAudienceSegments) return event;
        const { audienceSegment: _audienceSegment, ...basicEvent } = event;
        return basicEvent;
      });
    });
  }

  async aggregateAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<AnalyticsEventAggregate[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    const query = input.query;
    return this.scoped(input.workspaceId, async (tx) => {
      const entitlements = (await this.resolveWorkspaceEntitlements(tx, input.workspaceId))
        .entitlements;
      const retentionDays = entitlements.analyticsRetentionDays;
      const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
      if (query.audienceSegmentId) {
        assertCommercialFeature(entitlements, 'audience-segment-results');
      }
      const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
      const targetResolutionStatus = sql<string | null>`case
        when ${authoritativeAnalyticsEvents.name} = 'target_resolution' then
          case
            when ${authoritativeAnalyticsEvents.props} ->> 'result' in
              ('found', 'ambiguous', 'missing', 'needs_review')
              then ${authoritativeAnalyticsEvents.props} ->> 'result'
            else 'unknown'
          end
        else null
      end`;
      const contentLocale = sql<string | null>`case
        when ${authoritativeAnalyticsEvents.props} ->> 'locale' ~
          '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
          then ${authoritativeAnalyticsEvents.props} ->> 'locale'
        else null
      end`;
      const rows = await tx
        .select({
          workspaceId: authoritativeAnalyticsEvents.workspaceId,
          environmentId: authoritativeAnalyticsEvents.environmentId,
          documentId: authoritativeAnalyticsEvents.documentId,
          publicationId: authoritativeAnalyticsEvents.publicationId,
          contentHash: authoritativeAnalyticsEvents.contentHash,
          pointerGeneration: authoritativeAnalyticsEvents.pointerGeneration,
          experimentId: authoritativeAnalyticsEvents.experimentId,
          experimentArmId: authoritativeAnalyticsEvents.experimentArmId,
          experimentAllocationRevision: authoritativeAnalyticsEvents.experimentAllocationRevision,
          audienceSegmentId: includeAudienceSegments
            ? authoritativeAnalyticsEvents.audienceSegmentId
            : sql<string | null>`null`,
          audienceSegmentDefinitionVersion: includeAudienceSegments
            ? authoritativeAnalyticsEvents.audienceSegmentDefinitionVersion
            : sql<number | null>`null`,
          audienceSegmentRuleCount: includeAudienceSegments
            ? authoritativeAnalyticsEvents.audienceSegmentRuleCount
            : sql<number | null>`null`,
          name: authoritativeAnalyticsEvents.name,
          targetResolutionStatus,
          contentLocale,
          count: sql<number>`count(*)::integer`,
          firstTimestamp: sql<Date>`min(${authoritativeAnalyticsEvents.occurredAt})`,
          lastTimestamp: sql<Date>`max(${authoritativeAnalyticsEvents.occurredAt})`,
        })
        .from(authoritativeAnalyticsEvents)
        .where(
          and(
            eq(authoritativeAnalyticsEvents.workspaceId, input.workspaceId),
            eq(authoritativeAnalyticsEvents.environmentId, query.environmentId),
            query.documentId
              ? eq(authoritativeAnalyticsEvents.documentId, query.documentId)
              : undefined,
            query.publicationId
              ? eq(authoritativeAnalyticsEvents.publicationId, query.publicationId)
              : undefined,
            query.contentHash
              ? eq(authoritativeAnalyticsEvents.contentHash, query.contentHash)
              : undefined,
            query.audienceSegmentId
              ? eq(authoritativeAnalyticsEvents.audienceSegmentId, query.audienceSegmentId)
              : undefined,
            query.locale
              ? eq(sql`${authoritativeAnalyticsEvents.props} ->> 'locale'`, query.locale)
              : undefined,
            query.from
              ? gte(authoritativeAnalyticsEvents.occurredAt, new Date(query.from))
              : undefined,
            gte(authoritativeAnalyticsEvents.occurredAt, retentionCutoff),
            query.to ? lte(authoritativeAnalyticsEvents.occurredAt, new Date(query.to)) : undefined,
          ),
        )
        .groupBy(
          authoritativeAnalyticsEvents.workspaceId,
          authoritativeAnalyticsEvents.environmentId,
          authoritativeAnalyticsEvents.documentId,
          authoritativeAnalyticsEvents.publicationId,
          authoritativeAnalyticsEvents.contentHash,
          authoritativeAnalyticsEvents.pointerGeneration,
          authoritativeAnalyticsEvents.experimentId,
          authoritativeAnalyticsEvents.experimentArmId,
          authoritativeAnalyticsEvents.experimentAllocationRevision,
          ...(includeAudienceSegments
            ? [
                authoritativeAnalyticsEvents.audienceSegmentId,
                authoritativeAnalyticsEvents.audienceSegmentDefinitionVersion,
                authoritativeAnalyticsEvents.audienceSegmentRuleCount,
              ]
            : []),
          authoritativeAnalyticsEvents.name,
          targetResolutionStatus,
          contentLocale,
        )
        .orderBy(
          desc(sql`count(*)`),
          desc(sql`max(${authoritativeAnalyticsEvents.occurredAt})`),
          asc(authoritativeAnalyticsEvents.name),
        )
        .limit(query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT);

      return rows.map((row) => {
        const dimensions = {
          workspaceId: row.workspaceId,
          environmentId: row.environmentId,
          documentId: row.documentId,
          publicationId: row.publicationId,
          contentHash: row.contentHash,
          pointerGeneration: row.pointerGeneration,
          ...(row.experimentId
            ? {
                experimentId: row.experimentId,
                armId: row.experimentArmId as 'A' | 'B' | 'C' | 'D',
                experimentAllocationRevision: row.experimentAllocationRevision!,
              }
            : {}),
          ...(row.audienceSegmentId
            ? {
                audienceSegment: {
                  id: row.audienceSegmentId,
                  definitionVersion: row.audienceSegmentDefinitionVersion as 1,
                  ruleCount: row.audienceSegmentRuleCount!,
                },
              }
            : {}),
          count: row.count,
          firstTimestamp: toIsoString(row.firstTimestamp),
          lastTimestamp: toIsoString(row.lastTimestamp),
          ...(row.contentLocale ? { locale: row.contentLocale } : {}),
        };
        return row.name === 'target_resolution'
          ? {
              ...dimensions,
              name: 'target_resolution' as const,
              targetResolutionStatus: toAnalyticsTargetResolutionStatus(row.targetResolutionStatus),
            }
          : { ...dimensions, name: row.name };
      });
    });
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    return this.scoped(input.workspaceId, async (tx) => {
      if (!input.events.length) return 0;

      await tx.insert(events).values(
        input.events.map((event) => ({
          id: `evt_${randomUUID()}`,
          workspaceId: input.workspaceId,
          documentId: event.documentId ?? null,
          name: event.name,
          payload: event,
        })),
      );

      return input.events.length;
    });
  }
}

function engagementDedupeHash(
  workspaceId: string,
  environmentId: string,
  engagementKey: string,
): string {
  return `sha256-${createHash('sha256')
    .update(`${workspaceId}\0${environmentId}\0${engagementKey}`)
    .digest('hex')}`;
}
