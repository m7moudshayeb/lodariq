import { createHmac, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPaddleBillingProvider,
  createPaddleBillingProviderFromEnvironment,
} from '../../../../apps/api/src/commercial-billing-paddle';
import { BillingProviderVerificationError } from '../../../../apps/api/src/commercial-billing';
import {
  createBigQueryWarehouseProvider,
  createAnalyticsWarehouseProvidersFromEnvironment,
} from '../../../../apps/api/src/analytics-warehouse-bigquery';
import { createNeonR2DataResidencyProvider } from '../../../../apps/api/src/data-residency-neon-r2';

const WEBHOOK_SECRET = 'pdl_ntfset_01example';
const NOW = new Date('2026-08-24T10:00:00.000Z');

function paddleProvider(fetchImplementation: typeof fetch) {
  return createPaddleBillingProvider({
    apiKey: 'pdl_live_key',
    webhookSecret: WEBHOOK_SECRET,
    planPriceIds: { growth: 'pri_growth' },
    usageRates: {
      'engaged-users': { productId: 'pro_users', unitAmountMinor: 25, currencyCode: 'USD' },
    },
    fetchImplementation,
    clock: () => NOW,
  });
}

function signedWebhook(body: unknown, atSeconds = Math.floor(NOW.getTime() / 1_000)) {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  const digest = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${atSeconds}:`)
    .update(raw)
    .digest('hex');
  return {
    provider: 'paddle',
    headers: { 'paddle-signature': `ts=${atSeconds};h1=${digest}` },
    payload: body,
    rawPayload: new Uint8Array(raw),
    receivedAt: NOW.toISOString(),
  };
}

const SUBSCRIPTION_EVENT = {
  event_id: 'evt_01',
  event_type: 'subscription.updated',
  occurred_at: '2026-08-24T09:59:00.000Z',
  data: {
    id: 'sub_01',
    customer_id: 'ctm_01',
    status: 'active',
    current_billing_period: {
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-09-01T00:00:00.000Z',
    },
    custom_data: { lodariq_workspace_id: 'wk_1', lodariq_plan_id: 'growth' },
  },
};

describe('Paddle billing adapter', () => {
  it('accepts a correctly signed event and carries the workspace through custom data', async () => {
    const provider = paddleProvider(vi.fn() as unknown as typeof fetch);
    const event = await provider.verifyWebhook(signedWebhook(SUBSCRIPTION_EVENT));

    expect(event.workspaceId).toBe('wk_1');
    expect(event.provider).toBe('paddle');
    expect(event.providerEventId).toBe('evt_01');
    expect(event.providerCustomerId).toBe('ctm_01');
    expect(event.providerSubscriptionId).toBe('sub_01');
    expect(event.subscription).toEqual({
      planId: 'growth',
      status: 'active',
      currentPeriodStart: '2026-08-01T00:00:00.000Z',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    });
    expect(event.payloadHash).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it('rejects a tampered body, a wrong secret, and a stale timestamp', async () => {
    const provider = paddleProvider(vi.fn() as unknown as typeof fetch);

    const tampered = signedWebhook(SUBSCRIPTION_EVENT);
    tampered.rawPayload = new Uint8Array(Buffer.from('{"event_id":"evt_forged"}', 'utf8'));
    await expect(provider.verifyWebhook(tampered)).rejects.toBeInstanceOf(
      BillingProviderVerificationError,
    );

    const wrongSecret = signedWebhook(SUBSCRIPTION_EVENT);
    wrongSecret.headers['paddle-signature'] = `ts=${Math.floor(
      NOW.getTime() / 1_000,
    )};h1=${'0'.repeat(64)}`;
    await expect(provider.verifyWebhook(wrongSecret)).rejects.toBeInstanceOf(
      BillingProviderVerificationError,
    );

    const stale = signedWebhook(SUBSCRIPTION_EVENT, Math.floor(NOW.getTime() / 1_000) - 600);
    await expect(provider.verifyWebhook(stale)).rejects.toBeInstanceOf(
      BillingProviderVerificationError,
    );
  });

  it('refuses an event with no workspace, so an unrelated customer cannot be applied', async () => {
    const provider = paddleProvider(vi.fn() as unknown as typeof fetch);
    const orphan = { ...SUBSCRIPTION_EVENT, data: { ...SUBSCRIPTION_EVENT.data, custom_data: {} } };
    await expect(provider.verifyWebhook(signedWebhook(orphan))).rejects.toBeInstanceOf(
      BillingProviderVerificationError,
    );
  });

  it('does not charge twice when a batch is replayed after a lost response', async () => {
    const marker = { lodariq_usage_marker: expect.any(String) as unknown as string };
    void marker;
    let charges = 0;
    const chargedTransactions: unknown[] = [];
    const fetchImplementation = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/transactions?')) {
        return new Response(JSON.stringify({ data: chargedTransactions }), { status: 200 });
      }
      if (href.includes('/charge')) {
        charges += 1;
        const body = JSON.parse(String(init?.body)) as {
          items: { price: { custom_data: { lodariq_usage_marker: string } } }[];
        };
        chargedTransactions.push({
          id: 'txn_01',
          items: [{ price: { custom_data: body.items[0]?.price.custom_data } }],
        });
        return new Response(JSON.stringify({ data: {} }), { status: 201 });
      }
      throw new Error(`unexpected call ${href}`);
    });

    const provider = paddleProvider(fetchImplementation as unknown as typeof fetch);
    const submission = {
      batch: {
        id: 'bmb_1',
        meterVersion: '2026-08-22.1' as const,
        periodStart: '2026-07-01T00:00:00.000Z',
        periodEnd: '2026-08-01T00:00:00.000Z',
        items: [{ metric: 'engaged-users' as const, quantity: 40 }],
        status: 'submitting' as const,
        attemptCount: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
        workspaceId: 'wk_1',
        provider: 'paddle',
        itemsHash: 'sha256-x',
        nextAttemptAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      idempotencyKey: 'bmb_1:2026-08-22.1',
      signal: new AbortController().signal,
      providerCustomerId: 'ctm_01',
      providerSubscriptionId: 'sub_01',
    };

    const first = await provider.submitUsage(submission);
    const second = await provider.submitUsage(submission);

    expect(charges).toBe(1);
    expect(second.submissionId).toBe('txn_01');
    expect(first.reportedItems).toEqual([{ metric: 'engaged-users', quantity: 40 }]);
  });

  it('stays unbuilt until the provider is selected and both credentials are present', () => {
    expect(createPaddleBillingProviderFromEnvironment({})).toBeUndefined();
    expect(
      createPaddleBillingProviderFromEnvironment({
        LODARIQ_BILLING_PROVIDER: 'paddle',
        LODARIQ_PADDLE_API_KEY: 'pdl_live_key',
      }),
    ).toBeUndefined();
    expect(
      createPaddleBillingProviderFromEnvironment({
        LODARIQ_BILLING_PROVIDER: 'paddle',
        LODARIQ_PADDLE_API_KEY: 'pdl_live_key',
        LODARIQ_PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      }),
    ).toBeDefined();
  });
});

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = {
  clientEmail: 'warehouse@example.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  projectId: 'lodariq-analytics',
};

const WAREHOUSE_EVENT = {
  schemaVersion: 1 as const,
  eventId: 'evt_1',
  workspaceId: 'wk_1',
  environmentId: 'env_1',
  documentId: 'doc_1',
  publicationId: 'pub_1',
  contentHash: 'sha256-abc',
  pointerGeneration: 3,
  name: 'experience_shown',
  sdkVersion: '1.0.0',
  timestamp: '2026-08-24T09:00:00.000Z',
  ingestedAt: '2026-08-24T09:00:01.000Z',
};

describe('BigQuery warehouse adapter', () => {
  it('inserts the batch with a per-event insertId derived from the idempotency key', async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImplementation = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }), {
          status: 200,
        });
      }
      requests.push({ url: href, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const provider = createBigQueryWarehouseProvider({
      serviceAccount: SERVICE_ACCOUNT,
      tables: { 'ref-eu': { projectId: 'p', datasetId: 'd', tableId: 't' } },
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      clock: () => NOW,
    });

    const result = await provider.deliver({
      destination: { id: 'whdest_1' } as never,
      credentialReference: 'ref-eu',
      idempotencyKey: 'sync_1',
      batch: {
        contractVersion: '2026-08-22.1',
        destinationId: 'whdest_1',
        workspaceId: 'wk_1',
        environmentId: 'env_1',
        events: [WAREHOUSE_EVENT],
        batchHash: 'sha256-batch',
      },
    });

    expect(result.acceptedEventCount).toBe(1);
    expect(result.batchHash).toBe('sha256-batch');
    expect(requests[0]?.url).toContain('/projects/p/datasets/d/tables/t/insertAll');
    const rows = requests[0]?.body.rows as { insertId: string; json: Record<string, unknown> }[];
    expect(rows[0]?.insertId).toBe('sync_1:evt_1');
    expect(rows[0]?.json.workspace_id).toBe('wk_1');
    // A malformed row must fail the batch rather than vanish.
    expect(requests[0]?.body.skipInvalidRows).toBe(false);
  });

  it('fails the batch when BigQuery reports row errors', async () => {
    const fetchImplementation = vi.fn(async (url: string | URL) =>
      String(url).includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 })
        : new Response(JSON.stringify({ insertErrors: [{ index: 0 }] }), { status: 200 }),
    );
    const provider = createBigQueryWarehouseProvider({
      serviceAccount: SERVICE_ACCOUNT,
      tables: { 'ref-eu': { projectId: 'p', datasetId: 'd', tableId: 't' } },
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      clock: () => NOW,
    });

    await expect(
      provider.deliver({
        destination: { id: 'whdest_1' } as never,
        credentialReference: 'ref-eu',
        idempotencyKey: 'sync_1',
        batch: {
          contractVersion: '2026-08-22.1',
          destinationId: 'whdest_1',
          workspaceId: 'wk_1',
          environmentId: 'env_1',
          events: [WAREHOUSE_EVENT],
          batchHash: 'sha256-batch',
        },
      }),
    ).rejects.toThrow(/bigquery_insert_rejected/u);
  });

  it('refuses a credential reference it was not granted', async () => {
    const provider = createBigQueryWarehouseProvider({
      serviceAccount: SERVICE_ACCOUNT,
      tables: { 'ref-eu': { projectId: 'p', datasetId: 'd', tableId: 't' } },
      fetchImplementation: (() => {
        throw new Error('must not be called');
      }) as unknown as typeof fetch,
    });

    await expect(
      provider.deliver({
        destination: { id: 'whdest_1' } as never,
        credentialReference: 'ref-somebody-else',
        idempotencyKey: 'sync_1',
        batch: {
          contractVersion: '2026-08-22.1',
          destinationId: 'whdest_1',
          workspaceId: 'wk_1',
          environmentId: 'env_1',
          events: [WAREHOUSE_EVENT],
          batchHash: 'sha256-batch',
        },
      }),
    ).rejects.toThrow(/bigquery_table_not_configured/u);
  });

  it('builds no provider without a service account and a mapped table', () => {
    expect(createAnalyticsWarehouseProvidersFromEnvironment({})).toEqual([]);
    expect(
      createAnalyticsWarehouseProvidersFromEnvironment({
        LODARIQ_BIGQUERY_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: SERVICE_ACCOUNT.clientEmail,
          private_key: SERVICE_ACCOUNT.privateKey,
          project_id: SERVICE_ACCOUNT.projectId,
        }),
      }),
    ).toEqual([]);
  });
});

describe('Neon + R2 residency adapter', () => {
  const migrationInput = (source: string, target: string) => ({
    migration: { workspaceId: 'wk_1', id: 'drm_1' } as never,
    sourceRouteKey: source,
    targetRouteKey: target,
    idempotencyKey: 'drm_1:copying',
  });

  it('keeps APAC unavailable until the guarantee is real', async () => {
    const provider = createNeonR2DataResidencyProvider({
      routes: {
        'primary-us': { connectionString: 'postgres://us' },
        'primary-apac': { connectionString: 'postgres://apac' },
      },
      connect: () => {
        throw new Error('must not connect');
      },
    });

    await expect(provider.copy(migrationInput('primary-us', 'primary-apac'))).rejects.toThrow(
      /residency_route_not_available_primary-apac/u,
    );
  });

  it('refuses a route it holds no credentials for', async () => {
    const provider = createNeonR2DataResidencyProvider({
      routes: { 'primary-us': { connectionString: 'postgres://us' } },
      connect: () => {
        throw new Error('must not connect');
      },
    });

    await expect(provider.copy(migrationInput('primary-us', 'primary-eu'))).rejects.toThrow(
      /residency_route_not_configured_primary-eu/u,
    );
  });

  it('returns evidence with no tenant values in it', async () => {
    const database = {
      execute: vi.fn(async () => ({ rows: [{ digest: 'abc', count: '0' }] })),
    };
    const provider = createNeonR2DataResidencyProvider({
      routes: {
        'primary-us': { connectionString: 'postgres://us' },
        'primary-eu': { connectionString: 'postgres://eu' },
      },
      connect: () => database as never,
    });

    const result = await provider.verify(migrationInput('primary-us', 'primary-eu'));

    expect(result.providerOperationId).toMatch(/^neon-r2:verify:[0-9a-f]{32}$/u);
    expect(result.sourceDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(result.targetDigest).toBe(result.sourceDigest);
    expect(JSON.stringify(result)).not.toContain('wk_1');
  });
});
