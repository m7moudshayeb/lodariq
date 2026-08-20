/**
 * The URL is the whole host state. A full reload lands on exactly the same
 * screen, with the same menu or dialog open, so authoring and runtime resume
 * against a page that actually came back the way they left it.
 *
 *   #/projects/all?pop=import&modal=create&locale=de&reflow=1&render=2
 */
import type { HostLocale } from './data';

export type RouteId = 'dashboard' | 'projects' | 'reports' | 'team' | 'billing' | 'settings';

export interface HostState {
  route: RouteId;
  section: string;
  /** Open dropdown, if any. `row:3` opens the menu for the fourth row. */
  pop: string | null;
  /** Open dialog, if any. */
  modal: string | null;
  drawer: boolean;
  locale: HostLocale;
  /** Layout reflowed without changing intent — a resolver stress control. */
  reflow: boolean;
  /** Bumping this replaces target DOM nodes wholesale. */
  render: number;
  sort: 'updated' | 'name' | 'owner';
}

export const ROUTES: RouteId[] = ['dashboard', 'projects', 'reports', 'team', 'billing', 'settings'];

export const DEFAULT_SECTION: Record<RouteId, string> = {
  dashboard: 'overview',
  projects: 'all',
  reports: 'adoption',
  team: 'members',
  billing: 'plan',
  settings: 'general',
};

const listeners = new Set<(state: HostState) => void>();
let current: HostState = parseHash(window.location.hash);

export function getState(): HostState {
  return current;
}

export function subscribe(listener: (state: HostState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Writes to the URL first; the render is a consequence of the URL, never the reverse. */
export function navigate(patch: Partial<HostState>, replace = false): void {
  const next: HostState = { ...current, ...patch };
  if (patch.route && !patch.section) next.section = DEFAULT_SECTION[patch.route];
  const hash = serializeHash(next);
  if (hash === window.location.hash) {
    current = next;
    emit();
    return;
  }
  if (replace) window.history.replaceState(null, '', hash);
  else window.history.pushState(null, '', hash);
  current = next;
  emit();
}

export function startRouter(): void {
  window.addEventListener('popstate', () => {
    current = parseHash(window.location.hash);
    emit();
  });
  window.addEventListener('hashchange', () => {
    const parsed = parseHash(window.location.hash);
    if (serializeHash(parsed) === serializeHash(current)) return;
    current = parsed;
    emit();
  });
  // Re-read the URL rather than trusting the value captured at module load:
  // the address can change between import and boot, and canonicalizing stale
  // state would quietly rewrite the URL back to the wrong screen.
  current = parseHash(window.location.hash);
  // Canonicalize so a hand-written or truncated link still resumes.
  navigate({}, true);
}

function emit(): void {
  for (const listener of listeners) listener(current);
}

function parseHash(hash: string): HostState {
  const raw = hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  const [routeRaw, sectionRaw] = path.split('/');
  const route = (ROUTES as string[]).includes(routeRaw ?? '')
    ? (routeRaw as RouteId)
    : 'projects';
  const params = new URLSearchParams(query);
  const renderRaw = Number.parseInt(params.get('render') ?? '1', 10);
  const sort = params.get('sort');
  return {
    route,
    section: sectionRaw || DEFAULT_SECTION[route],
    pop: params.get('pop'),
    modal: params.get('modal'),
    drawer: params.get('drawer') === '1',
    locale: params.get('locale') === 'de' ? 'de' : 'en',
    reflow: params.get('reflow') === '1',
    render: Number.isFinite(renderRaw) && renderRaw > 0 ? renderRaw : 1,
    sort: sort === 'name' || sort === 'owner' ? sort : 'updated',
  };
}

function serializeHash(state: HostState): string {
  const params = new URLSearchParams();
  if (state.pop) params.set('pop', state.pop);
  if (state.modal) params.set('modal', state.modal);
  if (state.drawer) params.set('drawer', '1');
  if (state.locale !== 'en') params.set('locale', state.locale);
  if (state.reflow) params.set('reflow', '1');
  if (state.render !== 1) params.set('render', String(state.render));
  if (state.sort !== 'updated') params.set('sort', state.sort);
  const query = params.toString();
  return `#/${state.route}/${state.section}${query ? `?${query}` : ''}`;
}
