// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  AUTHORING_COLLABORATION_STATE_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  COMMERCIAL_PLAN_VERSION,
  commercialUsageValue,
  resolveCommercialEntitlements,
  type CommercialPlanId,
  type LodariqBlock,
  type LodariqDocument,
  type LocaleLayoutQaReport,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import type { AccessibilitySweepResult } from '@lodariq/schema/accessibility-governance';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame, type AuthoringOperationsServices } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_operations_sections';

/**
 * Operations is one surface. Every section has to be
 * reachable from the nav and has to render — a section that throws only when a
 * customer clicks it is the failure this covers.
 */
const SECTION_ROOTS: Record<string, string> = {
  flow: '.tour-flow-map-workspace',
  storyboard: '.operations-storyboard',
  batch: '.tour-batch-workspace',
  templates: '.operations-templates',
  voice: '.operations-voice',
  record: '.operations-record',
  appearance: '.appearance-mode-shell',
  translation: '.operations-language',
  narration: '.operations-narration',
  copy: '.operations-copy',
  audience: '.operations-audience',
  experiment: '.operations-experiment',
  check: '.operations-check',
  analytics: '.operations-analytics',
  release: '.panel-release-truth',
  review: '.tour-review-workspace',
  recovery: '[data-panel-entry="release-history-result"]',
  diff: '.operations-diff',
  collaboration: '.operations-collaboration',
  audit: '.operations-audit',
  share: '.operations-share',
};

describe('operations sections', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openOperations(
    options: {
      baseDocument?: LodariqDocument;
      commercialUsage?: WorkspaceCommercialUsage;
      operations?: AuthoringOperationsServices;
      runLocaleLayoutQa?: (expectedDocumentRevision: number) => Promise<LocaleLayoutQaReport>;
      tab?: string;
    } = {},
  ): Promise<{
    baseDocument: LodariqDocument;
    peer: Window;
    saveDocument: ReturnType<typeof vi.fn>;
  }> {
    const baseDocument = options.baseDocument ?? (structuredClone(tourFixture) as LodariqDocument);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const saveDocument = vi.fn();
    let operations = options.operations;
    if (options.commercialUsage) {
      operations = {
        ...(operations ?? ({} as AuthoringOperationsServices)),
        readCommercialUsage: async () => structuredClone(options.commercialUsage!),
      };
    }
    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        translateDocument: vi.fn(),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
        ...(options.runLocaleLayoutQa ? { runLocaleLayoutQa: options.runLocaleLayoutQa } : {}),
        ...(operations ? { operations } : {}),
      },
      frameMode: 'panel',
      sessionId: SESSION_ID,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: peer,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: SESSION_ID,
          documentId: baseDocument.id,
          correlationId: 'open_operations_sections',
          type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
          action: 'open-operations',
          ...(options.tab ? { tab: options.tab } : {}),
        },
      }),
    );
    await vi.waitFor(() => expect(document.querySelector('.operations-hub')).not.toBeNull());
    return { baseDocument, peer, saveDocument };
  }

  const tabButton = (tab: string): HTMLButtonElement => {
    const button = document.querySelector<HTMLButtonElement>(`[data-operations-tab="${tab}"]`);
    if (!button) throw new Error(`Operations tab "${tab}" is missing from the nav`);
    return button;
  };

  it('groups every tab under exactly one heading', async () => {
    await openOperations();

    const groups = [...document.querySelectorAll('.operations-hub-nav .operations-hub-group')];
    expect(
      groups.map((group) => group.querySelector('.operations-hub-group-label')?.textContent),
    ).toEqual(['Author', 'Look', 'Reach', 'Prove', 'Ship']);

    const tabs = [...document.querySelectorAll('[data-operations-tab]')].map(
      (button) => (button as HTMLElement).dataset.operationsTab,
    );
    expect(tabs).toHaveLength(21);
    expect(new Set(tabs).size).toBe(21);
    for (const tab of Object.keys(SECTION_ROOTS)) {
      expect(tabs).toContain(tab);
    }
  });

  it.each(Object.entries(SECTION_ROOTS))('renders the %s section', async (tab, root) => {
    await openOperations();
    tabButton(tab).click();
    await vi.waitFor(() => expect(document.querySelector(root)).not.toBeNull());
    expect(tabButton(tab).getAttribute('aria-current')).toBe('page');
  });

  it('runs real host-page locale layouts and adds failed presentations to Check', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    baseDocument.localization = {
      defaultLocale: 'en',
      variants: [{ locale: 'fr-FR', fallbackLocale: 'en', blocks: [] }],
    };
    const runLocaleLayoutQa = vi.fn(
      async (documentRevision: number): Promise<LocaleLayoutQaReport> => ({
        schemaVersion: '1',
        documentRevision,
        contentHash: `sha256-${'a'.repeat(64)}`,
        checkedAt: '2026-08-22T12:00:00.000Z',
        viewport: { width: 390, height: 844 },
        checkedLocaleCount: 2,
        checkedStepCount: 5,
        checkedPresentationCount: 10,
        passedCount: 9,
        failedCount: 1,
        unavailableCount: 0,
        findingLimitReached: false,
        findings: [
          {
            locale: 'fr-FR',
            stepId: baseDocument.blocks[0]!.id,
            status: 'failed',
            issues: ['horizontal_overflow'],
          },
        ],
      }),
    );
    await openOperations({ baseDocument, runLocaleLayoutQa, tab: 'check' });

    const action = document.querySelector<HTMLButtonElement>('[data-check-action="locale-layout"]');
    expect(action?.disabled).toBe(false);
    action?.click();

    await vi.waitFor(() => expect(runLocaleLayoutQa).toHaveBeenCalledWith(0));
    await vi.waitFor(() =>
      expect(document.querySelector('[data-locale-layout-summary]')?.textContent).toContain(
        '10 presentations',
      ),
    );
    expect(document.querySelector('.operations-check')?.textContent).toContain(
      'In fr-FR, content runs past the card horizontally.',
    );
  });

  it('runs the workspace accessibility service and adds version-pinned findings to Check', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const result: AccessibilitySweepResult = {
      sweep: {
        schemaVersion: '2026-08-22.1',
        id: `a11ysweep_${'a'.repeat(24)}`,
        status: 'completed',
        requestedByUserId: 'user_ada',
        documentCount: 1,
        localeCount: 2,
        blockerCount: 1,
        warningCount: 0,
        startedAt: '2026-08-22T12:00:00.000Z',
        completedAt: '2026-08-22T12:00:01.000Z',
      },
      findings: [
        {
          schemaVersion: '2026-08-22.1',
          id: `a11yfinding_${'b'.repeat(24)}`,
          sweepId: `a11ysweep_${'a'.repeat(24)}`,
          documentId: baseDocument.id,
          documentVersionId: 'docver_accessibility',
          artifactId: 'artifact_accessibility',
          contentHash: `sha256-${'c'.repeat(64)}`,
          code: 'contrast_unusable',
          severity: 'blocker',
          status: 'open',
          locale: 'fr-FR',
          stepId: 'block_step_1',
          nodeId: null,
          measuredRatio: 1,
          requiredRatio: 4.5,
          revision: 1,
          resolvedByUserId: null,
          resolutionNote: null,
          resolvedAt: null,
          createdAt: '2026-08-22T12:00:01.000Z',
        },
      ],
    };
    const runAccessibilitySweep = vi.fn(async (_operationId: string) => structuredClone(result));
    await openOperations({
      baseDocument,
      operations: { ...audienceOperationsServices(), runAccessibilitySweep },
      tab: 'check',
    });

    const action = document.querySelector<HTMLButtonElement>('[data-check-action="a11y"]');
    expect(action?.disabled).toBe(false);
    action?.click();

    await vi.waitFor(() => expect(runAccessibilitySweep).toHaveBeenCalledOnce());
    expect(runAccessibilitySweep.mock.calls[0]?.[0]).toMatch(/^a11ysweepop_[a-f0-9]{32}$/u);
    await vi.waitFor(() =>
      expect(document.querySelector('[data-accessibility-sweep-summary]')?.textContent).toContain(
        '1 blockers',
      ),
    );
    expect(document.querySelector('.operations-check')?.textContent).toContain(
      'Text or control contrast is unusable',
    );
    expect(
      document.querySelector<HTMLButtonElement>('[data-check-action="publish"]')?.disabled,
    ).toBe(true);
  });

  it('keeps voice input reviewable until the creator adds the proposed step', async () => {
    const { saveDocument } = await openOperations({ tab: 'voice' });
    const voice = document.querySelector<HTMLElement>('.operations-voice');
    if (!voice) throw new Error('Voice authoring did not mount');
    const transcript = voice.querySelector<HTMLTextAreaElement>('textarea');
    if (!transcript) throw new Error('Voice transcript field did not mount');
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setTextareaValue?.call(
      transcript,
      'Create a step called Invite teammates. Show people where to add their team.',
    );
    transcript.dispatchEvent(new Event('input', { bubbles: true }));

    const prepare = [...voice.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Prepare step review'),
    );
    if (!prepare) throw new Error('Voice proposal action did not mount');
    prepare.click();
    await vi.waitFor(() =>
      expect(voice.querySelector('[data-voice-proposal="true"]')).not.toBeNull(),
    );
    expect(saveDocument).not.toHaveBeenCalled();

    const add = [...voice.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Add reviewed step to draft'),
    );
    if (!add) throw new Error('Voice commit action did not mount');
    add.click();
    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const lastSaveCall = saveDocument.mock.calls[saveDocument.mock.calls.length - 1];
    expect(JSON.stringify(lastSaveCall?.[0])).toContain('Invite teammates');
    expect(JSON.stringify(lastSaveCall?.[0])).toContain('Show people where to add their team.');
  });

  it('streams duplicate-tab selection, lock, and conflict state through the hosted bridge', async () => {
    const collaborationSnapshot = {
      selfParticipantId: `presence_${'a'.repeat(24)}`,
      generatedAt: '2026-08-21T10:00:00.000Z',
      documentUpdatedAt: '2026-08-21T10:00:01.000Z',
      draftChanged: true,
      peers: [
        {
          participantId: `presence_${'b'.repeat(24)}`,
          creatorId: 'user_ada',
          name: 'Ada Lovelace',
          stepId: 'block_step_2',
          selection: { type: 'block' as const, blockId: 'block_heading_2' },
          lastSeenAt: '2026-08-21T10:00:00.000Z',
          sameCreator: true,
        },
      ],
      locks: [
        {
          stepId: 'block_step_2',
          holderName: 'Ada Lovelace',
          holderParticipantId: `presence_${'b'.repeat(24)}`,
          expiresAt: '2026-08-21T10:03:00.000Z',
        },
      ],
      comments: [],
    };
    const heartbeatCollaboration = vi.fn(async () => collaborationSnapshot);
    const leaveCollaboration = vi.fn(async () => undefined);
    const operations = audienceOperationsServices();
    operations.heartbeatCollaboration = heartbeatCollaboration;
    operations.leaveCollaboration = leaveCollaboration;
    operations.subscribeCollaboration = (onSnapshot, onState) => {
      onState?.('reconnecting');
      queueMicrotask(() => onSnapshot(collaborationSnapshot));
      return vi.fn();
    };

    const { peer } = await openOperations({ operations, tab: 'collaboration' });
    await vi.waitFor(() => {
      expect(document.querySelector('.operations-collaboration')?.textContent).toContain(
        'You · another tab',
      );
    });
    expect(document.querySelector('.operations-collaboration')?.textContent).toContain(
      'The draft changed in another authoring session.',
    );
    expect(document.querySelector('.operations-collaboration')?.textContent).toContain('Selecting');
    expect(heartbeatCollaboration).toHaveBeenCalled();
    expect(
      vi
        .mocked(peer.postMessage)
        .mock.calls.some(
          ([message]) => (message as { type?: string }).type === AUTHORING_COLLABORATION_STATE_TYPE,
        ),
    ).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(leaveCollaboration).toHaveBeenCalled());
  });

  it('switches analytics to one immutable release and shows retention cohorts', async () => {
    const firstSegment = {
      id: `audseg_${'a'.repeat(64)}`,
      definitionVersion: 1 as const,
      ruleCount: 2,
    };
    const secondSegment = {
      id: `audseg_${'b'.repeat(64)}`,
      definitionVersion: 1 as const,
      ruleCount: 1,
    };
    const operations = audienceOperationsServices();
    operations.readAnalytics = async () => ({
      documentId: 'doc_tour_linear',
      environmentId: 'env_staging',
      shown: 4,
      completed: 2,
      dismissed: 1,
      funnel: [],
      adoption: [],
      formResponses: [],
      breakdown: {
        definitionVersion: 1,
        asOf: '2026-08-21T10:00:00.000Z',
        retentionDays: 90,
        retentionCutoff: '2026-05-23T10:00:00.000Z',
        releases: [
          {
            publicationId: 'pub_first',
            contentHash: `sha256-${'a'.repeat(64)}`,
            pointerGeneration: 3,
            audienceSegment: firstSegment,
            shown: 1,
            completed: 1,
            dismissed: 0,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
        ],
        locales: [],
        audienceSegments: [
          {
            ...firstSegment,
            shown: 3,
            completed: 2,
            dismissed: 1,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
          {
            ...secondSegment,
            shown: 1,
            completed: 0,
            dismissed: 0,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
        ],
        retention: [
          {
            week: 1,
            exposedCohort: 4,
            exposedReturned: 2,
            baselineCohort: 8,
            baselineReturned: 2,
          },
        ],
      },
    });
    await openOperations({
      operations,
      commercialUsage: commercialUsageFor('growth'),
      tab: 'analytics',
    });

    await vi.waitFor(() => expect(document.body.textContent).toContain('All retained releases'));
    expect(document.body.textContent).toContain('90 days retained · report definition v1');
    expect(document.body.textContent).toContain('2 rules');
    expect(document.body.textContent).toContain('1 rule');
    expect(document.body.textContent).toContain('Week');
    expect(document.body.textContent).toContain('50.0%');
    expect(document.body.textContent).toContain('25.0%');

    document
      .querySelector<HTMLButtonElement>('[aria-label="Release scope"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
    const release = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('Generation 3'),
    );
    if (!release) throw new Error('release scope option missing');
    release.click();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('1 rule'));
    expect(document.body.textContent).toContain('2 rules');
  });

  it('gates analytics exports by plan and monthly quota', async () => {
    const exportAnalytics = vi.fn().mockResolvedValue(undefined);
    await openOperations({
      operations: { ...audienceOperationsServices(), exportAnalytics },
      commercialUsage: commercialUsageFor('business'),
      tab: 'analytics',
    });
    await vi.waitFor(() => expect(document.querySelector('.operations-analytics')).not.toBeNull());
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('.operations-analytics button'),
    ];
    const csv = buttons.find((button) => button.textContent?.includes('Export CSV'));
    const raw = buttons.find((button) => button.textContent?.includes('Export raw'));
    expect(csv).toMatchObject({ disabled: false });
    expect(raw).toMatchObject({ disabled: false });
    csv?.click();
    raw?.click();
    await vi.waitFor(() => expect(exportAnalytics).toHaveBeenCalledTimes(2));
    expect(exportAnalytics.mock.calls.map((call) => call[0])).toEqual([
      'summary-csv',
      'raw-events-jsonl',
    ]);
  });

  it('keeps basic analytics visible when CSV export is not included', async () => {
    const operations = audienceOperationsServices();
    operations.readAnalytics = async () => ({
      documentId: 'doc_tour_linear',
      environmentId: 'env_staging',
      shown: 2,
      completed: 1,
      dismissed: 0,
      funnel: [],
      adoption: [],
      formResponses: [],
      breakdown: {
        definitionVersion: 1,
        asOf: '2026-08-21T10:00:00.000Z',
        retentionDays: 30,
        retentionCutoff: '2026-07-22T10:00:00.000Z',
        releases: [],
        locales: [],
        audienceSegments: [
          {
            id: `audseg_${'c'.repeat(64)}`,
            definitionVersion: 1,
            ruleCount: 2,
            shown: 2,
            completed: 1,
            dismissed: 0,
            funnel: [],
            adoption: [],
            formResponses: [],
          },
        ],
        retention: [],
      },
    });
    await openOperations({
      operations,
      commercialUsage: commercialUsageFor('free'),
      tab: 'analytics',
    });
    await vi.waitFor(() => expect(document.querySelector('.operations-analytics')).not.toBeNull());
    const csv = [
      ...document.querySelectorAll<HTMLButtonElement>('.operations-analytics button'),
    ].find((button) => button.textContent?.includes('Export CSV'));
    expect(csv).toMatchObject({ disabled: true });
    expect(csv?.title).toContain('not included');
    expect(document.body.textContent).not.toContain('Export raw');
    expect(document.body.textContent).not.toContain('2 rules');
    expect(document.body.textContent).toContain('Shown');
  });

  it('disables CSV export when the monthly allowance is consumed', async () => {
    await openOperations({
      operations: audienceOperationsServices(),
      commercialUsage: commercialUsageFor('scale', { analyticsExportsUsed: 100 }),
      tab: 'analytics',
    });
    await vi.waitFor(() => expect(document.querySelector('.operations-analytics')).not.toBeNull());
    const csv = [
      ...document.querySelectorAll<HTMLButtonElement>('.operations-analytics button'),
    ].find((button) => button.textContent?.includes('Export CSV'));
    expect(csv).toMatchObject({ disabled: true });
    expect(csv?.title).toContain('monthly analytics export limit');
  });

  it('keeps the demo link blocked until the structured artifact is reviewed', async () => {
    await openOperations();
    tabButton('share').click();
    await vi.waitFor(() => expect(document.querySelector('.operations-share')).not.toBeNull());

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.operations-share button')];
    const createLink = buttons.find((button) => button.textContent === 'Create the link');
    const review = buttons.find((button) => button.textContent === 'Review artifact');

    // Nothing captured yet, so neither publishing nor reviewing is reachable.
    expect(createLink?.disabled).toBe(true);
    expect(review?.disabled).toBe(true);
  });

  it('applies the measured experiment winner to the draft before release', async () => {
    const experiment = {
      id: 'exp_authoring',
      status: 'running' as const,
      varies: 'copy' as const,
      successEventName: 'project_created',
      allocationRevision: 1,
      arms: [
        { id: 'A' as const, label: 'Control', trafficPercent: 50, overrides: [] },
        {
          id: 'B' as const,
          label: 'Variant',
          trafficPercent: 50,
          overrides: [
            { type: 'copy' as const, blockId: 'block_heading_1', text: 'Create a project now' },
          ],
        },
      ],
    };
    const updateExperiment = vi.fn().mockResolvedValue({
      ...experiment,
      status: 'promoted' as const,
      promotedArmId: 'B' as const,
    });
    const operations: AuthoringOperationsServices = {
      ...audienceOperationsServices(),
      readExperiment: async () => ({
        experiment,
        results: {
          experimentId: experiment.id,
          environmentId: 'env_staging',
          allocationRevision: 1,
          arms: [
            { armId: 'A', exposures: 400, conversions: 40, conversionRate: 0.1 },
            { armId: 'B', exposures: 400, conversions: 120, conversionRate: 0.3 },
          ],
          leadingArmId: 'B',
          confidencePercent: 100,
        },
      }),
      updateExperiment,
    };
    const { saveDocument } = await openOperations({ operations, tab: 'experiment' });
    await vi.waitFor(() =>
      expect(document.querySelector('.operations-experiment')?.textContent).toContain(
        'Promote the winner',
      ),
    );
    const promote = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Promote the winner',
    );
    if (!promote) throw new Error('experiment promotion action missing');
    promote.click();

    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledOnce());
    const saved = saveDocument.mock.calls[0]?.[0] as LodariqDocument;
    expect(
      saved.blocks[0]?.children[0]?.children.find((block) => block.id === 'block_heading_1')
        ?.content,
    ).toBe('Create a project now');
    expect(updateExperiment).toHaveBeenCalledWith(experiment.id, { promotedArmId: 'B' });
    await vi.waitFor(() =>
      expect(document.querySelector('.operations-experiment')?.textContent).toContain(
        'Release it explicitly',
      ),
    );
  });

  it('adds a language as an empty draft and reports layout for each locale', async () => {
    const { saveDocument } = await openOperations({ tab: 'translation' });
    await vi.waitFor(() => expect(document.querySelector('.operations-language')).not.toBeNull());
    const add = document.querySelector<HTMLButtonElement>('[aria-label="Add a language"]');
    if (!add) throw new Error('add-language control missing');
    add.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull(), {
      timeout: 5_000,
    });
    const japanese = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (option) => option.textContent?.includes('日本語'),
    );
    if (!japanese) throw new Error('Japanese locale option missing');
    japanese.click();

    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledOnce());
    const saved = saveDocument.mock.calls[0]?.[0] as LodariqDocument;
    expect(saved.localization?.variants).toContainEqual({
      locale: 'ja',
      fallbackLocale: 'en',
      blocks: [],
    });
    expect(document.querySelector('.operations-language')?.textContent).toContain('日本語');
    expect(document.querySelector('.operations-language')?.textContent).toContain(
      'Layout by language',
    );
  }, 15_000);

  it('edits catalog-backed delivery rules and shows scheduled transitions', async () => {
    const { saveDocument } = await openOperations({
      operations: audienceOperationsServices(),
      tab: 'audience',
    });
    await vi.waitFor(() => {
      const audience = document.querySelector('.operations-audience');
      expect(audience?.textContent).toContain('account.plan');
      expect(audience?.textContent).toContain('checkout_completed');
      expect(audience?.textContent).toContain('Schedule production');
      expect(audience?.textContent).toContain('scheduled');
    });

    const addRule = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Add rule',
    );
    if (!addRule) throw new Error('catalog-backed audience rule action missing');
    addRule.click();
    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledOnce());
    expect((saveDocument.mock.calls[0]?.[0] as LodariqDocument).audience.rules).toContainEqual({
      source: 'identify',
      key: 'account.plan',
      operator: 'exists',
    });

    saveDocument.mockClear();
    const trigger = document.querySelector<HTMLSelectElement>(
      'select.ui-native-select-mirror[aria-label="Start condition"]',
    );
    if (!trigger) throw new Error('delivery trigger control missing');
    trigger.value = 'event';
    trigger.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledOnce());
    expect((saveDocument.mock.calls[0]?.[0] as LodariqDocument).trigger).toEqual({
      type: 'event',
      config: { eventName: 'checkout_completed' },
    });
  });

  it('simulates adaptive evidence and previews the explained skip path', async () => {
    const documentWithOutcome = structuredClone(tourFixture) as LodariqDocument;
    const firstStep = documentWithOutcome.blocks.find((block) => block.type === 'tourStep');
    if (!firstStep) throw new Error('tour step missing');
    firstStep.props.teaches = 'checkout_completed';
    const { peer } = await openOperations({
      baseDocument: documentWithOutcome,
      operations: audienceOperationsServices(),
      tab: 'audience',
    });
    await vi.waitFor(() =>
      expect(document.querySelector('.operations-audience')?.textContent).toContain(
        'checkout_completed',
      ),
    );

    const turnOn = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Turn on',
    );
    if (!turnOn) throw new Error('adaptive toggle missing');
    turnOn.click();
    const simulate = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Simulate done',
    );
    if (!simulate) throw new Error('adaptive simulation action missing');
    simulate.click();

    await vi.waitFor(() => {
      const audience = document.querySelector('.operations-audience');
      expect(audience?.textContent).toContain('Skip · demonstrated');
      expect(audience?.textContent).toContain('4 of 5 steps');
    });
    const preview = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Preview',
    );
    if (!preview) throw new Error('adaptive preview action missing');
    preview.click();
    await vi.waitFor(() =>
      expect(peer.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'authoring.preview.request',
          simulationContext: expect.objectContaining({
            adaptive: expect.objectContaining({
              evidence: [expect.objectContaining({ eventName: 'checkout_completed' })],
            }),
          }),
        }),
        window.location.origin,
      ),
    );
  });

  it.each([
    [
      'free',
      [
        'flow',
        'batch',
        'narration',
        'audience',
        'experiment',
        'release',
        'recovery',
        'collaboration',
        'audit',
      ],
    ],
    ['starter', ['batch', 'narration', 'audience', 'experiment', 'collaboration', 'audit']],
    ['growth', ['narration', 'audit']],
    ['scale', []],
  ] as const)(
    'shows the %s plan and disables only its unavailable sections',
    async (planId, disabledTabs) => {
      const usage = commercialUsageFor(planId);
      await openOperations({ commercialUsage: usage });
      await vi.waitFor(() => {
        expect(document.querySelector('.operations-hub-plan')?.textContent).toContain(
          `${planLabel(planId)} plan`,
        );
      });

      for (const tab of Object.keys(SECTION_ROOTS)) {
        expect(tabButton(tab).disabled, `${planId}:${tab}`).toBe(
          disabledTabs.includes(tab as never),
        );
      }
      expect(document.querySelector('.operations-hub-plan')?.textContent).toContain(
        `AI credits: 12 of ${usage.aiCredits.limit}`,
      );
      expect(document.querySelector('.operations-hub-plan')?.textContent).toContain(
        '4 languages in this experience',
      );
    },
  );

  it('keeps manual language work visible while enforcing Free locale and translation limits', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    baseDocument.localization = {
      defaultLocale: 'en',
      variants: [{ locale: 'de', fallbackLocale: 'en', blocks: [] }],
    };
    const usage = commercialUsageFor('free', { localesUsed: 2 });
    await openOperations({ baseDocument, commercialUsage: usage, tab: 'translation' });
    await vi.waitFor(() => expect(document.querySelector('.operations-language')).not.toBeNull());

    expect(tabButton('translation').disabled).toBe(false);
    const add = [
      ...document.querySelectorAll<HTMLButtonElement>('.operations-language button'),
    ].find((button) => button.textContent?.includes('Add a language'));
    const draft = [
      ...document.querySelectorAll<HTMLButtonElement>('.operations-language button'),
    ].find((button) => button.textContent?.includes('Draft every missing string'));
    expect(add).toMatchObject({ disabled: true });
    expect(add?.title).toContain('language limit');
    expect(draft).toMatchObject({ disabled: true });
    expect(draft?.title).toContain('not included');
  });

  it('disables Brand generation after the Free monthly run is consumed', async () => {
    const usage = commercialUsageFor('free', { themeRunsUsed: 1 });
    await openOperations({ commercialUsage: usage, tab: 'appearance' });
    await vi.waitFor(() => expect(document.querySelector('.appearance-mode-shell')).not.toBeNull());
    const match = [
      ...document.querySelectorAll<HTMLButtonElement>('.appearance-mode-shell button'),
    ].find((button) => button.textContent?.includes('Match product'));
    expect(match).toMatchObject({ disabled: true });
    expect(match?.title).toContain('generation limit');
  });

  it('edits every supported card field and restores the storyboard view', async () => {
    const baseDocument = twoStepDocument();
    const { peer, saveDocument } = await openOperations({ baseDocument, tab: 'storyboard' });
    await vi.waitFor(() => expect(document.querySelectorAll('.storyboard-card')).toHaveLength(2));
    expect(document.querySelectorAll('.storyboard-card textarea')).toHaveLength(6);

    const body = document.querySelector<HTMLElement>('.operations-hub-body');
    const secondBody = document.querySelector<HTMLTextAreaElement>(
      '[data-operations-focus-key="storyboard-card:block_step_2:block_paragraph_1_2"]',
    );
    if (!body || !secondBody) throw new Error('storyboard fields missing');
    body.scrollTop = 91;
    body.dispatchEvent(new Event('scroll', { bubbles: true }));
    secondBody.value = 'This draft survives closing Operations.';
    secondBody.focus();

    dispatchOperationsAction(peer, baseDocument.id, 'close-operations');
    await vi.waitFor(() => expect(document.querySelector('.operations-hub')).toBeNull());
    expect(saveDocument).toHaveBeenCalledOnce();

    dispatchOperationsAction(peer, baseDocument.id, 'open-operations');
    await vi.waitFor(() => expect(document.querySelector('.operations-storyboard')).not.toBeNull());
    const restored = document.querySelector<HTMLTextAreaElement>(
      '[data-operations-focus-key="storyboard-card:block_step_2:block_paragraph_1_2"]',
    );
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>('.operations-hub-body')?.scrollTop).toBe(91);
      expect(document.activeElement).toBe(restored);
    });
    expect(restored?.value).toBe('This draft survives closing Operations.');

    tabButton('review').click();
    await vi.waitFor(() => {
      expect(document.querySelector('.tour-review-workspace')?.textContent).toContain(
        'Second step',
      );
    });
  });

  it('reorders storyboard cards from the keyboard in one completed write', async () => {
    const { saveDocument } = await openOperations({
      baseDocument: twoStepDocument(),
      tab: 'storyboard',
    });
    await vi.waitFor(() => expect(document.querySelectorAll('.storyboard-card')).toHaveLength(2));
    const second = document.querySelector<HTMLElement>('[data-block-id="block_step_2"]');
    if (!second) throw new Error('second storyboard card missing');
    second.focus();
    second.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, key: 'ArrowUp' }),
    );

    await vi.waitFor(() => {
      expect(
        [...document.querySelectorAll<HTMLElement>('.storyboard-card')].map(
          (card) => card.dataset.blockId,
        ),
      ).toEqual(['block_step_2', 'block_step_1']);
    });
    expect(saveDocument).toHaveBeenCalledOnce();
  });
});

function dispatchOperationsAction(
  peer: Window,
  documentId: string,
  action: 'close-operations' | 'open-operations',
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      source: peer,
      data: {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: SESSION_ID,
        documentId,
        correlationId: `${action}_storyboard_state`,
        type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
        action,
      },
    }),
  );
}

function twoStepDocument(): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  const first = document.blocks[0];
  if (!first) throw new Error('tour fixture has no step');
  const second = suffixBlock(first, '_2');
  second.id = 'block_step_2';
  second.props = { ...second.props, index: 1 };
  const heading = findBlock(second, 'heading');
  if (heading) heading.content = 'Second step';
  document.blocks = [first, second];
  return document;
}

function suffixBlock(block: LodariqBlock, suffix: string): LodariqBlock {
  return {
    ...structuredClone(block),
    id: `${block.id}${suffix}`,
    children: block.children.map((child) => suffixBlock(child, suffix)),
  };
}

function findBlock(block: LodariqBlock, type: LodariqBlock['type']): LodariqBlock | null {
  if (block.type === type) return block;
  for (const child of block.children) {
    const found = findBlock(child, type);
    if (found) return found;
  }
  return null;
}

function commercialUsageFor(
  planId: CommercialPlanId,
  options: { localesUsed?: number; themeRunsUsed?: number; analyticsExportsUsed?: number } = {},
): WorkspaceCommercialUsage {
  const limits = resolveCommercialEntitlements(planId);
  return {
    planId,
    planVersion: COMMERCIAL_PLAN_VERSION,
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: '2026-09-01T00:00:00.000Z',
    engagedUsers: commercialUsageValue(0, limits.engagedUsersPerMonth, 'soft'),
    liveExperiences: commercialUsageValue(2, limits.liveExperiences, 'hard'),
    creatorSeats: commercialUsageValue(1, limits.creatorSeats, 'hard'),
    applications: commercialUsageValue(1, limits.applications, 'hard'),
    locales: commercialUsageValue(options.localesUsed ?? 1, limits.locales, 'hard'),
    environments: commercialUsageValue(1, limits.environments, 'hard'),
    aiCredits: commercialUsageValue(12, limits.aiCreditsPerMonth, 'hard'),
    themeGenerationRuns: commercialUsageValue(
      options.themeRunsUsed ?? 0,
      limits.themeGenerationRuns,
      'hard',
    ),
    analyticsExports: commercialUsageValue(
      options.analyticsExportsUsed ?? 0,
      limits.analyticsExportsPerMonth,
      'hard',
    ),
    assetBytes: limits.assetBytes,
    analyticsRetentionDays: limits.analyticsRetentionDays,
    versionRetentionDays: limits.versionRetentionDays,
    removeBadge: limits.removeBadge,
    features: [...limits.features],
  };
}

function planLabel(planId: CommercialPlanId): string {
  return `${planId[0]!.toUpperCase()}${planId.slice(1)}`;
}

function audienceOperationsServices(): AuthoringOperationsServices {
  return {
    readMeasurement: async () => ({
      documentId: 'doc_tour_linear',
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    }),
    updateMeasurement: async (request) => ({
      documentId: 'doc_tour_linear',
      adaptivePolicy: request.adaptivePolicy ?? {
        enabled: false,
        minimumOccurrences: 2,
        lookbackDays: 30,
      },
    }),
    readAnalytics: async () => ({
      documentId: 'doc_tour_linear',
      environmentId: 'env_staging',
      shown: 0,
      completed: 0,
      dismissed: 0,
      funnel: [],
      adoption: [],
      formResponses: [],
    }),
    readExperiment: async () => ({ experiment: null, results: null }),
    createExperiment: async () => Promise.reject(new Error('not used')),
    updateExperiment: async () => Promise.reject(new Error('not used')),
    listComments: async () => [],
    addComment: async () => Promise.reject(new Error('not used')),
    replyToComment: async () => Promise.reject(new Error('not used')),
    resolveComment: async () => Promise.reject(new Error('not used')),
    listStepLocks: async () => [],
    claimStepLock: async (stepId) => ({
      acquired: true,
      canTakeover: true,
      lock: {
        stepId,
        holderName: 'Ada',
        expiresAt: '2026-08-21T10:05:00.000Z',
      },
    }),
    listApplications: async () => [],
    readDataCatalog: async () => ({
      schemaVersion: '1',
      version: 2,
      updatedAt: '2026-08-21T10:00:00.000Z',
      entries: [
        {
          id: 'catalog_plan',
          source: 'identify_trait',
          key: 'account.plan',
          environments: ['staging'],
          valueType: 'string',
          lastSeenAt: '2026-08-21T10:00:00.000Z',
        },
        {
          id: 'catalog_checkout',
          source: 'track_event',
          key: 'checkout_completed',
          environments: ['staging'],
          valueType: 'unknown',
          lastSeenAt: '2026-08-21T10:00:00.000Z',
        },
      ],
    }),
    listDeliverySchedules: async () => [
      {
        id: 'schedule_authoring',
        workspaceId: 'wk_authoring',
        environmentId: 'env_production',
        documentId: 'doc_tour_linear',
        publicationId: 'pub_authoring',
        artifactId: 'artifact_authoring',
        contentHash: `sha256-${'a'.repeat(64)}`,
        startAt: '2099-01-01T01:00:00.000Z',
        endAt: '2099-01-01T02:00:00.000Z',
        expectedGeneration: 0,
        status: 'scheduled',
        revision: 1,
        createdByUserId: 'user_ada',
        createdAt: '2026-08-21T10:00:00.000Z',
        updatedAt: '2026-08-21T10:00:00.000Z',
      },
    ],
    listDeliveryTransitionHistory: async () => [],
  };
}
