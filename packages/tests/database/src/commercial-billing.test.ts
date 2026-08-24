import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';
import {
  BILLING_CONTRACT_VERSION,
  BILLING_METER_VERSION,
} from '@lodariq/schema/commercial-billing';
import {
  BillingProviderEventConflictError,
  createInMemoryControlPlaneRepository,
  type NormalizedBillingProviderEvent,
  type WorkspaceSubscriptionRecord,
} from '@lodariq/database';

const WORKSPACE_ID = 'wk_billing_lifecycle';
const OTHER_WORKSPACE_ID = 'wk_billing_other_tenant';
const PERIOD_START = '2026-08-01T00:00:00.000Z';
const PERIOD_END = '2026-09-01T00:00:00.000Z';
const PROCESSED_AT = '2026-09-01T00:01:00.000Z';

describe('provider-neutral commercial billing lifecycle', () => {
  it('applies signed normalized provider facts idempotently without regressing stale state', async () => {
    const repository = createRepository();
    const event = billingEvent();

    await expect(repository.ingestBillingProviderEvent(event)).resolves.toMatchObject({
      status: 'applied',
      meteringBatch: {
        meterVersion: BILLING_METER_VERSION,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
      },
    });
    await expect(repository.ingestBillingProviderEvent(event)).resolves.toEqual({
      status: 'duplicate',
    });
    await expect(
      repository.ingestBillingProviderEvent({ ...event, payloadHash: `sha256-${'b'.repeat(64)}` }),
    ).rejects.toBeInstanceOf(BillingProviderEventConflictError);

    const stale = billingEvent({
      providerEventId: 'evt_stale_subscription',
      payloadHash: `sha256-${'c'.repeat(64)}`,
      providerCreatedAt: '2026-08-31T23:55:00.000Z',
      subscription: {
        planId: 'free',
        status: 'canceled',
        currentPeriodStart: PERIOD_START,
        currentPeriodEnd: PERIOD_END,
      },
      closedMeteringPeriod: undefined,
      invoice: undefined,
    });
    await expect(repository.ingestBillingProviderEvent(stale)).resolves.toEqual({
      status: 'stale',
    });

    await expect(repository.readWorkspaceBillingOverview(WORKSPACE_ID)).resolves.toMatchObject({
      contractVersion: BILLING_CONTRACT_VERSION,
      subscription: {
        workspaceId: WORKSPACE_ID,
        planId: 'growth',
        status: 'active',
        revision: 2,
        managedByProvider: true,
      },
      invoices: [
        {
          id: 'binv_august',
          status: 'paid',
          currency: 'usd',
          amountDueMinor: 12_500,
          amountPaidMinor: 12_500,
        },
      ],
    });
  });

  it('refuses a provider event id already claimed by another workspace', async () => {
    const repository = createInMemoryControlPlaneRepository({
      workspaceSubscriptions: [subscription(), subscription(OTHER_WORKSPACE_ID)],
    });
    await expect(repository.ingestBillingProviderEvent(billingEvent())).resolves.toMatchObject({
      status: 'applied',
    });
    /*
     * The provider event id is unique across every tenant, so a second
     * workspace replaying the same id is a collision, not a duplicate. In
     * Postgres the workspace's own dedupe select cannot see the first row at
     * all — it is RLS-scoped — and the refusal comes from the global unique
     * index on insert.
     */
    await expect(
      repository.ingestBillingProviderEvent(billingEvent({ workspaceId: OTHER_WORKSPACE_ID })),
    ).rejects.toBeInstanceOf(BillingProviderEventConflictError);
  });

  it('aggregates immutable usage, leases one submission, and reconciles provider quantities', async () => {
    const repository = createRepository();
    await repository.recordWorkspaceUsage({
      workspaceId: WORKSPACE_ID,
      metric: 'engaged-users',
      quantity: 17,
      dedupeKey: 'august-engaged-users',
      occurredAt: '2026-08-20T08:00:00.000Z',
    });
    await repository.debitAiCredits({
      workspaceId: WORKSPACE_ID,
      operationId: `aiop_${'x'.repeat(24)}`,
      provider: 'test-ai',
      meterVersion: 'test-v1',
      usageUnit: 'tokens',
      inputUnits: 100,
      outputUnits: 20,
      providerCostMicros: 500,
      credits: 3,
      occurredAt: '2026-08-20T08:01:00.000Z',
    });
    const applied = await repository.ingestBillingProviderEvent(billingEvent());
    const batch = applied.meteringBatch;
    expect(batch?.items).toEqual([
      { metric: 'ai-credits', quantity: 3 },
      { metric: 'engaged-users', quantity: 17 },
    ]);

    const [claimed] = await repository.claimBillingMeterBatches({
      workerId: 'billing-worker-a',
      now: PROCESSED_AT,
      limit: 5,
    });
    expect(claimed).toMatchObject({ id: batch?.id, status: 'submitting', attemptCount: 1 });
    await expect(
      repository.claimBillingMeterBatches({
        workerId: 'billing-worker-b',
        now: PROCESSED_AT,
        limit: 5,
      }),
    ).resolves.toEqual([]);
    if (!claimed) throw new Error('Expected the billing meter batch to be claimed');
    const reconciled = await repository.completeBillingMeterBatch({
      workspaceId: WORKSPACE_ID,
      batchId: claimed.id,
      workerId: 'billing-worker-a',
      providerSubmissionId: 'meter_submission_august',
      reportedItems: claimed.items,
      completedAt: '2026-09-01T00:02:00.000Z',
    });
    expect(reconciled).toMatchObject({
      status: 'reconciled',
      providerSubmissionId: 'meter_submission_august',
      reconciledAt: '2026-09-01T00:02:00.000Z',
    });
    await expect(repository.readWorkspaceBillingOverview(WORKSPACE_ID)).resolves.toMatchObject({
      metering: [{ id: claimed.id, status: 'reconciled', items: claimed.items }],
    });
  });
});

function createRepository() {
  return createInMemoryControlPlaneRepository({
    workspaceSubscriptions: [subscription()],
  });
}

function subscription(workspaceId: string = WORKSPACE_ID): WorkspaceSubscriptionRecord {
  return {
    workspaceId,
    planId: 'free',
    planVersion: COMMERCIAL_PLAN_VERSION,
    status: 'active',
    entitlementOverrides: {},
    currentPeriodStart: PERIOD_START,
    currentPeriodEnd: PERIOD_END,
    revision: 1,
    createdAt: PERIOD_START,
    updatedAt: PERIOD_START,
  };
}

function billingEvent(
  overrides: Partial<NormalizedBillingProviderEvent> = {},
): NormalizedBillingProviderEvent {
  return {
    workspaceId: WORKSPACE_ID,
    provider: 'test-billing',
    providerEventId: 'evt_september_subscription',
    eventType: 'subscription.period_opened',
    payloadHash: `sha256-${'a'.repeat(64)}`,
    providerCreatedAt: '2026-09-01T00:00:30.000Z',
    providerCustomerId: 'customer_lodariq',
    providerSubscriptionId: 'subscription_lodariq',
    subscription: {
      planId: 'growth',
      status: 'active',
      currentPeriodStart: PERIOD_END,
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    },
    invoice: {
      id: 'binv_august',
      providerInvoiceId: 'provider_invoice_august',
      status: 'paid',
      currency: 'usd',
      amountDueMinor: 12_500,
      amountPaidMinor: 12_500,
      issuedAt: '2026-08-01T00:00:00.000Z',
      paidAt: '2026-08-01T00:05:00.000Z',
      hostedInvoiceUrl: 'https://billing.example.test/invoices/august',
      providerUpdatedAt: '2026-09-01T00:00:30.000Z',
    },
    closedMeteringPeriod: { start: PERIOD_START, end: PERIOD_END },
    processedAt: PROCESSED_AT,
    ...overrides,
  };
}
