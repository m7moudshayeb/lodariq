// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CREATOR_LAUNCHER_ACTIONS,
  installCreatorToolbar,
  removeCreatorToolbar,
} from '@lodariq/sdk-authoring/creator-toolbar';
import type { LodariqBrowserApi } from '@lodariq/sdk-runtime/lodariq-loader';

describe('creator toolbar', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.Lodariq;
  });

  afterEach(() => {
    removeCreatorToolbar();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not render without the gated Lodariq browser API', () => {
    expect(installCreatorToolbar()).toBeNull();
    expect(document.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('removes a stale toolbar when authoring is disabled', () => {
    const stale = document.createElement('button');
    stale.dataset['lodariqCreatorToolbar'] = 'true';
    document.body.appendChild(stale);
    window.Lodariq = fakeApi({ enabled: false });

    expect(installCreatorToolbar()).toBeNull();
    expect(document.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('renders stable capability-gated icon actions with accessible tooltips', () => {
    window.Lodariq = fakeApi({ enabled: true });

    installCreatorToolbar();

    expect(actionButtons().map((action) => action.dataset['lodariqLauncherActionId'])).toEqual([
      'edit-current-experience',
      'preview-as-user',
    ]);

    removeCreatorToolbar();
    installCreatorToolbar({
      onCreateExperience: vi.fn(),
      listExperiencesForPage: vi.fn().mockReturnValue([]),
      onOpenExperience: vi.fn(),
    });

    expect(CREATOR_LAUNCHER_ACTIONS).toEqual([
      { capability: 'create', icon: 'plus', id: 'new-experience', label: 'New experience' },
      {
        capability: 'list',
        icon: 'list',
        id: 'experiences-on-page',
        label: 'Experiences on this page',
      },
      { capability: 'preview', icon: 'eye', id: 'preview-as-user', label: 'Preview as user' },
    ]);
    expect(actionButtons().map((action) => action.dataset['lodariqLauncherActionId'])).toEqual([
      'new-experience',
      'experiences-on-page',
      'preview-as-user',
    ]);
    expect(
      actionButtons().map((action) => ({
        iconHidden: action.querySelector('svg')?.getAttribute('aria-hidden'),
        label: action.getAttribute('aria-label'),
        text: action.textContent,
        tooltip: document.getElementById(action.getAttribute('aria-describedby') ?? '')
          ?.textContent,
      })),
    ).toEqual([
      { iconHidden: 'true', label: 'New experience', text: '', tooltip: 'New experience' },
      {
        iconHidden: 'true',
        label: 'Experiences on this page',
        text: '',
        tooltip: 'Experiences on this page',
      },
      { iconHidden: 'true', label: 'Preview as user', text: '', tooltip: 'Preview as user' },
    ]);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(3);
    expect(
      document.querySelector('[data-lodariq-launcher-action-id="edit-current-experience"]'),
    ).toBeNull();
  });

  it('keeps hosted installs able to edit the current experience as a compatibility fallback', async () => {
    const openAuthoring = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true, openAuthoring });

    const button = installCreatorToolbar();
    button?.click();
    launcherAction('edit-current-experience').click();

    await vi.waitFor(() => expect(openAuthoring).toHaveBeenCalledTimes(1));
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('true');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
  });

  it('pins on center activation and creates a Tour from a compact chooser', async () => {
    const onCreateExperience = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ onCreateExperience });
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');

    button.click();
    launcher.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(launcher.dataset['lodariqPinned']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    launcherAction('new-experience').click();
    const surface = launcherSurface();
    expect(surface.hidden).toBe(false);
    expect(surface.dataset['lodariqLauncherSurfaceKind']).toBe('new-experience');
    expect(surface.textContent).toContain('New experience');
    expect(surface.textContent).toContain('Tour');
    expect(surface.textContent).toContain('Guide people through a short sequence on this page.');

    surface.querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')?.click();
    await vi.waitFor(() => expect(onCreateExperience).toHaveBeenCalledWith('tour'));
    await vi.waitFor(() => expect(surface.hidden).toBe(true));
    expect(launcher.dataset['lodariqPinned']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('reveals on hover without converting hover into persistent pinned state', () => {
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    const launcher = creatorLauncher();
    if (!launcher || !button) throw new Error('creator launcher missing');

    launcher.dispatchEvent(new MouseEvent('mouseenter'));
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    launcher.dispatchEvent(new MouseEvent('mouseleave'));

    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('lists and opens experiences on the current page without unpinning', async () => {
    const listExperiencesForPage = vi.fn().mockResolvedValue([
      { id: 'doc_welcome', title: 'Welcome tour', type: 'tour' as const },
      { id: 'doc_activation', title: 'Activation tour', type: 'tour' as const },
    ]);
    const onOpenExperience = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ listExperiencesForPage, onOpenExperience });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('experiences-on-page').click();

    const surface = launcherSurface();
    expect(surface.textContent).toContain('Loading experiences…');
    await vi.waitFor(() => expect(surface.textContent).toContain('Activation tour'));
    surface
      .querySelector<HTMLButtonElement>('[data-lodariq-experience-id="doc_activation"]')
      ?.click();

    await vi.waitFor(() => expect(onOpenExperience).toHaveBeenCalledWith('doc_activation'));
    await vi.waitFor(() => expect(surface.hidden).toBe(true));
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('uses an optional preview callback and leaves the action dock pinned', async () => {
    const playTour = vi.fn().mockResolvedValue(undefined);
    const onPreview = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true, playTour });

    const button = installCreatorToolbar({ onPreview });
    button?.click();
    launcherAction('preview-as-user').click();

    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
    expect(playTour).not.toHaveBeenCalled();
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('true');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes pinned surfaces with Escape or an outside pointer action', () => {
    window.Lodariq = fakeApi({ enabled: true });
    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');

    button.click();
    launcherAction('new-experience').click();
    const surface = launcherSurface();
    surface
      .querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
      );

    expect(surface.hidden).toBe(true);
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(launcher.dataset['lodariqPaletteDismissed']).toBe('true');
    expect(button).toBe(document.activeElement);

    button.click();
    launcherAction('new-experience').click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(surface.hidden).toBe(true);
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('places actions after the launcher in keyboard order', () => {
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    const firstAction = launcherAction('new-experience');
    if (!button) throw new Error('creator launcher missing');

    expect(button.compareDocumentPosition(firstAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('hands Tab focus through pinned actions and reverses with Shift+Tab', () => {
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      onCreateExperience: vi.fn(),
      listExperiencesForPage: vi.fn().mockReturnValue([]),
      onOpenExperience: vi.fn(),
    });
    const firstAction = launcherAction('new-experience');
    const secondAction = launcherAction('experiences-on-page');
    if (!button) throw new Error('creator launcher missing');

    button.focus();
    button.click();
    button.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }),
    );
    expect(document.activeElement).toBe(firstAction);

    firstAction.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }),
    );
    expect(document.activeElement).toBe(secondAction);

    secondAction.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
        shiftKey: true,
      }),
    );
    expect(document.activeElement).toBe(firstAction);

    firstAction.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
        shiftKey: true,
      }),
    );
    expect(document.activeElement).toBe(button);
  });

  it('flips and aligns the action dock when keyboard movement nears an edge', () => {
    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 240);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar();
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');

    vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue({
      bottom: 70,
      height: 52,
      left: 18,
      right: 70,
      top: 18,
      width: 52,
      x: 18,
      y: 18,
      toJSON: () => ({}),
    });
    button.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }),
    );

    expect(launcher.dataset['lodariqPaletteBelow']).toBe('true');
    expect(launcher.dataset['lodariqPaletteAlignLeft']).toBe('true');
  });

  it('keeps the dock reachable while the launcher center minimizes or restores the panel', () => {
    window.Lodariq = fakeApi({ enabled: true });
    const panelToggle = vi.fn();
    window.addEventListener('lodariq-authoring-panel-toggle', panelToggle);

    const button = installCreatorToolbar();
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');
    launcher.dataset['lodariqAuthoringPanelState'] = 'open';
    button.click();

    expect(panelToggle).toHaveBeenCalledTimes(1);
    expect(launcher.dataset['lodariqPinned']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(launcherAction('preview-as-user')).toBeInstanceOf(HTMLButtonElement);
    window.removeEventListener('lodariq-authoring-panel-toggle', panelToggle);
  });

  it('injects toolbar styles with the host CSP nonce', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_toolbar">';
    window.Lodariq = fakeApi({ enabled: true });

    installCreatorToolbar();

    const style = document.getElementById('lodariq-creator-toolbar-style');
    expect(style?.nonce).toBe('nonce_toolbar');
    expect(style?.textContent).toContain('data-lodariq-creator-toolbar');
    expect(style?.textContent).toContain('data-lodariq-launcher-tooltip');
  });

  it('supports custom container, label, aria label, and class', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      container,
      label: 'Author',
      ariaLabel: 'Open authoring mode',
      className: 'custom-toolbar',
    });

    expect(button?.parentElement?.parentElement).toBe(container);
    expect(button?.textContent).toBe('Author');
    expect(button?.getAttribute('aria-label')).toBe('Open authoring mode');
    expect(button?.className).toBe('custom-toolbar');

    removeCreatorToolbar(container);
    expect(container.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('dispatches an error event when preview fails', async () => {
    const error = new Error('expired session');
    const onPreview = vi.fn().mockRejectedValue(error);
    window.Lodariq = fakeApi({ enabled: true });
    const listener = vi.fn();
    window.addEventListener('lodariq:authoring-error', listener);

    installCreatorToolbar({ onPreview });
    launcherAction('preview-as-user').click();
    await vi.waitFor(() =>
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { error },
        }),
      ),
    );
    window.removeEventListener('lodariq:authoring-error', listener);
  });
});

function creatorLauncher(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lodariq-creator-launcher="true"]');
}

function launcherSurface(): HTMLElement {
  const surface = document.querySelector<HTMLElement>('[data-lodariq-launcher-surface="true"]');
  if (!surface) throw new Error('creator launcher surface missing');
  return surface;
}

function launcherAction(actionId: string): HTMLButtonElement {
  const action = document.querySelector<HTMLButtonElement>(
    `[data-lodariq-launcher-action-id="${actionId}"]`,
  );
  if (!action) throw new Error(`creator launcher action missing: ${actionId}`);
  return action;
}

function actionButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-lodariq-launcher-action="true"]')];
}

function fakeApi({
  enabled,
  iframeSrc,
  openAuthoring = vi.fn().mockResolvedValue(undefined),
  playTour = vi.fn().mockResolvedValue(undefined),
}: {
  enabled: boolean;
  iframeSrc?: string;
  openAuthoring?: LodariqBrowserApi['openAuthoring'];
  playTour?: LodariqBrowserApi['playTour'];
}): LodariqBrowserApi {
  return {
    manifest: {
      documentId: 'doc_tour_welcome',
      currentVersion: 'sha256-live',
    },
    authoring: {
      enabled,
      ...(iframeSrc ? { iframeSrc } : {}),
    },
    identify: vi.fn(),
    track: vi.fn(),
    playTour,
    openAuthoring,
    stopTour: vi.fn(),
  };
}
