import { createHash, randomUUID } from 'node:crypto';
import {
  analyticsWarehouseBatchHash,
  toPublicAnalyticsWarehouseDestination,
  warehouseAnalyticsEvent,
  type AnalyticsWarehouseDeliveryBatch,
  type AnalyticsWarehouseDestinationRecord,
  type ControlPlaneRepository,
} from '@lodariq/database';
import { ANALYTICS_WAREHOUSE_CONTRACT_VERSION } from '@lodariq/schema/analytics-warehouse';
import {
  assertAnalyticsWarehouseProvider,
  warehouseProviderForDestination,
  type AnalyticsWarehouseProvider,
} from './analytics-warehouse';

export interface AnalyticsWarehouseWorker {
  start(): void;
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

export interface AnalyticsWarehouseWorkerOptions {
  repository: ControlPlaneRepository;
  providers: readonly AnalyticsWarehouseProvider[];
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
  batchSize?: number;
}

export function createAnalyticsWarehouseWorker(
  options: AnalyticsWarehouseWorkerOptions,
): AnalyticsWarehouseWorker {
  const providers = providerMap(options.providers);
  const intervalMs = Math.max(1_000, options.intervalMs ?? 15_000);
  const workerId = options.workerId ?? `warehouse_worker_${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 5, 25));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<number> | null = null;
  const clock = (): Date => options.clock?.() ?? new Date();

  const runOnce = async (): Promise<number> => {
    const claimedAt = clock();
    const destinations = await options.repository.claimAnalyticsWarehouseDestinations({
      workerId,
      now: claimedAt.toISOString(),
      limit: batchSize,
    });
    for (const destination of destinations) {
      await synchronizeDestination(options.repository, providers, destination, workerId, clock);
    }
    return destinations.length;
  };
  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(run, intervalMs);
    timer.unref?.();
  };
  const run = (): void => {
    if (stopped || active) return;
    active = runOnce()
      .catch(() => 0)
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
    runOnce,
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await active;
    },
  };
}

async function synchronizeDestination(
  repository: ControlPlaneRepository,
  providers: ReadonlyMap<string, AnalyticsWarehouseProvider>,
  destination: AnalyticsWarehouseDestinationRecord,
  workerId: string,
  clock: () => Date,
): Promise<void> {
  try {
    const provider = warehouseProviderForDestination(providers, destination);
    if (!provider) throw new Error('warehouse_provider_unavailable');
    const events = await repository.readAnalyticsWarehouseEvents({ destination, limit: 1_000 });
    if (events.length === 0) {
      const checkedAt = clock();
      await repository.releaseEmptyAnalyticsWarehouseDestination(
        destination.workspaceId,
        destination.id,
        workerId,
        checkedAt.toISOString(),
        new Date(checkedAt.getTime() + 60_000).toISOString(),
      );
      return;
    }
    const batchHash = analyticsWarehouseBatchHash(events);
    const batch: AnalyticsWarehouseDeliveryBatch = {
      contractVersion: ANALYTICS_WAREHOUSE_CONTRACT_VERSION,
      destinationId: destination.id,
      workspaceId: destination.workspaceId,
      environmentId: destination.environmentId,
      ...(destination.documentId ? { documentId: destination.documentId } : {}),
      events: events.map(warehouseAnalyticsEvent),
      batchHash,
    };
    const result = await provider.deliver({
      destination: toPublicAnalyticsWarehouseDestination(destination),
      credentialReference: destination.credentialReference,
      idempotencyKey: `${destination.id}:${batchHash}`,
      batch,
    });
    await repository.completeAnalyticsWarehouseDelivery({
      workspaceId: destination.workspaceId,
      destinationId: destination.id,
      workerId,
      runId: opaqueId('whrun'),
      events,
      providerBatchId: result.providerBatchId,
      reportedEventCount: result.acceptedEventCount,
      reportedBatchHash: result.batchHash,
      completedAt: clock().toISOString(),
    });
  } catch (error) {
    const failedAt = clock();
    const delayMs = analyticsWarehouseRetryDelayMs(destination.id, destination.attemptCount);
    await repository.failAnalyticsWarehouseDelivery({
      workspaceId: destination.workspaceId,
      destinationId: destination.id,
      workerId,
      runId: opaqueId('whrun'),
      errorCode:
        error instanceof Error && error.message === 'warehouse_provider_unavailable'
          ? 'provider_unavailable'
          : 'delivery_failed',
      failedAt: failedAt.toISOString(),
      nextAttemptAt: new Date(failedAt.getTime() + delayMs).toISOString(),
    });
  }
}

export function analyticsWarehouseRetryDelayMs(
  destinationId: string,
  attemptCount: number,
): number {
  const base = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1));
  const jitter = createHash('sha256')
    .update(`lodariq-warehouse:${destinationId}:${attemptCount}`)
    .digest()
    .readUInt16BE(0);
  return base + Math.floor((base * 0.2 * jitter) / 65_535);
}

function providerMap(
  providers: readonly AnalyticsWarehouseProvider[],
): ReadonlyMap<string, AnalyticsWarehouseProvider> {
  const result = new Map<string, AnalyticsWarehouseProvider>();
  for (const provider of providers) {
    assertAnalyticsWarehouseProvider(provider);
    if (result.has(provider.id)) throw new Error('Analytics warehouse provider ids must be unique');
    result.set(provider.id, provider);
  }
  return result;
}

function opaqueId(prefix: 'whrun'): string {
  return `${prefix}_${randomUUID()}`;
}
