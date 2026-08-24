import { describe, expect, it } from 'vitest';
import {
  documentTypeSupportsTourFlow,
  type DocumentType,
  type LodariqDocument,
  type ResolverDiagnostic,
} from '@lodariq/schema';
import { validateTourDocumentFlow } from '@lodariq/compiler';
import {
  applyTourStepBatchTimeoutPolicy,
  applyTourStepStyle,
  AuthoringStepStyleRecipeLibrary,
  AuthoringTargetHealthLedger,
  DocumentTransactionCoordinator,
  compareDraftDocuments,
  deriveTourFlowMap,
  experienceSupportsAuthoringCapability,
  extractTourStepStyle,
  selectExperienceRootBlocks,
} from '@lodariq/sdk-authoring/authoring/reliability';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('authoring reliability primitives', () => {
  it('composes shared authoring capabilities for future experience renderers', () => {
    expect(experienceSupportsAuthoringCapability('tour', 'flow')).toBe(true);
    expect(experienceSupportsAuthoringCapability('announcement', 'popupComposition')).toBe(true);
    expect(experienceSupportsAuthoringCapability('hotspot', 'targeting')).toBe(true);
    expect(experienceSupportsAuthoringCapability('hotspot', 'presentation')).toBe(true);
    expect(experienceSupportsAuthoringCapability('announcement', 'batch')).toBe(false);
    const documentTypes: DocumentType[] = [
      'tour',
      'announcement',
      'checklist',
      'survey',
      'hotspot',
      'knowledge',
    ];
    for (const type of documentTypes) {
      expect(documentTypeSupportsTourFlow(type)).toBe(
        experienceSupportsAuthoringCapability(type, 'flow'),
      );
    }

    const announcement = structuredClone(tourFixture) as LodariqDocument;
    const tooltip = announcement.blocks[0]!.children[0]!;
    announcement.type = 'announcement';
    announcement.blocks = [tooltip];
    expect(selectExperienceRootBlocks(announcement).map((block) => block.type)).toEqual([
      'tooltip',
    ]);
  });

  it('coalesces 100 rapid complete tooltip-style snapshots without losing final fields', () => {
    const initial = structuredClone(tourFixture) as LodariqDocument;
    const coordinator = new DocumentTransactionCoordinator(initial, () => 'txn-appearance');
    let document = initial;
    let undoCount = 0;
    let lastTransaction = null as ReturnType<DocumentTransactionCoordinator['flush']>;

    for (let index = 0; index < 100; index += 1) {
      const tooltipStyle = {
        surfaceColor: hex(index),
        textColor: hex(index + 1),
        borderColor: hex(index + 2),
      };
      const staged = coordinator.stage({
        document,
        scope: 'appearance',
        coalescingKey: 'tooltip:block_tooltip_1',
        now: index,
        operations: [{ op: 'setTooltipStyle', tooltipStyle }],
        reduce: (candidate) => {
          const clone = structuredClone(candidate);
          clone.blocks[0]!.children[0]!.props.tooltipStyle = tooltipStyle;
          return clone;
        },
      });
      document = staged.document;
      if (staged.undoDocument) undoCount += 1;
      lastTransaction = staged.transaction;
    }

    expect(undoCount).toBe(1);
    expect(document.blocks[0]!.children[0]!.props.tooltipStyle).toEqual({
      surfaceColor: hex(99),
      textColor: hex(100),
      borderColor: hex(101),
    });
    expect(lastTransaction?.operations).toEqual([
      {
        op: 'setTooltipStyle',
        tooltipStyle: {
          surfaceColor: hex(99),
          textColor: hex(100),
          borderColor: hex(101),
        },
      },
    ]);
    expect(coordinator.acknowledge(50)).toBe('stale');
    expect(coordinator.acknowledge(100)).toBe('applied');
    expect(coordinator.saveState).toEqual({ state: 'saving', revision: 100 });
    coordinator.markPersisted(100);
    expect(coordinator.saveState).toEqual({ state: 'saved', revision: 100 });
    expect(coordinator.document).toEqual(document);
  });

  it('retains verified target evidence while its route context is absent', () => {
    const ledger = new AuthoringTargetHealthLedger();
    ledger.registerTarget('target-modal-close', 'identity-v1');
    ledger.updateContext({ routePatternId: 'imports', stateId: 'dialog-open', locale: 'en' });
    ledger.recordObservation('target-modal-close', foundDiagnostic(), '2026-08-13T10:00:00.000Z');

    expect(ledger.get('target-modal-close')?.presentation).toBe('verified');
    ledger.updateContext({ routePatternId: 'dashboard', locale: 'en' });
    const absent = ledger.get('target-modal-close');
    expect(absent?.presentation).toBe('unavailable_current_context');
    expect(absent?.lastVerified?.observedAt).toBe('2026-08-13T10:00:00.000Z');

    ledger.updateContext({ routePatternId: 'imports', stateId: 'dialog-open', locale: 'en' });
    expect(ledger.get('target-modal-close')?.presentation).toBe('verified');
  });

  it('applies style snapshots without changing targets, content, or behavior', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const source = document.blocks[0]!;
    source.children[0]!.props.tooltipStyle = {
      surfaceColor: '#102030',
      textColor: '#ffffff',
    };
    const action = source.children[0]!.children.find((block) => block.type === 'button')!;
    action.props.buttonStyle = { fillColor: '#445566', textColor: '#ffffff' };
    const snapshot = extractTourStepStyle(source);
    const library = new AuthoringStepStyleRecipeLibrary();
    const recipe = library.save('Launch card', snapshot);
    const beforeBehavior = JSON.stringify(action.props.action);
    const beforeTarget = source.children[0]!.props.targetId;
    const beforeContent = JSON.stringify(source.children.map((child) => child.content));

    const styled = applyTourStepStyle(document, [source.id], recipe.snapshot);
    const styledStep = styled.blocks[0]!;
    const styledAction = styledStep.children[0]!.children.find((block) => block.type === 'button')!;
    expect(JSON.stringify(styledAction.props.action)).toBe(beforeBehavior);
    expect(styledStep.children[0]!.props.targetId).toBe(beforeTarget);
    expect(JSON.stringify(styledStep.children.map((child) => child.content))).toBe(beforeContent);
    expect(recipe.contentHash).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('removes recovery-step metadata when a batch applies a non-routing timeout policy', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const button = document.blocks[0]!.children[0]!.children.find(
      (block) => block.type === 'button',
    )!;
    button.props.action = {
      type: 'runSequence',
      sequence: {
        ...validSequence(),
        onTimeout: 'goToStep',
        timeoutStepId: document.blocks[0]!.id,
      },
    };
    const updated = applyTourStepBatchTimeoutPolicy(
      document,
      new Set([document.blocks[0]!.id]),
      'retry',
    );
    const updatedButton = updated.blocks[0]!.children[0]!.children.find(
      (block) => block.type === 'button',
    )!;
    expect(updatedButton.props.action?.type).toBe('runSequence');
    if (updatedButton.props.action?.type !== 'runSequence') throw new Error('Expected sequence');
    expect(updatedButton.props.action.sequence.onTimeout).toBe('retry');
    expect('timeoutStepId' in updatedButton.props.action.sequence).toBe(false);
  });

  it('flags a branch when one reachable outcome loops forever', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const step = document.blocks[0]!;
    const action = step.children[0]!.children.find((block) => block.type === 'button')!;
    action.props.action = {
      type: 'next',
      transition: {
        rules: [
          {
            all: [{ source: 'locale', locale: 'en' }],
            to: { type: 'step', stepId: step.id },
          },
        ],
        fallback: { type: 'complete' },
      },
    };
    // Both sides must analyse the same steps: the document validator always sees
    // the whole document, so handing the flow map only the first one compares
    // two different flows the moment the fixture has more than one step.
    const authoringFindings = deriveTourFlowMap(document.blocks).findings;
    expect(authoringFindings).toContainEqual({
      code: 'non_terminating_flow',
      severity: 'blocker',
      stepId: step.id,
      stepIndex: 0,
    });
    expect(authoringFindings).toEqual(validateTourDocumentFlow(document));
  });

  it('uses sequence outcomes in the same canonical flow analysis', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const step = document.blocks[0]!;
    const action = step.children[0]!.children.find((block) => block.type === 'button')!;
    action.props.action = {
      type: 'runSequence',
      sequence: { ...validSequence(), transition: { type: 'stay' } },
    };

    const authoringFindings = deriveTourFlowMap(document.blocks).findings;
    expect(authoringFindings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['non_terminating_flow', 'missing_terminal_completion']),
    );
    expect(authoringFindings).toEqual(validateTourDocumentFlow(document));
  });

  it('compares named draft checkpoints without release state', () => {
    const before = structuredClone(tourFixture) as LodariqDocument;
    const after = structuredClone(before);
    after.title = 'Changed title';
    after.blocks[0]!.children[0]!.children[0]!.content = 'Changed copy';
    expect(compareDraftDocuments(before, after)).toEqual({
      changedBlocks: 1,
      changedTargets: 0,
      documentSettingsChanged: true,
    });
  });
});

function validSequence() {
  return {
    trigger: { type: 'manual' as const },
    waitFor: [],
    transition: { type: 'next' as const },
    timeoutMs: 1_000,
    onTimeout: 'stay' as const,
  };
}

function foundDiagnostic(): ResolverDiagnostic {
  return {
    state: 'found',
    confidence: 100,
    candidateCount: 1,
    resolutionMethod: 'semantic',
    reasonCode: 'resolved',
  };
}

function hex(value: number): string {
  return `#${value.toString(16).padStart(6, '0').slice(-6)}`;
}
