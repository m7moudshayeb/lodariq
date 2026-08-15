import { describe, expect, it, vi } from 'vitest';
import { createApiApp, createAuthEmailRuntimeFromEnvironment } from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

const TOKEN_SECRET = 'auth-email-token-secret-at-least-32-bytes';

describe('@lodariq/api auth email runtime', () => {
  it('stays disabled by default and builds the Resend runtime only from complete config', () => {
    const repository = createInMemoryControlPlaneRepository();
    expect(createAuthEmailRuntimeFromEnvironment(repository, {})).toBeNull();
    expect(
      createAuthEmailRuntimeFromEnvironment(repository, {
        LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
        LODARIQ_APP_BASE_URL: 'https://app.lodariq.io',
        LODARIQ_AUTH_EMAIL_FROM: 'Lodariq <access@lodariq.io>',
        LODARIQ_AUTH_EMAIL_TOKEN_SECRET: TOKEN_SECRET,
        RESEND_API_KEY: 're_abcdefghijklmnopqrstuvwxyz',
      })?.deliveryCapability,
    ).toEqual({
      kind: 'email-verification-dispatcher-v1',
      secret: TOKEN_SECRET,
      keyId: 'legacy',
    });
  });

  it('starts and stops an injected worker with the Fastify lifecycle', async () => {
    const start = vi.fn();
    const stop = vi.fn(async () => undefined);
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      authEmailRuntime: {
        deliveryCapability: {
          kind: 'email-verification-dispatcher-v1',
          secret: TOKEN_SECRET,
        },
        worker: { start, stop },
      },
    });

    await app.ready();
    expect(start).toHaveBeenCalledOnce();
    await app.close();
    expect(stop).toHaveBeenCalledOnce();
  });
});
