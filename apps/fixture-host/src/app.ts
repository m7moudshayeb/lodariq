/**
 * Meridian — the fixture product Lodariq authors against.
 *
 * Every screen renders from the URL, so a full reload resumes exactly: same
 * route, same section, same open menu or dialog, same locale, same layout.
 * Resolver stress lives in the markup itself — repeated labels, marker-free
 * controls, an async list, a scroll container and transient layers.
 */
import { COPY, PROJECTS } from './data';
import { renderDrawer, renderModal, renderPop } from './layers';
import {
  DEFAULT_SECTION,
  ROUTES,
  getState,
  navigate,
  startRouter,
  subscribe,
  type HostState,
  type RouteId,
} from './router';
import { icon } from './icons';
import { SECTIONS, renderRoute } from './views';

const esc = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

let listTimer: ReturnType<typeof setTimeout> | undefined;

export function renderApp(root: HTMLElement): void {
  const paint = (state: HostState): void => {
    root.innerHTML = shell(state);
    wire(root);
    populateList(root);
    positionPop(root);
    document.documentElement.lang = state.locale;
  };
  // The router is the only source of truth, so the paint subscribes to it
  // rather than to DOM events: `pushState` fires neither `hashchange` nor
  // `popstate`, so listening for those leaves every in-app action dead.
  subscribe(paint);
  startRouter();
  paint(getState());
}

function shell(state: HostState): string {
  const t = COPY[state.locale];
  const sections = SECTIONS[state.route] ?? [];
  return `
  <div class="app">
    <header class="topbar">
      <a class="brand" href="#/dashboard/overview" aria-label="Meridian home"><span class="mark">${icon('layers', 14)}</span>Meridian</a>
      <nav aria-label="Primary">
        ${ROUTES.map(
          (route) => `<a href="#/${route}/${DEFAULT_SECTION[route]}" data-route="${route}"
            class="${state.route === route ? 'on' : ''}"
            ${state.route === route ? 'aria-current="page"' : ''}>${esc(t[route] ?? route)}</a>`,
        ).join('')}
      </nav>
      <span class="grow"></span>
      <div class="search" role="search"><label class="sr-only" for="q">Search Meridian</label>
        ${icon('search', 14)}<input id="q" type="search" placeholder="Search Meridian"><kbd>⌘K</kbd></div>
      <button type="button" class="icon-btn" data-open-pop="notify" aria-haspopup="menu"
        aria-expanded="${state.pop === 'notify'}" aria-label="Notifications">${icon('bell', 17)}<i class="badge"></i></button>
      <button type="button" class="icon-btn" aria-label="Help">${icon('help', 17)}</button>
      <button type="button" class="avatar" data-open-pop="account" aria-haspopup="menu"
        aria-expanded="${state.pop === 'account'}" aria-label="Your account">MS</button>
    </header>
    <div class="body">
      <nav class="sidebar" aria-label="${esc(t[state.route] ?? state.route)} sections">
        <p class="side-head">${esc(t[state.route] ?? state.route)}</p>
        ${sections
          .map(
            ([id, label, glyph, count]) => `<a href="#/${state.route}/${id}" data-section="${id}"
              class="${state.section === id ? 'on' : ''}"
              ${state.section === id ? 'aria-current="true"' : ''}>${icon(glyph, 15)}<span>${esc(label)}</span>
              ${count == null ? '' : `<span class="count">${count}</span>`}</a>`,
          )
          .join('')}
        <span class="grow"></span>
        <p class="side-head">Workspace</p>
        <a href="#/billing/plan">${icon('gauge', 15)}<span>Usage</span><span class="count">62%</span></a>
      </nav>
      <main class="main" id="main">${renderRoute(state)}</main>
    </div>
    ${renderPop(state)}
    ${renderDrawer(state)}
    ${renderModal(state)}
  </div>`;
}

function wire(root: HTMLElement): void {
  const on = (selector: string, handler: (el: HTMLElement, event: Event) => void): void => {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      el.addEventListener('click', (event) => handler(el, event));
    });
  };

  on('[data-open-pop]', (el, event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = el.dataset['openPop'] ?? null;
    navigate({ pop: getState().pop === next ? null : next });
  });
  on('[data-open-modal]', (el, event) => {
    event.preventDefault();
    event.stopPropagation();
    navigate({ modal: el.dataset['openModal'] ?? null, pop: null });
  });
  on('[data-close-modal]', (_el, event) => {
    event.preventDefault();
    navigate({ modal: null });
  });
  on('[data-open-drawer]', (_el, event) => {
    event.preventDefault();
    navigate({ drawer: true });
  });
  on('[data-close-drawer]', (_el, event) => {
    event.preventDefault();
    navigate({ drawer: false });
  });
  on('[data-sort]', (el) => {
    const sort = el.dataset['sort'];
    if (sort === 'name' || sort === 'owner' || sort === 'updated') navigate({ sort });
  });
  on('[data-toggle-locale]', () => navigate({ locale: getState().locale === 'en' ? 'de' : 'en' }));
  on('[data-toggle-reflow]', () => navigate({ reflow: !getState().reflow }));
  on('[data-bump-render]', () => navigate({ render: getState().render + 1 }));

  // Anchors carry the route, so the URL stays the only source of truth.
  root.querySelectorAll<HTMLAnchorElement>('a[href^="#/"]').forEach((anchor) => {
    anchor.addEventListener('click', () => {
      requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('lodariq-host:navigate')));
    });
  });

  // Clicking away closes a menu, the way a real product does.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const state = getState();
      if (!state.pop) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('.pop') || target?.closest('[data-open-pop]')) return;
      navigate({ pop: null });
    },
    { once: true },
  );
}

/** Anchors the open menu under whatever opened it, after layout settles. */
function positionPop(root: HTMLElement): void {
  const pop = root.querySelector<HTMLElement>('.pop');
  if (!pop) return;
  const anchorSelector = pop.dataset['popAnchor'];
  const anchor = anchorSelector ? root.querySelector<HTMLElement>(anchorSelector) : null;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(rect.left, window.innerWidth - pop.offsetWidth - 12)}px`;
  pop.style.top = `${rect.bottom + 6}px`;
}

/** Async rows, because a table that is present on first paint is not a real table. */
function populateList(root: HTMLElement): void {
  const list = root.querySelector<HTMLElement>('#project-list');
  if (!list) return;
  clearTimeout(listTimer);
  const skeleton = document.createElement('p');
  skeleton.className = 'skeleton';
  skeleton.textContent = 'Loading projects…';
  list.replaceChildren(skeleton);
  listTimer = setTimeout(() => {
    list.replaceChildren();
    for (let i = 1; i <= 40; i += 1) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.setAttribute('role', 'listitem');
      const name = PROJECTS[(i - 1) % PROJECTS.length]?.name ?? 'Project';
      row.innerHTML = `<span>${esc(name)} ${i}</span>
        <button type="button" class="btn sm" aria-label="Open ${esc(name)} ${i}">Open</button>`;
      list.appendChild(row);
    }
  }, 300);
}

/** Deep link helper used by e2e and by the runtime when it resumes a journey. */
export function hostLink(route: RouteId, section?: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `#/${route}/${section ?? DEFAULT_SECTION[route]}${query ? `?${query}` : ''}`;
}
