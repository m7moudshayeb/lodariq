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
import {
  ANALYTICS_EVENT_PARTITION_MONTHS_AHEAD,
  ANALYTICS_EVENT_RETENTION_MONTHS,
  addUtcMonths,
  analyticsPartitionName,
  retentionCutoffMonth,
  upcomingPartitionMonths,
  type AnalyticsPartitionMaintenanceInput,
  type AnalyticsPartitionMaintenanceResult,
} from '../domains/analytics-partitions';

function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

export class DrizzleRepositoryAnalytics extends DrizzleRepositoryAuthoringSessions {
  /**
   * Creates upcoming monthly partitions and drops fully expired ones.
   *
   * DDL, so it runs unscoped — there is no tenant here, and a partition holds
   * every workspace's events for its month. Returns empty until `0041` makes
   * the table partitioned, so this is safe to ship ahead of that migration.
   */
  async maintainAnalyticsEventPartitions(
    input: AnalyticsPartitionMaintenanceInput,
  ): Promise<AnalyticsPartitionMaintenanceResult> {
    const now = new Date(input.now);
    if (!Number.isFinite(now.getTime())) throw new Error('partition maintenance now is invalid');
    const [partitioned] = resultRows(
      await this.database.execute(
        sql`select relkind = 'p' as partitioned from pg_class where relname = 'analytics_events'`,
      ),
    );
    if (partitioned?.partitioned !== true) return { created: [], dropped: [] };

    const created: string[] = [];
    for (const month of upcomingPartitionMonths(
      now,
      input.monthsAhead ?? ANALYTICS_EVENT_PARTITION_MONTHS_AHEAD,
    )) {
      const name = analyticsPartitionName(month);
      const upperBound = addUtcMonths(month, 1);
      await this.database.execute(
        sql`create table if not exists ${sql.identifier(name)}
            partition of analytics_events
            for values from (${month.toISOString()}) to (${upperBound.toISOString()})`,
      );
      await this.applyPartitionRowSecurity(name);
      created.push(name);
    }

    /*
     * Detach before drop. A drop alone takes an ACCESS EXCLUSIVE lock on the
     * parent for its duration, which stalls every insert; `detach concurrently`
     * does not, and the detached table then drops on its own.
     */
    const cutoff = retentionCutoffMonth(
      now,
      input.retentionMonths ?? ANALYTICS_EVENT_RETENTION_MONTHS,
    );
    const dropped: string[] = [];
    for (const name of await this.expiredPartitionNames(cutoff)) {
      await this.database.execute(
        sql`alter table analytics_events detach partition ${sql.identifier(name)} concurrently`,
      );
      await this.database.execute(sql`drop table if exists ${sql.identifier(name)}`);
      dropped.push(name);
    }
    return { created, dropped };
  }

  /**
   * A new partition inherits no row security, and a partition reached by its
   * own name enforces its own policies rather than the parent's. Without this,
   * every month created after `0041` would be readable across tenants by
   * anything holding SELECT on it.
   */
  private async applyPartitionRowSecurity(name: string): Promise<void> {
    const partition = sql.identifier(name);
    await this.database.execute(sql`alter table ${partition} enable row level security`);
    await this.database.execute(sql`alter table ${partition} force row level security`);
    /*
     * `create policy` has no `if not exists`, and this runs on every tick over
     * partitions that mostly already exist, so ask first.
     */
    const existing = new Set(
      resultRows(
        await this.database.execute(
          sql`select policyname from pg_policies
              where schemaname = current_schema() and tablename = ${name}`,
        ),
      )
        .map((row) => row.policyname)
        .filter((policy): policy is string => typeof policy === 'string'),
    );
    if (!existing.has('analytics_events_workspace_isolation')) {
      await this.database.execute(
        sql`create policy analytics_events_workspace_isolation on ${partition}
            for select using (workspace_id = current_setting('lodariq.workspace_id', true))`,
      );
    }
    if (!existing.has('analytics_events_workspace_insert')) {
      await this.database.execute(
        sql`create policy analytics_events_workspace_insert on ${partition}
            for insert with check (workspace_id = current_setting('lodariq.workspace_id', true))`,
      );
    }
  }

  /**
   * Partitions whose entire range is older than the cutoff.
   *
   * Read from the catalog rather than by name arithmetic: a partition created
   * by hand, or with a different span, must not be missed or mis-parsed. The
   * DEFAULT partition has no bounds and is never returned.
   */
  private async expiredPartitionNames(cutoff: Date): Promise<string[]> {
    const rows = resultRows(
      await this.database.execute(
        sql`select child.relname as name,
                   pg_get_expr(child.relpartbound, child.oid) as bound
            from pg_inherits
            join pg_class parent on parent.oid = pg_inherits.inhparent
            join pg_class child on child.oid = pg_inherits.inhrelid
            where parent.relname = 'analytics_events'`,
      ),
    );
    const expired: string[] = [];
    for (const row of rows) {
      const name = typeof row.name === 'string' ? row.name : null;
      const bound = typeof row.bound === 'string' ? row.bound : '';
      if (!name || bound.includes('DEFAULT')) continue;
      const upper = /TO \('([^']+)'\)/u.exec(bound)?.[1];
      const upperBound = upper ? new Date(upper) : null;
      if (!upperBound || !Number.isFinite(upperBound.getTime())) continue;
      if (upperBound.getTime() <= cutoff.getTime()) expired.push(name);
    }
    return expired;
  }

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
