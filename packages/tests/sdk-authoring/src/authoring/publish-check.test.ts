import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import { apcaLightnessContrast, APCA_TARGETS } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { buildCheckReport } from '../../../../../packages/sdk-authoring/src/authoring/publish-check';
import type { QaStepInput } from '../../../../../packages/sdk-authoring/src/authoring/predictive-qa';
import type { AuthoringTargetHealthPresentation } from '../../../../../packages/sdk-authoring/src/authoring/target-health-ledger';

function baseDocument(): LodariqDocument {
  return structuredClone(tourFixture) as LodariqDocument;
}

function firstStep(document: LodariqDocument) {
  const step = document.blocks.find((block) => block.type === 'tourStep');
  if (!step) throw new Error('fixture has no step');
  return step;
}

function tooltipOf(document: LodariqDocument) {
  const tooltip = firstStep(document).children.find((child) => child.type === 'tooltip');
  if (!tooltip) throw new Error('fixture step has no tooltip');
  return tooltip;
}

const comfortableStep = (stepId: string): QaStepInput => ({
  stepId,
  card: { width: 320, height: 180 },
  target: { left: 400, top: 300, width: 120, height: 40 },
  placement: 'bottom',
});

const health = (
  document: LodariqDocument,
  presentation: AuthoringTargetHealthPresentation,
): ReadonlyMap<string, AuthoringTargetHealthPresentation> => {
  const tooltip = tooltipOf(document);
  const targetId = tooltip.props.targetId ?? firstStep(document).props.targetId;
  return new Map(targetId ? [[targetId, presentation]] : []);
};

describe('Operations → Check (§4.6)', () => {
  it('reports nothing when the document is in good shape', () => {
    const document = baseDocument();
    const report = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: health(document, 'verified'),
    });
    expect(report.rows).toEqual([]);
    expect(report.blockers).toEqual([]);
  });

  it('reports failing contrast with APCA as the secondary readout (§7.2)', () => {
    const document = baseDocument();
    const tooltip = tooltipOf(document);
    tooltip.props.tooltipStyle = {
      ...tooltip.props.tooltipStyle,
      surfaceColor: '#ffffff',
      textColor: '#bbbbbb',
    };
    const report = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: health(document, 'verified'),
    });
    const contrast = report.rows.find((row) => row.kind === 'contrast');
    // Below the unusable floor, so the message quotes that floor, not the AA target.
    expect(contrast?.message).toContain('1.92:1');
    expect(contrast?.severity).toBe('blocker');
    // WCAG is the gate; APCA rides along rather than replacing it.
    expect(contrast?.detail).toContain('APCA');
    expect(contrast?.detail).toContain(String(APCA_TARGETS.bodyText));
    expect(contrast?.jump).toEqual({ stepId: firstStep(document).id, section: 'style' });
  });

  it('carries jump-to-element on every step-scoped row', () => {
    const document = baseDocument();
    const stepId = firstStep(document).id;
    const report = buildCheckReport({
      document,
      steps: [{ ...comfortableStep(stepId), card: { width: 900, height: 120 } }],
      targetHealth: health(document, 'missing'),
    });
    expect(report.rows.length).toBeGreaterThan(0);
    for (const row of report.rows.filter((candidate) => candidate.kind !== 'translation')) {
      expect(row.jump?.stepId).toBe(stepId);
      expect(row.jump?.section).toBeTruthy();
    }
  });

  it('states a target problem in the creator’s three-state words', () => {
    const document = baseDocument();
    const report = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: health(document, 'unavailable_current_context'),
    });
    const target = report.rows.find((row) => row.kind === 'target');
    expect(target?.message).toContain('Needs context');
    // Needs context is not a blocker; a failed evidence gate is.
    expect(target?.severity).toBe('warning');

    const failing = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: health(document, 'missing'),
    });
    expect(failing.rows.find((row) => row.kind === 'target')?.severity).toBe('blocker');
    expect(failing.blockers.length).toBeGreaterThan(0);
  });

  it('groups untranslated copy and unverified-in-locale targets together (§7.6)', () => {
    const document = baseDocument();
    const tooltip = tooltipOf(document);
    const targetId = tooltip.props.targetId ?? firstStep(document).props.targetId;
    if (!targetId) throw new Error('fixture step has no target');
    const replacementTargetId = 'target_de_only';
    document.targets = [
      ...document.targets,
      {
        id: replacementTargetId,
        fingerprint: { tagName: 'button', accessibleName: 'Weiter', stableAttributes: {} },
      },
    ];
    document.localization = {
      defaultLocale: 'en',
      variants: [
        {
          locale: 'de',
          fallbackLocale: 'en',
          blocks: [],
          targetOverrides: [{ targetId, replacementTargetId }],
        },
      ],
    };

    const report = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: new Map([
        [targetId, 'verified'],
        [replacementTargetId, 'missing'],
      ]),
      locales: ['de'],
    });

    const translations = report.rows.filter((row) => row.kind === 'translation');
    // Both the missing copy and the locale-specific target problem, under one locale.
    expect(translations.some((row) => row.message.includes('missing'))).toBe(true);
    const localeTarget = translations.find((row) => row.message.includes('de target'));
    expect(localeTarget?.severity).toBe('blocker');
  });

  it('names a locale with no translations once, not once per string', () => {
    const document = baseDocument();
    const report = buildCheckReport({
      document,
      steps: [comfortableStep(firstStep(document).id)],
      targetHealth: health(document, 'verified'),
      locales: ['de', 'fr'],
    });
    const translations = report.rows.filter((row) => row.kind === 'translation');
    expect(translations).toHaveLength(2);
    expect(translations[0]?.message).toContain('de');
    expect(translations[0]?.jump).toBeUndefined();
  });
});

describe('APCA secondary readout (§7.2)', () => {
  it('reports high contrast for black on white and near-zero for a same-colour pair', () => {
    expect(Math.abs(apcaLightnessContrast('#000000', '#ffffff'))).toBeGreaterThan(100);
    expect(apcaLightnessContrast('#777777', '#777777')).toBe(0);
  });

  it('carries polarity in the sign, so light-on-dark is distinguishable', () => {
    const darkOnLight = apcaLightnessContrast('#111111', '#ffffff');
    const lightOnDark = apcaLightnessContrast('#ffffff', '#111111');
    expect(darkOnLight).toBeGreaterThan(0);
    expect(lightOnDark).toBeLessThan(0);
  });

  it('disagrees with WCAG where WCAG is known to be weak', () => {
    // A mid-grey pair that clears WCAG's 4.5 but sits under APCA's body-text Lc.
    const lc = Math.abs(apcaLightnessContrast('#767676', '#ffffff'));
    expect(lc).toBeLessThan(APCA_TARGETS.bodyText);
  });
});
