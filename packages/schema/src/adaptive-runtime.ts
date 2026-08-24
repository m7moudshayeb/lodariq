import {
  ADAPTIVE_EVIDENCE_MAX_ITEMS,
  ADAPTIVE_OCCURRENCE_MAX,
} from './adaptive-limits';

export { ADAPTIVE_EVIDENCE_MAX_ITEMS, ADAPTIVE_OCCURRENCE_MAX } from './adaptive-limits';

export interface AdaptiveRuntimePolicy {
  enabled: boolean;
  minimumOccurrences: number;
  lookbackDays: number;
}

export interface AdaptiveRuntimeEvidence {
  eventName: string;
  occurrences: number;
  lastObservedAt: string;
}

export interface AdaptiveRuntimeContext {
  policy: AdaptiveRuntimePolicy;
  evaluatedAt: string;
  evidence: readonly AdaptiveRuntimeEvidence[];
}

export interface AdaptiveRuntimeStep {
  id: string;
  teaches?: string;
}

export const ADAPTIVE_DECISION_REASONS = [
  'disabled',
  'no-behaviour',
  'no-evidence',
  'insufficient-evidence',
  'demonstrated',
  'flow-guard',
  'invalid-context',
] as const;

export type AdaptiveDecisionReason = (typeof ADAPTIVE_DECISION_REASONS)[number];

export interface AdaptiveStepDecision {
  stepId: string;
  action: 'show' | 'skip';
  reason: AdaptiveDecisionReason;
  eventName?: string;
  occurrences: number;
  minimumOccurrences: number;
  lookbackDays: number;
  lastObservedAt?: string;
}

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** One deterministic planner shared by delivery and creator preview. */
export function planAdaptiveSteps(
  steps: readonly AdaptiveRuntimeStep[],
  context?: AdaptiveRuntimeContext,
): AdaptiveStepDecision[] {
  const policy = context?.policy;
  const evaluatedAtMs = context ? Date.parse(context.evaluatedAt) : Number.NaN;
  const validContext = Boolean(
    context &&
    policy &&
    typeof policy.enabled === 'boolean' &&
    integerInRange(policy.minimumOccurrences, 1, ADAPTIVE_OCCURRENCE_MAX) &&
    integerInRange(policy.lookbackDays, 1, 365) &&
    Number.isFinite(evaluatedAtMs) &&
    Array.isArray(context.evidence) &&
    context.evidence.length <= ADAPTIVE_EVIDENCE_MAX_ITEMS,
  );
  const minimumOccurrences = validContext ? policy!.minimumOccurrences : 1;
  const lookbackDays = validContext ? policy!.lookbackDays : 1;
  const evidence = validContext
    ? normalizeEvidence(context!.evidence, evaluatedAtMs, lookbackDays)
    : new Map<string, AdaptiveRuntimeEvidence>();

  const decisions = steps.map((step): AdaptiveStepDecision => {
    const eventName = normalizedEventName(step.teaches);
    const common = {
      stepId: step.id,
      occurrences: 0,
      minimumOccurrences,
      lookbackDays,
    };
    if (!validContext) return { ...common, action: 'show', reason: 'invalid-context' };
    if (!policy!.enabled) return { ...common, action: 'show', reason: 'disabled' };
    if (!eventName) return { ...common, action: 'show', reason: 'no-behaviour' };
    const observed = evidence.get(eventName);
    if (!observed) {
      return { ...common, action: 'show', reason: 'no-evidence', eventName };
    }
    const observedCommon = {
      ...common,
      eventName,
      occurrences: observed.occurrences,
      lastObservedAt: observed.lastObservedAt,
    };
    return observed.occurrences >= policy!.minimumOccurrences
      ? { ...observedCommon, action: 'skip', reason: 'demonstrated' }
      : { ...observedCommon, action: 'show', reason: 'insufficient-evidence' };
  });

  if (decisions.length > 0 && decisions.every((decision) => decision.action === 'skip')) {
    const final = decisions[decisions.length - 1]!;
    decisions[decisions.length - 1] = { ...final, action: 'show', reason: 'flow-guard' };
  }
  return decisions;
}

function normalizeEvidence(
  values: readonly AdaptiveRuntimeEvidence[],
  evaluatedAtMs: number,
  lookbackDays: number,
): Map<string, AdaptiveRuntimeEvidence> {
  const result = new Map<string, AdaptiveRuntimeEvidence>();
  const cutoffMs = evaluatedAtMs - lookbackDays * DAY_MS;
  for (const value of values) {
    const eventName = normalizedEventName(value?.eventName);
    const observedAtMs = Date.parse(value?.lastObservedAt ?? '');
    if (
      !eventName ||
      !integerInRange(value?.occurrences, 0, ADAPTIVE_OCCURRENCE_MAX) ||
      !Number.isFinite(observedAtMs) ||
      observedAtMs < cutoffMs ||
      observedAtMs > evaluatedAtMs
    ) {
      continue;
    }
    const current = result.get(eventName);
    if (!current || value.occurrences > current.occurrences) {
      result.set(eventName, {
        eventName,
        occurrences: value.occurrences,
        lastObservedAt: value.lastObservedAt,
      });
    }
  }
  return result;
}

function normalizedEventName(value: unknown): string | null {
  return typeof value === 'string' && EVENT_NAME_PATTERN.test(value) ? value : null;
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
