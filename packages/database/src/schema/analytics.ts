import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { AnalyticsEvent, AnalyticsEventProperties } from '@lodariq/schema';
import { documents } from './documents';
import { environments } from './environments';
import { workspaces } from './identity';
import { publications } from './releases';

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').references(() => environments.id, {
      onDelete: 'set null',
    }),
    documentId: text('document_id').references(() => documents.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    payload: jsonb('payload').$type<AnalyticsEvent | Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('events_workspace_created_idx').on(table.workspaceId, table.createdAt),
    index('events_document_idx').on(table.documentId),
  ],
);

/**
 * Server-authoritative SDK analytics. The legacy `events` table remains for
 * authenticated dashboard ingestion; SDK delivery identity is stored in
 * required columns and cannot be supplied through an opaque payload.
 */
export const authoritativeAnalyticsEvents = pgTable(
  'analytics_events',
  {
    /*
     * Not `.primaryKey()`: `0041` partitions this table by `occurred_at`, and
     * PostgreSQL requires the partition key in every unique constraint, so the
     * real key is `(id, occurred_at)`. Declared below. Nothing generates SQL
     * from this — no `onConflict` targets this table — but a single-column
     * declaration here would tell the next reader something false.
     */
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    publicationId: text('publication_id').notNull(),
    contentHash: text('content_hash').notNull(),
    pointerGeneration: integer('pointer_generation').notNull(),
    experimentId: text('experiment_id'),
    experimentArmId: text('experiment_arm_id'),
    experimentAllocationRevision: integer('experiment_allocation_revision'),
    audienceSegmentId: text('audience_segment_id'),
    audienceSegmentDefinitionVersion: integer('audience_segment_definition_version'),
    audienceSegmentRuleCount: integer('audience_segment_rule_count'),
    adaptiveVisitorKeyHash: text('adaptive_visitor_key_hash'),
    name: text('name').notNull(),
    stepId: text('step_id'),
    sdkVersion: text('sdk_version').notNull(),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    props: jsonb('props').$type<AnalyticsEventProperties>(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'analytics_events_pkey', columns: [table.id, table.occurredAt] }),
    foreignKey({
      name: 'analytics_events_publication_identity_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.publicationId,
        table.contentHash,
      ],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
        publications.contentHash,
      ],
    }).onDelete('restrict'),
    index('analytics_events_environment_occurred_idx').on(
      table.workspaceId,
      table.environmentId,
      table.occurredAt,
    ),
    index('analytics_events_document_occurred_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.occurredAt,
    ),
    index('analytics_events_publication_idx').on(
      table.workspaceId,
      table.environmentId,
      table.publicationId,
    ),
    index('analytics_events_experiment_occurred_idx').on(
      table.workspaceId,
      table.environmentId,
      table.experimentId,
      table.occurredAt,
    ),
    index('analytics_events_audience_segment_occurred_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.audienceSegmentId,
      table.occurredAt,
    ),
    index('analytics_events_adaptive_evidence_idx').on(
      table.workspaceId,
      table.environmentId,
      table.adaptiveVisitorKeyHash,
      table.name,
      table.occurredAt,
    ),
    index('analytics_events_warehouse_cursor_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.ingestedAt,
      table.id,
    ),
    index('analytics_events_document_time_idx').on(
      table.workspaceId,
      table.documentId,
      table.occurredAt,
    ),
    index('analytics_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    check(
      'analytics_events_content_hash_check',
      sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check('analytics_events_pointer_generation_check', sql`${table.pointerGeneration} >= 1`),
    check(
      'analytics_events_experiment_identity_check',
      sql`(
        ${table.experimentId} is null and
        ${table.experimentArmId} is null and
        ${table.experimentAllocationRevision} is null
      ) or (
        ${table.experimentId} is not null and
        ${table.experimentArmId} in ('A', 'B', 'C', 'D') and
        ${table.experimentAllocationRevision} >= 1
      )`,
    ),
    check(
      'analytics_events_audience_segment_identity_check',
      sql`(
        ${table.audienceSegmentId} is null and
        ${table.audienceSegmentDefinitionVersion} is null and
        ${table.audienceSegmentRuleCount} is null
      ) or (
        ${table.audienceSegmentId} ~ '^audseg_[0-9a-f]{64}$' and
        ${table.audienceSegmentDefinitionVersion} = 1 and
        ${table.audienceSegmentRuleCount} between 0 and 50
      )`,
    ),
    check(
      'analytics_events_name_check',
      sql`char_length(${table.name}) between 1 and 80 and ${table.name} ~ '^[a-z][a-z0-9_.-]*$'`,
    ),
    check(
      'analytics_events_adaptive_visitor_hash_check',
      sql`${table.adaptiveVisitorKeyHash} is null or ${table.adaptiveVisitorKeyHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'analytics_events_sdk_version_check',
      sql`char_length(${table.sdkVersion}) between 1 and 128`,
    ),
    check(
      'analytics_events_props_check',
      sql`${table.props} is null or jsonb_typeof(${table.props}) = 'object'`,
    ),
  ],
);
