import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiApp } from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

describe('API liveness and dependency readiness', () => {
  let app: ReturnType<typeof createApiApp> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('reports readiness only after the repository dependency responds', async () => {
    const repository = createInMemoryControlPlaneRepository();
    const readiness = vi.spyOn(repository, 'checkReadiness');
    app = createApiApp({ repository });

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(readiness).toHaveBeenCalledOnce();
  });

  it('keeps process liveness separate while readiness fails closed without details', async () => {
    const repository = createInMemoryControlPlaneRepository();
    vi.spyOn(repository, 'checkReadiness').mockRejectedValue(new Error('secret database detail'));
    app = createApiApp({ repository });

    const [liveness, readiness] = await Promise.all([
      app.inject({ method: 'GET', url: '/healthz' }),
      app.inject({ method: 'GET', url: '/readyz' }),
    ]);

    expect(liveness.statusCode).toBe(200);
    expect(liveness.json()).toEqual({ ok: true });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({ ok: false });
    expect(readiness.body).not.toContain('database');
  });

  it('fails readiness and emits a privacy-safe diagnostic when database clock skew is unsafe', async () => {
    const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const repository = createInMemoryControlPlaneRepository();
    vi.spyOn(repository, 'readDatabaseTime').mockImplementation(async () =>
      new Date(Date.now() + 31_000).toISOString(),
    );
    app = createApiApp({
      repository,
      observability: { emit: (event) => events.push(event) },
    });

    const response = await app.inject({ method: 'GET', url: '/readyz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false });
    expect(events).toEqual([
      {
        name: 'auth.clock.skew_detected',
        attributes: { skewMs: expect.any(Number) },
        timestamp: expect.any(String),
      },
    ]);
    expect(events[0]?.attributes?.['skewMs']).toBeGreaterThan(30_000);
  });
});
