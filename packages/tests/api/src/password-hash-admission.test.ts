import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordHashAdmissionGateFromEnvironment,
  PasswordHashAdmissionGate,
  verifyOwnedPassword,
} from '@lodariq/api';

describe('password-hash admission gate', () => {
  it('caps active work and bounds the queue', async () => {
    const gate = new PasswordHashAdmissionGate({
      maxActive: 2,
      maxQueued: 1,
      queueTimeoutMs: 1_000,
    });
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const operation = () =>
      gate.run(
        () =>
          new Promise<void>((resolve) => {
            active += 1;
            peak = Math.max(peak, active);
            releases.push(() => {
              active -= 1;
              resolve();
            });
          }),
      );

    const first = operation();
    const second = operation();
    const queued = operation();
    await expect(operation()).rejects.toMatchObject({
      reason: 'queue_full',
    });
    await Promise.resolve();
    expect(peak).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(peak).toBe(2);
    for (const release of releases.splice(0)) release();
    await Promise.all([first, second, queued]);
  });

  it('times out and aborts queued work without leaking capacity', async () => {
    const gate = new PasswordHashAdmissionGate({
      maxActive: 1,
      maxQueued: 2,
      queueTimeoutMs: 15,
    });
    let releaseActive!: () => void;
    const active = gate.run(
      () =>
        new Promise<void>((resolve) => {
          releaseActive = resolve;
        }),
    );
    const timedOut = gate.run(async () => undefined);
    await expect(timedOut).rejects.toMatchObject({ reason: 'timeout' });

    const controller = new AbortController();
    const aborted = gate.run(async () => undefined, controller.signal);
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ reason: 'aborted' });
    releaseActive();
    await active;
    await expect(gate.run(async () => 'released')).resolves.toBe('released');
  });

  it('releases on operation failure and admits unknown-account Argon2id dummy work', async () => {
    const gate = new PasswordHashAdmissionGate({ maxActive: 1, maxQueued: 1 });
    await expect(
      gate.run(async () => {
        throw new Error('operation failed');
      }),
    ).rejects.toThrow('operation failed');
    await expect(gate.run(() => verifyOwnedPassword('not-the-password', null))).resolves.toBe(
      false,
    );
  });

  it('rejects invalid deployment admission limits instead of silently widening capacity', () => {
    expect(() =>
      createPasswordHashAdmissionGateFromEnvironment({
        LODARIQ_PASSWORD_HASH_MAX_ACTIVE: 'unbounded',
      }),
    ).toThrow(/LODARIQ_PASSWORD_HASH_MAX_ACTIVE must be an integer/);
    expect(() =>
      createPasswordHashAdmissionGateFromEnvironment({
        LODARIQ_PASSWORD_HASH_MAX_ACTIVE: '5',
      }),
    ).toThrow(/LODARIQ_PASSWORD_HASH_MAX_ACTIVE must be an integer between 1 and 4/);
  });
});
