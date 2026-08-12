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
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
  type AuthoringSessionCapability,
} from '@lodariq/schema';
import { AUTHORING_SESSION_CAPABILITIES_CHECK_SQL } from '../authoring-session-capabilities';
import { documents } from './documents';
import { environments } from './environments';
import { users, workspaces } from './identity';
import { authoringActivationGrants } from './sdk-authoring';

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
