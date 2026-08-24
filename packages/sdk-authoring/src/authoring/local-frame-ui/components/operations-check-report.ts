import {
  materializeLocalizedDocument,
  type LocaleLayoutQaIssueCode,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';
import type { AccessibilityFindingCode } from '@lodariq/schema/accessibility-governance';
import { authoringText } from '../../../i18n';
import { buildCheckReport, type CheckReport, type CheckRow } from '../../publish-check';
import type { QaStepInput } from '../../predictive-qa';
import type { AuthoringTargetHealthPresentation } from '../../target-health-ledger';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { stepTooltip } from '../tour-step-model';

/** The locales this document claims, which is what a check is measured against. */
export function documentLocales(snapshot: LocalAuthoringFrameSnapshot): readonly string[] {
  const document = snapshot.canonicalDocumentState ?? snapshot.documentState;
  return document.localization?.variants.map((variant) => variant.locale) ?? [];
}

/**
 * The complete predictive report stays with the deferred Check and Language
 * sections. Operations navigation uses only already-collected diagnostics so
 * opening the hub does not pull this simulation graph into first paint.
 */
export function buildOperationsCheckReport(
  snapshot: LocalAuthoringFrameSnapshot,
  _steps: readonly LodariqBlock[],
): CheckReport {
  const document = snapshot.canonicalDocumentState ?? snapshot.documentState;
  const canonicalSteps = document.blocks.filter((block) => block.type === 'tourStep');
  const predictive = buildCheckReport({
    document,
    steps: canonicalSteps.map((step) =>
      simulationInputFor(step, localizedTextForStep(document, step.id)),
    ),
    targetHealth: targetHealthMap(snapshot),
    locales: documentLocales(snapshot),
  });
  const rows = [
    ...predictive.rows,
    ...renderedLocaleLayoutRows(snapshot),
    ...workspaceAccessibilityRows(snapshot, document.id),
  ];
  return { rows, blockers: rows.filter((row) => row.severity === 'blocker') };
}

const LIVE_LAYOUT_ISSUE_MESSAGES: Readonly<Record<LocaleLayoutQaIssueCode, string>> = {
  horizontal_overflow: authoringText('content runs past the card horizontally'),
  vertical_overflow: authoringText('content runs past the card vertically'),
  viewport_clipping: authoringText('the card is clipped by the current viewport'),
  action_clipping: authoringText('an action is clipped inside the card'),
  presentation_unavailable: authoringText('the presentation could not be rendered on this page'),
};

const ACCESSIBILITY_FINDING_MESSAGES: Readonly<Record<AccessibilityFindingCode, string>> = {
  artifact_unavailable: authoringText('Current compiled artifact is unavailable'),
  contrast_unusable: authoringText('Text or control contrast is unusable'),
  contrast_below_target: authoringText('Text or control contrast is below target'),
  missing_accessible_name: authoringText('Accessible name is missing'),
  missing_captions: authoringText('Video captions are missing'),
  compact_viewport_risk: authoringText('Content may not fit at a compact viewport'),
  long_copy_risk: authoringText('Long copy may be difficult to read or zoom'),
};

function renderedLocaleLayoutRows(snapshot: LocalAuthoringFrameSnapshot): readonly CheckRow[] {
  const report = snapshot.localeLayoutQa?.report;
  if (!report) return [];
  const rows = report.findings.map((finding): CheckRow => {
    const messages = finding.issues.map((issue) => LIVE_LAYOUT_ISSUE_MESSAGES[issue]).join('; ');
    return {
      kind: 'layout',
      severity: finding.status === 'failed' ? 'blocker' : 'warning',
      locale: finding.locale,
      message: authoringText('In {locale}, {issues}.', {
        locale: finding.locale,
        issues: messages,
      }),
      jump: {
        stepId: finding.stepId,
        section: finding.status === 'failed' ? 'style' : 'target',
      },
    };
  });
  if (report.findingLimitReached) {
    rows.push({
      kind: 'layout',
      severity: 'warning',
      message: authoringText('More live layout findings exist than this bounded report can show.'),
    });
  }
  return rows;
}

function workspaceAccessibilityRows(
  snapshot: LocalAuthoringFrameSnapshot,
  documentId: string,
): readonly CheckRow[] {
  const findings = snapshot.accessibilitySweep?.result?.findings ?? [];
  return findings
    .filter((finding) => finding.documentId === documentId && finding.status === 'open')
    .map((finding) => ({
      kind: 'readiness' as const,
      severity: finding.severity,
      message: ACCESSIBILITY_FINDING_MESSAGES[finding.code],
      detail: authoringText('Accessibility sweep · {locale} · version {version}', {
        locale: finding.locale,
        version: finding.documentVersionId,
      }),
      ...(finding.stepId ? { jump: { stepId: finding.stepId, section: 'style' as const } } : {}),
    }));
}

function simulationInputFor(
  step: LodariqBlock,
  localizedText?: readonly { locale: string; characters: number }[],
): QaStepInput {
  const tooltip = stepTooltip(step);
  const layout = tooltip?.props.tooltipLayout;
  const placement = tooltip?.props.placement ?? 'bottom';
  return {
    stepId: step.id,
    card: {
      width: layout?.widthPx ?? 320,
      height: layout?.heightPx ?? 200,
    },
    /**
     * Captured target geometry does not cross the bridge (ADR-0016 keeps
     * coordinates diagnostic-only), so the simulation runs against a neutral box
     * of the size a control usually is. That still catches the card-shape
     * failures — overflow, occlusion, flips — which are what §7.3 is for.
     */
    target: { left: 0, top: 0, width: 120, height: 40 },
    placement:
      placement === 'top' || placement === 'left' || placement === 'right' ? placement : 'bottom',
    scrollsIntoView: true,
    ...(localizedText?.length ? { localizedText } : {}),
    tapTargets: (tooltip?.children ?? [])
      .filter((child) => child.type === 'button')
      .map((child) => ({
        label: child.content ?? authoringText('Button'),
        // Authored buttons render at the recipes' sizes; the recipe floor is 44px.
        width: 120,
        height: 44,
      })),
  };
}

function localizedTextForStep(
  document: LodariqDocument,
  stepId: string,
): readonly { locale: string; characters: number }[] {
  const defaultLocale = document.localization?.defaultLocale ?? 'en';
  const locales = [
    defaultLocale,
    ...(document.localization?.variants.map((variant) => variant.locale) ?? []),
  ];
  return locales.flatMap((locale) => {
    const localized = materializeLocalizedDocument(document, locale);
    const step = localized.blocks.find((block) => block.id === stepId);
    if (!step) return [];
    return [{ locale, characters: textCharacterCount(step) }];
  });
}

function textCharacterCount(block: LodariqBlock): number {
  return (
    (block.content?.length ?? 0) +
    block.children.reduce((sum, child) => sum + textCharacterCount(child), 0)
  );
}

function targetHealthMap(
  snapshot: LocalAuthoringFrameSnapshot,
): ReadonlyMap<string, AuthoringTargetHealthPresentation> {
  const entries = new Map<string, AuthoringTargetHealthPresentation>();
  for (const [targetId, health] of snapshot.targetHealth) {
    entries.set(targetId, health.presentation);
  }
  return entries;
}
