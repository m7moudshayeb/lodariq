import { describe, expect, it } from 'vitest';
import type { TargetInspectionState } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';
import {
  humanResolutionMethod,
  targetHealthDetails,
  targetHealthTitle,
  targetInspectFallbackMessage,
  targetInspectionStatus,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/utils';

describe('local frame target inspection helpers', () => {
  it('labels found, missing, and ambiguous states consistently', () => {
    expect(targetHealthTitle('found')).toBe('Healthy');
    expect(targetHealthTitle('missing')).toBe('Missing');
    expect(targetHealthTitle('ambiguous')).toBe('Ambiguous');
  });

  it('formats target inspection status and fallback copy for each state', () => {
    const found: TargetInspectionState = {
      action: 'view',
      diagnostic: {
        state: 'found',
        confidence: 100,
        candidateCount: 1,
        resolutionMethod: 'lodariq_id',
        message: 'Found by Lodariq ID',
      },
    };
    const missing: TargetInspectionState = {
      action: 'test',
      diagnostic: {
        state: 'missing',
        confidence: 10,
        candidateCount: 0,
      },
    };
    const ambiguous: TargetInspectionState = {
      action: 'health',
      diagnostic: {
        state: 'ambiguous',
        confidence: 72,
        candidateCount: 2,
        resolutionMethod: 'role_and_name',
      },
    };

    expect(targetHealthDetails(found)).toContain('Confidence 100%');
    expect(targetHealthDetails(found)).toContain('Candidates 1.');
    expect(targetHealthDetails(found)).toContain('Found by Lodariq ID');
    expect(targetInspectFallbackMessage(found)).toBe('Target found and highlighted');
    expect(targetInspectionStatus('view', found.diagnostic)).toBe('Found by Lodariq ID');

    expect(targetHealthDetails(missing)).toContain('Confidence 10%');
    expect(targetInspectFallbackMessage(missing)).toBe('Target not found on the current page');
    expect(targetInspectionStatus('test', missing.diagnostic)).toBe('Target is missing');

    expect(targetHealthDetails(ambiguous)).toContain('Confidence 72%');
    expect(targetHealthDetails(ambiguous)).toContain('Found by role and label');
    expect(targetInspectFallbackMessage(ambiguous)).toBe('Multiple matching elements found');
    expect(targetInspectionStatus('health', ambiguous.diagnostic)).toBe('Target is ambiguous');
  });

  it('maps resolution method labels to user-facing copy', () => {
    expect(humanResolutionMethod('stable_attribute')).toBe('Found by stable attribute');
    expect(humanResolutionMethod('scoped_css')).toBe('Found by scoped CSS');
    expect(humanResolutionMethod('unknown')).toBe('Found by semantic match');
  });
});
