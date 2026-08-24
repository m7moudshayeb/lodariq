import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  AccessibilityFindingCode,
  AccessibilityFindingSeverity,
  AccessibilityFindingStatus,
} from '@lodariq/schema/accessibility-governance';
import { documentVersions } from './documents';
import { users, workspaces } from './identity';

export const accessibilitySweeps = pgTable(
  'accessibility_sweeps',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    status: text('status').$type<'completed'>().notNull(),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    documentCount: integer('document_count').notNull(),
    localeCount: integer('locale_count').notNull(),
    blockerCount: integer('blocker_count').notNull(),
    warningCount: integer('warning_count').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('accessibility_sweeps_workspace_id_idx').on(table.workspaceId, table.id),
    index('accessibility_sweeps_workspace_time_idx').on(table.workspaceId, table.completedAt),
    check('accessibility_sweeps_id_check', sql`${table.id} ~ '^a11ysweep_[A-Za-z0-9_-]{20,}$'`),
    check('accessibility_sweeps_status_check', sql`${table.status} = 'completed'`),
    check(
      'accessibility_sweeps_counts_check',
      sql`${table.documentCount} >= 0 and ${table.localeCount} >= 0 and ${table.blockerCount} >= 0 and ${table.warningCount} >= 0`,
    ),
    check('accessibility_sweeps_time_check', sql`${table.completedAt} >= ${table.startedAt}`),
  ],
);

export const accessibilityFindings = pgTable(
  'accessibility_findings',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    sweepId: text('sweep_id').notNull(),
    documentId: text('document_id').notNull(),
    documentVersionId: text('document_version_id').notNull(),
    artifactId: text('artifact_id'),
    contentHash: text('content_hash'),
    code: text('code').$type<AccessibilityFindingCode>().notNull(),
    severity: text('severity').$type<AccessibilityFindingSeverity>().notNull(),
    status: text('status').$type<AccessibilityFindingStatus>().notNull(),
    locale: text('locale').notNull(),
    stepId: text('step_id'),
    nodeId: text('node_id'),
    measuredRatio: numeric('measured_ratio', { precision: 5, scale: 2 }),
    requiredRatio: numeric('required_ratio', { precision: 5, scale: 2 }),
    revision: integer('revision').notNull().default(1),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('accessibility_findings_workspace_id_idx').on(table.workspaceId, table.id),
    foreignKey({
      name: 'accessibility_findings_sweep_scope_fk',
      columns: [table.workspaceId, table.sweepId],
      foreignColumns: [accessibilitySweeps.workspaceId, accessibilitySweeps.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'accessibility_findings_document_version_scope_fk',
      columns: [table.workspaceId, table.documentId, table.documentVersionId],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.documentId,
        documentVersions.id,
      ],
    }).onDelete('restrict'),
    index('accessibility_findings_release_gate_idx').on(
      table.workspaceId,
      table.documentVersionId,
      table.status,
      table.severity,
    ),
    index('accessibility_findings_sweep_idx').on(table.workspaceId, table.sweepId, table.createdAt),
    check('accessibility_findings_id_check', sql`${table.id} ~ '^a11yfinding_[A-Za-z0-9_-]{20,}$'`),
    check(
      'accessibility_findings_hash_check',
      sql`${table.contentHash} is null or ${table.contentHash} ~ '^sha256-[0-9a-f]{64}$'`,
    ),
    check(
      'accessibility_findings_code_check',
      sql`${table.code} in ('artifact_unavailable','contrast_unusable','contrast_below_target','missing_accessible_name','missing_captions','compact_viewport_risk','long_copy_risk')`,
    ),
    check('accessibility_findings_severity_check', sql`${table.severity} in ('warning','blocker')`),
    check('accessibility_findings_status_check', sql`${table.status} in ('open','resolved')`),
    check(
      'accessibility_findings_locale_check',
      sql`char_length(btrim(${table.locale})) between 1 and 64`,
    ),
    check('accessibility_findings_revision_check', sql`${table.revision} >= 1`),
    check(
      'accessibility_findings_resolution_check',
      sql`(${table.status} = 'open' and ${table.resolvedByUserId} is null and ${table.resolutionNote} is null and ${table.resolvedAt} is null) or (${table.status} = 'resolved' and ${table.resolvedByUserId} is not null and char_length(btrim(${table.resolutionNote})) between 1 and 500 and ${table.resolvedAt} is not null)`,
    ),
  ],
);

export const accessibilityFindingEvents = pgTable(
  'accessibility_finding_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    findingId: text('finding_id').notNull(),
    eventType: text('event_type').$type<'opened' | 'resolved'>().notNull(),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    findingRevision: integer('finding_revision').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'accessibility_finding_events_finding_scope_fk',
      columns: [table.workspaceId, table.findingId],
      foreignColumns: [accessibilityFindings.workspaceId, accessibilityFindings.id],
    }).onDelete('cascade'),
    index('accessibility_finding_events_finding_time_idx').on(
      table.workspaceId,
      table.findingId,
      table.occurredAt,
    ),
    index('accessibility_finding_events_workspace_time_idx').on(
      table.workspaceId,
      table.occurredAt.desc(),
    ),
    check(
      'accessibility_finding_events_id_check',
      sql`${table.id} ~ '^a11yevent_[A-Za-z0-9_-]{20,}$'`,
    ),
    check(
      'accessibility_finding_events_type_check',
      sql`${table.eventType} in ('opened','resolved')`,
    ),
    check('accessibility_finding_events_revision_check', sql`${table.findingRevision} >= 1`),
  ],
);
