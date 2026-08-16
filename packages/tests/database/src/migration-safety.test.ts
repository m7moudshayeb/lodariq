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
  listCheckedInSqlFiles,
  readInitialBaseline,
  readProviderNeutralIdentityMigration,
  readResumableIdentityOnboardingMigration,
  readTenantAdministrationMigration,
  readAccountSessionManagementMigration,
  readAssurancePasskeysRecoveryMigration,
  readOidcAuthorizationMigration,
  readEnterpriseIdentityMigration,
  readPublicationVerificationRendererContractMigration,
  readPublicationVerificationRendererV4Migration,
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
    ]);
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

  it('passes the checked-in initial baseline', () => {
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
