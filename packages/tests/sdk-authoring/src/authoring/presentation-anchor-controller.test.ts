// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage, type LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';

const sessionId = 'session_exact_area';

describe('exact-area authoring controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addresses the nested target-bearing tooltip and persists a correlated region patch', () => {
    vi.useFakeTimers();
    const { controller, peer, saveDocument } = createController();
    controller.start();

    controller.startPresentationAnchorPick('step_1', 'target_1');
    const start = outbound(peer, 'presentation.anchor.pick.start')[0];
    if (!start) throw new Error('presentation anchor start missing');

    expect(start).toMatchObject({ blockId: 'tooltip_1', targetId: 'target_1' });
    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_exact_area',
      correlationId: 'exact_area_result',
      type: 'presentation.anchor.pick.result',
      requestCorrelationId: start.correlationId,
      blockId: 'tooltip_1',
      targetId: 'target_1',
      presentationAnchor: {
        kind: 'region',
        xRatio: 0.1,
        yRatio: 0.2,
        widthRatio: 0.4,
        heightRatio: 0.5,
      },
    });
    vi.runOnlyPendingTimers();

    expect(
      controller.getSnapshot().documentState.blocks[0]?.children[0]?.props.presentationAnchor,
    ).toEqual({
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.2,
      widthRatio: 0.4,
      heightRatio: 0.5,
    });
    expect(saveDocument).toHaveBeenCalled();
    expect(outbound(peer, 'preview.patch')).toContainEqual(
      expect.objectContaining({
        blockId: 'tooltip_1',
        patch: {
          ops: [
            {
              op: 'setPresentationAnchor',
              presentationAnchor: {
                kind: 'region',
                xRatio: 0.1,
                yRatio: 0.2,
                widthRatio: 0.4,
                heightRatio: 0.5,
              },
            },
          ],
        },
      }),
    );

    controller.destroy();
  });

  it('ignores stale and semantically overflowing exact-area results', () => {
    const { controller, peer } = createController();
    controller.start();
    controller.startPresentationAnchorPick('step_1', 'target_1');
    const first = outbound(peer, 'presentation.anchor.pick.start')[0];
    controller.startPresentationAnchorPick('step_1', 'target_1');
    const second = outbound(peer, 'presentation.anchor.pick.start')[1];
    if (!first || !second) throw new Error('presentation anchor starts missing');

    dispatchResult(peer, first.correlationId, {
      kind: 'point',
      xRatio: 0.25,
      yRatio: 0.75,
    });
    expect(
      controller.getSnapshot().documentState.blocks[0]?.children[0]?.props.presentationAnchor,
    ).toBeUndefined();

    dispatchResult(peer, second.correlationId, {
      kind: 'region',
      xRatio: 0.8,
      yRatio: 0.2,
      widthRatio: 0.4,
      heightRatio: 0.3,
    });
    expect(
      controller.getSnapshot().documentState.blocks[0]?.children[0]?.props.presentationAnchor,
    ).toBeUndefined();

    controller.destroy();
  });

  it('returns a custom anchor to implicit whole-element bounds in one action', () => {
    vi.useFakeTimers();
    const document = exactAreaDocument();
    document.blocks[0]!.children[0]!.props.presentationAnchor = {
      kind: 'point',
      xRatio: 0.4,
      yRatio: 0.6,
    };
    const { controller, peer } = createController(document);
    controller.start();

    controller.useWholeElement('step_1', 'target_1');

    expect(
      controller.getSnapshot().documentState.blocks[0]?.children[0]?.props.presentationAnchor,
    ).toBeUndefined();
    vi.runAllTimers();
    expect(outbound(peer, 'preview.patch')).toContainEqual(
      expect.objectContaining({
        blockId: 'tooltip_1',
        patch: { ops: [{ op: 'setPresentationAnchor' }] },
      }),
    );

    controller.destroy();
  });

  it('clears exact-area ratios when the owning target is replaced', () => {
    vi.useFakeTimers();
    const document = exactAreaDocument();
    document.blocks[0]!.children[0]!.props.presentationAnchor = {
      kind: 'region',
      xRatio: 0.1,
      yRatio: 0.15,
      widthRatio: 0.5,
      heightRatio: 0.4,
    };
    const { controller, peer } = createController(document);
    controller.start();

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_exact_area',
      correlationId: 'replacement_result',
      type: 'target.pick.result',
      blockId: 'step_1',
      fingerprint: {
        tagName: 'section',
        role: 'region',
        accessibleName: 'Updated usage chart',
        stableAttributes: { 'data-testid': 'updated-usage-chart' },
      },
    });

    expect(
      controller.getSnapshot().documentState.blocks[0]?.children[0]?.props.presentationAnchor,
    ).toBeUndefined();
    vi.runOnlyPendingTimers();
    expect(outbound(peer, 'preview.patch')).toContainEqual(
      expect.objectContaining({
        blockId: 'tooltip_1',
        patch: { ops: [{ op: 'setPresentationAnchor' }] },
      }),
    );

    controller.destroy();
  });

  it('rechecks an existing placement with click actionability when its action changes', () => {
    const document = exactAreaDocument();
    document.targets[0]!.identity = {
      schemaVersion: 2,
      targetId: 'target_1',
      intent: {
        elementKind: 'control',
        requiredAction: 'anchor',
        resolutionMode: 'semantic',
      },
      invariants: {},
      semantics: { tagName: 'a' },
      context: { ancestorRoles: ['nav'] },
      localizedEvidence: [{ locale: 'en', accessibleName: 'Projects' }],
      captureEvidence: {
        sampleCount: 3,
        stableSignalFamilies: ['element-semantics', 'ancestor-context', 'localized-text'],
        uniqueCandidateCount: 1,
        runnerUpMargin: 0.25,
        quality: 'usable',
      },
      display: { authorLabel: 'Projects' },
    };
    document.blocks[0]!.children[0]!.children = [
      {
        id: 'button_1',
        type: 'button',
        props: { action: { type: 'next' } },
        content: 'Continue',
        status: 'ready',
        children: [],
      },
    ];
    const { controller, peer } = createController(document);
    controller.start();

    controller.setButtonAction('button_1', 'clickTarget');

    const inspections = outbound(peer, 'target.inspect.request');
    const inspection = inspections[inspections.length - 1];
    expect(inspection).toMatchObject({
      blockId: 'step_1',
      targetId: 'target_1',
      action: 'health',
      identity: {
        intent: {
          elementKind: 'control',
          requiredAction: 'observe-click',
          resolutionMode: 'semantic',
        },
      },
    });
    expect(controller.getSnapshot().documentState.targets[0]?.identity?.intent).toEqual({
      elementKind: 'control',
      requiredAction: 'anchor',
      resolutionMode: 'semantic',
    });

    controller.destroy();
  });
});

function createController(document = exactAreaDocument()): {
  controller: LocalAuthoringFrameController;
  peer: Window;
  saveDocument: ReturnType<typeof vi.fn>;
} {
  const peer = { postMessage: vi.fn() } as unknown as Window;
  const saveDocument = vi.fn();
  const controller = new LocalAuthoringFrameController({
    root: documentElement(),
    baseDocument: structuredClone(document),
    services: {
      loadDocument: () => structuredClone(document),
      saveDocument,
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn(),
      recordMetric: vi.fn(),
      getMetricsSummary: vi.fn(() => ({})),
      exportMetricsReport: vi.fn(() => '{}'),
    },
    frameMode: 'panel',
    sessionId,
    peerWindow: peer,
    allowedOrigins: [window.location.origin],
    targetOrigin: window.location.origin,
  });
  return { controller, peer, saveDocument };
}

function exactAreaDocument(): LodariqDocument {
  return {
    id: 'doc_exact_area',
    workspaceId: 'wk_exact_area',
    type: 'tour',
    status: 'draft',
    title: 'Exact area',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [
      {
        id: 'target_1',
        fingerprint: {
          tagName: 'section',
          role: 'region',
          accessibleName: 'Usage chart',
          stableAttributes: { 'data-testid': 'usage-chart' },
        },
      },
    ],
    blocks: [
      {
        id: 'step_1',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'tooltip_1',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_1' },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  };
}

function documentElement(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

function dispatchResult(
  peer: Window,
  requestCorrelationId: string,
  presentationAnchor: Extract<
    NonNullable<LodariqDocument['blocks'][number]['props']['presentationAnchor']>,
    { kind: 'point' | 'region' }
  >,
): void {
  dispatchFromPeer(peer, {
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId,
    documentId: 'doc_exact_area',
    correlationId: `result_${requestCorrelationId}`,
    type: 'presentation.anchor.pick.result',
    requestCorrelationId,
    blockId: 'tooltip_1',
    targetId: 'target_1',
    presentationAnchor,
  });
}

function dispatchFromPeer(peer: Window, message: BridgeMessage): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: message,
      origin: window.location.origin,
      source: peer,
    }),
  );
}

function outbound<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Extract<BridgeMessage, { type: TType }>[] {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as BridgeMessage)
    .filter((message): message is Extract<BridgeMessage, { type: TType }> => message.type === type);
}
