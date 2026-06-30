// @vitest-environment jsdom
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument } from '@lodariq/schema';
import {
  defaultManifestUrl,
  fetchInstallContext,
  installLodariq,
  isManifestEligible,
  readConfigFromScript,
} from '@lodariq/sdk-runtime/lodariq-loader';

const compiledDoc: CompiledDocument = {
  documentId: 'doc_tour_welcome',
  type: 'tour',
  contentHash: 'local-preview',
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [],
  steps: [],
};

describe('loader config (PRD §6.2, §9.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete window.Lodariq;
    sessionStorage.clear();
  });

  it('derives the default CDN manifest URL from workspace and environment', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'production';

    expect(readConfigFromScript(script)).toEqual({
      workspaceId: 'wk_live_xxx',
      environment: 'production',
      manifestUrl: 'https://cdn.lodariq.com/workspaces/wk_live_xxx/production/manifest.json',
    });
  });

  it('keeps explicit local fixture manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_local_dev';
    script.dataset['env'] = 'development';
    script.dataset['manifest'] = '/fixtures/manifest.json';

    expect(readConfigFromScript(script)?.manifestUrl).toBe('/fixtures/manifest.json');
  });

  it('reads dashboard-generated SDK snippet attributes without requiring workspace in the DOM', () => {
    const script = document.createElement('script');
    script.dataset['lodariqLoader'] = '';
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqApi'] = 'https://api.lodariq.com';
    script.dataset['lodariqToken'] = 'lod_staging_public_token';
    script.dataset['lodariqAuthoringSession'] = 'lod_authoring_session';

    expect(readConfigFromScript(script)).toEqual({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.com',
      clientToken: 'lod_staging_public_token',
      authoringSessionToken: 'lod_authoring_session',
    });
  });

  it('rejects partial dashboard SDK token config instead of guessing credentials', () => {
    const script = document.createElement('script');
    script.dataset['lodariqEnvironment'] = 'staging';
    script.dataset['lodariqApi'] = 'https://api.lodariq.com';

    expect(readConfigFromScript(script)).toBeNull();
  });

  it('rejects unknown environments instead of deriving bad manifest URLs', () => {
    const script = document.createElement('script');
    script.dataset['workspace'] = 'wk_live_xxx';
    script.dataset['env'] = 'prod';

    expect(readConfigFromScript(script)).toBeNull();
  });

  it('encodes workspace IDs in derived URLs', () => {
    expect(defaultManifestUrl('wk live/xxx', 'staging')).toBe(
      'https://cdn.lodariq.com/workspaces/wk%20live%2Fxxx/staging/manifest.json',
    );
  });

  it('evaluates minimal manifest environment eligibility', () => {
    expect(
      isManifestEligible(
        {
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
          environments: ['development', 'staging'],
        } as never,
        'development',
      ),
    ).toBe(true);
    expect(
      isManifestEligible(
        {
          documentId: 'doc_tour_welcome',
          currentVersion: 'local-preview',
          environments: ['development', 'staging'],
        } as never,
        'production',
      ),
    ).toBe(false);
    expect(
      isManifestEligible(
        { documentId: 'doc_tour_welcome', currentVersion: 'local-preview' },
        'production',
      ),
    ).toBe(true);
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
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
        authoring: { enabled: false },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchInstallContext({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.com',
      clientToken: 'lod_staging_token',
    });

    expect(context.workspaceId).toBe('wk_live');
    expect(fetch).toHaveBeenCalledWith(
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.com'),
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
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
        authoring: {
          enabled: true,
          iframeSrc: 'https://editor.lodariq.com/authoring.html',
          sessionId: 'authsess_live',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const context = await fetchInstallContext({
      environment: 'staging',
      apiBaseUrl: 'https://api.lodariq.com',
      clientToken: 'lod_staging_token',
      authoringSessionToken: 'lod_authoring_session',
    });

    expect(context.authoring).toMatchObject({
      enabled: true,
      sessionId: 'authsess_live',
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.com'),
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
            currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
            ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
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
        apiBaseUrl: 'https://api.lodariq.com',
        clientToken: 'lod_staging_token',
      },
      {
        loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
      },
    );

    await api.playTour();

    expect(starts).toEqual(['doc_tour_welcome']);
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.lodariq.com/v1/sdk/current-document',
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
    script.dataset['lodariqApi'] = 'https://api.lodariq.com';
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
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
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
      new URL('/v1/sdk/bootstrap', 'https://api.lodariq.com'),
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

  it('reports playback failures through SDK event ingestion without swallowing them', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const api = await installLodariq(
      {
        environment: 'staging',
        apiBaseUrl: 'https://api.lodariq.com',
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
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
          authoring: { enabled: false },
        }),
        loadCurrentTour: async () => {
          throw new Error('Current document failed with lod_staging_secret');
        },
      },
    );

    await expect(api.playTour()).rejects.toThrow('Current document failed');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.lodariq.com/v1/sdk/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer lod_staging_public_token',
        }),
      }),
    );
    const eventCall = fetch.mock.calls.find(
      ([url]) => url === 'https://api.lodariq.com/v1/sdk/events',
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
        apiBaseUrl: 'https://api.lodariq.com',
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
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
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
        apiBaseUrl: 'https://api.lodariq.com',
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
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
          authoring: {
            enabled: true,
            iframeSrc: 'https://editor.lodariq.com/authoring.html',
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
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
    });

    await api.openAuthoring();

    expect(opened).toEqual([
      {
        documentId: 'doc_tour_welcome',
        iframeSrc: 'https://editor.lodariq.com/authoring.html',
      },
    ]);
  });

  it('keeps production authoring disabled even if bootstrap data is permissive', async () => {
    const opened: string[] = [];
    const api = await installLodariq(
      {
        environment: 'production',
        apiBaseUrl: 'https://api.lodariq.com',
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
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
          authoring: {
            enabled: true,
            iframeSrc: 'https://editor.lodariq.com/authoring.html',
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

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for condition');
}
