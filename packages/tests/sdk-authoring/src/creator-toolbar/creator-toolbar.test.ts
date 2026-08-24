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
    ]);

    removeCreatorToolbar();
    installCreatorToolbar({
      onCreateExperience: vi.fn(),
      listExperiences: vi.fn().mockReturnValue([]),
      onOpenExperience: vi.fn(),
    });

    expect(CREATOR_LAUNCHER_ACTIONS).toEqual([
      { capability: 'create', icon: 'plus', id: 'new-experience', label: 'New experience' },
      {
        capability: 'list',
        icon: 'list',
        id: 'experiences-on-page',
        label: 'View experiences',
      },
    ]);
    expect(actionButtons().map((action) => action.dataset['lodariqLauncherActionId'])).toEqual([
      'new-experience',
      'experiences-on-page',
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
        label: 'View experiences',
        text: '',
        tooltip: 'View experiences',
      },
    ]);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(2);
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
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('false');
    expect(creatorLauncher()?.dataset['lodariqPaletteDismissed']).toBe('true');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
  });

  it('pins on center activation and names a Tour before creating it', async () => {
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
    const menu = await experienceMenu();
    expect(menu.hidden).toBe(false);
    expect(launcherAction('new-experience').getAttribute('aria-expanded')).toBe('true');
    expect(menu.textContent).toContain('New experience');
    expect(menu.textContent).toContain('Tour');
    expect(menu.textContent).toContain('Guide people through a short sequence on this page.');

    menu.querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')?.click();

    // The type is chosen; the name comes before the document exists.
    const dialog = await vi.waitFor(experienceDialog);
    const input = dialog.querySelector('input');
    expect(input?.value).toBe('Untitled Tour');
    if (input) input.value = 'Checkout tour';
    dialog.querySelector<HTMLButtonElement>('[data-lodariq-experience-dialog-confirm]')?.click();

    await vi.waitFor(() =>
      expect(onCreateExperience).toHaveBeenCalledWith('tour', { title: 'Checkout tour' }),
    );
    await vi.waitFor(() => expect(menu.hidden).toBe(true));
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(launcher.dataset['lodariqPaletteDismissed']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the type list open when the name is cancelled, so the choice is not lost', async () => {
    const onCreateExperience = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ onCreateExperience });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('new-experience').click();

    const menu = await experienceMenu();
    menu.querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')?.click();
    const dialog = await vi.waitFor(experienceDialog);
    dialog.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => expect(experienceDialogOrNull()).toBeNull());
    expect(onCreateExperience).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(false);
  });

  it('refuses an empty name rather than creating an untitled document', async () => {
    const onCreateExperience = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ onCreateExperience });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('new-experience').click();
    (await experienceMenu())
      .querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')
      ?.click();

    const dialog = await vi.waitFor(experienceDialog);
    const input = dialog.querySelector('input');
    if (input) input.value = '   ';
    dialog.querySelector<HTMLButtonElement>('[data-lodariq-experience-dialog-confirm]')?.click();

    expect(onCreateExperience).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('Give this experience a name.');
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

  it('lists an experience and dismisses the launcher after opening it', async () => {
    const listExperiences = vi.fn(({ scope }: { scope: string }) =>
      scope === 'page'
        ? [
            { id: 'doc_welcome', title: 'Welcome tour', type: 'tour' as const },
            { id: 'doc_activation', title: 'Activation tour', type: 'tour' as const },
          ]
        : [],
    );
    const onOpenExperience = vi.fn().mockResolvedValue(undefined);
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ listExperiences, onOpenExperience });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('experiences-on-page').click();

    // The loading frame is not asserted here: waiting for the menu's own chunk
    // already outlasts it. The status sequence is covered in paging.test.ts.
    const menu = await experienceMenu();
    // Asked for a page, not for everything: the menu never holds the full list.
    expect(listExperiences).toHaveBeenCalledWith({ limit: 10, scope: 'page' });
    await vi.waitFor(() => expect(menu.textContent).toContain('Activation tour'));
    menu.querySelector<HTMLButtonElement>('[data-lodariq-experience-id="doc_activation"]')?.click();

    await vi.waitFor(() => expect(onOpenExperience).toHaveBeenCalledWith('doc_activation'));
    await vi.waitFor(() => expect(menu.hidden).toBe(true));
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('false');
    expect(creatorLauncher()?.dataset['lodariqPaletteDismissed']).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('pages a cursor host ten at a time and searches through the host, not the menu', async () => {
    const all = Array.from({ length: 24 }, (_, index) => ({
      id: `doc_${index}`,
      title: `Tour ${index}`,
      type: 'tour' as const,
    }));
    const listExperiences = vi.fn(
      ({
        cursor,
        limit,
        query,
        scope,
      }: {
        cursor?: string;
        limit: number;
        query?: string;
        scope: string;
      }) => {
        if (scope !== 'page') return { items: [], total: 0 };
        const matching = query
          ? all.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
          : all;
        const start = Number(cursor ?? '0');
        const end = start + limit;
        return {
          items: matching.slice(start, end),
          total: matching.length,
          ...(end < matching.length ? { nextCursor: String(end) } : {}),
        };
      },
    );
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      listExperiences,
      onOpenExperience: vi.fn(),
    });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('experiences-on-page').click();

    const menu = await experienceMenu();
    // Ten at a time, each page asked for with the cursor the last one returned.
    // jsdom lays nothing out, so the scroll container measures as unfilled and
    // the list keeps topping itself up — which is the behaviour being checked;
    // in a laid-out browser the same guard stops after the first page.
    await vi.waitFor(() => expect(experienceRows(menu)).toHaveLength(24));
    // Each scope carries its own cursor: "All tours" is asked once, and the
    // offsets that follow all belong to the list that is actually open.
    expect(listExperiences.mock.calls.map(([query]) => query)).toEqual([
      { limit: 10, scope: 'page' },
      { limit: 10, scope: 'all' },
      { cursor: '10', limit: 10, scope: 'page' },
      { cursor: '20', limit: 10, scope: 'page' },
    ]);

    const search = menu.querySelector('input');
    if (!search) throw new Error('search field missing');
    search.value = 'Tour 21';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() =>
      expect(listExperiences).toHaveBeenCalledWith({ limit: 10, query: 'Tour 21', scope: 'page' }),
    );
    // Both scopes, from one field: a creator searching by name does not know
    // which of the two lists the tour is in, which is the reason to search.
    expect(listExperiences).toHaveBeenCalledWith({ limit: 10, query: 'Tour 21', scope: 'all' });
    await vi.waitFor(() => expect(experienceRows(menu)).toHaveLength(1));
  });

  it('stacks the page above the whole workspace, with the second collapsed and counted', async () => {
    const here = {
      id: 'doc_here',
      title: 'Welcome tour',
      type: 'tour' as const,
      routeKey: '/inbox',
    };
    const listExperiences = vi.fn(({ scope }: { scope: string }) =>
      scope === 'page'
        ? { items: [here], total: 1 }
        : {
            items: [
              here,
              {
                id: 'doc_billing',
                title: 'Invoice tour',
                type: 'tour' as const,
                routeKey: '/billing',
              },
              {
                id: 'doc_reports',
                title: 'Reports tour',
                type: 'tour' as const,
                routeKey: '/reports#monthly',
              },
            ],
            total: 7,
          },
    );
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({ listExperiences, onOpenExperience: vi.fn() });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('experiences-on-page').click();

    const menu = await experienceMenu();
    await vi.waitFor(() => expect(scopeHeads(menu)).toHaveLength(2));
    const [onPage, elsewhere] = scopeHeads(menu);
    if (!onPage || !elsewhere) throw new Error('scope headers missing');

    expect(scopeHeads(menu).map((head) => head.dataset['experienceScopeHead'])).toEqual([
      'page',
      'all',
    ]);
    expect(onPage.textContent).toContain('On this page');
    expect(elsewhere.textContent).toContain('All tours');
    expect(onPage.getAttribute('aria-expanded')).toBe('true');
    expect(elsewhere.getAttribute('aria-expanded')).toBe('false');

    // The count is what makes a collapsed section worth leaving collapsed: it
    // is the host's total, not the page of rows the menu happens to hold.
    await vi.waitFor(() => expect(scopeCount(elsewhere)).toBe('7'));
    expect(scopeCount(onPage)).toBe('1');

    const elsewhereList = scopeList(menu, elsewhere);
    expect(elsewhereList.hidden).toBe(true);
    expect(elsewhere.getAttribute('aria-controls')).toBe(elsewhereList.id);
    // Loaded while collapsed, and only the one page the count came from.
    expect(listExperiences.mock.calls.filter(([query]) => query.scope === 'all')).toHaveLength(1);

    // The same tour in both lists, on purpose: the first is a shortcut to what
    // is under the creator's cursor, not a slice taken out of the second.
    expect(
      scopeList(menu, onPage).querySelector('[data-lodariq-experience-id="doc_here"]'),
    ).not.toBeNull();
    expect(elsewhereList.querySelector('[data-lodariq-experience-id="doc_here"]')).not.toBeNull();

    // Every row of the second list says which page it belongs to, including the
    // repeated one. No row in the first does — they are all on this page.
    expect(scopeList(menu, onPage).querySelector('small')).toBeNull();
    expect(
      [...elsewhereList.querySelectorAll('small')].map((node) => [
        node.textContent,
        node.getAttribute('dir'),
      ]),
    ).toEqual([
      ['/inbox', 'ltr'],
      ['/billing', 'ltr'],
      ['/reports#monthly', 'ltr'],
    ]);
    expect(
      elsewhereList
        .querySelector('[data-lodariq-experience-id="doc_billing"]')
        ?.getAttribute('aria-label'),
    ).toBe('Open Invoice tour on /billing');

    elsewhere.click();
    expect(elsewhere.getAttribute('aria-expanded')).toBe('true');
    expect(elsewhereList.hidden).toBe(false);
  });

  it('invites a first experience when this page has none, and says so differently for the workspace', async () => {
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      onCreateExperience: vi.fn(),
      listExperiences: vi.fn().mockReturnValue([]),
      onOpenExperience: vi.fn(),
    });
    if (!button) throw new Error('creator launcher missing');
    button.click();
    launcherAction('experiences-on-page').click();

    const menu = await experienceMenu();
    await vi.waitFor(() => expect(scopeHeads(menu)).toHaveLength(2));
    const [onPage, elsewhere] = scopeHeads(menu);
    if (!onPage || !elsewhere) throw new Error('scope headers missing');

    await vi.waitFor(() =>
      expect(scopeList(menu, onPage).textContent).toContain('No experiences on this page yet.'),
    );
    // A different sentence, and no second offer: the row above has already made
    // it, and an empty workspace is a fact rather than a state to get out of.
    expect(scopeList(menu, elsewhere).textContent).toContain(
      'No experiences in this workspace yet.',
    );
    expect(scopeList(menu, elsewhere).querySelector('button')).toBeNull();

    // The empty page is where every creator starts, so it offers the way out.
    const invite = scopeList(menu, onPage).querySelector('button');
    expect(invite?.textContent).toBe('New experience');
    invite?.click();
    await vi.waitFor(() =>
      expect(menu.querySelectorAll('[data-lodariq-experience-type]').length).toBe(5),
    );
  });

  it('offers no preview from the launcher, which has nothing selected to preview', () => {
    window.Lodariq = fakeApi({ enabled: true });

    const button = installCreatorToolbar({
      onCreateExperience: vi.fn(),
      listExperiences: vi.fn(),
      onOpenExperience: vi.fn(),
    });
    button?.click();

    expect(
      document.querySelector('[data-lodariq-launcher-action-id="preview-as-user"]'),
    ).toBeNull();
    expect(actionButtons().map((action) => action.dataset['lodariqLauncherActionId'])).toEqual([
      'new-experience',
      'experiences-on-page',
    ]);
  });

  it('backs out of the submenu with Escape before it dismisses the launcher', async () => {
    window.Lodariq = fakeApi({ enabled: true });
    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');

    button.click();
    const action = launcherAction('new-experience');
    action.click();
    const menu = await experienceMenu();
    expect(menu.hidden).toBe(false);

    menu
      .querySelector<HTMLButtonElement>('[data-lodariq-experience-type="tour"]')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
      );

    // One level, not both: the palette that opened the submenu is still there.
    expect(menu.hidden).toBe(true);
    expect(action.getAttribute('aria-expanded')).toBe('false');
    expect(action).toBe(document.activeElement);
    expect(launcher.dataset['lodariqPinned']).toBe('true');

    launcher.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    );
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(launcher.dataset['lodariqPaletteDismissed']).toBe('true');
    expect(button).toBe(document.activeElement);
  });

  it('closes pinned surfaces with an outside pointer action', async () => {
    window.Lodariq = fakeApi({ enabled: true });
    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    const launcher = creatorLauncher();
    if (!button || !launcher) throw new Error('creator launcher missing');

    button.click();
    launcherAction('new-experience').click();
    const menu = await experienceMenu();
    expect(menu.hidden).toBe(false);

    // A click inside the submenu is not a click away from the launcher, even
    // though the submenu is mounted outside it.
    menu.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(false);
    expect(launcher.dataset['lodariqPinned']).toBe('true');

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(menu.hidden).toBe(true);
    expect(launcher.dataset['lodariqPinned']).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    launcher.dispatchEvent(new MouseEvent('mouseenter'));
    expect(launcher.dataset['lodariqPaletteDismissed']).toBeUndefined();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(launcher.dataset['lodariqPaletteDismissed']).toBe('true');
  });

  it('opens the submenu on hover, because both rows name a category', async () => {
    window.Lodariq = fakeApi({ enabled: true });
    const button = installCreatorToolbar({ onCreateExperience: vi.fn() });
    if (!button) throw new Error('creator launcher missing');

    const action = launcherAction('new-experience');
    const wrapper = action.closest<HTMLElement>('[data-lodariq-launcher-action-wrap="true"]');
    wrapper?.dispatchEvent(new MouseEvent('mouseenter'));

    expect((await experienceMenu()).hidden).toBe(false);
    expect(action.getAttribute('aria-haspopup')).toBe('true');
    expect(creatorLauncher()?.dataset['lodariqPinned']).toBe('true');
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
      listExperiences: vi.fn().mockReturnValue([]),
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
    expect(launcherAction('edit-current-experience')).toBeInstanceOf(HTMLButtonElement);
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

  it('dispatches an error event when a launcher action fails', async () => {
    const error = new Error('expired session');
    const openAuthoring = vi.fn().mockRejectedValue(error);
    window.Lodariq = fakeApi({ enabled: true, openAuthoring });
    const listener = vi.fn();
    window.addEventListener('lodariq:authoring-error', listener);

    installCreatorToolbar();
    launcherAction('edit-current-experience').click();
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

/**
 * The menu is imported on demand, so it does not exist in the tick a hover or a
 * click happens in. Every read of it waits for the chunk.
 */
async function experienceMenu(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const menu = document.querySelector<HTMLElement>('[data-lodariq-experience-menu="true"]');
    if (!menu) throw new Error('experience menu missing');
    return menu;
  });
}

function experienceRows(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[data-lodariq-experience-id]')];
}

function scopeHeads(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[data-experience-scope-head]')];
}

function scopeCount(head: HTMLElement): string {
  return head.querySelector('.lodariq-experience-menu-scope-count')?.textContent ?? '';
}

function scopeList(menu: HTMLElement, head: HTMLElement): HTMLElement {
  const list = menu.querySelector<HTMLElement>(`#${head.getAttribute('aria-controls') ?? ''}`);
  if (!list) throw new Error('scope list missing');
  return list;
}

function experienceDialogOrNull(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-lodariq-experience-dialog-scrim="true"]');
}

function experienceDialog(): HTMLElement {
  const dialog = experienceDialogOrNull();
  if (!dialog) throw new Error('experience dialog missing');
  return dialog;
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
