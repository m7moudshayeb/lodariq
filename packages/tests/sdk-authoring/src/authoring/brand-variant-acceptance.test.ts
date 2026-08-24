// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
import { brandThemeOffer } from '../../../../../packages/sdk-authoring/src/authoring/brand-theme-offer';

const CAPTURED_AT = '2026-08-17T12:00:00.000Z';
const SOURCE_HASH = `sha256-${'d'.repeat(64)}`;

describe('choosing a brand variant (§7.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('applies the chosen variant’s tokens, leaving the evidence intact', async () => {
    const applyBrandMatch = vi.fn(async (candidate: AuthoringBrandMatchProposal) =>
      applyResult(candidate),
    );
    const controller = await reviewing(applyBrandMatch);
    const distinct = brandThemeOffer(sampledEvidence()).variants.find(
      (variant) => variant.id === 'distinct',
    );

    controller.acceptBrandMatch('distinct');
    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledOnce());

    const applied = applyBrandMatch.mock.calls[0]![0];
    expect(applied.evidence.tokens).toEqual(distinct?.values);
    // Provenance is evidence, not preference: choosing a variant cannot rewrite it.
    expect(applied.evidence.sources).toEqual(sampledEvidence().sources);
    expect(applied.evidence.samples).toEqual(sampledEvidence().samples);
  });

  it('produces different tokens for the two variants', async () => {
    const applyBrandMatch = vi.fn(async (candidate: AuthoringBrandMatchProposal) =>
      applyResult(candidate),
    );
    const blendedController = await reviewing(applyBrandMatch);
    blendedController.acceptBrandMatch('blended');
    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledOnce());

    const distinctController = await reviewing(applyBrandMatch);
    distinctController.acceptBrandMatch('distinct');
    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledTimes(2));

    const [blended, distinct] = applyBrandMatch.mock.calls.map((call) => call[0].evidence.tokens);
    expect(blended?.modes?.light?.colors?.surface).not.toBe(
      distinct?.modes?.light?.colors?.surface,
    );
  });

  it('applies the sampled evidence untouched when no variant is named', async () => {
    const applyBrandMatch = vi.fn(async (candidate: AuthoringBrandMatchProposal) =>
      applyResult(candidate),
    );
    const controller = await reviewing(applyBrandMatch);

    controller.acceptBrandMatch();
    await vi.waitFor(() => expect(applyBrandMatch).toHaveBeenCalledOnce());

    expect(applyBrandMatch.mock.calls[0]![0].evidence.tokens).toEqual(sampledEvidence().tokens);
  });

  it('Start plain persists nothing and says so', async () => {
    const applyBrandMatch = vi.fn(async (candidate: AuthoringBrandMatchProposal) =>
      applyResult(candidate),
    );
    const controller = await reviewing(applyBrandMatch);

    controller.startPlainBrandTheme();

    const snapshot = controller.getSnapshot();
    expect(applyBrandMatch).not.toHaveBeenCalled();
    expect(snapshot.panelWorkflow.brandProposal).toBeNull();
    expect(snapshot.panelWorkflow.notice).toContain('Kept the plain theme');
  });
});

/** Samples a product, then waits for the review step the creator chooses from. */
async function reviewing(
  applyBrandMatch: LocalAuthoringFrameServices['applyBrandMatch'],
): Promise<LocalAuthoringFrameController> {
  const controller = createController({
    sampleBrandStyle: vi.fn(async () =>
      brandMatchProposalForFrame(sampledEvidence(), LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1),
    ),
    applyBrandMatch,
    adoptBrandPreviewTheme: vi.fn(() => true),
  });
  controller.matchProductBrand('select-element');
  await vi.waitFor(() =>
    expect(controller.getSnapshot().panelWorkflow.brandProposal).not.toBeNull(),
  );
  return controller;
}

function sampledEvidence(): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'lodariq.variant.proposal',
    sources: [
      {
        sourceId: 'lodariq.variant.source',
        kind: 'selected_element',
        confidence: 88,
        fingerprintHash: SOURCE_HASH,
        capturedAt: CAPTURED_AT,
      },
    ],
    samples: [
      {
        sampleId: 'lodariq.variant.cta',
        sourceId: 'lodariq.variant.source',
        kind: 'selected_element',
        confidence: 88,
        values: {
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          radiusPx: 8,
          paddingBlockPx: 8,
          paddingInlinePx: 16,
          widthPx: 160,
        },
      },
      {
        sampleId: 'lodariq.variant.page',
        sourceId: 'lodariq.variant.source',
        kind: 'page_typography',
        confidence: 82,
        values: { backgroundColor: '#ffffff', color: '#101828', widthPx: 1_280 },
      },
    ],
    tokens: { modes: { light: { colors: { accent: '#4f46e5' } } } },
    confidence: 88,
    // Keeps the flow in review, which is where the choice is made.
    requiresConfirmation: true,
    createdAt: CAPTURED_AT,
  };
}

function applyResult(candidate: AuthoringBrandMatchProposal): {
  brand: ReturnType<typeof brandWorkspaceStateFromTheme>;
  savedAs: 'draft';
  persisted: AuthoringProductMatchApplyResult;
} {
  const previewTheme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  return {
    brand: brandWorkspaceStateFromTheme(previewTheme, candidate.evidence),
    savedAs: 'draft',
    persisted: {
      proposalId: candidate.evidence.proposalId,
      draftRevision: 1,
      draftUpdatedAt: CAPTURED_AT,
      previewTheme,
      sources: [{ sourceId: `${candidate.id}.record`, sourceHash: SOURCE_HASH }],
      draftChanged: true,
      replayed: false,
    },
  };
}

function createController(
  overrides: Pick<
    LocalAuthoringFrameServices,
    'sampleBrandStyle' | 'applyBrandMatch' | 'adoptBrandPreviewTheme'
  >,
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: emptyDocument(),
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
      ...overrides,
    },
    sessionId: 'session_brand_variant',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function emptyDocument(): LodariqDocument {
  return {
    id: 'doc_brand_variant',
    workspaceId: 'wk_brand_variant',
    type: 'tour',
    status: 'draft',
    title: 'Brand variant choice',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [],
  };
}
