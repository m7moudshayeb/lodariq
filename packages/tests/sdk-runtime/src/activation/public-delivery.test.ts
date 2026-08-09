// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type CompiledDocumentV2,
  type PublicSdkBootstrapContext,
} from '@lodariq/schema';
import {
  fetchPublicCurrentDocument,
  installPublicSdkDelivery,
} from '@lodariq/sdk-runtime/public-delivery';
import { registerBrandTokens } from '@lodariq/sdk-runtime';

const INSTALLATION_ID = 'ins_pub_application_1234';
const LEGACY_COMPILED_DOCUMENT: CompiledDocument = {
  documentId: 'doc_public_delivery',
  type: 'tour',
  contentHash: `sha256-${'d'.repeat(64)}`,
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [],
};

const COMPILED_DOCUMENT: CompiledDocumentV2 = {
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  documentId: 'doc_public_delivery',
  type: 'tour',
  contentHash: `sha256-${'d'.repeat(64)}`,
  schemaVersion: '1.0.0',
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  trigger: { type: 'manual' },
  audience: { environments: ['production'] },
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  appearance: DEFAULT_EXPERIENCE_APPEARANCE,
  targets: [],
  steps: [],
};

const SECOND_COMPILED_DOCUMENT: CompiledDocumentV2 = {
  ...COMPILED_DOCUMENT,
  documentId: 'doc_public_upgrade',
  contentHash: `sha256-${'f'.repeat(64)}`,
};

const activeManifest = (
  document: CompiledDocumentV2,
  publicationId: string,
): Extract<
  Extract<
    PublicSdkBootstrapContext['delivery'],
    { mode: 'document-scoped-v2' }
  >['manifests'][number],
  { state: 'active' }
> => ({
  schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  workspaceId: 'wk_public_delivery',
  environmentId: 'env_production',
  documentId: document.documentId,
  state: 'active',
  generation: 2,
  publicationId,
  activatedAt: '2099-01-01T00:00:00.000Z',
  artifact: {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: document.contentHash,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: document.theme.themeVersionId,
    themeContentHash: document.theme.contentHash,
    url: `https://api.lodariq.com/v1/sdk/workspaces/wk_public_delivery/environments/env_production/documents/${document.documentId}/artifacts/${document.contentHash}`,
    integrity: `sha256-${'A'.repeat(43)}=`,
  },
});

describe('permanent SDK delivery adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.Lodariq;
    sessionStorage.clear();
  });

  it('fetches compiled delivery with only the public installation header', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(LEGACY_COMPILED_DOCUMENT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      fetchPublicCurrentDocument(
        'https://api.lodariq.com/v1/sdk/current-document',
        {
          documentId: LEGACY_COMPILED_DOCUMENT.documentId,
          currentVersion: LEGACY_COMPILED_DOCUMENT.contentHash,
        },
        { installationId: INSTALLATION_ID },
      ),
    ).resolves.toEqual(LEGACY_COMPILED_DOCUMENT);
    expect(fetch).toHaveBeenCalledWith('https://api.lodariq.com/v1/sdk/current-document', {
      credentials: 'omit',
      headers: { 'x-lodariq-installation-id': INSTALLATION_ID },
    });
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain(INSTALLATION_ID);
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('authorization');
  });

  it('rejects a compiled response that does not match the bootstrapped manifest', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...LEGACY_COMPILED_DOCUMENT, documentId: 'doc_cross_scope' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      fetchPublicCurrentDocument(
        'https://api.lodariq.com/v1/sdk/current-document',
        {
          documentId: LEGACY_COMPILED_DOCUMENT.documentId,
          currentVersion: LEGACY_COMPILED_DOCUMENT.contentHash,
        },
        { installationId: INSTALLATION_ID },
      ),
    ).rejects.toThrow('Lodariq public document response is invalid');
  });

  it('rejects loaded V2 bytes whose theme pin differs from the active manifest', async () => {
    const manifest = activeManifest(COMPILED_DOCUMENT, 'pub_welcome');
    const mismatched = structuredClone(COMPILED_DOCUMENT);
    mismatched.theme.themeVersionId = 'themev_unadvertised';
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mismatched), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      fetchPublicCurrentDocument(manifest.artifact.url, manifest, {
        installationId: INSTALLATION_ID,
        integrity: manifest.artifact.integrity,
      }),
    ).rejects.toThrow('Lodariq artifact is incompatible with this runtime');
  });

  it('keeps unpublished delivery inert', async () => {
    const unavailable: PublicSdkBootstrapContext = {
      installationId: INSTALLATION_ID,
      environmentId: 'env_staging',
      environment: 'staging',
      customerOrigin: 'https://staging.customer.example',
      correlationId: 'corr_unpublished',
      delivery: { state: 'unavailable' },
      authoring: { state: 'disabled' },
    };

    await expect(installPublicSdkDelivery(unavailable)).resolves.toBeNull();
    expect(window.Lodariq).toBeUndefined();
  });

  it('adapts a V2 deployment pointer without enabling authoring', async () => {
    const context: PublicSdkBootstrapContext = {
      installationId: INSTALLATION_ID,
      environmentId: 'env_production',
      environment: 'production',
      customerOrigin: 'https://customer.example',
      correlationId: 'corr_public_delivery',
      delivery: {
        state: 'available',
        manifest: activeManifest(COMPILED_DOCUMENT, 'pub_public_delivery'),
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      },
      authoring: { state: 'disabled' },
    };

    const api = await installPublicSdkDelivery(context);

    expect(api?.manifest).toMatchObject({
      documentId: 'doc_public_delivery',
      currentVersion: `sha256-${'d'.repeat(64)}`,
    });
    expect(api?.authoring).toEqual({ enabled: false });
    expect(api?.registerBrandTokens).toBe(registerBrandTokens);
    expect(window.Lodariq).toBe(api);
  });

  it('rejects an unsupported public manifest before installing a runtime', async () => {
    const supported = activeManifest(COMPILED_DOCUMENT, 'pub_public_delivery');
    const context = {
      installationId: INSTALLATION_ID,
      environmentId: 'env_production',
      environment: 'production',
      customerOrigin: 'https://customer.example',
      correlationId: 'corr_unsupported_delivery',
      delivery: {
        state: 'available',
        manifest: {
          ...supported,
          artifact: { ...supported.artifact, compilerVersion: 'future-compiler' },
        },
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      },
      authoring: { state: 'disabled' },
    } as unknown as PublicSdkBootstrapContext;

    await expect(installPublicSdkDelivery(context)).rejects.toThrow(
      'Lodariq artifact is incompatible with this runtime',
    );
    expect(window.Lodariq).toBeUndefined();
  });

  it('installs a multi-document V2 index and lazily plays a selected integrity-pinned tour', async () => {
    const context: PublicSdkBootstrapContext = {
      installationId: INSTALLATION_ID,
      environmentId: 'env_production',
      environment: 'production',
      customerOrigin: 'https://customer.example',
      correlationId: 'corr_multi_delivery',
      delivery: {
        state: 'available',
        mode: 'document-scoped-v2',
        manifests: [
          activeManifest(COMPILED_DOCUMENT, 'pub_welcome'),
          activeManifest(SECOND_COMPILED_DOCUMENT, 'pub_upgrade'),
        ],
        defaultDocumentId: COMPILED_DOCUMENT.documentId,
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      },
      authoring: { state: 'disabled' },
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SECOND_COMPILED_DOCUMENT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const api = await installPublicSdkDelivery(context);
    if (!api) throw new Error('public SDK install failed');
    const playTour = vi.spyOn(api, 'playTour').mockResolvedValue(undefined);
    await api.playTourById(SECOND_COMPILED_DOCUMENT.documentId);

    expect(api.defaultDocumentId).toBe(COMPILED_DOCUMENT.documentId);
    expect(api.manifests.map((manifest) => manifest.documentId)).toEqual([
      COMPILED_DOCUMENT.documentId,
      SECOND_COMPILED_DOCUMENT.documentId,
    ]);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.lodariq.com/v1/sdk/workspaces/wk_public_delivery/environments/env_production/documents/${SECOND_COMPILED_DOCUMENT.documentId}/artifacts/${SECOND_COMPILED_DOCUMENT.contentHash}`,
      {
        credentials: 'omit',
        headers: { 'x-lodariq-installation-id': INSTALLATION_ID },
        integrity: `sha256-${'A'.repeat(43)}=`,
      },
    );
    expect(playTour).toHaveBeenCalledWith(SECOND_COMPILED_DOCUMENT, {});
    await expect(api.playTourById('doc_not_available')).rejects.toThrow(
      'Lodariq public tour is not available',
    );
    expect(api.authoring).toEqual({ enabled: false });
  });

  it('rejects a document-scoped index whose default is missing', async () => {
    const context = {
      installationId: INSTALLATION_ID,
      environmentId: 'env_production',
      environment: 'production',
      customerOrigin: 'https://customer.example',
      correlationId: 'corr_invalid_default',
      delivery: {
        state: 'available',
        mode: 'document-scoped-v2',
        manifests: [activeManifest(COMPILED_DOCUMENT, 'pub_welcome')],
        defaultDocumentId: 'doc_not_available',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
      },
      authoring: { state: 'disabled' },
    } as PublicSdkBootstrapContext;

    await expect(installPublicSdkDelivery(context)).rejects.toThrow(
      'Lodariq public delivery configuration is invalid',
    );
  });
});
