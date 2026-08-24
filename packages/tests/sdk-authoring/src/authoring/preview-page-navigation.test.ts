// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  goToPreviewPage,
  stepPageDestination,
} from '../../../../sdk-authoring/src/authoring/preview-page-navigation';

/**
 * Pressing Preview on the wrong page used to start a tour whose first step had
 * nothing to point at, with no explanation. It should take the creator to the
 * page that step belongs to — without a reload, which would end the authoring
 * session and the preview with it.
 */

const compiled = (page?: { key: string; match?: 'exact' | 'prefix' }) => ({
  steps: [
    { id: 'step_a', targetId: 'target_a' },
    { id: 'step_b', targetId: 'target_b' },
  ],
  targets: [
    { id: 'target_a', identity: { context: {} } },
    { id: 'target_b', identity: { context: { ...(page ? { page } : {}) } } },
  ],
});

describe('finding the page a preview should start on', () => {
  it('reads the first step when no step was named', () => {
    const document = compiled({ key: '/#/billing' });
    document.targets[0]!.identity.context = { page: { key: '/#/projects' } } as never;

    expect(stepPageDestination(document, undefined)).toEqual({ key: '/#/projects' });
  });

  it('reads the step it was actually asked about', () => {
    expect(stepPageDestination(compiled({ key: '/#/billing' }), 'step_b')).toEqual({
      key: '/#/billing',
    });
  });

  it('says nothing for a step whose target belongs everywhere', () => {
    expect(stepPageDestination(compiled(), 'step_b')).toBeNull();
    expect(stepPageDestination(compiled({ key: '/#/billing' }), 'step_a')).toBeNull();
  });
});

describe('getting there', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('does nothing when the creator is already on the page', async () => {
    history.replaceState(null, '', '/#/billing');
    const pushState = vi.spyOn(history, 'pushState');

    expect(await goToPreviewPage({ key: '/#/billing' })).toEqual({ kind: 'already-there' });
    expect(pushState).not.toHaveBeenCalled();
  });

  it('does nothing when a prefix answer already covers where they are', async () => {
    history.replaceState(null, '', '/projects/8f21');

    expect(await goToPreviewPage({ key: '/projects', match: 'prefix' })).toEqual({
      kind: 'already-there',
    });
  });

  it('moves a hash-routed application without touching history', async () => {
    history.replaceState(null, '', '/#/projects');
    const pushState = vi.spyOn(history, 'pushState');

    expect(await goToPreviewPage({ key: '/#/billing/plan' })).toEqual({ kind: 'arrived' });
    expect(location.hash).toBe('#/billing/plan');
    // A hash router needs no history call, and making one would double the entry.
    expect(pushState).not.toHaveBeenCalled();
  });

  it('pushes a path and tells the router about it', async () => {
    const popstates: Event[] = [];
    window.addEventListener('popstate', (event) => popstates.push(event));

    expect(await goToPreviewPage({ key: '/billing' })).toEqual({ kind: 'arrived' });
    expect(location.pathname).toBe('/billing');
    // pushState changes the address silently; without this no router reacts.
    expect(popstates).toHaveLength(1);
  });

  it('says where to go when the application will not follow', async () => {
    // A server-routed application: the address never moves, so neither do we.
    const stubbed = {
      location: { pathname: '/', hash: '' },
      history: { pushState: vi.fn() },
      dispatchEvent: vi.fn(),
      setTimeout: ((fn: () => void) =>
        globalThis.setTimeout(fn, 0)) as unknown as Window['setTimeout'],
    } as unknown as Window;

    expect(await goToPreviewPage({ key: '/billing' }, { view: stubbed, timeoutMs: 60 })).toEqual({
      kind: 'unreachable',
      destination: '/billing',
    });
  });

  it('names a hash route readably when it gives up', async () => {
    const stubbed = {
      location: { pathname: '/', hash: '' },
      history: { pushState: vi.fn() },
      dispatchEvent: vi.fn(),
      setTimeout: ((fn: () => void) =>
        globalThis.setTimeout(fn, 0)) as unknown as Window['setTimeout'],
    } as unknown as Window;

    expect(
      await goToPreviewPage({ key: '/#/billing/plan' }, { view: stubbed, timeoutMs: 60 }),
    ).toEqual({ kind: 'unreachable', destination: '/billing/plan' });
  });
});
