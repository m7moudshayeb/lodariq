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
import { environments } from './environments';
import { documents } from './documents';
import { publications } from './releases';
import { users, workspaces } from './identity';

export const deploymentSchedules = pgTable(
  'deployment_schedules',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    publicationId: text('publication_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    contentHash: text('content_hash').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    expectedGeneration: integer('expected_generation').notNull(),
    status: text('status')
      .$type<'scheduled' | 'active' | 'completed' | 'cancelled' | 'failed'>()
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    revision: integer('revision').notNull().default(1),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('deployment_schedules_idempotency_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.idempotencyKey,
    ),
    uniqueIndex('deployment_schedules_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'deployment_schedules_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'deployment_schedules_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'deployment_schedules_publication_scope_fk',
      columns: [table.workspaceId, table.environmentId, table.documentId, table.publicationId],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
      ],
    }).onDelete('restrict'),
    index('deployment_schedules_due_idx').on(table.status, table.startAt),
    index('deployment_schedules_document_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.createdAt,
    ),
    check('deployment_schedules_generation_check', sql`${table.expectedGeneration} >= 0`),
    check('deployment_schedules_revision_check', sql`${table.revision} >= 1`),
    check(
      'deployment_schedules_status_check',
      sql`${table.status} in ('scheduled','active','completed','cancelled','failed')`,
    ),
    check(
      'deployment_schedules_time_check',
      sql`${table.endAt} is null or (${table.endAt} > ${table.startAt} and ${table.endAt} <= ${table.startAt} + interval '366 days')`,
    ),
    check(
      'deployment_schedules_hash_check',
      sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$' and ${table.requestHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'deployment_schedules_idempotency_check',
      sql`${table.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'`,
    ),
  ],
);

export const deliveryScheduleJobs = pgTable(
  'delivery_schedule_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    scheduleId: text('schedule_id').notNull(),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    publicationId: text('publication_id').notNull(),
    transition: text('transition').$type<'start' | 'end'>().notNull(),
    status: text('status')
      .$type<'pending' | 'leased' | 'completed' | 'failed' | 'cancelled'>()
      .notNull(),
    expectedGeneration: integer('expected_generation'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(8),
    leaseOwner: text('lease_owner'),
    leaseVersion: integer('lease_version').notNull().default(0),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    resultGeneration: integer('result_generation'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('delivery_schedule_jobs_schedule_transition_idx').on(
      table.workspaceId,
      table.scheduleId,
      table.transition,
    ),
    uniqueIndex('delivery_schedule_jobs_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'delivery_schedule_jobs_schedule_scope_fk',
      columns: [table.workspaceId, table.scheduleId],
      foreignColumns: [deploymentSchedules.workspaceId, deploymentSchedules.id],
    }).onDelete('cascade'),
    index('delivery_schedule_jobs_due_idx').on(table.status, table.availableAt, table.createdAt),
    index('delivery_schedule_jobs_document_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
    ),
    check('delivery_schedule_jobs_transition_check', sql`${table.transition} in ('start','end')`),
    check(
      'delivery_schedule_jobs_status_check',
      sql`${table.status} in ('pending','leased','completed','failed','cancelled')`,
    ),
    check(
      'delivery_schedule_jobs_attempts_check',
      sql`${table.attempts} between 0 and ${table.maxAttempts} and ${table.maxAttempts} between 1 and 20`,
    ),
    check(
      'delivery_schedule_jobs_lease_check',
      sql`(${table.status} = 'leased' and ${table.leaseOwner} is not null and ${table.leasedUntil} is not null)
        or (${table.status} <> 'leased' and ${table.leaseOwner} is null and ${table.leasedUntil} is null)`,
    ),
    check(
      'delivery_schedule_jobs_generation_check',
      sql`${table.expectedGeneration} is null or ${table.expectedGeneration} >= 0`,
    ),
  ],
);

export const deliveryTransitionHistory = pgTable(
  'delivery_transition_history',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    scheduleId: text('schedule_id').notNull(),
    jobId: text('job_id').notNull(),
    transition: text('transition').$type<'start' | 'end'>().notNull(),
    outcome: text('outcome').$type<'applied' | 'conflict' | 'failed'>().notNull(),
    fromGeneration: integer('from_generation').notNull(),
    toGeneration: integer('to_generation').notNull(),
    fromPublicationId: text('from_publication_id'),
    toPublicationId: text('to_publication_id'),
    reasonCode: text('reason_code'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('delivery_transition_history_job_idx').on(table.workspaceId, table.jobId),
    foreignKey({
      name: 'delivery_transition_history_schedule_scope_fk',
      columns: [table.workspaceId, table.scheduleId],
      foreignColumns: [deploymentSchedules.workspaceId, deploymentSchedules.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'delivery_transition_history_job_scope_fk',
      columns: [table.workspaceId, table.jobId],
      foreignColumns: [deliveryScheduleJobs.workspaceId, deliveryScheduleJobs.id],
    }).onDelete('restrict'),
    index('delivery_transition_history_document_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.occurredAt,
    ),
    check(
      'delivery_transition_history_transition_check',
      sql`${table.transition} in ('start','end')`,
    ),
    check(
      'delivery_transition_history_outcome_check',
      sql`${table.outcome} in ('applied','conflict','failed')`,
    ),
    check(
      'delivery_transition_history_generation_check',
      sql`${table.fromGeneration} >= 0 and ${table.toGeneration} >= 0`,
    ),
  ],
);

export const workspaceDataCatalogEntries = pgTable(
  'workspace_data_catalog_entries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    source: text('source').$type<'identify_trait' | 'track_event'>().notNull(),
    key: text('key').notNull(),
    valueType: text('value_type').notNull(),
    catalogVersion: integer('catalog_version').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workspace_data_catalog_entries_identity_idx').on(
      table.workspaceId,
      table.environmentId,
      table.source,
      table.key,
    ),
    foreignKey({
      name: 'workspace_data_catalog_entries_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    index('workspace_data_catalog_entries_workspace_version_idx').on(
      table.workspaceId,
      table.catalogVersion,
    ),
    check(
      'workspace_data_catalog_entries_source_check',
      sql`${table.source} in ('identify_trait','track_event')`,
    ),
    check(
      'workspace_data_catalog_entries_value_type_check',
      sql`${table.valueType} in ('string','number','boolean','date','enum','unknown')`,
    ),
    check('workspace_data_catalog_entries_version_check', sql`${table.catalogVersion} >= 1`),
  ],
);
