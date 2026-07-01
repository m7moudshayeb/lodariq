// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';

const baseDocument = tourFixture as LodariqDocument;

describe('local-dev authoring install helper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.Lodariq;
  });

  it('installs local Lodariq and opens authoring through the SDK helper', async () => {
    const script = localLoaderScript('development');
    const starts: string[] = [];

    const lodariq = await installLocalLodariqAuthoringFromScript({
      baseDocument,
      script,
      iframeSrc: '/authoring.html',
      installOptions: fakeInstallOptions(starts),
    });

    expect(lodariq).toBe(window.Lodariq);
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lodariq-authoring-trigger="true"]',
    );
    expect(trigger?.textContent).toBe('T');
    expect(trigger?.className).toBe('lodariq-authoring-trigger');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    const openAuthoring = vi.spyOn(lodariq!, 'openAuthoring').mockResolvedValue(undefined);
    trigger?.click();
    expect(openAuthoring).toHaveBeenCalledTimes(1);
    openAuthoring.mockRestore();

    await lodariq?.playTour();
    expect(starts).toEqual([baseDocument.id]);

    await lodariq?.openAuthoring();
    const iframeUrl = new URL(
      document.querySelector('iframe[title="Lodariq authoring"]')?.getAttribute('src') ?? '',
    );
    expect(iframeUrl.pathname).toBe('/authoring.html');
    expect(iframeUrl.searchParams.get('lodariqFrame')).toBe('panel');
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.documentElement.hasAttribute('data-lodariq-authoring-panel-open')).toBe(true);
  });

  it('injects local authoring trigger styles with the host CSP nonce', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_trigger">';

    await installLocalLodariqAuthoringFromScript({
      baseDocument,
      script: localLoaderScript('development'),
      installOptions: fakeInstallOptions(),
    });

    expect(document.getElementById('lodariq-local-authoring-trigger-style')?.nonce).toBe(
      'nonce_local_trigger',
    );
  });

  it('rejects production configs instead of enabling local authoring', async () => {
    const fetchManifest = vi.fn();

    await expect(
      installLocalLodariqAuthoringFromScript({
        baseDocument,
        script: localLoaderScript('production'),
        installOptions: { fetchManifest },
      }),
    ).rejects.toThrow('Lodariq local authoring is only available in development or staging');
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
    loadRuntime: async () => ({ LodariqRuntime: FakeRuntime }) as never,
    loadTourRenderer: async () => ({ TourPlayer: FakeTourPlayer }) as never,
  };
}

function localLoaderScript(
  environment: 'development' | 'staging' | 'production',
): HTMLScriptElement {
  const script = document.createElement('script');
  script.dataset['workspace'] = 'wk_local_dev';
  script.dataset['env'] = environment;
  script.dataset['manifest'] = '/lodariq-local/manifest.json';
  return script;
}
