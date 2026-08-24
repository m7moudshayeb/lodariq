import type {
  ExperienceSession,
  ExperienceSessionBeat,
  ExperienceSessionOutcome,
} from '@lodariq/schema';
import type { MeasurableEvent } from './experience-measurement';

/**
 * Replaying one visitor's pass through one experience.
 *
 * What is replayed is the experience's own beats — shown, moved to a step,
 * resolved or failed to resolve a target, took a branch, finished or left. Not
 * the page: no DOM, no pointer, no keystrokes. ADR-0015 rules that out, and it
 * is also the difference between a feature a security review passes and one it
 * does not.
 *
 * A session is therefore reconstructed rather than recorded, from events that
 * already carry a correlation id. Nothing extra is stored about a person.
 */

/** Beats worth replaying. Anything else is noise in a timeline. */
const REPLAYED_EVENTS = new Set([
  'tour_started',
  'tour_step_changed',
  'tour_branch_chosen',
  'tour_adaptive_step_skipped',
  'tour_completed',
  'tour_dismissed',
  'tour_skipped',
  'target_resolution',
]);

const OUTCOME_BY_EVENT: Readonly<Record<string, ExperienceSessionOutcome>> = {
  tour_completed: 'completed',
  tour_dismissed: 'dismissed',
  tour_skipped: 'skipped',
};

export interface ListExperienceSessionsInput {
  workspaceId: string;
  documentId: string;
  environmentId: string;
  limit?: number;
}

export const EXPERIENCE_SESSION_DEFAULT_LIMIT = 25;
export const EXPERIENCE_SESSION_MAX_BEATS = 200;

/**
 * Newest first, because the session someone wants is almost always the one that
 * just happened. Sessions without a correlation id are dropped rather than
 * merged: attributing separate visitors to one timeline would be a lie.
 */
export function buildExperienceSessions(
  events: readonly MeasurableEvent[],
  limit = EXPERIENCE_SESSION_DEFAULT_LIMIT,
): ExperienceSession[] {
  const byCorrelation = new Map<string, MeasurableEvent[]>();
  for (const event of events) {
    if (!event.correlationId || !REPLAYED_EVENTS.has(event.name)) continue;
    const bucket = byCorrelation.get(event.correlationId) ?? [];
    bucket.push(event);
    byCorrelation.set(event.correlationId, bucket);
  }

  const sessions: ExperienceSession[] = [];
  for (const [correlationId, bucket] of byCorrelation) {
    const ordered = [...bucket].sort(
      (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
    );
    const startMs = Date.parse(ordered[0]!.occurredAt);
    const endMs = Date.parse(ordered[ordered.length - 1]!.occurredAt);
    const beats = ordered
      .slice(0, EXPERIENCE_SESSION_MAX_BEATS)
      .map((event) => toBeat(event, startMs));
    const stepsReached = new Set(
      ordered.filter((event) => event.name === 'tour_step_changed').map((event) => event.stepId),
    ).size;
    const unresolved = ordered
      .filter((event) => event.name === 'target_resolution' && event.props?.['result'] !== 'found')
      .map((event) => event.stepId)
      .filter((stepId): stepId is string => Boolean(stepId));
    const ending = [...ordered]
      .reverse()
      .find((event) => OUTCOME_BY_EVENT[event.name] !== undefined);

    sessions.push({
      correlationId,
      startedAt: ordered[0]!.occurredAt,
      endedAt: ordered[ordered.length - 1]!.occurredAt,
      durationMs: Math.max(0, endMs - startMs),
      outcome: ending ? OUTCOME_BY_EVENT[ending.name]! : 'abandoned',
      stepsReached,
      unresolvedStepIds: [...new Set(unresolved)],
      beats,
    });
  }

  return sessions
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    .slice(0, limit);
}

function toBeat(event: MeasurableEvent, startMs: number): ExperienceSessionBeat {
  const result = event.props?.['result'];
  const reasonCode = event.props?.['reasonCode'];
  return {
    name: event.name,
    at: event.occurredAt,
    offsetMs: Math.max(0, Date.parse(event.occurredAt) - startMs),
    ...(event.stepId ? { stepId: event.stepId } : {}),
    ...(event.name === 'target_resolution' ? { resolved: result === 'found' } : {}),
    ...(typeof reasonCode === 'string' ? { reasonCode } : {}),
  };
}
