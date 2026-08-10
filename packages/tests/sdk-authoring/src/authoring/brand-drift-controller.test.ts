import { describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  classifyBrandDrift,
  type AuthoringBrandDriftCheckResult,
  type LodariqDocument,
  type ProductStyleProposal,
  type ProductStyleSource,
} from '@lodariq/schema';
import { AuthoringBrandDriftController } from '../../../../../packages/sdk-authoring/src/authoring/brand-drift-controller';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';
const DOCUMENT_UPDATED_AT = '2026-08-09T11:55:00.000Z';

describe('authoring Brand drift controller', () => {
  it('checks automatically on authoring open without adopting the proposal', async () => {
    const sampleProductStyle = vi.fn(async () => proposal('b'));
    const checkProductStyle = vi.fn(async () => actionableResult('authoring_open'));
    const onChange = vi.fn();
    const controller = new AuthoringBrandDriftController(
      { sampleProductStyle, checkProductStyle },
      onChange,
    );

    controller.initialize();
    await settleAsyncWork();

    expect(sampleProductStyle).toHaveBeenCalledOnce();
    expect(checkProductStyle).toHaveBeenCalledWith({
      trigger: 'authoring_open',
      proposal: proposal('b'),
    });
    expect(controller.snapshot()).toMatchObject({
      operation: 'idle',
      error: null,
      model: { state: 'actionable' },
    });
    expect(controller.reviewProposal()).toEqual(proposal('b'));
  });

  it('discards an older automatic observation after an explicit Check brand request', async () => {
    const firstSample = deferred<ProductStyleProposal>();
    const secondSample = deferred<ProductStyleProposal>();
    const sampleProductStyle = vi
      .fn<() => Promise<ProductStyleProposal>>()
      .mockReturnValueOnce(firstSample.promise)
      .mockReturnValueOnce(secondSample.promise);
    const checkProductStyle = vi.fn(async (request) => actionableResult(request.trigger));
    const controller = new AuthoringBrandDriftController(
      { sampleProductStyle, checkProductStyle },
      vi.fn(),
    );

    controller.initialize();
    controller.checkExplicitly();
    secondSample.resolve(proposal('b'));
    await settleAsyncWork();
    firstSample.resolve(proposal('c'));
    await settleAsyncWork();

    expect(checkProductStyle).toHaveBeenCalledTimes(1);
    expect(checkProductStyle).toHaveBeenCalledWith({
      trigger: 'creator_check',
      proposal: proposal('b'),
    });
    expect(controller.snapshot().model.checkedAt).toBe(CHECKED_AT);
  });

  it('keeps a failed check focused and leaves the prior result untouched', async () => {
    const checkProductStyle = vi
      .fn()
      .mockResolvedValueOnce(actionableResult('authoring_open'))
      .mockRejectedValueOnce(new Error('private error'));
    const controller = new AuthoringBrandDriftController(
      { sampleProductStyle: async () => proposal('b'), checkProductStyle },
      vi.fn(),
    );

    controller.initialize();
    await settleAsyncWork();
    controller.checkExplicitly();
    await settleAsyncWork();

    expect(controller.snapshot()).toMatchObject({
      operation: 'idle',
      error: 'Brand evidence could not be checked. The current Brand theme was not changed.',
      model: { state: 'actionable' },
    });
  });

  it('previews server-derived runtime variants and restores current before proposal review', async () => {
    const previewRuntime = vi.fn(async () => undefined);
    const controller = new AuthoringBrandDriftController(
      {
        sampleProductStyle: async () => proposal('b'),
        checkProductStyle: async () => ({
          ...actionableResult('authoring_open'),
          runtimePreview: runtimePreview(),
        }),
        previewRuntime,
      },
      vi.fn(),
    );

    controller.initialize();
    await settleAsyncWork();
    expect(controller.snapshot().previewActive).toBe(false);
    controller.preview('proposed');
    await settleAsyncWork();

    expect(previewRuntime).toHaveBeenCalledWith('proposed');
    expect(controller.snapshot().previewActive).toBe(true);
    expect(controller.snapshot().previewMode).toBe('proposed');
    expect(controller.reviewProposal()).toEqual(proposal('b'));
    expect(previewRuntime).toHaveBeenLastCalledWith('restore');
    expect(controller.snapshot().previewActive).toBe(false);
  });

  it('does not restore or disturb Product Match preview when drift preview was never activated', async () => {
    const previewRuntimeService = vi.fn(async () => undefined);
    const controller = controllerWithRuntimePreview({ previewRuntime: previewRuntimeService });

    controller.initialize();
    await settleAsyncWork();
    expect(controller.snapshot().previewActive).toBe(false);

    expect(controller.reviewProposal()).toEqual(proposal('b'));
    controller.dispose();

    expect(previewRuntimeService).not.toHaveBeenCalled();
  });

  it('restores the exact pre-drift host preview before a new explicit check samples', async () => {
    const order: string[] = [];
    const sampleProductStyle = vi.fn(async () => {
      order.push('sample');
      return proposal('b');
    });
    const checkProductStyle = vi.fn(async (request) => {
      order.push(`check:${request.trigger}`);
      return { ...actionableResult(request.trigger), runtimePreview: runtimePreview() };
    });
    const previewRuntimeService = vi.fn(async (mode: 'current' | 'proposed' | 'restore') => {
      order.push(`preview:${mode}`);
    });
    const controller = new AuthoringBrandDriftController(
      { sampleProductStyle, checkProductStyle, previewRuntime: previewRuntimeService },
      vi.fn(),
    );
    controller.initialize();
    await settleAsyncWork();
    order.length = 0;

    controller.preview('proposed');
    await settleAsyncWork();
    controller.checkExplicitly();
    await settleAsyncWork();

    expect(order).toEqual(['preview:proposed', 'preview:restore', 'sample', 'check:creator_check']);
    expect(controller.snapshot()).toMatchObject({
      operation: 'idle',
      previewActive: false,
      previewMode: 'current',
    });
  });

  it('trusts the host failure rollback and does not issue a second blind restore', async () => {
    const previewRuntimeService = vi.fn(async (mode: 'current' | 'proposed' | 'restore') => {
      if (mode === 'proposed') throw new Error('host restored exact previous preview');
    });
    const controller = controllerWithRuntimePreview({ previewRuntime: previewRuntimeService });
    controller.initialize();
    await settleAsyncWork();

    controller.preview('proposed');
    await settleAsyncWork();

    expect(previewRuntimeService).toHaveBeenCalledTimes(1);
    expect(previewRuntimeService.mock.calls).toEqual([['proposed']]);
    expect(controller.snapshot()).toMatchObject({
      operation: 'idle',
      previewActive: false,
      previewMode: 'current',
      error: 'The runtime preview could not load. The previous Brand preview was restored.',
    });
  });

  it('acknowledges only from an explicit needs-review state', async () => {
    const documentThemeReview = {
      policy: 'workspace-current' as const,
      reviewState: 'current' as const,
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      approvedThemeVersionId: 'themev_current',
      acknowledgedThemeVersionId: 'themev_current',
    };
    const acknowledgedDocument = documentFixture();
    acknowledgedDocument.themeBinding = {
      policy: 'workspace-current',
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      acknowledgedThemeVersionId: 'themev_current',
    };
    const acknowledgeThemeVersion = vi.fn(async () => ({
      document: acknowledgedDocument,
      theme: {
        ...LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        themeVersionId: 'themev_current',
      },
      documentThemeReview,
      documentUpdatedAt: CHECKED_AT,
    }));
    const controller = new AuthoringBrandDriftController(
      {
        sampleProductStyle: async () => proposal('a'),
        checkProductStyle: async () => ({
          ...actionableResult('authoring_open'),
          documentThemeReview: {
            policy: 'workspace-current',
            reviewState: 'needs_review',
            themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
            approvedThemeVersionId: 'themev_current',
            acknowledgedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
          },
        }),
        acknowledgeThemeVersion,
      },
      vi.fn(),
    );

    controller.acknowledge();
    expect(acknowledgeThemeVersion).not.toHaveBeenCalled();
    controller.initialize();
    await settleAsyncWork();
    controller.acknowledge();
    await settleAsyncWork();

    expect(acknowledgeThemeVersion).toHaveBeenCalledOnce();
    expect(acknowledgeThemeVersion).toHaveBeenCalledWith({
      reviewedThemeVersionId: 'themev_current',
      expectedAcknowledgedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
      expectedDocumentUpdatedAt: DOCUMENT_UPDATED_AT,
    });
    expect(controller.snapshot().model.acknowledgement.state).toBe('current');
  });

  it('restores an active proposed preview before acknowledging the reviewed version', async () => {
    const order: string[] = [];
    const previewRuntimeService = vi.fn(async (mode: 'current' | 'proposed' | 'restore') => {
      order.push(`preview:${mode}`);
    });
    const documentThemeReview = {
      policy: 'workspace-current' as const,
      reviewState: 'current' as const,
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      approvedThemeVersionId: 'themev_current',
      acknowledgedThemeVersionId: 'themev_current',
    };
    const acknowledgeThemeVersion = vi.fn(async () => {
      order.push('acknowledge');
      return {
        document: documentFixture(),
        theme: {
          ...LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
          themeVersionId: 'themev_current',
        },
        documentThemeReview,
        documentUpdatedAt: CHECKED_AT,
      };
    });
    const controller = new AuthoringBrandDriftController(
      {
        sampleProductStyle: async () => proposal('b'),
        checkProductStyle: async () => ({
          ...actionableResult('authoring_open'),
          runtimePreview: runtimePreview(),
          documentThemeReview: {
            policy: 'workspace-current',
            reviewState: 'needs_review',
            themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
            approvedThemeVersionId: 'themev_current',
            acknowledgedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
          },
        }),
        previewRuntime: previewRuntimeService,
        acknowledgeThemeVersion,
      },
      vi.fn(),
    );
    controller.initialize();
    await settleAsyncWork();
    controller.preview('proposed');
    await settleAsyncWork();
    order.length = 0;

    controller.acknowledge();
    await settleAsyncWork();

    expect(order).toEqual(['preview:restore', 'acknowledge']);
    expect(controller.snapshot()).toMatchObject({
      operation: 'idle',
      previewActive: false,
      model: { acknowledgement: { state: 'current' } },
    });
    expect(controller.snapshot().model.runtimePreview).toBeUndefined();
  });
});

function actionableResult(
  trigger: 'authoring_open' | 'creator_check',
): AuthoringBrandDriftCheckResult {
  return {
    documentId: 'tour_a',
    drift: classifyBrandDrift({
      checkId: `check.${trigger}`,
      checkedAt: CHECKED_AT,
      trigger,
      baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      baselineSources: [source('a')],
      observedProposal: proposal('b'),
    }),
    documentThemeReview: null,
    documentUpdatedAt: DOCUMENT_UPDATED_AT,
  };
}

function documentFixture(): LodariqDocument {
  return {
    schemaVersion: '1',
    id: 'tour_a',
    workspaceId: 'wk_a',
    type: 'tour',
    title: 'Tour',
    status: 'draft',
    themeBinding: {
      policy: 'workspace-current',
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      acknowledgedThemeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    },
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    targets: [],
    blocks: [],
  };
}

function proposal(character: string): ProductStyleProposal {
  return {
    schemaVersion: '1',
    proposalId: 'proposal.brand-drift-controller',
    sources: [source(character)],
    samples: [],
    tokens: { modes: { light: { colors: { accent: '#7c3aed' } } } },
    confidence: 100,
    requiresConfirmation: false,
    createdAt: CHECKED_AT,
  };
}

function source(character: string): ProductStyleSource {
  return {
    sourceId: 'customer-design-system',
    kind: 'registered_tokens',
    revision: 'build_42',
    confidence: 100,
    fingerprintHash: `sha256-${character.repeat(64)}`,
    capturedAt: CHECKED_AT,
  };
}

function runtimePreview(): NonNullable<AuthoringBrandDriftCheckResult['runtimePreview']> {
  const currentTheme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  const proposedTheme = structuredClone(currentTheme);
  proposedTheme.themeVersionId = 'themev_drift_preview';
  proposedTheme.contentHash = `sha256-${'c'.repeat(64)}`;
  return { currentTheme, proposedTheme };
}

function controllerWithRuntimePreview(options: {
  previewRuntime: (mode: 'current' | 'proposed' | 'restore') => Promise<void>;
}): AuthoringBrandDriftController {
  return new AuthoringBrandDriftController(
    {
      sampleProductStyle: async () => proposal('b'),
      checkProductStyle: async () => ({
        ...actionableResult('authoring_open'),
        runtimePreview: runtimePreview(),
      }),
      previewRuntime: options.previewRuntime,
    },
    vi.fn(),
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) throw new Error('Deferred promise was not initialized');
      resolvePromise(value);
    },
  };
}

async function settleAsyncWork(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}
