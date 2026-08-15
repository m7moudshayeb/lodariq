import type { AuthLifecycleCleanupResult, ControlPlaneRepository } from '@lodariq/database';
import type { ObservabilitySink } from '../observability';

export const AUTH_LIFECYCLE_RETENTION_MS = Object.freeze({
  abandonedUnverifiedAccount: 14 * 24 * 60 * 60 * 1_000,
  completedChallenge: 7 * 24 * 60 * 60 * 1_000,
  expiredOrRevokedSession: 30 * 24 * 60 * 60 * 1_000,
  staleRateLimitBucket: 7 * 24 * 60 * 60 * 1_000,
  completedOutbox: 30 * 24 * 60 * 60 * 1_000,
});

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_BATCH_SIZE = 100;

export interface AuthLifecycleMaintenanceOptions {
  repository: ControlPlaneRepository;
  observability: ObservabilitySink;
  intervalMs?: number;
  batchSize?: number;
}

export interface AuthLifecycleMaintenance {
  start(): void;
  stop(): Promise<void>;
  runOnce(): Promise<AuthLifecycleCleanupResult>;
}

export function createAuthLifecycleMaintenance(
  options: AuthLifecycleMaintenanceOptions,
): AuthLifecycleMaintenance {
  const intervalMs = boundedInteger(options.intervalMs ?? DEFAULT_INTERVAL_MS, 60_000, 86_400_000);
  const batchSize = boundedInteger(options.batchSize ?? DEFAULT_BATCH_SIZE, 1, 100);
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: Promise<AuthLifecycleCleanupResult> | null = null;

  const schedule = (delayMs: number): void => {
    if (!running || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void runOnce().catch(() => undefined);
    }, delayMs);
    timer.unref?.();
  };

  const runOnce = (): Promise<AuthLifecycleCleanupResult> => {
    if (active) return active;
    active = runCleanup(options.repository, options.observability, batchSize)
      .catch((error: unknown) => {
        options.observability.emit({
          name: 'auth.lifecycle.cleanup_failed',
          timestamp: new Date().toISOString(),
          attributes: {
            failureCode: error instanceof Error ? 'repository_failure' : 'unknown_failure',
          },
        });
        throw error;
      })
      .finally(() => {
        active = null;
        schedule(intervalMs);
      });
    return active;
  };

  return {
    start() {
      if (running) return;
      running = true;
      schedule(0);
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      await active?.catch(() => undefined);
    },
    runOnce,
  };
}

export function createAuthLifecycleMaintenanceFromEnvironment(
  repository: ControlPlaneRepository,
  observability: ObservabilitySink,
  environment: NodeJS.ProcessEnv = process.env,
): AuthLifecycleMaintenance | null {
  const configured = environment.LODARIQ_AUTH_MAINTENANCE_ENABLED?.trim();
  const enabled = configured ? configured === 'true' : environment.NODE_ENV === 'production';
  if (!enabled) return null;
  if (configured && configured !== 'true' && configured !== 'false') {
    throw new Error('LODARIQ_AUTH_MAINTENANCE_ENABLED must be "true" or "false"');
  }
  return createAuthLifecycleMaintenance({ repository, observability });
}

async function runCleanup(
  repository: ControlPlaneRepository,
  observability: ObservabilitySink,
  limit: number,
): Promise<AuthLifecycleCleanupResult> {
  const databaseNow = await repository.readDatabaseTime();
  const nowMs = Date.parse(databaseNow);
  if (!Number.isFinite(nowMs)) throw new Error('Database returned an invalid maintenance clock');
  const result = await repository.cleanupAuthLifecycle({
    now: new Date(nowMs).toISOString(),
    abandonedUnverifiedBefore: cutoff(
      nowMs,
      AUTH_LIFECYCLE_RETENTION_MS.abandonedUnverifiedAccount,
    ),
    challengeBefore: cutoff(nowMs, AUTH_LIFECYCLE_RETENTION_MS.completedChallenge),
    sessionBefore: cutoff(nowMs, AUTH_LIFECYCLE_RETENTION_MS.expiredOrRevokedSession),
    rateLimitBefore: cutoff(nowMs, AUTH_LIFECYCLE_RETENTION_MS.staleRateLimitBucket),
    outboxBefore: cutoff(nowMs, AUTH_LIFECYCLE_RETENTION_MS.completedOutbox),
    limit,
  });
  observability.emit({
    name: 'auth.lifecycle.cleanup_completed',
    timestamp: new Date(nowMs).toISOString(),
    attributes: { ...result },
  });
  return result;
}

function cutoff(nowMs: number, retentionMs: number): string {
  return new Date(nowMs - retentionMs).toISOString();
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
