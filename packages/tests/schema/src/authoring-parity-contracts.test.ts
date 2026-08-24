import { describe, expect, it } from 'vitest';
import {
  LodariqBlockProps,
  Target,
  validate,
  sanitizeBlockProps,
  sanitizeJourneyHandoff,
  sanitizeStepEmphasis,
  sanitizeTargetApproach,
  sanitizeTargetSelectionPolicy,
  sanitizeExperiment,
  sanitizeSuccessEvent,
  type LodariqBlockProps as LodariqBlockPropsType,
} from '@lodariq/schema';

describe('target selection policy', () => {
  it('accepts every plain-language answer to the disambiguation question', () => {
    for (const policy of [
      { kind: 'only' },
      { kind: 'any-matching' },
      { kind: 'first' },
      { kind: 'last' },
      { kind: 'ordinal', position: 2, order: 'reading-order' },
      { kind: 'newest-in-collection', collectionLabel: 'Projects table' },
      { kind: 'first-in-collection' },
      { kind: 'within-container', containerLabel: 'Projects' },
    ]) {
      expect(sanitizeTargetSelectionPolicy(policy)).toEqual(policy);
    }
  });

  it('rejects an out-of-range ordinal and an unknown kind', () => {
    expect(sanitizeTargetSelectionPolicy({ kind: 'ordinal', position: 0 })).toBeUndefined();
    expect(sanitizeTargetSelectionPolicy({ kind: 'ordinal', position: 51 })).toBeUndefined();
    expect(sanitizeTargetSelectionPolicy({ kind: 'nearest-to-cursor' })).toBeUndefined();
  });

  it('refuses a container policy without the container it ranks within', () => {
    expect(sanitizeTargetSelectionPolicy({ kind: 'within-container' })).toBeUndefined();
  });
});

describe('target approach', () => {
  it('keeps a recorded route of semantic legs', () => {
    const approach = {
      legs: [
        {
          act: { kind: 'activateTarget', targetId: 'btn-import' },
          wait: { type: 'targetAvailable', targetId: 'menu-import-csv' },
          label: 'Click Import on the Projects page',
        },
        { act: { kind: 'observe' }, label: 'Then find CSV file' },
      ],
      lastOutcome: 'pass',
    };
    expect(sanitizeTargetApproach(approach)).toEqual(approach);
  });

  it('rejects a timer masquerading as a wait condition', () => {
    expect(
      sanitizeTargetApproach({
        legs: [{ act: { kind: 'observe' }, wait: { type: 'delay', ms: 400 }, label: 'wait' }],
      }),
    ).toBeUndefined();
  });

  it('rejects an empty or oversized recipe', () => {
    expect(sanitizeTargetApproach({ legs: [] })).toBeUndefined();
    expect(
      sanitizeTargetApproach({
        legs: Array.from({ length: 9 }, () => ({ act: { kind: 'observe' }, label: 'x' })),
      }),
    ).toBeUndefined();
  });
});

describe('step emphasis', () => {
  it('accepts a backdrop, outline and viewport focus expressed in token roles', () => {
    const emphasis = {
      backdrop: { dimPercent: 55, clickBehavior: 'advance', tintRole: 'ink' },
      targetOutline: { colorRole: 'accent', weightPx: 2, line: 'solid', followTargetRadius: true },
      viewportFocus: { behavior: 'scroll-into-view' },
    };
    expect(sanitizeStepEmphasis(emphasis)).toEqual(emphasis);
  });

  it('refuses a raw colour anywhere in the outline', () => {
    expect(
      sanitizeStepEmphasis({ targetOutline: { colorRole: '#6d3bf5' } }),
    ).toBeUndefined();
  });

  it('bounds the dim so a backdrop can never fully hide the product', () => {
    expect(sanitizeStepEmphasis({ backdrop: { dimPercent: 100, clickBehavior: 'none' } })).toBeUndefined();
  });

  it('bounds zoom to a range a host layout can survive', () => {
    expect(
      sanitizeStepEmphasis({ viewportFocus: { behavior: 'zoom', scalePercent: 400 } }),
    ).toBeUndefined();
  });
});

describe('measurement contracts', () => {
  it('accepts a declared success event with a supported window', () => {
    expect(sanitizeSuccessEvent({ eventName: 'project_created', windowDays: 7 })).toEqual({
      eventName: 'project_created',
      windowDays: 7,
    });
    expect(sanitizeSuccessEvent({ eventName: 'project_created', windowDays: 9 })).toBeUndefined();
    expect(sanitizeSuccessEvent({ eventName: 'Project Created', windowDays: 7 })).toBeUndefined();
  });

  it('requires at least two arms and a success event to judge them by', () => {
    const arms = [
      { id: 'A', label: 'Control', trafficPercent: 50 },
      { id: 'B', label: 'Variant', trafficPercent: 50 },
    ];
    expect(
      sanitizeExperiment({
        id: 'exp_1',
        status: 'running',
        varies: 'copy',
        successEventName: 'project_created',
        allocationRevision: 1,
        arms,
      }),
    ).toBeTruthy();
    expect(
      sanitizeExperiment({
        id: 'exp_1',
        status: 'running',
        varies: 'copy',
        successEventName: 'project_created',
        allocationRevision: 1,
        arms: [arms[0]],
      }),
    ).toBeUndefined();
  });
});

describe('journey handoff', () => {
  it('carries progress into a named second application', () => {
    const handoff = { applicationId: 'app_marketing', resumeMode: 'next-step' };
    expect(sanitizeJourneyHandoff(handoff)).toEqual(handoff);
  });

  it('rejects an unknown resume mode', () => {
    expect(
      sanitizeJourneyHandoff({ applicationId: 'app_marketing', resumeMode: 'teleport' }),
    ).toBeUndefined();
  });
});

describe('the registry resolves the new references', () => {
  it('validates a Target carrying a selection policy and an approach', () => {
    const target = {
      id: 'tgt_csv',
      fingerprint: { stableAttributes: { id: 'menu-import-csv' }, tagName: 'button' },
      selection: { kind: 'newest-in-collection', collectionLabel: 'Projects table' },
      approach: {
        legs: [
          {
            act: { kind: 'activateTarget', targetId: 'btn-import' },
            wait: { type: 'targetAvailable', targetId: 'menu-import-csv' },
            label: 'Click Import',
          },
        ],
      },
    };
    const result = validate(Target, target);
    expect(result.valid, JSON.stringify('errors' in result ? result.errors : [])).toBe(true);
  });

  it('validates block props carrying emphasis and a handoff', () => {
    const result = validate(LodariqBlockProps, {
      emphasis: { backdrop: { dimPercent: 40, clickBehavior: 'dismiss' } },
      teaches: 'report_viewed',
      handoff: { applicationId: 'app_marketing', resumeMode: 'next-step' },
    });
    expect(result.valid, JSON.stringify('errors' in result ? result.errors : [])).toBe(true);
  });
});

describe('block props carry the new step-level intent', () => {
  it('keeps emphasis, teaches and handoff through sanitization', () => {
    const props: Record<string, unknown> = {
      emphasis: { backdrop: { dimPercent: 50, clickBehavior: 'none' } },
      teaches: 'report_viewed',
      handoff: { applicationId: 'app_marketing', resumeMode: 'same-step' },
    };
    const sanitized: LodariqBlockPropsType = sanitizeBlockProps(props);
    expect(sanitized.teaches).toBe('report_viewed');
    expect(sanitized.emphasis?.backdrop?.dimPercent).toBe(50);
    expect(sanitized.handoff?.applicationId).toBe('app_marketing');
  });

  it('drops a teaches value that is not an event name', () => {
    expect(sanitizeBlockProps({ teaches: 'Report Viewed' }).teaches).toBeUndefined();
    expect(sanitizeBlockProps({ teaches: 'report-viewed' }).teaches).toBeUndefined();
  });
});
