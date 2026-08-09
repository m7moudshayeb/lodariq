import { describe, expect, it } from 'vitest';
import type { TargetInspectionState } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/types';
import {
  humanResolutionMethod,
  targetHealthDetails,
  targetHealthTitle,
  targetInspectFallbackMessage,
  targetInspectionStatus,
  targetSupportDetails,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/utils';

describe('local frame target inspection helpers', () => {
  it('labels factual verification states consistently', () => {
    expect(targetHealthTitle('found')).toBe('Verified');
    expect(targetHealthTitle('missing')).toBe('Missing');
    expect(targetHealthTitle('ambiguous')).toBe('Ambiguous');
    expect(targetHealthTitle('needs_review')).toBe('Needs verification');
    expect(
      targetHealthTitle({
        state: 'needs_review',
        confidence: 52,
        candidateCount: 1,
        reasonCode: 'evidence_drift',
      }),
    ).toBe('Drift detected');
  });

  it('formats target inspection status and fallback copy for each state', () => {
    const found: TargetInspectionState = {
      action: 'view',
      diagnostic: {
        state: 'found',
        confidence: 100,
        candidateCount: 1,
        resolutionMethod: 'lodariq_id',
        evidenceFamilies: ['configured-attribute', 'element-semantics'],
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

    expect(targetHealthDetails(found)).toBe('Placement is highlighted.');
    expect(targetSupportDetails(found)).toContain('1 candidate observed.');
    expect(targetSupportDetails(found)).toContain('existing attributes, control type');
    expect(targetSupportDetails(found)).toContain('Uses Lodariq marker');
    expect(targetSupportDetails(found)).not.toContain('Found by Lodariq ID');
    expect(targetInspectFallbackMessage(found)).toBe('Placement is highlighted.');
    expect(targetInspectionStatus('view', found.diagnostic)).toBe('Placement highlighted.');

    expect(targetHealthDetails(missing)).toContain('We could not find this placement');
    expect(targetSupportDetails(missing)).toContain('0 candidates observed.');
    expect(targetInspectFallbackMessage(missing)).toContain('We could not find this placement');
    expect(targetInspectionStatus('test', missing.diagnostic)).toBe('Placement needs attention.');

    expect(targetHealthDetails(ambiguous)).toContain('More than one place matches');
    expect(targetSupportDetails(ambiguous)).toContain('2 candidates observed.');
    expect(targetSupportDetails(ambiguous)).toContain('Uses page label');
    expect(targetInspectFallbackMessage(ambiguous)).toContain('More than one place matches');
    expect(targetInspectionStatus('health', ambiguous.diagnostic)).toBe(
      'Pick a more specific placement.',
    );
  });

  it('maps resolution method labels to user-facing copy', () => {
    expect(humanResolutionMethod('stable_attribute')).toBe('Uses stable page marker');
    expect(humanResolutionMethod('scoped_css')).toBe('Uses support rule');
    expect(humanResolutionMethod('unknown')).toBe('Uses page context');
  });
});
