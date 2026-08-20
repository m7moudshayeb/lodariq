// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import type { LocalAuthoringFrameServices } from '@lodariq/sdk-authoring/authoring-frame';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  blockContentPath,
  type AiAssistProposal,
} from '../../../../../packages/sdk-authoring/src/authoring/ai/assist-contract';

const STEP_ID = 'step_assist';
const BODY_ID = 'body_assist';

describe('assist wiring (§7.4, §7.5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('previews without writing, then writes only on accept', async () => {
    const saveDocument = vi.fn();
    const controller = createController(
      { requestAiAssist: vi.fn(async () => rewriteProposal()) },
      saveDocument,
    );

    controller.askAiAssist({
      kind: 'rewrite',
      scope: 'selection',
      verb: 'shorter',
      text: 'A much longer body',
    });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('previewing'),
    );
    expect(bodyContent(controller)).toBe('A much longer body');
    expect(saveDocument).not.toHaveBeenCalled();

    controller.acceptAiAssist();

    expect(bodyContent(controller)).toBe('Short body');
    expect(saveDocument).toHaveBeenCalled();
  });

  it('rejecting leaves the document untouched', async () => {
    const controller = createController({ requestAiAssist: vi.fn(async () => rewriteProposal()) });
    controller.askAiAssist({ kind: 'command', scope: 'step', prompt: 'tighten', stepIds: [STEP_ID] });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('previewing'),
    );

    controller.rejectAiAssist();

    expect(bodyContent(controller)).toBe('A much longer body');
    expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('idle');
  });

  it('holds a batch proposal at a confirm before writing', async () => {
    const controller = createController({ requestAiAssist: vi.fn(async () => rewriteProposal('de')) });
    controller.askAiAssist({ kind: 'translate', scope: 'batch', locale: 'de', stepIds: [STEP_ID] });
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('previewing'),
    );

    controller.acceptAiAssist();
    expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('confirming');
    expect(bodyContent(controller)).toBe('A much longer body');

    controller.confirmAiAssist();
    // A translation draft writes a locale variant, never the default copy (§7.6).
    expect(bodyContent(controller)).toBe('A much longer body');
    const variant = controller
      .getSnapshot()
      .documentState.localization?.variants.find((item) => item.locale === 'de');
    expect(variant?.blocks.find((block) => block.blockId === BODY_ID)?.content).toBe('Short body');
  });

  it('drops a response that lands after a newer ask', async () => {
    const slow = deferred<AiAssistProposal>();
    const fast = deferred<AiAssistProposal>();
    const requestAiAssist = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const controller = createController({ requestAiAssist });

    const ask = { kind: 'command', scope: 'step', prompt: 'a', stepIds: [STEP_ID] } as const;
    controller.askAiAssist(ask);
    controller.askAiAssist({ ...ask, prompt: 'b' });
    fast.resolve(rewriteProposal());
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('previewing'),
    );
    slow.resolve({ ...rewriteProposal(), summary: 'Stale' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(controller.getSnapshot().panelWorkflow.assist.proposal?.summary).not.toBe('Stale');
  });

  it('reports assist as unavailable rather than half-working', () => {
    const controller = createController({});
    expect(controller.getSnapshot().panelWorkflow.assistAvailable).toBe(false);

    controller.askAiAssist({ kind: 'command', scope: 'step', prompt: 'x', stepIds: [STEP_ID] });

    const assist = controller.getSnapshot().panelWorkflow.assist;
    expect(assist.phase).toBe('failed');
    expect(assist.error).toContain('authenticated authoring session');
  });

  it('never applies an edit the design-system guardrail forbids', async () => {
    const controller = createController({
      requestAiAssist: vi.fn(async () => ({
        proposalId: 'assist_theme',
        summary: 'Recolour the card',
        edits: [{ path: 'theme.colors.accent', before: '#000000', after: '#ff0000' }],
      })),
    });

    controller.askAiAssist({ kind: 'command', scope: 'step', prompt: 'recolour', stepIds: [STEP_ID] });
    await vi.waitFor(() => expect(controller.getSnapshot().panelWorkflow.assist.phase).toBe('failed'));
    expect(controller.getSnapshot().panelWorkflow.assist.error).toContain('theme styles');
  });
});

function rewriteProposal(locale?: string): AiAssistProposal {
  return {
    proposalId: 'assist_1',
    summary: 'Shortened the body',
    edits: [
      {
        path: blockContentPath(BODY_ID),
        before: 'A much longer body',
        after: 'Short body',
        ...(locale ? { locale } : {}),
      },
    ],
  };
}

function bodyContent(controller: LocalAuthoringFrameController): string | undefined {
  const step = controller.getSnapshot().documentState.blocks.find((block) => block.id === STEP_ID);
  const tooltip = step?.children.find((child) => child.type === 'tooltip');
  return tooltip?.children.find((child) => child.id === BODY_ID)?.content;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function createController(
  overrides: Pick<LocalAuthoringFrameServices, 'requestAiAssist'>,
  saveDocument = vi.fn(),
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: stepDocument(),
    services: {
      loadDocument: () => null,
      saveDocument,
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
      ...overrides,
    },
    sessionId: 'session_assist',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function stepDocument(): LodariqDocument {
  return {
    id: 'doc_assist',
    workspaceId: 'wk_assist',
    type: 'tour',
    status: 'draft',
    title: 'Assist',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: STEP_ID,
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_assist',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [
              {
                id: BODY_ID,
                type: 'paragraph',
                props: {},
                status: 'ready',
                content: 'A much longer body',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}
