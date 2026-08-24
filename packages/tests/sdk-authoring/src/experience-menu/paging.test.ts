import { describe, expect, it, vi } from 'vitest';
import {
  createExperienceListController,
  filterExperiences,
  type ExperienceListRequest,
  type ExperienceListState,
} from '../../../../../packages/sdk-authoring/src/experience-menu/paging';
import type {
  CreatorPageExperienceResult,
  CreatorPageExperienceSummary,
} from '../../../../../packages/sdk-authoring/src/experience-menu/types';

const summary = (index: number, title?: string): CreatorPageExperienceSummary => ({
  id: `doc_${index}`,
  title: title ?? `Tour ${index}`,
  type: 'tour',
});

function harness(
  list: (
    query: ExperienceListRequest,
  ) => CreatorPageExperienceResult | Promise<CreatorPageExperienceResult>,
) {
  const states: ExperienceListState[] = [];
  const controller = createExperienceListController({
    list,
    onChange: (state) => states.push(state),
  });
  return { controller, states, last: () => states[states.length - 1] };
}

/** A cursor host: pages an array by numeric offset, exactly as a keyset would. */
function cursorHost(items: readonly CreatorPageExperienceSummary[]) {
  return ({ cursor, limit, query }: ExperienceListRequest): CreatorPageExperienceResult => {
    const matching = query
      ? items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
      : items;
    const start = Number(cursor ?? '0');
    const end = start + limit;
    return {
      items: matching.slice(start, end),
      ...(end < matching.length ? { nextCursor: String(end) } : {}),
    };
  };
}

describe('the experiences list controller', () => {
  it('asks for one page and stops there', async () => {
    const list = vi.fn(cursorHost(Array.from({ length: 24 }, (_, index) => summary(index))));
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ limit: 10 });
    expect(last()?.items).toHaveLength(10);
    expect(last()?.hasMore).toBe(true);
  });

  it('says it is loading before it says it is ready', async () => {
    const list = vi.fn(cursorHost(Array.from({ length: 24 }, (_, index) => summary(index))));
    const { controller, states, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));
    expect(states.map((state) => state.status)).toEqual(['loading', 'ready']);

    controller.loadMore();
    await vi.waitFor(() => expect(last()?.items).toHaveLength(20));
    // A second page is "loading-more", not "loading": the rows already on screen
    // stay on screen while it arrives.
    expect(states.map((state) => state.status)).toEqual([
      'loading',
      'ready',
      'loading-more',
      'ready',
    ]);
  });

  it('appends the next page with the cursor the last one returned', async () => {
    const list = vi.fn(cursorHost(Array.from({ length: 24 }, (_, index) => summary(index))));
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));
    controller.loadMore();
    await vi.waitFor(() => expect(last()?.items).toHaveLength(20));

    expect(list).toHaveBeenLastCalledWith({ cursor: '10', limit: 10 });
    controller.loadMore();
    await vi.waitFor(() => expect(last()?.items).toHaveLength(24));
    // The last page returns no cursor, so the list knows to stop asking.
    expect(last()?.hasMore).toBe(false);
  });

  it('drops a page that repeats a row rather than showing it twice', async () => {
    // A keyset cursor landing on a tie is how a real host produces this.
    const list = vi
      .fn<(query: ExperienceListRequest) => CreatorPageExperienceResult>()
      .mockReturnValueOnce({ items: [summary(1), summary(2)], nextCursor: '2' })
      .mockReturnValueOnce({ items: [summary(2), summary(3)] });
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));
    controller.loadMore();
    await vi.waitFor(() => expect(last()?.hasMore).toBe(false));

    expect(last()?.items.map((item) => item.id)).toEqual(['doc_1', 'doc_2', 'doc_3']);
  });

  it('lets the last keystroke win when an earlier search is still in flight', async () => {
    const resolvers: ((result: CreatorPageExperienceResult) => void)[] = [];
    const list = vi.fn(
      () => new Promise<CreatorPageExperienceResult>((resolve) => resolvers.push(resolve)),
    );
    const { controller, last } = harness(list);

    controller.start();
    controller.setQuery('slow');
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    controller.setQuery('fast');
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3));

    // Answer the newest first, then let the stale one land on top of it.
    resolvers[2]?.({ items: [summary(9, 'fast result')] });
    await vi.waitFor(() => expect(last()?.items).toHaveLength(1));
    resolvers[1]?.({ items: [summary(8, 'slow result')] });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(last()?.items.map((item) => item.title)).toEqual(['fast result']);
  });

  it('starts a new search from the first page, never from the old cursor', async () => {
    const list = vi.fn(cursorHost(Array.from({ length: 24 }, (_, index) => summary(index))));
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));
    controller.loadMore();
    await vi.waitFor(() => expect(last()?.items).toHaveLength(20));

    controller.setQuery('Tour 21');
    await vi.waitFor(() => expect(last()?.items).toHaveLength(1));
    expect(list).toHaveBeenLastCalledWith({ limit: 10, query: 'Tour 21' });
  });

  it('pages a bare array itself, so a small host need not implement a cursor', async () => {
    const all = Array.from({ length: 24 }, (_, index) => summary(index));
    const list = vi.fn(() => all);
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('ready'));
    expect(last()?.items).toHaveLength(10);

    controller.loadMore();
    await vi.waitFor(() => expect(last()?.items).toHaveLength(20));
    // Asked once. A host that answered with everything is not asked again.
    expect(list).toHaveBeenCalledTimes(1);

    controller.setQuery('Tour 21');
    await vi.waitFor(() => expect(last()?.items).toHaveLength(1));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('reports a failure rather than an empty list', async () => {
    const list = vi.fn(() => Promise.reject(new Error('offline')));
    const { controller, last } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(last()?.status).toBe('error'));
    // Recoverable: the retry row calls start() again.
    expect(last()?.items).toHaveLength(0);
  });

  it('ignores a response that lands after the list was thrown away', async () => {
    let resolve: ((result: CreatorPageExperienceResult) => void) | undefined;
    const list = vi.fn(() => new Promise<CreatorPageExperienceResult>((next) => (resolve = next)));
    const { controller, states } = harness(list);

    controller.start();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    controller.destroy();
    const seen = states.length;
    resolve?.({ items: [summary(1)] });
    await new Promise((next) => setTimeout(next, 20));

    expect(states).toHaveLength(seen);
  });
});

describe('the local filter', () => {
  it('matches the type as well as the title, because early drafts are all untitled', () => {
    const items = [summary(1, 'Untitled Tour'), summary(2, 'Checkout walkthrough')];
    expect(filterExperiences(items, 'tour').map((item) => item.id)).toEqual(['doc_1', 'doc_2']);
    expect(filterExperiences(items, 'checkout').map((item) => item.id)).toEqual(['doc_2']);
    expect(filterExperiences(items, '   ')).toHaveLength(2);
  });
});
