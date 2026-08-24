import { describe, expect, it } from 'vitest';
import {
  createApiApp,
  createOidcProofMaterial,
  createOwnedAuthSession,
  hashAuthSessionToken,
  openOidcProof,
  readOidcConfiguration,
  sealOidcProof,
  type IdentityProviderAdapter,
  type OidcConfiguration,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository, type AuthSessionRecord } from '@lodariq/database';

const NOW = new Date();
const STATE_SECRET = 'oidc-test-state-secret-contains-at-least-32-bytes';

describe('@lodariq/api OIDC authorization', () => {
  it('seals PKCE and nonce material with attempt/provider binding', () => {
    const proof = createOidcProofMaterial();
    expect(proof.state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(proof.stateHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(proof.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const envelope = sealOidcProof(proof, STATE_SECRET, attemptId('crypto'), 'google');
    expect(openOidcProof(envelope, STATE_SECRET, attemptId('crypto'), 'google')).toEqual({
      verifier: proof.verifier,
      nonce: proof.nonce,
    });
    expect(() => openOidcProof(envelope, STATE_SECRET, attemptId('other'), 'google')).toThrow();
    expect(envelope).not.toContain(proof.verifier);
  });

  it('accepts only complete providers and exact callback paths', () => {
    const configuration = readOidcConfiguration({
      LODARIQ_OIDC_MODE: 'enabled',
      LODARIQ_OIDC_STATE_SECRET: STATE_SECRET,
      LODARIQ_GOOGLE_OIDC_CLIENT_ID: 'google-client',
      LODARIQ_GOOGLE_OIDC_CLIENT_SECRET: 'google-secret',
      LODARIQ_GOOGLE_OIDC_REDIRECT_URI: 'https://app.lodariq.io/v1/auth/oidc/google/callback',
    });
    expect(configuration?.providers.get('google')?.redirectUri).toBe(
      'https://app.lodariq.io/v1/auth/oidc/google/callback',
    );
    expect(() =>
      readOidcConfiguration({
        LODARIQ_OIDC_MODE: 'enabled',
        LODARIQ_OIDC_STATE_SECRET: STATE_SECRET,
        LODARIQ_GOOGLE_OIDC_CLIENT_ID: 'google-client',
        LODARIQ_GOOGLE_OIDC_CLIENT_SECRET: 'google-secret',
        LODARIQ_GOOGLE_OIDC_REDIRECT_URI: 'https://app.lodariq.io/attacker-callback',
      }),
    ).toThrow(/callback URL/u);
  });

  it('creates a shared Lodariq session once and rejects callback replay', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const app = createApiApp({
      repository,
      authClock: () => new Date(NOW),
      oidcConfiguration: configuration(verifiedIdentity('subject-signup')),
      webAuthnConfiguration: null,
    });
    const begin = await beginAuthorization(app, 'sign_up', '/', 'OIDC Workspace');
    expect(begin.statusCode).toBe(200);
    const state = authorizationState(begin);
    const callback = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/callback',
      payload: { state, code: 'single-use-code' },
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.headers['set-cookie']).toContain('lodariq_session_dev=');
    expect(callback.json()).toMatchObject({
      status: 'authenticated',
      returnTo: '/',
      session: { activeWorkspaceId: expect.stringMatching(/^wk_/u) },
    });
    expect(
      await repository.findAuthIdentityByProviderSubject(
        'https://accounts.google.com',
        'subject-signup',
      ),
    ).toMatchObject({ kind: 'oidc', providerTenantId: 'google' });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/callback',
      payload: { state, code: 'single-use-code' },
    });
    expect(replay.statusCode).toBe(400);
    await app.close();
  });

  it('consumes cancellation, permits a fresh retry, and fails closed when disabled', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const app = createApiApp({
      repository,
      authClock: () => new Date(NOW),
      oidcConfiguration: configuration(verifiedIdentity('subject-cancel')),
      webAuthnConfiguration: null,
    });
    const first = await beginAuthorization(app, 'sign_in', '/');
    const state = authorizationState(first);
    const cancelled = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/callback',
      payload: { state, error: 'access_denied', errorDescription: 'User cancelled' },
    });
    expect(cancelled.statusCode).toBe(400);
    expect(cancelled.json<{ error: string }>().error).toBe('oidc_cancelled');
    expect((await beginAuthorization(app, 'sign_in', '/')).statusCode).toBe(200);
    await app.close();

    const disabled = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      oidcConfiguration: null,
      webAuthnConfiguration: null,
    });
    expect((await beginAuthorization(disabled, 'sign_in', '/')).statusCode).toBe(404);
    await disabled.close();
  });

  it('never auto-links an existing email and supports explicit recent-session linking', async () => {
    const rawToken = 'lq_sess_oidc_link_existing';
    const seeded = seedAccount(rawToken);
    const repository = createInMemoryControlPlaneRepository(seeded);
    const app = createApiApp({
      repository,
      authClock: () => new Date(NOW),
      oidcConfiguration: configuration(verifiedIdentity('subject-link')),
      webAuthnConfiguration: null,
    });

    const collision = await beginAuthorization(app, 'sign_up', '/', 'Collision Workspace');
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/callback',
      payload: { state: authorizationState(collision), code: 'collision-code' },
    });
    expect(rejected.statusCode).toBe(401);
    expect(
      await repository.findAuthIdentityByProviderSubject(
        'https://accounts.google.com',
        'subject-link',
      ),
    ).toBeNull();

    const link = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/begin',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { provider: 'google', action: 'link', returnTo: '/authoring/activate' },
    });
    expect(link.statusCode).toBe(200);
    const linked = await app.inject({
      method: 'POST',
      url: '/v1/auth/oidc/google/callback',
      headers: { authorization: `Bearer ${rawToken}` },
      payload: { state: authorizationState(link), code: 'link-code' },
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toEqual({ status: 'linked', returnTo: '/authoring/activate' });
    expect(
      await repository.findAuthIdentityByProviderSubject(
        'https://accounts.google.com',
        'subject-link',
      ),
    ).toMatchObject({ userId: 'usr_oidc_existing' });
    await app.close();
  });
});

function configuration(identity: ReturnType<typeof verifiedIdentity>): OidcConfiguration {
  const adapter: IdentityProviderAdapter = {
    providerId: 'google',
    label: 'Google',
    redirectUri: 'https://app.lodariq.io/v1/auth/oidc/google/callback',
    begin(input) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('state', input.state);
      url.searchParams.set('nonce', input.nonce);
      url.searchParams.set('code_challenge', input.codeChallenge);
      return url;
    },
    async verifyCallback() {
      return identity;
    },
    resolveAssurance() {
      return 'aal1';
    },
  };
  return { stateSecret: STATE_SECRET, providers: new Map([['google', adapter]]) };
}

function verifiedIdentity(subject: string) {
  return {
    kind: 'oidc' as const,
    issuer: 'https://accounts.google.com',
    subject,
    providerTenantId: 'google',
    assuranceLevel: 'aal1' as const,
    email: 'existing@example.com',
    emailVerified: true,
    name: 'OIDC User',
  };
}

async function beginAuthorization(
  app: ReturnType<typeof createApiApp>,
  action: 'sign_in' | 'sign_up',
  returnTo: string,
  workspaceName?: string,
) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/oidc/google/begin',
    payload: {
      provider: 'google',
      action,
      returnTo,
      ...(workspaceName ? { workspaceName } : {}),
    },
  });
}

function authorizationState(response: { json<T>(): T }): string {
  const { authorizationUrl } = response.json<{ authorizationUrl: string }>();
  return new URL(authorizationUrl).searchParams.get('state')!;
}

function attemptId(suffix: string): string {
  return `oidcattempt_${suffix.padEnd(20, 'x')}`;
}

function seedAccount(rawToken: string) {
  const timestamp = NOW.toISOString();
  const session = createOwnedAuthSession('usr_oidc_existing', 'wk_oidc_existing', {
    now: NOW,
    identityId: `ident_oidc_password_${'p'.repeat(20)}`,
    authenticatedAt: timestamp,
  }).record;
  const authSession: AuthSessionRecord = { ...session, tokenHash: hashAuthSessionToken(rawToken) };
  return {
    users: [
      {
        id: 'usr_oidc_existing',
        legacyIdentityId: null,
        email: 'existing@example.com',
        name: 'Existing',
        emailVerifiedAt: timestamp,
        createdAt: timestamp,
      },
    ],
    userEmails: [
      {
        id: `email_oidc_existing_${'e'.repeat(20)}`,
        userId: 'usr_oidc_existing',
        normalizedEmail: 'existing@example.com',
        isPrimary: true,
        verifiedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    authIdentities: [
      {
        id: `ident_oidc_password_${'p'.repeat(20)}`,
        userId: 'usr_oidc_existing',
        kind: 'password' as const,
        issuer: 'https://lodariq.io',
        subject: 'user:usr_oidc_existing',
        providerTenantId: null,
        createdAt: timestamp,
        lastAuthenticatedAt: timestamp,
      },
    ],
    authSessions: [authSession],
    workspaces: [
      { id: 'wk_oidc_existing', name: 'Existing', createdAt: timestamp, updatedAt: timestamp },
    ],
    workspaceMemberships: [
      {
        workspaceId: 'wk_oidc_existing',
        userId: 'usr_oidc_existing',
        role: 'owner',
        createdAt: timestamp,
      },
    ],
  };
}
