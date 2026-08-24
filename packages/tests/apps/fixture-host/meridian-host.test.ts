// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Meridian's URL is its entire state, so a reload resumes exactly. That only
 * holds if the paint subscribes to the router rather than to DOM events:
 * `history.pushState` fires neither `hashchange` nor `popstate`, so an app that
 * listens for those has a URL that moves while the screen does not.
 */
async function mountMeridian(hash: string): Promise<HTMLElement> {
  window.history.replaceState(null, '', hash);
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const [{ renderApp }] = await Promise.all([import('../../../../apps/fixture-host/src/app')]);
  renderApp(root);
  return root;
}

describe('Meridian host', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders the route named by the URL', async () => {
    const root = await mountMeridian('#/reports/adoption');
    expect(root.textContent).toContain('Adoption');
    expect(window.location.hash).toContain('/reports/adoption');
  });

  it('repaints when an in-app control changes the URL', async () => {
    const root = await mountMeridian('#/projects/all');
    const namesBefore = rowNames(root);

    root.querySelector<HTMLButtonElement>('[data-sort="name"]')!.click();

    expect(window.location.hash).toContain('sort=name');
    const namesAfter = rowNames(root);
    expect(namesAfter).not.toEqual(namesBefore);
    expect([...namesAfter].sort((left, right) => left.localeCompare(right))).toEqual(namesAfter);
  });

  it('replaces the target node when the fixture asks it to', async () => {
    const root = await mountMeridian('#/projects/all');
    expect(root.querySelector('[data-render]')?.getAttribute('data-render')).toBe('1');
    root.querySelector<HTMLButtonElement>('[data-bump-render]')!.click();
    expect(root.querySelector('[data-render]')?.getAttribute('data-render')).toBe('2');
  });

  it('keeps an open menu in the URL, so a reload brings it back', async () => {
    const root = await mountMeridian('#/projects/all');
    root.querySelector<HTMLButtonElement>('[data-open-pop="import"]')!.click();
    expect(window.location.hash).toContain('pop=import');
    expect(root.querySelector('[role="menu"]')).not.toBeNull();

    const reloaded = await mountMeridian(window.location.hash);
    expect(reloaded.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('changes the labels but not the intent when the locale switches', async () => {
    const root = await mountMeridian('#/projects/all');
    const action = () => root.querySelector('.reliability-stage article button')!.textContent!.trim();
    expect(action()).toBe('Create project');

    root.querySelector<HTMLButtonElement>('[data-toggle-locale]')!.click();
    expect(window.location.hash).toContain('locale=de');
    expect(action()).not.toBe('Create project');
    expect(document.documentElement.lang).toBe('de');
  });
});

function rowNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll('tbody tr th[scope="row"]')].map(
    (cell) => cell.textContent?.trim() ?? '',
  );
}
