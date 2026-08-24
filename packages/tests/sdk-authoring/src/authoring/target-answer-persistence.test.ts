// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type LodariqDocument,
  type TargetIdentityV2,
} from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';

/**
 * The creator answers "which of these six did you mean", and the probe that is
 * still sampling the element sends one more evidence update a moment later.
 * That message carries evidence and nothing else, so rebuilding the target from
 * it threw the answer away — leaving a target that could never anchor, with no
 * sign that anything had been discarded.
 */

const sessionId = 'session_target_answer';
const DOCUMENT_ID = 'doc_target_answer';

function identity(targetId: string): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId,
    intent: { elementKind: 'control', requiredAction: 'anchor', resolutionMode: 'semantic' },
    invariants: {},
    semantics: { tagName: 'button', role: 'button' },
    context: { ancestorRoles: ['main'], page: { key: '/#/billing/plan' } },
    localizedEvidence: [{ locale: 'en', accessibleName: 'Choose a plan' }],
    captureEvidence: {
      sampleCount: 1,
      stableSignalFamilies: ['element-semantics', 'ancestor-context', 'localized-text'],
      uniqueCandidateCount: 6,
      runnerUpMargin: 0,
      quality: 'weak',
    },
    display: { authorLabel: 'Choose a plan' },
  };
}

const FINGERPRINT = {
  tagName: 'button',
  role: 'button',
  accessibleName: 'Choose a plan',
  stableAttributes: {},
} as const;

describe('an answer the creator gave outlives the next evidence sample', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the look-alike answer when the probe reports again', () => {
    const { controller, peer } = createController();
    controller.start();

    controller.startTargetPick('step_1');
    const start = outbound(peer, 'target.pick.start')[0];
    if (!start) throw new Error('target pick did not start');

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: DOCUMENT_ID,
      correlationId: 'pick_result',
      type: 'target.pick.result',
      blockId: 'step_1',
      fingerprint: FINGERPRINT,
      identity: identity('target_placeholder'),
      selection: { kind: 'any-matching' },
      captureCorrelationId: start.correlationId,
    });

    const picked = controller.getSnapshot().documentState.targets[0];
    expect(picked?.selection).toEqual({ kind: 'any-matching' });

    // The probe is still running; this is the sample that used to wipe it.
    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: DOCUMENT_ID,
      correlationId: 'evidence_update',
      type: 'target.evidence.update',
      blockId: 'step_1',
      fingerprint: FINGERPRINT,
      identity: identity(picked!.id),
      captureCorrelationId: start.correlationId,
    });

    const after = controller.getSnapshot().documentState.targets[0];
    expect(after?.selection).toEqual({ kind: 'any-matching' });
    // The page the target was picked on has to survive it too.
    expect(after?.identity?.context.page).toEqual({ key: '/#/billing/plan' });

    controller.destroy();
  });

  it('records the answer when re-picking a step that already had a target', () => {
    const seeded = baseDocument();
    seeded.targets = [{ id: 'target_1', fingerprint: FINGERPRINT, identity: identity('target_1') }];
    seeded.blocks[0]!.children[0]!.props.targetId = 'target_1';
    const { controller, peer } = createController(seeded);
    controller.start();
    controller.startTargetPick('step_1');
    const start = outbound(peer, 'target.pick.start')[0];
    if (!start) throw new Error('target pick did not start');

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: DOCUMENT_ID,
      correlationId: 'repick_result',
      type: 'target.pick.result',
      blockId: 'step_1',
      fingerprint: FINGERPRINT,
      identity: identity('target_1'),
      selection: { kind: 'any-matching' },
      captureCorrelationId: start.correlationId,
    });

    expect(controller.getSnapshot().documentState.targets[0]?.selection).toEqual({
      kind: 'any-matching',
    });

    controller.destroy();
  });

  it('tells the host mirror about the answer, so a resync cannot drop it', () => {
    const { controller, peer } = createController();
    controller.start();
    controller.startTargetPick('step_1');
    const start = outbound(peer, 'target.pick.start')[0];
    if (!start) throw new Error('target pick did not start');

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: DOCUMENT_ID,
      correlationId: 'pick_result',
      type: 'target.pick.result',
      blockId: 'step_1',
      fingerprint: FINGERPRINT,
      identity: identity('target_placeholder'),
      selection: { kind: 'any-matching' },
      captureCorrelationId: start.correlationId,
    });

    const attach = outbound(peer, 'preview.patch')
      .flatMap((message) => message.patch.ops)
      .find((op) => op.op === 'attachTarget');
    expect(attach).toBeDefined();
    expect((attach as { selection?: unknown }).selection).toEqual({ kind: 'any-matching' });

    controller.destroy();
  });

  it('keeps a recorded approach as well', () => {
    // A target that already carries both decisions, as a saved draft would.
    const seeded = baseDocument();
    seeded.targets = [
      {
        id: 'target_1',
        fingerprint: FINGERPRINT,
        identity: identity('target_1'),
        selection: { kind: 'first' },
        approach: {
          legs: [{ act: { kind: 'navigate', routePatternId: 'billing' }, label: 'Open Billing' }],
        },
      },
    ];
    seeded.blocks[0]!.children[0]!.props.targetId = 'target_1';
    const { controller, peer } = createController(seeded);
    controller.start();
    controller.startTargetPick('step_1');
    const start = outbound(peer, 'target.pick.start')[0];
    if (!start) throw new Error('target pick did not start');

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: DOCUMENT_ID,
      correlationId: 'evidence_update_2',
      type: 'target.evidence.update',
      blockId: 'step_1',
      fingerprint: FINGERPRINT,
      identity: identity('target_1'),
      captureCorrelationId: start.correlationId,
    });

    const after = controller.getSnapshot().documentState.targets[0];
    expect(after?.approach?.legs[0]?.label).toBe('Open Billing');
    expect(after?.selection).toEqual({ kind: 'first' });

    controller.destroy();
  });
});

function createController(base: LodariqDocument = baseDocument()): {
  controller: LocalAuthoringFrameController;
  peer: Window;
} {
  const peer = { postMessage: vi.fn() } as unknown as Window;
  const controller = new LocalAuthoringFrameController({
    root: rootElement(),
    baseDocument: structuredClone(base),
    services: {
      loadDocument: () => structuredClone(base),
      saveDocument: vi.fn(),
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
  return { controller, peer };
}

function baseDocument(): LodariqDocument {
  return {
    id: DOCUMENT_ID,
    workspaceId: 'wk_target_answer',
    type: 'tour',
    status: 'draft',
    title: 'Answer persistence',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [],
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
            props: { placement: 'bottom' },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  } as LodariqDocument;
}

function rootElement(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

function dispatchFromPeer(peer: Window, message: BridgeMessage): void {
  window.dispatchEvent(
    new MessageEvent('message', { data: message, origin: window.location.origin, source: peer }),
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
