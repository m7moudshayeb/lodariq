import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/provision-runtime-role.mjs', import.meta.url),
);

const consent = 'I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES';

describe('runtime database role provisioning script', () => {
  it('revokes mutation privileges from immutable Phase 2 evidence tables', () => {
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
    expect(source).toContain('revoke update, delete on table');
    expect(source).toContain("has_table_privilege(${roleName}, ${table}, 'UPDATE')");
    expect(source).toContain('revoke update, delete on table "release_operations"');
    expect(source).toContain(
      "grant update (${releaseOperationLifecycleColumns.map(quoteIdent).join(', ')})",
    );
    expect(source).toContain("has_column_privilege(${roleName}, 'release_operations', 'reason', 'UPDATE')");
  });

  it('fails closed without an admin DATABASE_URL', () => {
    expect(() => runProvisioning({ DATABASE_URL: '' })).toThrow(
      /DATABASE_URL is required for runtime role provisioning/,
    );
  });

  it('requires explicit privilege-change consent before connecting', () => {
    expect(() =>
      runProvisioning({
        DATABASE_URL: 'postgres://owner:password@example.invalid/neondb',
        LODARIQ_RUNTIME_ROLE_PROVISIONING: '',
      }),
    ).toThrow(/LODARIQ_RUNTIME_ROLE_PROVISIONING must be set/);
  });

  it('rejects unsafe runtime role names before connecting', () => {
    expect(() =>
      runProvisioning({
        DATABASE_URL: 'postgres://owner:password@example.invalid/neondb',
        LODARIQ_RUNTIME_ROLE_PROVISIONING: consent,
        LODARIQ_RUNTIME_DB_ROLE: 'lodariq-app',
        LODARIQ_RUNTIME_DB_PASSWORD: 'a'.repeat(32),
      }),
    ).toThrow(/LODARIQ_RUNTIME_DB_ROLE must be a lowercase PostgreSQL identifier/);
  });

  it('requires a strong runtime role password before connecting', () => {
    expect(() =>
      runProvisioning({
        DATABASE_URL: 'postgres://owner:password@example.invalid/neondb',
        LODARIQ_RUNTIME_ROLE_PROVISIONING: consent,
        LODARIQ_RUNTIME_DB_ROLE: 'lodariq_app',
        LODARIQ_RUNTIME_DB_PASSWORD: 'short',
      }),
    ).toThrow(/LODARIQ_RUNTIME_DB_PASSWORD must be at least 32 characters/);
  });
});

function runProvisioning(env: Record<string, string>): string {
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
