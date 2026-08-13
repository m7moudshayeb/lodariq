import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../scripts/check-local-auth-env.mjs', import.meta.url),
);

describe('production-parity local authentication environment', () => {
  it('accepts a restricted Neon runtime URL and complete Resend configuration', () => {
    expect(runCheck(validEnvironment())).toContain(
      'Lodariq local Neon + Resend authentication environment is ready.',
    );
  });

  it('does not require the migration-only Neon owner URL', () => {
    expect(runCheck(validEnvironment({ NEON_DB_URL: '' }))).toContain('environment is ready');
  });

  it('rejects an owner role as the application database identity', () => {
    expect(() =>
      runCheck(
        validEnvironment({
          DATABASE_URL:
            'postgresql://neondb_owner:sensitive-password@ep-local.us-east-2.aws.neon.tech/neondb?sslmode=require',
        }),
      ),
    ).toThrow(/DATABASE_URL must use a non-owner Neon runtime role/);
  });

  it('requires real email delivery without exposing supplied secret values', () => {
    const secretMarker = 'must-not-appear-in-diagnostics';
    expect(() =>
      runCheck(
        validEnvironment({
          LODARIQ_AUTH_EMAIL_TOKEN_SECRET: secretMarker,
          RESEND_API_KEY: '',
        }),
      ),
    ).toThrow(expect.not.stringContaining(secretMarker));
  });
});

function validEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL:
      'postgresql://lodariq_runtime:runtime-password@ep-local.us-east-2.aws.neon.tech/neondb?sslmode=require',
    LODARIQ_AUTH_EMAIL_FROM: 'Lodariq Dev <access@dev.lodariq.io>',
    LODARIQ_AUTH_EMAIL_TOKEN_SECRET: 'local-test-auth-email-secret-at-least-32-bytes',
    RESEND_API_KEY: 're_local_test_key_123456789',
    ...overrides,
  };
}

function runCheck(environment: Record<string, string>): string {
  try {
    return execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: environment,
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
