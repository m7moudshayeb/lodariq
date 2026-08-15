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
import type {
  BasicVisualPreflightReport,
  AuthoringDraftCheckpointResource,
  AuthoringStepStyleRecipeResource,
  AuthoringMediaAssetKind,
  BrandDriftAuditReport,
  CompiledDocument,
  LodariqDocument,
} from '@lodariq/schema';
import { themeVersions } from './brand';
import { environments } from './environments';
import { users, workspaceMemberships, workspaces } from './identity';
import { timestamps } from './shared';

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

export const authoringStyleRecipes = pgTable(
  'authoring_style_recipes',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    resource: jsonb('resource_json').$type<AuthoringStepStyleRecipeResource>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('authoring_style_recipes_workspace_id_idx').on(table.workspaceId, table.id),
    check(
      'authoring_style_recipes_resource_check',
      sql`jsonb_typeof(${table.resource}) = 'object' and ${table.resource}->>'id' = ${table.id}`,
    ),
  ],
);

export const authoringDraftCheckpoints = pgTable(
  'authoring_draft_checkpoints',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    documentId: text('document_id').notNull(),
    resource: jsonb('resource_json').$type<AuthoringDraftCheckpointResource>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('authoring_draft_checkpoints_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'authoring_draft_checkpoints_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    index('authoring_draft_checkpoints_document_created_idx').on(
      table.workspaceId,
      table.documentId,
      table.createdAt,
    ),
    check(
      'authoring_draft_checkpoints_resource_check',
      sql`jsonb_typeof(${table.resource}) = 'object' and ${table.resource}->>'id' = ${table.id}`,
    ),
  ],
);

export const authoringMediaAssets = pgTable(
  'authoring_media_assets',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AuthoringMediaAssetKind>().notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteLength: integer('byte_length').notNull(),
    contentHash: text('content_hash').notNull(),
    contentBase64: text('content_base64').notNull(),
    savedToLibrary: boolean('saved_to_library').notNull().default(false),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('authoring_media_assets_workspace_id_idx').on(table.workspaceId, table.id),
    index('authoring_media_assets_workspace_created_idx').on(table.workspaceId, table.createdAt),
    check(
      'authoring_media_assets_kind_check',
      sql`${table.kind} in ('image', 'video', 'captions')`,
    ),
    check('authoring_media_assets_size_check', sql`${table.byteLength} between 1 and 5242880`),
    check('authoring_media_assets_hash_check', sql`${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`),
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
