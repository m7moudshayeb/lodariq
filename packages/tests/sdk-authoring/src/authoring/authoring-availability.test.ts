import { describe, expect, it } from 'vitest';
import {
  AUTHORING_DISABLED_REASONS,
  DisabledAuthoringActivationDescriptor,
  validate,
} from '@lodariq/schema';
import { authoringUnavailableExplanation } from '../../../../../packages/sdk-authoring/src/authoring/authoring-availability';

describe('a dead end that explains itself (§14)', () => {
  it('explains every reason the control plane can send, and always states a path', () => {
    for (const reason of AUTHORING_DISABLED_REASONS) {
      const explanation = authoringUnavailableExplanation(reason);
      expect(explanation.reason).toBe(reason);
      for (const line of [explanation.headline, explanation.because, explanation.path]) {
        expect(line.length).toBeGreaterThan(10);
      }
    }
  });

  it('names the real production risk rather than a generic safety posture (§14.3)', () => {
    const explanation = authoringUnavailableExplanation('production_environment');
    expect(explanation.because).toContain('real customer data');
    expect(explanation.path).toContain('staging');
  });

  it('falls back to the environment rule when an older control plane sends no reason', () => {
    expect(authoringUnavailableExplanation(undefined).reason).toBe('production_environment');
  });

  it('keeps the wire contract an enum, so no server text crosses the boundary', () => {
    expect(validate(DisabledAuthoringActivationDescriptor, { state: 'disabled' }).valid).toBe(true);
    expect(
      validate(DisabledAuthoringActivationDescriptor, {
        state: 'disabled',
        reason: 'production_environment',
      }).valid,
    ).toBe(true);
    // A message would be untranslatable and unbounded; the schema refuses one.
    expect(
      validate(DisabledAuthoringActivationDescriptor, {
        state: 'disabled',
        reason: 'Authoring runs on staging',
      }).valid,
    ).toBe(false);
    expect(
      validate(DisabledAuthoringActivationDescriptor, { state: 'disabled', message: 'nope' }).valid,
    ).toBe(false);
  });
});
