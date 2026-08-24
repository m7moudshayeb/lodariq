// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type AuthoringReleaseFinding,
  type AuthoringStagingReleaseState,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame, type LocalAuthoringFrameServices } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_release_findings_ui';
let mountedPeer: Window | null = null;

describe('authoring Release options findings', () => {
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

  it('renders every deduplicated finding with textual severity and restores keyboard focus', async () => {
    const findings: AuthoringReleaseFinding[] = [
      finding('contrast_unusable', 'blocker', 'Text contrast is unusable'),
      finding('compact_viewport_risk', 'warning', 'Compact viewport may clip content'),
      finding('target_health', 'blocker', 'One placement target is unhealthy'),
      finding('contrast_unusable', 'blocker', 'Text contrast is unusable'),
    ];
    const saveDocument = vi.fn();
    await mountFrame(vi.fn().mockResolvedValue(releaseState({ findings })), { saveDocument });

    const selectedStepLabel = document
      .querySelector<HTMLElement>('.overlay-step-shell')
      ?.getAttribute('aria-label');
    const releaseEntry = await waitForReleaseEntry('blocked');
    expect(releaseEntry.dataset['panelEntry']).toBe('release');
    expect(document.querySelector('.panel-release-summary')?.textContent).toBe(
      'Needs attention · 3 findings',
    );

    releaseEntry.focus();
    releaseEntry.click();

    const findingsList = await waitForFindingsList();
    const findingRows = [...findingsList.querySelectorAll('li')];
    expect(findingRows).toHaveLength(3);
    expect(findingsList.textContent).toContain('Text contrast is unusable');
    expect(findingsList.textContent).toContain('Compact viewport may clip content');
    expect(findingsList.textContent).toContain('One placement target is unhealthy');
    expect(findingsList.textContent).toContain('Severity: Blocker');
    expect(findingsList.textContent).toContain('Severity: Warning');
    expect(
      findingRows.filter((row) => row.textContent?.includes('Text contrast is unusable')),
    ).toHaveLength(1);

    backToAuthoringButton().click();
    await vi.waitFor(() => {
      expect(document.querySelector('.overlay-step-shell')).not.toBeNull();
    });
    expect(
      document.querySelector<HTMLElement>('.overlay-step-shell')?.getAttribute('aria-label'),
    ).toBe(selectedStepLabel);
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'unstaged direct state',
      state: releaseState({
        draftArtifactId: null,
        draftContentHash: null,
        findings: [finding('draft_warning', 'warning', 'Draft requires review')],
        state: 'no_saved_artifact',
      }),
    },
    {
      label: 'staged hosted-normalized state',
      state: releaseState({
        activeContentHash: contentHash('a'),
        findings: [finding('staged_warning', 'warning', 'Staged copy is unusually long')],
        state: 'current',
      }),
    },
  ])('keeps findings visible in the $label branch', async ({ state }) => {
    await mountFrame(vi.fn().mockResolvedValue(state));
    const releaseEntry = await waitForReleaseEntry(state.state === 'current' ? 'current' : 'ready');
    releaseEntry.click();

    const findingsList = await waitForFindingsList();
    expect(findingsList.querySelectorAll('li')).toHaveLength(1);
    expect(findingsList.textContent).toContain(state.findings[0]!.label);
    expect(findingsList.textContent).toContain('Severity: Warning');
  });

  it('replaces the displayed findings after a direct save refresh without closing Release options', async () => {
    const initial = releaseState({
      findings: [finding('initial_warning', 'warning', 'Initial release warning')],
    });
    const refreshed = releaseState({
      findings: [
        finding('refreshed_warning', 'warning', 'Refreshed release warning'),
        finding('refreshed_blocker', 'blocker', 'Refreshed release blocker'),
      ],
    });
    const getReleaseState = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    await mountFrame(getReleaseState, { peer });

    const releaseEntry = await waitForReleaseEntry('ready');
    releaseEntry.click();
    expect((await waitForFindingsList()).textContent).toContain('Initial release warning');

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: peer,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: SESSION_ID,
          documentId: tourFixture.id,
          correlationId: 'save_request_release_findings',
          type: 'authoring.save.request',
        },
      }),
    );

    await vi.waitFor(() => expect(getReleaseState).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => {
      const list = document.querySelector<HTMLUListElement>('[aria-label="Release findings"]');
      expect(list?.textContent).toContain('Refreshed release warning');
      expect(list?.textContent).toContain('Refreshed release blocker');
      expect(list?.textContent).not.toContain('Initial release warning');
      expect(list?.querySelectorAll('li')).toHaveLength(2);
    });
    expect(backToAuthoringButton()).toBeTruthy();
  });

  it('counts remote findings with every local blocker and renders more than four local items', async () => {
    const baseDocument = documentWithLocalBlockers(7);
    await mountFrame(
      vi.fn().mockResolvedValue(
        releaseState({
          findings: [finding('remote_warning', 'warning', 'Remote release warning')],
        }),
      ),
      { baseDocument },
    );

    const releaseEntry = await waitForReleaseEntry('ready');
    releaseEntry.click();

    expect((await waitForFindingsList()).textContent).toContain('Remote release warning');
    let localFindingCount = 0;
    await vi.waitFor(() => {
      const blockerTitle = document.querySelector('#blocker-title')?.textContent ?? '';
      const count = Number.parseInt(blockerTitle, 10);
      expect(count).toBeGreaterThan(4);
      localFindingCount = count;
    });

    buttonWithText('Take me to Check').click();
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.operations-check .ops-list > li').length).toBeGreaterThan(
        4,
      );
    });

    document.querySelector<HTMLButtonElement>('.operations-hub-close')?.click();
    await waitForReleaseEntry('ready');
    await vi.waitFor(() => {
      expect(document.querySelector('.panel-release-summary')?.textContent).toBe(
        `Ready to stage · ${localFindingCount + 1} findings`,
      );
    });
  });

  it('opens the exact missing button setting from a local release blocker', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const button = findBlock(baseDocument.blocks, 'block_button_1');
    if (!button) throw new Error('Tour fixture button is missing');
    delete button.props.action;
    await mountFrame(vi.fn().mockResolvedValue(releaseState()), { baseDocument });

    const releaseEntry = await waitForReleaseEntry('ready');
    releaseEntry.click();
    buttonWithText('Take me to Check').click();

    let repairButton: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      repairButton = document.querySelector<HTMLButtonElement>(
        '[data-publish-issue-code="button_missing_action"]',
      );
      expect(repairButton?.textContent).toContain('Take me there');
    });
    repairButton!.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          '.rich-content-button-preview-shell[data-block-id="block_button_1"]',
        ),
      ).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>(
        '.rich-content-button-preview-shell[data-block-id="block_button_1"] .rich-content-button-preview',
      )
      ?.click();
    await vi.waitFor(() => {
      const actionControl = document.querySelector<HTMLElement>(
        '[data-property-id="button.action"]',
      );
      expect(actionControl).not.toBeNull();
      expect(actionControl?.querySelector('button')).not.toBeNull();
    });
    expect(document.querySelector('.release-blocker-card')).toBeNull();

    document
      .querySelector<HTMLButtonElement>(
        '.storyboard-property-tray[data-tool-mode="content"] .storyboard-tray-close',
      )
      ?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-property-id="button.action"]')).toBeNull();
    });
  });

  it('opens placement repair from a missing-target blocker', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const tooltip = findBlock(baseDocument.blocks, 'block_tooltip_1');
    if (!tooltip) throw new Error('Tour fixture tooltip is missing');
    delete tooltip.props.targetId;
    await mountFrame(vi.fn().mockResolvedValue(releaseState()), { baseDocument });

    const releaseEntry = await waitForReleaseEntry('ready');
    releaseEntry.click();
    buttonWithText('Take me to Check').click();

    let repairButton: HTMLButtonElement | null = null;
    await vi.waitFor(() => {
      repairButton = document.querySelector<HTMLButtonElement>(
        '[data-publish-issue-code="missing_step_target"]',
      );
      expect(repairButton?.textContent).toContain('Take me there');
    });
    repairButton!.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.overlay-choose-target')).not.toBeNull();
    });
    expect(mountedPeer?.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'target.pick.start' }),
      window.location.origin,
    );
  });
});

async function mountFrame(
  getReleaseState: NonNullable<LocalAuthoringFrameServices['getReleaseState']>,
  {
    baseDocument = tourFixture as LodariqDocument,
    peer = { postMessage: vi.fn() } as unknown as Window,
    saveDocument = vi.fn(),
  }: {
    baseDocument?: LodariqDocument;
    peer?: Window;
    saveDocument?: LocalAuthoringFrameServices['saveDocument'];
  } = {},
): Promise<void> {
  mountedPeer = peer;
  await mountLocalAuthoringFrame({
    root: document.getElementById('authoring')!,
    baseDocument,
    services: {
      loadDocument: () => null,
      saveDocument,
      exportDocument: (document) => JSON.stringify(document, null, 2),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      getReleaseState,
      persistDocument: vi.fn().mockResolvedValue(undefined),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
    },
    frameMode: 'panel',
    sessionId: SESSION_ID,
    peerWindow: peer,
    allowedOrigins: [window.location.origin],
    targetOrigin: window.location.origin,
  });
}

async function waitForReleaseEntry(status: string): Promise<HTMLButtonElement> {
  if (!mountedPeer) throw new Error('authoring frame peer is missing');
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      source: mountedPeer,
      data: {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: SESSION_ID,
        documentId: (tourFixture as LodariqDocument).id,
        correlationId: `open_release_${status}`,
        type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
        action: 'open-release',
      },
    }),
  );
  await vi.waitFor(() => {
    expect(
      document.querySelector<HTMLElement>('[aria-label="Release status"]')?.dataset[
        'releaseStatus'
      ],
    ).toBe(status);
  });
  const entry = document.querySelector<HTMLButtonElement>(
    '.panel-workspace-footer [data-panel-entry="release"]',
  );
  if (!entry) throw new Error('Release options entry is missing');
  return entry;
}

async function waitForFindingsList(): Promise<HTMLUListElement> {
  await vi.waitFor(() =>
    expect(document.querySelector('[aria-label="Release findings"]')).not.toBeNull(),
  );
  return document.querySelector<HTMLUListElement>('[aria-label="Release findings"]')!;
}

function backToAuthoringButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Back to authoring"]',
  );
  if (!button) throw new Error('Back to authoring button is missing');
  return button;
}

function buttonWithText(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button "${label}" is missing`);
  return button;
}

function releaseState(
  overrides: Partial<AuthoringStagingReleaseState> = {},
): AuthoringStagingReleaseState {
  return {
    available: true,
    environment: 'staging',
    environmentId: 'env_staging',
    documentId: tourFixture.id,
    expectedGeneration: 2,
    draftArtifactId: 'artifact_draft_2',
    draftContentHash: contentHash('a'),
    activeContentHash: null,
    state: 'ready',
    findings: [],
    ...overrides,
  };
}

function finding(
  code: string,
  severity: AuthoringReleaseFinding['severity'],
  label: string,
): AuthoringReleaseFinding {
  return { code, severity, label };
}

function contentHash(character: string): string {
  return `sha256-${character.repeat(64)}`;
}

function documentWithLocalBlockers(count: number): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  const template = document.blocks[0];
  if (!template) throw new Error('Tour fixture step is missing');
  document.blocks = Array.from({ length: count }, (_, index) => {
    const step = structuredClone(template);
    suffixBlockIds(step, index + 1);
    step.props.index = index;
    const tooltip = step.children.find((block) => block.type === 'tooltip');
    if (!tooltip) throw new Error('Tour fixture tooltip is missing');
    delete tooltip.props.targetId;
    return step;
  });
  return document;
}

function suffixBlockIds(block: LodariqBlock, suffix: number): void {
  block.id = `${block.id}_${suffix}`;
  for (const child of block.children) suffixBlockIds(child, suffix);
}

function findBlock(blocks: LodariqBlock[], blockId: string): LodariqBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findBlock(block.children, blockId);
    if (child) return child;
  }
  return null;
}
