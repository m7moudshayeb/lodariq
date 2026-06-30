import { relations } from 'drizzle-orm';
import {
  boolean,
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
import type { AnalyticsEvent, CompiledDocument, LodariqDocument } from '@lodariq/schema';

const environmentValues = ['development', 'staging', 'production'] as const;

export const environmentEnum = pgEnum('lodariq_environment', environmentValues);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_memberships_workspace_idx').on(table.workspaceId),
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex('environments_workspace_kind_idx').on(table.workspaceId, table.kind),
    index('environments_workspace_idx').on(table.workspaceId),
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
    index('documents_workspace_status_idx').on(table.workspaceId, table.status),
    index('documents_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
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
    compiled: jsonb('compiled').$type<CompiledDocument>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('compiled_artifacts_document_hash_idx').on(
      table.workspaceId,
      table.documentId,
      table.contentHash,
    ),
    index('compiled_artifacts_document_idx').on(table.documentId),
    index('compiled_artifacts_workspace_idx').on(table.workspaceId),
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
    publishedByUserId: text('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
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
    uniqueIndex('authoring_sessions_hash_idx').on(table.tokenHash),
    index('authoring_sessions_correlation_idx').on(table.correlationId),
    index('authoring_sessions_workspace_idx').on(table.workspaceId),
    index('authoring_sessions_environment_idx').on(table.environmentId),
    index('authoring_sessions_document_idx').on(table.documentId),
    index('authoring_sessions_expires_idx').on(table.expiresAt),
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

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  memberships: many(workspaceMemberships),
  environments: many(environments),
  documents: many(documents),
  events: many(events),
}));

export const userRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMemberships),
  createdDocuments: many(documents, { relationName: 'createdDocuments' }),
  updatedDocuments: many(documents, { relationName: 'updatedDocuments' }),
}));

export const environmentRelations = relations(environments, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [environments.workspaceId],
    references: [workspaces.id],
  }),
  tokens: many(environmentTokens),
  publications: many(publications),
  authoringSessions: many(authoringSessions),
  events: many(events),
}));

export const documentRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  versions: many(documentVersions),
  compiledArtifacts: many(compiledArtifacts),
  publications: many(publications),
  authoringSessions: many(authoringSessions),
}));

export const tenantScopedTableNames = [
  'workspaces',
  'workspace_memberships',
  'environments',
  'environment_tokens',
  'documents',
  'document_versions',
  'compiled_artifacts',
  'publications',
  'authoring_sessions',
  'events',
] as const;

export type TenantScopedTableName = (typeof tenantScopedTableNames)[number];
