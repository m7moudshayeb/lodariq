import { randomUUID } from 'node:crypto';
import { BILLING_METER_LEASE_MS, type ControlPlaneRepository } from '@lodariq/database';
import type { CommercialBillingProvider } from './commercial-billing';

/**
 * Comfortably inside the lease. A provider call that outlives the lease is the
 * double-charge: a second pod claims the same batch and reports the same usage
 * again, and nothing downstream can tell the two apart without the idempotency
 * key this now sends.
 */
const BILLING_SUBMISSION_TIMEOUT_MS = Math.floor(BILLING_METER_LEASE_MS / 2);

export interface CommercialBillingWorker {
  start(): void;
  runOnce(): Promise<number>;
  stop(): Promise<void>;
}

export interface CommercialBillingWorkerOptions {
  repository: ControlPlaneRepository;
  provider: CommercialBillingProvider;
  clock?: () => Date;
  intervalMs?: number;
  workerId?: string;
  batchSize?: number;
}

export function createCommercialBillingWorker(
  options: CommercialBillingWorkerOptions,
): CommercialBillingWorker {
  const intervalMs = Math.max(1_000, options.intervalMs ?? 15_000);
  const workerId = options.workerId ?? `billing_worker_${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 5, 25));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true;
  let active: Promise<number> | null = null;

  const runOnce = async (): Promise<number> => {
    const now = (options.clock?.() ?? new Date()).toISOString();
    const batches = await options.repository.claimBillingMeterBatches({
      workerId,
      now,
      limit: batchSize,
    });
    for (const batch of batches) {
      if (batch.provider !== options.provider.id) {
        await options.repository.failBillingMeterBatch({
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          workerId,
          errorCode: 'provider_unavailable',
          failedAt: (options.clock?.() ?? new Date()).toISOString(),
        });
        continue;
      }
      /*
       * Usage bills against the provider's subscription. Without an account row
       * there is nothing to bill, and submitting would create a second customer.
       */
      const account = await options.repository.readBillingAccount(batch.workspaceId);
      if (!account || account.provider !== options.provider.id) {
        await options.repository.failBillingMeterBatch({
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          workerId,
          errorCode: 'billing_account_unavailable',
          failedAt: (options.clock?.() ?? new Date()).toISOString(),
        });
        continue;
      }
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), BILLING_SUBMISSION_TIMEOUT_MS);
      timeout.unref?.();
      try {
        const result = await options.provider.submitUsage({
          batch,
          // Stable across retries of this batch at this meter version, so a
          // replay is recognised by the provider rather than billed again.
          idempotencyKey: `${batch.id}:${batch.meterVersion}`,
          signal: abort.signal,
          providerCustomerId: account.providerCustomerId,
          ...(account.providerSubscriptionId
            ? { providerSubscriptionId: account.providerSubscriptionId }
            : {}),
        });
        await options.repository.completeBillingMeterBatch({
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          workerId,
          providerSubmissionId: result.submissionId,
          reportedItems: result.reportedItems,
          completedAt: (options.clock?.() ?? new Date()).toISOString(),
        });
      } catch (error) {
        await options.repository.failBillingMeterBatch({
          workspaceId: batch.workspaceId,
          batchId: batch.id,
          workerId,
          errorCode:
            error instanceof Error && error.name === 'AbortError'
              ? 'submission_timeout'
              : 'submission_failed',
          failedAt: (options.clock?.() ?? new Date()).toISOString(),
        });
      } finally {
        clearTimeout(timeout);
      }
    }
    return batches.length;
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
