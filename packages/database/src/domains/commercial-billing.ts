import { createHash } from 'node:crypto';
import type { CommercialPlanId } from '@lodariq/schema';
import {
  BILLING_METER_VERSION,
  type BillingInvoice,
  type BillingMeterBatch,
  type BillingMeterItem,
  type BillingOverview,
  type BillingSubscriptionStatus,
} from '@lodariq/schema/commercial-billing';

export const BILLING_METER_MAX_ATTEMPTS = 5;
export const BILLING_METER_LEASE_MS = 2 * 60 * 1_000;

/**
 * Backoff for a failed meter submission, spread across workspaces.
 *
 * Without the jitter every workspace retried on the same minute boundary, so a
 * provider outage was followed by the whole tenant base arriving together — the
 * webhook, warehouse and residency retries all avoid that, and this one did
 * not. Derived from the batch id rather than drawn randomly so a replay of the
 * same batch schedules identically and a test can assert it.
 */
export function billingMeterRetryDelayMs(batchId: string, attemptCount: number): number {
  const base = Math.min(60 * 60 * 1_000, 2 ** Math.max(0, attemptCount) * 60_000);
  const seed = createHash('sha256')
    .update(`lodariq-billing-jitter:${batchId}:${attemptCount}`)
    .digest()
    .readUInt16BE(0);
  // +/-20%, so two workspaces failing at the same instant come back apart.
  const spread = base * 0.4 * (seed / 0xff_ff) - base * 0.2;
  return Math.max(1_000, Math.round(base + spread));
}

export interface BillingAccountRecord {
  workspaceId: string;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId?: string;
  syncedThrough: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingProviderEventRecord {
  id: string;
  workspaceId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payloadHash: string;
  providerCreatedAt: string;
  processedAt: string;
}

export interface BillingInvoiceRecord extends BillingInvoice {
  workspaceId: string;
  provider: string;
  providerInvoiceId: string;
  providerUpdatedAt: string;
}

export interface BillingMeterBatchRecord extends BillingMeterBatch {
  workspaceId: string;
  provider: string;
  itemsHash: string;
  nextAttemptAt: string;
  leaseWorkerId?: string;
  leaseExpiresAt?: string;
  updatedAt: string;
}

export interface NormalizedBillingProviderEvent {
  workspaceId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  /** SHA-256 of the exact provider payload, calculated only after signature verification. */
  payloadHash: string;
  providerCreatedAt: string;
  providerCustomerId: string;
  providerSubscriptionId?: string;
  subscription?: {
    planId: CommercialPlanId;
    status: BillingSubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
  };
  invoice?: Omit<BillingInvoiceRecord, 'workspaceId' | 'provider'>;
  /** A period the provider has closed and is ready to receive as one immutable usage batch. */
  closedMeteringPeriod?: { start: string; end: string };
  processedAt: string;
}

export interface IngestBillingProviderEventResult {
  status: 'applied' | 'duplicate' | 'stale';
  meteringBatch?: BillingMeterBatchRecord;
}

export interface CreateBillingMeterBatchInput {
  workspaceId: string;
  provider: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface ClaimBillingMeterBatchesInput {
  workerId: string;
  now: string;
  limit: number;
}

export interface CompleteBillingMeterBatchInput {
  workspaceId: string;
  batchId: string;
  workerId: string;
  providerSubmissionId: string;
  reportedItems: readonly BillingMeterItem[];
  completedAt: string;
}

export interface FailBillingMeterBatchInput {
  workspaceId: string;
  batchId: string;
  workerId: string;
  errorCode: string;
  failedAt: string;
}

export interface CommercialBillingRepository {
  readWorkspaceBillingOverview(workspaceId: string): Promise<BillingOverview>;
  /**
   * Provider-side ids for a workspace. Kept off `BillingOverview`, which is a
   * browser response — a portal session needs the customer id, the dashboard
   * never does.
   */
  readBillingAccount(workspaceId: string): Promise<BillingAccountRecord | null>;
  ingestBillingProviderEvent(
    input: NormalizedBillingProviderEvent,
  ): Promise<IngestBillingProviderEventResult>;
  createBillingMeterBatch(input: CreateBillingMeterBatchInput): Promise<BillingMeterBatchRecord>;
  claimBillingMeterBatches(
    input: ClaimBillingMeterBatchesInput,
  ): Promise<BillingMeterBatchRecord[]>;
  completeBillingMeterBatch(
    input: CompleteBillingMeterBatchInput,
  ): Promise<BillingMeterBatchRecord | null>;
  failBillingMeterBatch(input: FailBillingMeterBatchInput): Promise<BillingMeterBatchRecord | null>;
  /**
   * Returns an exhausted batch to the queue.
   *
   * A single reconciliation mismatch sets `attemptCount` to the maximum, and
   * the claim query requires it to be below the maximum — so one bad provider
   * echo removed the batch from the queue permanently, with no alert and no way
   * back. This is the way back.
   */
  resetBillingMeterBatch(input: {
    workspaceId: string;
    batchId: string;
    actorUserId: string;
    resetAt: string;
  }): Promise<BillingMeterBatchRecord | null>;
}

export class BillingProviderEventConflictError extends Error {
  readonly code = 'billing_provider_event_conflict';

  constructor() {
    super('A provider event id was reused with a different payload');
    this.name = 'BillingProviderEventConflictError';
  }
}

export function assertNormalizedBillingProviderEvent(input: NormalizedBillingProviderEvent): void {
  if (
    !input.workspaceId.trim() ||
    !boundedProviderValue(input.provider) ||
    !boundedProviderValue(input.providerEventId, 256) ||
    !boundedProviderValue(input.eventType, 160) ||
    !/^sha256-[0-9a-f]{64}$/u.test(input.payloadHash) ||
    !boundedProviderValue(input.providerCustomerId, 256)
  ) {
    throw new Error('Normalized billing provider event is invalid');
  }
  validDate(input.providerCreatedAt);
  validDate(input.processedAt);
  if (input.providerSubscriptionId && !boundedProviderValue(input.providerSubscriptionId, 256)) {
    throw new Error('Normalized billing provider event is invalid');
  }
  if (input.subscription) {
    assertPeriod(input.subscription.currentPeriodStart, input.subscription.currentPeriodEnd);
  }
  if (input.closedMeteringPeriod) {
    assertPeriod(input.closedMeteringPeriod.start, input.closedMeteringPeriod.end);
  }
}

export function assertBillingPeriod(start: string, end: string): void {
  assertPeriod(start, end);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration > 93 * 24 * 60 * 60 * 1_000) {
    throw new Error('Billing metering period is too large');
  }
}

export function normalizedBillingMeterItems(
  items: readonly BillingMeterItem[],
): BillingMeterItem[] {
  const totals = new Map<BillingMeterItem['metric'], number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) {
      throw new Error('Billing meter quantity is invalid');
    }
    totals.set(item.metric, (totals.get(item.metric) ?? 0) + item.quantity);
  }
  return [...totals.entries()]
    .map(([metric, quantity]) => ({ metric, quantity }))
    .sort((left, right) => left.metric.localeCompare(right.metric));
}

export function billingMeterItemsHash(items: readonly BillingMeterItem[]): string {
  return `sha256-${createHash('sha256')
    .update(JSON.stringify(normalizedBillingMeterItems(items)))
    .digest('hex')}`;
}

export function billingMeterItemsMatch(
  expected: readonly BillingMeterItem[],
  actual: readonly BillingMeterItem[],
): boolean {
  return billingMeterItemsHash(expected) === billingMeterItemsHash(actual);
}

export function toPublicBillingMeterBatch(record: BillingMeterBatchRecord): BillingMeterBatch {
  return {
    id: record.id,
    meterVersion: BILLING_METER_VERSION,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    items: structuredClone(record.items),
    status: record.status,
    attemptCount: record.attemptCount,
    ...(record.providerSubmissionId ? { providerSubmissionId: record.providerSubmissionId } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    createdAt: record.createdAt,
    ...(record.reconciledAt ? { reconciledAt: record.reconciledAt } : {}),
  };
}

function boundedProviderValue(value: string, maximum = 80): boolean {
  const length = value.trim().length;
  return length > 0 && length <= maximum;
}

function assertPeriod(start: string, end: string): void {
  const startTime = validDate(start);
  const endTime = validDate(end);
  if (endTime <= startTime) throw new Error('Billing period end must follow its start');
}

function validDate(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error('A valid billing timestamp is required');
  return timestamp;
}
