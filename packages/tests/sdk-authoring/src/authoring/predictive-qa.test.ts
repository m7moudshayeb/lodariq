import { describe, expect, it } from 'vitest';
import {
  QA_MIN_TAP_TARGET_PX,
  QA_VIEWPORTS,
  qaBlockers,
  simulateDocument,
  simulateStep,
  type QaStepInput,
} from '../../../../../packages/sdk-authoring/src/authoring/predictive-qa';

const step = (over: Partial<QaStepInput> = {}): QaStepInput => ({
  stepId: 'step_1',
  card: { width: 320, height: 180 },
  target: { left: 500, top: 300, width: 120, height: 40 },
  placement: 'bottom',
  ...over,
});

const kinds = (input: QaStepInput, options?: Parameters<typeof simulateStep>[1]): string[] => [
  ...new Set(simulateStep(input, options).map((finding) => finding.kind)),
];

describe('predictive layout QA (§7.3)', () => {
  it('finds nothing wrong with a comfortable step', () => {
    expect(simulateStep(step())).toEqual([]);
  });

  it('simulates every viewport in the spec', () => {
    expect(QA_VIEWPORTS).toEqual([375, 768, 1280, 1920]);
    // A card wider than the narrow viewport can only fail there.
    const findings = simulateStep(step({ card: { width: 700, height: 120 } }));
    const widths = new Set(findings.map((finding) => finding.viewportWidth));
    expect(widths.has(375)).toBe(true);
    expect(widths.has(1920)).toBe(false);
  });

  it('catches a card that runs off a narrow screen', () => {
    const findings = simulateStep(step({ card: { width: 700, height: 120 } }));
    const narrow = findings.filter((finding) => finding.viewportWidth === 375);
    expect(narrow.map((finding) => finding.kind)).toContain('card-overflows-viewport');
    expect(narrow[0]?.message).toContain('375');
    // Jump-to-element is what turns a report into a workflow.
    expect(narrow[0]?.fixSection).toBe('placement');
    expect(narrow[0]?.stepId).toBe('step_1');
  });

  it('catches a card that covers its own target when nothing else fits', () => {
    // A target filling the screen: every side is blocked, so the fallback lands on it.
    const findings = simulateStep(
      step({
        placement: 'right',
        card: { width: 320, height: 180 },
        target: { left: 0, top: 0, width: 375, height: 700 },
      }),
    );
    const narrow = findings.filter((finding) => finding.viewportWidth === 375);
    expect(narrow.map((finding) => finding.kind)).toContain('card-occludes-target');
    expect(narrow.find((finding) => finding.kind === 'card-occludes-target')?.severity).toBe(
      'blocker',
    );
  });

  it('reports a placement that flips to a side the creator did not choose', () => {
    // No room above, so a `top` preference becomes `bottom`.
    const findings = simulateStep(step({ placement: 'top', target: { left: 500, top: 4, width: 120, height: 40 } }));
    const flipped = findings.find((finding) => finding.kind === 'placement-flipped');
    expect(flipped?.severity).toBe('warning');
    expect(flipped?.message).toContain('bottom');
  });

  it('mirrors left and right in RTL', () => {
    const target = { left: 10, top: 300, width: 60, height: 40 };
    const flippedAt = (input: QaStepInput): readonly (number | undefined)[] =>
      simulateStep(input)
        .filter((finding) => finding.kind === 'placement-flipped')
        .map((finding) => finding.viewportWidth);

    // A left-side target has no room on its left, so LTR flips to the right.
    expect(flippedAt(step({ placement: 'left', target }))).toContain(1280);
    // RTL reads `left` as the mirrored side, which is where the room is.
    expect(flippedAt(step({ placement: 'left', rtl: true, target }))).not.toContain(1280);
  });

  it('predicts overflow at the longest locale string', () => {
    const findings = simulateStep(
      step({ card: { width: 280, height: 120 }, longestText: { locale: 'de', characters: 600 } }),
    );
    const overflow = findings.find((finding) => finding.kind === 'text-overflows-longest-locale');
    expect(overflow?.locale).toBe('de');
    expect(overflow?.message).toContain('de');
    expect(overflow?.fixSection).toBe('style');
  });

  it('flags a target below the fold only when nothing scrolls to it', () => {
    const below = step({ target: { left: 400, top: 2_000, width: 100, height: 40 } });
    expect(kinds(below)).toContain('target-below-fold');
    expect(kinds({ ...below, scrollsIntoView: true })).not.toContain('target-below-fold');
  });

  it('flags tap targets under the 44px minimum, naming which one', () => {
    const findings = simulateStep(
      step({
        tapTargets: [
          { label: 'Got it', width: 120, height: 44 },
          { label: 'Skip', width: 40, height: 20 },
        ],
      }),
    );
    const small = findings.filter((finding) => finding.kind === 'tap-target-too-small');
    expect(small).toHaveLength(1);
    expect(small[0]?.message).toContain('Skip');
    expect(small[0]?.message).toContain(String(QA_MIN_TAP_TARGET_PX));
  });

  it('runs over a whole document', () => {
    const findings = simulateDocument([
      step({ stepId: 'a' }),
      step({ stepId: 'b', card: { width: 900, height: 120 } }),
    ]);
    expect(new Set(findings.map((finding) => finding.stepId))).toEqual(new Set(['b']));
  });

  it('ships warning-only for its first release (§13)', () => {
    const findings = simulateStep(step({ card: { width: 900, height: 120 } }));
    expect(findings.some((finding) => finding.severity === 'blocker')).toBe(true);
    // Nothing blocks publish until the accept rate has been measured.
    expect(qaBlockers(findings)).toEqual([]);
  });
});
