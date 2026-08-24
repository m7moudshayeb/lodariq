import { describe, expect, it } from 'vitest';
import type { Experiment, ExperimentArm, SuccessEvent } from '@lodariq/schema';
import {
  EXPERIENCE_COMPLETED_EVENT,
  EXPERIENCE_SHOWN_EVENT,
  EXPERIENCE_STEP_EVENT,
  MEASUREMENT_REPORTING_FLOOR,
  audienceSegmentPublicationKey,
  assertExperimentArms,
  assignExperimentArm,
  canClaimStepLock,
  countDistinctCorrelations,
  deriveAdoptionImpact,
  deriveExperienceAnalyticsBreakdown,
  deriveExperimentResults,
  deriveFunnel,
  summarizeFormResponses,
  type ExperienceFormResponseRecord,
  type ExperienceStepLockRecord,
  type MeasurableEvent,
} from '@lodariq/database';

const AT = (minutes: number): string => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();

function event(partial: Partial<MeasurableEvent> & { name: string }): MeasurableEvent {
  return {
    documentId: 'doc_1',
    occurredAt: AT(0),
    ...partial,
  };
}

describe('funnel', () => {
  it('keeps document order so a backwards branch does not reorder it', () => {
    const funnel = deriveFunnel(
      [
        event({ name: EXPERIENCE_STEP_EVENT, stepId: 'step_3', correlationId: 'a' }),
        event({ name: EXPERIENCE_STEP_EVENT, stepId: 'step_1', correlationId: 'a' }),
        event({ name: EXPERIENCE_STEP_EVENT, stepId: 'step_2', correlationId: 'a' }),
      ],
      ['step_1', 'step_2', 'step_3'],
    );
    expect(funnel.map((entry) => entry.stepId)).toEqual(['step_1', 'step_2', 'step_3']);
  });

  it('counts people, not events, so a revisit is not a second reach', () => {
    const funnel = deriveFunnel(
      [
        event({ name: EXPERIENCE_STEP_EVENT, stepId: 'step_1', correlationId: 'a' }),
        event({
          name: EXPERIENCE_STEP_EVENT,
          stepId: 'step_1',
          correlationId: 'a',
          occurredAt: AT(5),
        }),
        event({ name: EXPERIENCE_STEP_EVENT, stepId: 'step_1', correlationId: 'b' }),
      ],
      ['step_1'],
    );
    expect(funnel[0]).toEqual({ stepId: 'step_1', reached: 2, completed: 0 });
  });

  it('reports a step nobody reached rather than dropping it', () => {
    const funnel = deriveFunnel([], ['step_1', 'step_2']);
    expect(funnel).toEqual([
      { stepId: 'step_1', reached: 0, completed: 0 },
      { stepId: 'step_2', reached: 0, completed: 0 },
    ]);
  });

  it('counts distinct visitors for the headline numbers', () => {
    const events = [
      event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a' }),
      event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a', occurredAt: AT(1) }),
      event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'b' }),
      event({ name: EXPERIENCE_COMPLETED_EVENT, correlationId: 'a' }),
    ];
    expect(countDistinctCorrelations(events, EXPERIENCE_SHOWN_EVENT)).toBe(2);
    expect(countDistinctCorrelations(events, EXPERIENCE_COMPLETED_EVENT)).toBe(1);
  });
});

describe('analytics report breakdown', () => {
  it('keeps releases separate and derives privacy-safe weekly return cohorts', () => {
    const day = (value: number): string => new Date(Date.UTC(2026, 0, value, 0, 0)).toISOString();
    const release = (
      generation: number,
      partial: Partial<MeasurableEvent> & { name: string },
    ): MeasurableEvent =>
      event({
        publicationId: `pub_${generation}`,
        contentHash: `sha256-${String(generation).repeat(64)}`,
        pointerGeneration: generation,
        audienceSegment: {
          id: `audseg_${String(generation).repeat(64)}`,
          definitionVersion: 1,
          ruleCount: generation,
        },
        ...partial,
      });
    const events = [
      release(1, {
        name: EXPERIENCE_SHOWN_EVENT,
        correlationId: 'session_a',
        visitorKeyHash: 'visitor_a',
        occurredAt: day(1),
        props: { locale: 'en-US' },
      }),
      release(1, {
        name: EXPERIENCE_STEP_EVENT,
        stepId: 'step_1',
        correlationId: 'session_a',
        visitorKeyHash: 'visitor_a',
        occurredAt: day(9),
        props: { locale: 'en-US' },
      }),
      release(1, {
        name: 'invited_teammate',
        correlationId: 'session_a',
        occurredAt: day(2),
      }),
      release(2, {
        name: EXPERIENCE_SHOWN_EVENT,
        correlationId: 'session_b',
        visitorKeyHash: 'visitor_b',
        occurredAt: day(15),
        props: { locale: 'de' },
      }),
      event({
        name: 'product_activity',
        documentId: 'doc_other',
        visitorKeyHash: 'visitor_baseline',
        occurredAt: day(1),
      }),
      event({
        name: 'product_activity',
        documentId: 'doc_other',
        visitorKeyHash: 'visitor_baseline',
        occurredAt: day(9),
      }),
    ];
    const responses: ExperienceFormResponseRecord[] = [
      {
        id: 'form_1',
        workspaceId: 'ws_1',
        environmentId: 'env_1',
        documentId: 'doc_1',
        stepId: 'step_1',
        blockId: 'field_1',
        label: 'Team size',
        answer: '10–20',
        correlationId: 'session_a',
        occurredAt: day(2),
      },
    ];

    const report = deriveExperienceAnalyticsBreakdown({
      documentId: 'doc_1',
      events,
      responses,
      stepIdsInOrder: ['step_1'],
      retentionDays: 30,
      asOf: day(22),
      includeAudienceSegments: true,
      successEvent: { eventName: 'invited_teammate', windowDays: 7 },
    });

    expect(report.releases.map((item) => [item.pointerGeneration, item.shown])).toEqual([
      [2, 1],
      [1, 1],
    ]);
    expect(report.releases[1]?.formResponses[0]?.answerCount).toBe(1);
    expect(report.locales.map((item) => item.locale)).toEqual(['de', 'en-US']);
    expect(report.audienceSegments?.map((item) => [item.ruleCount, item.shown])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(report.releases[0]?.audienceSegment?.ruleCount).toBe(2);
    const firstAudience = report.audienceSegments?.find((item) => item.ruleCount === 1);
    expect(firstAudience?.adoption[0]).toMatchObject({ treatedCount: 1, baselineCount: 0 });
    expect(firstAudience?.funnel[0]).toMatchObject({ stepId: 'step_1', reached: 1 });
    expect(firstAudience?.formResponses[0]).toMatchObject({ blockId: 'field_1', answerCount: 1 });
    expect(report.retention[0]).toEqual({
      week: 1,
      exposedCohort: 2,
      exposedReturned: 1,
      baselineCohort: 1,
      baselineReturned: 1,
    });
    expect(report.retentionCutoff).toBe(day(-8));
  });

  it('attributes retained legacy events from their immutable publication', () => {
    const audienceSegment = {
      id: `audseg_${'a'.repeat(64)}`,
      definitionVersion: 1 as const,
      ruleCount: 2,
    };
    const report = deriveExperienceAnalyticsBreakdown({
      documentId: 'doc_1',
      events: [
        event({
          name: EXPERIENCE_SHOWN_EVENT,
          correlationId: 'legacy_session',
          publicationId: 'pub_legacy',
          contentHash: `sha256-${'b'.repeat(64)}`,
          pointerGeneration: 4,
        }),
      ],
      responses: [],
      stepIdsInOrder: [],
      retentionDays: 30,
      asOf: AT(5),
      includeAudienceSegments: true,
      audienceSegmentsByPublication: new Map([
        [audienceSegmentPublicationKey('pub_legacy', `sha256-${'b'.repeat(64)}`), audienceSegment],
      ]),
    });

    expect(report.audienceSegments).toEqual([
      expect.objectContaining({ ...audienceSegment, shown: 1 }),
    ]);
    expect(report.releases[0]?.audienceSegment).toEqual(audienceSegment);
  });
});

describe('adoption impact', () => {
  const successEvent: SuccessEvent = { eventName: 'invited_teammate', windowDays: 7 };

  it('only counts a success that happened after the experience was shown', () => {
    const impact = deriveAdoptionImpact(
      successEvent,
      [event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a', occurredAt: AT(10) })],
      [
        // Before being shown: proves nothing about the experience.
        event({ name: 'invited_teammate', correlationId: 'a', occurredAt: AT(5) }),
      ],
    );
    expect(impact.treatedCount).toBe(0);
  });

  it('counts a success inside the window and ignores one outside it', () => {
    const shown = [event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a', occurredAt: AT(0) })];
    const inside = deriveAdoptionImpact(successEvent, shown, [
      event({ name: 'invited_teammate', correlationId: 'a', occurredAt: AT(60) }),
    ]);
    const outside = deriveAdoptionImpact(successEvent, shown, [
      event({
        name: 'invited_teammate',
        correlationId: 'a',
        occurredAt: new Date(Date.UTC(2026, 0, 9)).toISOString(),
      }),
    ]);
    expect(inside.treatedCount).toBe(1);
    expect(outside.treatedCount).toBe(0);
  });

  it('separates people who never saw the experience into the baseline', () => {
    const impact = deriveAdoptionImpact(
      successEvent,
      [event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a' })],
      [
        event({ name: 'invited_teammate', correlationId: 'a', occurredAt: AT(30) }),
        event({ name: 'invited_teammate', correlationId: 'b', occurredAt: AT(30) }),
      ],
    );
    expect(impact.treatedCount).toBe(1);
    expect(impact.baselineCount).toBe(1);
  });

  it('withholds confidence until both cohorts clear the reporting floor', () => {
    const small = deriveAdoptionImpact(
      successEvent,
      [event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: 'a' })],
      [event({ name: 'invited_teammate', correlationId: 'b', occurredAt: AT(30) })],
    );
    expect(small.confidencePercent).toBeNull();

    const shown = Array.from({ length: MEASUREMENT_REPORTING_FLOOR }, (_unused, index) =>
      event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: `t${index}` }),
    );
    const equalCohorts = [
      ...shown.map((_unused, index) =>
        event({ name: 'invited_teammate', correlationId: `t${index}`, occurredAt: AT(30) }),
      ),
      ...Array.from({ length: MEASUREMENT_REPORTING_FLOOR }, (_unused, index) =>
        event({ name: 'invited_teammate', correlationId: `b${index}`, occurredAt: AT(30) }),
      ),
    ];
    expect(deriveAdoptionImpact(successEvent, shown, equalCohorts).confidencePercent).toBe(0);
  });

  it('reports the measured confidence after both cohorts clear the floor', () => {
    const shown = Array.from({ length: MEASUREMENT_REPORTING_FLOOR }, (_unused, index) =>
      event({ name: EXPERIENCE_SHOWN_EVENT, correlationId: `t${index}` }),
    );
    const environmentEvents = [
      ...Array.from({ length: MEASUREMENT_REPORTING_FLOOR }, (_unused, index) =>
        event({
          name: EXPERIENCE_SHOWN_EVENT,
          correlationId: `b${index}`,
          documentId: 'baseline_experience',
        }),
      ),
      ...Array.from({ length: 20 }, (_unused, index) =>
        event({ name: 'invited_teammate', correlationId: `t${index}`, occurredAt: AT(30) }),
      ),
      ...Array.from({ length: 10 }, (_unused, index) =>
        event({ name: 'invited_teammate', correlationId: `b${index}`, occurredAt: AT(30) }),
      ),
    ];
    const impact = deriveAdoptionImpact(successEvent, shown, environmentEvents);
    expect(impact.treatedRate).toBeCloseTo(2 / 3);
    expect(impact.baselineRate).toBeCloseTo(1 / 3);
    expect(impact.confidencePercent).toBe(99);
  });
});

describe('experiment arms', () => {
  const arms: ExperimentArm[] = [
    { id: 'A', label: 'Control', trafficPercent: 50 },
    { id: 'B', label: 'Variant', trafficPercent: 50 },
  ];

  it('assigns the same visitor to the same arm every time', () => {
    const first = assignExperimentArm(arms, 'visitor-42');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(assignExperimentArm(arms, 'visitor-42')).toBe(first);
    }
  });

  it('splits roughly along the declared traffic share', () => {
    const skewed: ExperimentArm[] = [
      { id: 'A', label: 'Control', trafficPercent: 90 },
      { id: 'B', label: 'Variant', trafficPercent: 10 },
    ];
    let variant = 0;
    for (let index = 0; index < 1_000; index += 1) {
      if (assignExperimentArm(skewed, `visitor-${index}`) === 'B') variant += 1;
    }
    expect(variant).toBeGreaterThan(40);
    expect(variant).toBeLessThan(180);
  });

  it('refuses a split that does not total 100 or starves an arm', () => {
    expect(() =>
      assertExperimentArms([
        { id: 'A', label: 'Control', trafficPercent: 60 },
        { id: 'B', label: 'Variant', trafficPercent: 60 },
      ]),
    ).toThrow(/total 100/);
    expect(() =>
      assertExperimentArms([
        { id: 'A', label: 'Control', trafficPercent: 99 },
        { id: 'B', label: 'Variant', trafficPercent: 1 },
      ]),
    ).toThrow(/minimum traffic/);
    expect(() => assertExperimentArms(arms)).not.toThrow();
  });
});

describe('experiment results', () => {
  const experiment: Experiment = {
    id: 'exp_1',
    status: 'running',
    varies: 'copy',
    successEventName: 'invited_teammate',
    allocationRevision: 1,
    arms: [
      { id: 'A', label: 'Control', trafficPercent: 50 },
      { id: 'B', label: 'Variant', trafficPercent: 50 },
    ],
  };

  function armEvents(
    armId: ExperimentArm['id'],
    exposures: number,
    conversions: number,
  ): MeasurableEvent[] {
    return [
      ...Array.from({ length: exposures }, (_unused, index) =>
        event({
          name: EXPERIENCE_SHOWN_EVENT,
          correlationId: `${armId}-${index}`,
          experimentId: experiment.id,
          armId,
          experimentAllocationRevision: 1,
        }),
      ),
      ...Array.from({ length: conversions }, (_unused, index) =>
        event({
          name: 'invited_teammate',
          correlationId: `${armId}-${index}`,
          experimentId: experiment.id,
          armId,
          experimentAllocationRevision: 1,
          occurredAt: AT(30),
        }),
      ),
    ];
  }

  it('names no winner on a handful of exposures', () => {
    const results = deriveExperimentResults(experiment, [
      ...armEvents('A', 10, 1),
      ...armEvents('B', 10, 9),
    ]);
    expect(results.leadingArmId).toBeNull();
    expect(results.confidencePercent).toBeNull();
  });

  it('names no winner when the gap is inside the sampling error', () => {
    const results = deriveExperimentResults(experiment, [
      ...armEvents('A', 400, 100),
      ...armEvents('B', 400, 104),
    ]);
    expect(results.leadingArmId).toBeNull();
  });

  it('names the winner once the gap survives the sampling error', () => {
    const results = deriveExperimentResults(experiment, [
      ...armEvents('A', 400, 40),
      ...armEvents('B', 400, 120),
    ]);
    expect(results.leadingArmId).toBe('B');
    expect(results.confidencePercent).toBeGreaterThanOrEqual(95);
    expect(results.allocationRevision).toBe(1);
    expect(results.arms.find((arm) => arm.armId === 'B')?.conversionRate).toBeCloseTo(0.3);
  });
});

describe('form responses', () => {
  function response(partial: Partial<ExperienceFormResponseRecord>): ExperienceFormResponseRecord {
    return {
      id: 'frm_1',
      workspaceId: 'ws',
      environmentId: 'env',
      documentId: 'doc_1',
      stepId: 'step_1',
      blockId: 'block_1',
      label: 'How did it go?',
      answer: 'Great',
      occurredAt: AT(0),
      ...partial,
    };
  }

  it('reports the most common answer per question, busiest question first', () => {
    const summaries = summarizeFormResponses([
      response({ answer: 'Great' }),
      response({ answer: 'Great' }),
      response({ answer: 'Fine' }),
      response({ blockId: 'block_2', label: 'Anything missing?', answer: 'Nope' }),
    ]);
    expect(summaries[0]).toEqual({
      blockId: 'block_1',
      label: 'How did it go?',
      answerCount: 3,
      topAnswer: 'Great',
    });
    expect(summaries[1]?.blockId).toBe('block_2');
  });
});

describe('step lease', () => {
  const lock: ExperienceStepLockRecord = {
    workspaceId: 'ws',
    documentId: 'doc_1',
    stepId: 'step_1',
    holderUserId: 'user_a',
    holderName: 'Ada',
    sessionId: 'sess',
    acquiredAt: AT(0),
    expiresAt: AT(3),
  };
  const now = Date.parse(AT(1));

  it('lets the holder keep extending their own lease', () => {
    expect(canClaimStepLock(lock, 'user_a', now)).toBe(true);
  });

  it('blocks a second creator while the lease is live', () => {
    expect(canClaimStepLock(lock, 'user_b', now)).toBe(false);
  });

  it('treats a lapsed lease as gone rather than as a conflict', () => {
    expect(canClaimStepLock(lock, 'user_b', Date.parse(AT(10)))).toBe(true);
    expect(canClaimStepLock(undefined, 'user_b', now)).toBe(true);
  });
});
