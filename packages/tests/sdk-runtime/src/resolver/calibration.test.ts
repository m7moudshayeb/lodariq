// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createTargetCorrectionRecord,
  summarizeEvidenceTrust,
  type ResolutionResult,
} from '@lodariq/sdk-runtime/resolver';

function resolution(evidenceFamilies: ResolutionResult['evidenceFamilies']): ResolutionResult {
  const element = document.createElement('div');
  return {
    state: 'found',
    element,
    anchor: {
      kind: 'visual-region',
      element,
      interactionSafe: false,
      getBoundingClientRect: () => element.getBoundingClientRect(),
    },
    confidence: 81,
    candidateCount: 2,
    resolutionMethod: 'visual_structure',
    reasonCode: 'resolved',
    evidenceFamilies,
    runnerUpConfidence: 42,
    currentLocale: 'en',
  };
}

describe('target resolver calibration records', () => {
  it('copies only bounded diagnostics and never retains DOM references', () => {
    const record = createTargetCorrectionRecord({
      targetId: 'target_summary',
      resolutionMode: 'visual-anchor',
      outcome: 'accepted',
      resolution: resolution(['visual-structure', 'visual-appearance']),
      viewportClass: 'desktop',
      now: () => new Date('2026-08-08T12:00:00.000Z'),
    });

    expect(record.correctedAt).toBe('2026-08-08T12:00:00.000Z');
    expect(record).not.toHaveProperty('element');
    expect(record).not.toHaveProperty('anchor');
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });

  it('summarizes evidence trust descriptively without changing live weights', () => {
    const accepted = createTargetCorrectionRecord({
      targetId: 'target_one',
      resolutionMode: 'visual-anchor',
      outcome: 'accepted',
      resolution: resolution(['visual-structure', 'visual-appearance']),
    });
    const relinked = createTargetCorrectionRecord({
      targetId: 'target_two',
      resolutionMode: 'visual-anchor',
      outcome: 'relinked',
      resolution: resolution(['visual-structure']),
    });

    expect(summarizeEvidenceTrust([accepted, relinked])).toEqual({
      'visual-structure': { accepted: 1, observed: 2, rate: 0.5 },
      'visual-appearance': { accepted: 1, observed: 1, rate: 1 },
    });
  });
});
