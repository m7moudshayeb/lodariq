import { sql } from 'drizzle-orm';
import {
  check,
  boolean,
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
import type { GovernanceCapability } from '@lodariq/schema';
import type { WebhookEventType } from '@lodariq/schema';
import type { DataResidencyMigrationStatus, DataResidencyRegion } from '@lodariq/schema';
import { environments } from './environments';
import { users, workspaceMemberships, workspaces } from './identity';
import { timestamps } from './shared';

const CAPABILITY_SET_SQL =
  '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage","audit:export","webhooks:manage","residency:manage"]';

export const governanceCapabilityProfiles = pgTable(
  'governance_capability_profiles',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseRole: text('base_role').notNull(),
    capabilities: jsonb('capabilities').$type<GovernanceCapability[]>().notNull(),
    revision: integer('revision').notNull().default(1),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('governance_capability_profiles_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('governance_capability_profiles_workspace_name_idx').on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index('governance_capability_profiles_workspace_idx').on(table.workspaceId),
    check('governance_capability_profiles_id_check', sql`${table.id} ~ '^gcp_[A-Za-z0-9_-]{20,}$'`),
    check(
      'governance_capability_profiles_name_check',
      sql`char_length(btrim(${table.name})) between 1 and 120`,
    ),
    check(
      'governance_capability_profiles_role_check',
      sql`${table.baseRole} in ('owner','admin','member','viewer')`,
    ),
    check('governance_capability_profiles_revision_check', sql`${table.revision} >= 1`),
    check(
      'governance_capability_profiles_capabilities_check',
      sql`jsonb_typeof(${table.capabilities}) = 'array'
        and jsonb_array_length(${table.capabilities}) between 0 and 14
        and ${table.capabilities} <@ ${sql.raw(`'${CAPABILITY_SET_SQL}'::jsonb`)}
        and jsonb_array_length(${table.capabilities}) =
          (case when ${table.capabilities} ? 'authoring:read' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'authoring:write' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'product-style:sample' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:publish' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:verify' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:approve' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:promote' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:schedule' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:rollback' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release:unpublish' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'release-policy:manage' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'audit:export' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'webhooks:manage' then 1 else 0 end)
          + (case when ${table.capabilities} ? 'residency:manage' then 1 else 0 end)
        and (${table.baseRole} <> 'viewer' or ${table.capabilities} = '[]'::jsonb)
        and (${table.baseRole} <> 'member' or ${table.capabilities} <@ '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:schedule"]'::jsonb)`,
    ),
  ],
);

export const governanceCapabilityProfileAssignments = pgTable(
  'governance_capability_profile_assignments',
  {
    workspaceId: text('workspace_id').notNull(),
    environmentId: text('environment_id').notNull(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    assignedByUserId: text('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.environmentId, table.userId] }),
    foreignKey({
      name: 'governance_profile_assignments_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'governance_profile_assignments_membership_scope_fk',
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'governance_profile_assignments_profile_scope_fk',
      columns: [table.workspaceId, table.profileId],
      foreignColumns: [governanceCapabilityProfiles.workspaceId, governanceCapabilityProfiles.id],
    }).onDelete('restrict'),
    index('governance_profile_assignments_profile_idx').on(table.workspaceId, table.profileId),
    index('governance_profile_assignments_user_idx').on(table.workspaceId, table.userId),
  ],
);

export const workspaceGovernanceCapabilityProfileAssignments = pgTable(
  'workspace_governance_capability_profile_assignments',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    assignedByUserId: text('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    foreignKey({
      name: 'workspace_governance_assignments_membership_scope_fk',
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'workspace_governance_assignments_profile_scope_fk',
      columns: [table.workspaceId, table.profileId],
      foreignColumns: [governanceCapabilityProfiles.workspaceId, governanceCapabilityProfiles.id],
    }).onDelete('restrict'),
    index('workspace_governance_assignments_profile_idx').on(table.workspaceId, table.profileId),
  ],
);

export const governanceAuditEvents = pgTable(
  'governance_audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    // 0036 owns the composite scope FK because its column-specific
    // `on delete set null (environment_id)` is not expressible in Drizzle 0.45.
    environmentId: text('environment_id'),
    resourceId: text('resource_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('governance_audit_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    check('governance_audit_events_id_check', sql`${table.id} ~ '^tenevt_[A-Za-z0-9_-]{20,}$'`),
    check(
      'governance_audit_events_type_check',
      sql`${table.eventType} in (
        'capability_profile_created', 'capability_profile_updated',
        'capability_profile_deleted', 'capability_profile_assigned',
        'capability_profile_unassigned', 'webhook_endpoint_created',
        'webhook_endpoint_disabled', 'webhook_endpoint_secret_rotated',
        'webhook_delivery_replayed',
        'residency_migration_requested', 'residency_migration_transitioned'
      )`,
    ),
  ],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    eventTypes: jsonb('event_types').$type<WebhookEventType[]>().notNull(),
    secretVersion: integer('secret_version').notNull().default(1),
    previousSecretVersion: integer('previous_secret_version'),
    secretOverlapUntil: timestamp('secret_overlap_until', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('webhook_endpoints_workspace_id_idx').on(table.workspaceId, table.id),
    index('webhook_endpoints_workspace_idx').on(table.workspaceId),
    check('webhook_endpoints_id_check', sql`${table.id} ~ '^whep_[A-Za-z0-9_-]{20,}$'`),
    check(
      'webhook_endpoints_url_check',
      sql`char_length(${table.url}) between 9 and 2048 and ${table.url} like 'https://%'`,
    ),
    check('webhook_endpoints_secret_version_check', sql`${table.secretVersion} >= 1`),
    check(
      'webhook_endpoints_secret_overlap_check',
      sql`(${table.previousSecretVersion} is null and ${table.secretOverlapUntil} is null)
        or (
          ${table.previousSecretVersion} is not null
          and ${table.secretOverlapUntil} is not null
          and ${table.previousSecretVersion} < ${table.secretVersion}
        )`,
    ),
    check(
      'webhook_endpoints_event_types_check',
      sql`jsonb_typeof(${table.eventTypes}) = 'array'
        and jsonb_array_length(${table.eventTypes}) between 1 and 6
        and ${table.eventTypes} <@ '["release.activated","release.rolled_back","release.unpublished","brand.drift_detected","governance.capability_profile_changed","residency.migration_changed"]'::jsonb
        and jsonb_array_length(${table.eventTypes}) =
          (case when ${table.eventTypes} ? 'release.activated' then 1 else 0 end)
          + (case when ${table.eventTypes} ? 'release.rolled_back' then 1 else 0 end)
          + (case when ${table.eventTypes} ? 'release.unpublished' then 1 else 0 end)
          + (case when ${table.eventTypes} ? 'brand.drift_detected' then 1 else 0 end)
          + (case when ${table.eventTypes} ? 'governance.capability_profile_changed' then 1 else 0 end)
          + (case when ${table.eventTypes} ? 'residency.migration_changed' then 1 else 0 end)`,
    ),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    schemaVersion: text('schema_version').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('webhook_events_workspace_id_idx').on(table.workspaceId, table.id),
    index('webhook_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    check('webhook_events_id_check', sql`${table.id} ~ '^whevt_[A-Za-z0-9_-]{20,}$'`),
    check('webhook_events_schema_version_check', sql`${table.schemaVersion} = '1'`),
    check(
      'webhook_events_type_check',
      sql`${table.eventType} in ('release.activated','release.rolled_back','release.unpublished','brand.drift_detected','governance.capability_profile_changed','residency.migration_changed')`,
    ),
    check('webhook_events_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    endpointId: text('endpoint_id').notNull(),
    eventId: text('event_id').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    leaseOwner: text('lease_owner'),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    lastResponseStatus: integer('last_response_status'),
    lastErrorCode: text('last_error_code'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('webhook_deliveries_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('webhook_deliveries_event_endpoint_idx').on(
      table.workspaceId,
      table.eventId,
      table.endpointId,
    ),
    foreignKey({
      name: 'webhook_deliveries_endpoint_scope_fk',
      columns: [table.workspaceId, table.endpointId],
      foreignColumns: [webhookEndpoints.workspaceId, webhookEndpoints.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'webhook_deliveries_event_scope_fk',
      columns: [table.workspaceId, table.eventId],
      foreignColumns: [webhookEvents.workspaceId, webhookEvents.id],
    }).onDelete('cascade'),
    index('webhook_deliveries_available_idx').on(table.status, table.availableAt),
    index('webhook_deliveries_workspace_idx').on(table.workspaceId, table.createdAt),
    index('webhook_deliveries_claimable_idx')
      .on(table.availableAt, table.createdAt, table.id)
      .where(sql`${table.status} in ('pending', 'delivering')`),
    check('webhook_deliveries_id_check', sql`${table.id} ~ '^whdel_[A-Za-z0-9_-]{20,}$'`),
    check(
      'webhook_deliveries_status_check',
      sql`${table.status} in ('pending','delivering','succeeded','dead')`,
    ),
    check('webhook_deliveries_attempts_check', sql`${table.attempts} between 0 and 8`),
    check(
      'webhook_deliveries_lease_check',
      sql`(${table.status} = 'delivering') = (${table.leaseOwner} is not null and ${table.leasedUntil} is not null)`,
    ),
  ],
);

export const dataResidencyMigrations = pgTable(
  'data_residency_migrations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sourceRegion: text('source_region').$type<DataResidencyRegion>().notNull(),
    targetRegion: text('target_region').$type<DataResidencyRegion>().notNull(),
    status: text('status').$type<DataResidencyMigrationStatus>().notNull(),
    expectedPlacementGeneration: integer('expected_placement_generation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    failureCode: text('failure_code'),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text('lease_owner'),
    leasedUntil: timestamp('leased_until', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('data_residency_migrations_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('data_residency_migrations_idempotency_idx').on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index('data_residency_migrations_workspace_time_idx').on(table.workspaceId, table.createdAt),
    index('data_residency_migrations_worker_idx').on(
      table.status,
      table.availableAt,
      table.leasedUntil,
    ),
    check('data_residency_migrations_id_check', sql`${table.id} ~ '^drmig_[A-Za-z0-9_-]{20,}$'`),
    check(
      'data_residency_migrations_region_check',
      sql`${table.sourceRegion} in ('us','eu','apac') and ${table.targetRegion} in ('us','eu','apac') and ${table.sourceRegion} <> ${table.targetRegion}`,
    ),
    check(
      'data_residency_migrations_status_check',
      sql`${table.status} in ('requested','copying','verifying','cutover-ready','completed','failed','cancelled')`,
    ),
    check(
      'data_residency_migrations_generation_check',
      sql`${table.expectedPlacementGeneration} >= 0`,
    ),
    check(
      'data_residency_migrations_idempotency_check',
      sql`char_length(${table.idempotencyKey}) between 8 and 200 and ${table.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'`,
    ),
    check(
      'data_residency_migrations_attempt_count_check',
      sql`${table.attemptCount} between 0 and 5`,
    ),
    check(
      'data_residency_migrations_lease_check',
      sql`(${table.leaseOwner} is null) = (${table.leasedUntil} is null)`,
    ),
  ],
);

export const dataResidencyMigrationEvidence = pgTable(
  'data_residency_migration_evidence',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    migrationId: text('migration_id').notNull(),
    phase: text('phase').$type<'copy' | 'verify' | 'cutover'>().notNull(),
    providerOperationId: text('provider_operation_id').notNull(),
    sourceDigest: text('source_digest').notNull(),
    targetDigest: text('target_digest').notNull(),
    recordCount: integer('record_count').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'data_residency_migration_evidence_scope_fk',
      columns: [table.workspaceId, table.migrationId],
      foreignColumns: [dataResidencyMigrations.workspaceId, dataResidencyMigrations.id],
    }).onDelete('cascade'),
    uniqueIndex('data_residency_migration_evidence_phase_idx').on(
      table.workspaceId,
      table.migrationId,
      table.phase,
    ),
    index('data_residency_migration_evidence_time_idx').on(
      table.workspaceId,
      table.migrationId,
      table.occurredAt,
    ),
    check(
      'data_residency_migration_evidence_id_check',
      sql`${table.id} ~ '^drproof_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'data_residency_migration_evidence_phase_check',
      sql`${table.phase} in ('copy','verify','cutover')`,
    ),
    check(
      'data_residency_migration_evidence_operation_check',
      sql`char_length(btrim(${table.providerOperationId})) between 1 and 256`,
    ),
    check(
      'data_residency_migration_evidence_digest_check',
      sql`${table.sourceDigest} ~ '^sha256-[0-9a-f]{64}$' and ${table.targetDigest} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check('data_residency_migration_evidence_record_count_check', sql`${table.recordCount} >= 0`),
  ],
);

export const workspaceDataPlacements = pgTable(
  'workspace_data_placements',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    region: text('region').$type<DataResidencyRegion>().notNull().default('us'),
    generation: integer('generation').notNull().default(0),
    activeMigrationId: text('active_migration_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'workspace_data_placements_active_migration_scope_fk',
      columns: [table.workspaceId, table.activeMigrationId],
      foreignColumns: [dataResidencyMigrations.workspaceId, dataResidencyMigrations.id],
    }).onDelete('restrict'),
    check('workspace_data_placements_region_check', sql`${table.region} in ('us','eu','apac')`),
    check('workspace_data_placements_generation_check', sql`${table.generation} >= 0`),
  ],
);

export const dataResidencyMigrationHistory = pgTable(
  'data_residency_migration_history',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    migrationId: text('migration_id').notNull(),
    previousStatus: text('previous_status').$type<DataResidencyMigrationStatus>(),
    nextStatus: text('next_status').$type<DataResidencyMigrationStatus>().notNull(),
    actorId: text('actor_id').notNull(),
    failureCode: text('failure_code'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'data_residency_migration_history_scope_fk',
      columns: [table.workspaceId, table.migrationId],
      foreignColumns: [dataResidencyMigrations.workspaceId, dataResidencyMigrations.id],
    }).onDelete('cascade'),
    index('data_residency_migration_history_migration_idx').on(
      table.workspaceId,
      table.migrationId,
      table.occurredAt,
    ),
    index('data_residency_migration_history_workspace_time_idx').on(
      table.workspaceId,
      table.occurredAt.desc(),
    ),
    check(
      'data_residency_migration_history_id_check',
      sql`${table.id} ~ '^drhist_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'data_residency_migration_history_status_check',
      sql`(${table.previousStatus} is null or ${table.previousStatus} in ('requested','copying','verifying','cutover-ready','completed','failed','cancelled')) and ${table.nextStatus} in ('requested','copying','verifying','cutover-ready','completed','failed','cancelled')`,
    ),
  ],
);
