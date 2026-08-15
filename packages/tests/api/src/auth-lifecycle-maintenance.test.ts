import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_LIFECYCLE_RETENTION_MS,
  createAuthLifecycleMaintenance,
  createAuthLifecycleMaintenanceFromEnvironment,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';

describe('@lodariq/api auth lifecycle maintenance', () => {
  it('is production-default, development-opt-in, and emits aggregate counts', async () => {
    const repository = createInMemoryControlPlaneRepository();
    expect(
      createAuthLifecycleMaintenanceFromEnvironment(
        repository,
        { emit() {} },
        {
          NODE_ENV: 'development',
        },
      ),
    ).toBeNull();
    expect(
      createAuthLifecycleMaintenanceFromEnvironment(
        repository,
        { emit() {} },
        {
          NODE_ENV: 'production',
        },
      ),
    ).not.toBeNull();

    const cleanup = vi.spyOn(repository, 'cleanupAuthLifecycle');
    const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const maintenance = createAuthLifecycleMaintenance({
      repository,
      observability: { emit: (event) => events.push(event) },
      intervalMs: 60_000,
      batchSize: 10,
    });
    await maintenance.runOnce();

    expect(cleanup).toHaveBeenCalledOnce();
    const input = cleanup.mock.calls[0]?.[0];
    expect(input?.limit).toBe(10);
    expect(Date.parse(input!.now) - Date.parse(input!.challengeBefore)).toBe(
      AUTH_LIFECYCLE_RETENTION_MS.completedChallenge,
    );
    expect(events).toEqual([
      expect.objectContaining({
        name: 'auth.lifecycle.cleanup_completed',
        attributes: expect.objectContaining({ abandonedUsers: 0 }),
      }),
    ]);
    await maintenance.stop();
  });
});
