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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { EnvironmentGovernanceCapability, EnvironmentReleasePolicy } from '@lodariq/schema';
import { workspaces } from './identity';
import { environmentEnum, timestamps } from './shared';

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
    governanceCapabilities: jsonb('governance_capabilities')
      .$type<EnvironmentGovernanceCapability[]>()
      .notNull()
      .default(
        sql`'["release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage"]'::jsonb`,
      ),
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
    check(
      'environments_governance_capabilities_check',
      sql`jsonb_typeof(${table.governanceCapabilities}) = 'array'
        and jsonb_array_length(${table.governanceCapabilities}) between 1 and 11
        and ${table.governanceCapabilities} <@ '["authoring:read","authoring:write","product-style:sample","release:publish","release:verify","release:approve","release:promote","release:schedule","release:rollback","release:unpublish","release-policy:manage"]'::jsonb
        and jsonb_array_length(${table.governanceCapabilities}) =
          (case when ${table.governanceCapabilities} ? 'authoring:read' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'authoring:write' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'product-style:sample' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:publish' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:verify' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:approve' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:promote' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:schedule' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:rollback' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release:unpublish' then 1 else 0 end)
          + (case when ${table.governanceCapabilities} ? 'release-policy:manage' then 1 else 0 end)
        and (
          ${table.kind} <> 'production'
          or not (${table.governanceCapabilities} ?| array['authoring:read','authoring:write','release:publish'])
        )`,
    ),
  ],
);
