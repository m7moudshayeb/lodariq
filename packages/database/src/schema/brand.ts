import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  PRODUCT_STYLE_MAX_SOURCES,
  type AuthoringProductMatchSourceReceipt,
  type BrandThemeDefinition,
  type BrandThemeSnapshot,
  type ProductStyleSource,
} from '@lodariq/schema';
import { environments } from './environments';
import { users, workspaceMemberships, workspaces } from './identity';
import { timestamps } from './shared';

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
