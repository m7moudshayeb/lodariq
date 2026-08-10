// @vitest-environment jsdom

import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalyticsEventAggregate,
  AnalyticsTargetResolutionStatus,
} from '@lodariq/schema';

const mocks = vi.hoisted(() => ({
  loadAnalyticsAggregatesAction: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/app/analytics-actions', () => ({
  loadAnalyticsAggregatesAction: mocks.loadAnalyticsAggregatesAction,
}));

import { AnalyticsPanel } from '../../../../apps/dashboard/src/components/analytics-panel';
import { DashboardWorkspace } from '../../../../apps/dashboard/src/components/dashboard-workspace';
import { buildDashboardViewModel } from '../../../../apps/dashboard/src/lib/view-model';

const PRODUCTION_ID = 'env.production:analytics';
const STAGING_ID = 'env.staging:analytics';
const PRODUCTION_PUBLICATION_ID = 'pub.analytics:production';
const ROLLBACK_PUBLICATION_ID = 'pub.analytics:rollback';
const STAGING_PUBLICATION_ID = 'pub.analytics:staging';

describe('@lodariq/dashboard analytics reporting UI', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('defaults explicitly to production and renders truthful release-scoped facts accessibly', async () => {
    mocks.loadAnalyticsAggregatesAction.mockImplementation(
      async ({ environmentId }: { environmentId: string }) => analyticsSuccess(environmentId),
    );
    const mounted = await mountAnalyticsPanel();
    await waitForPublication(mounted.container, PRODUCTION_PUBLICATION_ID);

    expect(mocks.loadAnalyticsAggregatesAction).toHaveBeenCalledOnce();
    expect(mocks.loadAnalyticsAggregatesAction).toHaveBeenCalledWith({
      environmentId: PRODUCTION_ID,
    });
    const tablist = requiredElement<HTMLElement>(
      mounted.container,
      '[role="group"][aria-label="Analytics environment"]',
    );
    expect(tabByEnvironment(tablist, 'Production').getAttribute('aria-pressed')).toBe('true');
    expect(tabByEnvironment(tablist, 'Staging').getAttribute('aria-pressed')).toBe('false');
    expect(
      requiredElement(mounted.container, '[role="region"][aria-label="Production analytics results"]'),
    ).toBeTruthy();
    expect(mounted.container.textContent).toContain('Production only');
    expect(mounted.container.textContent).toContain('8Tour starts');
    expect(mounted.container.textContent).toContain('2Tour dismissals');
    expect(mounted.container.textContent).toContain('4Tour completions');
    expect(mounted.container.textContent).toContain('1SDK errors');
    expect(mounted.container.textContent).toContain('9Target failures');
    expect(mounted.container.textContent).toContain('Ambiguous 2 · Missing 3 · Needs review 4.');
    expect(mounted.container.textContent).toContain('Found 5 · Unknown 6.');
    expect(mounted.container.textContent).toContain(
      'Found and unknown outcomes are not counted as failures.',
    );
    expect(mounted.container.textContent).not.toContain('Unavailable');
    expect(mounted.container.textContent).toContain('Target resultAmbiguous');
    expect(mounted.container.textContent).toContain('Target resultUnknown');
    expect(mounted.container.textContent).toContain('custom.launch_signal');
    expect(mounted.container.textContent).toContain('Unknown bounded event');
    expect(mounted.container.textContent).toContain(PRODUCTION_PUBLICATION_ID);
    expect(mounted.container.textContent).toContain(ROLLBACK_PUBLICATION_ID);
    expect(mounted.container.textContent).toContain(hash('a'));
    expect(mounted.container.textContent).toContain('Pointer generation5');
    expect(mounted.container.textContent?.toLowerCase()).not.toContain('conversion rate');

    await unmount(mounted);
  });

  it('clears production results while switching and never renders mixed environment data', async () => {
    let resolveStaging: ((value: ReturnType<typeof analyticsSuccess>) => void) | undefined;
    const stagingResult = new Promise<ReturnType<typeof analyticsSuccess>>((resolve) => {
      resolveStaging = resolve;
    });
    mocks.loadAnalyticsAggregatesAction.mockImplementation(
      ({ environmentId }: { environmentId: string }) =>
        environmentId === PRODUCTION_ID
          ? Promise.resolve(analyticsSuccess(PRODUCTION_ID))
          : stagingResult,
    );
    const mounted = await mountAnalyticsPanel();
    await waitForPublication(mounted.container, PRODUCTION_PUBLICATION_ID);

    act(() => tabByEnvironment(mounted.container, 'Staging').click());
    await vi.waitFor(() => {
      expect(mocks.loadAnalyticsAggregatesAction).toHaveBeenLastCalledWith({
        environmentId: STAGING_ID,
      });
      expect(mounted.container.textContent).toContain('Loading Staging analytics…');
      expect(mounted.container.textContent).not.toContain(PRODUCTION_PUBLICATION_ID);
      expect(mounted.container.textContent).not.toContain(ROLLBACK_PUBLICATION_ID);
    });

    await act(async () => resolveStaging?.(analyticsSuccess(STAGING_ID)));
    await waitForPublication(mounted.container, STAGING_PUBLICATION_ID);
    expect(mounted.container.textContent).toContain('Staging only');
    expect(mounted.container.textContent).toContain('0Target failures');
    expect(mounted.container.textContent).toContain('Found 2 · Unknown 3.');
    expect(mounted.container.textContent).not.toContain(PRODUCTION_PUBLICATION_ID);
    expect(mocks.loadAnalyticsAggregatesAction.mock.calls.map((call) => call[0])).toEqual([
      { environmentId: PRODUCTION_ID },
      { environmentId: STAGING_ID },
    ]);

    await unmount(mounted);
  });

  it('ignores a late production response after staging becomes the selected scope', async () => {
    let resolveProductionRefresh: ((value: ReturnType<typeof analyticsSuccess>) => void) | undefined;
    const productionRefresh = new Promise<ReturnType<typeof analyticsSuccess>>((resolve) => {
      resolveProductionRefresh = resolve;
    });
    mocks.loadAnalyticsAggregatesAction
      .mockResolvedValueOnce(analyticsSuccess(PRODUCTION_ID))
      .mockImplementation(({ environmentId }: { environmentId: string }) =>
        environmentId === PRODUCTION_ID
          ? productionRefresh
          : Promise.resolve(analyticsSuccess(STAGING_ID)),
      );
    const mounted = await mountAnalyticsPanel();
    await waitForPublication(mounted.container, PRODUCTION_PUBLICATION_ID);

    act(() => buttonByText(mounted.container, 'Refresh selected environment').click());
    act(() => tabByEnvironment(mounted.container, 'Staging').click());
    await waitForPublication(mounted.container, STAGING_PUBLICATION_ID);

    await act(async () => resolveProductionRefresh?.(analyticsSuccess(PRODUCTION_ID)));
    expect(mounted.container.textContent).toContain(STAGING_PUBLICATION_ID);
    expect(mounted.container.textContent).not.toContain(PRODUCTION_PUBLICATION_ID);
    expect(mocks.loadAnalyticsAggregatesAction.mock.calls.map((call) => call[0])).toEqual([
      { environmentId: PRODUCTION_ID },
      { environmentId: PRODUCTION_ID },
      { environmentId: STAGING_ID },
    ]);

    await unmount(mounted);
  });

  it('requires visible selection when production is not configured', async () => {
    mocks.loadAnalyticsAggregatesAction.mockImplementation(
      async ({ environmentId }: { environmentId: string }) => analyticsSuccess(environmentId),
    );
    const mounted = await mount(
      createElement(AnalyticsPanel, {
        environments: [
          { id: STAGING_ID, kind: 'staging', name: 'Staging', enabled: true },
        ],
      }),
    );

    expect(mounted.container.textContent).toContain(
      'Production analytics are not configured. Select staging explicitly',
    );
    expect(mocks.loadAnalyticsAggregatesAction).not.toHaveBeenCalled();
    expect(tabByEnvironment(mounted.container, 'Staging').getAttribute('aria-pressed')).toBe(
      'false',
    );

    await click(tabByEnvironment(mounted.container, 'Staging'));
    await waitForPublication(mounted.container, STAGING_PUBLICATION_ID);
    expect(mocks.loadAnalyticsAggregatesAction).toHaveBeenCalledWith({
      environmentId: STAGING_ID,
    });

    await unmount(mounted);
  });

  it('shows explicit empty and unavailable states without stale or substituted results', async () => {
    mocks.loadAnalyticsAggregatesAction.mockResolvedValueOnce({
      status: 'success',
      environmentId: PRODUCTION_ID,
      response: { aggregates: [] },
    });
    const empty = await mountAnalyticsPanel();
    await vi.waitFor(() =>
      expect(empty.container.textContent).toContain(
        'No aggregate events are recorded for Production. No staging or production data was substituted.',
      ),
    );
    await unmount(empty);

    mocks.loadAnalyticsAggregatesAction.mockRejectedValueOnce(new Error('server action transport'));
    const unavailable = await mountAnalyticsPanel();
    await vi.waitFor(() =>
      expect(requiredElement(unavailable.container, '[role="alert"]').textContent).toContain(
        'temporarily unavailable for the selected environment',
      ),
    );
    expect(unavailable.container.textContent).not.toContain(PRODUCTION_PUBLICATION_ID);
    expect(buttonByText(unavailable.container, 'Retry selected environment')).toBeTruthy();
    await unmount(unavailable);
  });

  it('exposes Analytics as a primary navigable view with current-page semantics', async () => {
    mocks.loadAnalyticsAggregatesAction.mockImplementation(
      async ({ environmentId }: { environmentId: string }) => analyticsSuccess(environmentId),
    );
    const viewModel = buildDashboardViewModel({
      controlPlaneContext: {
        userId: 'user.analytics:viewer',
        workspaceId: 'wk.analytics:dashboard',
        role: 'viewer',
      },
      documents: [],
      environments: dashboardEnvironments(),
      tokens: [],
      installations: [],
      themes: [],
    });
    const mounted = await mount(createElement(DashboardWorkspace, { viewModel }));
    const analyticsNavigation = buttonByText(mounted.container, 'Analytics');
    expect(analyticsNavigation.getAttribute('aria-controls')).toBe('dashboard-active-view');

    await click(analyticsNavigation);
    await vi.waitFor(() => {
      expect(analyticsNavigation.getAttribute('aria-current')).toBe('page');
      expect(requiredElement<HTMLHeadingElement>(mounted.container, 'h1').textContent).toBe(
        'Analytics',
      );
      expect(window.location.hash).toBe('#analytics');
    });

    await unmount(mounted);
  });
});

async function mountAnalyticsPanel(): Promise<MountedComponent> {
  return mount(
    createElement(AnalyticsPanel, {
      environments: [
        { id: STAGING_ID, kind: 'staging', name: 'Staging', enabled: true },
        { id: PRODUCTION_ID, kind: 'production', name: 'Production', enabled: true },
      ],
    }),
  );
}

interface MountedComponent {
  container: HTMLDivElement;
  root: Root;
}

async function mount(element: React.ReactElement): Promise<MountedComponent> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

async function unmount(mounted: MountedComponent): Promise<void> {
  await act(async () => mounted.root.unmount());
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
}

async function waitForPublication(container: HTMLElement, publicationId: string): Promise<void> {
  await vi.waitFor(() => expect(container.textContent).toContain(publicationId));
}

function tabByEnvironment(root: ParentNode, label: 'Staging' | 'Production'): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button[aria-controls="analytics-environment-results"]')].find(
    (candidate) => candidate.textContent?.startsWith(label),
  );
  if (!button) throw new Error(`Analytics environment tab not found: ${label}`);
  return button;
}

function buttonByText(root: ParentNode, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function analyticsSuccess(environmentId: string) {
  return {
    status: 'success' as const,
    environmentId,
    response: {
      aggregates:
        environmentId === PRODUCTION_ID ? productionAggregates() : stagingAggregates(),
    },
  };
}

function productionAggregates(): AnalyticsEventAggregate[] {
  return [
    aggregate({ count: 5 }),
    aggregate({
      publicationId: ROLLBACK_PUBLICATION_ID,
      contentHash: hash('a'),
      pointerGeneration: 5,
      count: 3,
    }),
    aggregate({ name: 'tour_dismissed', count: 2 }),
    aggregate({ name: 'tour_completed', count: 4 }),
    targetAggregate('ambiguous', { count: 2 }),
    targetAggregate('missing', {
      publicationId: ROLLBACK_PUBLICATION_ID,
      contentHash: hash('a'),
      pointerGeneration: 5,
      count: 3,
    }),
    targetAggregate('needs_review', { count: 4 }),
    targetAggregate('found', { count: 5 }),
    targetAggregate('unknown', { count: 6 }),
    aggregate({ name: 'sdk_error', count: 1 }),
    aggregate({ name: 'custom.launch_signal', count: 7 }),
  ];
}

function stagingAggregates(): AnalyticsEventAggregate[] {
  return [
    aggregate({
      environmentId: STAGING_ID,
      publicationId: STAGING_PUBLICATION_ID,
      contentHash: hash('c'),
      pointerGeneration: 2,
      count: 2,
    }),
    targetAggregate('found', {
      environmentId: STAGING_ID,
      publicationId: STAGING_PUBLICATION_ID,
      contentHash: hash('c'),
      pointerGeneration: 2,
      count: 2,
    }),
    targetAggregate('unknown', {
      environmentId: STAGING_ID,
      publicationId: STAGING_PUBLICATION_ID,
      contentHash: hash('c'),
      pointerGeneration: 2,
      count: 3,
    }),
  ];
}

function targetAggregate(
  status: AnalyticsTargetResolutionStatus,
  overrides: Partial<AnalyticsEventAggregate> = {},
): AnalyticsEventAggregate {
  return {
    ...aggregate(overrides),
    name: 'target_resolution',
    targetResolutionStatus: status,
  } as AnalyticsEventAggregate;
}

function aggregate(
  overrides: Partial<AnalyticsEventAggregate> = {},
): AnalyticsEventAggregate {
  return {
    workspaceId: 'wk.analytics:dashboard',
    environmentId: PRODUCTION_ID,
    documentId: 'doc.analytics:tour',
    publicationId: PRODUCTION_PUBLICATION_ID,
    contentHash: hash('b'),
    pointerGeneration: 3,
    name: 'tour_started',
    count: 1,
    firstTimestamp: '2026-08-09T12:00:00.000Z',
    lastTimestamp: '2026-08-09T12:05:00.000Z',
    ...overrides,
  };
}

function hash(character: string): string {
  return `sha256-${character.repeat(64)}`;
}

function dashboardEnvironments() {
  return [
    {
      id: 'env.development:analytics',
      workspaceId: 'wk.analytics:dashboard',
      kind: 'development' as const,
      name: 'Development',
      originAllowlist: ['http://localhost:5173'],
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    },
    {
      id: STAGING_ID,
      workspaceId: 'wk.analytics:dashboard',
      kind: 'staging' as const,
      name: 'Staging',
      originAllowlist: ['https://staging.customer.example'],
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    },
    {
      id: PRODUCTION_ID,
      workspaceId: 'wk.analytics:dashboard',
      kind: 'production' as const,
      name: 'Production',
      originAllowlist: ['https://app.customer.example'],
      createdAt: '2026-08-09T12:00:00.000Z',
      updatedAt: '2026-08-09T12:00:00.000Z',
    },
  ];
}
