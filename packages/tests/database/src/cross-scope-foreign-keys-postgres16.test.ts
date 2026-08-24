import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listCheckedInSqlPaths } from './migration-test-utils.js';
import {
  createDisposablePostgresFixture,
  DISPOSABLE_POSTGRES_ENABLED,
  sqlLiteral,
  type DisposablePostgresFixture,
} from './postgres16-test-harness.js';

const WORKSPACE_ID = 'wk_cross_scope_delete';
const USER_ID = 'usr_cross_scope_delete';
const ENVIRONMENT_ID = 'env_cross_scope_delete';
const THEME_ID = 'theme_cross_scope_delete';
const OTHER_WORKSPACE_ID = 'wk_cross_scope_other';
const OTHER_ENVIRONMENT_ID = 'env_cross_scope_other';
const OTHER_THEME_ID = 'theme_cross_scope_other';
let fixture: DisposablePostgresFixture | undefined;

describe.skipIf(!DISPOSABLE_POSTGRES_ENABLED)(
  'cross-scope foreign keys on an upgraded PostgreSQL 16 database',
  () => {
    beforeAll(() => {
      fixture = createDisposablePostgresFixture('cross_scope');
      try {
        for (const migrationPath of listCheckedInSqlPaths()) fixture.applyMigration(migrationPath);
        fixture.runOwnerSql(seedSql());
      } catch (error) {
        fixture.cleanup();
        throw error;
      }
    }, 60_000);

    afterAll(() => {
      fixture?.cleanup();
    }, 30_000);

    it('rejects references to themes and environments in another workspace', () => {
      const owner = requireFixture();

      expect(() =>
        owner.runOwnerSql(`
          insert into workspace_applications (
            id, workspace_id, name, origin_patterns, theme_id, created_at, updated_at
          ) values (
            'app-cross-scope-rejected', ${sqlLiteral(WORKSPACE_ID)}, 'Rejected App',
            '["https://rejected.example.com"]'::jsonb, ${sqlLiteral(OTHER_THEME_ID)},
            now(), now()
          );
        `),
      ).toThrow(/workspace_applications_theme_scope_fk/iu);

      expect(() =>
        owner.runOwnerSql(`
          insert into governance_audit_events (
            id, workspace_id, actor_user_id, event_type, environment_id, occurred_at
          ) values (
            'tenevt_cross_scope_governance_rejected', ${sqlLiteral(WORKSPACE_ID)},
            ${sqlLiteral(USER_ID)}, 'capability_profile_created',
            ${sqlLiteral(OTHER_ENVIRONMENT_ID)}, now()
          );
        `),
      ).toThrow(/governance_audit_events_environment_scope_fk/iu);

      expect(() =>
        owner.runOwnerSql(`
          insert into tenant_audit_events (
            id, workspace_id, actor_user_id, event_type, environment_id, occurred_at
          ) values (
            'tenevt_cross_scope_tenant_rejected', ${sqlLiteral(WORKSPACE_ID)},
            ${sqlLiteral(USER_ID)}, 'invitation_created',
            ${sqlLiteral(OTHER_ENVIRONMENT_ID)}, now()
          );
        `),
      ).toThrow(/tenant_audit_events_environment_scope_fk/iu);
    });

    it('nulls only optional references and leaves every workspace scope intact', () => {
      const owner = requireFixture();

      owner.runOwnerSql(`delete from themes where id = ${sqlLiteral(THEME_ID)};`);
      owner.runOwnerSql(`delete from environments where id = ${sqlLiteral(ENVIRONMENT_ID)};`);

      const evidence = JSON.parse(owner.runOwnerSql(evidenceSql())) as {
        applicationWorkspaceId: string;
        applicationThemeId: string | null;
        governanceWorkspaceId: string;
        governanceEnvironmentId: string | null;
        tenantWorkspaceId: string;
        tenantEnvironmentId: string | null;
        constraintsValidated: boolean;
      };

      expect(evidence).toEqual({
        applicationWorkspaceId: WORKSPACE_ID,
        applicationThemeId: null,
        governanceWorkspaceId: WORKSPACE_ID,
        governanceEnvironmentId: null,
        tenantWorkspaceId: WORKSPACE_ID,
        tenantEnvironmentId: null,
        constraintsValidated: true,
      });
    });
  },
);

function requireFixture(): DisposablePostgresFixture {
  if (!fixture) throw new Error('disposable PostgreSQL fixture is unavailable');
  return fixture;
}

function seedSql(): string {
  return `
    insert into users (id, email, name, email_verified_at, created_at) values
      (${sqlLiteral(USER_ID)}, 'cross-scope@example.com', 'Cross Scope', now(), now());
    insert into workspaces (id, name, created_at, updated_at) values
      (${sqlLiteral(WORKSPACE_ID)}, 'Cross Scope', now(), now()),
      (${sqlLiteral(OTHER_WORKSPACE_ID)}, 'Other Cross Scope', now(), now());
    insert into environments (
      id, workspace_id, kind, name, origin_allowlist, pipeline_position,
      authoring_enabled, release_policy_json, created_at, updated_at
    ) values (
      ${sqlLiteral(ENVIRONMENT_ID)}, ${sqlLiteral(WORKSPACE_ID)},
      'development', 'Development', '[]'::jsonb, 0, true,
      '{
        "allowDirectPublish": true,
        "requireSourceVerification": false,
        "requiredApprovalCount": 0,
        "publisherRoles": ["owner", "admin", "member"],
        "rollbackRoles": ["owner", "admin"],
        "unpublishRoles": ["owner", "admin"],
        "separationOfDuties": {
          "requireSeparateVerifier": false,
          "requireSeparateApprover": false
        }
      }'::jsonb,
      now(), now()
    ), (
      ${sqlLiteral(OTHER_ENVIRONMENT_ID)}, ${sqlLiteral(OTHER_WORKSPACE_ID)},
      'development', 'Other Development', '[]'::jsonb, 0, true,
      '{
        "allowDirectPublish": true,
        "requireSourceVerification": false,
        "requiredApprovalCount": 0,
        "publisherRoles": ["owner", "admin", "member"],
        "rollbackRoles": ["owner", "admin"],
        "unpublishRoles": ["owner", "admin"],
        "separationOfDuties": {
          "requireSeparateVerifier": false,
          "requireSeparateApprover": false
        }
      }'::jsonb,
      now(), now()
    );
    insert into themes (
      id, workspace_id, name, draft_json, created_at, updated_at
    ) values (
      ${sqlLiteral(THEME_ID)}, ${sqlLiteral(WORKSPACE_ID)},
      'Cross Scope Theme', '{}'::jsonb, now(), now()
    ), (
      ${sqlLiteral(OTHER_THEME_ID)}, ${sqlLiteral(OTHER_WORKSPACE_ID)},
      'Other Cross Scope Theme', '{}'::jsonb, now(), now()
    );
    insert into workspace_applications (
      id, workspace_id, name, origin_patterns, theme_id, created_at, updated_at
    ) values (
      'app-cross-scope', ${sqlLiteral(WORKSPACE_ID)}, 'Cross Scope App',
      '["https://example.com"]'::jsonb, ${sqlLiteral(THEME_ID)}, now(), now()
    );
    insert into governance_audit_events (
      id, workspace_id, actor_user_id, event_type, environment_id, occurred_at
    ) values (
      'tenevt_cross_scope_governance_xxxxxxxxxxxx', ${sqlLiteral(WORKSPACE_ID)},
      ${sqlLiteral(USER_ID)}, 'capability_profile_created',
      ${sqlLiteral(ENVIRONMENT_ID)}, now()
    );
    insert into tenant_audit_events (
      id, workspace_id, actor_user_id, event_type, environment_id, occurred_at
    ) values (
      'tenevt_cross_scope_tenant_xxxxxxxxxxxxxxxx', ${sqlLiteral(WORKSPACE_ID)},
      ${sqlLiteral(USER_ID)}, 'invitation_created', ${sqlLiteral(ENVIRONMENT_ID)}, now()
    );
  `;
}

function evidenceSql(): string {
  return `
    select json_build_object(
      'applicationWorkspaceId', application.workspace_id,
      'applicationThemeId', application.theme_id,
      'governanceWorkspaceId', governance.workspace_id,
      'governanceEnvironmentId', governance.environment_id,
      'tenantWorkspaceId', tenant.workspace_id,
      'tenantEnvironmentId', tenant.environment_id,
      'constraintsValidated', (
        select bool_and(convalidated)
        from pg_constraint
        where conname in (
          'workspace_applications_theme_scope_fk',
          'governance_audit_events_environment_scope_fk',
          'tenant_audit_events_environment_scope_fk'
        )
      )
    )
    from workspace_applications application
    cross join governance_audit_events governance
    cross join tenant_audit_events tenant
    where application.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
      and governance.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
      and tenant.workspace_id = ${sqlLiteral(WORKSPACE_ID)};
  `;
}
