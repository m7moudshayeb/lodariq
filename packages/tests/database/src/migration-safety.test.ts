import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTHORING_RESOURCES_FILE_NAME,
  AUTH_RECOVERY_RLS_FILE_NAME,
  AUTH_LIFECYCLE_RELIABILITY_FILE_NAME,
  INITIAL_BASELINE_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME,
  PROVIDER_NEUTRAL_IDENTITY_FILE_NAME,
  RESUMABLE_IDENTITY_ONBOARDING_FILE_NAME,
  TENANT_ADMINISTRATION_FILE_NAME,
  ACCOUNT_SESSION_MANAGEMENT_FILE_NAME,
  ASSURANCE_PASSKEYS_RECOVERY_FILE_NAME,
  OIDC_AUTHORIZATION_FILE_NAME,
  ENTERPRISE_IDENTITY_FILE_NAME,
  EXPERIENCE_MEASUREMENT_FILE_NAME,
  SDK_INSTALLATION_KILL_SWITCH_FILE_NAME,
  EXPERIENCE_COMMENT_THREADS_FILE_NAME,
  COMMERCIAL_ENTITLEMENTS_FILE_NAME,
  DELIVERY_ORCHESTRATION_FILE_NAME,
  EXPERIMENT_DELIVERY_FILE_NAME,
  ADAPTIVE_DELIVERY_FILE_NAME,
  NARRATION_MEDIA_FILE_NAME,
  ANALYTICS_EXPORTS_FILE_NAME,
  ANALYTICS_AUDIENCE_SEGMENTS_FILE_NAME,
  AUTHORING_COLLABORATION_PRESENCE_FILE_NAME,
  GOVERNANCE_CAPABILITY_PROFILES_FILE_NAME,
  OUTBOUND_WEBHOOKS_FILE_NAME,
  DATA_RESIDENCY_CONTROLS_FILE_NAME,
  AUTHORING_ROADMAP_RECORDS_FILE_NAME,
  CHANGE_AWARE_COPY_RECORDS_FILE_NAME,
  COMMERCIAL_BILLING_LIFECYCLE_FILE_NAME,
  DATA_RESIDENCY_EXECUTION_FILE_NAME,
  ANALYTICS_WAREHOUSE_SYNC_FILE_NAME,
  ACCESSIBILITY_GOVERNANCE_FILE_NAME,
  AUTHORING_SESSION_CAPABILITIES_FILE_NAME,
  RLS_SCOPE_CONTAINMENT_FILE_NAME,
  CROSS_SCOPE_FOREIGN_KEYS_FILE_NAME,
  BILLING_BATCH_RECOVERY_FILE_NAME,
  HOT_QUERY_INDEXES_FILE_NAME,
  ANALYTICS_EVENTS_INDEXES_FILE_NAME,
  DEAD_LETTER_AND_ROTATION_FILE_NAME,
  ANALYTICS_EVENTS_PARTITIONING_FILE_NAME,
  listCheckedInSqlFiles,
  readInitialBaseline,
  readProviderNeutralIdentityMigration,
  readResumableIdentityOnboardingMigration,
  readTenantAdministrationMigration,
  readAccountSessionManagementMigration,
  readAssurancePasskeysRecoveryMigration,
  readOidcAuthorizationMigration,
  readEnterpriseIdentityMigration,
  readExperienceMeasurementMigration,
  readExperienceCommentThreadsMigration,
  readCommercialEntitlementsMigration,
  readDeliveryOrchestrationMigration,
  readExperimentDeliveryMigration,
  readAdaptiveDeliveryMigration,
  readNarrationMediaMigration,
  readAnalyticsExportsMigration,
  readAnalyticsAudienceSegmentsMigration,
  readAuthoringCollaborationPresenceMigration,
  readGovernanceCapabilityProfilesMigration,
  readOutboundWebhooksMigration,
  readDataResidencyControlsMigration,
  readPublicationVerificationRendererContractMigration,
  readPublicationVerificationRendererV4Migration,
  readChangeAwareCopyRecordsMigration,
  readCommercialBillingLifecycleMigration,
  readDataResidencyExecutionMigration,
  readAnalyticsWarehouseSyncMigration,
  readAccessibilityGovernanceMigration,
  readAuthoringSessionCapabilitiesMigration,
  readCrossScopeForeignKeysMigration,
} from './migration-test-utils.js';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/check-migration-safety.mjs', import.meta.url),
);

describe('database migration safety guard', () => {
  it('keeps the immutable initial baseline followed by ordered forward migrations', () => {
    expect(listCheckedInSqlFiles()).toEqual([
      INITIAL_BASELINE_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME,
      AUTHORING_RESOURCES_FILE_NAME,
      AUTH_RECOVERY_RLS_FILE_NAME,
      AUTH_LIFECYCLE_RELIABILITY_FILE_NAME,
      PROVIDER_NEUTRAL_IDENTITY_FILE_NAME,
      RESUMABLE_IDENTITY_ONBOARDING_FILE_NAME,
      TENANT_ADMINISTRATION_FILE_NAME,
      ACCOUNT_SESSION_MANAGEMENT_FILE_NAME,
      ASSURANCE_PASSKEYS_RECOVERY_FILE_NAME,
      OIDC_AUTHORIZATION_FILE_NAME,
      ENTERPRISE_IDENTITY_FILE_NAME,
      EXPERIENCE_MEASUREMENT_FILE_NAME,
      SDK_INSTALLATION_KILL_SWITCH_FILE_NAME,
      EXPERIENCE_COMMENT_THREADS_FILE_NAME,
      COMMERCIAL_ENTITLEMENTS_FILE_NAME,
      DELIVERY_ORCHESTRATION_FILE_NAME,
      EXPERIMENT_DELIVERY_FILE_NAME,
      ADAPTIVE_DELIVERY_FILE_NAME,
      NARRATION_MEDIA_FILE_NAME,
      ANALYTICS_EXPORTS_FILE_NAME,
      ANALYTICS_AUDIENCE_SEGMENTS_FILE_NAME,
      AUTHORING_COLLABORATION_PRESENCE_FILE_NAME,
      GOVERNANCE_CAPABILITY_PROFILES_FILE_NAME,
      OUTBOUND_WEBHOOKS_FILE_NAME,
      DATA_RESIDENCY_CONTROLS_FILE_NAME,
      AUTHORING_ROADMAP_RECORDS_FILE_NAME,
      CHANGE_AWARE_COPY_RECORDS_FILE_NAME,
      COMMERCIAL_BILLING_LIFECYCLE_FILE_NAME,
      DATA_RESIDENCY_EXECUTION_FILE_NAME,
      ANALYTICS_WAREHOUSE_SYNC_FILE_NAME,
      ACCESSIBILITY_GOVERNANCE_FILE_NAME,
      AUTHORING_SESSION_CAPABILITIES_FILE_NAME,
      RLS_SCOPE_CONTAINMENT_FILE_NAME,
      CROSS_SCOPE_FOREIGN_KEYS_FILE_NAME,
      BILLING_BATCH_RECOVERY_FILE_NAME,
      HOT_QUERY_INDEXES_FILE_NAME,
      ANALYTICS_EVENTS_INDEXES_FILE_NAME,
      DEAD_LETTER_AND_ROTATION_FILE_NAME,
      ANALYTICS_EVENTS_PARTITIONING_FILE_NAME,
    ]);
  });

  it('keeps the approved authoring capability repair scoped to its constraint', () => {
    const migration = readAuthoringSessionCapabilitiesMigration();
    expect(migration).toContain('lodariq-shared-env-destructive-migration-signoff:');
    expect(migration).toContain('drop constraint if exists authoring_sessions_capabilities_check');
    expect(migration).toContain('document:schedule-release');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column)\b/iu);
  });

  it('keeps composite scope deletion on nullable references and validates historical rows', () => {
    const migration = readCrossScopeForeignKeysMigration();

    expect(migration).toContain('on delete set null (theme_id)');
    expect(migration.match(/on delete set null \(environment_id\)/gu)).toHaveLength(2);
    expect(migration).not.toMatch(/on delete set null\s+not valid/gu);
    expect(migration.match(/validate constraint/gu)).toHaveLength(3);
  });

  it('keeps accessibility sweeps version-pinned, append-only, and tenant-isolated', () => {
    const migration = readAccessibilityGovernanceMigration();
    expect(migration).toContain('create table if not exists accessibility_sweeps');
    expect(migration).toContain('create table if not exists accessibility_findings');
    expect(migration).toContain('create table if not exists accessibility_finding_events');
    expect(migration).toContain('document_version_id text not null');
    expect(migration).toContain('accessibility_findings_release_gate_idx');
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/raw_(?:copy|content|html|css)|document_content/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps warehouse sync checkpointed, retryable, append-only, and secret-reference only', () => {
    const migration = readAnalyticsWarehouseSyncMigration();
    expect(migration).toContain('create table if not exists analytics_warehouse_destinations');
    expect(migration).toContain('create table if not exists analytics_warehouse_sync_runs');
    expect(migration).toContain("current_setting('lodariq.warehouse_worker', true)");
    expect(migration).toContain('credential_reference');
    expect(migration).not.toMatch(/credential_(?:value|secret)|secret_value|api_key/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps residency execution leased, evidence-only, additive, and tenant-isolated', () => {
    const migration = readDataResidencyExecutionMigration();
    expect(migration).toContain('create table if not exists data_residency_migration_evidence');
    expect(migration).toContain("current_setting('lodariq.residency_worker', true)");
    expect(migration).toContain('data_residency_migration_evidence_phase_idx');
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/raw_(?:record|payload|document)|document_content/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps provider billing normalized, replay-safe, retryable, and tenant-isolated', () => {
    const migration = readCommercialBillingLifecycleMigration();
    expect(migration).toContain('create table if not exists workspace_billing_accounts');
    expect(migration).toContain('create table if not exists billing_provider_events');
    expect(migration).toContain('create table if not exists billing_invoices');
    expect(migration).toContain('create table if not exists billing_meter_batches');
    expect(migration).toContain('billing_provider_events_provider_event_idx');
    expect(migration).toContain("current_setting('lodariq.billing_worker', true)");
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/payload_json|raw_payload|provider_secret/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps copy drift evidence append-only and tenant scoped', () => {
    const migration = readChangeAwareCopyRecordsMigration();
    expect(migration).toContain('authoring_copy_records');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('for select');
    expect(migration).toContain('for insert');
    expect(migration).not.toMatch(/create policy[^;]+for (?:update|delete)/isu);
  });

  it('keeps governance profiles narrowing, scoped, and production authoring fail closed', () => {
    const migration = readGovernanceCapabilityProfilesMigration();
    expect(migration).toContain('workspace_governance_capability_profile_assignments');
    expect(migration).toContain('governance_capability_profile_assignments');
    expect(migration).toContain("kind <> 'production'");
    expect(migration).toContain("'authoring:read','authoring:write','release:publish'");
    expect(migration).toContain('force row level security');
  });

  it('keeps webhook events durable, replayable, signed outside storage, and worker-scoped', () => {
    const migration = readOutboundWebhooksMigration();
    expect(migration).toContain('create table if not exists webhook_events');
    expect(migration).toContain('create table if not exists webhook_deliveries');
    expect(migration).toContain('webhook_deliveries_event_endpoint_idx');
    expect(migration).toContain("current_setting('lodariq.webhook_worker', true)");
    expect(migration).not.toMatch(/signing_secret|root_signing_key/iu);
  });

  it('keeps residency transitions provider-neutral, append-only, and tenant-isolated', () => {
    const migration = readDataResidencyControlsMigration();
    expect(migration).toContain('create table if not exists workspace_data_placements');
    expect(migration).toContain('create table if not exists data_residency_migrations');
    expect(migration).toContain('create table if not exists data_residency_migration_history');
    expect(migration).toContain("in ('us','eu','apac')");
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/aws|gcp|azure/iu);
  });

  it('keeps collaboration presence short-lived, semantic, and tenant-isolated', () => {
    const migration = readAuthoringCollaborationPresenceMigration();

    expect(migration).toContain('create table if not exists authoring_presence');
    expect(migration).toContain('authoring_presence_session_scope_fk');
    expect(migration).toContain('authoring_presence_selection_check');
    expect(migration).toContain('alter table authoring_presence force row level security');
    expect(migration).toContain('authoring_presence_workspace_isolation');
    expect(migration).not.toMatch(/(?:selector|coordinate|class_name|dom_|html|css)/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps trusted audience attribution additive and value-free', () => {
    const migration = readAnalyticsAudienceSegmentsMigration();

    expect(migration).toContain('audience_segment_id');
    expect(migration).toContain('analytics_events_audience_segment_identity_check');
    expect(migration).toContain('analytics_events_audience_segment_occurred_idx');
    expect(migration).not.toMatch(/audience_(?:rule|value|trait|event)_/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps analytics exports additive, private, retryable, and tenant-isolated', () => {
    const migration = readAnalyticsExportsMigration();

    expect(migration).toContain('create table if not exists analytics_export_jobs');
    expect(migration).toContain('create table if not exists analytics_export_audit_events');
    expect(migration).toContain('analytics_export_jobs_worker_update');
    expect(migration).toContain('result_content_base64');
    expect(migration).toContain('force row level security');
    expect(migration).not.toContain('update effective_entitlement_snapshots');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps narration audio additive and tenant-isolated', () => {
    const migration = readNarrationMediaMigration();

    expect(migration).toContain('create table if not exists authoring_narration_assets');
    expect(migration).toContain('authoring_narration_assets_kind_check');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('authoring_narration_assets_published_lookup');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps adaptive evidence additive, scoped, and key-minimizing', () => {
    const migration = readAdaptiveDeliveryMigration();

    expect(migration).toContain('adaptive_visitor_key_hash');
    expect(migration).toContain('analytics_events_adaptive_evidence_idx');
    expect(migration).not.toContain('assignment_key text');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps experiment delivery additive, tenant-isolated, and key-minimizing', () => {
    const migration = readExperimentDeliveryMigration();

    expect(migration).toContain('create table experience_experiment_allocations');
    expect(migration).toContain('create table experience_experiment_assignments');
    expect(migration).toContain('assignment_key_hash');
    expect(migration).toContain('force row level security');
    expect(migration).not.toContain('assignment_key text');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps delivery schedules additive, retryable, tenant-isolated, and auditable', () => {
    const migration = readDeliveryOrchestrationMigration();

    expect(migration).toContain('create table if not exists deployment_schedules');
    expect(migration).toContain('create table if not exists delivery_schedule_jobs');
    expect(migration).toContain('create table if not exists delivery_transition_history');
    expect(migration).toContain('create table if not exists workspace_data_catalog_entries');
    expect(migration).toContain('delivery_schedule_jobs_worker_update');
    expect(migration).toContain('force row level security');
    expect(migration).not.toContain('delivery_transition_history_workspace_update');
    expect(migration).not.toContain('delivery_transition_history_workspace_delete');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps commercial metering additive, tenant-isolated, and append-only', () => {
    const migration = readCommercialEntitlementsMigration();

    expect(migration).toContain('create table if not exists authoring_media_assets_v2');
    expect(migration).toContain('create table if not exists workspace_subscriptions');
    expect(migration).toContain('create table if not exists effective_entitlement_snapshots');
    expect(migration).toContain('create table if not exists workspace_usage_ledger');
    expect(migration).toContain('create table if not exists ai_credit_ledger');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('system:migration');
    expect(migration).not.toContain('effective_entitlement_snapshots_workspace_update');
    expect(migration).not.toContain('workspace_usage_ledger_workspace_update');
    expect(migration).not.toContain('ai_credit_ledger_workspace_update');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps threaded review additive, tenant-scoped, and auditable', () => {
    const migration = readExperienceCommentThreadsMigration();

    expect(migration).toContain('add column if not exists parent_comment_id text');
    expect(migration).toContain('create table if not exists experience_comment_audit_events');
    expect(migration).toContain(
      'alter table experience_comment_audit_events force row level security',
    );
    expect(migration).toContain(
      'create policy experience_comment_audit_events_workspace_isolation on experience_comment_audit_events',
    );
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column)\b/iu);
  });

  it('keeps account security additive, forced-RLS, and least-privilege', () => {
    const migration = readAccountSessionManagementMigration();
    expect(migration).toContain('alter table account_security_events force row level security');
    expect(migration).toContain(
      'alter table account_email_change_challenges force row level security',
    );
    expect(migration).toContain('alter table account_email_change_outbox force row level security');
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on function public.lodariq_schedule_account_deletion');
    expect(migration).not.toMatch(
      /grant execute on function public\.lodariq_schedule_account_deletion[\s\S]*?to public/u,
    );
    expect(migration).toContain("last_error = 'account_deleted'");
  });

  it('keeps passkey and recovery persistence additive, forced-RLS, and secret-minimizing', () => {
    const migration = readAssurancePasskeysRecoveryMigration();
    expect(migration).toContain('create table if not exists webauthn_challenges');
    expect(migration).toContain('create table if not exists passkey_credentials');
    expect(migration).toContain('create table if not exists recovery_code_sets');
    expect(migration).toContain('create table if not exists recovery_codes');
    expect(migration).toContain('alter table passkey_credentials force row level security');
    expect(migration).toContain('alter table recovery_codes force row level security');
    expect(migration).toContain('passkey_credentials_credential_update');
    expect(migration).toContain('recovery_codes_hash_consume');
    expect(migration).not.toMatch(/\b(?:access_token|refresh_token|raw_code|private_key)\b/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps OIDC callback state single-use, forced-RLS, and token-minimizing', () => {
    const migration = readOidcAuthorizationMigration();
    expect(migration).toContain('create table if not exists oidc_authorization_attempts');
    expect(migration).toContain('alter table oidc_authorization_attempts force row level security');
    expect(migration).toContain('oidc_authorization_attempts_bound_consume');
    expect(migration).not.toMatch(/\b(?:access_token|refresh_token|authorization_code)\b/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps enterprise identity additive, externally validated, and secret-minimizing', () => {
    const migration = readEnterpriseIdentityMigration();
    expect(migration).toContain('create table if not exists enterprise_validation_evidence');
    expect(migration).toContain('create table if not exists enterprise_scim_connections');
    expect(migration).toContain('create table if not exists enterprise_principals');
    expect(migration).toContain('force row level security');
    expect(migration).toContain("current_user = 'lodariq_enterprise_validator'");
    expect(migration).toContain('auth_sessions_enterprise_connection_disable');
    expect(migration).not.toMatch(/\b(?:raw_token|client_secret|access_token|refresh_token)\b/iu);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('keeps experience measurement additive, tenant-isolated, and single-live-experiment', () => {
    const migration = readExperienceMeasurementMigration();
    expect(migration).toContain('create table if not exists experience_measurement');
    expect(migration).toContain('create table if not exists experience_experiments');
    expect(migration).toContain('create table if not exists experience_form_responses');
    expect(migration).toContain('create table if not exists experience_step_locks');
    expect(migration).toContain('create table if not exists workspace_applications');
    // One live experiment per document, and one primary application per workspace.
    expect(migration).toContain("where status in ('draft', 'running')");
    expect(migration).toContain("where is_primary = 'true'");
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
  });

  it('preserves renderer-v3 verification evidence while admitting renderer-v4 writes', () => {
    const migration = readPublicationVerificationRendererV4Migration();

    expect(migration).toContain("rendererContractVersion' in ('3', '4')");
    expect(migration).toContain(') not valid;');
    expect(migration).toContain('validate constraint publication_verifications_report_json_check;');
  });

  it('keeps future renderer evidence schema-valid without another literal-version migration', () => {
    const migration = readPublicationVerificationRendererContractMigration();

    expect(migration).toContain("rendererContractVersion' ~ '^[1-9][0-9]{0,31}$'");
    expect(migration).not.toContain("rendererContractVersion' in (");
    expect(migration).toContain(') not valid;');
    expect(migration).toContain('validate constraint publication_verifications_report_json_check;');
  });

  it('passes when all checked-in migrations carry required sign-off metadata', () => {
    expect(runMigrationCheck()).toContain('Migration safety check passed');
  });

  it('applies the initial baseline atomically', () => {
    const baseline = readInitialBaseline();
    expect(baseline).toMatch(/\nbegin;\n/u);
    expect(baseline.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('keeps provider-neutral identity expansion additive and fail-closed', () => {
    const migration = readProviderNeutralIdentityMigration();

    expect(migration).toContain('raise exception');
    expect(migration).toContain('ambiguous normalized email data');
    expect(migration).toContain('insert into user_emails');
    expect(migration).toContain('insert into auth_identities');
    expect(migration).toContain('alter table auth_sessions add column if not exists');
    expect(migration).toContain('force row level security');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
    expect(migration).not.toMatch(/\bupdate\s+(?:users|password_credentials|auth_sessions)\b/iu);
  });

  it('keeps onboarding expansion additive and security history append-only', () => {
    const migration = readResumableIdentityOnboardingMigration();

    expect(migration).toContain('create table if not exists identity_onboarding_states');
    expect(migration).toContain('create table if not exists auth_security_events');
    expect(migration).toContain('identity_onboarding_active_user_idx');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('auth_security_events_owned_insert');
    expect(migration).not.toContain('auth_security_events_owned_update');
    expect(migration).not.toContain('auth_security_events_owned_delete');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
    expect(migration).not.toMatch(/\bupdate\s+(?:users|workspaces|workspace_memberships)\b/iu);
  });

  it('keeps tenant administration additive and its audit ledger append-only', () => {
    const migration = readTenantAdministrationMigration();

    expect(migration).toContain('create table if not exists tenant_audit_events');
    expect(migration).toContain('create table if not exists workspace_invitation_outbox');
    expect(migration).toContain('workspace_invitation_outbox_worker_update');
    expect(migration).toContain('tenant_audit_events_workspace_insert');
    expect(migration).not.toContain('tenant_audit_events_workspace_update');
    expect(migration).not.toContain('tenant_audit_events_workspace_delete');
    expect(migration).toContain('workspace_memberships_invitation_accept');
    expect(migration).toContain('workspace_invitations_token_accept_lookup');
    expect(migration).toContain('user_emails_workspace_reference');
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/iu);
    expect(migration).not.toMatch(/\bupdate\s+(?:users|workspaces|workspace_memberships)\b/iu);
  });

  it('fails destructive migrations without explicit shared-environment sign-off', () => {
    const directory = createTempMigrationDir({
      '0001_drop_table.sql': 'drop table documents;',
    });

    try {
      expect(() => runMigrationCheck(directory)).toThrow(/Destructive migration guard failed/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('allows paired policy replacement but rejects a policy-only drop', () => {
    const replacementDirectory = createTempMigrationDir({
      '0001_replace_policy.sql': [
        'begin;',
        'drop policy if exists documents_workspace_isolation on documents;',
        'create policy documents_workspace_isolation on documents for select using (true);',
        'commit;',
      ].join('\n'),
    });
    const removalDirectory = createTempMigrationDir({
      '0001_remove_policy.sql': 'drop policy if exists documents_workspace_isolation on documents;',
    });

    try {
      expect(runMigrationCheck(replacementDirectory)).toContain('Migration safety check passed');
      expect(() => runMigrationCheck(removalDirectory)).toThrow(
        /DROP POLICY is allowed only when the same migration recreates or alters it/u,
      );
    } finally {
      rmSync(replacementDirectory, { recursive: true, force: true });
      rmSync(removalDirectory, { recursive: true, force: true });
    }
  });

  it('allows destructive migrations only when the file carries explicit sign-off metadata', () => {
    const directory = createTempMigrationDir({
      '0001_signed_drop_table.sql': [
        '-- lodariq-shared-env-destructive-migration-signoff: user@example.com 2026-06-30 APPROVED-123',
        'drop table documents;',
      ].join('\n'),
    });

    try {
      expect(runMigrationCheck(directory)).toContain('Migration safety check passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runMigrationCheck(directory?: string): string {
  try {
    return execFileSync(process.execPath, directory ? [scriptPath, directory] : [scriptPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    if (isExecError(error)) {
      throw new Error(`${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
}

function createTempMigrationDir(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'lodariq-migrations-'));
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(directory, file), contents);
  }
  return directory;
}

function isExecError(
  error: unknown,
): error is Error & { stdout: string | Buffer; stderr: string | Buffer } {
  return Boolean(error && typeof error === 'object' && 'stdout' in error && 'stderr' in error);
}

describe('destructive statements hidden by quoting', () => {
  /*
   * The guard stripped single-quoted strings before block comments, so an
   * apostrophe in prose opened a phantom string literal that blanked every
   * statement up to the next apostrophe. Two of them in comments made an
   * unapproved DROP invisible to the control that decides what may reach
   * development and staging.
   */
  it('reports a drop sitting between two apostrophes in comments', () => {
    expect(
      guardCodesFor(
        [
          'begin;',
          "/* This directory's guard protects shared environments. */",
          'alter table foo',
          '  drop constraint if exists bar_check;',
          "/* And 0025's rename is guarded. */",
          'commit;',
        ].join('\n'),
      ),
    ).toEqual(['alter-table-drop']);
  });

  it('still reads a real string literal as a string', () => {
    expect(
      guardCodesFor(
        [
          'begin;',
          "insert into t(note) values ('drop constraint x; delete from y');",
          'commit;',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('does not let a line comment inside a literal swallow the next statement', () => {
    expect(
      guardCodesFor(
        [
          'begin;',
          "insert into t(note) values ('-- not a comment');",
          'truncate t;',
          'commit;',
        ].join('\n'),
      ),
    ).toEqual(['truncate-statement']);
  });

  it('keeps line numbers true across a multi-line comment', () => {
    const directory = createTempMigrationDir({
      '0001_case.sql': ['begin;', '/* one', '   two', '   three */', 'truncate t;', 'commit;'].join(
        '\n',
      ),
    });
    try {
      expect(() => runMigrationCheck(directory)).toThrow(/0001_case\.sql:5/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function guardCodesFor(sql: string): string[] {
  const directory = createTempMigrationDir({ '0001_case.sql': sql });
  try {
    runMigrationCheck(directory);
    return [];
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return [...text.matchAll(/\[([a-z-]+)\]/gu)].map((match) => match[1] ?? '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
