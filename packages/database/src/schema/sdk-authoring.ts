import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AuthoringActivationCapability, AuthoringDocumentIntent } from '@lodariq/schema';
import { environments } from './environments';
import { users, workspaces } from './identity';
import { timestamps } from './shared';

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
    /**
     * The kill switch (ADR-0027). Distinct from `revoked_at`: revocation is
     * permanent and retires the installation identity, while suspension is a
     * reversible pause a customer can flip when their page misbehaves and flip
     * back when it does not.
     */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
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
