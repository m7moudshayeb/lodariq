// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1, type LodariqDocument } from '@lodariq/schema';
import { createModePill } from '../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill';
import type { ModePillCallbacks } from '../../../../../packages/sdk-authoring/src/authoring/overlay/mode-pill.types';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  themeFreshness,
  themeHandleOf,
  themeIsStale,
} from '../../../../../packages/sdk-authoring/src/authoring/theme-staleness';

const HASH_A = `sha256-${'a'.repeat(64)}`;
const HASH_B = `sha256-${'b'.repeat(64)}`;

describe('theme snapshot staleness (§6.3)', () => {
  it('compares by content hash, not by version alone', () => {
    expect(
      themeFreshness({ version: 3, contentHash: HASH_A }, { version: 9, contentHash: HASH_A }),
    ).toBe('current');
    expect(
      themeFreshness({ version: 3, contentHash: HASH_A }, { version: 4, contentHash: HASH_B }),
    ).toBe('stale');
  });

  it('does not call a newer rendered snapshot stale', () => {
    // A frame that already adopted version 5 is not behind version 4.
    expect(
      themeFreshness({ version: 5, contentHash: HASH_B }, { version: 4, contentHash: HASH_A }),
    ).toBe('current');
  });

  it('says unknown rather than guessing when either side is missing', () => {
    expect(themeFreshness(null, { version: 1, contentHash: HASH_A })).toBe('unknown');
    expect(themeIsStale(null, null)).toBe(false);
    expect(themeHandleOf(null)).toBeNull();
  });
});

describe('the frame surfaces a theme change rather than staying silent (§6.3)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('reports staleness once the workspace theme moves, and clears it on reload', () => {
    const rendered = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const controller = createController(rendered);
    expect(controller.getSnapshot().themeStale).toBe(false);

    const moved = structuredClone(rendered);
    moved.version = rendered.version + 1;
    moved.contentHash = HASH_B;
    controller.noteWorkspaceTheme(moved);
    expect(controller.getSnapshot().themeStale).toBe(true);

    controller.reloadTheme();
    const snapshot = controller.getSnapshot();
    expect(snapshot.themeStale).toBe(false);
    expect(snapshot.previewTheme?.contentHash).toBe(HASH_B);
    // Adopting is deliberate, so it says so.
    expect(snapshot.status).toContain('Theme reloaded');
  });

  it('does not re-render under the creator’s hands', () => {
    const rendered = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const controller = createController(rendered);
    const moved = structuredClone(rendered);
    moved.contentHash = HASH_B;
    moved.version = rendered.version + 1;

    controller.noteWorkspaceTheme(moved);

    // Still the theme the creator has been looking at, until they choose.
    expect(controller.getSnapshot().previewTheme?.contentHash).toBe(rendered.contentHash);
  });
});

describe('draft-diverged state on the environment chip (§8.2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a dot with a name, never a bare colour', () => {
    const pill = createModePill(document, callbacks());
    document.body.append(pill.element);

    expect(pill.element.querySelector('[data-pill-diverged]')).toBeNull();

    pill.setState({ draftDiverged: true });
    const dot = pill.element.querySelector('[data-pill-diverged]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('aria-label')).toContain('Unpublished changes');
    // The environment word stays: the dot never replaces it.
    expect(pill.element.querySelector('.overlay-mode-pill-env')?.textContent).toContain('Staging');

    pill.setState({ draftDiverged: false });
    expect(pill.element.querySelector('[data-pill-diverged]')).toBeNull();
    pill.destroy();
  });
});

function callbacks(): ModePillCallbacks {
  return {
    onModeChange: () => undefined,
    onPreview: () => undefined,
    onOpenOperations: () => undefined,
    onToggleAllPanels: () => undefined,
    onRetrySave: () => undefined,
    onExitAuthoring: () => undefined,
    onSwitchExperience: () => undefined,
    onEnvironmentChange: () => undefined,
    onToggleRecording: () => undefined,
    onCanvasZoom: () => undefined,
    onKeyboardMap: () => undefined,
    onCommandPalette: () => undefined,
    onRestart: () => undefined,
  };
}

function createController(
  previewTheme: typeof LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: emptyDocument(),
    previewTheme,
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
    },
    sessionId: 'session_theme',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function emptyDocument(): LodariqDocument {
  return {
    id: 'doc_theme',
    workspaceId: 'wk_theme',
    type: 'tour',
    status: 'draft',
    title: 'Theme',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [],
  };
}
