import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_CLIENT_SOURCE_HEADER,
  createApiApp,
  createAuthClientSourceEnvelope,
  createLodariqAuthProvider,
  createOwnedAuthSession,
  createPasswordResetToken,
  hashOwnedPassword,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

const NEW_PASSWORD = 'a-new-secure-password';
const OLD_PASSWORD = 'the-old-secure-password';
const CREATED_AT = '2026-08-07T12:00:00.000Z';

describe('@lodariq/api password enrollment and recovery', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets a legacy user establish a password without losing workspace membership', async () => {
    const repository = legacyRepository();
    const app = createApiApp({ repository });

    const recovery = await app.inject({
      method: 'POST',
      url: '/v1/auth/password-recovery',
      payload: { email: 'Legacy@Example.com' },
    });
    expect(recovery.statusCode).toBe(202);
    const link = recovery.json<{
      status: string;
      challengeId: string;
      resetToken: string;
    }>();
    expect(link.status).toBe('accepted');
    expect(link.challengeId).toMatch(/^reset_/);
    expect(link.resetToken).toMatch(/^lq_reset_/);

    const updated = await app.inject({
      method: 'POST',
      url: '/v1/auth/set-password',
      payload: {
        challengeId: link.challengeId,
        token: link.resetToken,
        password: NEW_PASSWORD,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ status: string; session: { workspaces: unknown[] } }>()).toMatchObject({
      status: 'password_updated',
      session: { workspaces: [{ id: 'wk_legacy', role: 'owner' }] },
    });
    expect(updated.headers['set-cookie']).toContain('lodariq_session_dev=');
    await expect(repository.getIdentityUser('usr_legacy')).resolves.toMatchObject({
      emailVerifiedAt: expect.any(String),
      legacyIdentityId: 'legacy_provider_user_123',
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/set-password',
      payload: {
        challengeId: link.challengeId,
        token: link.resetToken,
        password: NEW_PASSWORD,
      },
    });
    expect(replay.statusCode).toBe(400);
    await app.close();
  });

  it('keeps unknown and duplicate emails generic and rejects them before password hashing', async () => {
    let passwordHashRuns = 0;
    const repository = legacyRepository({ duplicate: true });
    const app = createApiApp({
      repository,
      passwordHashAdmissionGate: {
        async run(operation) {
          passwordHashRuns += 1;
          return operation();
        },
      },
    });

    for (const email of ['nobody@example.com', 'legacy@example.com']) {
      const recovery = await app.inject({
        method: 'POST',
        url: '/v1/auth/password-recovery',
        payload: { email },
      });
      expect(recovery.statusCode).toBe(202);
      const link = recovery.json<{ challengeId: string; resetToken: string }>();
      expect(Object.keys(link).sort()).toEqual([
        'challengeId',
        'expiresAt',
        'resetToken',
        'status',
      ]);

      const rejected = await app.inject({
        method: 'POST',
        url: '/v1/auth/set-password',
        payload: {
          challengeId: link.challengeId,
          token: link.resetToken,
          password: NEW_PASSWORD,
        },
      });
      expect(rejected.statusCode).toBe(400);
    }
    expect(passwordHashRuns).toBe(0);
    await app.close();
  });

  it('allows one concurrent reset winner, revokes old sessions, and replaces the credential', async () => {
    const now = new Date();
    const oldCredential = await hashOwnedPassword(
      'usr_owned',
      'owned@example.com',
      OLD_PASSWORD,
      now,
    );
    const oldSession = createOwnedAuthSession('usr_owned', 'wk_owned', { now });
    const repository = createInMemoryControlPlaneRepository({
      users: [
        {
          id: 'usr_owned',
          legacyIdentityId: null,
          email: 'owned@example.com',
          name: 'Owned creator',
          emailVerifiedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ],
      workspaces: [
        {
          id: 'wk_owned',
          name: 'Owned workspace',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      workspaceMemberships: [
        {
          workspaceId: 'wk_owned',
          userId: 'usr_owned',
          role: 'owner',
          createdAt: now.toISOString(),
        },
      ],
      passwordCredentials: [oldCredential],
      authSessions: [oldSession.record],
    });
    const app = createApiApp({ repository });
    const recovery = await app.inject({
      method: 'POST',
      url: '/v1/auth/password-recovery',
      payload: { email: 'owned@example.com' },
    });
    const link = recovery.json<{ challengeId: string; resetToken: string }>();
    const payload = {
      challengeId: link.challengeId,
      token: link.resetToken,
      password: NEW_PASSWORD,
    };

    const attempts = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/auth/set-password', payload }),
      app.inject({ method: 'POST', url: '/v1/auth/set-password', payload }),
    ]);
    expect(attempts.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
    await expect(
      repository.resolveAuthSession(oldSession.record.tokenHash, new Date().toISOString()),
    ).resolves.toBeNull();

    const oldSignIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email: 'owned@example.com', password: OLD_PASSWORD },
    });
    expect(oldSignIn.statusCode).toBe(401);
    const newSignIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email: 'owned@example.com', password: NEW_PASSWORD },
    });
    expect(newSignIn.statusCode).toBe(200);
    await app.close();
  });

  it('rejects direct production recovery requests when the API capability is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LODARIQ_PASSWORD_RECOVERY_MODE', 'disabled');
    vi.stubEnv('LODARIQ_AUTH_BFF_SOURCE_SECRET', 'recovery-source-secret-at-least-32-bytes');
    const repository = legacyRepository();
    const requestChallenge = vi.spyOn(repository, 'requestSetPasswordChallenge');
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      emailVerificationDelivery: {
        kind: 'email-verification-dispatcher-v1',
        secret: 'recovery-delivery-secret-at-least-32-bytes',
      },
    });
    const source = createAuthClientSourceEnvelope(
      '203.0.113.72',
      process.env.LODARIQ_AUTH_BFF_SOURCE_SECRET!,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/password-recovery',
      headers: { [AUTH_CLIENT_SOURCE_HEADER]: source },
      payload: { email: 'legacy@example.com' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'password_recovery_unavailable',
      message: 'Password recovery is temporarily unavailable',
    });
    expect(requestChallenge).not.toHaveBeenCalled();
    await app.close();
  });

  it('runs production recovery only when explicitly enabled and keeps the token out of the response', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LODARIQ_PASSWORD_RECOVERY_MODE', 'email');
    vi.stubEnv('LODARIQ_AUTH_BFF_SOURCE_SECRET', 'enabled-source-secret-at-least-32-bytes');
    const repository = legacyRepository();
    const deliverySecret = 'enabled-delivery-secret-at-least-32-bytes';
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      emailVerificationDelivery: {
        kind: 'email-verification-dispatcher-v1',
        secret: deliverySecret,
      },
    });
    const source = createAuthClientSourceEnvelope(
      '203.0.113.73',
      process.env.LODARIQ_AUTH_BFF_SOURCE_SECRET!,
    );

    const recovery = await app.inject({
      method: 'POST',
      url: '/v1/auth/password-recovery',
      headers: { [AUTH_CLIENT_SOURCE_HEADER]: source },
      payload: { email: 'legacy@example.com' },
    });

    expect(recovery.statusCode).toBe(202);
    expect(recovery.json()).toEqual({ status: 'accepted' });
    const [queued] = await repository.claimDue({
      now: new Date(Date.now() + 1_000).toISOString(),
      limit: 1,
      leaseDurationMs: 60_000,
    });
    expect(queued).toMatchObject({ purpose: 'set_password' });
    if (!queued) throw new Error('Expected a queued password recovery email');

    const updated = await app.inject({
      method: 'POST',
      url: '/v1/auth/set-password',
      headers: { [AUTH_CLIENT_SOURCE_HEADER]: source },
      payload: {
        challengeId: queued.challengeId,
        token: createPasswordResetToken(queued.challengeId, deliverySecret),
        password: NEW_PASSWORD,
      },
    });
    expect(updated.statusCode).toBe(200);
    await app.close();
  });
});

function legacyRepository(options: { duplicate?: boolean } = {}) {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: 'usr_legacy',
        legacyIdentityId: 'legacy_provider_user_123',
        email: 'Legacy@Example.com',
        name: 'Legacy creator',
        emailVerifiedAt: null,
        createdAt: CREATED_AT,
      },
      ...(options.duplicate
        ? [
            {
              id: 'usr_duplicate',
              legacyIdentityId: 'legacy_provider_user_456',
              email: ' legacy@example.com ',
              name: 'Duplicate creator',
              emailVerifiedAt: null,
              createdAt: CREATED_AT,
            },
          ]
        : []),
    ],
    workspaces: [
      {
        id: 'wk_legacy',
        name: 'Legacy workspace',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    workspaceMemberships: [
      {
        workspaceId: 'wk_legacy',
        userId: 'usr_legacy',
        role: 'owner',
        createdAt: CREATED_AT,
      },
    ],
  });
}
