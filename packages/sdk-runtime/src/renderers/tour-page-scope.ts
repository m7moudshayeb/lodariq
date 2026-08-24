/**
 * Noticing the visitor left the page a step belongs to.
 *
 * The key itself is shared with the resolver and with authoring capture — see
 * `@lodariq/schema/page-key`. This file is only the part that has to watch a
 * live browser for it changing.
 */
import { currentPageKey } from '@lodariq/schema/page-key';

export { currentPageKey };

export interface PageScopeWatch {
  readonly stop: () => void;
}

/**
 * Move to a page key. A hash route is a plain assignment; a different path needs
 * `pushState` plus the `popstate` client-side routers listen for. Never reloads.
 */
export function goToPageKey(key: string): void {
  if (typeof window === 'undefined') return;
  const hash = key.indexOf('#');
  const path = hash < 0 ? key : key.slice(0, hash) || '/';
  const route = hash < 0 ? null : key.slice(hash + 1);
  if (route !== null && path === withoutTrailingSlash(location.pathname || '/')) {
    location.hash = route;
    return;
  }
  history.pushState(null, '', route === null ? path : `${path}#${route}`);
  dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

function withoutTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

type HistoryMethod = 'pushState' | 'replaceState';

/**
 * History fires no event for its own methods, so both mutators are wrapped.
 * They are restored on stop only when nothing else wrapped us since, or the
 * restore would paste over another library's patch.
 */
export function watchPageKey(onChange: () => void): PageScopeWatch {
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    return { stop: () => undefined };
  }

  // Held rather than read back: a page torn down under us still has to unwind
  // its own patches, and by then the globals may be gone.
  const view = window;
  const pageHistory = history;
  let lastKey = currentPageKey();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = (): void => {
    // Deferred: a router can push, replace and dispatch inside one task.
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const key = currentPageKey();
      if (key === lastKey) return;
      lastKey = key;
      onChange();
    }, 0);
  };

  const originals = {} as Record<HistoryMethod, History[HistoryMethod]>;
  const wrappers = {} as Record<HistoryMethod, History[HistoryMethod]>;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = pageHistory[method];
    originals[method] = original;
    const wrapper = function patched(this: History, ...args: Parameters<History[HistoryMethod]>) {
      const result = original.apply(this, args);
      check();
      return result;
    } as History[HistoryMethod];
    wrappers[method] = wrapper;
    pageHistory[method] = wrapper;
  }

  // A hash router moved by an anchor click or `location.hash = …` touches
  // neither method, so the event is not redundant with the wrappers.
  view.addEventListener('popstate', check);
  view.addEventListener('hashchange', check);

  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      timer = null;
      // Optional calls: a page can be torn down before its cleanup runs, and
      // unwinding must not be the thing that throws on the way out.
      view.removeEventListener?.('popstate', check);
      view.removeEventListener?.('hashchange', check);
      for (const method of ['pushState', 'replaceState'] as const) {
        if (pageHistory[method] === wrappers[method]) pageHistory[method] = originals[method];
      }
    },
  };
}
