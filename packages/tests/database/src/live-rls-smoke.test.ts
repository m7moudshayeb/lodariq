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
      'set_password_challenges_token_consume',
      'set_password_outbox_worker_update',
      'auth_outbox_worker_update',
      'auth_rate_limits_prune_delete',
      'workspace_memberships_user_discovery',
      'workspaces_user_discovery',
      'authoring_authorization_requests_auth_user_lookup',
    ]) {
      expect(source).toContain(`'${policy}'`);
    }
    expect(source).toContain('const rlsProtectedTables = [...tenantScopedTables');
    expect(source).toContain('verifyExpectedPolicies(policies, identityPolicies');
  });

  it('covers append-only Phase 2 style, verification, and approval evidence', () => {
    const source = readFileSync(scriptPath, 'utf8');
    for (const table of ['style_sources', 'publication_verifications', 'release_approvals']) {
      expect(source).toContain(`'${table}'`);
      expect(source).toContain(`select id from ${table}`);
    }
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
