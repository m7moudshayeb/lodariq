import { describe, expect, it } from 'vitest';
import {
  AUTH_CLIENT_SOURCE_HEADER,
  createApiApp,
  createAuthClientSourceEnvelope,
  createLodariqAuthProvider,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

const PASSWORD = 'a-secure-verification-password';

describe('@lodariq/api email verification resend', () => {
  it('keeps duplicate sign-up generic while replacing only the persisted account challenge', async () => {
    let now = new Date('2026-08-15T09:00:00.000Z');
    const repository = createInMemoryControlPlaneRepository();
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(now),
    });
    const payload = {
      email: 'duplicate@example.com',
      name: 'Original owner',
      workspaceName: 'Original workspace',
    };
    const first = await app.inject({ method: 'POST', url: '/v1/auth/sign-up', payload });
    const firstLink = first.json<{ challengeId: string; verificationToken: string }>();

    now = new Date('2026-08-15T09:00:31.000Z');
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        ...payload,
        email: 'DUPLICATE@example.com',
        name: 'Attacker-controlled replacement name',
        workspaceName: 'Must not be created',
      },
    });
    expect(duplicate.statusCode).toBe(202);
    const replacement = duplicate.json<{
      status: string;
      challengeId: string;
      verificationToken: string;
    }>();
    expect(replacement.status).toBe('verification_required');
    expect(replacement.challengeId).not.toBe(firstLink.challengeId);

    const oldLink = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: {
        challengeId: firstLink.challengeId,
        token: firstLink.verificationToken,
        password: PASSWORD,
      },
    });
    expect(oldLink.statusCode).toBe(400);
    const latestLink = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: {
        challengeId: replacement.challengeId,
        token: replacement.verificationToken,
        password: PASSWORD,
      },
    });
    expect(latestLink.statusCode).toBe(200);
    const session = latestLink.json<{ workspaces: Array<{ name: string }> }>();
    expect(session.workspaces).toEqual([expect.objectContaining({ name: 'Original workspace' })]);
    await app.close();
  });

  it('atomically supersedes the old link after cooldown and keeps public outcomes generic', async () => {
    let now = new Date('2026-08-15T10:00:00.000Z');
    const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const repository = createInMemoryControlPlaneRepository();
    const app = createApiApp({
      repository,
      authProvider: createLodariqAuthProvider(repository),
      authClock: () => new Date(now),
      observability: { emit: (event) => events.push(event) },
    });

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email: 'Creator@Example.com',
        name: 'Creator',
        workspaceName: 'Product',
      },
    });
    const original = signUp.json<{
      challengeId: string;
      verificationToken: string;
    }>();

    const coolingDown = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email: 'Creator@Example.com' },
    });
    expect(coolingDown.statusCode).toBe(202);
    expect(coolingDown.json()).toEqual({ status: 'accepted' });

    now = new Date('2026-08-15T10:00:31.000Z');
    const replacementResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email: 'creator@example.com' },
    });
    expect(replacementResponse.statusCode).toBe(202);
    const replacement = replacementResponse.json<{
      status: string;
      challengeId: string;
      expiresAt: string;
      verificationToken: string;
    }>();
    expect(replacement).toMatchObject({
      status: 'accepted',
      expiresAt: '2026-08-16T10:00:31.000Z',
    });
    expect(replacement.challengeId).not.toBe(original.challengeId);

    const superseded = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: {
        challengeId: original.challengeId,
        token: original.verificationToken,
        password: PASSWORD,
      },
    });
    expect(superseded.statusCode).toBe(400);

    const verified = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: {
        challengeId: replacement.challengeId,
        token: replacement.verificationToken,
        password: PASSWORD,
      },
    });
    expect(verified.statusCode).toBe(200);

    const alreadyVerified = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email: 'creator@example.com' },
    });
    expect(alreadyVerified.statusCode).toBe(202);
    expect(alreadyVerified.json()).toEqual({ status: 'accepted' });

    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/resend-verification',
      payload: { email: 'unknown@example.com' },
    });
    expect(unknown.statusCode).toBe(202);
    expect(unknown.json()).toEqual({ status: 'accepted' });
    expect(events.filter(({ name }) => name === 'auth.verification.resend.completed')).toHaveLength(
      4,
    );
    expect(JSON.stringify(events)).not.toContain('creator@example.com');
    expect(JSON.stringify(events)).not.toContain('unknown@example.com');
    expect(JSON.stringify(events)).not.toMatch(/lq_verify_/u);

    await app.close();
  });

  it('shares identity abuse limits across case variants and distributed request sources', async () => {
    const sourceSecret = 'distributed-source-test-secret-at-least-32-bytes';
    await withEnvironment(
      {
        NODE_ENV: 'production',
        LODARIQ_AUTH_BFF_SOURCE_SECRET: sourceSecret,
        LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
      },
      async () => {
        const repository = createInMemoryControlPlaneRepository();
        const app = createApiApp({
          repository,
          authProvider: createLodariqAuthProvider(repository),
          authClock: () => new Date('2026-08-15T11:00:00.000Z'),
          emailVerificationDelivery: {
            kind: 'email-verification-dispatcher-v1',
            secret: 'distributed-email-test-secret-at-least-32-bytes',
          },
        });
        await app.inject({
          method: 'POST',
          url: '/v1/auth/sign-up',
          headers: {
            [AUTH_CLIENT_SOURCE_HEADER]: createAuthClientSourceEnvelope(
              '203.0.113.1',
              sourceSecret,
            ),
          },
          payload: {
            email: 'rate-limit@example.com',
            name: 'Rate limit',
            workspaceName: 'Rate limit',
          },
        });

        const attempts = await Promise.all(
          ['RATE-LIMIT@example.com', 'rate-limit@EXAMPLE.com', 'Rate-Limit@example.com'].map(
            (email, index) =>
              app.inject({
                method: 'POST',
                url: '/v1/auth/resend-verification',
                headers: {
                  [AUTH_CLIENT_SOURCE_HEADER]: createAuthClientSourceEnvelope(
                    `203.0.113.${index + 10}`,
                    sourceSecret,
                  ),
                },
                payload: { email },
              }),
          ),
        );
        expect(attempts.map(({ statusCode }) => statusCode)).toEqual([202, 202, 202]);
        const blocked = await app.inject({
          method: 'POST',
          url: '/v1/auth/resend-verification',
          headers: {
            [AUTH_CLIENT_SOURCE_HEADER]: createAuthClientSourceEnvelope(
              '198.51.100.77',
              sourceSecret,
            ),
          },
          payload: { email: 'rate-limit@example.com' },
        });
        expect(blocked.statusCode).toBe(429);
        await app.close();
      },
    );
  });
});

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
