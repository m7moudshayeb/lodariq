// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument, TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { installLocalTalmehAuthoringFromScript } from '@talmeh/sdk-authoring/local-dev/install';

const baseDocument = tourFixture as TalmehDocument;

describe('local-dev authoring install helper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.Talmeh;
  });

  it('installs local Talmeh and opens authoring through the SDK helper', async () => {
    const script = localLoaderScript('development');
    const starts: string[] = [];

    const talmeh = await installLocalTalmehAuthoringFromScript({
      baseDocument,
      script,
      iframeSrc: '/authoring.html',
      installOptions: fakeInstallOptions(starts),
    });

    expect(talmeh).toBe(window.Talmeh);
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-talmeh-authoring-trigger="true"]',
    );
    expect(trigger?.textContent).toBe('T');
    expect(trigger?.className).toBe('talmeh-authoring-trigger');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    const openAuthoring = vi.spyOn(talmeh!, 'openAuthoring').mockResolvedValue(undefined);
    trigger?.click();
    expect(openAuthoring).toHaveBeenCalledTimes(1);
    openAuthoring.mockRestore();

    await talmeh?.playTour();
    expect(starts).toEqual([baseDocument.id]);

    await talmeh?.openAuthoring();
    expect(document.querySelector('iframe[title="Talmeh authoring"]')?.getAttribute('src')).toBe(
      '/authoring.html',
    );
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.documentElement.hasAttribute('data-talmeh-authoring-panel-open')).toBe(true);
  });

  it('injects local authoring trigger styles with the host CSP nonce', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_trigger">';

    await installLocalTalmehAuthoringFromScript({
      baseDocument,
      script: localLoaderScript('development'),
      installOptions: fakeInstallOptions(),
    });

    expect(document.getElementById('talmeh-local-authoring-trigger-style')?.nonce).toBe(
      'nonce_local_trigger',
    );
  });

  it('rejects production configs instead of enabling local authoring', async () => {
    const fetchManifest = vi.fn();

    await expect(
      installLocalTalmehAuthoringFromScript({
        baseDocument,
        script: localLoaderScript('production'),
        installOptions: { fetchManifest },
      }),
    ).rejects.toThrow('Talmeh local authoring is only available in development or staging');
    expect(fetchManifest).not.toHaveBeenCalled();
  });

  it('keeps the install entry free of static authoring-frame imports', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../sdk-authoring/src/local-dev/install.ts'),
      'utf8',
    );

    expect(source).not.toContain("from '../authoring'");
    expect(source).not.toContain("from '../authoring/local-frame'");
    expect(source).not.toContain("from './frame'");
    expect(source).toContain("await import('../authoring')");
  });
});

function fakeInstallOptions(starts: string[] = []) {
  class FakeRuntime {
    identify(): void {}
    track(): void {}
  }

  class FakeTourPlayer {
    constructor(private readonly doc: CompiledDocument) {}

    start(): void {
      starts.push(this.doc.documentId);
    }

    stop(): void {}
  }

  return {
    fetchManifest: async () => ({
      documentId: baseDocument.id,
      currentVersion: 'local-preview',
    }),
    loadRuntime: async () => ({ TalmehRuntime: FakeRuntime }) as never,
    loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
  };
}

function localLoaderScript(
  environment: 'development' | 'staging' | 'production',
): HTMLScriptElement {
  const script = document.createElement('script');
  script.dataset['workspace'] = 'wk_local_dev';
  script.dataset['env'] = environment;
  script.dataset['manifest'] = '/talmeh-local/manifest.json';
  return script;
}
