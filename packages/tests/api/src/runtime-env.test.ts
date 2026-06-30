import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../../apps/api/scripts/check-runtime-env.mjs', import.meta.url),
);

describe('@lodariq/api runtime environment check', () => {
  it('fails closed without a runtime DATABASE_URL', () => {
    expect(() => runCheck(validApiEnv({ DATABASE_URL: '' }))).toThrow(
      /DATABASE_URL is required for the deployed API runtime/,
    );
  });

  it('rejects owner database roles for app traffic', () => {
    expect(() =>
      runCheck(
        validApiEnv({
          DATABASE_URL: 'postgresql://neondb_owner:password@example.com/neondb?sslmode=require',
        }),
      ),
    ).toThrow(/DATABASE_URL must use a non-owner app role/);
  });

  it('requires exact Clerk authorized parties', () => {
    expect(() => runCheck(validApiEnv({ CLERK_AUTHORIZED_PARTIES: '' }))).toThrow(
      /CLERK_AUTHORIZED_PARTIES must include the exact dashboard origin/,
    );
  });

  it('rejects non-Clerk production auth mode overrides', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_AUTH_MODE: 'headers' }))).toThrow(
      /LODARIQ_AUTH_MODE must be unset or "clerk"/,
    );
  });

  it('rejects non-HTTPS public origins and asset URLs', () => {
    expect(() =>
      runCheck(
        validApiEnv({
          LODARIQ_PUBLIC_API_BASE_URL: 'http://api.lodariq.com',
        }),
      ),
    ).toThrow(/LODARIQ_PUBLIC_API_BASE_URL must use https/);
  });

  it('accepts the production runtime shape without opening network connections', () => {
    expect(runCheck(validApiEnv())).toContain(
      'Lodariq API production environment is ready for a live smoke check.',
    );
  });
});

function validApiEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://lodariq_app:password@example.com/neondb?sslmode=require',
    CLERK_SECRET_KEY: 'sk_test_fixture',
    CLERK_AUTHORIZED_PARTIES: 'https://app.lodariq.com',
    LODARIQ_PUBLIC_API_BASE_URL: 'https://api.lodariq.com',
    LODARIQ_LOADER_SRC: 'https://cdn.lodariq.com/sdk/lodariq-loader.js',
    LODARIQ_CREATOR_LOADER_SRC: 'https://cdn.lodariq.com/sdk/lodariq-creator.js',
    LODARIQ_AUTHORING_IFRAME_SRC: 'https://editor.lodariq.com/authoring.html',
    ...overrides,
  };
}

function runCheck(env: Record<string, string>): string {
  try {
    return execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env,
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
