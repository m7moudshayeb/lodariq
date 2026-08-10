import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  PRODUCT_STYLE_MAX_SOURCES,
  RENDERER_CONTRACT_VERSION,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
  type AuthoringActivationCapability,
  type AuthoringDocumentIntent,
  type AuthoringSessionCapability,
  type AuthoringProductMatchSourceReceipt,
  type BasicVisualPreflightReport,
  type BrowserVerificationReport,
  type BrandDriftAuditReport,
  type BrandThemeDefinition,
  type BrandThemeSnapshot,
  type CompiledDocument,
  type EnvironmentReleasePolicy,
  type LodariqDocument,
  type ProductStyleSource,
} from '@lodariq/schema';
import { AUTHORING_SESSION_CAPABILITIES_CHECK_SQL } from './authoring-session-capabilities';

const environmentValues = ['development', 'staging', 'production'] as const;
const documentDeploymentStateValues = ['active', 'inactive'] as const;
const releaseActionValues = ['publish', 'promote', 'rollback', 'unpublish'] as const;
const releaseOperationStatusValues = [
  'awaiting_approval',
  'activating',
  'completed',
  'failed',
] as const;

export const environmentEnum = pgEnum('lodariq_environment', environmentValues);
export const documentDeploymentStateEnum = pgEnum(
  'lodariq_document_deployment_state',
  documentDeploymentStateValues,
);
export const releaseActionEnum = pgEnum('lodariq_release_action', releaseActionValues);
export const releaseOperationStatusEnum = pgEnum(
  'lodariq_release_operation_status',
  releaseOperationStatusValues,
);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    // Nullable during the owned-auth expand/contract rollout. Existing external
    // identities remain rollback-only until an approved contract migration.
    legacyIdentityId: text('clerk_user_id').unique(),
    email: text('email').notNull(),
    name: text('name'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deliberately non-unique: a legacy duplicate must be detected and rejected
    // by the recovery repository, never hidden by an arbitrary LIMIT 1.
    index('users_email_normalized_lookup_idx').on(sql`lower(btrim(${table.email}))`),
  ],
);

export const workspaceMemberships = pgTable(
  'workspace_memberships',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_memberships_workspace_idx').on(table.workspaceId),
    check(
      'workspace_memberships_role_check',
      sql`${table.role} in ('owner', 'admin', 'member', 'viewer')`,
    ),
  ],
);

export const passwordCredentials = pgTable(
  'password_credentials',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    emailNormalized: text('email_normalized').notNull(),
    emailLookupHash: text('email_lookup_hash').notNull(),
    algorithm: text('algorithm').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_credentials_email_normalized_idx').on(table.emailNormalized),
    uniqueIndex('password_credentials_email_lookup_hash_idx').on(table.emailLookupHash),
    check('password_credentials_algorithm_check', sql`${table.algorithm} = 'argon2id-v1'`),
    check(
      'password_credentials_email_normalized_check',
      sql`char_length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      'password_credentials_lookup_hash_check',
      sql`${table.emailLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'password_credentials_encoding_check',
      sql`${table.passwordHash} ~ '^\\$argon2id\\$v=19\\$m=65536,p=1,t=3\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$'`,
    ),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    activeWorkspaceId: text('active_workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_hash_idx').on(table.tokenHash),
    index('auth_sessions_user_idx').on(table.userId),
    index('auth_sessions_expiry_idx').on(table.absoluteExpiresAt),
    check('auth_sessions_token_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('auth_sessions_id_check', sql`${table.id} ~ '^authsess_[A-Za-z0-9_-]{20,}$'`),
    check(
      'auth_sessions_expiry_order_check',
      sql`${table.createdAt} <= ${table.lastSeenAt}
        and ${table.lastSeenAt} < ${table.idleExpiresAt}
        and ${table.idleExpiresAt} <= ${table.absoluteExpiresAt}`,
    ),
  ],
);

export const emailVerificationChallenges = pgTable(
  'email_verification_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('email_verification_challenges_token_hash_idx').on(table.tokenHash),
    index('email_verification_challenges_user_idx').on(table.userId),
    index('email_verification_challenges_expires_idx').on(table.expiresAt),
    check(
      'email_verification_challenges_id_check',
      sql`${table.id} ~ '^verify_[A-Za-z0-9_-]{20,}$'`,
    ),
    check('email_verification_challenges_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'email_verification_challenges_expiry_check',
      sql`${table.createdAt} < ${table.expiresAt}`,
    ),
  ],
);

export const setPasswordChallenges = pgTable(
  'set_password_challenges',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    emailLookupHash: text('email_lookup_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('set_password_challenges_token_hash_idx').on(table.tokenHash),
    uniqueIndex('set_password_challenges_active_user_idx')
      .on(table.userId)
      .where(sql`${table.usedAt} is null`),
    index('set_password_challenges_user_idx').on(table.userId),
    index('set_password_challenges_expires_idx').on(table.expiresAt),
    check('set_password_challenges_id_check', sql`${table.id} ~ '^reset_[A-Za-z0-9_-]{20,}$'`),
    check('set_password_challenges_hash_check', sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'set_password_challenges_email_normalized_check',
      sql`char_length(${table.emailNormalized}) between 3 and 320 and ${table.emailNormalized} = lower(btrim(${table.emailNormalized}))`,
    ),
    check(
      'set_password_challenges_lookup_hash_check',
      sql`${table.emailLookupHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check('set_password_challenges_expiry_check', sql`${table.createdAt} < ${table.expiresAt}`),
  ],
);

export const authOutbox = pgTable(
  'auth_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload').$type<{ challengeId: string; verificationPath: string }>().notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    leaseVersion: integer('lease_version').notNull().default(0),
    lastError: text('last_error'),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('auth_outbox_available_idx').on(table.availableAt),
    index('auth_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    index('auth_outbox_user_idx').on(table.userId),
    check('auth_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('auth_outbox_type_check', sql`${table.type} = 'email_verification'`),
    check(
      'auth_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('auth_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check('auth_outbox_lease_version_check', sql`${table.leaseVersion} between 0 and 2147483647`),
    check(
      'auth_outbox_last_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check('auth_outbox_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check(
      'auth_outbox_delivery_payload_check',
      sql`${table.payload} ?& array['challengeId', 'verificationPath']
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'verificationPath') = 'string'
        and ${table.payload}->>'challengeId' ~ '^verify_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'verificationPath') between 1 and 2048`,
    ),
  ],
);

export const setPasswordOutbox = pgTable(
  'set_password_outbox',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    payload: jsonb('payload')
      .$type<{ purpose: 'set_password'; challengeId: string; resetPath: string }>()
      .notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    leaseVersion: integer('lease_version').notNull().default(0),
    lastError: text('last_error'),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('set_password_outbox_available_idx').on(table.availableAt),
    index('set_password_outbox_due_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`${table.processedAt} is null and ${table.terminalAt} is null and ${table.attempts} < 20`,
      ),
    index('set_password_outbox_user_idx').on(table.userId),
    check('set_password_outbox_id_check', sql`${table.id} ~ '^outbox_[A-Za-z0-9_-]{20,}$'`),
    check('set_password_outbox_type_check', sql`${table.type} = 'set_password'`),
    check(
      'set_password_outbox_recipient_check',
      sql`char_length(${table.recipientEmail}) between 3 and 320 and ${table.recipientEmail} = lower(btrim(${table.recipientEmail}))`,
    ),
    check('set_password_outbox_attempts_check', sql`${table.attempts} between 0 and 20`),
    check(
      'set_password_outbox_lease_version_check',
      sql`${table.leaseVersion} between 0 and 2147483647`,
    ),
    check(
      'set_password_outbox_last_error_check',
      sql`${table.lastError} is null or ${table.lastError} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      'set_password_outbox_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload} ?& array['purpose', 'challengeId', 'resetPath']
        and jsonb_typeof(${table.payload}->'purpose') = 'string'
        and jsonb_typeof(${table.payload}->'challengeId') = 'string'
        and jsonb_typeof(${table.payload}->'resetPath') = 'string'
        and ${table.payload}->>'purpose' = 'set_password'
        and ${table.payload}->>'challengeId' ~ '^reset_[A-Za-z0-9_-]{20,}$'
        and char_length(${table.payload}->>'resetPath') between 1 and 2048`,
    ),
  ],
);

export const authRateLimits = pgTable(
  'auth_rate_limits',
  {
    bucketHash: text('bucket_hash').primaryKey(),
    scope: text('scope').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('auth_rate_limits_updated_idx').on(table.updatedAt),
    check('auth_rate_limits_hash_check', sql`${table.bucketHash} ~ '^[0-9a-f]{64}$'`),
    check('auth_rate_limits_scope_check', sql`${table.scope} in ('sign-in', 'sign-up')`),
    check('auth_rate_limits_attempts_check', sql`${table.attempts} between 1 and 1000000`),
  ],
);

export const environments = pgTable(
  'environments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: environmentEnum('kind').notNull(),
    name: text('name').notNull(),
    originAllowlist: jsonb('origin_allowlist').$type<string[]>().notNull().default([]),
    requiredApprovalCount: integer('required_approval_count').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    pipelinePosition: integer('pipeline_position').notNull(),
    authoringEnabled: boolean('authoring_enabled').notNull(),
    promotionSourceEnvironmentId: text('promotion_source_environment_id'),
    releasePolicy: jsonb('release_policy_json').$type<EnvironmentReleasePolicy>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('environments_workspace_kind_idx').on(table.workspaceId, table.kind),
    uniqueIndex('environments_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('environments_workspace_pipeline_position_idx').on(
      table.workspaceId,
      table.pipelinePosition,
    ),
    index('environments_workspace_idx').on(table.workspaceId),
    foreignKey({
      name: 'environments_promotion_source_scope_fk',
      columns: [table.workspaceId, table.promotionSourceEnvironmentId],
      foreignColumns: [table.workspaceId, table.id],
    }).onDelete('restrict'),
    check(
      'environments_required_approval_count_check',
      sql`${table.requiredApprovalCount} between 0 and 1`,
    ),
    check(
      'environments_origin_allowlist_check',
      sql`public.lodariq_is_valid_origin_allowlist(${table.originAllowlist})`,
    ),
    check(
      'environments_pipeline_position_check',
      sql`(${table.kind} = 'development' and ${table.pipelinePosition} = 0)
        or (${table.kind} = 'staging' and ${table.pipelinePosition} = 1)
        or (${table.kind} = 'production' and ${table.pipelinePosition} = 2 and not ${table.authoringEnabled})`,
    ),
    check(
      'environments_promotion_source_kind_check',
      sql`(${table.kind} = 'production' and ${table.promotionSourceEnvironmentId} is not null)
        or (${table.kind} <> 'production' and ${table.promotionSourceEnvironmentId} is null)`,
    ),
    check(
      'environments_promotion_source_not_self_check',
      sql`${table.promotionSourceEnvironmentId} is null or ${table.promotionSourceEnvironmentId} <> ${table.id}`,
    ),
    check(
      'environments_release_policy_check',
      sql`jsonb_typeof(${table.releasePolicy}) = 'object'
        and (${table.releasePolicy} - array[
          'allowDirectPublish', 'requireSourceVerification', 'requiredApprovalCount',
          'publisherRoles', 'rollbackRoles', 'unpublishRoles', 'separationOfDuties'
        ]) = '{}'::jsonb
        and ${table.releasePolicy} ?& array[
          'allowDirectPublish', 'requireSourceVerification', 'requiredApprovalCount',
          'publisherRoles', 'rollbackRoles', 'unpublishRoles', 'separationOfDuties'
        ]
        and jsonb_typeof(${table.releasePolicy}->'allowDirectPublish') = 'boolean'
        and jsonb_typeof(${table.releasePolicy}->'requireSourceVerification') = 'boolean'
        and jsonb_typeof(${table.releasePolicy}->'requiredApprovalCount') = 'number'
        and ${table.releasePolicy}->>'requiredApprovalCount' in ('0', '1')
        and (${table.releasePolicy}->>'requiredApprovalCount')::integer = ${table.requiredApprovalCount}
        and jsonb_typeof(${table.releasePolicy}->'publisherRoles') = 'array'
        and jsonb_array_length(${table.releasePolicy}->'publisherRoles') between 1 and 3
        and ${table.releasePolicy}->'publisherRoles' <@ '["owner","admin","member"]'::jsonb
        and jsonb_array_length(${table.releasePolicy}->'publisherRoles') =
          (case when ${table.releasePolicy}->'publisherRoles' ? 'owner' then 1 else 0 end)
          + (case when ${table.releasePolicy}->'publisherRoles' ? 'admin' then 1 else 0 end)
          + (case when ${table.releasePolicy}->'publisherRoles' ? 'member' then 1 else 0 end)
        and jsonb_typeof(${table.releasePolicy}->'rollbackRoles') = 'array'
        and jsonb_array_length(${table.releasePolicy}->'rollbackRoles') between 1 and 2
        and ${table.releasePolicy}->'rollbackRoles' <@ '["owner","admin"]'::jsonb
        and jsonb_array_length(${table.releasePolicy}->'rollbackRoles') =
          (case when ${table.releasePolicy}->'rollbackRoles' ? 'owner' then 1 else 0 end)
          + (case when ${table.releasePolicy}->'rollbackRoles' ? 'admin' then 1 else 0 end)
        and jsonb_typeof(${table.releasePolicy}->'unpublishRoles') = 'array'
        and jsonb_array_length(${table.releasePolicy}->'unpublishRoles') between 1 and 2
        and ${table.releasePolicy}->'unpublishRoles' <@ '["owner","admin"]'::jsonb
        and jsonb_array_length(${table.releasePolicy}->'unpublishRoles') =
          (case when ${table.releasePolicy}->'unpublishRoles' ? 'owner' then 1 else 0 end)
          + (case when ${table.releasePolicy}->'unpublishRoles' ? 'admin' then 1 else 0 end)
        and jsonb_typeof(${table.releasePolicy}->'separationOfDuties') = 'object'
        and ((${table.releasePolicy}->'separationOfDuties') - array[
          'requireSeparateVerifier', 'requireSeparateApprover'
        ]) = '{}'::jsonb
        and ${table.releasePolicy}->'separationOfDuties' ?& array[
          'requireSeparateVerifier', 'requireSeparateApprover'
        ]
        and jsonb_typeof(${table.releasePolicy}->'separationOfDuties'->'requireSeparateVerifier') = 'boolean'
        and jsonb_typeof(${table.releasePolicy}->'separationOfDuties'->'requireSeparateApprover') = 'boolean'
        and (
          ${table.kind} <> 'production'
          or (
            not (${table.releasePolicy}->'publisherRoles' ? 'member')
            and not (${table.releasePolicy}->>'allowDirectPublish')::boolean
            and (${table.releasePolicy}->>'requireSourceVerification')::boolean
          )
        )`,
    ),
  ],
);

export const themes = pgTable(
  'themes',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: jsonb('draft_json').$type<BrandThemeDefinition>().notNull(),
    revision: integer('revision').notNull().default(1),
    isDefault: boolean('is_default').notNull().default(false),
    activeVersionId: text('active_version_id'),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: text('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('themes_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('themes_workspace_default_idx')
      .on(table.workspaceId)
      .where(sql`${table.isDefault} = true`),
    index('themes_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
    check('themes_name_check', sql`char_length(btrim(${table.name})) between 1 and 120`),
    check('themes_draft_json_check', sql`jsonb_typeof(${table.draft}) = 'object'`),
    check('themes_revision_check', sql`${table.revision} >= 1`),
    check(
      'themes_default_requires_approved_version_check',
      sql`not ${table.isDefault} or ${table.activeVersionId} is not null`,
    ),
  ],
);

export const themeVersions = pgTable(
  'theme_versions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    themeId: text('theme_id').notNull(),
    version: integer('version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    contractVersion: text('contract_version').notNull(),
    snapshot: jsonb('canonical_json').$type<BrandThemeSnapshot>().notNull(),
    contentHash: text('content_hash').notNull(),
    approvedByUserId: text('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'theme_versions_theme_scope_fk',
      columns: [table.workspaceId, table.themeId],
      foreignColumns: [themes.workspaceId, themes.id],
    }).onDelete('cascade'),
    uniqueIndex('theme_versions_workspace_theme_version_idx').on(
      table.workspaceId,
      table.themeId,
      table.version,
    ),
    uniqueIndex('theme_versions_workspace_theme_id_idx').on(
      table.workspaceId,
      table.themeId,
      table.id,
    ),
    uniqueIndex('theme_versions_workspace_id_idx').on(table.workspaceId, table.id),
    index('theme_versions_workspace_approved_idx').on(table.workspaceId, table.approvedAt),
    check('theme_versions_version_check', sql`${table.version} >= 1`),
    check(
      'theme_versions_canonical_json_check',
      sql`jsonb_typeof(${table.snapshot}) = 'object'
        and ${table.snapshot}->>'schemaVersion' = ${table.schemaVersion}
        and ${table.snapshot}->>'contractVersion' = ${table.contractVersion}
        and ${table.snapshot}->>'themeId' = ${table.themeId}
        and ${table.snapshot}->>'themeVersionId' = ${table.id}
        and (${table.snapshot}->>'version')::integer = ${table.version}
        and ${table.snapshot}->>'contentHash' = ${table.contentHash}`,
    ),
    check('theme_versions_content_hash_check', sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`),
  ],
);

/**
 * Immutable, sanitized product-style evidence captured during authenticated
 * authoring. Raw CSS, DOM snapshots, selectors, URLs, and coordinates never
 * belong in this record; the repository accepts only the bounded schema-owned
 * source payload and its server-verified content hash.
 */
export const styleSources = pgTable(
  'style_sources',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    themeId: text('theme_id').notNull(),
    environmentId: text('environment_id').notNull(),
    proposalId: text('proposal_id').notNull(),
    proposalHash: text('proposal_hash').notNull(),
    sourceOrdinal: integer('source_ordinal').notNull(),
    sourceCount: integer('source_count').notNull(),
    appliedThemeRevision: integer('applied_theme_revision').notNull(),
    draftChanged: boolean('draft_changed').notNull(),
    source: jsonb('source_json').$type<ProductStyleSource>().notNull(),
    sourceHash: text('source_hash').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('style_sources_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'style_sources_theme_scope_fk',
      columns: [table.workspaceId, table.themeId],
      foreignColumns: [themes.workspaceId, themes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'style_sources_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'style_sources_creator_membership_scope_fk',
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('restrict'),
    index('style_sources_theme_created_idx').on(table.workspaceId, table.themeId, table.createdAt),
    uniqueIndex('style_sources_proposal_source_idx').on(
      table.workspaceId,
      table.themeId,
      table.proposalId,
      table.sourceOrdinal,
    ),
    check(
      'style_sources_proposal_id_check',
      sql`${table.proposalId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'`,
    ),
    check(
      'style_sources_proposal_hash_check',
      sql`${table.proposalHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check('style_sources_source_ordinal_check', sql`${table.sourceOrdinal} >= 0`),
    check(
      'style_sources_source_count_check',
      sql`${table.sourceCount} between 1 and ${PRODUCT_STYLE_MAX_SOURCES}
        and ${table.sourceOrdinal} < ${table.sourceCount}`,
    ),
    check('style_sources_theme_revision_check', sql`${table.appliedThemeRevision} >= 1`),
    check('style_sources_source_json_check', sql`jsonb_typeof(${table.source}) = 'object'`),
    check('style_sources_source_hash_check', sql`${table.sourceHash} ~ '^sha256-[0-9a-f]{64}$'`),
  ],
);

/**
 * Immutable canonical receipt for one Product Match application. This stores
 * only approved semantic theme data plus server-owned source identities; raw
 * CSS, DOM, URLs, selectors, and coordinates are never accepted here.
 */
export const productStyleApplications = pgTable(
  'product_style_applications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    themeId: text('theme_id').notNull(),
    environmentId: text('environment_id').notNull(),
    proposalId: text('proposal_id').notNull(),
    requestHash: text('request_hash').notNull(),
    sourceSetHash: text('source_set_hash').notNull(),
    draftRevision: integer('draft_revision').notNull(),
    draftUpdatedAt: timestamp('draft_updated_at', { withTimezone: true }).notNull(),
    previewTheme: jsonb('preview_theme_json').$type<BrandThemeSnapshot>().notNull(),
    previewThemeHash: text('preview_theme_hash').notNull(),
    sourceReceipts: jsonb('source_receipts_json')
      .$type<AuthoringProductMatchSourceReceipt[]>()
      .notNull(),
    draftChanged: boolean('draft_changed').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_style_applications_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'product_style_applications_theme_scope_fk',
      columns: [table.workspaceId, table.themeId],
      foreignColumns: [themes.workspaceId, themes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'product_style_applications_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'product_style_applications_creator_membership_scope_fk',
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('restrict'),
    uniqueIndex('product_style_applications_proposal_idx').on(
      table.workspaceId,
      table.themeId,
      table.proposalId,
    ),
    index('product_style_applications_theme_created_idx').on(
      table.workspaceId,
      table.themeId,
      table.createdAt,
    ),
    check(
      'product_style_applications_proposal_id_check',
      sql`${table.proposalId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'`,
    ),
    check(
      'product_style_applications_request_hash_check',
      sql`${table.requestHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'product_style_applications_source_set_hash_check',
      sql`${table.sourceSetHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check('product_style_applications_draft_revision_check', sql`${table.draftRevision} >= 1`),
    check(
      'product_style_applications_preview_theme_check',
      sql`jsonb_typeof(${table.previewTheme}) = 'object'
        and ${table.previewTheme}->>'themeId' = ${table.themeId}
        and (${table.previewTheme}->>'version')::integer = ${table.draftRevision}
        and ${table.previewTheme}->>'contentHash' = ${table.previewThemeHash}`,
    ),
    check(
      'product_style_applications_preview_theme_hash_check',
      sql`${table.previewThemeHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'product_style_applications_source_receipts_check',
      sql`jsonb_typeof(${table.sourceReceipts}) = 'array'
        and jsonb_array_length(${table.sourceReceipts}) between 1 and ${PRODUCT_STYLE_MAX_SOURCES}`,
    ),
  ],
);

export const environmentTokens = pgTable(
  'environment_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    isSdkSnippetToken: boolean('is_sdk_snippet_token').notNull().default(true),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('environment_tokens_hash_idx').on(table.tokenHash),
    index('environment_tokens_workspace_idx').on(table.workspaceId),
    index('environment_tokens_environment_idx').on(table.environmentId),
  ],
);

export const publicSdkInstallations = pgTable(
  'public_sdk_installations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('public_sdk_installations_workspace_id_idx').on(table.workspaceId, table.id),
    index('public_sdk_installations_workspace_idx').on(table.workspaceId),
    index('public_sdk_installations_revoked_idx').on(table.revokedAt),
  ],
);

export const publicSdkInstallationOrigins = pgTable(
  'public_sdk_installation_origins',
  {
    installationId: text('installation_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    environmentId: text('environment_id').notNull(),
    exactOrigin: text('exact_origin').notNull(),
    authoringEnabled: boolean('authoring_enabled').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.installationId, table.exactOrigin] }),
    foreignKey({
      name: 'public_sdk_installation_origins_installation_scope_fk',
      columns: [table.workspaceId, table.installationId],
      foreignColumns: [publicSdkInstallations.workspaceId, publicSdkInstallations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'public_sdk_installation_origins_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    index('public_sdk_installation_origins_workspace_idx').on(table.workspaceId),
    index('public_sdk_installation_origins_environment_idx').on(
      table.workspaceId,
      table.environmentId,
    ),
  ],
);

export const publicSdkBootstrapGrants = pgTable(
  'public_sdk_bootstrap_grants',
  {
    id: text('id').primaryKey(),
    installationId: text('installation_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    environmentId: text('environment_id').notNull(),
    exactOrigin: text('exact_origin').notNull(),
    grantHash: text('grant_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('public_sdk_bootstrap_grants_hash_idx').on(table.grantHash),
    uniqueIndex('public_sdk_bootstrap_grants_id_hash_idx').on(table.id, table.grantHash),
    foreignKey({
      name: 'public_sdk_bootstrap_grants_installation_scope_fk',
      columns: [table.workspaceId, table.installationId],
      foreignColumns: [publicSdkInstallations.workspaceId, publicSdkInstallations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'public_sdk_bootstrap_grants_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'public_sdk_bootstrap_grants_origin_fk',
      columns: [table.installationId, table.exactOrigin],
      foreignColumns: [
        publicSdkInstallationOrigins.installationId,
        publicSdkInstallationOrigins.exactOrigin,
      ],
    }).onDelete('cascade'),
    index('public_sdk_bootstrap_grants_workspace_idx').on(table.workspaceId),
    index('public_sdk_bootstrap_grants_installation_expires_idx').on(
      table.installationId,
      table.expiresAt,
    ),
  ],
);

export const authoringAuthorizationRequests = pgTable(
  'authoring_authorization_requests',
  {
    id: text('id').primaryKey(),
    bootstrapGrantId: text('bootstrap_grant_id').notNull(),
    bootstrapGrantHash: text('bootstrap_grant_hash').notNull(),
    installationId: text('installation_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    environmentId: text('environment_id').notNull(),
    exactOrigin: text('exact_origin').notNull(),
    stateHash: text('state_hash').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
    requestedCapabilities: jsonb('requested_capabilities')
      .$type<AuthoringActivationCapability[]>()
      .notNull(),
    documentIntent: jsonb('document_intent').$type<AuthoringDocumentIntent>(),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'restrict' }),
    authorizationCodeHash: text('authorization_code_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    authorizationCodeExpiresAt: timestamp('authorization_code_expires_at', {
      withTimezone: true,
    }),
    authorizationCodeUsedAt: timestamp('authorization_code_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'authoring_authorization_requests_bootstrap_grant_fk',
      columns: [table.bootstrapGrantId, table.bootstrapGrantHash],
      foreignColumns: [publicSdkBootstrapGrants.id, publicSdkBootstrapGrants.grantHash],
    }).onDelete('cascade'),
    foreignKey({
      name: 'authoring_authorization_requests_installation_scope_fk',
      columns: [table.workspaceId, table.installationId],
      foreignColumns: [publicSdkInstallations.workspaceId, publicSdkInstallations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'authoring_authorization_requests_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'authoring_authorization_requests_origin_fk',
      columns: [table.installationId, table.exactOrigin],
      foreignColumns: [
        publicSdkInstallationOrigins.installationId,
        publicSdkInstallationOrigins.exactOrigin,
      ],
    }).onDelete('cascade'),
    uniqueIndex('authoring_authorization_requests_bootstrap_grant_idx').on(table.bootstrapGrantId),
    uniqueIndex('authoring_authorization_requests_scope_id_idx').on(
      table.workspaceId,
      table.environmentId,
      table.installationId,
      table.exactOrigin,
      table.creatorId,
      table.id,
    ),
    uniqueIndex('authoring_authorization_requests_code_hash_idx')
      .on(table.authorizationCodeHash)
      .where(sql`${table.authorizationCodeHash} is not null`),
    index('authoring_authorization_requests_workspace_idx').on(table.workspaceId),
    index('authoring_authorization_requests_expires_idx').on(table.expiresAt),
    check(
      'authoring_authorization_requests_hashes_check',
      sql`${table.bootstrapGrantHash} ~ '^[0-9a-f]{64}$' and ${table.stateHash} ~ '^[0-9a-f]{64}$' and (${table.authorizationCodeHash} is null or ${table.authorizationCodeHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'authoring_authorization_requests_exact_origin_check',
      sql`${table.exactOrigin} ~ '^https?://[^/?#@]+$'`,
    ),
    check(
      'authoring_authorization_requests_pkce_check',
      sql`${table.codeChallengeMethod} = 'S256' and ${table.codeChallenge} ~ '^[A-Za-z0-9._~-]{43,128}$'`,
    ),
    check(
      'authoring_authorization_requests_capabilities_check',
      sql`jsonb_typeof(${table.requestedCapabilities}) = 'array'
        and jsonb_array_length(${table.requestedCapabilities}) between 1 and 3
        and ${table.requestedCapabilities} <@ '["documents:create","documents:list","documents:select"]'::jsonb`,
    ),
    check(
      'authoring_authorization_requests_approval_check',
      sql`(
        (${table.creatorId} is null and ${table.authorizationCodeHash} is null and ${table.approvedAt} is null and ${table.authorizationCodeExpiresAt} is null and ${table.authorizationCodeUsedAt} is null)
        or
        (${table.creatorId} is not null and ${table.authorizationCodeHash} is not null and ${table.approvedAt} is not null and ${table.authorizationCodeExpiresAt} is not null)
      )`,
    ),
  ],
);

export const authoringActivationGrants = pgTable(
  'authoring_activation_grants',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id')
      .notNull()
      .references(() => authoringAuthorizationRequests.id, { onDelete: 'cascade' }),
    installationId: text('installation_id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    environmentId: text('environment_id').notNull(),
    exactOrigin: text('exact_origin').notNull(),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    capabilities: jsonb('capabilities').$type<AuthoringActivationCapability[]>().notNull(),
    documentIntent: jsonb('document_intent').$type<AuthoringDocumentIntent>(),
    grantHash: text('grant_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'authoring_activation_grants_request_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.installationId,
        table.exactOrigin,
        table.creatorId,
        table.requestId,
      ],
      foreignColumns: [
        authoringAuthorizationRequests.workspaceId,
        authoringAuthorizationRequests.environmentId,
        authoringAuthorizationRequests.installationId,
        authoringAuthorizationRequests.exactOrigin,
        authoringAuthorizationRequests.creatorId,
        authoringAuthorizationRequests.id,
      ],
    }).onDelete('cascade'),
    uniqueIndex('authoring_activation_grants_hash_idx').on(table.grantHash),
    uniqueIndex('authoring_activation_grants_session_scope_idx').on(
      table.workspaceId,
      table.environmentId,
      table.installationId,
      table.exactOrigin,
      table.creatorId,
      table.id,
    ),
    index('authoring_activation_grants_workspace_idx').on(table.workspaceId),
    index('authoring_activation_grants_expires_idx').on(table.expiresAt),
    check('authoring_activation_grants_hash_check', sql`${table.grantHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'authoring_activation_grants_exact_origin_check',
      sql`${table.exactOrigin} ~ '^https?://[^/?#@]+$'`,
    ),
    check(
      'authoring_activation_grants_capabilities_check',
      sql`jsonb_typeof(${table.capabilities}) = 'array'
        and jsonb_array_length(${table.capabilities}) between 1 and 3
        and ${table.capabilities} <@ '["documents:create","documents:list","documents:select"]'::jsonb`,
    ),
    check(
      'authoring_activation_grants_consumption_check',
      sql`not (${table.usedAt} is not null and ${table.revokedAt} is not null)`,
    ),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    status: text('status').notNull(),
    title: text('title').notNull(),
    schemaVersion: text('schema_version').notNull(),
    canonical: jsonb('canonical').$type<LodariqDocument>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedByUserId: text('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('documents_workspace_id_idx').on(table.workspaceId, table.id),
    index('documents_workspace_status_idx').on(table.workspaceId, table.status),
    index('documents_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
  ],
);

/** Immutable, privacy-bounded evidence for one authenticated Brand drift check. */
export const brandDriftRuns = pgTable(
  'brand_drift_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    themeId: text('theme_id').notNull(),
    baselineThemeVersionId: text('baseline_theme_version_id').notNull(),
    trigger: text('trigger').$type<BrandDriftAuditReport['trigger']>().notNull(),
    classification: text('classification')
      .$type<BrandDriftAuditReport['classification']>()
      .notNull(),
    confidence: integer('confidence').notNull(),
    report: jsonb('report_json').$type<BrandDriftAuditReport>().notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('brand_drift_runs_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'brand_drift_runs_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'brand_drift_runs_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'brand_drift_runs_theme_version_scope_fk',
      columns: [table.workspaceId, table.themeId, table.baselineThemeVersionId],
      foreignColumns: [themeVersions.workspaceId, themeVersions.themeId, themeVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'brand_drift_runs_creator_membership_scope_fk',
      columns: [table.workspaceId, table.createdByUserId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('restrict'),
    index('brand_drift_runs_document_created_idx').on(
      table.workspaceId,
      table.documentId,
      table.createdAt,
    ),
    index('brand_drift_runs_theme_created_idx').on(
      table.workspaceId,
      table.themeId,
      table.createdAt,
    ),
    check(
      'brand_drift_runs_trigger_check',
      sql`${table.trigger} in ('authoring_open', 'creator_check')`,
    ),
    check(
      'brand_drift_runs_classification_check',
      sql`${table.classification} in ('unchanged', 'warning', 'actionable')`,
    ),
    check('brand_drift_runs_confidence_check', sql`${table.confidence} between 0 and 100`),
    check(
      'brand_drift_runs_report_check',
      sql`jsonb_typeof(${table.report}) = 'object'
        and ${table.report}->>'checkId' = ${table.id}
        and ${table.report}->>'themeId' = ${table.themeId}
        and ${table.report}->>'baselineThemeVersionId' = ${table.baselineThemeVersionId}
        and ${table.report}->>'trigger' = ${table.trigger}
        and ${table.report}->>'classification' = ${table.classification}
        and (${table.report}->>'confidence')::integer = ${table.confidence}
        and jsonb_typeof(${table.report}->'sourceComparisons') = 'array'
        and jsonb_typeof(${table.report}->'changedRoles') = 'array'
        and jsonb_typeof(${table.report}->'accessibilityConsequences') = 'array'
        and jsonb_typeof(${table.report}->'affectedExperiences') = 'array'`,
    ),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    canonical: jsonb('canonical').$type<LodariqDocument>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_versions_document_version_idx').on(table.documentId, table.version),
    uniqueIndex('document_versions_visual_check_identity_idx').on(
      table.workspaceId,
      table.documentId,
      table.id,
    ),
    index('document_versions_workspace_idx').on(table.workspaceId),
  ],
);

export const compiledArtifacts = pgTable(
  'compiled_artifacts',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    documentVersionId: text('document_version_id').references(() => documentVersions.id, {
      onDelete: 'set null',
    }),
    contentHash: text('content_hash').notNull(),
    compilerVersion: text('compiler_version').notNull(),
    themeVersionId: text('theme_version_id'),
    themeContentHash: text('theme_content_hash'),
    rendererContractVersion: text('renderer_contract_version'),
    compiled: jsonb('compiled').$type<CompiledDocument>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('compiled_artifacts_document_hash_idx').on(
      table.workspaceId,
      table.documentId,
      table.contentHash,
    ),
    uniqueIndex('compiled_artifacts_release_identity_idx').on(
      table.workspaceId,
      table.documentId,
      table.id,
    ),
    uniqueIndex('compiled_artifacts_visual_check_identity_idx').on(
      table.workspaceId,
      table.documentId,
      table.id,
      table.documentVersionId,
      table.contentHash,
      table.themeVersionId,
    ),
    index('compiled_artifacts_document_idx').on(table.documentId),
    index('compiled_artifacts_workspace_idx').on(table.workspaceId),
  ],
);

export const visualCheckRuns = pgTable(
  'visual_check_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    documentVersionId: text('document_version_id').notNull(),
    compiledArtifactId: text('compiled_artifact_id').notNull(),
    themeVersionId: text('theme_version_id').notNull(),
    environmentId: text('environment_id').notNull(),
    contentHash: text('content_hash').notNull(),
    report: jsonb('report_json').$type<BasicVisualPreflightReport>().notNull(),
    status: text('status').$type<BasicVisualPreflightReport['status']>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'visual_check_runs_document_version_scope_fk',
      columns: [table.workspaceId, table.documentId, table.documentVersionId],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.documentId,
        documentVersions.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'visual_check_runs_artifact_scope_fk',
      columns: [
        table.workspaceId,
        table.documentId,
        table.compiledArtifactId,
        table.documentVersionId,
        table.contentHash,
        table.themeVersionId,
      ],
      foreignColumns: [
        compiledArtifacts.workspaceId,
        compiledArtifacts.documentId,
        compiledArtifacts.id,
        compiledArtifacts.documentVersionId,
        compiledArtifacts.contentHash,
        compiledArtifacts.themeVersionId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'visual_check_runs_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('restrict'),
    index('visual_check_runs_document_created_idx').on(
      table.workspaceId,
      table.documentId,
      table.createdAt,
    ),
    index('visual_check_runs_artifact_idx').on(
      table.workspaceId,
      table.compiledArtifactId,
      table.createdAt,
    ),
    check(
      'visual_check_runs_content_hash_check',
      sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'visual_check_runs_status_check',
      sql`${table.status} in ('passed', 'warnings', 'blocked')`,
    ),
    check(
      'visual_check_runs_report_check',
      sql`jsonb_typeof(${table.report}) = 'object'
        and ${table.report}->>'schemaVersion' = '1'
        and ${table.report}->>'status' = ${table.status}
        and jsonb_typeof(${table.report}->'issues') = 'array'
        and jsonb_array_length(${table.report}->'issues') <= 512`,
    ),
  ],
);

export const publications = pgTable(
  'publications',
  {
    id: text('id').primaryKey(),
    correlationId: text('correlation_id'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    documentVersionId: text('document_version_id').references(() => documentVersions.id, {
      onDelete: 'set null',
    }),
    compiledArtifactId: text('compiled_artifact_id')
      .notNull()
      .references(() => compiledArtifacts.id, { onDelete: 'restrict' }),
    contentHash: text('content_hash').notNull(),
    action: releaseActionEnum('action'),
    sourcePublicationId: text('source_publication_id'),
    previousPublicationId: text('previous_publication_id'),
    // The SQL baseline adds the scoped composite FK after release_operations exists.
    releaseOperationId: text('release_operation_id'),
    publishedByUserId: text('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('publications_deployment_identity_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.id,
    ),
    uniqueIndex('publications_analytics_identity_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.id,
      table.contentHash,
    ),
    uniqueIndex('publications_document_identity_idx').on(
      table.workspaceId,
      table.documentId,
      table.id,
    ),
    uniqueIndex('publications_release_operation_idx')
      .on(table.releaseOperationId)
      .where(sql`${table.releaseOperationId} is not null`),
    // Promotion provenance crosses environments but never workspaces/documents.
    foreignKey({
      name: 'publications_source_publication_scope_fk',
      columns: [table.workspaceId, table.documentId, table.sourcePublicationId],
      foreignColumns: [table.workspaceId, table.documentId, table.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'publications_previous_publication_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.previousPublicationId,
      ],
      foreignColumns: [table.workspaceId, table.environmentId, table.documentId, table.id],
    }).onDelete('restrict'),
    check(
      'publications_action_check',
      sql`${table.action} is null or ${table.action} <> 'unpublish'`,
    ),
    check(
      'publications_release_provenance_check',
      sql`${table.releaseOperationId} is null or ${table.action} is not null`,
    ),
    index('publications_correlation_idx').on(table.correlationId),
    index('publications_environment_published_idx').on(
      table.workspaceId,
      table.environmentId,
      table.publishedAt,
    ),
    index('publications_document_idx').on(table.documentId),
    index('publications_artifact_idx').on(table.compiledArtifactId),
  ],
);

/** Append-only browser verification of one exact, currently active publication. */
export const publicationVerifications = pgTable(
  'publication_verifications',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    publicationId: text('publication_id').notNull(),
    result: text('result').$type<'passed' | 'failed'>().notNull(),
    report: jsonb('report_json').$type<BrowserVerificationReport>().notNull(),
    verifiedOrigin: text('verified_origin').notNull(),
    verifiedByUserId: text('verified_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('publication_verifications_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'publication_verifications_publication_scope_fk',
      columns: [table.workspaceId, table.environmentId, table.documentId, table.publicationId],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'publication_verifications_verifier_membership_scope_fk',
      columns: [table.workspaceId, table.verifiedByUserId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('restrict'),
    index('publication_verifications_publication_created_idx').on(
      table.workspaceId,
      table.publicationId,
      table.createdAt,
    ),
    check('publication_verifications_result_check', sql`${table.result} in ('passed', 'failed')`),
    check(
      'publication_verifications_report_json_check',
      sql`jsonb_typeof(${table.report}) = 'object'
        and ${table.report}->>'schemaVersion' = '1'
        and ${table.report}->>'rendererContractVersion' = ${RENDERER_CONTRACT_VERSION}
        and jsonb_typeof(${table.report}->'checks') = 'array'
        and jsonb_array_length(${table.report}->'checks') between 1 and 13
        and (
          (${table.result} = 'failed' and ${table.report}->>'status' = 'failed')
          or
          (${table.result} = 'passed' and ${table.report}->>'status' in ('passed', 'warning'))
        )`,
    ),
    check(
      'publication_verifications_origin_check',
      sql`${table.verifiedOrigin} ~ '^https?://[^[:space:]/?#@]+$'`,
    ),
  ],
);

export const releaseOperations = pgTable(
  'release_operations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    action: releaseActionEnum('action').notNull(),
    requestedArtifactId: text('requested_artifact_id'),
    requestedSourcePublicationId: text('requested_source_publication_id'),
    requestedActivePublicationId: text('requested_active_publication_id'),
    actualActivePublicationId: text('actual_active_publication_id'),
    sourcePublicationId: text('source_publication_id'),
    resultPublicationId: text('result_publication_id'),
    expectedGeneration: integer('expected_generation').notNull(),
    resultGeneration: integer('result_generation'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: releaseOperationStatusEnum('status').notNull(),
    correlationId: text('correlation_id').notNull(),
    requestedByUserId: text('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('release_operations_idempotency_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.idempotencyKey,
    ),
    uniqueIndex('release_operations_deployment_identity_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.id,
    ),
    uniqueIndex('release_operations_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'release_operations_workspace_environment_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'release_operations_workspace_document_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'release_operations_requested_artifact_scope_fk',
      columns: [table.workspaceId, table.documentId, table.requestedArtifactId],
      foreignColumns: [
        compiledArtifacts.workspaceId,
        compiledArtifacts.documentId,
        compiledArtifacts.id,
      ],
    }).onDelete('restrict'),
    // A production promotion can reference the verified staging publication.
    foreignKey({
      name: 'release_operations_source_publication_scope_fk',
      columns: [table.workspaceId, table.documentId, table.sourcePublicationId],
      foreignColumns: [publications.workspaceId, publications.documentId, publications.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'release_operations_result_publication_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.resultPublicationId,
      ],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'release_operations_actual_active_publication_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.actualActivePublicationId,
      ],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
      ],
    }).onDelete('restrict'),
    check('release_operations_expected_generation_check', sql`${table.expectedGeneration} >= 0`),
    check(
      'release_operations_idempotency_key_check',
      sql`${table.idempotencyKey} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$'`,
    ),
    check(
      'release_operations_request_hash_check',
      sql`${table.requestHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'release_operations_result_generation_check',
      sql`${table.resultGeneration} is null or ${table.resultGeneration} >= 0`,
    ),
    check(
      'release_operations_requested_source_publication_check',
      sql`(
        ${table.action} = 'rollback'
        and ${table.requestedSourcePublicationId} is not null
        and ${table.requestedSourcePublicationId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
      ) or (
        ${table.action} <> 'rollback'
        and ${table.requestedSourcePublicationId} is null
      )`,
    ),
    check(
      'release_operations_requested_active_publication_check',
      sql`${table.requestedActivePublicationId} is null or (
        ${table.action} in ('rollback', 'unpublish')
        and ${table.requestedActivePublicationId} ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'
      )`,
    ),
    check(
      'release_operations_recovery_reason_check',
      sql`(
        ${table.action} in ('rollback', 'unpublish')
        and ${table.reason} is not null
        and char_length(${table.reason}) between 1 and 500
        and ${table.reason} !~ '^[[:space:]]'
        and ${table.reason} !~ '[[:space:]]$'
      ) or (
        ${table.action} in ('publish', 'promote')
        and ${table.reason} is null
      )`,
    ),
    check(
      'release_operations_action_shape_check',
      sql`(
        ${table.action} in ('publish', 'promote')
        and ${table.requestedArtifactId} is not null
        and ${table.requestedActivePublicationId} is null
        and ${table.actualActivePublicationId} is null
      ) or (
        ${table.action} = 'rollback'
        and ${table.status} <> 'awaiting_approval'
        and (
          (${table.status} = 'activating'
            and ${table.requestedArtifactId} is null
            and ${table.sourcePublicationId} is null
            and ${table.resultPublicationId} is null
            and ${table.actualActivePublicationId} is null)
          or (${table.status} = 'failed'
            and ${table.requestedArtifactId} is null
            and ${table.sourcePublicationId} is null
            and ${table.resultPublicationId} is null)
          or (${table.status} = 'completed'
            and ${table.requestedArtifactId} is not null
            and ${table.sourcePublicationId} is not null
            and ${table.resultPublicationId} is not null
            and ${table.actualActivePublicationId} is not null)
        )
      ) or (
        ${table.action} = 'unpublish'
        and ${table.status} <> 'awaiting_approval'
        and ${table.requestedArtifactId} is null
        and ${table.sourcePublicationId} is null
        and ${table.resultPublicationId} is null
        and (
          (${table.status} = 'activating' and ${table.actualActivePublicationId} is null)
          or ${table.status} = 'failed'
          or (${table.status} = 'completed' and ${table.actualActivePublicationId} is not null)
        )
      )`,
    ),
    check(
      'release_operations_lifecycle_shape_check',
      sql`(
        ${table.status} in ('awaiting_approval', 'activating')
        and ${table.resultGeneration} is null
        and ${table.resultPublicationId} is null
        and ${table.errorCode} is null
        and ${table.completedAt} is null
      ) or (
        ${table.status} = 'completed'
        and ${table.resultGeneration} is not null
        and (${table.action} = 'unpublish' or ${table.resultPublicationId} is not null)
        and ${table.errorCode} is null
        and ${table.completedAt} is not null
      ) or (
        ${table.status} = 'failed'
        and ${table.resultPublicationId} is null
        and ${table.errorCode} is not null
        and ${table.completedAt} is not null
      )`,
    ),
    index('release_operations_deployment_created_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.createdAt,
    ),
  ],
);

/** Immutable one-person/one-decision approval evidence for a promotion operation. */
export const releaseApprovals = pgTable(
  'release_approvals',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    releaseOperationId: text('release_operation_id').notNull(),
    decision: text('decision').$type<'approved' | 'rejected'>().notNull(),
    reason: text('reason'),
    decidedByUserId: text('decided_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('release_approvals_workspace_id_idx').on(table.workspaceId, table.id),
    uniqueIndex('release_approvals_operation_actor_idx').on(
      table.workspaceId,
      table.releaseOperationId,
      table.decidedByUserId,
    ),
    foreignKey({
      name: 'release_approvals_operation_scope_fk',
      columns: [table.workspaceId, table.releaseOperationId],
      foreignColumns: [releaseOperations.workspaceId, releaseOperations.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'release_approvals_decider_membership_scope_fk',
      columns: [table.workspaceId, table.decidedByUserId],
      foreignColumns: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
    }).onDelete('restrict'),
    index('release_approvals_operation_created_idx').on(
      table.workspaceId,
      table.releaseOperationId,
      table.createdAt,
    ),
    check('release_approvals_decision_check', sql`${table.decision} in ('approved', 'rejected')`),
    check(
      'release_approvals_reason_check',
      sql`${table.reason} is null or char_length(btrim(${table.reason})) between 1 and 500`,
    ),
  ],
);

export const documentDeployments = pgTable(
  'document_deployments',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    state: documentDeploymentStateEnum('state').notNull().default('inactive'),
    activePublicationId: text('active_publication_id'),
    pendingReleaseOperationId: text('pending_release_operation_id'),
    generation: integer('generation').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.environmentId, table.documentId] }),
    foreignKey({
      name: 'document_deployments_workspace_environment_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'document_deployments_workspace_document_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'document_deployments_active_publication_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.activePublicationId,
      ],
      foreignColumns: [
        publications.workspaceId,
        publications.environmentId,
        publications.documentId,
        publications.id,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'document_deployments_pending_release_operation_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.documentId,
        table.pendingReleaseOperationId,
      ],
      foreignColumns: [
        releaseOperations.workspaceId,
        releaseOperations.environmentId,
        releaseOperations.documentId,
        releaseOperations.id,
      ],
    }).onDelete('restrict'),
    index('document_deployments_workspace_environment_state_idx').on(
      table.workspaceId,
      table.environmentId,
      table.state,
    ),
    index('document_deployments_workspace_document_idx').on(table.workspaceId, table.documentId),
    uniqueIndex('document_deployments_active_publication_idx')
      .on(table.activePublicationId)
      .where(sql`${table.activePublicationId} is not null`),
    check('document_deployments_generation_check', sql`${table.generation} >= 0`),
    check(
      'document_deployments_state_publication_check',
      sql`(
        (${table.state} = 'active' and ${table.activePublicationId} is not null and ${table.generation} >= 1)
        or
        (${table.state} = 'inactive' and ${table.activePublicationId} is null)
      )`,
    ),
  ],
);

export const authoringSessions = pgTable(
  'authoring_sessions',
  {
    id: text('id').primaryKey(),
    correlationId: text('correlation_id'),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    installationId: text('installation_id'),
    activationGrantId: text('activation_grant_id'),
    customerOrigin: text('customer_origin'),
    capabilities: jsonb('capabilities').$type<AuthoringSessionCapability[]>(),
    compilerVersion: text('compiler_version'),
    rendererContractVersion: text('renderer_contract_version'),
    themeContractVersion: text('theme_contract_version'),
    themeVersionId: text('theme_version_id'),
    tokenHash: text('token_hash').notNull(),
    iframeSrc: text('iframe_src').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'authoring_sessions_activation_scope_fk',
      columns: [
        table.workspaceId,
        table.environmentId,
        table.installationId,
        table.customerOrigin,
        table.createdByUserId,
        table.activationGrantId,
      ],
      foreignColumns: [
        authoringActivationGrants.workspaceId,
        authoringActivationGrants.environmentId,
        authoringActivationGrants.installationId,
        authoringActivationGrants.exactOrigin,
        authoringActivationGrants.creatorId,
        authoringActivationGrants.id,
      ],
    }).onDelete('restrict'),
    uniqueIndex('authoring_sessions_hash_idx').on(table.tokenHash),
    uniqueIndex('authoring_sessions_activation_grant_idx')
      .on(table.activationGrantId)
      .where(sql`${table.activationGrantId} is not null`),
    index('authoring_sessions_correlation_idx').on(table.correlationId),
    index('authoring_sessions_workspace_idx').on(table.workspaceId),
    index('authoring_sessions_environment_idx').on(table.environmentId),
    index('authoring_sessions_document_idx').on(table.documentId),
    index('authoring_sessions_expires_idx').on(table.expiresAt),
    check(
      'authoring_sessions_activation_scope_check',
      sql`(
        (${table.installationId} is null and ${table.activationGrantId} is null and ${table.customerOrigin} is null and ${table.capabilities} is null)
        or
        (${table.installationId} is not null and ${table.activationGrantId} is not null and ${table.customerOrigin} is not null and ${table.capabilities} is not null)
      )`,
    ),
    check(
      'authoring_sessions_customer_origin_check',
      sql`${table.customerOrigin} is null or ${table.customerOrigin} ~ '^https?://[^/?#@]+$'`,
    ),
    check(
      'authoring_sessions_capabilities_check',
      sql.raw(AUTHORING_SESSION_CAPABILITIES_CHECK_SQL),
    ),
    check(
      'authoring_sessions_compatibility_pins_check',
      sql`(
        (${table.compilerVersion} is null
          and ${table.rendererContractVersion} is null
          and ${table.themeContractVersion} is null
          and ${table.themeVersionId} is null)
        or
        (${table.compilerVersion} is not null
          and ${table.rendererContractVersion} is not null
          and ${table.themeContractVersion} is not null
          and ${table.themeVersionId} is not null
          and ${table.compilerVersion} = ${COMPILER_VERSION}
          and ${table.rendererContractVersion} = ${RENDERER_CONTRACT_VERSION}
          and ${table.themeContractVersion} = ${BRAND_THEME_CONTRACT_VERSION}
          and char_length(btrim(${table.themeVersionId})) between 1 and 120)
      )`,
    ),
  ],
);

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

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
  environments: many(environments),
  publicSdkInstallations: many(publicSdkInstallations),
  publicSdkInstallationOrigins: many(publicSdkInstallationOrigins),
  publicSdkBootstrapGrants: many(publicSdkBootstrapGrants),
  authoringAuthorizationRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  themes: many(themes),
  themeVersions: many(themeVersions),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
  documents: many(documents),
  visualCheckRuns: many(visualCheckRuns),
  publicationVerifications: many(publicationVerifications),
  releaseApprovals: many(releaseApprovals),
  events: many(events),
  analyticsEvents: many(authoritativeAnalyticsEvents),
}));

export const userRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMemberships),
  authSessions: many(authSessions),
  emailVerificationChallenges: many(emailVerificationChallenges),
  authOutboxMessages: many(authOutbox),
  createdDocuments: many(documents, { relationName: 'createdDocuments' }),
  updatedDocuments: many(documents, { relationName: 'updatedDocuments' }),
  approvedAuthoringRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  brandDriftRuns: many(brandDriftRuns),
}));

export const passwordCredentialRelations = relations(passwordCredentials, ({ one }) => ({
  user: one(users, {
    fields: [passwordCredentials.userId],
    references: [users.id],
  }),
}));

export const authSessionRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
  activeWorkspace: one(workspaces, {
    fields: [authSessions.activeWorkspaceId],
    references: [workspaces.id],
  }),
}));

export const emailVerificationChallengeRelations = relations(
  emailVerificationChallenges,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationChallenges.userId],
      references: [users.id],
    }),
  }),
);

export const authOutboxRelations = relations(authOutbox, ({ one }) => ({
  user: one(users, {
    fields: [authOutbox.userId],
    references: [users.id],
  }),
}));

export const environmentRelations = relations(environments, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [environments.workspaceId],
    references: [workspaces.id],
  }),
  tokens: many(environmentTokens),
  publicSdkInstallationOrigins: many(publicSdkInstallationOrigins),
  publicSdkBootstrapGrants: many(publicSdkBootstrapGrants),
  authoringAuthorizationRequests: many(authoringAuthorizationRequests),
  authoringActivationGrants: many(authoringActivationGrants),
  publications: many(publications),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
  publicationVerifications: many(publicationVerifications),
  documentDeployments: many(documentDeployments),
  visualCheckRuns: many(visualCheckRuns),
  authoringSessions: many(authoringSessions),
  events: many(events),
}));

export const themeRelations = relations(themes, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [themes.workspaceId],
    references: [workspaces.id],
  }),
  activeVersion: one(themeVersions, {
    fields: [themes.activeVersionId],
    references: [themeVersions.id],
  }),
  versions: many(themeVersions),
  styleSources: many(styleSources),
  productStyleApplications: many(productStyleApplications),
  brandDriftRuns: many(brandDriftRuns),
}));

export const themeVersionRelations = relations(themeVersions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [themeVersions.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [themeVersions.themeId],
    references: [themes.id],
  }),
}));

export const styleSourceRelations = relations(styleSources, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [styleSources.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [styleSources.themeId],
    references: [themes.id],
  }),
  environment: one(environments, {
    fields: [styleSources.environmentId],
    references: [environments.id],
  }),
  creator: one(users, {
    fields: [styleSources.createdByUserId],
    references: [users.id],
  }),
}));

export const productStyleApplicationRelations = relations(productStyleApplications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [productStyleApplications.workspaceId],
    references: [workspaces.id],
  }),
  theme: one(themes, {
    fields: [productStyleApplications.themeId],
    references: [themes.id],
  }),
  environment: one(environments, {
    fields: [productStyleApplications.environmentId],
    references: [environments.id],
  }),
  creator: one(users, {
    fields: [productStyleApplications.createdByUserId],
    references: [users.id],
  }),
}));

export const brandDriftRunRelations = relations(brandDriftRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [brandDriftRuns.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [brandDriftRuns.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [brandDriftRuns.documentId],
    references: [documents.id],
  }),
  theme: one(themes, {
    fields: [brandDriftRuns.themeId],
    references: [themes.id],
  }),
  baselineThemeVersion: one(themeVersions, {
    fields: [brandDriftRuns.baselineThemeVersionId],
    references: [themeVersions.id],
  }),
  creator: one(users, {
    fields: [brandDriftRuns.createdByUserId],
    references: [users.id],
  }),
}));

export const publicSdkInstallationRelations = relations(
  publicSdkInstallations,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [publicSdkInstallations.workspaceId],
      references: [workspaces.id],
    }),
    origins: many(publicSdkInstallationOrigins),
    bootstrapGrants: many(publicSdkBootstrapGrants),
    authoringAuthorizationRequests: many(authoringAuthorizationRequests),
    authoringActivationGrants: many(authoringActivationGrants),
  }),
);

export const publicSdkInstallationOriginRelations = relations(
  publicSdkInstallationOrigins,
  ({ one }) => ({
    installation: one(publicSdkInstallations, {
      fields: [publicSdkInstallationOrigins.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [publicSdkInstallationOrigins.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [publicSdkInstallationOrigins.environmentId],
      references: [environments.id],
    }),
  }),
);

export const publicSdkBootstrapGrantRelations = relations(
  publicSdkBootstrapGrants,
  ({ one, many }) => ({
    installation: one(publicSdkInstallations, {
      fields: [publicSdkBootstrapGrants.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [publicSdkBootstrapGrants.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [publicSdkBootstrapGrants.environmentId],
      references: [environments.id],
    }),
    authorizationRequests: many(authoringAuthorizationRequests),
  }),
);

export const authoringAuthorizationRequestRelations = relations(
  authoringAuthorizationRequests,
  ({ one, many }) => ({
    bootstrapGrant: one(publicSdkBootstrapGrants, {
      fields: [authoringAuthorizationRequests.bootstrapGrantId],
      references: [publicSdkBootstrapGrants.id],
    }),
    installation: one(publicSdkInstallations, {
      fields: [authoringAuthorizationRequests.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [authoringAuthorizationRequests.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [authoringAuthorizationRequests.environmentId],
      references: [environments.id],
    }),
    creator: one(users, {
      fields: [authoringAuthorizationRequests.creatorId],
      references: [users.id],
    }),
    activationGrants: many(authoringActivationGrants),
  }),
);

export const authoringActivationGrantRelations = relations(
  authoringActivationGrants,
  ({ one }) => ({
    authorizationRequest: one(authoringAuthorizationRequests, {
      fields: [authoringActivationGrants.requestId],
      references: [authoringAuthorizationRequests.id],
    }),
    installation: one(publicSdkInstallations, {
      fields: [authoringActivationGrants.installationId],
      references: [publicSdkInstallations.id],
    }),
    workspace: one(workspaces, {
      fields: [authoringActivationGrants.workspaceId],
      references: [workspaces.id],
    }),
    environment: one(environments, {
      fields: [authoringActivationGrants.environmentId],
      references: [environments.id],
    }),
    creator: one(users, {
      fields: [authoringActivationGrants.creatorId],
      references: [users.id],
    }),
  }),
);

export const documentRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  versions: many(documentVersions),
  compiledArtifacts: many(compiledArtifacts),
  publications: many(publications),
  deployments: many(documentDeployments),
  visualCheckRuns: many(visualCheckRuns),
  brandDriftRuns: many(brandDriftRuns),
  authoringSessions: many(authoringSessions),
}));

export const visualCheckRunRelations = relations(visualCheckRuns, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [visualCheckRuns.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [visualCheckRuns.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [visualCheckRuns.documentId],
    references: [documents.id],
  }),
  documentVersion: one(documentVersions, {
    fields: [visualCheckRuns.documentVersionId],
    references: [documentVersions.id],
  }),
  compiledArtifact: one(compiledArtifacts, {
    fields: [visualCheckRuns.compiledArtifactId],
    references: [compiledArtifacts.id],
  }),
}));

export const publicationRelations = relations(publications, ({ one, many }) => ({
  activeDeployment: one(documentDeployments, {
    fields: [publications.id],
    references: [documentDeployments.activePublicationId],
  }),
  sourcePublication: one(publications, {
    relationName: 'publicationSource',
    fields: [publications.sourcePublicationId],
    references: [publications.id],
  }),
  previousPublication: one(publications, {
    relationName: 'previousPublication',
    fields: [publications.previousPublicationId],
    references: [publications.id],
  }),
  releaseOperation: one(releaseOperations, {
    fields: [publications.releaseOperationId],
    references: [releaseOperations.id],
  }),
  verifications: many(publicationVerifications),
}));

export const publicationVerificationRelations = relations(publicationVerifications, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [publicationVerifications.workspaceId],
    references: [workspaces.id],
  }),
  publication: one(publications, {
    fields: [publicationVerifications.publicationId],
    references: [publications.id],
  }),
  verifier: one(users, {
    fields: [publicationVerifications.verifiedByUserId],
    references: [users.id],
  }),
}));

export const documentDeploymentRelations = relations(documentDeployments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [documentDeployments.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [documentDeployments.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [documentDeployments.documentId],
    references: [documents.id],
  }),
  activePublication: one(publications, {
    fields: [documentDeployments.activePublicationId],
    references: [publications.id],
  }),
  pendingReleaseOperation: one(releaseOperations, {
    fields: [documentDeployments.pendingReleaseOperationId],
    references: [releaseOperations.id],
  }),
}));

export const releaseOperationRelations = relations(releaseOperations, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [releaseOperations.workspaceId],
    references: [workspaces.id],
  }),
  environment: one(environments, {
    fields: [releaseOperations.environmentId],
    references: [environments.id],
  }),
  document: one(documents, {
    fields: [releaseOperations.documentId],
    references: [documents.id],
  }),
  requestedArtifact: one(compiledArtifacts, {
    fields: [releaseOperations.requestedArtifactId],
    references: [compiledArtifacts.id],
  }),
  sourcePublication: one(publications, {
    relationName: 'sourceReleasePublication',
    fields: [releaseOperations.sourcePublicationId],
    references: [publications.id],
  }),
  resultPublication: one(publications, {
    relationName: 'resultReleasePublication',
    fields: [releaseOperations.resultPublicationId],
    references: [publications.id],
  }),
  approvals: many(releaseApprovals),
}));

export const releaseApprovalRelations = relations(releaseApprovals, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [releaseApprovals.workspaceId],
    references: [workspaces.id],
  }),
  releaseOperation: one(releaseOperations, {
    fields: [releaseApprovals.releaseOperationId],
    references: [releaseOperations.id],
  }),
  decider: one(users, {
    fields: [releaseApprovals.decidedByUserId],
    references: [users.id],
  }),
}));

export const tenantScopedTableNames = [
  'workspaces',
  'workspace_memberships',
  'environments',
  'environment_tokens',
  'public_sdk_installations',
  'public_sdk_installation_origins',
  'public_sdk_bootstrap_grants',
  'authoring_authorization_requests',
  'authoring_activation_grants',
  'themes',
  'theme_versions',
  'style_sources',
  'product_style_applications',
  'brand_drift_runs',
  'documents',
  'document_versions',
  'compiled_artifacts',
  'visual_check_runs',
  'publications',
  'publication_verifications',
  'release_operations',
  'release_approvals',
  'document_deployments',
  'authoring_sessions',
  'events',
  'analytics_events',
] as const;

export type TenantScopedTableName = (typeof tenantScopedTableNames)[number];
