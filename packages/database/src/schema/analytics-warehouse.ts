import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { environments } from './environments';
import { users, workspaces } from './identity';
import { timestamps } from './shared';

export const analyticsWarehouseDestinations = pgTable(
  'analytics_warehouse_destinations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id'),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    credentialReference: text('credential_reference').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    revision: integer('revision').notNull().default(1),
    operationId: text('operation_id').notNull(),
    requestHash: text('request_hash').notNull(),
    checkpointIngestedAt: timestamp('checkpoint_ingested_at', { withTimezone: true }),
    checkpointEventId: text('checkpoint_event_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    leaseWorkerId: text('lease_worker_id'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    deadLetterReason: text('dead_letter_reason'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('analytics_warehouse_destinations_workspace_id_idx').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('analytics_warehouse_destinations_operation_idx').on(
      table.workspaceId,
      table.operationId,
    ),
    uniqueIndex('analytics_warehouse_destinations_name_idx').on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index('analytics_warehouse_destinations_worker_idx').on(
      table.enabled,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    foreignKey({
      name: 'analytics_warehouse_destinations_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'analytics_warehouse_destinations_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    check(
      'analytics_warehouse_destinations_id_check',
      sql`${table.id} ~ '^whdest_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'analytics_warehouse_destinations_name_check',
      sql`char_length(btrim(${table.name})) between 1 and 120`,
    ),
    check(
      'analytics_warehouse_destinations_provider_check',
      sql`${table.provider} ~ '^[a-z][a-z0-9-]{0,79}$'`,
    ),
    check(
      'analytics_warehouse_destinations_credential_check',
      sql`char_length(${table.credentialReference}) between 1 and 256 and ${table.credentialReference} ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'`,
    ),
    check('analytics_warehouse_destinations_revision_check', sql`${table.revision} >= 1`),
    check(
      'analytics_warehouse_destinations_request_hash_check',
      sql`${table.requestHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'analytics_warehouse_destinations_checkpoint_check',
      sql`(${table.checkpointIngestedAt} is null) = (${table.checkpointEventId} is null)`,
    ),
    check(
      'analytics_warehouse_destinations_attempt_check',
      sql`${table.attemptCount} between 0 and 8`,
    ),
    check(
      'analytics_warehouse_destinations_lease_check',
      sql`(${table.leaseWorkerId} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
);

export const analyticsWarehouseSyncRuns = pgTable(
  'analytics_warehouse_sync_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    destinationId: text('destination_id').notNull(),
    status: text('status').$type<'succeeded' | 'failed'>().notNull(),
    eventCount: integer('event_count').notNull(),
    batchHash: text('batch_hash'),
    providerBatchId: text('provider_batch_id'),
    checkpointIngestedAt: timestamp('checkpoint_ingested_at', { withTimezone: true }),
    checkpointEventId: text('checkpoint_event_id'),
    attemptCount: integer('attempt_count').notNull(),
    errorCode: text('error_code'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'analytics_warehouse_sync_runs_destination_scope_fk',
      columns: [table.workspaceId, table.destinationId],
      foreignColumns: [
        analyticsWarehouseDestinations.workspaceId,
        analyticsWarehouseDestinations.id,
      ],
    }).onDelete('cascade'),
    index('analytics_warehouse_sync_runs_destination_time_idx').on(
      table.workspaceId,
      table.destinationId,
      table.occurredAt,
    ),
    check(
      'analytics_warehouse_sync_runs_id_check',
      sql`${table.id} ~ '^whrun_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'analytics_warehouse_sync_runs_status_check',
      sql`${table.status} in ('succeeded','failed')`,
    ),
    check(
      'analytics_warehouse_sync_runs_event_count_check',
      sql`${table.eventCount} between 0 and 1000`,
    ),
    check(
      'analytics_warehouse_sync_runs_batch_hash_check',
      sql`${table.batchHash} is null or ${table.batchHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'analytics_warehouse_sync_runs_checkpoint_check',
      sql`(${table.checkpointIngestedAt} is null) = (${table.checkpointEventId} is null)`,
    ),
    check(
      'analytics_warehouse_sync_runs_attempt_check',
      sql`${table.attemptCount} between 1 and 8`,
    ),
  ],
);
