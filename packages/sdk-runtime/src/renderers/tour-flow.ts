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

export interface TourFlowConditionDiagnostic {
  reason: 'invalid-condition' | 'missing-context';
  source: 'completedStep' | 'documentState' | 'identifyTrait' | 'locale' | 'namedEvent' | 'unknown';
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
  onDiagnostic?: (diagnostic: TourFlowConditionDiagnostic) => void,
): boolean {
  if (!showWhen) return true;
  return conditionMatches(showWhen, context, onDiagnostic);
}

function conditionMatches(
  condition: StepTransitionCondition,
  context: TourFlowConditionContext,
  onDiagnostic?: (diagnostic: TourFlowConditionDiagnostic) => void,
): boolean {
  const candidate = condition as Partial<{
    eventName: unknown;
    key: unknown;
    locale: unknown;
    operator: unknown;
    source: unknown;
    stepId: unknown;
    value: unknown;
  }>;
  const source = candidate.source;
  if (source === 'namedEvent') {
    if (typeof candidate.eventName !== 'string') {
      return failCondition(source, 'invalid-condition', onDiagnostic);
    }
    return hasObservedNamedRuntimeEvent(candidate.eventName);
  }
  if (source === 'completedStep') {
    if (typeof candidate.stepId !== 'string') {
      return failCondition(source, 'invalid-condition', onDiagnostic);
    }
    return context.completedStepIds.has(candidate.stepId);
  }
  if (source === 'locale') {
    if (typeof candidate.locale !== 'string') {
      return failCondition(source, 'invalid-condition', onDiagnostic);
    }
    return localeMatches(candidate.locale, context.locale);
  }
  if (source !== 'identifyTrait' && source !== 'documentState') {
    return failCondition('unknown', 'invalid-condition', onDiagnostic);
  }
  const values = source === 'identifyTrait' ? context.identifyTraits : context.documentState;
  if (!values) return failCondition(source, 'missing-context', onDiagnostic);
  if (typeof candidate.key !== 'string') {
    return failCondition(source, 'invalid-condition', onDiagnostic);
  }
  const actual = values[candidate.key];
  if (candidate.operator === 'exists') return actual !== undefined && actual !== null;
  if (actual === undefined || actual === null) {
    return failCondition(source, 'missing-context', onDiagnostic);
  }
  if (
    (candidate.operator !== 'equals' && candidate.operator !== 'notEquals') ||
    !isScalar(candidate.value) ||
    !isScalar(actual)
  ) {
    return failCondition(source, 'invalid-condition', onDiagnostic);
  }
  const equals = scalarEquals(actual, candidate.value);
  return candidate.operator === 'equals' ? equals : !equals;
}

function failCondition(
  source: TourFlowConditionDiagnostic['source'],
  reason: TourFlowConditionDiagnostic['reason'],
  onDiagnostic?: (diagnostic: TourFlowConditionDiagnostic) => void,
): false {
  onDiagnostic?.({ reason, source });
  return false;
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function scalarEquals(actual: unknown, expected: unknown): boolean {
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
