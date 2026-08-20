/**
 * Notices when a single-page app changes route (ADR-0027). Page scoping decides
 * delivery from the landing URL and a SPA never lands again, so an experience
 * authored for `/settings` is pruned for everyone who arrives at `/` and clicks
 * through. Pathname only: a search box rewriting `?q=` must not cost a request.
 */
export interface PageNavigationWatch {
  readonly stop: () => void;
}

type HistoryMethod = 'pushState' | 'replaceState';

export function watchPagePathname(onChange: () => void): PageNavigationWatch {
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    return { stop: () => undefined };
  }

  let lastPathname = location.pathname;
  let scheduled = false;

  const check = (): void => {
    // Deferred: several pushes can land in one task.
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      if (location.pathname === lastPathname) return;
      lastPathname = location.pathname;
      onChange();
    }, 0);
  };

  // History has no event for its own methods. Unwrapped on stop only if nothing
  // else wrapped us since, or we would restore over another library's patch.
  const originals = {} as Record<HistoryMethod, History[HistoryMethod]>;
  const wrappers = {} as Record<HistoryMethod, History[HistoryMethod]>;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    originals[method] = original;
    const wrapper = function patched(this: History, ...args: Parameters<History[HistoryMethod]>) {
      const result = original.apply(this, args);
      check();
      return result;
    } as History[HistoryMethod];
    wrappers[method] = wrapper;
    history[method] = wrapper;
  }

  window.addEventListener('popstate', check);

  return {
    stop: () => {
      window.removeEventListener('popstate', check);
      for (const method of ['pushState', 'replaceState'] as const) {
        if (history[method] === wrappers[method]) history[method] = originals[method];
      }
    },
  };
}
