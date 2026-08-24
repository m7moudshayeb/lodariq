import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnalyticsExportKind, AnalyticsExportStatus } from '@lodariq/schema';
import { documents } from './documents';
import { environments } from './environments';
import { workspaces, users } from './identity';
import { publications } from './releases';

export const analyticsExportJobs = pgTable(
  'analytics_export_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    operationId: text('operation_id').notNull(),
    requestHash: text('request_hash').notNull(),
    kind: text('kind').$type<AnalyticsExportKind>().notNull(),
    status: text('status').$type<AnalyticsExportStatus>().notNull().default('queued'),
    definitionVersion: integer('definition_version').notNull().default(1),
    publicationId: text('publication_id'),
    contentHash: text('content_hash'),
    pointerGeneration: integer('pointer_generation'),
    retentionCutoff: timestamp('retention_cutoff', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    leaseWorkerId: text('lease_worker_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    filename: text('filename'),
    resultContentType: text('result_content_type'),
    resultByteLength: integer('result_byte_length'),
    resultContentHash: text('result_content_hash'),
    resultContentBase64: text('result_content_base64'),
    errorCode: text('error_code'),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    resultExpiresAt: timestamp('result_expires_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('analytics_export_jobs_workspace_operation_idx').on(
      table.workspaceId,
      table.operationId,
    ),
    uniqueIndex('analytics_export_jobs_workspace_id_idx').on(table.workspaceId, table.id),
    index('analytics_export_jobs_scope_created_idx').on(
      table.workspaceId,
      table.documentId,
      table.createdAt,
    ),
    index('analytics_export_jobs_claim_idx').on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    foreignKey({
      name: 'analytics_export_jobs_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'analytics_export_jobs_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'analytics_export_jobs_publication_scope_fk',
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
    check('analytics_export_jobs_id_check', sql`${table.id} ~ '^anx_[A-Za-z0-9_-]{20,}$'`),
    check(
      'analytics_export_jobs_operation_check',
      sql`${table.operationId} ~ '^anxop_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'analytics_export_jobs_request_hash_check',
      sql`${table.requestHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'analytics_export_jobs_kind_check',
      sql`${table.kind} in ('summary-csv','raw-events-jsonl')`,
    ),
    check(
      'analytics_export_jobs_status_check',
      sql`${table.status} in ('queued','processing','completed','failed','expired')`,
    ),
    check('analytics_export_jobs_version_check', sql`${table.definitionVersion} = 1`),
    check(
      'analytics_export_jobs_release_check',
      sql`(
        ${table.publicationId} is null and ${table.contentHash} is null and ${table.pointerGeneration} is null
      ) or (
        ${table.publicationId} is not null and
        ${table.contentHash} ~ '^sha256-[0-9a-f]{64}$' and
        ${table.pointerGeneration} >= 1
      )`,
    ),
    check(
      'analytics_export_jobs_attempt_check',
      sql`${table.attemptCount} between 0 and 3 and ${table.maxAttempts} between 1 and 3`,
    ),
    check(
      'analytics_export_jobs_lease_check',
      sql`(${table.leaseWorkerId} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check(
      'analytics_export_jobs_result_check',
      sql`(
        ${table.resultContentType} is null and
        ${table.filename} is null and
        ${table.resultByteLength} is null and
        ${table.resultContentHash} is null and
        ${table.resultContentBase64} is null
      ) or (
        ${table.resultContentType} is not null and
        char_length(${table.filename}) between 1 and 240 and
        ${table.resultByteLength} between 0 and 16777216 and
        ${table.resultContentHash} ~ '^sha256-[0-9a-f]{64}$' and
        ${table.resultContentBase64} is not null
      )`,
    ),
    check(
      'analytics_export_jobs_error_check',
      sql`${table.errorCode} is null or ${table.errorCode} in ('source_unavailable','result_too_large','generation_failed')`,
    ),
  ],
);

export const analyticsExportAuditEvents = pgTable(
  'analytics_export_audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    jobId: text('job_id').notNull(),
    eventType: text('event_type').notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    errorCode: text('error_code'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('analytics_export_audit_events_workspace_id_idx').on(table.workspaceId, table.id),
    index('analytics_export_audit_events_job_time_idx').on(
      table.workspaceId,
      table.jobId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'analytics_export_audit_events_job_scope_fk',
      columns: [table.workspaceId, table.jobId],
      foreignColumns: [analyticsExportJobs.workspaceId, analyticsExportJobs.id],
    }).onDelete('cascade'),
    check(
      'analytics_export_audit_events_type_check',
      sql`${table.eventType} in ('requested','completed','failed','downloaded','expired')`,
    ),
    check(
      'analytics_export_audit_events_error_check',
      sql`${table.errorCode} is null or ${table.errorCode} in ('source_unavailable','result_too_large','generation_failed')`,
    ),
  ],
);
