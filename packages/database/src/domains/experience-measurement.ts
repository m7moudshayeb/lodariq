import {
  EXPERIMENT_MIN_TRAFFIC_PERCENT,
  EXPERIMENT_SIGNIFICANCE_THRESHOLD,
  type AdaptivePolicy,
  type AdoptionImpact,
  type ApplicationSummary,
  type Experiment,
  type ExperimentArm,
  type ExperimentArmResult,
  type ExperimentResults,
  type ExperienceComment,
  type ExperienceFormResponseSummary,
  type ExperienceFunnelStep,
  type ExperienceStepLock,
  type SuccessEvent,
} from '@lodariq/schema';

/**
 * Everything Operations measures, derived rather than stored.
 *
 * Counts are computed from delivery events at read time on purpose: a stored
 * counter drifts the moment an event is replayed or a publication is rolled
 * back, and the raw events already carry the immutable delivery identity that
 * makes attribution honest.
 */

/** Below this, a rate is noise. Reporting one anyway is worse than reporting none. */
export const MEASUREMENT_REPORTING_FLOOR = 30;

export const DEFAULT_ADAPTIVE_POLICY: AdaptivePolicy = {
  enabled: false,
  minimumOccurrences: 2,
  lookbackDays: 30,
};

export interface ExperienceMeasurementRecord {
  workspaceId: string;
  documentId: string;
  successEvent?: SuccessEvent;
  adaptivePolicy: AdaptivePolicy;
  updatedAt: string;
}

export interface ExperienceExperimentRecord extends Experiment {
  workspaceId: string;
  documentId: string;
  promotedArmId?: ExperimentArm['id'];
  startedAt?: string;
  stoppedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceCommentRecord extends ExperienceComment {
  workspaceId: string;
  documentId: string;
  authorUserId?: string;
  resolvedByUserId?: string;
}

export interface ExperienceStepLockRecord extends ExperienceStepLock {
  workspaceId: string;
  documentId: string;
  sessionId: string;
  acquiredAt: string;
}

export interface ExperienceFormResponseRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  stepId: string;
  blockId: string;
  label: string;
  answer: string;
  correlationId?: string;
  occurredAt: string;
}

export interface WorkspaceApplicationRecord extends ApplicationSummary {
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

/** The minimum an event needs for any of the derivations below. */
export interface MeasurableEvent {
  name: string;
  documentId: string;
  stepId?: string | null;
  correlationId?: string | null;
  occurredAt: string;
  props?: Record<string, unknown> | null | undefined;
}

export const EXPERIENCE_SHOWN_EVENT = 'experience_shown';
export const EXPERIENCE_STEP_EVENT = 'step_shown';
export const EXPERIENCE_COMPLETED_EVENT = 'experience_completed';
export const EXPERIENCE_DISMISSED_EVENT = 'experience_dismissed';

/**
 * Funnel order comes from the document, not from the events: sorting by first
 * occurrence would reorder the funnel every time a branch sends someone
 * backwards, which reads as a data bug rather than as a branch.
 */
export function deriveFunnel(
  events: readonly MeasurableEvent[],
  stepIdsInOrder: readonly string[],
): ExperienceFunnelStep[] {
  const reached = new Map<string, Set<string>>();
  const completed = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.stepId) continue;
    const bucket = event.name === EXPERIENCE_STEP_EVENT ? reached : completed;
    if (event.name !== EXPERIENCE_STEP_EVENT && event.name !== EXPERIENCE_COMPLETED_EVENT) continue;
    const seen = bucket.get(event.stepId) ?? new Set<string>();
    seen.add(event.correlationId ?? `${event.occurredAt}:${event.stepId}`);
    bucket.set(event.stepId, seen);
  }
  return stepIdsInOrder.map((stepId) => ({
    stepId,
    reached: reached.get(stepId)?.size ?? 0,
    completed: completed.get(stepId)?.size ?? 0,
  }));
}

export function countDistinctCorrelations(
  events: readonly MeasurableEvent[],
  name: string,
): number {
  const seen = new Set<string>();
  for (const event of events) {
    if (event.name !== name) continue;
    seen.add(event.correlationId ?? `${event.occurredAt}:${event.name}`);
  }
  return seen.size;
}

/**
 * Did the behaviour happen afterwards, and did it happen more often than for
 * people who were never shown this?
 *
 * "Treated" means the success event landed *after* the experience was shown and
 * inside the window; an event that fired first proves nothing. The baseline is
 * every other correlation that emitted the success event without ever seeing
 * this experience — an imperfect control, but a stated one, and the confidence
 * stays null until both cohorts clear the floor rather than dressing up noise.
 */
export function deriveAdoptionImpact(
  successEvent: SuccessEvent,
  experienceEvents: readonly MeasurableEvent[],
  successEvents: readonly MeasurableEvent[],
): AdoptionImpact {
  const shownAt = new Map<string, number>();
  for (const event of experienceEvents) {
    if (event.name !== EXPERIENCE_SHOWN_EVENT || !event.correlationId) continue;
    const at = Date.parse(event.occurredAt);
    const earliest = shownAt.get(event.correlationId);
    if (earliest === undefined || at < earliest) shownAt.set(event.correlationId, at);
  }

  const windowMs = successEvent.windowDays * 24 * 60 * 60 * 1000;
  const treatedConverted = new Set<string>();
  const baselineCohortIds = new Set<string>();
  const baselineConverted = new Set<string>();
  for (const event of successEvents) {
    if (!event.correlationId) continue;
    const shown = shownAt.get(event.correlationId);
    if (shown === undefined) {
      baselineCohortIds.add(event.correlationId);
      if (event.name === successEvent.eventName) baselineConverted.add(event.correlationId);
      continue;
    }
    if (event.name !== successEvent.eventName) continue;
    const at = Date.parse(event.occurredAt);
    if (at >= shown && at - shown <= windowMs) treatedConverted.add(event.correlationId);
  }

  const treatedCohort = shownAt.size;
  const baselineCohort = baselineCohortIds.size;
  const treatedRate = treatedCohort ? treatedConverted.size / treatedCohort : 0;
  const baselineRate = baselineCohort ? baselineConverted.size / baselineCohort : 0;
  const bothClearFloor =
    treatedCohort >= MEASUREMENT_REPORTING_FLOOR && baselineCohort >= MEASUREMENT_REPORTING_FLOOR;
  const confidencePercent = bothClearFloor
    ? twoSidedConfidencePercent(
        conversionZScore(
          { exposures: treatedCohort, conversions: treatedConverted.size },
          { exposures: baselineCohort, conversions: baselineConverted.size },
        ),
      )
    : null;

  return {
    eventName: successEvent.eventName,
    windowDays: successEvent.windowDays,
    baselineRate,
    treatedRate,
    baselineCount: baselineConverted.size,
    treatedCount: treatedConverted.size,
    confidencePercent,
  };
}

export function summarizeFormResponses(
  responses: readonly ExperienceFormResponseRecord[],
): ExperienceFormResponseSummary[] {
  const byBlock = new Map<string, { label: string; answers: Map<string, number> }>();
  for (const response of responses) {
    const entry = byBlock.get(response.blockId) ?? {
      label: response.label,
      answers: new Map<string, number>(),
    };
    entry.answers.set(response.answer, (entry.answers.get(response.answer) ?? 0) + 1);
    byBlock.set(response.blockId, entry);
  }
  return [...byBlock.entries()]
    .map(([blockId, entry]) => {
      let topAnswer: string | null = null;
      let topCount = 0;
      let answerCount = 0;
      for (const [answer, count] of entry.answers) {
        answerCount += count;
        if (count > topCount) {
          topAnswer = answer;
          topCount = count;
        }
      }
      return { blockId, label: entry.label, answerCount, topAnswer };
    })
    .sort((left, right) => right.answerCount - left.answerCount);
}

/**
 * Arm assignment is a pure function of the correlation, so a visitor sees the
 * same arm on every page without a lookup and without anything being stored
 * about them. Traffic splits are cumulative bands over the same 0–99 bucket.
 */
export function assignExperimentArm(
  arms: readonly ExperimentArm[],
  correlationId: string,
): ExperimentArm['id'] {
  const bucket = stableBucket(correlationId);
  let ceiling = 0;
  for (const arm of arms) {
    ceiling += arm.trafficPercent;
    if (bucket < ceiling) return arm.id;
  }
  return arms[arms.length - 1]!.id;
}

function stableBucket(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash) % 100;
}

export function assertExperimentArms(arms: readonly ExperimentArm[]): void {
  const total = arms.reduce((sum, arm) => sum + arm.trafficPercent, 0);
  if (total !== 100) throw new Error('experiment traffic must total 100 percent');
  if (arms.some((arm) => arm.trafficPercent < EXPERIMENT_MIN_TRAFFIC_PERCENT)) {
    throw new Error('an experiment arm below the minimum traffic share cannot reach significance');
  }
  const ids = new Set(arms.map((arm) => arm.id));
  if (ids.size !== arms.length) throw new Error('experiment arm ids must be unique');
}

/**
 * A leading arm is only named once both arms clear the floor and the gap is
 * wide enough to survive the sampling error. Anything short of that returns
 * null, because "A is winning" on 12 exposures is how bad decisions get made.
 */
export function deriveExperimentResults(
  experiment: Experiment,
  events: readonly MeasurableEvent[],
): ExperimentResults {
  const arms: ExperimentArmResult[] = experiment.arms.map((arm) => {
    const exposed = new Set<string>();
    const converted = new Set<string>();
    for (const event of events) {
      if (event.props?.['armId'] !== arm.id || !event.correlationId) continue;
      if (event.name === EXPERIENCE_SHOWN_EVENT) exposed.add(event.correlationId);
      if (event.name === experiment.successEventName) converted.add(event.correlationId);
    }
    return {
      armId: arm.id,
      exposures: exposed.size,
      conversions: converted.size,
      conversionRate: exposed.size ? converted.size / exposed.size : 0,
    };
  });

  const ranked = [...arms].sort((left, right) => right.conversionRate - left.conversionRate);
  const [best, runnerUp] = ranked;
  const readable =
    best &&
    runnerUp &&
    arms.every((arm) => arm.exposures >= MEASUREMENT_REPORTING_FLOOR) &&
    conversionZScore(best, runnerUp) >= 1.96;

  return {
    experimentId: experiment.id,
    arms,
    leadingArmId: readable ? best.armId : null,
    confidencePercent: readable ? EXPERIMENT_SIGNIFICANCE_THRESHOLD : null,
  };
}

function conversionZScore(
  left: Pick<ExperimentArmResult, 'conversions' | 'exposures'>,
  right: Pick<ExperimentArmResult, 'conversions' | 'exposures'>,
): number {
  const leftRate = left.exposures ? left.conversions / left.exposures : 0;
  const rightRate = right.exposures ? right.conversions / right.exposures : 0;
  const pooled =
    (left.conversions + right.conversions) / Math.max(1, left.exposures + right.exposures);
  const variance = pooled * (1 - pooled) * (1 / left.exposures + 1 / right.exposures);
  if (variance <= 0) return 0;
  return Math.abs(leftRate - rightRate) / Math.sqrt(variance);
}

/** Two-sided normal confidence, reported as a whole percentage for the UI contract. */
function twoSidedConfidencePercent(zScore: number): number {
  const absolute = Math.abs(zScore);
  const tail = 1 - standardNormalCdf(absolute);
  return Math.max(0, Math.min(100, Math.round((1 - 2 * tail) * 100)));
}

/** Abramowitz-Stegun 7.1.26; ample precision for a whole-number confidence label. */
function standardNormalCdf(value: number): number {
  const t = 1 / (1 + 0.231_641_9 * value);
  const density = Math.exp(-(value * value) / 2) / Math.sqrt(2 * Math.PI);
  const polynomial =
    t *
    (0.319_381_53 +
      t * (-0.356_563_782 + t * (1.781_477_937 + t * (-1.821_255_978 + t * 1.330_274_429))));
  return 1 - density * polynomial;
}

export function activeStepLocks(
  locks: readonly ExperienceStepLockRecord[],
  now: number,
): ExperienceStepLockRecord[] {
  return locks.filter((lock) => Date.parse(lock.expiresAt) > now);
}

/** A lapsed lease is not a conflict — it is simply gone. */
export function canClaimStepLock(
  existing: ExperienceStepLockRecord | undefined,
  userId: string,
  now: number,
): boolean;
export function canClaimStepLock(
  existing: ExperienceStepLockRecord | undefined,
  userId: string,
  sessionId: string,
  now: number,
): boolean;
export function canClaimStepLock(
  existing: ExperienceStepLockRecord | undefined,
  userId: string,
  sessionIdOrNow: string | number,
  maybeNow?: number,
): boolean {
  const sessionId = typeof sessionIdOrNow === 'string' ? sessionIdOrNow : existing?.sessionId;
  const now = typeof sessionIdOrNow === 'number' ? sessionIdOrNow : maybeNow!;
  if (!existing) return true;
  if (Date.parse(existing.expiresAt) <= now) return true;
  return existing.holderUserId === userId && existing.sessionId === sessionId;
}
