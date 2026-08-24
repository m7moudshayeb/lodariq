// @vitest-environment jsdom

import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@lodariq/schema';

const mocks = vi.hoisted(() => ({
  loadExperienceMeasurement: vi.fn(),
  saveExperienceSuccessEvent: vi.fn(),
  saveExperimentChange: vi.fn(),
  loadWorkspaceApplications: vi.fn(),
  saveWorkspaceApplication: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/lib/client-dashboard-api', () => mocks);

import { ApplicationsPanel } from '../../../../apps/dashboard/src/components/applications-panel';
import { ExperienceMeasurementPanel } from '../../../../apps/dashboard/src/components/experience-measurement-panel';

const WORKSPACE_ID = 'wk_measurement';
const ENVIRONMENT_ID = 'env.production:measurement';
const DOCUMENT_ID = 'doc_onboarding';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    analytics: {
      documentId: DOCUMENT_ID,
      environmentId: ENVIRONMENT_ID,
      shown: 1_000,
      completed: 400,
      dismissed: 120,
      funnel: [
        { stepId: 'step_1', reached: 1_000, completed: 900 },
        { stepId: 'step_2', reached: 300, completed: 280 },
      ],
      adoption: [],
      formResponses: [],
    },
    measurement: {
      documentId: DOCUMENT_ID,
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    },
    experiment: { experiment: null, results: null },
    sessions: [],
    ...overrides,
  };
}

describe('experience measurement panel', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.loadExperienceMeasurement.mockResolvedValue(snapshot());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('shows completion as a share of who was shown it, not as a raw count', async () => {
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'Where people stop');
    expect(mounted.container.textContent).toContain('40.0%');
    expect(mounted.container.textContent).toContain('1,000');
    await unmount(mounted);
  });

  it('says impact cannot be measured until a success event is declared', async () => {
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'No success event is declared');
    expect(mounted.container.textContent).toContain('No success event is declared');
    await unmount(mounted);
  });

  it('declares a success event through the mutation, not by guessing one', async () => {
    mocks.saveExperienceSuccessEvent.mockResolvedValue({
      documentId: DOCUMENT_ID,
      successEvent: { eventName: 'invited_teammate', windowDays: 30 },
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    });
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'Success event');
    const input = mounted.container.querySelector<HTMLInputElement>('#success-event')!;
    await act(async () => {
      setInputValue(input, 'invited_teammate');
    });
    const declare = buttonWithText(mounted.container, 'Declare')!;
    await act(async () => declare.click());

    expect(mocks.saveExperienceSuccessEvent).toHaveBeenCalledWith(DOCUMENT_ID, {
      eventName: 'invited_teammate',
      windowDays: 30,
    });
    await unmount(mounted);
  });

  it('lists recent runs by outcome and names the step that could not be found', async () => {
    mocks.loadExperienceMeasurement.mockResolvedValue(
      snapshot({
        sessions: [
          {
            correlationId: 'visitor_a',
            startedAt: '2026-06-30T10:00:00.000Z',
            endedAt: '2026-06-30T10:01:15.000Z',
            durationMs: 75_000,
            outcome: 'abandoned',
            stepsReached: 2,
            unresolvedStepIds: ['step_2'],
            beats: [
              { name: 'tour_started', at: '2026-06-30T10:00:00.000Z', offsetMs: 0 },
              {
                name: 'target_resolution',
                at: '2026-06-30T10:01:15.000Z',
                offsetMs: 75_000,
                stepId: 'step_2',
                resolved: false,
                reasonCode: 'ambiguous',
              },
            ],
          },
        ],
      }),
    );
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'Recent runs');
    expect(mounted.container.textContent).toContain('Walked away');
    expect(mounted.container.textContent).toContain('1:15');
    expect(mounted.container.textContent).toContain('Could not find what step step_2 points at');
    await unmount(mounted);
  });

  it('keeps a run’s timeline closed until it is asked for', async () => {
    mocks.loadExperienceMeasurement.mockResolvedValue(
      snapshot({
        sessions: [
          {
            correlationId: 'visitor_a',
            startedAt: '2026-06-30T10:00:00.000Z',
            endedAt: '2026-06-30T10:00:09.000Z',
            durationMs: 9_000,
            outcome: 'completed',
            stepsReached: 1,
            unresolvedStepIds: [],
            beats: [
              { name: 'tour_started', at: '2026-06-30T10:00:00.000Z', offsetMs: 0 },
              { name: 'tour_completed', at: '2026-06-30T10:00:09.000Z', offsetMs: 9_000 },
            ],
          },
        ],
      }),
    );
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'Recent runs');
    expect(mounted.container.textContent).not.toContain('tour_completed');
    const reveal = buttonWithText(mounted.container, 'Show the timeline')!;
    await act(async () => reveal.click());
    expect(mounted.container.textContent).toContain('tour_completed');
    await unmount(mounted);
  });

  it('says nothing has run yet rather than showing an empty list', async () => {
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'No run has been recorded');
    expect(mounted.container.textContent).toContain('No run has been recorded');
    await unmount(mounted);
  });

  it('refuses to name a winner while the result is inside the sampling error', async () => {
    mocks.loadExperienceMeasurement.mockResolvedValue(
      snapshot({
        experiment: {
          experiment: {
            id: 'exp_1',
            status: 'running',
            varies: 'copy',
            successEventName: 'invited_teammate',
            allocationRevision: 1,
            arms: [
              { id: 'A', label: 'Control', trafficPercent: 50 },
              { id: 'B', label: 'Variant', trafficPercent: 50 },
            ],
          },
          results: {
            experimentId: 'exp_1',
            allocationRevision: 1,
            arms: [
              { armId: 'A', exposures: 40, conversions: 10, conversionRate: 0.25 },
              { armId: 'B', exposures: 40, conversions: 12, conversionRate: 0.3 },
            ],
            leadingArmId: null,
            confidencePercent: null,
          },
        },
      }),
    );
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'No arm is ahead');
    expect(mounted.container.textContent).toContain('No arm is ahead');
    expect(buttonWithText(mounted.container, 'Promote the leading arm')?.disabled).toBe(true);
    await unmount(mounted);
  });

  it('promotes only the arm the results actually name', async () => {
    mocks.loadExperienceMeasurement.mockResolvedValue(
      snapshot({
        experiment: {
          experiment: {
            id: 'exp_1',
            status: 'running',
            varies: 'copy',
            successEventName: 'invited_teammate',
            allocationRevision: 1,
            arms: [
              { id: 'A', label: 'Control', trafficPercent: 50 },
              { id: 'B', label: 'Variant', trafficPercent: 50 },
            ],
          },
          results: {
            experimentId: 'exp_1',
            allocationRevision: 1,
            arms: [
              { armId: 'A', exposures: 400, conversions: 40, conversionRate: 0.1 },
              { armId: 'B', exposures: 400, conversions: 120, conversionRate: 0.3 },
            ],
            leadingArmId: 'B',
            confidencePercent: 95,
          },
        },
      }),
    );
    mocks.saveExperimentChange.mockResolvedValue({
      id: 'exp_1',
      status: 'promoted',
      varies: 'copy',
      successEventName: 'invited_teammate',
      allocationRevision: 1,
      arms: [
        { id: 'A', label: 'Control', trafficPercent: 50 },
        { id: 'B', label: 'Variant', trafficPercent: 50 },
      ],
    });
    const mounted = await mount(
      createElement(ExperienceMeasurementPanel, {
        environmentId: ENVIRONMENT_ID,
        experiences: [{ id: DOCUMENT_ID, name: 'Onboarding' }],
        workspaceId: WORKSPACE_ID,
      }),
    );
    await settled(mounted.container, 'Leading');
    const promote = buttonWithText(mounted.container, 'Promote the leading arm')!;
    expect(promote.disabled).toBe(false);
    await act(async () => promote.click());
    expect(mocks.saveExperimentChange).toHaveBeenCalledWith('exp_1', { promotedArmId: 'B' });
    await unmount(mounted);
  });
});

describe('applications panel', () => {
  const applications: ApplicationSummary[] = [
    { id: 'app', name: 'Meridian', originPatterns: ['app.meridian.test'], isPrimary: true },
    { id: 'edge', name: 'Edge', originPatterns: ['*.meridian.test'], isPrimary: false },
  ];

  beforeEach(() => {
    vi.stubGlobal('React', React);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.loadWorkspaceApplications.mockResolvedValue(applications);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('warns when an application has no exact host, since a handoff cannot reach it', async () => {
    const mounted = await mount(createElement(ApplicationsPanel, { workspaceId: WORKSPACE_ID }));
    await settled(mounted.container, 'Every pattern is a wildcard');
    expect(mounted.container.textContent).toContain('Every pattern is a wildcard');
    await unmount(mounted);
  });

  it('offers to promote only the applications that are not already primary', async () => {
    const mounted = await mount(createElement(ApplicationsPanel, { workspaceId: WORKSPACE_ID }));
    await settled(mounted.container, 'Meridian');
    const promoteButtons = [
      ...mounted.container.querySelectorAll<HTMLButtonElement>('table button'),
    ];
    expect(promoteButtons).toHaveLength(1);
    await unmount(mounted);
  });

  it('registers an application with one origin per line', async () => {
    mocks.saveWorkspaceApplication.mockResolvedValue(applications);
    const mounted = await mount(createElement(ApplicationsPanel, { workspaceId: WORKSPACE_ID }));
    await settled(mounted.container, 'Register application');
    await act(async () => {
      setInputValue(
        mounted.container.querySelector<HTMLInputElement>('#application-name')!,
        'Billing',
      );
      setInputValue(
        mounted.container.querySelector<HTMLInputElement>('#application-id')!,
        'billing',
      );
      setTextAreaValue(
        mounted.container.querySelector<HTMLTextAreaElement>('#application-origins')!,
        'billing.meridian.test\n  \npay.meridian.test',
      );
    });
    const submit = buttonWithText(mounted.container, 'Register application')!;
    await act(async () => submit.click());

    expect(mocks.saveWorkspaceApplication).toHaveBeenCalledWith({
      id: 'billing',
      name: 'Billing',
      originPatterns: ['billing.meridian.test', 'pay.meridian.test'],
      isPrimary: false,
    });
    await unmount(mounted);
  });
});

interface MountedComponent {
  container: HTMLDivElement;
  root: Root;
}

async function mount(element: React.ReactElement): Promise<MountedComponent> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
  await act(async () =>
    root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(QueryClientProvider, { client: queryClient }, element),
      ),
    ),
  );
  return { container, root };
}

/** React Query resolves on a microtask, so the first render is always the pending one. */
async function settled(container: HTMLElement, text: string): Promise<void> {
  await vi.waitFor(() => expect(container.textContent).toContain(text));
}

async function unmount(mounted: MountedComponent): Promise<void> {
  await act(async () => mounted.root.unmount());
}

function buttonWithText(container: HTMLElement, label: string): HTMLButtonElement | null {
  return (
    [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === label,
    ) ?? null
  );
}

/** React tracks the value on the node, so the setter has to go through the prototype. */
function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
    textarea,
    value,
  );
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
