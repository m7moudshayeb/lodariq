import { createHash } from 'node:crypto';
import {
  canonicalContentLocale,
  EXPERIMENT_MIN_TRAFFIC_PERCENT,
  EXPERIMENT_SIGNIFICANCE_THRESHOLD,
  type AdaptivePolicy,
  type AdaptiveBehaviorEvidence,
  type AdoptionImpact,
  type AnalyticsAudienceSegmentIdentity,
  type ApplicationSummary,
  type AuthoringPresenceSelection,
  type Experiment,
  type ExperimentArm,
  type ExperimentArmResult,
  type ExperimentResults,
  type ExperienceCommentAuditEvent,
  type ExperienceFormResponseSummary,
  type ExperienceFunnelStep,
  type ExperienceAnalyticsBreakdown,
  type ExperienceAudienceSegmentAnalytics,
  type ExperienceLocaleAnalytics,
  type ExperienceReleaseAnalytics,
  type ExperienceRetentionWeek,
  type ExperienceStepLock,
  type SuccessEvent,
} from '@lodariq/schema';
import type { PersistedAnalyticsEventRecord } from './analytics';

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

export interface ExperienceExperimentAllocationRecord {
  workspaceId: string;
  experimentId: string;
  revision: number;
  arms: ExperimentArm[];
  createdAt: string;
}

export interface ExperienceExperimentAssignmentRecord {
  workspaceId: string;
  environmentId: string;
  experimentId: string;
  assignmentKeyHash: string;
  armId: ExperimentArm['id'];
  allocationRevision: number;
  createdAt: string;
}

export interface ExperienceCommentRecord {
  id: string;
  workspaceId: string;
  documentId: string;
  stepId: string;
  targetId?: string;
  parentCommentId?: string;
  author: string;
  body: string;
  authorUserId?: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
  createdAt: string;
}

export interface ExperienceCommentAuditEventRecord extends ExperienceCommentAuditEvent {
  workspaceId: string;
  documentId: string;
}

export interface ExperienceStepLockRecord extends ExperienceStepLock {
  workspaceId: string;
  documentId: string;
  /** Server-side only: the wire type deliberately omits it. */
  holderUserId: string;
  sessionId: string;
  acquiredAt: string;
}

export interface AuthoringPresenceRecord {
  workspaceId: string;
  documentId: string;
  sessionId: string;
  creatorId: string;
  creatorName: string;
  stepId: string | null;
  selection: AuthoringPresenceSelection | null;
  documentUpdatedAt?: string;
  lastSeenAt: string;
  expiresAt: string;
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
  publicationId?: string | null;
  contentHash?: string | null;
  pointerGeneration?: number | null;
  visitorKeyHash?: string | null;
  stepId?: string | null;
  correlationId?: string | null;
  occurredAt: string;
  experimentId?: string | null;
  armId?: ExperimentArm['id'] | null;
  experimentAllocationRevision?: number | null;
  audienceSegment?: AnalyticsAudienceSegmentIdentity | null;
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

export function deriveExperienceAnalyticsBreakdown(input: {
  documentId: string;
  events: readonly MeasurableEvent[];
  responses: readonly ExperienceFormResponseRecord[];
  stepIdsInOrder: readonly string[];
  retentionDays: number;
  asOf: string;
  successEvent?: SuccessEvent;
  includeAudienceSegments?: boolean;
  audienceSegmentsByPublication?: ReadonlyMap<string, AnalyticsAudienceSegmentIdentity>;
}): ExperienceAnalyticsBreakdown {
  const scoped = input.events
    .filter((event) => event.documentId === input.documentId)
    .map((event) => withResolvedAudienceSegment(event, input.audienceSegmentsByPublication));
  const releases = groupAnalytics(scoped, (event) =>
    event.publicationId && event.contentHash && event.pointerGeneration
      ? `${event.publicationId}\0${event.contentHash}\0${event.pointerGeneration}`
      : null,
  )
    .map(([key, events]) => {
      const [publicationId, contentHash, generation] = key.split('\0');
      const audienceSegment = commonAudienceSegment(events);
      return {
        publicationId: publicationId!,
        contentHash: contentHash!,
        pointerGeneration: Number(generation),
        ...(input.includeAudienceSegments && audienceSegment ? { audienceSegment } : {}),
        ...analyticsCounts(events, responsesForEvents(input.responses, events), input),
      } satisfies ExperienceReleaseAnalytics;
    })
    .sort((left, right) => right.pointerGeneration - left.pointerGeneration);

  const locales = groupAnalytics(scoped, analyticsLocale)
    .map(([locale, events]) => ({
      locale,
      ...analyticsCounts(events, responsesForEvents(input.responses, events), input),
    }))
    .sort((left, right) =>
      left.locale.localeCompare(right.locale),
    ) satisfies ExperienceLocaleAnalytics[];

  const asOfMs = Date.parse(input.asOf);
  const audienceSegments = input.includeAudienceSegments
    ? groupAnalytics(scoped, audienceSegmentGroupKey)
        .map(([key, events]) => {
          const segment = commonAudienceSegment(events)!;
          return {
            ...segment,
            ...analyticsCounts(events, responsesForEvents(input.responses, events), {
              ...input,
              events: scoped.filter((event) => audienceSegmentGroupKey(event) === key),
            }),
          } satisfies ExperienceAudienceSegmentAnalytics;
        })
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, 100)
    : undefined;
  return {
    definitionVersion: 1,
    asOf: input.asOf,
    retentionDays: input.retentionDays,
    retentionCutoff: new Date(asOfMs - input.retentionDays * 24 * 60 * 60 * 1_000).toISOString(),
    releases,
    locales,
    ...(audienceSegments ? { audienceSegments } : {}),
    retention: deriveRetentionWeeks(scoped, input.events, input.retentionDays, asOfMs),
  };
}

function withResolvedAudienceSegment(
  event: MeasurableEvent,
  byPublication?: ReadonlyMap<string, AnalyticsAudienceSegmentIdentity>,
): MeasurableEvent {
  if (event.audienceSegment || !event.publicationId || !event.contentHash) return event;
  const audienceSegment = byPublication?.get(
    audienceSegmentPublicationKey(event.publicationId, event.contentHash),
  );
  return audienceSegment ? { ...event, audienceSegment } : event;
}

export function audienceSegmentPublicationKey(publicationId: string, contentHash: string): string {
  return `${publicationId}\0${contentHash}`;
}

function commonAudienceSegment(
  events: readonly MeasurableEvent[],
): AnalyticsAudienceSegmentIdentity | null {
  const segments = new Map(
    events.flatMap((event) =>
      event.audienceSegment
        ? [[audienceSegmentGroupKey(event)!, event.audienceSegment] as const]
        : [],
    ),
  );
  return segments.size === 1 ? structuredClone([...segments.values()][0]!) : null;
}

function audienceSegmentGroupKey(event: MeasurableEvent): string | null {
  const segment = event.audienceSegment;
  return segment ? `${segment.id}\0${segment.definitionVersion}\0${segment.ruleCount}` : null;
}

function analyticsCounts(
  scoped: readonly MeasurableEvent[],
  responses: readonly ExperienceFormResponseRecord[],
  input: {
    events: readonly MeasurableEvent[];
    stepIdsInOrder: readonly string[];
    successEvent?: SuccessEvent;
  },
) {
  return {
    shown: countDistinctCorrelations(scoped, EXPERIENCE_SHOWN_EVENT),
    completed: countDistinctCorrelations(scoped, EXPERIENCE_COMPLETED_EVENT),
    dismissed: countDistinctCorrelations(scoped, EXPERIENCE_DISMISSED_EVENT),
    funnel: deriveFunnel(scoped, input.stepIdsInOrder),
    adoption: input.successEvent
      ? [deriveAdoptionImpact(input.successEvent, scoped, input.events)]
      : [],
    formResponses: summarizeFormResponses(responses),
  };
}

function groupAnalytics(
  events: readonly MeasurableEvent[],
  keyOf: (event: MeasurableEvent) => string | null,
): Array<[string, MeasurableEvent[]]> {
  const groups = new Map<string, MeasurableEvent[]>();
  for (const event of events) {
    const key = keyOf(event);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.entries()];
}

function analyticsLocale(event: MeasurableEvent): string | null {
  const value = event.props?.['locale'];
  if (typeof value !== 'string') return null;
  try {
    return canonicalContentLocale(value);
  } catch {
    return null;
  }
}

function responsesForEvents(
  responses: readonly ExperienceFormResponseRecord[],
  events: readonly MeasurableEvent[],
): ExperienceFormResponseRecord[] {
  const correlations = new Set(
    events.flatMap((event) => (event.correlationId ? [event.correlationId] : [])),
  );
  return responses.filter(
    (response) => response.correlationId && correlations.has(response.correlationId),
  );
}

function deriveRetentionWeeks(
  scoped: readonly MeasurableEvent[],
  allEvents: readonly MeasurableEvent[],
  retentionDays: number,
  asOfMs: number,
): ExperienceRetentionWeek[] {
  const exposedAt = firstVisitorEvent(
    scoped.filter((event) => event.name === EXPERIENCE_SHOWN_EVENT),
  );
  const allByVisitor = new Map<string, number[]>();
  for (const event of allEvents) {
    if (!event.visitorKeyHash) continue;
    const at = Date.parse(event.occurredAt);
    const visits = allByVisitor.get(event.visitorKeyHash) ?? [];
    visits.push(at);
    allByVisitor.set(event.visitorKeyHash, visits);
  }
  const baselineAt = new Map<string, number>();
  for (const [visitor, visits] of allByVisitor) {
    if (exposedAt.has(visitor)) continue;
    baselineAt.set(visitor, Math.min(...visits));
  }
  const maximumWeek = Math.min(51, Math.floor(retentionDays / 7));
  const result: ExperienceRetentionWeek[] = [];
  for (let week = 1; week <= maximumWeek; week += 1) {
    const exposed = retentionForWeek(exposedAt, allByVisitor, week, asOfMs);
    const baseline = retentionForWeek(baselineAt, allByVisitor, week, asOfMs);
    result.push({
      week,
      exposedCohort: exposed.cohort,
      exposedReturned: exposed.returned,
      baselineCohort: baseline.cohort,
      baselineReturned: baseline.returned,
    });
  }
  return result;
}

function firstVisitorEvent(events: readonly MeasurableEvent[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const event of events) {
    if (!event.visitorKeyHash) continue;
    const at = Date.parse(event.occurredAt);
    const current = first.get(event.visitorKeyHash);
    if (current === undefined || at < current) first.set(event.visitorKeyHash, at);
  }
  return first;
}

function retentionForWeek(
  anchors: ReadonlyMap<string, number>,
  events: ReadonlyMap<string, readonly number[]>,
  week: number,
  asOfMs: number,
): { cohort: number; returned: number } {
  const weekMs = 7 * 24 * 60 * 60 * 1_000;
  let cohort = 0;
  let returned = 0;
  for (const [visitor, anchor] of anchors) {
    const from = anchor + week * weekMs;
    const to = from + weekMs;
    if (from > asOfMs) continue;
    cohort += 1;
    if ((events.get(visitor) ?? []).some((at) => at >= from && at < to)) returned += 1;
  }
  return { cohort, returned };
}

/**
 * Did the behaviour happen afterwards, and did it happen more often than for
 * people who were never shown this?
 *
 * "Treated" means the success event landed *after* the experience was shown and
 * inside the window; an event that fired first proves nothing. The baseline is
 * every other correlation that emitted the success event without ever seeing
 * this experience — an imperfect control, but a stated one. Confidence stays
 * null until both cohorts clear the floor, then reports the actual two-sided
 * difference. Equal rates correctly report zero confidence, not the reporting
 * threshold.
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
 * Arm assignment is deterministic over the scoped anonymous key hash. The
 * persisted winner freezes the allocation revision seen by that browser.
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

export function hashExperimentAssignmentKey(input: {
  workspaceId: string;
  environmentId: string;
  experimentId: string;
  assignmentKey: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.workspaceId}\0${input.environmentId}\0${input.experimentId}\0${input.assignmentKey}`,
      'utf8',
    )
    .digest('hex');
}

export function hashAdaptiveVisitorKey(input: {
  workspaceId: string;
  environmentId: string;
  assignmentKey: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.workspaceId}\0${input.environmentId}\0adaptive\0${input.assignmentKey}`,
      'utf8',
    )
    .digest('hex');
}

export interface ReadAdaptiveBehaviorEvidenceInput {
  workspaceId: string;
  environmentId: string;
  adaptiveVisitorKeyHash: string;
  eventNames: readonly string[];
  lookbackDays: number;
  evaluatedAt: string;
}

export function deriveAdaptiveBehaviorEvidence(
  events: readonly Pick<
    PersistedAnalyticsEventRecord,
    'adaptiveVisitorKeyHash' | 'environmentId' | 'name' | 'timestamp' | 'workspaceId'
  >[],
  input: ReadAdaptiveBehaviorEvidenceInput,
): AdaptiveBehaviorEvidence[] {
  if (
    !/^[0-9a-f]{64}$/u.test(input.adaptiveVisitorKeyHash) ||
    !Number.isInteger(input.lookbackDays) ||
    input.lookbackDays < 1 ||
    input.lookbackDays > 365
  ) {
    return [];
  }
  const names = new Set(
    input.eventNames.filter((name) => /^[a-z][a-z0-9_]{0,63}$/u.test(name)).slice(0, 200),
  );
  const evaluatedAt = Date.parse(input.evaluatedAt);
  if (!Number.isFinite(evaluatedAt)) return [];
  const cutoff = evaluatedAt - input.lookbackDays * 24 * 60 * 60 * 1_000;
  const byName = new Map<string, { occurrences: number; lastObservedAt: string }>();
  for (const event of events) {
    const occurredAt = Date.parse(event.timestamp);
    if (
      event.workspaceId !== input.workspaceId ||
      event.environmentId !== input.environmentId ||
      event.adaptiveVisitorKeyHash !== input.adaptiveVisitorKeyHash ||
      !names.has(event.name) ||
      occurredAt < cutoff ||
      occurredAt > evaluatedAt
    ) {
      continue;
    }
    const current = byName.get(event.name);
    byName.set(event.name, {
      occurrences: Math.min(20, (current?.occurrences ?? 0) + 1),
      lastObservedAt:
        !current || event.timestamp > current.lastObservedAt
          ? event.timestamp
          : current.lastObservedAt,
    });
  }
  return [...byName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([eventName, aggregate]) => ({ eventName, ...aggregate }));
}

function stableBucket(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash) % 100;
}

/**
 * A rule the caller broke, as opposed to anything else that can go wrong.
 *
 * These used to be plain `Error`s, and the routes answered 409/422 with
 * `error.message` for *any* throw — so a connection timeout was indistinguishable
 * from invalid traffic percentages. The client then retried a request that could
 * never succeed, or gave up on one that would have.
 */
export class ExperimentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExperimentRuleError';
  }
}

export function assertExperimentArms(arms: readonly ExperimentArm[]): void {
  const total = arms.reduce((sum, arm) => sum + arm.trafficPercent, 0);
  if (total !== 100) throw new ExperimentRuleError('experiment traffic must total 100 percent');
  if (arms.some((arm) => arm.trafficPercent < EXPERIMENT_MIN_TRAFFIC_PERCENT)) {
    throw new ExperimentRuleError(
      'an experiment arm below the minimum traffic share cannot reach significance',
    );
  }
  const ids = new Set(arms.map((arm) => arm.id));
  if (ids.size !== arms.length) {
    throw new ExperimentRuleError('experiment arm ids must be unique');
  }
}

export function experimentVariantContentChanged(
  current: readonly ExperimentArm[],
  next: readonly ExperimentArm[],
): boolean {
  const variantContent = (arms: readonly ExperimentArm[]) =>
    JSON.stringify(arms.map(({ trafficPercent: _trafficPercent, ...arm }) => arm));
  return variantContent(current) !== variantContent(next);
}

export function experimentAllocationChanged(
  current: readonly ExperimentArm[],
  next: readonly ExperimentArm[],
): boolean {
  if (current.length !== next.length) return true;
  return current.some(
    (arm) =>
      next.find((candidate) => candidate.id === arm.id)?.trafficPercent !== arm.trafficPercent,
  );
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
    const shownAt = new Map<string, number>();
    const converted = new Set<string>();
    for (const event of events) {
      if (
        event.experimentId !== experiment.id ||
        event.armId !== arm.id ||
        !event.correlationId ||
        event.name !== EXPERIENCE_SHOWN_EVENT
      ) {
        continue;
      }
      const occurredAt = Date.parse(event.occurredAt);
      const current = shownAt.get(event.correlationId);
      if (current === undefined || occurredAt < current)
        shownAt.set(event.correlationId, occurredAt);
    }
    for (const event of events) {
      if (
        event.experimentId !== experiment.id ||
        event.armId !== arm.id ||
        !event.correlationId ||
        event.name !== experiment.successEventName
      ) {
        continue;
      }
      const exposure = shownAt.get(event.correlationId);
      if (exposure !== undefined && Date.parse(event.occurredAt) >= exposure) {
        converted.add(event.correlationId);
      }
    }
    return {
      armId: arm.id,
      exposures: shownAt.size,
      conversions: converted.size,
      conversionRate: shownAt.size ? converted.size / shownAt.size : 0,
    };
  });

  const ranked = [...arms].sort((left, right) => right.conversionRate - left.conversionRate);
  const [best, runnerUp] = ranked;
  const readable =
    best && runnerUp && arms.every((arm) => arm.exposures >= MEASUREMENT_REPORTING_FLOOR);
  const confidencePercent =
    readable && best && runnerUp
      ? twoSidedConfidencePercent(conversionZScore(best, runnerUp))
      : null;
  const conclusive =
    confidencePercent !== null && confidencePercent >= EXPERIMENT_SIGNIFICANCE_THRESHOLD;

  return {
    experimentId: experiment.id,
    allocationRevision: experiment.allocationRevision,
    arms,
    leadingArmId: conclusive && best ? best.armId : null,
    confidencePercent,
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

export function authoringPresenceParticipantId(sessionId: string): string {
  return `presence_${createHash('sha256').update(sessionId).digest('hex').slice(0, 24)}`;
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
