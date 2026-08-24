import { describe, expect, it } from 'vitest';
import { planAdaptiveSteps } from '@lodariq/schema/adaptive-runtime';

const evaluatedAt = '2026-08-21T12:00:00.000Z';
const steps = [
  { id: 'welcome' },
  { id: 'create', teaches: 'project_created' },
  { id: 'invite', teaches: 'member_invited' },
];

describe('adaptive runtime planner', () => {
  it('skips only declared behaviours that reach the policy threshold', () => {
    const decisions = planAdaptiveSteps(steps, {
      policy: { enabled: true, minimumOccurrences: 2, lookbackDays: 30 },
      evaluatedAt,
      evidence: [
        { eventName: 'project_created', occurrences: 2, lastObservedAt: evaluatedAt },
        { eventName: 'member_invited', occurrences: 1, lastObservedAt: evaluatedAt },
        { eventName: 'undeclared_event', occurrences: 20, lastObservedAt: evaluatedAt },
      ],
    });

    expect(decisions.map(({ stepId, action, reason }) => ({ stepId, action, reason }))).toEqual([
      { stepId: 'welcome', action: 'show', reason: 'no-behaviour' },
      { stepId: 'create', action: 'skip', reason: 'demonstrated' },
      { stepId: 'invite', action: 'show', reason: 'insufficient-evidence' },
    ]);
  });

  it('ignores stale, future, malformed, and duplicate-inflated evidence', () => {
    const decisions = planAdaptiveSteps([{ id: 'create', teaches: 'project_created' }], {
      policy: { enabled: true, minimumOccurrences: 3, lookbackDays: 7 },
      evaluatedAt,
      evidence: [
        {
          eventName: 'project_created',
          occurrences: 20,
          lastObservedAt: '2026-08-01T12:00:00.000Z',
        },
        {
          eventName: 'project_created',
          occurrences: 20,
          lastObservedAt: '2026-08-22T12:00:00.000Z',
        },
        { eventName: 'project_created', occurrences: 1, lastObservedAt: evaluatedAt },
        { eventName: 'project_created', occurrences: 2, lastObservedAt: evaluatedAt },
      ],
    });

    expect(decisions[0]).toMatchObject({
      action: 'show',
      reason: 'insufficient-evidence',
      occurrences: 2,
    });
  });

  it('shows every step when context is absent or invalid', () => {
    expect(planAdaptiveSteps(steps).every((decision) => decision.action === 'show')).toBe(true);
    expect(
      planAdaptiveSteps(steps, {
        policy: { enabled: true, minimumOccurrences: 0, lookbackDays: 30 },
        evaluatedAt,
        evidence: [],
      }).every((decision) => decision.action === 'show'),
    ).toBe(true);
  });

  it('keeps a deterministic final step when every step is demonstrated', () => {
    const decisions = planAdaptiveSteps(
      [
        { id: 'create', teaches: 'project_created' },
        { id: 'invite', teaches: 'member_invited' },
      ],
      {
        policy: { enabled: true, minimumOccurrences: 1, lookbackDays: 30 },
        evaluatedAt,
        evidence: [
          { eventName: 'project_created', occurrences: 1, lastObservedAt: evaluatedAt },
          { eventName: 'member_invited', occurrences: 1, lastObservedAt: evaluatedAt },
        ],
      },
    );

    expect(decisions).toEqual([
      expect.objectContaining({ stepId: 'create', action: 'skip', reason: 'demonstrated' }),
      expect.objectContaining({ stepId: 'invite', action: 'show', reason: 'flow-guard' }),
    ]);
  });
});
