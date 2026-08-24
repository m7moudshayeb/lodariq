import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@lodariq/compiler';
import {
  createDefaultControlPlaneEnvironments,
  createInMemoryControlPlaneRepository,
} from '@lodariq/database';
import type { GovernanceCapabilityProfile, WebhookEndpoint } from '@lodariq/schema';
import {
  createOutboundWebhookWorker,
  createWebhookSignature,
  deriveWebhookSigningSecret,
  retryDelayMs,
  verifyWebhookSignature,
} from '../../../../apps/api/src/outbound-webhooks';
import { createResendBrandDriftEmailNotifier } from '../../../../apps/api/src/brand-drift-email';
import {
  environmentReleaseCapabilityAllowed,
  workspaceGovernanceCapabilityAllowed,
} from '../../../../apps/api/src/routes/control-plane-access';

const WORKSPACE_ID = 'wk_platform_governance';
const NOW = '2026-08-22T10:00:00.000Z';
const SIGNING_KEY = 'test-webhook-signing-key-with-more-than-32-bytes';
/** The endpoint host resolves publicly. Injected so the suite needs no resolver. */
const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34' }];

describe('outbound webhook delivery', () => {
  it('sends a canonical signed envelope and acknowledges one idempotent delivery', async () => {
    const repository = repositoryFixture();
    const endpoint = await endpointFixture(repository);
    const event = eventFixture();
    await repository.enqueueWebhookEvent({
      event,
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
    );
    const worker = createOutboundWebhookWorker({
      repository,
      signingKey: SIGNING_KEY,
      fetchImplementation,
      lookupImplementation: PUBLIC_LOOKUP,
      clock: () => new Date(NOW),
      workerId: 'worker_governance',
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0]!;
    if (!init) throw new Error('Expected webhook request options');
    expect(url).toBe(endpoint.url);
    expect(init.redirect).toBe('manual');
    expect(init.body).toBe(canonicalJson(event));
    const headers = new Headers(init.headers);
    const secret = deriveWebhookSigningSecret(SIGNING_KEY, endpoint.id, 1);
    expect(
      verifyWebhookSignature(
        secret,
        headers.get('x-lodariq-signature')!,
        String(init.body),
        Date.parse(NOW) / 1_000,
      ),
    ).toBe(true);
    await expect(worker.runOnce()).resolves.toBe(0);
    await expect(
      repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner'),
    ).resolves.toMatchObject({
      status: 'ok',
      value: [{ status: 'succeeded', attempts: 1, lastResponseStatus: 204 }],
    });
  });


  it('refuses a delivery whose host now resolves into private space', async () => {
    const repository = repositoryFixture();
    await endpointFixture(repository);
    await repository.enqueueWebhookEvent({
      event: eventFixture(),
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 }));
    const worker = createOutboundWebhookWorker({
      repository,
      signingKey: SIGNING_KEY,
      fetchImplementation,
      // The endpoint was registered on a public address and re-pointed since.
      lookupImplementation: async () => [{ address: '169.254.169.254' }],
      clock: () => new Date(NOW),
      workerId: 'worker_rebind',
    });

    await worker.runOnce();
    expect(fetchImplementation).not.toHaveBeenCalled();
    const deliveries = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    expect(deliveries.status).toBe('ok');
    expect(deliveries.status === 'ok' && deliveries.value[0]?.lastErrorCode).toBe(
      'endpoint_forbidden',
    );
  });

  it('sweeps pending deliveries when their endpoint is switched off', async () => {
    const repository = repositoryFixture();
    const endpoint = await endpointFixture(repository);
    await repository.enqueueWebhookEvent({
      event: eventFixture(),
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    await repository.disableWebhookEndpoint({
      workspaceId: WORKSPACE_ID,
      endpointId: endpoint.id,
      actorUserId: 'usr_owner',
      occurredAt: NOW,
      auditEventId: opaque('tenevt', 'disable'),
    });
    const deliveries = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    // The sweep at disable time reaches rows that were still pending.
    expect(deliveries.status === 'ok' && deliveries.value[0]?.status).toBe('dead');
    expect(deliveries.status === 'ok' && deliveries.value[0]?.lastErrorCode).toBe(
      'endpoint_disabled',
    );
  });

  it('finishes a delivery that was in flight when its endpoint was switched off', async () => {
    const repository = repositoryFixture();
    const endpoint = await endpointFixture(repository);
    await repository.enqueueWebhookEvent({
      event: eventFixture(),
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    /*
     * The row the disable sweep cannot see. It only marks *pending* deliveries
     * dead, so one already `delivering` came back to pending afterwards, found
     * no enabled endpoint on every lease from then on, and was skipped without
     * ever advancing or dying — while still sorting first by `available_at`
     * and eating a slot in every batch.
     */
    const [leased] = await repository.leaseWebhookDeliveries(
      'worker_inflight',
      NOW,
      new Date(Date.parse(NOW) + 30_000).toISOString(),
      10,
    );
    if (!leased) throw new Error('expected a leased delivery');
    await repository.disableWebhookEndpoint({
      workspaceId: WORKSPACE_ID,
      endpointId: endpoint.id,
      actorUserId: 'usr_owner',
      occurredAt: NOW,
      auditEventId: opaque('tenevt', 'disable'),
    });
    await repository.failWebhookDelivery({
      workspaceId: WORKSPACE_ID,
      deliveryId: leased.delivery.id,
      leaseOwner: 'worker_inflight',
      failedAt: NOW,
      responseStatus: 500,
      errorCode: 'http_error',
      nextAvailableAt: NOW,
    });

    const relanded = await repository.leaseWebhookDeliveries(
      'worker_next',
      new Date(Date.parse(NOW) + 60_000).toISOString(),
      new Date(Date.parse(NOW) + 90_000).toISOString(),
      10,
    );
    expect(relanded).toEqual([]);
    const deliveries = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    expect(deliveries.status === 'ok' && deliveries.value[0]?.status).toBe('dead');
    expect(deliveries.status === 'ok' && deliveries.value[0]?.lastErrorCode).toBe(
      'endpoint_unavailable',
    );
  });

  it('sweeps finished deliveries past retention on its own tick', async () => {
    const repository = repositoryFixture();
    await endpointFixture(repository);
    await repository.enqueueWebhookEvent({
      event: eventFixture(),
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    const worker = createOutboundWebhookWorker({
      repository,
      signingKey: SIGNING_KEY,
      fetchImplementation: async () => new Response(null, { status: 204 }),
      lookupImplementation: PUBLIC_LOOKUP,
      clock: () => new Date(NOW),
      workerId: 'worker_retention',
    });
    await worker.runOnce();
    const delivered = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    expect(delivered.status === 'ok' && delivered.value).toHaveLength(1);

    // Same worker, a tick well past retention. Nothing reads a succeeded
    // delivery after the operator has looked at it, and nothing was deleting
    // any of these rows at all.
    const later = new Date(Date.parse(NOW) + 40 * 24 * 60 * 60 * 1_000);
    const sweeper = createOutboundWebhookWorker({
      repository,
      signingKey: SIGNING_KEY,
      fetchImplementation: async () => new Response(null, { status: 204 }),
      lookupImplementation: PUBLIC_LOOKUP,
      clock: () => later,
      workerId: 'worker_retention',
    });
    await sweeper.runOnce();
    const swept = await repository.listWebhookDeliveries(WORKSPACE_ID, 'usr_owner');
    expect(swept.status === 'ok' && swept.value).toEqual([]);
  });

  it('leases long enough for the batch it took', async () => {
    const repository = repositoryFixture();
    await endpointFixture(repository);
    const leases: string[] = [];
    const original = repository.leaseWebhookDeliveries.bind(repository);
    repository.leaseWebhookDeliveries = async (owner, now, expiresAt, size) => {
      leases.push(expiresAt);
      return original(owner, now, expiresAt, size);
    };
    await repository.enqueueWebhookEvent({
      event: eventFixture(),
      deliveryIdForEndpoint: () => opaque('whdel', 'delivery'),
    });
    const batchSize = 10;
    const worker = createOutboundWebhookWorker({
      repository,
      signingKey: SIGNING_KEY,
      fetchImplementation: async () => new Response(null, { status: 204 }),
      lookupImplementation: PUBLIC_LOOKUP,
      clock: () => new Date(NOW),
      workerId: 'worker_lease',
      batchSize,
    });

    await worker.runOnce();
    /*
     * Each delivery is bounded by a 10s abort, so a full batch can take
     * batchSize x that. The lease was a flat 30s, which a batch of ten outlives
     * — and a second worker then re-leased and re-sent the tail.
     */
    const heldMs = Date.parse(leases[0]!) - Date.parse(NOW);
    expect(heldMs).toBeGreaterThanOrEqual(batchSize * 10_000);
  });

  it('rejects stale and modified signatures and uses bounded deterministic retry jitter', () => {
    const body = canonicalJson(eventFixture());
    const signature = createWebhookSignature('whsec_test_secret', 1_000, body);
    expect(verifyWebhookSignature('whsec_test_secret', signature, body, 1_000)).toBe(true);
    expect(verifyWebhookSignature('whsec_test_secret', signature, `${body} `, 1_000)).toBe(false);
    expect(verifyWebhookSignature('whsec_test_secret', signature, body, 1_301)).toBe(false);
    expect(retryDelayMs('delivery_one', 1)).toBe(retryDelayMs('delivery_one', 1));
    expect(retryDelayMs('delivery_one', 8)).toBeGreaterThan(retryDelayMs('delivery_one', 1));
    expect(retryDelayMs('delivery_one', 20)).toBeLessThanOrEqual(18 * 60_000);
  });
});

describe('Brand drift email delivery', () => {
  it('uses provider idempotency and escapes user-controlled labels', async () => {
    const fetchImplementation = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 202 }),
    );
    const notifier = createResendBrandDriftEmailNotifier({
      apiKey: 're_test_api_key',
      from: 'Lodariq <notifications@lodariq.io>',
      fetchImplementation,
    });
    await notifier.send({
      recipientEmail: 'owner@example.com',
      recipientName: '<Owner>',
      workspaceId: WORKSPACE_ID,
      documentId: 'doc_governance',
      environmentId: 'env_staging',
      drift: {
        schemaVersion: '1',
        checkId: 'check_governance',
        checkedAt: NOW,
        trigger: 'creator_check',
        themeId: 'theme_governance',
        baselineThemeVersionId: 'themev_governance',
        classification: 'warning',
        confidence: 91,
        sourceComparisons: [],
        changedRoles: ['accent'],
        accessibilityConsequences: [],
        affectedExperiences: [],
      },
    });
    const [, init] = fetchImplementation.mock.calls[0]!;
    if (!init) throw new Error('Expected email request options');
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as { html: string; text: string };
    expect(headers.get('idempotency-key')).toMatch(/^lodariq-brand-drift\//u);
    expect(body.html).toContain('&lt;Owner&gt;');
    expect(body.html).not.toContain('<Owner>');
    expect(body.text).toContain('Hi <Owner>');
  });
});

describe('governance authorization matrix', () => {
  it('intersects fixed roles, custom profiles, and explicit environment ceilings', async () => {
    const repository = createInMemoryControlPlaneRepository({
      users: [
        {
          id: 'usr_admin',
          legacyIdentityId: null,
          email: 'admin@example.com',
          name: 'Admin',
          emailVerifiedAt: NOW,
          createdAt: NOW,
        },
      ],
      workspaces: [{ id: WORKSPACE_ID, name: 'Governance', createdAt: NOW, updatedAt: NOW }],
      workspaceMemberships: [
        { workspaceId: WORKSPACE_ID, userId: 'usr_admin', role: 'admin', createdAt: NOW },
      ],
      environments: createDefaultControlPlaneEnvironments(WORKSPACE_ID).map((environment) =>
        environment.id === 'env_production'
          ? {
              ...environment,
              id: 'env_production',
              workspaceId: WORKSPACE_ID,
              kind: 'production',
              name: 'Production',
              originAllowlist: ['https://app.example.com'],
              requiredApprovalCount: 1,
              enabled: true,
              pipelinePosition: 2,
              authoringEnabled: false,
              promotionSourceEnvironmentId: 'env_staging',
              releasePolicy: {
                allowDirectPublish: false,
                requireSourceVerification: true,
                requiredApprovalCount: 1,
                publisherRoles: ['owner', 'admin'],
                rollbackRoles: ['owner', 'admin'],
                unpublishRoles: ['owner', 'admin'],
                separationOfDuties: {
                  requireSeparateVerifier: true,
                  requireSeparateApprover: true,
                },
              },
              governanceCapabilities: [
                'release:approve',
                'release:promote',
                'release:rollback',
                'release:unpublish',
                'release-policy:manage',
              ],
              createdAt: NOW,
              updatedAt: NOW,
            }
          : environment,
      ),
    });
    const profile: GovernanceCapabilityProfile = {
      schemaVersion: '1' as const,
      id: opaque('gcp', 'admin-profile'),
      workspaceId: WORKSPACE_ID,
      name: 'Production rollback auditor',
      baseRole: 'admin' as const,
      capabilities: ['release:rollback', 'audit:export'],
      revision: 1,
      createdByUserId: 'usr_admin',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await repository.createGovernanceCapabilityProfile({
      profile,
      actorUserId: 'usr_admin',
      auditEventId: opaque('tenevt', 'profile'),
    });
    await repository.assignGovernanceCapabilityProfile({
      assignment: {
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_production',
        userId: 'usr_admin',
        profileId: profile.id,
        assignedByUserId: 'usr_admin',
        assignedAt: NOW,
      },
      actorUserId: 'usr_admin',
      auditEventId: opaque('tenevt', 'environment-assignment'),
    });
    await repository.assignWorkspaceGovernanceCapabilityProfile({
      assignment: {
        workspaceId: WORKSPACE_ID,
        userId: 'usr_admin',
        profileId: profile.id,
        assignedByUserId: 'usr_admin',
        assignedAt: NOW,
      },
      actorUserId: 'usr_admin',
      auditEventId: opaque('tenevt', 'workspace-assignment'),
    });
    const auth = {
      workspaceId: WORKSPACE_ID,
      userId: 'usr_admin',
      role: 'admin' as const,
      provider: 'headers' as const,
      authenticationMethod: 'password' as const,
      assuranceLevel: 'aal1' as const,
      authenticatedAt: NOW,
    };
    await expect(
      environmentReleaseCapabilityAllowed(repository, auth, 'env_production', 'rollback-release'),
    ).resolves.toBe(true);
    await expect(
      environmentReleaseCapabilityAllowed(repository, auth, 'env_production', 'publish-staging'),
    ).resolves.toBe(false);
    await expect(
      workspaceGovernanceCapabilityAllowed(repository, WORKSPACE_ID, 'usr_admin', 'audit:export'),
    ).resolves.toBe(true);
    await expect(
      workspaceGovernanceCapabilityAllowed(
        repository,
        WORKSPACE_ID,
        'usr_admin',
        'webhooks:manage',
      ),
    ).resolves.toBe(false);
  });
});

describe('governance change history sources', () => {
  /*
   * Drizzle writes webhook, capability-profile and residency audits to
   * `governance_audit_events` and everything else to `tenant_audit_events`, and
   * change history labels each by its table. The in-memory repository keeps one
   * map, so without reproducing the split every API test — all of which use the
   * in-memory repository — reads `tenant-governance` where Postgres returns
   * `platform-governance`.
   */
  it('labels a webhook endpoint audit as platform governance, not tenant', async () => {
    const repository = repositoryFixture();
    await endpointFixture(repository);
    const history = await repository.listGovernanceChangeHistory({
      workspaceId: WORKSPACE_ID,
      query: { category: 'governance', limit: 100 },
    });
    const created = history.find(
      (event) => event.action === 'governance.webhook_endpoint_created',
    );
    // The source is not a field — it is the first segment of the event id.
    expect(created?.id).toMatch(/^change:platform-governance:/u);
  });
});

function repositoryFixture() {
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: 'usr_owner',
        legacyIdentityId: null,
        email: 'owner@example.com',
        name: 'Owner',
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    ],
    workspaces: [{ id: WORKSPACE_ID, name: 'Governance', createdAt: NOW, updatedAt: NOW }],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: 'usr_owner', role: 'owner', createdAt: NOW },
    ],
  });
}

async function endpointFixture(repository: ReturnType<typeof repositoryFixture>) {
  const endpoint: WebhookEndpoint = {
    id: opaque('whep', 'endpoint'),
    workspaceId: WORKSPACE_ID,
    url: 'https://hooks.example.com/lodariq',
    eventTypes: ['release.activated'],
    secretVersion: 1,
    enabled: true,
    createdByUserId: 'usr_owner',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const result = await repository.createWebhookEndpoint({
    endpoint,
    actorUserId: 'usr_owner',
    auditEventId: opaque('tenevt', 'endpoint'),
  });
  if (result.status !== 'completed') throw new Error('endpoint fixture failed');
  return result.value;
}

function eventFixture() {
  return {
    schemaVersion: '1' as const,
    id: opaque('whevt', 'event'),
    workspaceId: WORKSPACE_ID,
    type: 'release.activated' as const,
    occurredAt: NOW,
    data: { documentId: 'doc_governance', generation: 2 },
  };
}

function opaque(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}_${'x'.repeat(24)}`;
}
