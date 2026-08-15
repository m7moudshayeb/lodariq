import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/verify-live-rls.mjs', import.meta.url),
);

describe('live Neon RLS verification script', () => {
  it('covers public SDK and hosted-authoring tenant and token policies', () => {
    const source = readFileSync(scriptPath, 'utf8');
    for (const table of [
      'public_sdk_installations',
      'public_sdk_installation_origins',
      'public_sdk_bootstrap_grants',
      'authoring_authorization_requests',
      'authoring_activation_grants',
      'authoring_sessions',
    ]) {
      expect(source).toContain(`'${table}'`);
    }
    expect(source).toContain("['authoring_sessions', 'authoring_sessions_token_lookup']");
  });

  it('covers every owned-auth table and its identity bridge policies', () => {
    const source = readFileSync(scriptPath, 'utf8');
    for (const table of [
      'users',
      'password_credentials',
      'auth_sessions',
      'auth_security_events',
      'account_security_events',
      'account_email_change_challenges',
      'account_email_change_outbox',
      'identity_onboarding_states',
      'email_verification_challenges',
      'auth_outbox',
      'set_password_challenges',
      'set_password_outbox',
      'auth_rate_limits',
    ]) {
      expect(source).toContain(`'${table}'`);
    }
    for (const policy of [
      'users_auth_self',
      'password_credentials_email_lookup',
      'auth_sessions_token_lookup',
      'email_verification_challenges_token_consume',
      'email_verification_challenges_auth_user_lookup',
      'set_password_challenges_token_consume',
      'set_password_challenges_user_lookup',
      'set_password_outbox_worker_update',
      'set_password_outbox_auth_user_lookup',
      'auth_outbox_worker_update',
      'auth_outbox_auth_user_lookup',
      'auth_rate_limits_prune_delete',
      'workspace_memberships_user_discovery',
      'workspaces_user_discovery',
      'authoring_authorization_requests_auth_user_lookup',
      'auth_security_events_owned_insert',
      'account_security_events_owned_insert',
      'account_email_change_challenges_owned_update',
      'account_email_change_outbox_worker_update',
      'identity_onboarding_states_owned_update',
    ]) {
      expect(source).toContain(`'${policy}'`);
    }
    expect(source).toContain('const rlsProtectedTables = [...tenantScopedTables');
    expect(source).toContain('verifyExpectedPolicies(policies, identityPolicies');
    expect(source).toContain("'auth_security_events',");
    expect(source).toContain('const appendOnlyRuntimeTables = [');
  });

  it('covers append-only Phase 2 style, release, and analytics evidence', () => {
    const source = readFileSync(scriptPath, 'utf8');
    for (const table of [
      'compiled_artifacts',
      'publications',
      'style_sources',
      'product_style_applications',
      'publication_verifications',
      'release_approvals',
      'analytics_events',
    ]) {
      expect(source).toContain(`'${table}'`);
    }
    for (const table of [
      'style_sources',
      'product_style_applications',
      'publication_verifications',
      'release_approvals',
      'analytics_events',
    ]) {
      expect(source).toContain(`select id from ${table}`);
    }
    expect(source).toContain(
      "policies.has('release_operations:release_operations_lifecycle_update')",
    );
    expect(source).toContain("row.cmd === 'ALL' || row.cmd === 'DELETE'");
  });

  it('covers enterprise isolation, validator evidence, and connection-disable revocation policy', () => {
    const source = readFileSync(scriptPath, 'utf8');
    for (const table of [
      'sso_connections',
      'enterprise_validation_evidence',
      'workspace_verified_domains',
      'sso_group_role_mappings',
      'enterprise_scim_connections',
      'enterprise_principals',
      'enterprise_audit_events',
      'enterprise_break_glass_requests',
    ]) {
      expect(source).toContain(`'${table}'`);
    }
    for (const policy of [
      'enterprise_validation_evidence_operator_write',
      'enterprise_scim_connections_token_access',
      'enterprise_principals_scim_access',
      'enterprise_audit_events_workspace_insert',
      'auth_sessions_enterprise_connection_disable',
      'auth_sessions_enterprise_connection_disable_select',
      'auth_sessions_scim_revoke',
      'auth_sessions_scim_revoke_select',
      'workspace_memberships_enterprise_oidc_update',
      'sso_group_role_mappings_enterprise_authorization',
      'sso_group_role_mappings_scim_authorization',
    ]) {
      expect(source).toContain(`'${policy}'`);
    }
    expect(source).toContain('const workspaceIsolationPolicyNames = new Map');
  });

  it('activates a scratch theme only after its approved version exists', () => {
    const source = readFileSync(scriptPath, 'utf8');
    const scratchStart = source.indexOf('async function expectVersionAndPublicationRecords');
    const scratchEnd = source.indexOf('async function createScratchWorkspace', scratchStart);
    const scratchSource = source.slice(scratchStart, scratchEnd);
    const draftInsert = scratchSource.indexOf('1, false)');
    const versionInsert = scratchSource.indexOf('insert into theme_versions');
    const activation = scratchSource.indexOf('is_default = true');

    expect(draftInsert).toBeGreaterThan(-1);
    expect(versionInsert).toBeGreaterThan(draftInsert);
    expect(activation).toBeGreaterThan(versionInsert);
  });

  it('fails closed without a live DATABASE_URL', () => {
    expect(() => runLiveRlsCheck({ DATABASE_URL: '' })).toThrow(
      /DATABASE_URL is required for live Neon RLS verification/,
    );
  });

  it('requires explicit scratch-write consent before opening a live connection', () => {
    expect(() =>
      runLiveRlsCheck({
        DATABASE_URL: 'postgres://user:password@example.invalid/neondb',
        LODARIQ_LIVE_RLS_WRITE_CHECK: '',
      }),
    ).toThrow(/LODARIQ_LIVE_RLS_WRITE_CHECK must be set/);
  });
});

function runLiveRlsCheck(env: Record<string, string>): string {
  try {
    return execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: 'pipe',
    });
  } catch (error) {
    if (isExecError(error)) {
      throw new Error(`${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
}

function isExecError(
  error: unknown,
): error is Error & { stdout: string | Buffer; stderr: string | Buffer } {
  return Boolean(error && typeof error === 'object' && 'stdout' in error && 'stderr' in error);
}
