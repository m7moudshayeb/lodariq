import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LodariqBlock } from '@lodariq/schema';
import { describe, expect, it, vi } from 'vitest';
import { TargetControls } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/target-controls';
import type { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type { LocalAuthoringFrameSnapshot } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';
import { createAuthoringBrandDriftViewModel } from '../../../../../packages/sdk-authoring/src/authoring/brand-drift-model';

vi.mock('../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/design-system', () => {
  function MockButton({
    children,
    icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) {
    return React.createElement('button', props, icon, children);
  }

  function MockPopover({
    trigger,
    content,
  }: {
    trigger: React.ReactNode;
    content: React.ReactNode;
  }) {
    return React.createElement('div', null, trigger, content);
  }

  function MockSelect({
    ariaLabel,
    dataAction,
    dataBlockId,
    options,
    value,
  }: {
    ariaLabel: string;
    dataAction: string;
    dataBlockId: string;
    options: ReadonlyArray<{ label: string; value: string }>;
    value: string;
  }) {
    return React.createElement(
      'select',
      {
        'aria-label': ariaLabel,
        'data-action': dataAction,
        'data-block-id': dataBlockId,
        value,
        onChange: () => undefined,
      },
      options.map((option) =>
        React.createElement('option', { key: option.value, value: option.value }, option.label),
      ),
    );
  }

  function MockTabs({
    items,
  }: {
    items: Array<{ content: React.ReactNode; label: string; value: string }>;
  }) {
    return React.createElement(
      'div',
      null,
      items.map((item) =>
        React.createElement(
          'section',
          { key: item.value, 'data-tab-label': item.label },
          item.label,
          item.content,
        ),
      ),
    );
  }

  const MockIcon = () => React.createElement('span', { 'aria-hidden': true });

  return {
    AuthoringButton: MockButton,
    AuthoringPopover: MockPopover,
    AuthoringSelect: MockSelect,
    AuthoringTabs: MockTabs,
    Activity: MockIcon,
    ArrowDown: MockIcon,
    ArrowUp: MockIcon,
    ChevronDown: MockIcon,
    ChevronRight: MockIcon,
    Eye: MockIcon,
    Focus: MockIcon,
    GripVertical: MockIcon,
    MoreHorizontal: MockIcon,
    MousePointer2: MockIcon,
    Trash2: MockIcon,
  };
});

describe('TargetControls', () => {
  it('keeps the default placement menu compact and creator-facing', () => {
    const block = {
      id: 'step_1',
      type: 'tourStep',
      props: {},
      status: 'ready',
      children: [],
    } as LodariqBlock;
    const controller = fakeController();

    const found = render('found', block, controller);
    expect(found).toContain('Placement');
    expect(found).toContain('Verified');
    expect(found).toContain('Show on page');
    expect(found).toContain('Choose another');
    expect(found).toContain('Use exact area');
    expect(found).toContain('More placement options');
    expect(found).not.toContain('Test interaction');
    expect(found).not.toContain('Check placement');
    expect(found).not.toContain('Matching details');
    expect(found).not.toContain('Semantic match score 100');
    expect(found).not.toContain('Element type');
    expect(found).not.toContain('Remove placement');

    expect(render('missing', block, controller)).toContain('Missing');
    expect(render('missing', block, controller)).toContain('We could not find this placement');

    expect(render('ambiguous', block, controller)).toContain('Ambiguous');
    expect(render('ambiguous', block, controller)).toContain('More than one place matches');

    expect(render('needs_review', block, controller)).toContain('Needs verification');
  });

  it('shows exact-area state and offers a one-click whole-element reset', () => {
    const block = {
      id: 'step_1',
      type: 'tourStep',
      props: {},
      status: 'ready',
      children: [
        {
          id: 'tooltip_1',
          type: 'tooltip',
          props: {
            targetId: 'target_1',
            presentationAnchor: {
              kind: 'region',
              xRatio: 0.2,
              yRatio: 0.25,
              widthRatio: 0.4,
              heightRatio: 0.5,
            },
          },
          status: 'ready',
          children: [],
        },
      ],
    } as LodariqBlock;

    const markup = render('found', block, fakeController());

    expect(markup).toContain('Exact area');
    expect(markup).toContain('Use whole element');
    expect(markup).toContain('data-action="presentation-anchor-reset"');
    expect(markup).not.toContain('data-action="presentation-anchor-pick"');
  });
});

function render(
  state: 'found' | 'missing' | 'ambiguous' | 'needs_review',
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): string {
  const snapshot = {
    contentLocale: 'en',
    documentState: {
      id: 'doc_1',
      workspaceId: 'wk_a',
      type: 'tour',
      status: 'draft',
      title: 'Target fixture',
      trigger: { type: 'manual' },
      audience: { environments: ['staging'] },
      schemaVersion: '1.0.0',
      targets: [
        {
          id: 'target_1',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'New project',
            stableAttributes: { 'data-lodariq-id': 'new-project' },
          },
          lifecycle: {},
        },
      ],
      blocks: [block],
    },
    translation: { available: false, state: 'idle' },
    status: 'idle',
    saveState: { state: 'saved', label: 'Draft saved' },
    slashText: '',
    slashOpen: false,
    jsonText: '',
    compiledText: '',
    metricsText: '',
    targetDiagnostics: new Map([
      [
        'target_1',
        {
          action: 'view',
          diagnostic: {
            state,
            confidence: state === 'found' ? 100 : state === 'ambiguous' ? 72 : 12,
            candidateCount: state === 'found' ? 1 : state === 'ambiguous' ? 2 : 0,
            resolutionMethod: state === 'found' ? 'lodariq_id' : 'role_and_name',
            message: state === 'found' ? 'Found by Lodariq ID' : undefined,
          },
        },
      ],
    ]),
    advancedTargetIds: new Set(['target_1']),
    focusRequest: null,
    selectedBlockId: null,
    advancedEditorStepId: null,
    dragTargetBlockId: null,
    dragTargetPosition: null,
    release: {
      status: 'unavailable',
      reason: 'local_preview',
      expectedGeneration: null,
      findings: [],
    },
    panelWorkflow: {
      mode: 'edit',
      returnMode: 'edit',
      focusToken: 0,
      returnFocus: null,
      focusTarget: null,
      operation: null,
      brand: {
        themeName: 'Lodariq accessible fallback',
        status: 'fallback',
        source: {
          kind: 'accessible-fallback',
          label: 'Accessible fallback',
          detail: 'Safe semantic defaults are active until a workspace Brand theme is approved.',
        },
        canEdit: false,
        canApprove: false,
      },
      brandProposal: null,
      brandDrift: {
        operation: 'idle',
        error: null,
        previewActive: false,
        previewMode: 'current',
        model: createAuthoringBrandDriftViewModel(null, null),
      },
      release: null,
      releaseRecovery: {
        available: false,
        environmentId: null,
        model: null,
        intent: null,
        requestIdentity: null,
      },
      error: null,
      notice: null,
    },
  } satisfies LocalAuthoringFrameSnapshot;

  return renderToStaticMarkup(
    React.createElement(TargetControls, {
      block,
      targetId: 'target_1',
      targetLabel: 'New project',
      snapshot,
      controller,
    }),
  );
}

function fakeController(): LocalAuthoringFrameController {
  const controller = {
    requestTargetInspection: vi.fn(),
    startTargetPick: vi.fn(),
    setTargetLifecycleControl: vi.fn(),
    setTargetScrollStrategy: vi.fn(),
    setTargetWaitForText: vi.fn(),
    toggleTargetAdvanced: vi.fn(),
    removeTargetFromBlock: vi.fn(),
    startPresentationAnchorPick: vi.fn(),
    useWholeElement: vi.fn(),
  };
  return controller as unknown as LocalAuthoringFrameController;
}
