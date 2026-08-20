// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledDocument, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringDevFrame } from '@lodariq/sdk-authoring/local-dev/frame';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';
import { removeCreatorToolbar } from '@lodariq/sdk-authoring/creator-toolbar';
import { saveDocument } from '@lodariq/sdk-runtime/lodariq-local-dev';

const baseDocument = tourFixture as LodariqDocument;

describe('local-dev authoring install helper', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.Lodariq;
  });

  afterEach(() => {
    removeCreatorToolbar();
    window.dispatchEvent(new Event('pagehide'));
    window.history.replaceState({}, '', '/');
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
    expect(trigger?.textContent).toBe('LQ');
    expect(trigger?.className).toBe('lodariq-authoring-trigger');
    expect(trigger?.getAttribute('aria-label')).toBe('Open Lodariq actions');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    trigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(document.querySelector('[data-lodariq-authoring-drag-shield="true"]')).toBeNull();
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    const actionLabels = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-lodariq-launcher-action="true"]'),
    ].map((button) => button.getAttribute('aria-label'));
    expect(actionLabels).toEqual(['New experience', 'Experiences on this page', 'Preview as user']);
    document
      .querySelector<HTMLButtonElement>('[data-lodariq-launcher-action-id="experiences-on-page"]')
      ?.click();
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>(
          `[data-lodariq-experience-id="${baseDocument.id}"]`,
        ),
      ).toBeInstanceOf(HTMLButtonElement);
    });
    document
      .querySelector<HTMLButtonElement>(`[data-lodariq-experience-id="${baseDocument.id}"]`)
      ?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();
    });

    await lodariq?.playTour();
    expect(starts).toContain(baseDocument.id);
    const iframeUrl = new URL(
      document.querySelector('iframe[title="Lodariq authoring"]')?.getAttribute('src') ?? '',
    );
    expect(iframeUrl.pathname).toBe('/authoring.html');
    expect(iframeUrl.searchParams.get('lodariqFrame')).toBe('panel');
    expect(trigger?.dataset['lodariqAuthoringPanelExpanded']).toBe('true');
    expect(trigger?.getAttribute('aria-label')).toBe('Minimize Lodariq authoring');
    expect(document.documentElement.hasAttribute('data-lodariq-authoring-panel-open')).toBe(true);
  });

  it('creates a distinct draft from the launcher type picker', async () => {
    await installLocalLodariqAuthoringFromScript({
      baseDocument,
      script: localLoaderScript('development'),
      iframeSrc: '/authoring.html',
      installOptions: fakeInstallOptions(),
    });

    document.querySelector<HTMLButtonElement>('[data-lodariq-creator-toolbar="true"]')?.click();
    document
      .querySelector<HTMLButtonElement>('[data-lodariq-launcher-action-id="new-experience"]')
      ?.click();

    const typeChoices = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-lodariq-experience-type]'),
    ];
    expect(typeChoices.map((choice) => choice.dataset['lodariqExperienceType'])).toEqual([
      'tour',
      'announcement',
      'hotspot',
      'survey',
      'checklist',
    ]);
    expect(typeChoices[0]?.getAttribute('aria-label')).toBe('Create Tour');
    typeChoices[0]?.click();

    await vi.waitFor(() => {
      expect(
        Object.keys(localStorage).filter((key) => key.startsWith('lodariq:doc:doc_local_')),
      ).toHaveLength(1);
    });
    const documentKey = Object.keys(localStorage).find((key) =>
      key.startsWith('lodariq:doc:doc_local_'),
    );
    if (!documentKey) throw new Error('new local Tour was not saved');
    const createdDocument = JSON.parse(
      localStorage.getItem(documentKey) ?? '{}',
    ) as LodariqDocument;
    expect(createdDocument).toMatchObject({
      type: 'tour',
      status: 'draft',
      title: 'Untitled tour',
      targets: [],
    });
    expect(createdDocument.id).not.toBe(baseDocument.id);
    expect(createdDocument.blocks).toHaveLength(0);
    await vi.waitFor(() => {
      expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();
    });
  });

  it('injects local authoring trigger styles with the host CSP nonce', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_trigger">';

    await installLocalLodariqAuthoringFromScript({
      baseDocument,
      script: localLoaderScript('development'),
      installOptions: fakeInstallOptions(),
    });

    expect(document.getElementById('lodariq-creator-toolbar-style')?.nonce).toBe(
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

  it('boots the iframe with the selected local document and document-scoped session', async () => {
    const selectedDocument = {
      ...structuredClone(baseDocument),
      id: 'doc_selected_local',
      title: 'Selected local tour',
    };
    saveDocument(selectedDocument);
    window.history.replaceState(
      {},
      '',
      '/authoring.html?lodariqFrame=panel&lodariqDocument=doc_selected_local&lodariqSession=session_selected',
    );
    document.body.innerHTML = '<main id="authoring"></main>';
    const root = document.getElementById('authoring');
    if (!root) throw new Error('local authoring root missing');

    await mountLocalAuthoringDevFrame({ root, baseDocument });

    expect(document.body.textContent).toContain('Editing Selected local tour');
    // Panel mode renders the card; the filmstrip is host chrome, not frame content.
    expect(document.querySelector('[aria-label="Experience editor"]')).not.toBeNull();
  });

  it('boots the iframe from the provided base document before it has local draft storage', async () => {
    window.history.replaceState(
      {},
      '',
      `/authoring.html?lodariqFrame=panel&lodariqDocument=${baseDocument.id}`,
    );
    document.body.innerHTML = '<main id="authoring"></main>';
    const root = document.getElementById('authoring');
    if (!root) throw new Error('local authoring root missing');

    expect(localStorage.getItem(`lodariq:doc:${baseDocument.id}`)).toBeNull();
    await mountLocalAuthoringDevFrame({ root, baseDocument });

    expect(document.body.textContent).toContain(`Editing ${baseDocument.title}`);
    // Panel mode renders the card; the filmstrip is host chrome, not frame content.
    expect(document.querySelector('[aria-label="Experience editor"]')).not.toBeNull();
  });

  it('keeps the install entry free of static authoring-frame imports', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../sdk-authoring/src/local-dev/install.ts'),
      'utf8',
    );

    expect(source).not.toContain("from '../authoring'");
    expect(source).not.toContain("from '../authoring/local-frame'");
    expect(source).not.toContain("from './frame'");
    expect(source).toMatch(/await import\(\s*['"]\.\.\/authoring['"]\s*\)/);
  });
});

function fakeInstallOptions(starts: string[] = []) {
  class FakeRuntime {
    identify(): void {}
    track(): void {}
    reportError(): void {}
    trackTargetResolution(): void {}
    readTourResume(): null {
      return null;
    }
    writeTourResume(): void {}
    clearTourResume(): void {}
    canResumeTour(): boolean {
      return false;
    }
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
