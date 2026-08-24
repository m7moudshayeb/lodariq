// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  RENDERER_CONTRACT_VERSION,
  type ActiveManifestPointerV2,
} from '@lodariq/schema';
import type { PublicDeliveryBrowserApi } from '@lodariq/sdk-runtime/public-delivery';
import { installDeliveryOrchestrator } from '../../../../sdk-runtime/src/activation/delivery-orchestrator.js';

describe('delivery trigger orchestration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for page-load delay and explicit identify traits, then fires once', async () => {
    const api = fakeApi();
    const playTour = api.playTourById;
    const orchestration = installDeliveryOrchestrator({
      api,
      manifests: [
        manifest('doc_page', {
          trigger: { type: 'pageLoad', config: { delayMs: 200 } },
          audience: {
            environments: ['production'],
            rules: [{ source: 'identify', key: 'plan', operator: 'equals', value: 'growth' }],
          },
        }),
      ],
      environment: 'production',
      installationId: 'ins_pub_runtime_orchestrator',
    });

    await vi.advanceTimersByTimeAsync(200);
    expect(playTour).not.toHaveBeenCalled();
    api.identify({ userId: 'visitor_1', plan: 'growth' });
    api.identify({ userId: 'visitor_1', plan: 'growth' });
    expect(playTour).toHaveBeenCalledTimes(1);
    orchestration.destroy();
  });

  it('coalesces event bursts and fails closed until all audience rules exist', () => {
    const api = fakeApi();
    const playTour = api.playTourById;
    const orchestration = installDeliveryOrchestrator({
      api,
      manifests: [
        manifest('doc_event', {
          trigger: { type: 'event', config: { eventName: 'checkout_completed' } },
          audience: {
            environments: ['production'],
            rules: [
              { source: 'identify', key: 'accountId', operator: 'exists' },
              { source: 'event', key: 'checkout_completed', operator: 'exists' },
            ],
          },
        }),
      ],
      environment: 'production',
      installationId: 'ins_pub_runtime_orchestrator',
    });

    for (let index = 0; index < 50; index += 1) api.track('checkout_completed');
    expect(playTour).not.toHaveBeenCalled();
    api.identify({ userId: 'visitor_1', accountId: 'account_1' });
    expect(playTour).toHaveBeenCalledTimes(1);
    orchestration.destroy();
  });

  it('responds to SPA pathname churn without replaying a fired tour', async () => {
    const api = fakeApi();
    const playTour = api.playTourById;
    const orchestration = installDeliveryOrchestrator({
      api,
      manifests: [
        manifest('doc_url', {
          trigger: { type: 'urlMatch', config: { pattern: '/settings', mode: 'prefix' } },
          audience: { environments: ['production'] },
        }),
      ],
      environment: 'production',
      installationId: 'ins_pub_runtime_orchestrator',
    });

    window.history.pushState(null, '', '/settings/profile');
    window.history.replaceState(null, '', '/settings/billing');
    await vi.runAllTimersAsync();
    expect(playTour).toHaveBeenCalledTimes(1);
    orchestration.destroy();
  });

  it('retains audience evidence without replaying the same publication after re-bootstrap', async () => {
    const activation = {
      trigger: {
        type: 'urlMatch' as const,
        config: { pattern: '/settings', mode: 'prefix' as const },
      },
      audience: {
        environments: ['production' as const],
        rules: [
          {
            source: 'identify' as const,
            key: 'plan',
            operator: 'equals' as const,
            value: 'growth',
          },
        ],
      },
    };
    window.history.replaceState(null, '', '/settings/profile');
    const firstApi = fakeApi();
    const firstPlay = firstApi.playTourById;
    const first = installDeliveryOrchestrator({
      api: firstApi,
      manifests: [manifest('doc_rebootstrap', activation)],
      environment: 'production',
      installationId: 'ins_pub_runtime_rebootstrap',
    });
    firstApi.identify({ userId: 'visitor_1', plan: 'growth' });
    expect(firstPlay).toHaveBeenCalledTimes(1);
    first.destroy();

    const secondApi = fakeApi();
    const secondPlay = secondApi.playTourById;
    const second = installDeliveryOrchestrator({
      api: secondApi,
      manifests: [manifest('doc_rebootstrap', activation)],
      environment: 'production',
      installationId: 'ins_pub_runtime_rebootstrap',
    });
    await vi.runAllTimersAsync();
    expect(secondPlay).not.toHaveBeenCalled();
    second.destroy();
  });

  it('ignores malformed activation metadata before automatic delivery', async () => {
    const api = fakeApi();
    const playTour = api.playTourById;
    const forged = {
      ...manifest('doc_forged', {
        trigger: { type: 'manual' },
        audience: { environments: ['production'] },
      }),
      activation: {
        trigger: { type: 'pageLoad', config: { delayMs: -1 } },
        audience: { environments: ['production'] },
      },
    } as unknown as ActiveManifestPointerV2;
    const orchestration = installDeliveryOrchestrator({
      api,
      manifests: [forged],
      environment: 'production',
      installationId: 'ins_pub_runtime_invalid_activation',
    });

    await vi.runAllTimersAsync();
    expect(playTour).not.toHaveBeenCalled();
    orchestration.destroy();
  });

  it('sends catalog keys and types without trait values or event properties', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    const api = fakeApi();
    const orchestration = installDeliveryOrchestrator({
      api,
      manifests: [],
      environment: 'production',
      installationId: 'ins_pub_runtime_orchestrator',
      catalogUrl: 'https://api.lodariq.io/v1/sdk/catalog-observations',
    });

    api.identify({ userId: 'visitor-secret', plan: 'enterprise-secret' });
    api.track('checkout_completed', { orderId: 'order-secret' });
    await vi.advanceTimersByTimeAsync(250);

    const body = String(fetch.mock.calls[0]?.[1]?.body);
    expect(body).toContain('identify_trait');
    expect(body).toContain('checkout_completed');
    expect(body).not.toContain('visitor-secret');
    expect(body).not.toContain('enterprise-secret');
    expect(body).not.toContain('order-secret');
    orchestration.destroy();
  });
});

function fakeApi(): PublicDeliveryBrowserApi {
  return {
    manifest: { documentId: 'doc_default', currentVersion: `sha256-${'a'.repeat(64)}` },
    manifests: [],
    defaultDocumentId: 'doc_default',
    authoring: { enabled: false },
    identify: vi.fn(),
    track: vi.fn(),
    playTour: vi.fn().mockResolvedValue(undefined),
    playTourById: vi.fn().mockResolvedValue(undefined),
    openAuthoring: vi.fn().mockResolvedValue(undefined),
    stopTour: vi.fn(),
    destroyDelivery: vi.fn(),
    registerBrandTokens: vi.fn(),
  };
}

function manifest(
  documentId: string,
  activation: NonNullable<ActiveManifestPointerV2['activation']>,
): ActiveManifestPointerV2 {
  return {
    schemaVersion: PUBLIC_MANIFEST_SCHEMA_VERSION,
    workspaceId: 'wk_runtime',
    environmentId: 'env_production',
    documentId,
    state: 'active',
    generation: 1,
    publicationId: `pub_${documentId}`,
    activatedAt: '2026-08-21T00:00:00.000Z',
    activation,
    artifact: {
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      contentHash: `sha256-${'a'.repeat(64)}`,
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: 'themev_runtime',
      themeContentHash: `sha256-${'b'.repeat(64)}`,
      url: `https://api.lodariq.io/artifacts/${documentId}`,
      integrity: `sha256-${'A'.repeat(43)}=`,
    },
  };
}
