/**
 * Cursor paging and search for the experiences list.
 *
 * Kept apart from the DOM so the rule that matters here — a stale response must
 * never overwrite a newer one — is testable without a browser. Every request
 * carries the generation it was issued in and is dropped on arrival if the
 * generation has moved on, which is what makes fast typing safe: the search
 * field can outrun the network and the last keystroke still wins.
 */
import type {
  CreatorPageExperienceQuery,
  CreatorPageExperienceResult,
  CreatorPageExperienceSummary,
  MaybePromise,
} from './types';

/**
 * What the controller asks for on its own.
 *
 * The scope is not in here: one controller serves one list, and which list that
 * is was decided by whoever built it. It is added on the way out.
 */
export type ExperienceListRequest = Omit<CreatorPageExperienceQuery, 'scope'>;

/** One screenful. The list asks for this many, then this many more per scroll. */
export const EXPERIENCE_PAGE_SIZE = 10;

/** Long enough that a typed word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 180;

export type ExperienceListStatus = 'idle' | 'loading' | 'loading-more' | 'ready' | 'error';

export interface ExperienceListState {
  readonly items: readonly CreatorPageExperienceSummary[];
  readonly status: ExperienceListStatus;
  /** Whether a `loadMore()` would fetch anything. Drives the scroll sentinel. */
  readonly hasMore: boolean;
  readonly query: string;
  /**
   * How many rows match in total, when the host said. Absent means unknown —
   * the loaded count is not a substitute, because a section header that prints
   * one is claiming a total it does not have.
   */
  readonly total?: number;
}

export interface ExperienceListController {
  state: () => ExperienceListState;
  /** Debounced. Resets paging — a new search is a new list, not more of this one. */
  setQuery: (text: string) => void;
  loadMore: () => void;
  /** First load, or a reload after an error. */
  start: () => void;
  destroy: () => void;
}

export function createExperienceListController(options: {
  readonly list: (query: ExperienceListRequest) => MaybePromise<CreatorPageExperienceResult>;
  readonly onChange: (state: ExperienceListState) => void;
  readonly pageSize?: number;
}): ExperienceListController {
  const pageSize = options.pageSize ?? EXPERIENCE_PAGE_SIZE;
  let state: ExperienceListState = { items: [], status: 'idle', hasMore: false, query: '' };
  let cursor: string | undefined;
  let generation = 0;
  let inFlight = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  /**
   * Set once a host answers with a bare array, which means "this is all of
   * them". From then on the menu pages and searches it locally rather than
   * asking again for a list that cannot have a second page.
   */
  let completeSet: readonly CreatorPageExperienceSummary[] | null = null;

  function emit(patch: Partial<ExperienceListState>): void {
    state = { ...state, ...patch };
    options.onChange(state);
  }

  function servedLocally(append: boolean): boolean {
    if (!completeSet) return false;
    const filtered = filterExperiences(completeSet, state.query);
    const upTo = append ? state.items.length + pageSize : pageSize;
    emit({
      items: filtered.slice(0, upTo),
      status: 'ready',
      hasMore: filtered.length > upTo,
      total: filtered.length,
    });
    return true;
  }

  function request(append: boolean): void {
    if (destroyed || inFlight) return;
    if (servedLocally(append)) return;
    const issued = (generation += 1);
    inFlight = true;
    emit({ status: append ? 'loading-more' : 'loading' });

    const trimmed = state.query.trim();
    void (async () => {
      try {
        const result = await options.list({
          ...(append && cursor !== undefined ? { cursor } : {}),
          limit: pageSize,
          ...(trimmed ? { query: trimmed } : {}),
        });
        if (destroyed || issued !== generation) return;
        if (Array.isArray(result)) {
          completeSet = result as readonly CreatorPageExperienceSummary[];
          cursor = undefined;
          // Released before emitting, not after. A listener on the new state may
          // ask for the next page straight away — the list does exactly that
          // when the first page did not fill it — and a guard still held here
          // swallows that request and strands the list one page short.
          inFlight = false;
          servedLocally(append);
          return;
        }
        const page = result as Exclude<CreatorPageExperienceResult, readonly unknown[]>;
        cursor = page.nextCursor;
        // Deduped by id: a keyset cursor that lands on a tie can repeat a row,
        // and a repeated row reads as a duplicate experience.
        const merged = append ? dedupeById([...state.items, ...page.items]) : [...page.items];
        inFlight = false;
        emit({
          items: merged,
          status: 'ready',
          hasMore: page.nextCursor !== undefined && page.items.length > 0,
          total: page.total,
        });
      } catch {
        if (destroyed || issued !== generation) return;
        inFlight = false;
        emit({ status: 'error' });
      }
    })();
  }

  return {
    state: () => state,
    setQuery: (text) => {
      if (text === state.query) return;
      state = { ...state, query: text };
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        cursor = undefined;
        // A request already in flight was issued for the previous query, and its
        // generation is about to be stale. Releasing the guard here is what lets
        // the new query start immediately instead of waiting the old one out.
        inFlight = false;
        request(false);
      }, SEARCH_DEBOUNCE_MS);
    },
    loadMore: () => {
      if (!state.hasMore || state.status === 'loading' || state.status === 'loading-more') return;
      request(true);
    },
    start: () => {
      cursor = undefined;
      inFlight = false;
      request(false);
    },
    destroy: () => {
      destroyed = true;
      generation += 1;
      if (debounce) clearTimeout(debounce);
      debounce = null;
    },
  };
}

/**
 * The local filter, used only for a host that returned everything at once.
 *
 * Matches the title and the type id, so typing "tour" finds the untitled ones —
 * which is most of them early on, when every row still reads "Untitled tour".
 */
export function filterExperiences(
  items: readonly CreatorPageExperienceSummary[],
  query: string,
): readonly CreatorPageExperienceSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) => item.title.toLowerCase().includes(needle) || item.type.toLowerCase().includes(needle),
  );
}

function dedupeById(
  items: readonly CreatorPageExperienceSummary[],
): readonly CreatorPageExperienceSummary[] {
  const seen = new Set<string>();
  const unique: CreatorPageExperienceSummary[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}
