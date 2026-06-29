// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CompiledDocument } from '@lodariq/schema';
import {
  defaultManifestUrl,
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

    expect(opened).toEqual(['doc_tour_welcome']);
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

    await expect(api.openAuthoring()).rejects.toThrow('Lodariq.openAuthoring is not configured');
  });
});
