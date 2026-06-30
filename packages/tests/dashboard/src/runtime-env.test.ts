import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../../apps/dashboard/scripts/check-runtime-env.mjs', import.meta.url),
);

describe('@lodariq/dashboard runtime environment check', () => {
  it('fails closed without a production API base URL', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_API_BASE_URL: '' }))).toThrow(
      /LODARIQ_API_BASE_URL is required/,
    );
  });

  it('rejects localhost API URLs for production dashboard traffic', () => {
    expect(() =>
      runCheck(validDashboardEnv({ LODARIQ_API_BASE_URL: 'http://127.0.0.1:3001' })),
    ).toThrow(/LODARIQ_API_BASE_URL must use https/);
  });

  it('requires the Clerk publishable key used by ClerkProvider', () => {
    expect(() => runCheck(validDashboardEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' }))).toThrow(
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required/,
    );
  });

  it('requires the Clerk secret key used by dashboard route protection', () => {
    expect(() => runCheck(validDashboardEnv({ CLERK_SECRET_KEY: '' }))).toThrow(
      /CLERK_SECRET_KEY is required/,
    );
  });

  it('accepts the production runtime shape without opening network connections', () => {
    expect(runCheck(validDashboardEnv())).toContain(
      'Lodariq dashboard production environment is ready for a live smoke check.',
    );
  });
});

function validDashboardEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    LODARIQ_API_BASE_URL: 'https://api.lodariq.com',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
    CLERK_SECRET_KEY: 'sk_test_fixture',
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
