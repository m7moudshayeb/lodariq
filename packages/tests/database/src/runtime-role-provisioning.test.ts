import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/provision-runtime-role.mjs', import.meta.url),
);

const consent = 'I_UNDERSTAND_THIS_CHANGES_DATABASE_PRIVILEGES';

describe('runtime database role provisioning script', () => {
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
