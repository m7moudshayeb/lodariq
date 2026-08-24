import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_SESSION_MAX_BEATS,
  buildExperienceSessions,
  type MeasurableEvent,
} from '@lodariq/database';

const AT = (seconds: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

function event(partial: Partial<MeasurableEvent> & { name: string }): MeasurableEvent {
  return { documentId: 'doc_1', occurredAt: AT(0), correlationId: 'visitor_a', ...partial };
}

describe('rebuilding a session from its beats', () => {
  const events: MeasurableEvent[] = [
    event({ name: 'tour_started', occurredAt: AT(0) }),
    event({ name: 'tour_step_changed', stepId: 'step_1', occurredAt: AT(1) }),
    event({
      name: 'target_resolution',
      stepId: 'step_1',
      occurredAt: AT(1),
      props: { result: 'found' },
    }),
    event({ name: 'tour_step_changed', stepId: 'step_2', occurredAt: AT(9) }),
    event({
      name: 'target_resolution',
      stepId: 'step_2',
      occurredAt: AT(9),
      props: { result: 'not_found', reasonCode: 'ambiguous' },
    }),
    event({ name: 'tour_completed', occurredAt: AT(20) }),
  ];

  it('orders the beats and measures them from the start', () => {
    const [session] = buildExperienceSessions(events);
    expect(session?.beats.map((beat) => beat.name)).toEqual([
      'tour_started',
      'tour_step_changed',
      'target_resolution',
      'tour_step_changed',
      'target_resolution',
      'tour_completed',
    ]);
    expect(session?.beats[3]?.offsetMs).toBe(9_000);
    expect(session?.durationMs).toBe(20_000);
  });

  it('says how it ended and how far it got', () => {
    const [session] = buildExperienceSessions(events);
    expect(session?.outcome).toBe('completed');
    expect(session?.stepsReached).toBe(2);
  });

  it('names the steps whose target was not found, which is why most stall', () => {
    const [session] = buildExperienceSessions(events);
    expect(session?.unresolvedStepIds).toEqual(['step_2']);
    expect(session?.beats[4]).toMatchObject({ resolved: false, reasonCode: 'ambiguous' });
  });

  it('calls a session with no ending abandoned rather than guessing', () => {
    const [session] = buildExperienceSessions(events.slice(0, 4));
    expect(session?.outcome).toBe('abandoned');
  });

  it('replays an adaptive skip without calling it abandonment or a manual skip', () => {
    const [session] = buildExperienceSessions([
      event({ name: 'tour_started', occurredAt: AT(0) }),
      event({
        name: 'tour_adaptive_step_skipped',
        stepId: 'step_known',
        occurredAt: AT(1),
        props: { reason: 'demonstrated' },
      }),
      event({ name: 'tour_completed', occurredAt: AT(2) }),
    ]);
    expect(session?.beats.map((beat) => beat.name)).toEqual([
      'tour_started',
      'tour_adaptive_step_skipped',
      'tour_completed',
    ]);
    expect(session?.outcome).toBe('completed');
  });

  it('carries nothing about the person beyond the correlation', () => {
    const [session] = buildExperienceSessions(events);
    expect(Object.keys(session!).sort()).toEqual([
      'beats',
      'correlationId',
      'durationMs',
      'endedAt',
      'outcome',
      'startedAt',
      'stepsReached',
      'unresolvedStepIds',
    ]);
  });
});

describe('separating one visitor from another', () => {
  it('never merges events that carry different correlations', () => {
    const sessions = buildExperienceSessions([
      event({ name: 'tour_started', correlationId: 'a', occurredAt: AT(0) }),
      event({ name: 'tour_started', correlationId: 'b', occurredAt: AT(5) }),
      event({ name: 'tour_completed', correlationId: 'a', occurredAt: AT(9) }),
    ]);
    expect(sessions.map((session) => session.correlationId)).toEqual(['b', 'a']);
    expect(sessions.find((session) => session.correlationId === 'a')?.outcome).toBe('completed');
  });

  it('drops events with no correlation instead of pooling them into one timeline', () => {
    expect(
      buildExperienceSessions([event({ name: 'tour_started', correlationId: undefined })]),
    ).toEqual([]);
  });

  it('ignores beats that are not part of the experience’s own story', () => {
    const [session] = buildExperienceSessions([
      event({ name: 'tour_started', occurredAt: AT(0) }),
      event({ name: 'sdk_loaded', occurredAt: AT(1) }),
      event({ name: 'invited_teammate', occurredAt: AT(2) }),
    ]);
    expect(session?.beats.map((beat) => beat.name)).toEqual(['tour_started']);
  });

  it('returns the newest sessions first and honours the limit', () => {
    const many = Array.from({ length: 40 }, (_unused, index) =>
      event({ name: 'tour_started', correlationId: `v${index}`, occurredAt: AT(index) }),
    );
    const sessions = buildExperienceSessions(many, 5);
    expect(sessions).toHaveLength(5);
    expect(sessions[0]?.correlationId).toBe('v39');
  });

  it('caps the beats it keeps so one runaway session cannot flood the view', () => {
    const noisy = Array.from({ length: EXPERIENCE_SESSION_MAX_BEATS + 50 }, (_unused, index) =>
      event({ name: 'tour_step_changed', stepId: `step_${index}`, occurredAt: AT(index) }),
    );
    const [session] = buildExperienceSessions(noisy);
    expect(session?.beats).toHaveLength(EXPERIENCE_SESSION_MAX_BEATS);
  });
});
