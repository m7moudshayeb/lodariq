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

  it('requires the explicit owned-auth production mode', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_AUTH_MODE: '' }))).toThrow(
      /LODARIQ_AUTH_MODE must be "lodariq"/,
    );
  });

  it('rejects local header auth in production', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_AUTH_MODE: 'headers' }))).toThrow(
      /header auth is local\/test-only/,
    );
  });

  it('rejects the transitional Clerk mode in production', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_AUTH_MODE: 'clerk' }))).toThrow(
      /LODARIQ_AUTH_MODE must be "lodariq"/,
    );
  });

  it('accepts owned sessions without a provider or session signing secret', () => {
    expect(runCheck(validDashboardEnv())).toContain(
      'Lodariq dashboard production environment is ready for a live smoke check.',
    );
  });

  it('requires a strong server-only BFF source secret', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_AUTH_BFF_SOURCE_SECRET: '' }))).toThrow(
      /LODARIQ_AUTH_BFF_SOURCE_SECRET must be a server-only secret of at least 32 bytes/,
    );
    expect(() =>
      runCheck(validDashboardEnv({ LODARIQ_AUTH_BFF_SOURCE_SECRET: 'too-short' })),
    ).toThrow(/LODARIQ_AUTH_BFF_SOURCE_SECRET must be a server-only secret of at least 32 bytes/);
  });

  it('accepts only explicit public signup modes when configured', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_PUBLIC_SIGNUP_MODE: 'open' }))).toThrow(
      /LODARIQ_PUBLIC_SIGNUP_MODE must be "disabled" or "email-verification"/,
    );
    expect(runCheck(validDashboardEnv({ LODARIQ_PUBLIC_SIGNUP_MODE: 'disabled' }))).toContain(
      'ready for a live smoke check',
    );
  });

  it('accepts only explicit password recovery modes', () => {
    expect(() => runCheck(validDashboardEnv({ LODARIQ_PASSWORD_RECOVERY_MODE: 'open' }))).toThrow(
      /LODARIQ_PASSWORD_RECOVERY_MODE must be "disabled" or "email"/,
    );
    expect(runCheck(validDashboardEnv({ LODARIQ_PASSWORD_RECOVERY_MODE: 'email' }))).toContain(
      'ready for a live smoke check',
    );
  });
});

function validDashboardEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    LODARIQ_AUTH_MODE: 'lodariq',
    LODARIQ_API_BASE_URL: 'https://api.lodariq.com',
    LODARIQ_AUTH_BFF_SOURCE_SECRET: 'dashboard-bff-source-secret-32-bytes-minimum',
    LODARIQ_PUBLIC_SIGNUP_MODE: 'disabled',
    LODARIQ_PASSWORD_RECOVERY_MODE: 'disabled',
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
