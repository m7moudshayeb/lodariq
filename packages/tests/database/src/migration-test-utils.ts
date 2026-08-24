import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INITIAL_BASELINE_FILE_NAME = '0000_initial_baseline.sql';
export const PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME =
  '0001_publication_verification_renderer_v3.sql';
export const PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME =
  '0002_publication_verification_renderer_v4.sql';
export const PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME =
  '0003_publication_verification_renderer_contract.sql';
export const AUTHORING_RESOURCES_FILE_NAME = '0004_authoring_resources.sql';
export const AUTH_RECOVERY_RLS_FILE_NAME = '0005_auth_recovery_rls.sql';
export const AUTH_LIFECYCLE_RELIABILITY_FILE_NAME = '0006_auth_lifecycle_reliability.sql';
export const PROVIDER_NEUTRAL_IDENTITY_FILE_NAME = '0007_provider_neutral_identity.sql';
export const RESUMABLE_IDENTITY_ONBOARDING_FILE_NAME = '0008_resumable_identity_onboarding.sql';
export const TENANT_ADMINISTRATION_FILE_NAME = '0009_tenant_administration.sql';
export const ACCOUNT_SESSION_MANAGEMENT_FILE_NAME = '0010_account_session_management.sql';
export const ASSURANCE_PASSKEYS_RECOVERY_FILE_NAME = '0011_assurance_passkeys_recovery.sql';
export const OIDC_AUTHORIZATION_FILE_NAME = '0012_oidc_authorization.sql';
export const ENTERPRISE_IDENTITY_FILE_NAME = '0013_enterprise_identity.sql';
export const EXPERIENCE_MEASUREMENT_FILE_NAME = '0014_experience_measurement.sql';
export const SDK_INSTALLATION_KILL_SWITCH_FILE_NAME = '0015_sdk_installation_kill_switch.sql';
export const EXPERIENCE_COMMENT_THREADS_FILE_NAME = '0016_experience_comment_threads.sql';
export const COMMERCIAL_ENTITLEMENTS_FILE_NAME = '0017_commercial_entitlements.sql';
export const DELIVERY_ORCHESTRATION_FILE_NAME = '0018_delivery_orchestration.sql';
export const EXPERIMENT_DELIVERY_FILE_NAME = '0019_experiment_delivery.sql';
export const ADAPTIVE_DELIVERY_FILE_NAME = '0020_adaptive_delivery.sql';
export const NARRATION_MEDIA_FILE_NAME = '0021_narration_media.sql';
export const ANALYTICS_EXPORTS_FILE_NAME = '0022_analytics_exports.sql';
export const ANALYTICS_AUDIENCE_SEGMENTS_FILE_NAME = '0023_analytics_audience_segments.sql';
export const AUTHORING_COLLABORATION_PRESENCE_FILE_NAME =
  '0024_authoring_collaboration_presence.sql';
export const GOVERNANCE_CAPABILITY_PROFILES_FILE_NAME = '0025_governance_capability_profiles.sql';
export const OUTBOUND_WEBHOOKS_FILE_NAME = '0026_outbound_webhooks.sql';
export const DATA_RESIDENCY_CONTROLS_FILE_NAME = '0027_data_residency_controls.sql';
export const AUTHORING_ROADMAP_RECORDS_FILE_NAME = '0028_authoring_roadmap_records.sql';
export const CHANGE_AWARE_COPY_RECORDS_FILE_NAME = '0029_change_aware_copy_records.sql';
export const COMMERCIAL_BILLING_LIFECYCLE_FILE_NAME = '0030_commercial_billing_lifecycle.sql';
export const DATA_RESIDENCY_EXECUTION_FILE_NAME = '0031_data_residency_execution.sql';
export const ANALYTICS_WAREHOUSE_SYNC_FILE_NAME = '0032_analytics_warehouse_sync.sql';
export const ACCESSIBILITY_GOVERNANCE_FILE_NAME = '0033_accessibility_governance.sql';
export const AUTHORING_SESSION_CAPABILITIES_FILE_NAME = '0034_authoring_session_capabilities.sql';
export const RLS_SCOPE_CONTAINMENT_FILE_NAME = '0035_rls_scope_containment.sql';
export const CROSS_SCOPE_FOREIGN_KEYS_FILE_NAME = '0036_cross_scope_foreign_keys.sql';
export const BILLING_BATCH_RECOVERY_FILE_NAME = '0037_billing_batch_recovery.sql';
export const HOT_QUERY_INDEXES_FILE_NAME = '0038_hot_query_indexes.sql';
export const ANALYTICS_EVENTS_INDEXES_FILE_NAME = '0039_analytics_events_indexes.sql';
export const DEAD_LETTER_AND_ROTATION_FILE_NAME = '0040_dead_letter_and_rotation.sql';
export const ANALYTICS_EVENTS_PARTITIONING_FILE_NAME = '0041_analytics_events_partitioning.sql';

export const INITIAL_BASELINE_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${INITIAL_BASELINE_FILE_NAME}`, import.meta.url),
);
export const PUBLICATION_VERIFICATION_RENDERER_V4_PATH = fileURLToPath(
  new URL(
    `../../../database/drizzle/${PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME}`,
    import.meta.url,
  ),
);
export const PUBLICATION_VERIFICATION_RENDERER_CONTRACT_PATH = fileURLToPath(
  new URL(
    `../../../database/drizzle/${PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME}`,
    import.meta.url,
  ),
);
export const AUTH_RECOVERY_RLS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${AUTH_RECOVERY_RLS_FILE_NAME}`, import.meta.url),
);
export const PROVIDER_NEUTRAL_IDENTITY_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${PROVIDER_NEUTRAL_IDENTITY_FILE_NAME}`, import.meta.url),
);
export const RESUMABLE_IDENTITY_ONBOARDING_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${RESUMABLE_IDENTITY_ONBOARDING_FILE_NAME}`, import.meta.url),
);
export const TENANT_ADMINISTRATION_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${TENANT_ADMINISTRATION_FILE_NAME}`, import.meta.url),
);
export const ACCOUNT_SESSION_MANAGEMENT_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ACCOUNT_SESSION_MANAGEMENT_FILE_NAME}`, import.meta.url),
);
export const ASSURANCE_PASSKEYS_RECOVERY_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ASSURANCE_PASSKEYS_RECOVERY_FILE_NAME}`, import.meta.url),
);
export const OIDC_AUTHORIZATION_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${OIDC_AUTHORIZATION_FILE_NAME}`, import.meta.url),
);
export const ENTERPRISE_IDENTITY_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ENTERPRISE_IDENTITY_FILE_NAME}`, import.meta.url),
);
export const EXPERIENCE_MEASUREMENT_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${EXPERIENCE_MEASUREMENT_FILE_NAME}`, import.meta.url),
);
export const EXPERIENCE_COMMENT_THREADS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${EXPERIENCE_COMMENT_THREADS_FILE_NAME}`, import.meta.url),
);
export const COMMERCIAL_ENTITLEMENTS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${COMMERCIAL_ENTITLEMENTS_FILE_NAME}`, import.meta.url),
);
export const DELIVERY_ORCHESTRATION_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${DELIVERY_ORCHESTRATION_FILE_NAME}`, import.meta.url),
);
export const EXPERIMENT_DELIVERY_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${EXPERIMENT_DELIVERY_FILE_NAME}`, import.meta.url),
);
export const ADAPTIVE_DELIVERY_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ADAPTIVE_DELIVERY_FILE_NAME}`, import.meta.url),
);
export const NARRATION_MEDIA_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${NARRATION_MEDIA_FILE_NAME}`, import.meta.url),
);
export const ANALYTICS_EXPORTS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ANALYTICS_EXPORTS_FILE_NAME}`, import.meta.url),
);
export const ANALYTICS_AUDIENCE_SEGMENTS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ANALYTICS_AUDIENCE_SEGMENTS_FILE_NAME}`, import.meta.url),
);
export const AUTHORING_COLLABORATION_PRESENCE_PATH = fileURLToPath(
  new URL(
    `../../../database/drizzle/${AUTHORING_COLLABORATION_PRESENCE_FILE_NAME}`,
    import.meta.url,
  ),
);
export const GOVERNANCE_CAPABILITY_PROFILES_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${GOVERNANCE_CAPABILITY_PROFILES_FILE_NAME}`, import.meta.url),
);
export const OUTBOUND_WEBHOOKS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${OUTBOUND_WEBHOOKS_FILE_NAME}`, import.meta.url),
);
export const DATA_RESIDENCY_CONTROLS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${DATA_RESIDENCY_CONTROLS_FILE_NAME}`, import.meta.url),
);
export const AUTHORING_ROADMAP_RECORDS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${AUTHORING_ROADMAP_RECORDS_FILE_NAME}`, import.meta.url),
);
export const CHANGE_AWARE_COPY_RECORDS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${CHANGE_AWARE_COPY_RECORDS_FILE_NAME}`, import.meta.url),
);
export const COMMERCIAL_BILLING_LIFECYCLE_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${COMMERCIAL_BILLING_LIFECYCLE_FILE_NAME}`, import.meta.url),
);
export const DATA_RESIDENCY_EXECUTION_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${DATA_RESIDENCY_EXECUTION_FILE_NAME}`, import.meta.url),
);
export const ANALYTICS_WAREHOUSE_SYNC_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ANALYTICS_WAREHOUSE_SYNC_FILE_NAME}`, import.meta.url),
);
export const ACCESSIBILITY_GOVERNANCE_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${ACCESSIBILITY_GOVERNANCE_FILE_NAME}`, import.meta.url),
);
export const AUTHORING_SESSION_CAPABILITIES_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${AUTHORING_SESSION_CAPABILITIES_FILE_NAME}`, import.meta.url),
);
export const CROSS_SCOPE_FOREIGN_KEYS_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${CROSS_SCOPE_FOREIGN_KEYS_FILE_NAME}`, import.meta.url),
);

export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../database/drizzle/', import.meta.url),
);

export function readInitialBaseline(): string {
  return readFileSync(INITIAL_BASELINE_PATH, 'utf8');
}

export function readPublicationVerificationRendererV4Migration(): string {
  return readFileSync(PUBLICATION_VERIFICATION_RENDERER_V4_PATH, 'utf8');
}

export function readPublicationVerificationRendererContractMigration(): string {
  return readFileSync(PUBLICATION_VERIFICATION_RENDERER_CONTRACT_PATH, 'utf8');
}

export function readAuthRecoveryRlsMigration(): string {
  return readFileSync(AUTH_RECOVERY_RLS_PATH, 'utf8');
}

export function readProviderNeutralIdentityMigration(): string {
  return readFileSync(PROVIDER_NEUTRAL_IDENTITY_PATH, 'utf8');
}

export function readResumableIdentityOnboardingMigration(): string {
  return readFileSync(RESUMABLE_IDENTITY_ONBOARDING_PATH, 'utf8');
}

export function readTenantAdministrationMigration(): string {
  return readFileSync(TENANT_ADMINISTRATION_PATH, 'utf8');
}

export function readAccountSessionManagementMigration(): string {
  return readFileSync(ACCOUNT_SESSION_MANAGEMENT_PATH, 'utf8');
}

export function readAssurancePasskeysRecoveryMigration(): string {
  return readFileSync(ASSURANCE_PASSKEYS_RECOVERY_PATH, 'utf8');
}

export function readOidcAuthorizationMigration(): string {
  return readFileSync(OIDC_AUTHORIZATION_PATH, 'utf8');
}

export function readEnterpriseIdentityMigration(): string {
  return readFileSync(ENTERPRISE_IDENTITY_PATH, 'utf8');
}

export function readExperienceMeasurementMigration(): string {
  return readFileSync(EXPERIENCE_MEASUREMENT_PATH, 'utf8');
}

export function readExperienceCommentThreadsMigration(): string {
  return readFileSync(EXPERIENCE_COMMENT_THREADS_PATH, 'utf8');
}

export function readCommercialEntitlementsMigration(): string {
  return readFileSync(COMMERCIAL_ENTITLEMENTS_PATH, 'utf8');
}

export function readDeliveryOrchestrationMigration(): string {
  return readFileSync(DELIVERY_ORCHESTRATION_PATH, 'utf8');
}

export function readExperimentDeliveryMigration(): string {
  return readFileSync(EXPERIMENT_DELIVERY_PATH, 'utf8');
}

export function readAdaptiveDeliveryMigration(): string {
  return readFileSync(ADAPTIVE_DELIVERY_PATH, 'utf8');
}

export function readNarrationMediaMigration(): string {
  return readFileSync(NARRATION_MEDIA_PATH, 'utf8');
}

export function readAnalyticsExportsMigration(): string {
  return readFileSync(ANALYTICS_EXPORTS_PATH, 'utf8');
}

export function readAnalyticsAudienceSegmentsMigration(): string {
  return readFileSync(ANALYTICS_AUDIENCE_SEGMENTS_PATH, 'utf8');
}

export function readAuthoringCollaborationPresenceMigration(): string {
  return readFileSync(AUTHORING_COLLABORATION_PRESENCE_PATH, 'utf8');
}

export function readGovernanceCapabilityProfilesMigration(): string {
  return readFileSync(GOVERNANCE_CAPABILITY_PROFILES_PATH, 'utf8');
}

export function readOutboundWebhooksMigration(): string {
  return readFileSync(OUTBOUND_WEBHOOKS_PATH, 'utf8');
}

export function readDataResidencyControlsMigration(): string {
  return readFileSync(DATA_RESIDENCY_CONTROLS_PATH, 'utf8');
}

export function readAuthoringRoadmapRecordsMigration(): string {
  return readFileSync(AUTHORING_ROADMAP_RECORDS_PATH, 'utf8');
}

export function readChangeAwareCopyRecordsMigration(): string {
  return readFileSync(CHANGE_AWARE_COPY_RECORDS_PATH, 'utf8');
}

export function readCommercialBillingLifecycleMigration(): string {
  return readFileSync(COMMERCIAL_BILLING_LIFECYCLE_PATH, 'utf8');
}

export function readDataResidencyExecutionMigration(): string {
  return readFileSync(DATA_RESIDENCY_EXECUTION_PATH, 'utf8');
}

export function readAnalyticsWarehouseSyncMigration(): string {
  return readFileSync(ANALYTICS_WAREHOUSE_SYNC_PATH, 'utf8');
}

export function readAccessibilityGovernanceMigration(): string {
  return readFileSync(ACCESSIBILITY_GOVERNANCE_PATH, 'utf8');
}

export function readAuthoringSessionCapabilitiesMigration(): string {
  return readFileSync(AUTHORING_SESSION_CAPABILITIES_PATH, 'utf8');
}

export function readCrossScopeForeignKeysMigration(): string {
  return readFileSync(CROSS_SCOPE_FOREIGN_KEYS_PATH, 'utf8');
}

export function listCheckedInSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

export function listCheckedInSqlPaths(): string[] {
  return listCheckedInSqlFiles().map((fileName) => join(MIGRATIONS_DIRECTORY, fileName));
}

export function readMigrationChain(): string {
  return listCheckedInSqlPaths()
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

export function sqlWithoutFunctionBodies(sql: string): string {
  return sql.replace(/\$\$[\s\S]*?\$\$/gu, '');
}
