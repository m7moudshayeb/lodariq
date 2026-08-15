import { describe, expect, it } from 'vitest';
import {
  AUTH_CLIENT_SOURCE_HEADER,
  createApiApp,
  createAuthClientSourceEnvelope,
  createEmailVerificationToken,
  createLodariqAuthProvider,
  hashAuthEmailLookup,
  hashOwnedPassword,
  hashAuthSessionToken,
  OWNED_PASSWORD_ALGORITHM,
  PasswordHashAdmissionGate,
  verifyOwnedPassword,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type AuthSessionRecord,
  type ControlPlaneRepository,
  type ConsumeAuthRateLimitInput,
} from '@lodariq/database';

const PASSWORD = 'a-strong-test-password';
const VERIFIED_PASSWORD = 'owner-chosen-verified-password';

describe('@lodariq/api owned authentication', () => {
  it('creates a canonical Argon2id PHC credential and verifies only the correct password', async () => {
    const credential = await hashOwnedPassword(
      'usr_argon2_contract',
      'creator@example.com',
      PASSWORD,
      new Date('2026-08-08T00:00:00.000Z'),
    );

    expect(credential.algorithm).toBe(OWNED_PASSWORD_ALGORITHM);
    expect(credential.algorithm).toBe('argon2id-v1');
    expect(credential.passwordHash).toMatch(
      /^\$argon2id\$v=19\$m=65536,p=1,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/u,
    );
    await expect(verifyOwnedPassword(PASSWORD, credential)).resolves.toBe(true);
    await expect(verifyOwnedPassword('a-different-test-password', credential)).resolves.toBe(false);
  });

  it('uses the schema Unicode character count for non-ASCII passwords', async () => {
    const password = '🔐'.repeat(65);
    const credential = await hashOwnedPassword(
      'usr_argon2_unicode',
      'unicode@example.com',
      password,
    );
    await expect(verifyOwnedPassword(password, credential)).resolves.toBe(true);
  });

  it('runs unknown-account dummy password work through the generic admission gate', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const gate = new PasswordHashAdmissionGate({ maxActive: 1, maxQueued: 1 });
    let admittedOperations = 0;
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      passwordHashAdmissionGate: {
        run(operation, signal) {
          return gate.run(async () => {
            admittedOperations += 1;
            return operation();
          }, signal);
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { identifier: 'unknown@example.com', password: PASSWORD },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'invalid_credentials',
      message: 'Email, username, or password is incorrect',
    });
    expect(admittedOperations).toBe(1);
    await app.close();
  });

  it('requires email verification before minting a session, then rotates workspace sessions', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
    });

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email: 'Creator@Example.com',
        name: 'Creator',
        workspaceName: 'First workspace',
      },
    });
    expect(signUp.statusCode).toBe(202);
    expect(signUp.headers['set-cookie']).toBeUndefined();
    const verification = signUp.json<{
      status: string;
      challengeId: string;
      verificationToken: string;
    }>();
    expect(verification.status).toBe('verification_required');

    const pendingCredential = await repository.findPasswordCredentialByEmail(
      'creator@example.com',
      hashAuthEmailLookup('creator@example.com'),
    );
    expect(pendingCredential).not.toBeNull();
    if (!pendingCredential) throw new Error('Expected pending signup credential');
    await expect(repository.listIdentityWorkspaces(pendingCredential.userId)).resolves.toEqual([]);
    await expect(
      repository.getCurrentIdentityOnboarding(pendingCredential.userId),
    ).resolves.toMatchObject({
      intent: 'create_workspace',
      status: 'pending_identity',
      targetWorkspaceName: 'First workspace',
      completedWorkspaceId: null,
    });

    const beforeVerification = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { identifier: 'creator@example.com', password: PASSWORD },
    });
    expect(beforeVerification.statusCode).toBe(401);
    expect(beforeVerification.json()).toEqual({
      error: 'invalid_credentials',
      message: 'Email, username, or password is incorrect',
    });

    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: {
        challengeId: verification.challengeId,
        token: verification.verificationToken,
        password: VERIFIED_PASSWORD,
      },
    });
    expect(verified.statusCode).toBe(200);
    const firstToken = cookieToken(verified.headers['set-cookie'], 'lodariq_session_dev');
    expect(firstToken).toMatch(/^lq_sess_/);
    expect(String(verified.headers['set-cookie'])).not.toContain('Expires=');
    const firstSnapshot = verified.json<{
      user: { email: string };
      activeWorkspaceId: string;
      workspaces: Array<{ id: string }>;
    }>();
    expect(firstSnapshot.user.email).toBe('creator@example.com');
    expect(firstSnapshot.workspaces).toHaveLength(1);
    await expect(
      repository.getCurrentIdentityOnboarding(pendingCredential.userId),
    ).resolves.toMatchObject({
      status: 'completed',
      completedWorkspaceId: firstSnapshot.activeWorkspaceId,
    });
    const verifiedCredential = await repository.findPasswordCredentialByEmail(
      'creator@example.com',
      hashAuthEmailLookup('creator@example.com'),
    );
    await expect(verifyOwnedPassword(PASSWORD, verifiedCredential)).resolves.toBe(false);
    await expect(verifyOwnedPassword(VERIFIED_PASSWORD, verifiedCredential)).resolves.toBe(true);

    const context = await app.inject({
      method: 'GET',
      url: '/v1/auth/context',
      headers: { authorization: `Bearer ${firstToken}` },
    });
    expect(context.statusCode).toBe(200);
    expect(context.json<{ role: string }>().role).toBe('owner');

    const onboarding = await app.inject({
      method: 'GET',
      url: '/v1/auth/onboarding',
      headers: { authorization: `Bearer ${firstToken}` },
    });
    expect(onboarding.statusCode).toBe(200);
    expect(onboarding.json()).toMatchObject({
      intent: 'create_workspace',
      status: 'completed',
      completedWorkspaceId: firstSnapshot.activeWorkspaceId,
    });

    const username = await app.inject({
      method: 'PUT',
      url: '/v1/auth/username',
      headers: { authorization: `Bearer ${firstToken}` },
      payload: { username: 'Creator.Handle', password: VERIFIED_PASSWORD },
    });
    expect(username.statusCode).toBe(200);
    expect(username.json()).toEqual({ username: 'Creator.Handle' });

    const usernameSignIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { identifier: 'creator.handle', password: VERIFIED_PASSWORD, rememberMe: true },
    });
    expect(usernameSignIn.statusCode).toBe(200);
    expect(String(usernameSignIn.headers['set-cookie'])).toContain('Expires=');
    expect(usernameSignIn.json<{ user: { email: string } }>().user.email).toBe(
      'creator@example.com',
    );
    const rememberedToken = cookieToken(
      usernameSignIn.headers['set-cookie'],
      'lodariq_session_dev',
    );
    await expect(
      repository.resolveAuthSession(
        hashAuthSessionToken(rememberedToken),
        new Date().toISOString(),
      ),
    ).resolves.toMatchObject({
      durationPolicy: 'remembered',
    });

    const createdWorkspace = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: { authorization: `Bearer ${firstToken}` },
      payload: { name: 'Second workspace' },
    });
    expect(createdWorkspace.statusCode).toBe(201);
    const secondToken = cookieToken(createdWorkspace.headers['set-cookie'], 'lodariq_session_dev');
    expect(secondToken).not.toBe(firstToken);
    expect(createdWorkspace.json<{ workspaces: unknown[] }>().workspaces).toHaveLength(2);

    const revokedSource = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${firstToken}` },
    });
    expect(revokedSource.statusCode).toBe(401);

    await app.close();
  });

  it('revokes a seeded session if its identity is not verified', async () => {
    const rawToken = 'lq_sess_seeded_unverified';
    const now = Date.now();
    const session: AuthSessionRecord = {
      id: 'authsess_seededunverified1234567890',
      userId: 'usr_unverified',
      tokenHash: hashAuthSessionToken(rawToken),
      activeWorkspaceId: 'wk_unverified',
      identityId: null,
      authenticationMethod: 'password',
      assuranceLevel: 'aal1',
      authenticatedAt: new Date(now - 1_000).toISOString(),
      durationPolicy: 'standard',
      createdAt: new Date(now - 1_000).toISOString(),
      lastSeenAt: new Date(now - 1_000).toISOString(),
      idleExpiresAt: new Date(now + 60_000).toISOString(),
      absoluteExpiresAt: new Date(now + 120_000).toISOString(),
      revokedAt: null,
    };
    const repository = createInMemoryControlPlaneRepository({
      workspaces: [
        {
          id: 'wk_unverified',
          name: 'Unverified',
          createdAt: session.createdAt,
          updatedAt: session.createdAt,
        },
      ],
      users: [
        {
          id: 'usr_unverified',
          legacyIdentityId: null,
          email: 'unverified@example.com',
          name: 'Unverified',
          emailVerifiedAt: null,
          createdAt: session.createdAt,
        },
      ],
      workspaceMemberships: [
        {
          workspaceId: 'wk_unverified',
          userId: 'usr_unverified',
          role: 'owner',
          createdAt: session.createdAt,
        },
      ],
      authSessions: [session],
    });
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(response.statusCode).toBe(401);
    await expect(
      repository.resolveAuthSession(session.tokenHash, new Date().toISOString()),
    ).resolves.toBeNull();
    await app.close();
  });

  it('fails production signup closed and authenticates pseudonymous BFF source envelopes', async () => {
    await withEnvironment(
      {
        NODE_ENV: 'production',
        LODARIQ_AUTH_BFF_SOURCE_SECRET: 'production-bff-source-secret-at-least-32-bytes',
      },
      async () => {
        const repository = createInMemoryControlPlaneRepository();
        const secret = process.env.LODARIQ_AUTH_BFF_SOURCE_SECRET!;
        const envelope = createAuthClientSourceEnvelope('203.0.113.8', secret);
        const app = createApiApp({
          repository,
          authProvider: createLodariqAuthProvider(repository),
        });
        const rejected = await app.inject({
          method: 'POST',
          url: '/v1/auth/sign-up',
          headers: {
            [AUTH_CLIENT_SOURCE_HEADER]: envelope,
            'x-forwarded-for': '198.51.100.99',
          },
          payload: {
            email: 'prod@example.com',
            name: 'Production',
            workspaceName: 'Production workspace',
          },
        });
        expect(rejected.statusCode).toBe(503);
        expect(rejected.json()).toEqual({
          error: 'signup_unavailable',
          message: 'Account creation is temporarily unavailable',
        });

        const missingEnvelope = await app.inject({
          method: 'POST',
          url: '/v1/auth/sign-in',
          headers: { 'x-forwarded-for': '203.0.113.8' },
          payload: { identifier: 'nobody@example.com', password: PASSWORD },
        });
        expect(missingEnvelope.statusCode).toBe(401);
        await app.close();
      },
    );
  });

  it('keeps production verification secrets out of responses and uses the hardened cookie', async () => {
    await withEnvironment(
      {
        NODE_ENV: 'production',
        LODARIQ_AUTH_BFF_SOURCE_SECRET: 'production-source-secret-at-least-32-bytes',
        LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
      },
      async () => {
        const repository = createInMemoryControlPlaneRepository();
        const authEvents: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
        const deliverySecret = 'production-email-delivery-secret-at-least-32-bytes';
        const sourceEnvelope = createAuthClientSourceEnvelope(
          '203.0.113.44',
          process.env.LODARIQ_AUTH_BFF_SOURCE_SECRET!,
        );
        const app = createApiApp({
          repository,
          authProvider: createLodariqAuthProvider(repository),
          emailVerificationDelivery: {
            kind: 'email-verification-dispatcher-v1',
            secret: deliverySecret,
          },
          observability: { emit: (event) => authEvents.push(event) },
        });

        const signUp = await app.inject({
          method: 'POST',
          url: '/v1/auth/sign-up',
          headers: { [AUTH_CLIENT_SOURCE_HEADER]: sourceEnvelope },
          payload: {
            email: 'verified-production@example.com',
            name: 'Production creator',
            workspaceName: 'Production workspace',
          },
        });
        expect(signUp.statusCode).toBe(202);
        expect(signUp.headers['set-cookie']).toBeUndefined();
        expect(signUp.json()).toEqual({ status: 'verification_required' });
        const signupEvent = authEvents.find(({ name }) => name === 'auth.signup.completed');
        const challengeId = signupEvent?.attributes?.challengeId;
        expect(challengeId).toMatch(/^verify_/u);
        if (typeof challengeId !== 'string') throw new Error('Expected sign-up challenge event');

        const verified = await app.inject({
          method: 'POST',
          url: '/v1/auth/verify-email',
          headers: { [AUTH_CLIENT_SOURCE_HEADER]: sourceEnvelope },
          payload: {
            challengeId,
            token: createEmailVerificationToken(challengeId, deliverySecret),
            password: VERIFIED_PASSWORD,
          },
        });
        expect(verified.statusCode).toBe(200);
        expect(verified.headers['set-cookie']).toContain('__Host-lodariq_session=');
        expect(verified.headers['set-cookie']).toContain('Secure');
        expect(verified.headers['set-cookie']).toContain('HttpOnly');
        expect(verified.headers['set-cookie']).toContain('SameSite=Lax');
        expect(verified.headers['set-cookie']).not.toContain('Domain=');

        await app.close();
      },
    );
  });

  it('uses distinct authenticated client sources and short-circuits blocked sources', async () => {
    await withEnvironment(
      {
        NODE_ENV: 'production',
        LODARIQ_AUTH_BFF_SOURCE_SECRET: 'source-isolation-secret-at-least-32-bytes',
      },
      async () => {
        const base = createInMemoryControlPlaneRepository();
        const captured: ConsumeAuthRateLimitInput[] = [];
        let blockSource = false;
        const repository = new Proxy(base, {
          get(target, property, receiver) {
            if (property === 'consumeAuthRateLimit') {
              return async (input: ConsumeAuthRateLimitInput) => {
                captured.push(structuredClone(input));
                if (blockSource && input.maxAttempts > 100) {
                  return { allowed: false, retryAfterSeconds: 5 };
                }
                return target.consumeAuthRateLimit(input);
              };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }) as ControlPlaneRepository;
        const app = createApiApp({
          repository,
          authProvider: createLodariqAuthProvider(repository),
        });
        const secret = process.env.LODARIQ_AUTH_BFF_SOURCE_SECRET!;
        const sourceA = createAuthClientSourceEnvelope('203.0.113.10', secret);
        const sourceB = createAuthClientSourceEnvelope('203.0.113.11', secret);

        for (const [email, envelope, spoofedForwardedFor] of [
          ['one@example.com', sourceA, '198.51.100.10'],
          ['two@example.com', sourceA, '198.51.100.11'],
          ['three@example.com', sourceB, '198.51.100.10'],
        ] as const) {
          await app.inject({
            method: 'POST',
            url: '/v1/auth/sign-in',
            headers: {
              [AUTH_CLIENT_SOURCE_HEADER]: envelope,
              'x-forwarded-for': spoofedForwardedFor,
            },
            payload: { identifier: email, password: PASSWORD },
          });
        }
        const sourceBuckets = captured
          .filter(({ maxAttempts }) => maxAttempts > 100)
          .map(({ bucketHash }) => bucketHash);
        expect(sourceBuckets[0]).toBe(sourceBuckets[1]);
        expect(sourceBuckets[2]).not.toBe(sourceBuckets[0]);

        captured.length = 0;
        blockSource = true;
        const blocked = await app.inject({
          method: 'POST',
          url: '/v1/auth/sign-in',
          headers: {
            [AUTH_CLIENT_SOURCE_HEADER]: createAuthClientSourceEnvelope('203.0.113.12', secret),
            'x-forwarded-for': '192.0.2.200',
          },
          payload: { identifier: 'many-rows@example.com', password: PASSWORD },
        });
        expect(blocked.statusCode).toBe(429);
        expect(captured).toHaveLength(1);
        await app.close();
      },
    );
  });
});

function cookieToken(header: string | string[] | undefined, name: string): string {
  const value = Array.isArray(header) ? header[0] : header;
  const match = new RegExp(`${name}=([^;]+)`).exec(value ?? '');
  if (!match?.[1]) throw new Error(`Missing ${name} cookie`);
  return decodeURIComponent(match[1]);
}

async function withEnvironment(
  updates: Record<string, string>,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    await operation();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
