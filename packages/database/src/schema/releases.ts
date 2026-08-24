import { sql } from 'drizzle-orm';
import {
  check,
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
import type { BrowserVerificationReport } from '@lodariq/schema';
import { compiledArtifacts, documents, documentVersions } from './documents';
import { environments } from './environments';
import { users, workspaceMemberships, workspaces } from './identity';
import {
  documentDeploymentStateEnum,
  releaseActionEnum,
  releaseOperationStatusEnum,
} from './shared';

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
    index('publications_workspace_published_idx').on(table.workspaceId, table.publishedAt.desc()),
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
    index('publication_verifications_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    check('publication_verifications_result_check', sql`${table.result} in ('passed', 'failed')`),
    check(
      'publication_verifications_report_json_check',
      sql`jsonb_typeof(${table.report}) = 'object'
        and ${table.report}->>'schemaVersion' = '1'
        and ${table.report}->>'rendererContractVersion' ~ '^[1-9][0-9]{0,31}$'
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
    index('release_operations_workspace_created_idx').on(table.workspaceId, table.createdAt.desc()),
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
    index('release_approvals_workspace_created_idx').on(table.workspaceId, table.createdAt.desc()),
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
    index('document_deployments_workspace_updated_idx').on(
      table.workspaceId,
      table.updatedAt.desc(),
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
