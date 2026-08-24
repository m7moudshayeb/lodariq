import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiApp,
  createCommercialBillingWorker,
  createHeaderAuthProvider,
  type CommercialBillingProvider,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type NormalizedBillingProviderEvent,
} from '@lodariq/database';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';

const WORKSPACE_ID = 'wk_billing_api';
const USER_ID = 'usr_billing_owner';
const NOW = '2026-09-01T00:01:00.000Z';
const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': USER_ID,
  'x-lodariq-role': 'owner',
};

describe('commercial billing API', () => {
  const apps: ReturnType<typeof createApiApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('keeps every billing URI version-first and completes provider lifecycle end to end', async () => {
    const repository = createRepository();
    await repository.recordWorkspaceUsage({
      workspaceId: WORKSPACE_ID,
      metric: 'engaged-users',
      quantity: 9,
      dedupeKey: 'august-engagement',
      occurredAt: '2026-08-20T00:00:00.000Z',
    });
    const provider = fakeProvider();
    const app = createApiApp({
      repository,
      authProvider: createHeaderAuthProvider(),
      billingProvider: provider,
      commercialBillingWorker: null,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    apps.push(app);

    const initial = await app.inject({
      method: 'GET',
      url: '/v1/billing/overview',
      headers: authHeaders,
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      subscription: { planId: 'free', revision: 1, managedByProvider: false },
    });

    const checkout = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout-sessions',
      headers: authHeaders,
      payload: {
        planId: 'growth',
        expectedSubscriptionRevision: 1,
        returnUrl: 'https://app.lodariq.io/#billing',
      },
    });
    expect(checkout.statusCode).toBe(201);
    expect(checkout.json()).toMatchObject({ url: 'https://billing.example.test/checkout' });

    const payload = providerEvent();
    /*
     * Pretty-printed on the wire. The parsed object is identical either way, so
     * an adapter that re-serializes computes a digest over compact JSON and
     * never matches — which is exactly the failure H7 describes. Only the raw
     * bytes verify.
     */
    const signedBody = JSON.stringify(payload, null, 2);
    const jsonHeaders = {
      'content-type': 'application/json',
      'x-test-billing-signature': rawSignature(Buffer.from(signedBody, 'utf8')),
    };
    expect(rawSignature(Buffer.from(signedBody, 'utf8'))).not.toBe(signature(payload));
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/billing/provider-events/test-billing',
      headers: jsonHeaders,
      payload: signedBody,
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toEqual({ accepted: true, duplicate: false });
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/billing/provider-events/test-billing',
      headers: jsonHeaders,
      payload: signedBody,
    });
    expect(replay.json()).toEqual({ accepted: true, duplicate: true });

    const worker = createCommercialBillingWorker({
      repository,
      provider,
      workerId: 'billing-worker-api',
      clock: () => new Date(NOW),
    });
    await expect(worker.runOnce()).resolves.toBe(1);
    expect(provider.submitUsage).toHaveBeenCalledOnce();
    // Replay-stable, and abortable before the lease it runs under expires.
    const submission = provider.submitUsage.mock.calls[0]![0];
    expect(submission.idempotencyKey).toBe(`${submission.batch.id}:${submission.batch.meterVersion}`);
    expect(submission.signal.aborted).toBe(false);

    const overview = await app.inject({
      method: 'GET',
      url: '/v1/billing/overview',
      headers: authHeaders,
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      subscription: { planId: 'growth', revision: 2, managedByProvider: true },
      invoices: [{ id: 'binv_august', status: 'paid' }],
      metering: [
        {
          status: 'reconciled',
          items: expect.arrayContaining([{ metric: 'engaged-users', quantity: 9 }]),
        },
      ],
    });
  });

  it('fails closed for non-administrators, stale checkout revisions, and unverified events', async () => {
    const app = createApiApp({
      repository: createRepository(),
      authProvider: createHeaderAuthProvider(),
      billingProvider: fakeProvider(),
      commercialBillingWorker: null,
    });
    apps.push(app);
    const viewer = await app.inject({
      method: 'GET',
      url: '/v1/billing/overview',
      headers: { ...authHeaders, 'x-lodariq-role': 'viewer' },
    });
    expect(viewer.statusCode).toBe(403);

    const conflict = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout-sessions',
      headers: authHeaders,
      payload: {
        planId: 'growth',
        expectedSubscriptionRevision: 99,
        returnUrl: 'https://app.lodariq.io/#billing',
      },
    });
    expect(conflict.statusCode).toBe(409);

    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/billing/provider-events/test-billing',
      headers: { 'x-test-billing-signature': 'invalid' },
      payload: providerEvent(),
    });
    expect(rejected.statusCode).toBe(400);
  });

  it('offers a way back for a meter batch that reconciliation retired', async () => {
    const app = createApiApp({
      repository: createRepository(),
      authProvider: createHeaderAuthProvider(),
      billingProvider: fakeProvider(),
      commercialBillingWorker: null,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    apps.push(app);
    /*
     * A single reconciliation mismatch sets the batch's attempt count to the
     * maximum and the claim query requires it to be below the maximum, so the
     * batch left the queue permanently with no alert and nothing an operator
     * could do. There was no route at all; this asserts there is one, and that
     * it refuses an id it cannot reset rather than reporting success.
     */
    const response = await app.inject({
      method: 'POST',
      url: '/v1/billing/meter-batches/bmb_missing/resets',
      headers: authHeaders,
    });
    expect(response.statusCode, response.body).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found' });
  });
});

function createRepository() {
  return createInMemoryControlPlaneRepository({
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'free',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  });
}

function fakeProvider(): CommercialBillingProvider & {
  submitUsage: ReturnType<typeof vi.fn<CommercialBillingProvider['submitUsage']>>;
} {
  return {
    id: 'test-billing',
    async verifyWebhook(input) {
      /*
       * Signed over the bytes, the way a real provider does it. Re-serializing
       * `payload` would produce a different string and a different digest, so
       * this is what proves the raw body reached the adapter at all.
       */
      if (input.headers['x-test-billing-signature'] !== rawSignature(input.rawPayload)) {
        throw new Error('invalid signature');
      }
      return {
        ...(input.payload as NormalizedBillingProviderEvent),
        payloadHash: signature(input.payload),
      };
    },
    async createCheckoutSession() {
      return {
        url: 'https://billing.example.test/checkout',
        expiresAt: '2026-09-01T00:31:00.000Z',
      };
    },
    async createPortalSession() {
      return {
        url: 'https://billing.example.test/portal',
        expiresAt: '2026-09-01T00:31:00.000Z',
      };
    },
    submitUsage: vi.fn(async ({ batch }) => ({
      submissionId: `submission_${batch.id}`,
      reportedItems: batch.items,
    })),
  };
}

function providerEvent(): NormalizedBillingProviderEvent {
  const normalized = {
    workspaceId: WORKSPACE_ID,
    provider: 'test-billing',
    providerEventId: 'evt_api_september',
    eventType: 'subscription.period_opened',
    providerCreatedAt: '2026-09-01T00:00:30.000Z',
    providerCustomerId: 'customer_api',
    providerSubscriptionId: 'subscription_api',
    subscription: {
      planId: 'growth' as const,
      status: 'active' as const,
      currentPeriodStart: '2026-09-01T00:00:00.000Z',
      currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    },
    invoice: {
      id: 'binv_august',
      providerInvoiceId: 'provider_invoice_august',
      status: 'paid' as const,
      currency: 'usd',
      amountDueMinor: 8_000,
      amountPaidMinor: 8_000,
      issuedAt: '2026-08-01T00:00:00.000Z',
      paidAt: '2026-08-01T00:05:00.000Z',
      providerUpdatedAt: '2026-09-01T00:00:30.000Z',
    },
    closedMeteringPeriod: {
      start: '2026-08-01T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
    },
    processedAt: NOW,
  };
  return { ...normalized, payloadHash: `sha256-${'0'.repeat(64)}` };
}

function signature(value: unknown): string {
  return `sha256-${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function rawSignature(raw: Uint8Array): string {
  return `sha256-${createHash('sha256').update(raw).digest('hex')}`;
}
