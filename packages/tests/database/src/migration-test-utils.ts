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
