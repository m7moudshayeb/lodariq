import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseEmailVerificationRequiredResponse,
  parsePasswordRecoveryAcceptedResponse,
  parseSetPasswordChallengeId,
  parseSetPasswordInput,
  parseVerificationChallengeId,
  readSessionTokenFromCookieHeader,
  safeReturnTo,
} from '../../../../apps/dashboard/src/lib/auth-contract';
import {
  createAuthClientSource,
  proxyOwnedAuthRequest,
} from '../../../../apps/dashboard/src/lib/auth-proxy';
import {
  isPublicSignupEnabled,
  publicSignupMode,
} from '../../../../apps/dashboard/src/lib/signup-config';
import {
  isPasswordRecoveryEnabled,
  passwordRecoveryMode,
} from '../../../../apps/dashboard/src/lib/password-recovery-config';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('@lodariq/dashboard owned authentication', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('accepts exactly the owned cookie for the current runtime', () => {
    expect(readSessionTokenFromCookieHeader('lodariq_session_dev=dev-token', 'development')).toBe(
      'dev-token',
    );
    expect(
      readSessionTokenFromCookieHeader(
        'lodariq_session_dev=dev-token; __Host-lodariq_session=production-token',
        'production',
      ),
    ).toBe('production-token');
    expect(
      readSessionTokenFromCookieHeader('lodariq_session_dev=fixation-token', 'production'),
    ).toBeUndefined();
    expect(
      readSessionTokenFromCookieHeader('__Host-lodariq_session=production-token', 'development'),
    ).toBeUndefined();
    expect(
      readSessionTokenFromCookieHeader('__session=legacy-clerk-token', 'production'),
    ).toBeUndefined();
  });

  it('allows only explicitly supported local post-auth destinations', () => {
    expect(safeReturnTo('/')).toBe('/');
    expect(safeReturnTo('/?welcome=1#overview')).toBe('/?welcome=1#overview');
    expect(safeReturnTo('/authoring/activate')).toBe('/authoring/activate');
    expect(safeReturnTo('//attacker.test')).toBe('/');
    expect(safeReturnTo('https://attacker.test')).toBe('/');
  });

  it('uses the canonical verification contract for bounded public inputs', () => {
    const challengeId = 'verify_abcdefghijklmnopqrstuvwxyz123456';
    expect(parseVerificationChallengeId(challengeId)).toBe(challengeId);
    expect(parseVerificationChallengeId('verify_short')).toBeNull();
    expect(parseVerificationChallengeId(`${challengeId}${'x'.repeat(200)}`)).toBeNull();
    expect(
      parseEmailVerificationRequiredResponse({
        status: 'verification_required',
        challengeId,
        expiresAt: '2026-08-07T18:00:00.000Z',
      }),
    ).not.toBeNull();
    expect(
      parseEmailVerificationRequiredResponse({
        status: 'verification_required',
        challengeId,
        expiresAt: '2026-08-07T18:00:00.000Z',
        unexpected: true,
      }),
    ).toBeNull();
  });

  it('uses purpose-separated canonical password recovery contracts', () => {
    const challengeId = 'reset_abcdefghijklmnopqrstuvwxyz123456';
    const resetToken = 'lq_reset_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG';
    expect(parseSetPasswordChallengeId(challengeId)).toBe(challengeId);
    expect(parseSetPasswordChallengeId('verify_abcdefghijklmnopqrstuvwxyz123456')).toBeNull();
    expect(parseSetPasswordInput(challengeId, resetToken, 'a-secure-password')).toEqual({
      challengeId,
      token: resetToken,
      password: 'a-secure-password',
    });
    expect(
      parsePasswordRecoveryAcceptedResponse({
        status: 'accepted',
        challengeId,
        expiresAt: '2026-08-07T18:00:00.000Z',
        resetToken,
      }),
    ).not.toBeNull();
    expect(parsePasswordRecoveryAcceptedResponse({ status: 'accepted', challengeId })).toBeNull();
  });

  it('defaults signup safely by runtime and keeps Fly deployments explicitly disabled', () => {
    expect(publicSignupMode({ NODE_ENV: 'production' })).toBe('disabled');
    expect(isPublicSignupEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(publicSignupMode({ NODE_ENV: 'development' })).toBe('email-verification');
    expect(
      publicSignupMode({ NODE_ENV: 'development', LODARIQ_PUBLIC_SIGNUP_MODE: 'invalid' }),
    ).toBe('disabled');
    expect(
      isPublicSignupEnabled({
        NODE_ENV: 'production',
        LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
      }),
    ).toBe(true);
    expect(read('apps/dashboard/fly.toml')).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "disabled"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain(
      'LODARIQ_PUBLIC_SIGNUP_MODE = "disabled"',
    );
  });

  it('keeps recovery disabled by default in production and explicit on Fly', () => {
    expect(passwordRecoveryMode({ NODE_ENV: 'production' })).toBe('disabled');
    expect(isPasswordRecoveryEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(passwordRecoveryMode({ NODE_ENV: 'development' })).toBe('email');
    expect(
      isPasswordRecoveryEnabled({
        NODE_ENV: 'production',
        LODARIQ_PASSWORD_RECOVERY_MODE: 'email',
      }),
    ).toBe(true);
    expect(read('apps/dashboard/fly.toml')).toContain(
      'LODARIQ_PASSWORD_RECOVERY_MODE = "disabled"',
    );
    expect(read('apps/dashboard/fly.staging.toml')).toContain(
      'LODARIQ_PASSWORD_RECOVERY_MODE = "disabled"',
    );
  });

  it('forwards the session as a bearer and relays owned cookies without exposing token JSON', async () => {
    const upstreamFetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer owned-session-token');
      expect(headers.has('cookie')).toBe(false);

      const responseHeaders = new Headers({ 'content-type': 'application/json' });
      responseHeaders.append(
        'set-cookie',
        'lodariq_session_dev=rotated-token; HttpOnly; SameSite=Lax; Path=/',
      );
      return new Response(JSON.stringify(sessionSnapshot()), {
        status: 200,
        headers: responseHeaders,
      });
    });
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/workspaces/wk_product/select', {
        cookie: 'lodariq_session_dev=owned-session-token',
      }),
      '/v1/workspaces/wk_product/select',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toContain('lodariq_session_dev=rotated-token');
    expect(await response.json()).toEqual(sessionSnapshot());
  });

  it('matches the fixed BFF client-source envelope and never accepts an invalid IP', () => {
    const request = new Request('https://app.lodariq.io/api/auth/sign-in', {
      headers: { 'fly-client-ip': '203.0.113.42' },
    });
    const envelope = createAuthClientSource(
      request,
      {
        FLY_APP_NAME: 'lodariq-dashboard',
        LODARIQ_AUTH_BFF_SOURCE_SECRET: '  0123456789abcdef0123456789abcdef  ',
      },
      1_786_100_000_000,
    );

    expect(envelope).toBe(
      'v1.1786100000.p8ajhs2Fv6AedJkTXX0DcGcs0nbqImSepj7aVQvw7SY.TgGt1z2QTgUcebNAX7RhwZbEhpdBM7dwzcN37yWX9iU',
    );
    expect(
      createAuthClientSource(
        new Request('https://app.lodariq.io/api/auth/sign-in', {
          headers: { 'fly-client-ip': '203.0.113.42, 10.0.0.1' },
        }),
        {
          FLY_APP_NAME: 'lodariq-dashboard',
          LODARIQ_AUTH_BFF_SOURCE_SECRET: '0123456789abcdef0123456789abcdef',
        },
      ),
    ).toBeUndefined();
  });

  it('adds the signed source only to rate-limited auth calls and never forwards the raw IP', async () => {
    vi.stubEnv('FLY_APP_NAME', 'lodariq-dashboard');
    vi.stubEnv('LODARIQ_AUTH_BFF_SOURCE_SECRET', '0123456789abcdef0123456789abcdef');
    const forwardedHeaders: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        forwardedHeaders.push(new Headers(init?.headers));
        return Response.json(sessionSnapshot());
      }),
    );

    const sourceHeaders = { 'fly-client-ip': '203.0.113.42' };
    await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/sign-in', sourceHeaders),
      '/v1/auth/sign-in',
    );
    await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/workspaces/wk_product/select', sourceHeaders),
      '/v1/workspaces/wk_product/select',
    );

    expect(forwardedHeaders[0]?.get('x-lodariq-auth-client-source')).toMatch(
      /^v1\.\d+\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/u,
    );
    expect(forwardedHeaders[1]?.has('x-lodariq-auth-client-source')).toBe(false);
    for (const headers of forwardedHeaders) {
      expect(headers.has('fly-client-ip')).toBe(false);
      expect(headers.has('x-forwarded-for')).toBe(false);
      expect([...headers.values()].join(' ')).not.toContain('203.0.113.42');
    }
  });

  it('rejects cross-origin and non-JSON mutations before contacting the API', async () => {
    const upstreamFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', upstreamFetch);

    const crossOrigin = await proxyOwnedAuthRequest(
      new Request('https://app.lodariq.io/api/auth/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://attacker.test' },
        body: '{}',
      }),
      '/v1/auth/sign-in',
    );
    expect(crossOrigin.status).toBe(403);

    const formEncoded = await proxyOwnedAuthRequest(
      new Request('https://app.lodariq.io/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://app.lodariq.io',
        },
        body: 'email=user%40example.test',
      }),
      '/v1/auth/sign-in',
    );
    expect(formEncoded.status).toBe(415);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('redacts upstream authentication failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          Response.json(
            { error: 'private_backend_reason', message: 'database secret and account detail' },
            { status: 401 },
          ),
        ),
    );

    const response = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/sign-in'),
      '/v1/auth/sign-in',
    );
    const body = JSON.stringify(await response.json());
    expect(response.status).toBe(401);
    expect(body).toContain('Email or password is incorrect.');
    expect(body).not.toContain('database secret');
    expect(body).not.toContain('private_backend_reason');
  });

  it('maps safe auth failures and forwards Retry-After without upstream details', async () => {
    const upstreamFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'private_rate_bucket', message: 'internal limiter detail' },
          { status: 429, headers: { 'retry-after': '75' } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: 'delivery_missing', message: 'private deployment topology' },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          { error: 'token_hash_mismatch', message: 'private verification detail' },
          { status: 400 },
        ),
      );
    vi.stubGlobal('fetch', upstreamFetch);

    const limited = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/sign-in'),
      '/v1/auth/sign-in',
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('75');
    await expect(limited.json()).resolves.toEqual({
      error: 'rate_limited',
      message: 'Too many attempts; try again later.',
    });

    const unavailable = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/sign-up'),
      '/v1/auth/sign-up',
    );
    await expect(unavailable.json()).resolves.toEqual({
      error: 'signup_unavailable',
      message: 'Account creation is not available in this deployment.',
    });

    const invalid = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/verify-email'),
      '/v1/auth/verify-email',
    );
    await expect(invalid.json()).resolves.toEqual({
      error: 'verification_invalid',
      message: 'Verification link is invalid or expired.',
    });
  });

  it('blocks direct BFF signup and recovery posts when their capabilities are disabled', async () => {
    vi.stubEnv('LODARIQ_PUBLIC_SIGNUP_MODE', 'disabled');
    vi.stubEnv('LODARIQ_PASSWORD_RECOVERY_MODE', 'disabled');
    const upstreamFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', upstreamFetch);

    const signUp = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/sign-up'),
      '/v1/auth/sign-up',
    );
    const recovery = await proxyOwnedAuthRequest(
      jsonRequest('https://app.lodariq.io/api/auth/password-recovery'),
      '/v1/auth/password-recovery',
    );

    expect(signUp.status).toBe(503);
    await expect(signUp.json()).resolves.toEqual({
      error: 'signup_unavailable',
      message: 'Account creation is not available in this deployment.',
    });
    expect(recovery.status).toBe(503);
    await expect(recovery.json()).resolves.toEqual({
      error: 'password_recovery_unavailable',
      message: 'Password recovery is temporarily unavailable.',
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('routes every dashboard POST through the shared mutation guard', () => {
    const routeFiles = [
      'apps/dashboard/src/app/api/auth/sign-in/route.ts',
      'apps/dashboard/src/app/api/auth/sign-up/route.ts',
      'apps/dashboard/src/app/api/auth/sign-out/route.ts',
      'apps/dashboard/src/app/api/auth/verify-email/route.ts',
      'apps/dashboard/src/app/api/auth/password-recovery/route.ts',
      'apps/dashboard/src/app/api/auth/set-password/route.ts',
      'apps/dashboard/src/app/api/workspaces/route.ts',
      'apps/dashboard/src/app/api/workspaces/[workspaceId]/select/route.ts',
    ];
    for (const path of routeFiles) {
      expect(read(path), path).toContain('proxyOwnedAuthRequest');
    }
    expect(read('apps/dashboard/src/app/authoring/activate/request/route.ts')).toContain(
      'rejectUnsafeMutation(request)',
    );
  });

  it('wires owned forms, protected session loading, and account controls without Clerk', () => {
    expect(read('apps/dashboard/src/app/layout.tsx')).not.toMatch(/Clerk/i);
    expect(read('apps/dashboard/src/app/page.tsx')).toContain('loadAuthSession()');
    expect(read('apps/dashboard/src/proxy.ts')).toContain('dashboardSessionCookieName');
    expect(read('apps/dashboard/src/app/sign-in/[[...sign-in]]/page.tsx')).toContain(
      'mode="sign-in"',
    );
    expect(read('apps/dashboard/src/app/sign-up/[[...sign-up]]/page.tsx')).toContain(
      '<AuthForm mode="sign-up"',
    );
    expect(read('apps/dashboard/src/components/dashboard-auth-controls.tsx')).toContain(
      'auth.signOut.mutateAsync()',
    );
    expect(read('apps/dashboard/src/app/sign-up/[[...sign-up]]/page.tsx')).toContain(
      'isPublicSignupEnabled()',
    );
    expect(read('apps/dashboard/src/app/verify-email/page.tsx')).toContain('readTokenFromFragment');
    expect(read('apps/dashboard/package.json')).not.toContain('@clerk/nextjs');
  });

  it('defaults to the selected light-first theme without removing the optional toggle', () => {
    const layout = read('apps/dashboard/src/app/layout.tsx');
    expect(layout).toContain('className="light"');
    expect(read('apps/dashboard/src/components/theme-provider.tsx')).toContain(
      'defaultTheme="light"',
    );
    expect(read('apps/dashboard/src/components/dashboard-navigation.tsx')).toContain(
      '<ThemeToggle />',
    );
  });
});

function jsonRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: new URL(url).origin,
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: '{}',
  });
}

function sessionSnapshot(): Record<string, unknown> {
  return {
    user: { id: 'user_1', email: 'creator@example.test', name: 'Creator' },
    activeWorkspaceId: 'wk_product',
    workspaces: [{ id: 'wk_product', name: 'Product', role: 'owner' }],
  };
}

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}
