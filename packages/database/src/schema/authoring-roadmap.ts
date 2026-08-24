import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  AUTHORING_ROADMAP_RECORD_KINDS,
  AUTHORING_ROADMAP_RECORD_STATUSES,
  type AuthoringRoadmapRecordKind,
  type AuthoringRoadmapRecordStatus,
  AUTHORING_COPY_RECORD_KINDS,
  type AuthoringCopyRecordKind,
} from '../domains/authoring-roadmap';
import { documents } from './documents';
import { environments } from './environments';
import { users, workspaces } from './identity';

export const authoringRoadmapRecords = pgTable(
  'authoring_roadmap_records',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    kind: text('kind').$type<AuthoringRoadmapRecordKind>().notNull(),
    status: text('status').$type<AuthoringRoadmapRecordStatus>().notNull(),
    payload: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('authoring_roadmap_records_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'authoring_roadmap_records_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'authoring_roadmap_records_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    index('authoring_roadmap_records_scope_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.kind,
      table.createdAt,
    ),
    check(
      'authoring_roadmap_records_kind_check',
      sql`${table.kind} in (${sql.join(
        AUTHORING_ROADMAP_RECORD_KINDS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      'authoring_roadmap_records_status_check',
      sql`${table.status} in (${sql.join(
        AUTHORING_ROADMAP_RECORD_STATUSES.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check(
      'authoring_roadmap_records_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      'authoring_roadmap_records_revocation_check',
      sql`(${table.status} = 'revoked' and ${table.revokedAt} is not null)
        or (${table.status} <> 'revoked' and ${table.revokedAt} is null)`,
    ),
  ],
);

export const authoringCopyRecords = pgTable(
  'authoring_copy_records',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    environmentId: text('environment_id').notNull(),
    documentId: text('document_id').notNull(),
    kind: text('kind').$type<AuthoringCopyRecordKind>().notNull(),
    payload: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    createdByUserId: text('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('authoring_copy_records_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'authoring_copy_records_document_scope_fk',
      columns: [table.workspaceId, table.documentId],
      foreignColumns: [documents.workspaceId, documents.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'authoring_copy_records_environment_scope_fk',
      columns: [table.workspaceId, table.environmentId],
      foreignColumns: [environments.workspaceId, environments.id],
    }).onDelete('cascade'),
    index('authoring_copy_records_scope_idx').on(
      table.workspaceId,
      table.environmentId,
      table.documentId,
      table.kind,
      table.createdAt,
    ),
    check(
      'authoring_copy_records_kind_check',
      sql`${table.kind} in (${sql.join(
        AUTHORING_COPY_RECORD_KINDS.map((value) => sql`${value}`),
        sql`, `,
      )})`,
    ),
    check('authoring_copy_records_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
  ],
);
