import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LodariqBlock } from '@lodariq/schema';
import { describe, expect, it, vi } from 'vitest';
import { TargetControls } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/target-controls';
import type { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import type { LocalAuthoringFrameSnapshot } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';

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

  const MockIcon = () => React.createElement('span', { 'aria-hidden': true });

  return {
    AuthoringButton: MockButton,
    AuthoringPopover: MockPopover,
    Activity: MockIcon,
    ArrowDown: MockIcon,
    ArrowUp: MockIcon,
    ChevronDown: MockIcon,
    ChevronRight: MockIcon,
    Eye: MockIcon,
    GripVertical: MockIcon,
    MoreHorizontal: MockIcon,
    MousePointer2: MockIcon,
    Trash2: MockIcon,
  };
});

describe('TargetControls', () => {
  it('renders creator-facing placement states and matching labels', () => {
    const block = {
      id: 'step_1',
      type: 'tourStep',
      props: {},
      status: 'ready',
      children: [],
    } as LodariqBlock;
    const controller = fakeController();

    expect(render('found', block, controller)).toContain('Ready');
    expect(render('found', block, controller)).toContain('Show on page');
    expect(render('found', block, controller)).toContain('Change placement');
    expect(render('found', block, controller)).toContain('Check placement');
    expect(render('found', block, controller)).toContain('Matching details');
    expect(render('found', block, controller)).toContain('Match strength 100%');
    expect(render('found', block, controller)).toContain('Item type');
    expect(render('found', block, controller)).toContain('Remove placement');

    expect(render('missing', block, controller)).toContain('Needs attention');
    expect(render('missing', block, controller)).toContain('We could not find this placement');

    expect(render('ambiguous', block, controller)).toContain('Review placement');
    expect(render('ambiguous', block, controller)).toContain('More than one place matches');
  });
});

function render(
  state: 'found' | 'missing' | 'ambiguous',
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): string {
  const snapshot = {
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
    status: 'idle',
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
    dragTargetBlockId: null,
    dragTargetPosition: null,
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
    toggleTargetAdvanced: vi.fn(),
    removeTargetFromBlock: vi.fn(),
  };
  return controller as unknown as LocalAuthoringFrameController;
}
