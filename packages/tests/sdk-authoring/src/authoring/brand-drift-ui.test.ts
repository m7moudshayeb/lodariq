// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  classifyBrandDrift,
  type BrandDocumentThemeReviewState,
  type ProductStyleProposal,
  type ProductStyleSource,
} from '@lodariq/schema';
import { createAuthoringBrandDriftViewModel } from '../../../../../packages/sdk-authoring/src/authoring/brand-drift-model';
import { BrandDriftPanel } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/brand-drift';

const CHECKED_AT = '2026-08-09T12:00:00.000Z';

describe('authenticated authoring Brand drift UI', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes an explicit non-mutating Check brand action with an accessible live result', async () => {
    const onCheck = vi.fn();
    const onReviewProposal = vi.fn();
    const onAcknowledge = vi.fn();
    const model = createAuthoringBrandDriftViewModel(null, currentReviewState());
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(
        createElement(BrandDriftPanel, {
          model,
          onCheck,
          onReviewProposal,
          onAcknowledge,
        }),
      );
    });
    const checkButton = buttonByText(rootElement, 'Check brand');
    expect(checkButton.getAttribute('aria-describedby')).toBe('brand-drift-status-detail');
    expect(rootElement.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');

    checkButton.click();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onReviewProposal).not.toHaveBeenCalled();
    expect(onAcknowledge).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it('shows provenance, runtime actions, consequences, and bounded affected experiences', () => {
    const model = actionableViewModel(currentReviewState());
    const markup = renderToStaticMarkup(
      createElement(BrandDriftPanel, {
        model,
        onCheck: () => undefined,
        onPreviewCurrent: () => undefined,
        onPreviewProposed: () => undefined,
        onReviewProposal: () => undefined,
      }),
    );

    for (const expected of [
      'Brand change ready to review',
      'Registered product tokens',
      'Changed semantic tokens',
      'Accent colors',
      'Focus indicator',
      'Runtime before and after',
      'Preview current',
      'Preview proposed',
      'production runtime preview on the product page',
      'Production runtime preview is ready.',
      'Accessibility consequences',
      'Primary-control contrast must be rechecked.',
      '2 workspace-current experiences would need review after approval.',
      'tour_a',
      'tour_b',
      'Would need review after Brand approval',
      'Nothing changes until you review and use the proposed draft.',
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(markup).not.toContain('Showing the current approved Brand in the production runtime.');
    for (const prohibited of ['selector', 'outerHTML', 'https://', 'coordinates', 'class name']) {
      expect(markup).not.toContain(prohibited);
    }
    expect(markup).not.toContain('tour_pinned');
  });

  it('reports a runtime theme only after the creator activates that preview', () => {
    const markup = renderToStaticMarkup(
      createElement(BrandDriftPanel, {
        model: actionableViewModel(currentReviewState()),
        previewActive: true,
        previewMode: 'proposed',
        onCheck: () => undefined,
        onPreviewCurrent: () => undefined,
        onPreviewProposed: () => undefined,
        onReviewProposal: () => undefined,
      }),
    );

    expect(markup).toContain('Showing proposed Brand in the production runtime.');
    expect(markup).toContain('aria-pressed="true"');
  });

  it('keeps proposal adoption separate and deliberate', async () => {
    const onCheck = vi.fn();
    const onReviewProposal = vi.fn();
    const model = actionableViewModel(currentReviewState());
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(
        createElement(BrandDriftPanel, {
          model,
          onCheck,
          onReviewProposal,
        }),
      );
    });
    buttonByText(rootElement, 'Check brand').click();
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onReviewProposal).not.toHaveBeenCalled();

    buttonByText(rootElement, 'Review proposed Brand draft').click();
    expect(onReviewProposal).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it('offers explicit acknowledgement only for workspace-current documents needing review', async () => {
    const onAcknowledge = vi.fn();
    const needsReview = createAuthoringBrandDriftViewModel(null, needsReviewState());
    const pinned = createAuthoringBrandDriftViewModel(null, pinnedReviewState());
    const rootElement = document.createElement('div');
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(
        createElement(BrandDriftPanel, { model: needsReview, onCheck: vi.fn(), onAcknowledge }),
      );
    });
    buttonByText(rootElement, 'Acknowledge Brand version').click();
    expect(onAcknowledge).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        createElement(BrandDriftPanel, { model: pinned, onCheck: vi.fn(), onAcknowledge }),
      );
    });
    expect(rootElement.textContent).toContain('Pinned Brand version');
    expect(rootElement.textContent).toContain('explicitly pinned immutable Brand version');
    expect(findButton(rootElement, 'Acknowledge Brand version')).toBeUndefined();
    await act(async () => root.unmount());
  });
});

function actionableViewModel(reviewState: BrandDocumentThemeReviewState) {
  const baselineSource = source('sha256-' + 'a'.repeat(64));
  const observedSource = source('sha256-' + 'b'.repeat(64));
  const proposal: ProductStyleProposal = {
    schemaVersion: '1',
    proposalId: 'proposal.brand-drift-ui',
    sources: [observedSource],
    samples: [],
    tokens: {
      modes: { light: { colors: { accent: '#7c3aed', focus: '#6d28d9' } } },
    },
    confidence: 100,
    requiresConfirmation: false,
    createdAt: CHECKED_AT,
  };
  const result = classifyBrandDrift({
    checkId: 'check.brand-drift-ui',
    checkedAt: CHECKED_AT,
    trigger: 'creator_check',
    baselineTheme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    baselineSources: [baselineSource],
    observedProposal: proposal,
    affectedExperiences: [
      {
        documentId: 'tour_a',
        bindingPolicy: 'workspace-current',
        impact: 'would_require_review_on_approval',
      },
      {
        documentId: 'tour_b',
        bindingPolicy: 'workspace-current',
        impact: 'would_require_review_on_approval',
      },
    ],
  });
  const currentTheme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  const proposedTheme = structuredClone(currentTheme);
  proposedTheme.themeVersionId = 'themev_drift_preview';
  proposedTheme.contentHash = `sha256-${'c'.repeat(64)}`;
  return {
    ...createAuthoringBrandDriftViewModel(result, reviewState),
    runtimePreview: { currentTheme, proposedTheme },
  };
}

function source(fingerprintHash: string): ProductStyleSource {
  return {
    sourceId: 'customer-design-system',
    kind: 'registered_tokens',
    revision: 'build_42',
    confidence: 100,
    fingerprintHash,
    capturedAt: CHECKED_AT,
  };
}

function currentReviewState(): BrandDocumentThemeReviewState {
  return {
    policy: 'workspace-current',
    reviewState: 'current',
    themeId: 'theme_primary',
    approvedThemeVersionId: 'themev_primary_v2',
    acknowledgedThemeVersionId: 'themev_primary_v2',
  };
}

function needsReviewState(): BrandDocumentThemeReviewState {
  return {
    policy: 'workspace-current',
    reviewState: 'needs_review',
    themeId: 'theme_primary',
    approvedThemeVersionId: 'themev_primary_v3',
    acknowledgedThemeVersionId: 'themev_primary_v2',
  };
}

function pinnedReviewState(): BrandDocumentThemeReviewState {
  return {
    policy: 'pinned',
    reviewState: 'pinned',
    themeId: 'theme_primary',
    themeVersionId: 'themev_primary_v1',
  };
}

function buttonByText(root: HTMLElement, label: string): HTMLButtonElement {
  const button = findButton(root, label);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function findButton(root: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find(
    (button): button is HTMLButtonElement => button.textContent?.trim() === label,
  );
}
