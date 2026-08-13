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

  it('requires the explicit owned-auth production mode', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_AUTH_MODE: '' }))).toThrow(
      /LODARIQ_AUTH_MODE must be "lodariq"/,
    );
  });

  it('rejects local header auth in production', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_AUTH_MODE: 'headers' }))).toThrow(
      /header auth is local\/test-only/,
    );
  });

  it('rejects the transitional Clerk mode in production', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_AUTH_MODE: 'clerk' }))).toThrow(
      /LODARIQ_AUTH_MODE must be "lodariq"/,
    );
  });

  it('rejects non-HTTPS public origins and asset URLs', () => {
    expect(() =>
      runCheck(
        validApiEnv({
          LODARIQ_PUBLIC_API_BASE_URL: 'http://api.lodariq.io',
        }),
      ),
    ).toThrow(/LODARIQ_PUBLIC_API_BASE_URL must use https/);
  });

  it('requires a content-addressed creator module descriptor with matching SRI', () => {
    expect(() =>
      runCheck(validApiEnv({ LODARIQ_CREATOR_MODULE_INTEGRITY: 'sha256-YWJjZA==' })),
    ).toThrow(/content address must match/);
  });

  it('accepts opaque database-backed sessions without a Clerk or auth signing secret', () => {
    expect(runCheck(validApiEnv())).toContain(
      'Lodariq API production environment is ready for a live smoke check.',
    );
  });

  it('accepts the canonical hosted Development origin tuple', () => {
    const developmentCdn = 'https://dev-cdn.lodariq.io';
    expect(
      runCheck(
        validApiEnv({
          LODARIQ_PUBLIC_API_BASE_URL: 'https://dev-api.lodariq.io',
          LODARIQ_APP_BASE_URL: 'https://dev-app.lodariq.io',
          LODARIQ_AUTH_ALLOWED_ORIGINS: 'https://dev-app.lodariq.io',
          LODARIQ_LOADER_SRC: `${developmentCdn}/sdk/lodariq-loader.js`,
          LODARIQ_PUBLIC_LOADER_SRC: `${developmentCdn}/sdk/lodariq-public-bootstrap.js`,
          LODARIQ_CREATOR_LOADER_SRC: `${developmentCdn}/sdk/lodariq-creator.js`,
          LODARIQ_CREATOR_MODULE_URL: `${developmentCdn}/sdk/sha256-${'0'.repeat(64)}/creator.js`,
          LODARIQ_AUTHORING_IFRAME_SRC: 'https://dev-editor.lodariq.io/authoring.html',
        }),
      ),
    ).toContain('ready for a live smoke check');
  });

  it('rejects a hosted Development API mixed with Staging origins', () => {
    expect(() =>
      runCheck(
        validApiEnv({
          LODARIQ_PUBLIC_API_BASE_URL: 'https://dev-api.lodariq.io',
          LODARIQ_AUTH_ALLOWED_ORIGINS: 'https://staging-app.lodariq.io',
        }),
      ),
    ).toThrow(/selected deployment CDN origin|selected non-production app origin/);
  });

  it('accepts a complete Resend outbox configuration and rejects partial delivery config', () => {
    const resend = {
      LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
      LODARIQ_APP_BASE_URL: 'https://app.lodariq.io',
      LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <access@lodariq.io>',
      LODARIQ_AUTH_EMAIL_TOKEN_SECRET: 'auth-email-token-secret-at-least-32-bytes',
      RESEND_API_KEY: 're_abcdefghijklmnopqrstuvwxyz',
    };
    expect(runCheck(validApiEnv(resend))).toContain('ready for a live smoke check');
    expect(() => runCheck(validApiEnv({ ...resend, RESEND_API_KEY: '' }))).toThrow(
      /RESEND_API_KEY must be a valid Resend API key/,
    );
  });

  it('requires explicit API capability modes and real delivery before enabling them', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_PUBLIC_SIGNUP_MODE: 'open' }))).toThrow(
      /LODARIQ_PUBLIC_SIGNUP_MODE must be "disabled" or "email-verification"/,
    );
    expect(() => runCheck(validApiEnv({ LODARIQ_PASSWORD_RECOVERY_MODE: 'open' }))).toThrow(
      /LODARIQ_PASSWORD_RECOVERY_MODE must be "disabled" or "email"/,
    );
    expect(() => runCheck(validApiEnv({ LODARIQ_PASSWORD_RECOVERY_MODE: 'email' }))).toThrow(
      /require LODARIQ_EMAIL_DELIVERY_MODE="resend"/,
    );
  });

  it('requires bounded Argon2id admission limits for the deployed API', () => {
    expect(() => runCheck(validApiEnv({ LODARIQ_PASSWORD_HASH_MAX_ACTIVE: '0' }))).toThrow(
      /LODARIQ_PASSWORD_HASH_MAX_ACTIVE must be an integer between 1 and 4/,
    );
    expect(() =>
      runCheck(validApiEnv({ LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS: 'unbounded' })),
    ).toThrow(/LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS must be an integer/);
  });
});

function validApiEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    LODARIQ_AUTH_MODE: 'lodariq',
    LODARIQ_EMAIL_DELIVERY_MODE: 'disabled',
    LODARIQ_PASSWORD_RECOVERY_MODE: 'disabled',
    LODARIQ_PUBLIC_SIGNUP_MODE: 'disabled',
    LODARIQ_AUTH_BFF_SOURCE_SECRET: 'test-auth-bff-source-secret-at-least-32-bytes',
    LODARIQ_PASSWORD_HASH_MAX_ACTIVE: '1',
    LODARIQ_PASSWORD_HASH_MAX_QUEUED: '8',
    LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS: '2000',
    DATABASE_URL: 'postgresql://lodariq_app:password@example.com/neondb?sslmode=require',
    LODARIQ_PUBLIC_API_BASE_URL: 'https://api.lodariq.io',
    LODARIQ_LOADER_SRC: 'https://cdn.lodariq.io/sdk/lodariq-loader.js',
    LODARIQ_PUBLIC_LOADER_SRC: 'https://cdn.lodariq.io/sdk/lodariq-public-bootstrap.js',
    LODARIQ_CREATOR_LOADER_SRC: 'https://cdn.lodariq.io/sdk/lodariq-creator.js',
    LODARIQ_CREATOR_MODULE_URL: `https://cdn.lodariq.io/sdk/sha256-${'0'.repeat(64)}/creator.js`,
    LODARIQ_CREATOR_MODULE_VERSION: 'sha256-test',
    LODARIQ_CREATOR_MODULE_INTEGRITY: `sha256-${'A'.repeat(43)}=`,
    LODARIQ_AUTHORING_IFRAME_SRC: 'https://editor.lodariq.io/authoring.html',
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
