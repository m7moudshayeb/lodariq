import { createHash, randomUUID } from 'node:crypto';
import {
  dataResidencyEvidencePhaseForStatus,
  type ControlPlaneRepository,
  type LeasedDataResidencyMigration,
} from '@lodariq/database';
import type { DataResidencyMigrationStatus } from '@lodariq/schema';
import {
  normalizedDataResidencyEvidence,
  regionRouteKey,
  type DataResidencyProvider,
  type DataResidencyProviderOperationResult,
} from './data-residency';

export interface DataResidencyWorker {
  start(): void;
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

export interface DataResidencyWorkerOptions {
  repository: ControlPlaneRepository;
  provider: DataResidencyProvider;
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
  batchSize?: number;
}

export function createDataResidencyWorker(
  options: DataResidencyWorkerOptions,
): DataResidencyWorker {
  const intervalMs = Math.max(1_000, options.intervalMs ?? 15_000);
  const workerId = options.workerId ?? `residency_worker_${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 5, 25));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<number> | null = null;

  const now = (): Date => options.clock?.() ?? new Date();
  const runOnce = async (): Promise<number> => {
    const leasedAt = now();
    const migrations = await options.repository.claimDataResidencyMigrations({
      workerId,
      now: leasedAt.toISOString(),
      limit: batchSize,
    });
    for (const leased of migrations) {
      await processMigration(options.repository, options.provider, leased, workerId, now);
    }
    return migrations.length;
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

async function processMigration(
  repository: ControlPlaneRepository,
  provider: DataResidencyProvider,
  leased: LeasedDataResidencyMigration,
  workerId: string,
  clock: () => Date,
): Promise<void> {
  const status = leased.migration.status;
  try {
    if (status === 'requested') {
      await completePhase(repository, leased, workerId, 'copying', clock());
      return;
    }
    const providerResult = await runProviderPhase(provider, leased);
    const completedAt = clock();
    const integrityMismatch =
      status === 'verifying' || status === 'cutover-ready'
        ? providerResult.sourceDigest !== providerResult.targetDigest
        : false;
    await completePhase(
      repository,
      leased,
      workerId,
      integrityMismatch ? 'failed' : nextStatus(status),
      completedAt,
      providerResult,
      integrityMismatch ? 'integrity_mismatch' : undefined,
    );
  } catch {
    const failedAt = clock();
    const delayMs = dataResidencyRetryDelayMs(
      leased.migration.id,
      leased.execution.attemptCount,
    );
    await repository.retryDataResidencyMigrationPhase({
      workspaceId: leased.migration.workspaceId,
      migrationId: leased.migration.id,
      workerId,
      expectedStatus: status,
      failedAt: failedAt.toISOString(),
      nextAvailableAt: new Date(failedAt.getTime() + delayMs).toISOString(),
      errorCode: 'provider_operation_failed',
      historyId: opaqueId('drhist'),
      auditEventId: opaqueId('tenevt'),
    });
  }
}

async function runProviderPhase(
  provider: DataResidencyProvider,
  leased: LeasedDataResidencyMigration,
): Promise<DataResidencyProviderOperationResult> {
  const input = {
    migration: leased.migration,
    sourceRouteKey: regionRouteKey(leased.migration.sourceRegion),
    targetRouteKey: regionRouteKey(leased.migration.targetRegion),
    idempotencyKey: `${leased.migration.id}:${leased.migration.status}`,
  };
  if (leased.migration.status === 'copying') return provider.copy(input);
  if (leased.migration.status === 'verifying') return provider.verify(input);
  if (leased.migration.status === 'cutover-ready') return provider.cutover(input);
  throw new Error('Data residency migration status is not provider-executable');
}

async function completePhase(
  repository: ControlPlaneRepository,
  leased: LeasedDataResidencyMigration,
  workerId: string,
  next: DataResidencyMigrationStatus,
  completedAt: Date,
  providerResult?: DataResidencyProviderOperationResult,
  failureCode?: string,
): Promise<void> {
  const expectedStatus = leased.migration.status;
  const phase = dataResidencyEvidencePhaseForStatus(expectedStatus);
  const evidence =
    phase && providerResult
      ? normalizedDataResidencyEvidence({
          id: opaqueId('drproof'),
          workspaceId: leased.migration.workspaceId,
          migrationId: leased.migration.id,
          phase,
          result: providerResult,
          occurredAt: completedAt.toISOString(),
        })
      : undefined;
  await repository.completeDataResidencyMigrationPhase({
    workspaceId: leased.migration.workspaceId,
    migrationId: leased.migration.id,
    workerId,
    expectedStatus,
    nextStatus: next,
    completedAt: completedAt.toISOString(),
    historyId: opaqueId('drhist'),
    auditEventId: opaqueId('tenevt'),
    ...(failureCode ? { failureCode } : {}),
    ...(evidence ? { evidence } : {}),
  });
}

function nextStatus(status: DataResidencyMigrationStatus): DataResidencyMigrationStatus {
  if (status === 'copying') return 'verifying';
  if (status === 'verifying') return 'cutover-ready';
  if (status === 'cutover-ready') return 'completed';
  throw new Error('Data residency migration status has no automatic successor');
}

export function dataResidencyRetryDelayMs(migrationId: string, attemptCount: number): number {
  const base = Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attemptCount - 1));
  const jitter = createHash('sha256')
    .update(`lodariq-residency:${migrationId}:${attemptCount}`)
    .digest()
    .readUInt16BE(0);
  return base + Math.floor((base * 0.2 * jitter) / 65_535);
}

function opaqueId(prefix: 'drproof' | 'drhist' | 'tenevt'): string {
  return `${prefix}_${randomUUID()}`;
}
