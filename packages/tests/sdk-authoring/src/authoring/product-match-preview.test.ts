// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  type AuthoringProductMatchApplyResult,
  type LodariqDocument,
  type ProductStyleProposal,
} from '@lodariq/schema';
import {
  brandMatchProposalForFrame,
  brandWorkspaceStateFromTheme,
  type AuthoringBrandMatchProposal,
  type LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring/authoring-frame';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';

const CAPTURED_AT = '2026-08-09T12:00:00.000Z';
const SOURCE_HASH = `sha256-${'c'.repeat(64)}`;

describe('Product Match persisted preview adoption', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('ignores an out-of-order sampling response before it can mutate the preview', async () => {
    const first = deferred<AuthoringBrandMatchProposal>();
    const second = deferred<AuthoringBrandMatchProposal>();
    const newerProposal = proposal('proposal.newer', '#0f766e');
    const olderProposal = proposal('proposal.older', '#7c3aed');
    const sampleBrandStyle = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const applyBrandMatch = vi.fn(async (candidate: AuthoringBrandMatchProposal) =>
      applyResult(candidate, 3),
    );
    const adoptBrandPreviewTheme = vi.fn(() => true);
    const controller = createController({
      sampleBrandStyle,
      applyBrandMatch,
      adoptBrandPreviewTheme,
    });

    controller.matchProductBrand('select-element');
    controller.matchProductBrand('select-element');
    second.resolve(newerProposal);
    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledOnce());
    first.resolve(olderProposal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applyBrandMatch).toHaveBeenCalledWith(expect.objectContaining({ id: newerProposal.id }));
    expect(adoptBrandPreviewTheme).toHaveBeenCalledOnce();
    expect(adoptBrandPreviewTheme).toHaveBeenCalledWith(
      expect.objectContaining({ draftRevision: 3 }),
    );
    expect(controller.getSnapshot().panelWorkflow.notice).toContain('workspace draft for approval');
  });

  it('rejects a lower persisted revision without replacing the active preview', async () => {
    const sampled = proposal('proposal.revision', '#0f766e');
    const sampleBrandStyle = vi.fn(async () => sampled);
    const applyBrandMatch = vi
      .fn()
      .mockResolvedValueOnce(applyResult(sampled, 5))
      .mockResolvedValueOnce(applyResult(sampled, 4));
    const adoptBrandPreviewTheme = vi.fn(() => true);
    const controller = createController({
      sampleBrandStyle,
      applyBrandMatch,
      adoptBrandPreviewTheme,
    });

    controller.matchProductBrand('select-element');
    await vi.waitFor(() => expect(adoptBrandPreviewTheme).toHaveBeenCalledOnce());
    controller.matchProductBrand('select-element');
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.error).toContain(
        'newer Brand draft is already active',
      ),
    );

    expect(adoptBrandPreviewTheme).toHaveBeenCalledOnce();
  });

  it('keeps the current preview when persistence fails and exposes a retryable error', async () => {
    const sampled = proposal('proposal.failure', '#0f766e');
    const adoptBrandPreviewTheme = vi.fn(() => true);
    const controller = createController({
      sampleBrandStyle: vi.fn(async () => sampled),
      applyBrandMatch: vi.fn(async () => {
        throw new Error('revision changed');
      }),
      adoptBrandPreviewTheme,
    });

    controller.matchProductBrand('select-element');
    await vi.waitFor(() =>
      expect(controller.getSnapshot().panelWorkflow.error).toBe(
        'The Brand proposal could not be saved.',
      ),
    );
    expect(adoptBrandPreviewTheme).not.toHaveBeenCalled();
  });

  it('uses the first selected target as a best-effort default style source', async () => {
    const sampled = proposal('proposal.first-target', '#0369a1');
    const sampleBrandStyle = vi.fn(async () => sampled);
    const applyBrandMatch = vi.fn(async () => applyResult(sampled, 2));
    const adoptBrandPreviewTheme = vi.fn(() => true);
    const controller = createController(
      { sampleBrandStyle, applyBrandMatch, adoptBrandPreviewTheme },
      targetlessStepDocument(),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 'session_product_match_preview',
          documentId: 'doc_product_match_preview',
          correlationId: 'target_pick_first_style',
          type: 'target.pick.result',
          blockId: 'step_product_match_preview',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Create project',
            stableAttributes: { 'data-testid': 'create-project' },
          },
        },
      }),
    );

    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledOnce());
    expect(sampleBrandStyle).toHaveBeenCalledWith({
      documentId: 'doc_product_match_preview',
      targetId: expect.stringMatching(/^target_/u),
      strategy: 'current-target',
    });
    expect(adoptBrandPreviewTheme).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().panelWorkflow.mode).toBe('edit');
    expect(controller.getSnapshot().panelWorkflow.notice).toBeNull();
  });
});

function createController(
  overrides: Pick<
    LocalAuthoringFrameServices,
    'sampleBrandStyle' | 'applyBrandMatch' | 'adoptBrandPreviewTheme'
  >,
  documentFixture: LodariqDocument = emptyDocument(),
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: documentFixture,
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (document) => JSON.stringify(document),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
      ...overrides,
    },
    sessionId: 'session_product_match_preview',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function emptyDocument(): LodariqDocument {
  return {
    id: 'doc_product_match_preview',
    workspaceId: 'wk_product_match_preview',
    type: 'tour',
    status: 'draft',
    title: 'Product Match preview',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [],
  };
}

function targetlessStepDocument(): LodariqDocument {
  return {
    ...emptyDocument(),
    blocks: [
      {
        id: 'step_product_match_preview',
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_product_match_preview',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [],
          },
        ],
      },
    ],
  };
}

function proposal(id: string, accent: string): AuthoringBrandMatchProposal {
  const evidence: ProductStyleProposal = {
    schemaVersion: '1',
    proposalId: id,
    sources: [
      {
        sourceId: `${id}.source`,
        kind: 'selected_element',
        confidence: 92,
        fingerprintHash: SOURCE_HASH,
        capturedAt: CAPTURED_AT,
      },
    ],
    samples: [],
    tokens: { modes: { light: { colors: { accent } } } },
    confidence: 92,
    requiresConfirmation: false,
    createdAt: CAPTURED_AT,
  };
  return brandMatchProposalForFrame(evidence, LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
}

function applyResult(
  candidate: AuthoringBrandMatchProposal,
  draftRevision: number,
): {
  brand: ReturnType<typeof brandWorkspaceStateFromTheme>;
  savedAs: 'draft';
  persisted: AuthoringProductMatchApplyResult;
} {
  const previewTheme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  previewTheme.themeVersionId = `themev_draft_${draftRevision}`;
  previewTheme.version = draftRevision;
  previewTheme.contentHash = `sha256-${String(draftRevision % 10).repeat(64)}`;
  return {
    brand: brandWorkspaceStateFromTheme(previewTheme, candidate.evidence),
    savedAs: 'draft',
    persisted: {
      proposalId: candidate.evidence.proposalId,
      draftRevision,
      draftUpdatedAt: CAPTURED_AT,
      previewTheme,
      sources: [{ sourceId: `${candidate.id}.record`, sourceHash: SOURCE_HASH }],
      draftChanged: true,
      replayed: false,
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
