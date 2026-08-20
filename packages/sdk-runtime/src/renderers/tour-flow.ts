import type {
  StepTransition,
  StepTransitionCondition,
  StepTransitionDestination,
} from '@lodariq/schema';
import { hasObservedNamedRuntimeEvent } from '../runtime/named-events';

export interface TourFlowConditionContext {
  identifyTraits?: Readonly<Record<string, unknown>>;
  documentState?: Readonly<Record<string, unknown>>;
  locale: string;
  completedStepIds: ReadonlySet<string>;
}

export interface ResolvedStepTransition {
  destination: StepTransitionDestination;
  ruleIndex: number | null;
}

export function resolveStepTransition(
  transition: StepTransition,
  context: TourFlowConditionContext,
): ResolvedStepTransition {
  for (const [ruleIndex, rule] of transition.rules.entries()) {
    if (rule.all.every((condition) => conditionMatches(condition, context))) {
      return { destination: rule.to, ruleIndex };
    }
  }
  return { destination: transition.fallback, ruleIndex: null };
}

/**
 * Whether a block renders for this visitor. A step uses it to decide whether to
 * show at all; a child block uses it to vary content inside one step. Absent
 * means "always", so an unconditioned document behaves exactly as before.
 */
export function showWhenMatches(
  showWhen: StepTransitionCondition | undefined,
  context: TourFlowConditionContext,
): boolean {
  if (!showWhen) return true;
  return conditionMatches(showWhen, context);
}

function conditionMatches(
  condition: StepTransitionCondition,
  context: TourFlowConditionContext,
): boolean {
  if (condition.source === 'namedEvent') {
    return hasObservedNamedRuntimeEvent(condition.eventName);
  }
  if (condition.source === 'completedStep') {
    return context.completedStepIds.has(condition.stepId);
  }
  if (condition.source === 'locale') return localeMatches(condition.locale, context.locale);
  const values =
    condition.source === 'identifyTrait' ? context.identifyTraits : context.documentState;
  const actual = values?.[condition.key];
  if (condition.operator === 'exists') return actual !== undefined && actual !== null;
  const equals = scalarEquals(actual, condition.value);
  return condition.operator === 'equals' ? equals : !equals;
}

function scalarEquals(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== 'string' && typeof actual !== 'number' && typeof actual !== 'boolean') {
    return false;
  }
  return actual === expected;
}

function localeMatches(expectedValue: string, currentValue: string): boolean {
  try {
    const expected = Intl.getCanonicalLocales(expectedValue)[0];
    const current = Intl.getCanonicalLocales(currentValue)[0];
    if (!expected || !current) return false;
    return expected === current || expected.split('-')[0] === current.split('-')[0];
  } catch {
    return false;
  }
}
