import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAnalyticsWarehouseWorker,
  createApiApp,
  createHeaderAuthProvider,
  type AnalyticsWarehouseProvider,
} from '@lodariq/api';
import { createInMemoryControlPlaneRepository } from '@lodariq/database';
import { COMMERCIAL_PLAN_VERSION } from '@lodariq/schema';

const WORKSPACE_ID = 'wk_warehouse_api';
const USER_ID = 'usr_warehouse_owner';
const NOW = '2026-08-22T14:00:00.000Z';
const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': USER_ID,
  'x-lodariq-role': 'owner',
};

describe('analytics warehouse synchronization', () => {
  const apps: ReturnType<typeof createApiApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('configures a versioned destination and advances a reconciled environment checkpoint', async () => {
    const repository = repositoryFixture();
    const provider = providerFixture();
    const app = createApiApp({
      repository,
      authProvider: createHeaderAuthProvider(),
      analyticsWarehouseWorker: null,
      // The route refuses a destination nothing will ever deliver to, so the
      // app has to know an executor exists even though the worker is driven
      // by hand below.
      analyticsWarehouseProviders: [provider],
    });
    apps.push(app);

    const created = await createDestination(app);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      schemaVersion: '2026-08-22.1',
      provider: 'test-warehouse',
      environmentId: 'env_production',
      checkpoint: null,
    });
    const destinationId = created.json<{ id: string }>().id;
    const worker = createAnalyticsWarehouseWorker({
      repository,
      providers: [provider],
      workerId: 'warehouse-worker-one',
      clock: await claimableClock(repository),
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(provider.deliver).toHaveBeenCalledOnce();
    const delivery = vi.mocked(provider.deliver).mock.calls[0]![0];
    expect(delivery.idempotencyKey).toMatch(new RegExp(`^${destinationId}:sha256-`, 'u'));
    expect(delivery.batch.events).toHaveLength(2);
    expect(delivery.batch.events.every((event) => event.environmentId === 'env_production')).toBe(
      true,
    );
    expect(JSON.stringify(delivery.batch)).not.toContain('engagementKey');
    expect(JSON.stringify(delivery.batch)).not.toContain('adaptiveVisitorKeyHash');

    const destinations = await app.inject({
      method: 'GET',
      url: '/v1/analytics/warehouse-destinations',
      headers: authHeaders,
    });
    expect(destinations.statusCode).toBe(200);
    expect(destinations.json()).toMatchObject({
      destinations: [{ id: destinationId, checkpoint: { eventId: 'aevt_prod_2' } }],
    });
    const runs = await app.inject({
      method: 'GET',
      url: `/v1/analytics/warehouse-sync-runs?destinationId=${destinationId}`,
      headers: authHeaders,
    });
    expect(runs.statusCode).toBe(200);
    expect(runs.json()).toMatchObject({
      runs: [{ status: 'succeeded', eventCount: 2, errorCode: null }],
    });
  });

  it('refuses a destination when no provider is configured to deliver to it', async () => {
    const repository = repositoryFixture();
    const app = createApiApp({
      repository,
      authProvider: createHeaderAuthProvider(),
      analyticsWarehouseWorker: null,
      // Deliberately none: the row would be created, marked pending, and never
      // synced by anything.
      analyticsWarehouseProviders: [],
    });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/analytics/warehouse-destinations',
      headers: { ...authHeaders, 'idempotency-key': 'warehouse-unconfigured-1' },
      payload: {
        name: 'Unconfigured destination',
        provider: 'test-warehouse',
        environmentId: 'env_production',
        credentialReference: 'secret/warehouse',
      },
    });
    expect(response.statusCode, response.body).toBe(503);
    expect(response.json()).toMatchObject({ error: 'warehouse_executor_unavailable' });
  });

  it('does not advance the checkpoint when provider count readback disagrees', async () => {
    const repository = repositoryFixture();
    const provider = providerFixture(1);
    const app = createApiApp({
      repository,
      authProvider: createHeaderAuthProvider(),
      analyticsWarehouseWorker: null,
      // The route refuses a destination nothing will ever deliver to, so the
      // app has to know an executor exists even though the worker is driven
      // by hand below.
      analyticsWarehouseProviders: [provider],
    });
    apps.push(app);
    const created = await createDestination(app);
    const destinationId = created.json<{ id: string }>().id;
    const worker = createAnalyticsWarehouseWorker({
      repository,
      providers: [provider],
      workerId: 'warehouse-worker-mismatch',
      clock: await claimableClock(repository),
    });

    await worker.runOnce();
    const [destination] = await repository.listAnalyticsWarehouseDestinations(WORKSPACE_ID);
    expect(destination).toMatchObject({
      id: destinationId,
      checkpoint: null,
      lastErrorCode: 'reconciliation_mismatch',
    });
    const runs = await repository.listAnalyticsWarehouseSyncRuns(WORKSPACE_ID, destinationId);
    expect(runs[0]).toMatchObject({ status: 'failed', errorCode: 'reconciliation_mismatch' });
  });
});

/**
 * The create route stamps `nextAttemptAt` from the wall clock, so any worker
 * clock fixed in the past stops claiming the moment real time passes it. Derive
 * it from the record the route actually wrote.
 */
async function claimableClock(
  repository: ReturnType<typeof repositoryFixture>,
): Promise<() => Date> {
  const [destination] = await repository.listAnalyticsWarehouseDestinations(WORKSPACE_ID);
  const claimAt = new Date(Date.parse(destination!.nextAttemptAt) + 1_000);
  return () => claimAt;
}

async function createDestination(app: ReturnType<typeof createApiApp>) {
  return app.inject({
    method: 'POST',
    url: '/v1/analytics/warehouse-destinations',
    headers: { ...authHeaders, 'idempotency-key': 'warehouse:production:one' },
    payload: {
      name: 'Production analytics',
      provider: 'test-warehouse',
      environmentId: 'env_production',
      credentialReference: 'vault://lodariq/warehouse/production',
    },
  });
}

function providerFixture(reportedCount?: number): AnalyticsWarehouseProvider {
  return {
    id: 'test-warehouse',
    deliver: vi.fn(async ({ batch }) => ({
      providerBatchId: 'provider-batch-one',
      acceptedEventCount: reportedCount ?? batch.events.length,
      batchHash: batch.batchHash,
    })),
  };
}

function repositoryFixture() {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: USER_ID,
        legacyIdentityId: null,
        email: 'warehouse-owner@example.com',
        name: 'Warehouse Owner',
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Warehouse', createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: USER_ID, role: 'owner', createdAt: NOW },
    ],
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    environments: [
      environment('env_staging', 'staging'),
      environment('env_production', 'production'),
    ],
    analyticsEvents: [
      analyticsEvent('aevt_prod_1', 'env_production', '2026-08-22T13:00:00.000Z'),
      analyticsEvent('aevt_prod_2', 'env_production', '2026-08-22T13:01:00.000Z'),
      analyticsEvent('aevt_stage_1', 'env_staging', '2026-08-22T13:02:00.000Z'),
    ],
  });
}

function environment(id: string, kind: 'staging' | 'production') {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    kind,
    name: kind === 'staging' ? 'Staging' : 'Production',
    originAllowlist: [`https://${kind}.example.com`],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function analyticsEvent(id: string, environmentId: string, ingestedAt: string) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    environmentId,
    documentId: 'doc_warehouse',
    publicationId: 'pub_warehouse',
    contentHash: `sha256-${'a'.repeat(64)}`,
    pointerGeneration: 1,
    name: 'experience_shown',
    sdkVersion: '1.0.0',
    correlationId: `correlation_${id}`,
    engagementKey: `eng_${'1'.repeat(64)}`,
    timestamp: ingestedAt,
    ingestedAt,
  };
}
