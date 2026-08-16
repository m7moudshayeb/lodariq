import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { authIdentities, ssoConnections, users, workspaces } from './identity';
import { timestamps } from './shared';

export const enterpriseValidationEvidence = pgTable(
  'enterprise_validation_evidence',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => ssoConnections.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    protocol: text('protocol').notNull(),
    evidenceReference: text('evidence_reference').notNull(),
    validatedBy: text('validated_by').notNull(),
    validatedAt: timestamp('validated_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('enterprise_validation_evidence_connection_target_idx').on(
      table.connectionId,
      table.target,
      table.protocol,
    ),
    index('enterprise_validation_evidence_workspace_idx').on(table.workspaceId),
    check('enterprise_validation_evidence_id_check', sql`${table.id} ~ '^ssoevidence_[A-Za-z0-9_-]{16,}$'`),
    check('enterprise_validation_evidence_target_check', sql`${table.target} in ('okta', 'entra')`),
    check('enterprise_validation_evidence_protocol_check', sql`${table.protocol} in ('oidc', 'saml')`),
    check('enterprise_validation_evidence_reference_check', sql`char_length(${table.evidenceReference}) between 8 and 512`),
    check('enterprise_validation_evidence_actor_check', sql`char_length(${table.validatedBy}) between 3 and 256`),
  ],
);

export const workspaceVerifiedDomains = pgTable(
  'workspace_verified_domains',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => ssoConnections.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    status: text('status').notNull().default('pending'),
    verificationTokenHash: text('verification_token_hash').notNull(),
    verificationRecordName: text('verification_record_name').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('workspace_verified_domains_domain_idx').on(table.domain),
    index('workspace_verified_domains_workspace_idx').on(table.workspaceId),
    index('workspace_verified_domains_connection_idx').on(table.connectionId),
    check('workspace_verified_domains_id_check', sql`${table.id} ~ '^ssodomain_[A-Za-z0-9_-]{16,}$'`),
    check('workspace_verified_domains_domain_check', sql`${table.domain} = lower(${table.domain}) and char_length(${table.domain}) between 3 and 253`),
    check('workspace_verified_domains_status_check', sql`${table.status} in ('pending', 'verified', 'disabled')`),
    check('workspace_verified_domains_hash_check', sql`${table.verificationTokenHash} ~ '^[0-9a-f]{64}$'`),
    check('workspace_verified_domains_verified_check', sql`${table.status} <> 'verified' or ${table.verifiedAt} is not null`),
  ],
);

export const ssoGroupRoleMappings = pgTable(
  'sso_group_role_mappings',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => ssoConnections.id, { onDelete: 'cascade' }),
    groupId: text('group_id').notNull(),
    role: text('role').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sso_group_role_mappings_connection_group_idx').on(table.connectionId, table.groupId),
    index('sso_group_role_mappings_workspace_idx').on(table.workspaceId),
    check('sso_group_role_mappings_id_check', sql`${table.id} ~ '^ssogroup_[A-Za-z0-9_-]{16,}$'`),
    check('sso_group_role_mappings_group_check', sql`char_length(${table.groupId}) between 1 and 512`),
    check('sso_group_role_mappings_role_check', sql`${table.role} in ('admin', 'member', 'viewer')`),
  ],
);

export const enterpriseScimConnections = pgTable(
  'enterprise_scim_connections',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => ssoConnections.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    status: text('status').notNull().default('active'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('enterprise_scim_connections_hash_idx').on(table.tokenHash),
    index('enterprise_scim_connections_workspace_idx').on(table.workspaceId),
    check('enterprise_scim_connections_id_check', sql`${table.id} ~ '^scim_[A-Za-z0-9_-]{16,}$'`),
    check('enterprise_scim_connections_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('enterprise_scim_connections_prefix_check', sql`${table.tokenPrefix} ~ '^lq_scim_[A-Za-z0-9_-]{6,16}$'`),
    check('enterprise_scim_connections_status_check', sql`${table.status} in ('active', 'disabled')`),
  ],
);

export const enterprisePrincipals = pgTable(
  'enterprise_principals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => ssoConnections.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject'),
    active: boolean('active').notNull().default(true),
    deprovisionedAt: timestamp('deprovisioned_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('enterprise_principals_connection_external_idx').on(table.connectionId, table.externalId),
    uniqueIndex('enterprise_principals_workspace_user_idx').on(table.workspaceId, table.userId),
    uniqueIndex('enterprise_principals_connection_subject_idx')
      .on(table.connectionId, table.subject)
      .where(sql`${table.subject} is not null`),
    index('enterprise_principals_user_idx').on(table.userId),
    check('enterprise_principals_id_check', sql`${table.id} ~ '^ssoprincipal_[A-Za-z0-9_-]{16,}$'`),
    check('enterprise_principals_external_id_check', sql`char_length(${table.externalId}) between 1 and 512`),
    check('enterprise_principals_issuer_check', sql`char_length(${table.issuer}) between 8 and 2048`),
    check('enterprise_principals_subject_check', sql`${table.subject} is null or char_length(${table.subject}) between 1 and 1024`),
    check('enterprise_principals_deprovision_check', sql`${table.active} or ${table.deprovisionedAt} is not null`),
  ],
);

export const enterpriseAuditEvents = pgTable(
  'enterprise_audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    connectionId: text('connection_id').references(() => ssoConnections.id, {
      onDelete: 'set null',
    }),
    targetUserId: text('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    correlationId: text('correlation_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, string | boolean | number | null>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('enterprise_audit_events_workspace_time_idx').on(table.workspaceId, table.occurredAt),
    check('enterprise_audit_events_id_check', sql`${table.id} ~ '^ssoevt_[A-Za-z0-9_-]{16,}$'`),
    check('enterprise_audit_events_type_check', sql`${table.eventType} in ('sso_connection_created','sso_connection_validated','sso_connection_disabled','workspace_auth_policy_updated','domain_verification_started','domain_verified','group_role_mapping_updated','scim_token_created','scim_token_disabled','scim_user_provisioned','scim_user_updated','scim_user_deprovisioned','enterprise_sso_authenticated','enterprise_sso_user_provisioned','break_glass_requested','break_glass_approved','break_glass_consumed')`),
    check('enterprise_audit_events_correlation_check', sql`${table.correlationId} ~ '^[A-Za-z0-9_-]{8,128}$'`),
    check('enterprise_audit_events_metadata_check', sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const enterpriseBreakGlassRequests = pgTable(
  'enterprise_break_glass_requests',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedByUserId: text('approved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    status: text('status').notNull().default('pending_approval'),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('enterprise_break_glass_workspace_idx').on(table.workspaceId, table.createdAt),
    check('enterprise_break_glass_id_check', sql`${table.id} ~ '^breakglass_[A-Za-z0-9_-]{16,}$'`),
    check('enterprise_break_glass_status_check', sql`${table.status} in ('pending_approval','approved','consumed','expired','rejected')`),
    check('enterprise_break_glass_reason_check', sql`char_length(${table.reason}) between 20 and 1000`),
    check('enterprise_break_glass_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
    check('enterprise_break_glass_separation_check', sql`${table.approvedByUserId} is null or ${table.approvedByUserId} <> ${table.requestedByUserId}`),
    check('enterprise_break_glass_approval_check', sql`${table.status} = 'pending_approval' or (${table.approvedByUserId} is not null and ${table.approvedAt} is not null)`),
    check('enterprise_break_glass_consumption_check', sql`${table.status} <> 'consumed' or ${table.consumedAt} is not null`),
  ],
);

// Referenced from assurance queries to ensure an enterprise identity is bound to
// the same immutable issuer/subject pair as the authenticated session.
export const enterpriseIdentityBindings = authIdentities;
