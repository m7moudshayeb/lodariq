import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
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
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    publicationId: text('publication_id').notNull(),
    contentHash: text('content_hash').notNull(),
    pointerGeneration: integer('pointer_generation').notNull(),
    name: text('name').notNull(),
    stepId: text('step_id'),
    sdkVersion: text('sdk_version').notNull(),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    props: jsonb('props').$type<AnalyticsEventProperties>(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
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
    check(
      'analytics_events_content_hash_check',
      sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check('analytics_events_pointer_generation_check', sql`${table.pointerGeneration} >= 1`),
    check(
      'analytics_events_name_check',
      sql`char_length(${table.name}) between 1 and 80 and ${table.name} ~ '^[a-z][a-z0-9_.-]*$'`,
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
