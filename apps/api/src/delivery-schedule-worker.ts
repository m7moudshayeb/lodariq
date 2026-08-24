import { randomUUID } from 'node:crypto';
import type { ControlPlaneRepository } from '@lodariq/database';

export interface DeliveryScheduleWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface DeliveryScheduleWorkerOptions {
  repository: ControlPlaneRepository;
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
}

export function createDeliveryScheduleWorker(
  options: DeliveryScheduleWorkerOptions,
): DeliveryScheduleWorker {
  const intervalMs = Math.max(250, options.intervalMs ?? 5_000);
  const workerId = options.workerId ?? `delivery_${randomUUID()}`;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<void> | null = null;

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref?.();
  };

  const run = (): void => {
    if (stopped || active) return;
    active = options.repository
      .runDueDeliveryScheduleJobs({
        workerId,
        now: (options.clock?.() ?? new Date()).toISOString(),
      })
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        active = null;
        schedule();
      });
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      run();
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await active;
    },
  };
}
