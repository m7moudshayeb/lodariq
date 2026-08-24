import { describe, expect, it } from 'vitest';
import { showWhenMatches } from '../../../../../packages/sdk-runtime/src/renderers/tour-flow';

const context = {
  identifyTraits: { plan: 'growth', role: 'admin' },
  documentState: { importedRows: 1204 },
  locale: 'en',
  completedStepIds: new Set(['step_2']),
};

describe('a block’s visibility rule', () => {
  it('shows everything when no rule is set, so old documents are unchanged', () => {
    expect(showWhenMatches(undefined, context)).toBe(true);
  });

  it('matches an identified trait', () => {
    expect(
      showWhenMatches(
        { source: 'identifyTrait', key: 'plan', operator: 'equals', value: 'growth' },
        context,
      ),
    ).toBe(true);
    expect(
      showWhenMatches(
        { source: 'identifyTrait', key: 'plan', operator: 'equals', value: 'free' },
        context,
      ),
    ).toBe(false);
  });

  it('matches declared document state', () => {
    expect(
      showWhenMatches(
        { source: 'documentState', key: 'importedRows', operator: 'exists' },
        context,
      ),
    ).toBe(true);
    expect(
      showWhenMatches({ source: 'documentState', key: 'seats', operator: 'exists' }, context),
    ).toBe(false);
  });

  it('matches a completed step and a locale', () => {
    expect(showWhenMatches({ source: 'completedStep', stepId: 'step_2' }, context)).toBe(true);
    expect(showWhenMatches({ source: 'completedStep', stepId: 'step_9' }, context)).toBe(false);
    expect(showWhenMatches({ source: 'locale', locale: 'en-GB' }, context)).toBe(true);
    expect(showWhenMatches({ source: 'locale', locale: 'de' }, context)).toBe(false);
  });

  it('uses the same vocabulary as branching, so a creator learns it once', () => {
    // Identical shape to a StepTransitionCondition — deliberately one contract.
    const shared = {
      source: 'identifyTrait',
      key: 'role',
      operator: 'notEquals',
      value: 'viewer',
    } as const;
    expect(showWhenMatches(shared, context)).toBe(true);
  });

  it('fails closed when condition context or scalar data is missing', () => {
    const missingTraitDiagnostics: Array<{ reason: string; source: string }> = [];
    expect(
      showWhenMatches(
        { source: 'identifyTrait', key: 'missing', operator: 'notEquals', value: 'viewer' },
        context,
        (diagnostic) => missingTraitDiagnostics.push(diagnostic),
      ),
    ).toBe(false);
    expect(missingTraitDiagnostics).toEqual([
      { reason: 'missing-context', source: 'identifyTrait' },
    ]);

    const diagnostics: Array<{ reason: string; source: string }> = [];
    expect(
      showWhenMatches(
        { source: 'documentState', key: 'ready', operator: 'equals', value: true },
        {
          identifyTraits: context.identifyTraits,
          locale: context.locale,
          completedStepIds: context.completedStepIds,
        },
        (diagnostic) => diagnostics.push(diagnostic),
      ),
    ).toBe(false);
    expect(diagnostics).toEqual([{ reason: 'missing-context', source: 'documentState' }]);
  });

  it('fails closed and diagnoses an unknown operator', () => {
    const diagnostics: Array<{ reason: string; source: string }> = [];
    const malformed = {
      source: 'identifyTrait',
      key: 'plan',
      operator: 'contains',
      value: 'growth',
    } as never;

    expect(showWhenMatches(malformed, context, (diagnostic) => diagnostics.push(diagnostic))).toBe(
      false,
    );
    expect(diagnostics).toEqual([{ reason: 'invalid-condition', source: 'identifyTrait' }]);
  });
});
