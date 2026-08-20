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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { ExperimentArm } from '@lodariq/schema';
import { documents } from './documents';
import { users, workspaces } from './identity';

/**
 * What an experience is trying to change, and whether it did.
 *
 * One row per document: a success event is a property of the experience, not of
 * a publication, so it survives every release and the funnel stays comparable
 * across versions.
 */
export const experienceMeasurement = pgTable(
  'experience_measurement',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    successEventName: text('success_event_name'),
    successWindowDays: integer('success_window_days'),
    successLabel: text('success_label'),
    adaptiveEnabled: text('adaptive_enabled').notNull().default('false'),
    adaptiveMinimumOccurrences: integer('adaptive_minimum_occurrences').notNull().default(2),
    adaptiveLookbackDays: integer('adaptive_lookback_days').notNull().default(30),
    updatedByUserId: text('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('experience_measurement_workspace_document_idx').on(
      table.workspaceId,
      table.documentId,
    ),
    foreignKey({
      name: 'experience_measurement_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    check(
      'experience_measurement_success_event_check',
      sql`${table.successEventName} is null or ${table.successEventName} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      'experience_measurement_success_window_check',
      sql`(${table.successEventName} is null) = (${table.successWindowDays} is null)
        and (${table.successWindowDays} is null or ${table.successWindowDays} in (1, 7, 14, 30, 90))`,
    ),
    check(
      'experience_measurement_adaptive_enabled_check',
      sql`${table.adaptiveEnabled} in ('true', 'false')`,
    ),
    check(
      'experience_measurement_adaptive_bounds_check',
      sql`${table.adaptiveMinimumOccurrences} between 1 and 20
        and ${table.adaptiveLookbackDays} between 1 and 365`,
    ),
  ],
);

/**
 * At most one live experiment per document — two arms of one experience consume
 * one slot, and a second concurrent test on the same surface makes neither
 * readable. The partial unique index is what enforces that.
 */
export const experienceExperiments = pgTable(
  'experience_experiments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    status: text('status').notNull().default('draft'),
    varies: text('varies').notNull(),
    successEventName: text('success_event_name').notNull(),
    arms: jsonb('arms').$type<ExperimentArm[]>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    promotedArmId: text('promoted_arm_id'),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('experience_experiments_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('experience_experiments_live_idx')
      .on(table.workspaceId, table.documentId)
      .where(sql`status in ('draft', 'running')`),
    foreignKey({
      name: 'experience_experiments_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    check('experience_experiments_id_check', sql`${table.id} ~ '^exp_[A-Za-z0-9_-]{8,}$'`),
    check(
      'experience_experiments_status_check',
      sql`${table.status} in ('draft', 'running', 'stopped', 'promoted')`,
    ),
    check(
      'experience_experiments_varies_check',
      sql`${table.varies} in ('copy', 'placement', 'style', 'media')`,
    ),
    check(
      'experience_experiments_success_event_check',
      sql`${table.successEventName} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      'experience_experiments_arms_check',
      sql`jsonb_typeof(${table.arms}) = 'array'
        and jsonb_array_length(${table.arms}) between 2 and 4`,
    ),
    check(
      'experience_experiments_promotion_check',
      sql`(${table.status} = 'promoted') = (${table.promotedArmId} is not null)`,
    ),
    check(
      'experience_experiments_promoted_arm_check',
      sql`${table.promotedArmId} is null or ${table.promotedArmId} in ('A', 'B', 'C', 'D')`,
    ),
  ],
);

/**
 * Answers to fields inside an experience.
 *
 * Stored apart from `analytics_events` on purpose: an answer is customer text,
 * not telemetry, so it gets its own table, its own retention, and a length cap
 * rather than being smuggled through an event payload.
 */
export const experienceFormResponses = pgTable(
  'experience_form_responses',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    stepId: text('step_id').notNull(),
    blockId: text('block_id').notNull(),
    label: text('label').notNull(),
    answer: text('answer').notNull(),
    correlationId: text('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('experience_form_responses_workspace_id_idx').on(table.workspaceId, table.id),
    index('experience_form_responses_document_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.occurredAt,
    ),
    index('experience_form_responses_block_idx').on(
      table.workspaceId,
      table.documentId,
      table.blockId,
    ),
    check(
      'experience_form_responses_answer_check',
      sql`char_length(${table.answer}) between 1 and 2000`,
    ),
    check(
      'experience_form_responses_label_check',
      sql`char_length(${table.label}) between 1 and 200`,
    ),
  ],
);

/** Review that happens on the step instead of in a chat thread (§15.2). */
export const experienceComments = pgTable(
  'experience_comments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    stepId: text('step_id').notNull(),
    body: text('body').notNull(),
    authorUserId: text('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('experience_comments_workspace_id_idx').on(table.workspaceId, table.id),
    index('experience_comments_document_created_idx').on(
      table.workspaceId,
      table.documentId,
      table.createdAt,
    ),
    foreignKey({
      name: 'experience_comments_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    check('experience_comments_id_check', sql`${table.id} ~ '^cmt_[A-Za-z0-9_-]{8,}$'`),
    check('experience_comments_body_check', sql`char_length(${table.body}) between 1 and 2000`),
    check(
      'experience_comments_resolution_check',
      sql`(${table.resolvedAt} is null) = (${table.resolvedByUserId} is null)`,
    ),
  ],
);

/**
 * A soft lease on one step, not a lock on the document (§15.1). It expires on
 * its own so a closed laptop never blocks a colleague; the heartbeat extends it.
 */
export const experienceStepLocks = pgTable(
  'experience_step_locks',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    stepId: text('step_id').notNull(),
    holderUserId: text('holder_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    holderName: text('holder_name').notNull(),
    sessionId: text('session_id').notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('experience_step_locks_step_idx').on(
      table.workspaceId,
      table.documentId,
      table.stepId,
    ),
    index('experience_step_locks_expiry_idx').on(table.expiresAt),
    foreignKey({
      name: 'experience_step_locks_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    check('experience_step_locks_window_check', sql`${table.expiresAt} > ${table.acquiredAt}`),
  ],
);

/**
 * One application is one brand theme plus one content library. Origins are
 * patterns because several hostnames commonly serve the same application.
 */
export const workspaceApplications = pgTable(
  'workspace_applications',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    originPatterns: jsonb('origin_patterns').$type<string[]>().notNull(),
    themeId: text('theme_id'),
    isPrimary: text('is_primary').notNull().default('false'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'workspace_applications_workspace_id_pk',
      columns: [table.workspaceId, table.id],
    }),
    uniqueIndex('workspace_applications_primary_idx')
      .on(table.workspaceId)
      .where(sql`is_primary = 'true'`),
    check(
      'workspace_applications_id_check',
      sql`${table.id} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'`,
    ),
    check('workspace_applications_name_check', sql`char_length(${table.name}) between 1 and 160`),
    check('workspace_applications_is_primary_check', sql`${table.isPrimary} in ('true', 'false')`),
    check(
      'workspace_applications_origins_check',
      sql`jsonb_typeof(${table.originPatterns}) = 'array'
        and jsonb_array_length(${table.originPatterns}) between 1 and 32`,
    ),
  ],
);
