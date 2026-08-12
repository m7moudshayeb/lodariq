// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ElementFingerprint } from '@lodariq/schema';
import { runTargetHealthCheck, toTargetHealthNotification } from '@lodariq/sdk-runtime/resolver';

const missingFingerprint: ElementFingerprint = {
  tagName: 'button',
  role: 'button',
  stableAttributes: { 'data-testid': 'not-on-this-page' },
};

describe('target health checks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns a serializable node-free report', () => {
    const report = runTargetHealthCheck(
      [{ id: 'target_missing', fingerprint: missingFingerprint }],
      document,
      {},
      () => new Date('2026-08-08T12:00:00.000Z'),
    );

    expect(report).toEqual(
      expect.objectContaining({
        checkedAt: '2026-08-08T12:00:00.000Z',
        total: 1,
        found: 0,
        missing: 1,
        likelyRedesign: false,
      }),
    );
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report.entries[0]).not.toHaveProperty('element');
    expect(report.entries[0]).not.toHaveProperty('anchor');
  });

  it('flags a likely redesign only for a meaningful failure cluster', () => {
    const targets = ['one', 'two', 'three'].map((suffix) => ({
      id: `target_${suffix}`,
      fingerprint: missingFingerprint,
    }));

    const isolated = runTargetHealthCheck(targets.slice(0, 2));
    const redesign = runTargetHealthCheck(targets);
    expect(isolated.likelyRedesign).toBe(false);
    expect(redesign.likelyRedesign).toBe(true);
    expect(toTargetHealthNotification(isolated)).toEqual(
      expect.objectContaining({ severity: 'low', targetIds: ['target_one', 'target_two'] }),
    );
    expect(toTargetHealthNotification(redesign)).toEqual(
      expect.objectContaining({
        severity: 'high',
        targetIds: ['target_one', 'target_two', 'target_three'],
      }),
    );
  });
});
