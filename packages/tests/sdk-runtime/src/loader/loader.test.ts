// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type ActiveManifestPointerV2,
  type CompiledDocument,
  type CompiledDocumentV2,
} from '@lodariq/schema';
import {
  fetchInstallContext,
  installLodariq,
  readConfigFromScript,
  type TourPlaybackOptions,
} from '@lodariq/sdk-runtime/lodariq-loader';
import {
  DEFAULT_PUBLIC_API_BASE_URL,
  fetchPublicSdkBootstrapContext,
  installPublicSdkFromScript,
  readPublicConfigFromScript,
  type HostedCreatorActivation,
} from '@lodariq/sdk-runtime/public-bootstrap';
import { LodariqRuntime } from '@lodariq/sdk-runtime/runtime';
import type { TargetResolutionContext } from '@lodariq/sdk-runtime/resolver';
import type {
  AuthoringTargetOverride,
  TourTargetResolutionDiagnostic,
} from '@lodariq/sdk-runtime/renderers/tour';
import { createTargetIdentityV2 } from '../../../fixtures/target-identity-v2';

const compiledDoc: CompiledDocument = {
  documentId: 'doc_tour_welcome',
  type: 'tour',
  contentHash: 'local-preview',
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [],
};

const publicCompiledDoc: CompiledDocumentV2 = {
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  documentId: 'doc_public_compatible',
  type: 'tour',
  contentHash: `sha256-${'b'.repeat(64)}`,
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

const publicArtifactManifest: ActiveManifestPointerV2 = {
  schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  workspaceId: 'wk_public_compatible',
  environmentId: 'env_production',
  documentId: publicCompiledDoc.documentId,
  state: 'active',
  generation: 1,
  publicationId: 'pub_public_compatible',
  activatedAt: '2099-01-01T00:00:00.000Z',
  artifact: {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: publicCompiledDoc.contentHash,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: publicCompiledDoc.theme.themeVersionId,
    themeContentHash: publicCompiledDoc.theme.contentHash,
    url: 'https://api.lodariq.io/v1/sdk/artifacts/public-compatible',
    integrity: `sha256-${'A'.repeat(43)}=`,
  },
};

const targetResolutionDoc: CompiledDocument = {
  ...compiledDoc,
  documentId: 'doc_target_identity_v2',
  targets: [
    {
      id: 'target_new_project',
      fingerprint: {
        stableAttributes: { 'data-testid': 'new-project' },
        tagName: 'button',
        role: 'button',
      },
      identity: createTargetIdentityV2('target_new_project'),
    },
  ],
  steps: [
    {
      id: 'step_target_identity_v2',
      targetId: 'target_new_project',
      body: [],
    },
  ],
};

const targetResolutionDiagnostic: TourTargetResolutionDiagnostic = {
  state: 'found',
  confidence: 118,
  candidateCount: 4,
  resolutionMethod: 'configured_attribute',
  reasonCode: 'resolved',
  evidenceFamilies: ['configured-attribute', 'element-semantics'],
  runnerUpConfidence: 63,
  currentLocale: 'de-DE',
};

const publicInstallationId = 'ins_pub_application_1234';
const publicBootstrapBase = {
  installationId: publicInstallationId,
  environmentId: 'env_staging',
  customerOrigin: 'https://staging.customer.example',
  correlationId: 'bootstrap_123',
  delivery: { state: 'unavailable' as const },
};

const availableAuthoring = {
  state: 'available' as const,
  appOrigin: 'https://app.lodariq.io' as const,
  activationUrl: 'https://app.lodariq.io/authoring/activate' as const,
  authorizationRequestUrl: 'https://api.lodariq.io/v1/sdk/authoring/authorization-requests',
  exchangeUrl: 'https://api.lodariq.io/v1/sdk/authoring/exchange',
  bootstrapGrant: 'bootstrap-grant-'.padEnd(48, 'b'),
  bootstrapGrantExpiresAt: '2099-01-01T00:00:00.000Z',
};

describe('loader config (PRD §6.2, §9.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete window.Lodariq;
    document.querySelectorAll('[data-lodariq-launcher]').forEach((element) => element.remove());
    sessionStorage.clear();
  });

  it('derives the default CDN manifest URL from workspace and environment', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'production';

    expect(readConfigFromScript(script)).toEqual({
      workspaceId: 'wk_live_xxx',
      environment: 'production',
      manifestUrl: 'https://cdn.lodariq.io/workspaces/wk_live_xxx/production/manifest.json',
    });
  });

  it('keeps explicit local fixture manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_local_dev';
    script.dataset['env'] = 'development';
    script.dataset['manifest'] = '/fixtures/manifest.json';

    expect(readConfigFromScript(script)?.manifestUrl).toBe('/fixtures/manifest.json');
  });

  it('reads the canonical permanent installation without selecting an environment', () => {
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;

    expect(readPublicConfigFromScript(script)).toEqual({
      installationId: publicInstallationId,
      apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL,
    });
    expect(readConfigFromScript(script)).toBeNull();
  });

  it('rejects a permanent installation pointed at an untrusted API origin', () => {
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    script.dataset['lodariqApi'] = 'https://attacker.example';

    expect(readPublicConfigFromScript(script)).toBeNull();
  });

  it('fails closed when public and legacy script configuration are mixed', () => {
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqToken'] = 'legacy_environment_bearer';
    script.dataset['lodariqAuthoringSession'] = 'legacy_authoring_bearer';

    expect(readPublicConfigFromScript(script)).toBeNull();
    expect(readConfigFromScript(script)).toBeNull();
  });

  it('reads dashboard-generated SDK snippet attributes without requiring workspace in the DOM', () => {
    const script = document.createElement('script');
    script.dataset['lodariqLoader'] = '';
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqApi'] = 'https://api.lodariq.io';
    script.dataset['lodariqToken'] = 'lod_staging_public_token';
    script.dataset['lodariqAuthoringSession'] = 'lod_authoring_session';

    expect(readConfigFromScript(script)).toEqual({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.io',
      clientToken: 'lod_staging_public_token',
      authoringSessionToken: 'lod_authoring_session',
    });
  });

  it('rejects partial dashboard SDK token config instead of guessing credentials', () => {
    const script = document.createElement('script');
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqApi'] = 'https://api.lodariq.io';

    expect(readConfigFromScript(script)).toBeNull();
  });

  it('rejects unknown environments instead of deriving bad manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'prod';

    expect(readConfigFromScript(script)).toBeNull();
  });

  it('encodes workspace IDs in derived URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk live/xxx';
    script.dataset['env'] = 'staging';

    expect(readConfigFromScript(script)?.manifestUrl).toBe(
      'https://cdn.lodariq.io/workspaces/wk%20live%2Fxxx/staging/manifest.json',
    );
  });

  it('evaluates minimal manifest environment eligibility', () => {
    expect(hasEligibleEnvironment(['development', 'staging'], 'development')).toBe(true);
    expect(hasEligibleEnvironment(['development', 'staging'], 'production')).toBe(false);
    expect(hasEligibleEnvironment(undefined, 'production')).toBe(true);
  });

  it('installs a browser API and fetches the configured manifest', async () => {
    const starts: string[] = [];
    const stops: string[] = [];

    class FakeTourPlayer {
      constructor(private readonly doc: CompiledDocument) {}

      start(): void {
        starts.push(this.doc.documentId);
      }

      stop(): void {
        stops.push(this.doc.documentId);
      }
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async (url) => ({
          documentId: url,
          currentVersion: 'local-preview',
        }),
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    expect(window.Lodariq).toBe(api);
    expect(api.manifest).toEqual({
      documentId: '/lodariq-local/manifest.json',
      currentVersion: 'local-preview',
    });

    api.identify({ userId: 'user_1' });
    api.track('fixture_loaded');
    await api.playTour(compiledDoc);
    await api.playTour({ ...compiledDoc, documentId: 'doc_second' });

    expect(starts).toEqual(['doc_tour_welcome', 'doc_second']);
    expect(stops).toEqual(['doc_tour_welcome']);
  });

  it('plays owned authoring previews without replacing delivery or emitting runtime side effects', async () => {
    const tracked: string[] = [];
    const resumeWrites: string[] = [];
    const resumeClears: string[] = [];
    const players: FakeAuthoringPreviewPlayer[] = [];
    const previewDocument: CompiledDocument = {
      ...compiledDoc,
      steps: [{ id: 'step_preview', body: [] }],
    };

    class FakeRuntime extends LodariqRuntime {
      override track(name: string): void {
        tracked.push(name);
      }

      override writeTourResume(
        _manifest: Parameters<LodariqRuntime['writeTourResume']>[0],
        _document: Parameters<LodariqRuntime['writeTourResume']>[1],
        step: Parameters<LodariqRuntime['writeTourResume']>[2],
      ): void {
        resumeWrites.push(step.id);
      }

      override clearTourResume(): void {
        resumeClears.push('clear');
      }
    }

    class FakeAuthoringPreviewPlayer {
      stopped = false;

      constructor(
        private readonly doc: CompiledDocument,
        readonly options: TourPlaybackOptions & {
          authoringPreviewOwnerId?: string;
          authoringTargetOverride?: AuthoringTargetOverride;
          onBeforeStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
          onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
        } = {},
      ) {
        players.push(this);
      }

      start(): void {
        const step = this.doc.steps[0];
        if (!step) return;
        this.options.onBeforeStepChange?.(0, step);
        this.options.onStepChange?.(0, step);
      }

      stop(): void {
        this.stopped = true;
      }

      waitUntilReady(): Promise<void> {
        return Promise.resolve();
      }
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'staging',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_local_dev',
          environment: 'staging',
          manifest: {
            documentId: previewDocument.documentId,
            currentVersion: previewDocument.contentHash,
          },
          currentDocumentUrl: '',
          ingestUrl: '',
          authoring: { enabled: true },
        }),
        loadRuntime: async () => ({ LodariqRuntime: FakeRuntime }) as never,
        loadTourRenderer: async () => ({ TourPlayer: FakeAuthoringPreviewPlayer }) as never,
        openAuthoring: async () => {},
      },
    );

    expect(api.playAuthoringPreview).toBeTypeOf('function');
    expect(api.stopAuthoringPreview).toBeTypeOf('function');
    await api.playTour(previewDocument);
    const deliveryPlayer = players[0]!;
    tracked.length = 0;
    resumeWrites.length = 0;
    resumeClears.length = 0;

    const selected = document.createElement('article');
    document.body.appendChild(selected);
    await api.playAuthoringPreview?.(previewDocument, {
      ownerId: 'authoring_owner_1',
      authoringTargetOverride: { stepId: 'step_target_identity_v2', element: selected },
    });

    const previewPlayer = players[1]!;
    expect(deliveryPlayer.stopped).toBe(false);
    expect(previewPlayer.options.authoringPreviewOwnerId).toBe('authoring_owner_1');
    expect(previewPlayer.options.authoringTargetOverride).toEqual({
      stepId: 'step_target_identity_v2',
      element: selected,
    });
    expect(tracked).toEqual([]);
    expect(resumeWrites).toEqual([]);
    expect(resumeClears).toEqual([]);

    api.stopAuthoringPreview?.('authoring_owner_1');
    expect(previewPlayer.stopped).toBe(true);
    expect(deliveryPlayer.stopped).toBe(false);
    expect(resumeClears).toEqual([]);
  });

  it('does not expose authoring preview controls on production installs', async () => {
    const api = await installLodariq(
      {
        workspaceId: 'wk_live',
        environment: 'production',
        manifestUrl: '/production/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: compiledDoc.documentId,
          currentVersion: compiledDoc.contentHash,
        }),
      },
    );

    expect(api.playAuthoringPreview).toBeUndefined();
    expect(api.stopAuthoringPreview).toBeUndefined();
  });

  it('forwards Target Identity V2 resolution context and invokes the consumer callback', async () => {
    let playerOptions: TourPlaybackOptions | undefined;
    const onTargetResolution = vi.fn();
    const registeredTarget = document.createElement('button');
    const targetResolutionContext: TargetResolutionContext = {
      locale: 'de-DE',
      routePatternId: 'projects.index',
      stateId: 'projects.loaded',
      requiredAction: 'observe-click',
      resolveRegistryTarget: vi.fn(() => registeredTarget),
      resolveStableKey: vi.fn(() => null),
    };

    class FakeTourPlayer {
      constructor(
        private readonly doc: CompiledDocument,
        options?: TourPlaybackOptions,
      ) {
        playerOptions = options;
      }

      start(): void {
        playerOptions?.onTargetResolution?.(this.doc.steps[0]!, targetResolutionDiagnostic);
      }

      stop(): void {}
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: targetResolutionDoc.documentId,
          currentVersion: 'local-preview',
        }),
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour(targetResolutionDoc, {
      targetResolutionContext,
      onTargetResolution,
    });

    expect(playerOptions?.targetResolutionContext).toBe(targetResolutionContext);
    expect(onTargetResolution).toHaveBeenCalledOnce();
    expect(onTargetResolution).toHaveBeenCalledWith(
      targetResolutionDoc.steps[0],
      targetResolutionDiagnostic,
    );
  });

  it('tracks an explicit tour skip separately from authored dismiss actions', async () => {
    const tracked: string[] = [];
    let skip: (() => void) | undefined;

    class FakeRuntime extends LodariqRuntime {
      override track(name: string): void {
        tracked.push(name);
      }
    }

    class FakeTourPlayer {
      constructor(_document: CompiledDocument, options?: { onSkip?: () => void }) {
        skip = options?.onSkip;
      }

      start(): void {}
      stop(): void {}
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: compiledDoc.documentId,
          currentVersion: 'local-preview',
        }),
        loadRuntime: async () => ({ LodariqRuntime: FakeRuntime }) as never,
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour(compiledDoc);
    skip?.();

    expect(tracked).toContain('tour_started');
    expect(tracked).toContain('tour_skipped');
    expect(tracked).not.toContain('tour_dismissed');
  });

  it('tracks only privacy-safe bucketed target-resolution fields', async () => {
    const trackedEvents: Array<{ name: string; props?: Record<string, unknown> }> = [];

    class FakeRuntime extends LodariqRuntime {
      override track(name: string, props?: Record<string, unknown>): void {
        trackedEvents.push({ name, ...(props ? { props } : {}) });
      }
    }

    class FakeTourPlayer {
      constructor(
        private readonly doc: CompiledDocument,
        private readonly options?: TourPlaybackOptions,
      ) {}

      start(): void {
        this.options?.onTargetResolution?.(this.doc.steps[0]!, targetResolutionDiagnostic);
      }

      stop(): void {}
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: targetResolutionDoc.documentId,
          currentVersion: 'local-preview',
        }),
        loadRuntime: async () => ({ LodariqRuntime: FakeRuntime }) as never,
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour(targetResolutionDoc);

    const targetResolutionEvent = trackedEvents.find((event) => event.name === 'target_resolution');
    expect(targetResolutionEvent).toEqual({
      name: 'target_resolution',
      props: {
        documentId: 'doc_target_identity_v2',
        stepId: 'step_target_identity_v2',
        targetId: 'target_new_project',
        result: 'found',
        reasonCode: 'resolved',
        evidenceFamilies: ['configured-attribute', 'element-semantics'],
        scoreBucket: 'high',
        candidateCountBucket: 'many',
        locale: 'de-DE',
      },
    });
    expect(targetResolutionEvent?.props).not.toHaveProperty('confidence');
    expect(targetResolutionEvent?.props).not.toHaveProperty('candidateCount');
    expect(targetResolutionEvent?.props).not.toHaveProperty('runnerUpConfidence');
    expect(targetResolutionEvent?.props).not.toHaveProperty('resolutionMethod');
    expect(targetResolutionEvent?.props).not.toHaveProperty('selector');
    expect(targetResolutionEvent?.props).not.toHaveProperty('coordinates');
  });

  it('bootstraps API token installs without putting the token in the URL', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workspaceId: 'wk_live',
        environment: 'staging',
        manifest: {
          documentId: 'doc_tour_welcome',
          currentVersion: 'sha256-live',
        },
        currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
        authoring: { enabled: false },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchInstallContext({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.io',
      clientToken: 'lod_staging_token',
    });

    expect(context.workspaceId).toBe('wk_live');
    expect(fetch).toHaveBeenCalledWith(
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.io'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_token',
          'content-type': 'application/json',
        }),
      }),
    );
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain('lod_staging_token');
  });

  it('posts permanent installation bootstrap intent without URL credentials or selectors', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environment: 'staging',
        authoring: availableAuthoring,
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchPublicSdkBootstrapContext(
      {
        installationId: publicInstallationId,
        apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL,
      },
      {
        href: 'https://staging.customer.example/projects?tab=active',
        origin: 'https://staging.customer.example',
      },
    );

    expect(context.environment).toBe('staging');
    expect(context.authoring.state).toBe('available');
    expect(fetch).toHaveBeenCalledWith(new URL('/v1/sdk/bootstrap', DEFAULT_PUBLIC_API_BASE_URL), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installationId: publicInstallationId,
        href: 'https://staging.customer.example/projects?tab=active',
        origin: 'https://staging.customer.example',
      }),
    });
    const [requestUrl, requestOptions] = fetch.mock.calls[0]!;
    expect(String(requestUrl)).not.toContain(publicInstallationId);
    expect(JSON.stringify(requestOptions)).not.toContain(availableAuthoring.bootstrapGrant);
    expect(requestOptions.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(requestOptions.body as string)).not.toHaveProperty('environment');
  });

  it('accepts a closed multi-document V2 delivery index for the resolved environment', async () => {
    const manifest = (documentId: string, hashCharacter: string) => ({
      schemaVersion: '2',
      workspaceId: 'wk_public_delivery',
      environmentId: 'env_staging',
      documentId,
      state: 'active',
      generation: 1,
      publicationId: `pub_${documentId}`,
      activatedAt: '2099-01-01T00:00:00.000Z',
      artifact: {
        artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
        contentHash: `sha256-${hashCharacter.repeat(64)}`,
        compilerVersion: COMPILER_VERSION,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
        themeVersionId: 'theme_version_123',
        themeContentHash: `sha256-${'a'.repeat(64)}`,
        url: `https://api.lodariq.io/v1/sdk/workspaces/wk_public_delivery/environments/env_staging/documents/${documentId}/artifacts/sha256-${hashCharacter.repeat(64)}`,
        integrity: `sha256-${'A'.repeat(43)}=`,
      },
    });
    const delivery = {
      state: 'available',
      mode: 'document-scoped-v2',
      manifests: [manifest('doc_welcome', 'b'), manifest('doc_upgrade', 'c')],
      defaultDocumentId: 'doc_welcome',
      ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
    };
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environment: 'staging',
        delivery,
        authoring: { state: 'disabled' },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchPublicSdkBootstrapContext(
      { installationId: publicInstallationId, apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL },
      { origin: 'https://staging.customer.example' },
    );

    expect(context.delivery).toEqual(delivery);
  });

  it('accepts only the data-free authoring branch for production bootstrap', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environmentId: 'env_production',
        environment: 'production',
        customerOrigin: 'https://customer.example',
        authoring: { state: 'disabled' },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchPublicSdkBootstrapContext(
      {
        installationId: publicInstallationId,
        apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL,
      },
      { origin: 'https://customer.example' },
    );

    expect(context.environment).toBe('production');
    expect(context.authoring).toEqual({ state: 'disabled' });
    expect(JSON.stringify(context)).not.toMatch(/bootstrapGrant|activationUrl|creator|editor/i);
  });

  it('installs a staging launcher without loading a published runtime', async () => {
    vi.stubGlobal('location', {
      href: 'https://staging.customer.example/projects',
      origin: 'https://staging.customer.example',
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environment: 'staging',
        authoring: availableAuthoring,
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    document.body.append(script);

    const installed = await installPublicSdkFromScript({
      pageIntent: { origin: 'https://staging.customer.example' },
    });

    expect(installed).toMatchObject({
      environment: 'staging',
      deliveryState: 'unavailable',
      authoringState: 'available',
      runtime: null,
    });
    expect(installed?.launcher?.element.isConnected).toBe(true);
    expect(installed?.launcher?.isVisible()).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: 'l',
        shiftKey: true,
      }),
    );
    expect(installed?.launcher?.isVisible()).toBe(true);
    expect(window.Lodariq).toBeUndefined();
    installed?.destroy();
    script.remove();
  });

  it('reveals the launcher from a dashboard entry intent and persists only session UI state', async () => {
    const customerOrigin = 'https://staging.customer.example';
    const href = `${customerOrigin}/projects?lodariq-launcher=show`;
    vi.stubGlobal('location', { href, origin: customerOrigin });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environment: 'staging',
        authoring: availableAuthoring,
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    document.body.append(script);

    const installed = await installPublicSdkFromScript({
      pageIntent: { href, origin: customerOrigin },
      script,
    });

    expect(installed?.launcher?.isVisible()).toBe(true);
    expect(JSON.stringify(sessionStorage)).not.toMatch(/bootstrap|activation|grant|token/iu);
    installed?.launcher?.hide();
    expect(installed?.launcher?.isVisible()).toBe(false);
    expect(sessionStorage.length).toBe(0);

    installed?.destroy();
    script.remove();
  });

  it('keeps the permanent-loader target-state provider live through hosted activation', async () => {
    const customerOrigin = 'https://staging.customer.example';
    const futureDate = '2099-01-01T00:00:00.000Z';
    vi.stubGlobal('location', {
      href: `${customerOrigin}/projects`,
      origin: customerOrigin,
    });

    let applicationState = 'workspace.collapsed';
    const getTargetStateId = vi.fn(() => applicationState);
    let hostedProvider: HostedCreatorActivation['getTargetStateId'];
    const popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true;
      }),
      postMessage: vi.fn((message: unknown, targetOrigin: string) => {
        expect(targetOrigin).toBe('https://app.lodariq.io');
        if (!message || typeof message !== 'object') return;
        const request = message as Record<string, unknown>;
        window.dispatchEvent(
          new MessageEvent('message', {
            source: popup as unknown as Window,
            origin: 'https://app.lodariq.io',
            data: {
              protocol: 'lodariq.authoring.activation.v1',
              type: 'authoring.authorization.result',
              requestId: request['requestId'],
              state: request['state'],
              authorizationCode: `lod_code_${'c'.repeat(40)}`,
              expiresAt: futureDate,
            },
          }),
        );
      }),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as WindowProxy);

    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/sdk/bootstrap')) {
        return new Response(
          JSON.stringify({
            ...publicBootstrapBase,
            environment: 'staging',
            authoring: availableAuthoring,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (url.endsWith('/authorization-requests')) {
        return new Response(
          JSON.stringify({
            requestId: 'authreq_permanent_loader',
            installationId: publicInstallationId,
            workspaceId: 'wk_permanent_loader',
            environmentId: 'env_staging',
            environment: 'staging',
            customerOrigin,
            state: body['state'],
            codeChallenge: body['codeChallenge'],
            codeChallengeMethod: 'S256',
            requestedCapabilities: ['documents:create', 'documents:list', 'documents:select'],
            expiresAt: futureDate,
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/authoring/exchange')) {
        return new Response(
          JSON.stringify({
            activationGrant: `lod_activation_${'g'.repeat(40)}`,
            context: {
              grantId: 'grant_permanent_loader',
              requestId: 'authreq_permanent_loader',
              installationId: publicInstallationId,
              workspaceId: 'wk_permanent_loader',
              environmentId: 'env_staging',
              environment: 'staging',
              customerOrigin,
              editorOrigin: 'https://editor.lodariq.io',
              creatorId: 'creator_permanent_loader',
              capabilities: ['documents:create', 'documents:list', 'documents:select'],
              expiresAt: futureDate,
            },
            creatorModule: {
              url: `https://cdn.lodariq.io/sdk/sha256-${'0'.repeat(64)}/creator.js`,
              version: 'sha256-test',
              integrity: `sha256-${'A'.repeat(43)}=`,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected permanent-loader request: ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    document.body.append(script);

    const installed = await installPublicSdkFromScript({
      crypto: webcrypto as unknown as Crypto,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
      getTargetStateId,
      loadCreatorModule: async () => ({
        activateLodariqAuthoring: (input) => {
          hostedProvider = input.getTargetStateId;
        },
      }),
      pageIntent: { origin: customerOrigin },
      script,
      timeoutMs: 2_000,
    });
    if (!installed?.launcher) throw new Error('permanent authoring launcher missing');

    await installed.launcher.activate();

    expect(hostedProvider).toBe(getTargetStateId);
    expect(getTargetStateId).not.toHaveBeenCalled();
    expect(hostedProvider?.()).toBe('workspace.collapsed');
    applicationState = 'workspace.expanded';
    expect(hostedProvider?.()).toBe('workspace.expanded');
    expect(getTargetStateId).toHaveBeenCalledTimes(2);
    expect(document.documentElement.outerHTML).not.toContain('workspace.collapsed');
    expect(sessionStorage.length).toBe(0);

    installed.destroy();
    script.remove();
    open.mockRestore();
  });

  it('wires Preview as user to the installed public viewer runtime', async () => {
    vi.stubGlobal('location', {
      href: 'https://staging.customer.example/projects',
      origin: 'https://staging.customer.example',
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environment: 'staging',
        delivery: {
          state: 'available',
          manifest: {
            documentId: compiledDoc.documentId,
            currentVersion: compiledDoc.contentHash,
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
        },
        authoring: availableAuthoring,
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const script = document.createElement('script');
    script.dataset['installation'] = publicInstallationId;
    document.body.append(script);

    const installed = await installPublicSdkFromScript({
      script,
      pageIntent: { origin: 'https://staging.customer.example' },
    });
    if (!installed?.runtime || !installed.launcher) throw new Error('public SDK install failed');
    const playTour = vi.spyOn(installed.runtime, 'playTour').mockResolvedValue(undefined);

    installed.launcher.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-launcher-action="preview-as-user"]')
      ?.click();
    await vi.waitFor(() => expect(playTour).toHaveBeenCalledTimes(1));
    expect(installed.launcher.getState()).toBe('idle');

    installed.destroy();
    script.remove();
  });

  it('keeps production launcher-free when delivery is unpublished', async () => {
    vi.stubGlobal('location', {
      href: 'https://customer.example/projects',
      origin: 'https://customer.example',
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environmentId: 'env_production',
        environment: 'production',
        customerOrigin: 'https://customer.example',
        authoring: { state: 'disabled' },
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const script = document.createElement('script');
    script.dataset['lodariqLoader'] = '';
    script.dataset['installation'] = publicInstallationId;
    document.body.append(script);

    const installed = await installPublicSdkFromScript({
      script,
      pageIntent: { origin: 'https://customer.example' },
    });

    expect(installed).toMatchObject({
      environment: 'production',
      deliveryState: 'unavailable',
      authoringState: 'disabled',
      runtime: null,
      launcher: null,
    });
    expect(document.querySelector('[data-lodariq-launcher]')).toBeNull();
    expect(window.Lodariq).toBeUndefined();
    installed?.destroy();
    script.remove();
  });

  it('rejects invalid or production-permissive bootstrap responses without exposing data', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...publicBootstrapBase,
        environmentId: 'env_production',
        environment: 'production',
        customerOrigin: 'https://customer.example',
        authoring: availableAuthoring,
      }),
    });
    vi.stubGlobal('fetch', fetch);

    let failure: unknown;
    try {
      await fetchPublicSdkBootstrapContext(
        {
          installationId: publicInstallationId,
          apiBaseUrl: DEFAULT_PUBLIC_API_BASE_URL,
        },
        { origin: 'https://customer.example' },
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toEqual(new Error('Lodariq public SDK bootstrap response is invalid'));
    expect(String(failure)).not.toContain(publicInstallationId);
    expect(String(failure)).not.toContain(availableAuthoring.bootstrapGrant);
  });

  it('sends the optional creator authoring session only as a bootstrap header', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workspaceId: 'wk_live',
        environment: 'staging',
        manifest: {
          documentId: 'doc_tour_welcome',
          currentVersion: 'sha256-live',
        },
        currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
        authoring: {
          enabled: true,
          iframeSrc: 'https://editor.lodariq.io/authoring.html',
          sessionId: 'authsess_live',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchInstallContext({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.io',
      clientToken: 'lod_staging_token',
      authoringSessionToken: 'lod_authoring_session',
    });

    expect(context.authoring).toMatchObject({
      enabled: true,
      sessionId: 'authsess_live',
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.io'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_token',
          'x-lodariq-authoring-session': 'lod_authoring_session',
        }),
      }),
    );
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain('lod_authoring_session');
  });

  it('loads the current compiled document from API bootstrap context by default', async () => {
    const starts: string[] = [];
    const fetch = vi.fn(async (input: string | URL) => {
      if (String(input).endsWith('/v1/sdk/bootstrap')) {
        return {
          ok: true,
          json: async () => ({
            workspaceId: 'wk_live',
            environment: 'staging',
            manifest: {
              documentId: 'doc_tour_welcome',
              currentVersion: 'sha256-live',
            },
            currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
            ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => compiledDoc,
      } as Response;
    });
    vi.stubGlobal('fetch', fetch);

    class FakeTourPlayer {
      constructor(private readonly doc: CompiledDocument) {}

      start(): void {
        starts.push(this.doc.documentId);
      }

      stop(): void {}
    }

    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_staging_token',
      },
      {
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour();

    expect(starts).toEqual(['doc_tour_welcome']);
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.lodariq.io/v1/sdk/current-document',
      expect.objectContaining({
        credentials: 'omit',
        headers: { authorization: 'Bearer lod_staging_token' },
      }),
    );
  });

  it('auto-installs when the copied module snippet runs in a browser host page', async () => {
    const loaderUrl = pathToFileURL(
      resolve(process.cwd(), '../sdk-runtime/dist/lodariq-loader.js'),
    ).href;
    const script = document.createElement('script');
    script.type = 'module';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = loaderUrl;
    script.dataset['lodariqLoader'] = '';
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqApi'] = 'https://api.lodariq.io';
    script.dataset['lodariqToken'] = 'lod_staging_public_token';
    document.body.appendChild(script);

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        workspaceId: 'wk_live',
        environment: 'staging',
        manifest: {
          documentId: 'doc_tour_welcome',
          currentVersion: 'sha256-live',
        },
        currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
        authoring: { enabled: false },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    await import(`${loaderUrl}?autoInstall=${Date.now()}`);
    await waitUntil(() => Boolean(window.Lodariq));

    expect(script.getAttribute('data-lodariq-installed')).toBe('true');
    expect(window.Lodariq?.manifest).toEqual({
      documentId: 'doc_tour_welcome',
      currentVersion: 'sha256-live',
    });
    expect(window.Lodariq?.authoring.enabled).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.io'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_public_token',
        }),
      }),
    );
  });

  it('rejects playTour calls without compiled delivery JSON', async () => {
    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
      },
    );

    await expect(api.playTour(undefined as never)).rejects.toThrow(
      'Lodariq.playTour requires compiled delivery JSON with documentId and steps',
    );
  });

  it('rejects invalid current-tour helper results before reading document fields', async () => {
    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
        loadCurrentTour: async () => ({ currentVersion: 'local-preview' }) as never,
      },
    );

    await expect(api.playTour()).rejects.toThrow(
      'Lodariq.playTour requires compiled delivery JSON with documentId and steps',
    );
  });

  it('rejects a public artifact tuple mismatch before renderer, analytics, or resume effects', async () => {
    const tracked: string[] = [];
    const reportedErrors: unknown[] = [];
    const resumeWrites: string[] = [];
    const resumeClears: string[] = [];
    const loadTourRenderer = vi.fn();

    class CompatibilityRuntime extends LodariqRuntime {
      override track(name: string): void {
        tracked.push(name);
      }

      override reportError(error: unknown): void {
        reportedErrors.push(error);
      }

      override writeTourResume(
        _manifest: Parameters<LodariqRuntime['writeTourResume']>[0],
        _document: Parameters<LodariqRuntime['writeTourResume']>[1],
        step: Parameters<LodariqRuntime['writeTourResume']>[2],
      ): void {
        resumeWrites.push(step.id);
      }

      override clearTourResume(): void {
        resumeClears.push('clear');
      }
    }

    const api = await installLodariq(
      { environment: 'production' },
      {
        publicInstallationId,
        fetchInstallContext: async () => ({
          workspaceId: publicArtifactManifest.workspaceId,
          environment: 'production',
          manifest: {
            documentId: publicArtifactManifest.documentId,
            currentVersion: publicArtifactManifest.artifact.contentHash,
          },
          currentDocumentUrl: publicArtifactManifest.artifact.url,
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: { enabled: false },
        }),
        loadRuntime: async () => ({ LodariqRuntime: CompatibilityRuntime }) as never,
        loadTourRenderer,
        resolveArtifactManifestForDocument: () => publicArtifactManifest,
      },
    );
    const mismatchedArtifact = {
      ...publicCompiledDoc,
      rendererContractVersion: '3',
    } as unknown as CompiledDocument;

    await expect(api.playTour(mismatchedArtifact)).rejects.toThrow(
      'Lodariq artifact is incompatible with this runtime',
    );
    expect(loadTourRenderer).not.toHaveBeenCalled();
    expect(tracked).toEqual([]);
    expect(reportedErrors).toEqual([]);
    expect(resumeWrites).toEqual([]);
    expect(resumeClears).toEqual([]);
  });

  it('rejects an incompatible V2 current document on the legacy client-token path', async () => {
    const loadTourRenderer = vi.fn();
    const incompatibleArtifact = {
      ...publicCompiledDoc,
      compilerVersion: 'future-compiler',
    } as unknown as CompiledDocument;
    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_staging_public_token',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_client_token',
          environment: 'staging',
          manifest: {
            documentId: incompatibleArtifact.documentId,
            currentVersion: incompatibleArtifact.contentHash,
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: { enabled: false },
        }),
        loadCurrentTour: async () => incompatibleArtifact,
        loadTourRenderer,
      },
    );

    await expect(api.playTour()).rejects.toThrow(
      'Lodariq artifact is incompatible with this runtime',
    );
    expect(loadTourRenderer).not.toHaveBeenCalled();
  });

  it('reports playback failures through SDK event ingestion without swallowing them', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_staging_public_token',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_live',
          environment: 'staging',
          manifest: {
            documentId: 'doc_tour_welcome',
            currentVersion: 'sha256-live',
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: { enabled: false },
        }),
        loadCurrentTour: async () => {
          throw new Error('Current document failed with lod_staging_secret');
        },
      },
    );

    await expect(api.playTour()).rejects.toThrow('Current document failed');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.lodariq.io/v1/sdk/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_public_token',
        }),
      }),
    );
    const eventCall = fetch.mock.calls.find(
      ([url]) => url === 'https://api.lodariq.io/v1/sdk/events',
    );
    const body = JSON.parse(eventCall?.[1]?.body as string) as {
      events: Array<{ name: string; documentId?: string; props?: Record<string, unknown> }>;
    };
    expect(body.events[0]).toMatchObject({
      name: 'sdk_error',
      documentId: 'doc_tour_welcome',
      props: {
        phase: 'playback',
        errorName: 'Error',
      },
    });
    expect(String(body.events[0]?.props?.['message'])).not.toContain('lod_staging_secret');
  });

  it('loads the current local tour from the manifest helper when playTour has no argument', async () => {
    const starts: string[] = [];
    const helperManifests: string[] = [];

    class FakeTourPlayer {
      constructor(private readonly doc: CompiledDocument) {}

      start(): void {
        starts.push(this.doc.documentId);
      }

      stop(): void {}
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
        loadCurrentTour: async (manifest) => {
          helperManifests.push(`${manifest.documentId}:${manifest.currentVersion}`);
          return compiledDoc;
        },
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour();

    expect(helperManifests).toEqual(['doc_tour_welcome:local-preview']);
    expect(starts).toEqual(['doc_tour_welcome']);
  });

  it('resumes the pending tour step after a same-tab navigation reload', async () => {
    const doc: CompiledDocument = {
      ...compiledDoc,
      contentHash: 'sha256-local-preview-doc',
      steps: [
        {
          id: 'step_1',
          body: [{ id: 'heading_1', type: 'heading', text: 'Open projects', props: {} }],
        },
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Project details', props: {} }],
        },
      ],
    };
    const starts: Array<{ documentId: string; initialStepId?: string }> = [];
    let latestOptions:
      | {
          initialStepId?: string;
          onBeforeStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
          onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
        }
      | undefined;

    class FakeTourPlayer {
      constructor(
        private readonly tour: CompiledDocument,
        options?: typeof latestOptions,
      ) {
        latestOptions = options;
        starts.push({ documentId: tour.documentId, initialStepId: options?.initialStepId });
      }

      start(): void {
        const index = this.tour.steps.findIndex((step) => step.id === latestOptions?.initialStepId);
        const stepIndex = index >= 0 ? index : 0;
        latestOptions?.onStepChange?.(stepIndex, this.tour.steps[stepIndex]!);
      }

      stop(): void {}
    }

    const config = {
      workspaceId: 'wk_local_dev',
      environment: 'development' as const,
      manifestUrl: '/lodariq-local/manifest.json',
    };
    const installOptions = {
      fetchManifest: async () => ({
        documentId: 'doc_tour_welcome',
        currentVersion: 'local-preview',
      }),
      loadCurrentTour: async () => doc,
      loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
    };

    const api = await installLodariq(config, installOptions);
    await api.playTour(doc);
    latestOptions?.onBeforeStepChange?.(1, doc.steps[1]!);

    delete window.Lodariq;
    starts.length = 0;

    await installLodariq(config, installOptions);

    expect(starts).toEqual([{ documentId: 'doc_tour_welcome', initialStepId: 'step_2' }]);
  });

  it('ignores stale concurrent playTour starts', async () => {
    const starts: string[] = [];
    const stops: string[] = [];
    let rendererCalls = 0;
    let resolveFirstRenderer!: (module: unknown) => void;
    const firstRenderer = new Promise((resolve) => {
      resolveFirstRenderer = resolve;
    });

    class FakeTourPlayer {
      constructor(private readonly doc: CompiledDocument) {}

      start(): void {
        starts.push(this.doc.documentId);
      }

      stop(): void {
        stops.push(this.doc.documentId);
      }
    }

    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
        loadTourRenderer: async () => {
          rendererCalls += 1;
          if (rendererCalls === 1) return (await firstRenderer) as never;
          return { TourPlayer: FakeTourPlayer } as never;
        },
      },
    );

    const first = api.playTour({ ...compiledDoc, documentId: 'doc_first' });
    const second = api.playTour({ ...compiledDoc, documentId: 'doc_second' });

    await second;
    resolveFirstRenderer({ TourPlayer: FakeTourPlayer });
    await first;

    expect(starts).toEqual(['doc_second']);
    expect(stops).toEqual([]);
  });

  it('does not play tours when manifest environment metadata excludes the page', async () => {
    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'production',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () =>
          ({
            documentId: 'doc_tour_welcome',
            currentVersion: 'local-preview',
            environments: ['development', 'staging'],
          }) as never,
      },
    );

    await expect(api.playTour(compiledDoc)).rejects.toThrow(
      'Lodariq manifest is not eligible for production',
    );
  });

  it('opens authoring through the injected authoring callback', async () => {
    const opened: string[] = [];
    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
        openAuthoring: async (manifest) => {
          opened.push(manifest.documentId);
        },
      },
    );

    await api.openAuthoring();

    expect(api.authoring).toEqual({ enabled: true });
    expect(opened).toEqual(['doc_tour_welcome']);
  });

  it('requires explicit bootstrap authoring enablement for staging token installs', async () => {
    const opened: string[] = [];
    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_staging_token',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_live',
          environment: 'staging',
          manifest: {
            documentId: 'doc_tour_welcome',
            currentVersion: 'sha256-live',
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: { enabled: false },
        }),
        openAuthoring: async (manifest) => {
          opened.push(manifest.documentId);
        },
      },
    );

    expect(api.authoring.enabled).toBe(false);
    await expect(api.openAuthoring()).rejects.toThrow(
      'Lodariq authoring is not enabled for this session',
    );
    expect(opened).toEqual([]);
  });

  it('opens staging authoring only when bootstrap authorizes the creator session', async () => {
    const opened: Array<{ documentId: string; iframeSrc?: string }> = [];
    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_staging_token',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_live',
          environment: 'staging',
          manifest: {
            documentId: 'doc_tour_welcome',
            currentVersion: 'sha256-live',
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: {
            enabled: true,
            iframeSrc: 'https://editor.lodariq.io/authoring.html',
          },
        }),
        openAuthoring: async (manifest, context) => {
          opened.push({
            documentId: manifest.documentId,
            iframeSrc: context.authoring?.iframeSrc,
          });
        },
      },
    );

    expect(api.authoring).toEqual({
      enabled: true,
      iframeSrc: 'https://editor.lodariq.io/authoring.html',
    });

    await api.openAuthoring();

    expect(opened).toEqual([
      {
        documentId: 'doc_tour_welcome',
        iframeSrc: 'https://editor.lodariq.io/authoring.html',
      },
    ]);
  });

  it('keeps production authoring disabled even if bootstrap data is permissive', async () => {
    const opened: string[] = [];
    const api = await installLodariq(
      {
        environment: 'production',
        apiBaseUrl: 'https://api.lodariq.io',
        clientToken: 'lod_production_token',
      },
      {
        fetchInstallContext: async () => ({
          workspaceId: 'wk_live',
          environment: 'production',
          manifest: {
            documentId: 'doc_tour_welcome',
            currentVersion: 'sha256-live',
          },
          currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
          authoring: {
            enabled: true,
            iframeSrc: 'https://editor.lodariq.io/authoring.html',
          },
        }),
        openAuthoring: async (manifest) => {
          opened.push(manifest.documentId);
        },
      },
    );

    expect(api.authoring.enabled).toBe(false);
    await expect(api.openAuthoring()).rejects.toThrow(
      'Lodariq authoring is not enabled for this session',
    );
    expect(opened).toEqual([]);
  });

  it('rejects openAuthoring when authoring is not configured', async () => {
    const api = await installLodariq(
      {
        workspaceId: 'wk_local_dev',
        environment: 'development',
        manifestUrl: '/lodariq-local/manifest.json',
      },
      {
        fetchManifest: async () => ({
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
        }),
      },
    );

    expect(api.authoring.enabled).toBe(false);
    await expect(api.openAuthoring()).rejects.toThrow(
      'Lodariq authoring is not enabled for this session',
    );
  });
});

function hasEligibleEnvironment(
  environments: unknown,
  environment: 'development' | 'staging' | 'production',
): boolean {
  if (environments === undefined) return true;
  return Array.isArray(environments) && environments.includes(environment);
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for condition');
}
