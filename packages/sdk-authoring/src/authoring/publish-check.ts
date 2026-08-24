/**
 * Operations → Check (§4.6, §7.2, §7.3).
 *
 * One pre-publish report, assembled from things that are each already known:
 * contrast on the token pairs actually in use, predictive layout simulation,
 * targets by verification state, missing alt text, and untranslated strings.
 *
 * Every row carries a `jump` — the step to select and the inspector section to
 * open. That is the Webflow Audit affordance, and it is the difference between a
 * report that gets acted on and a list that gets ignored.
 */
import {
  apcaLightnessContrast,
  APCA_TARGETS,
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  publishReadinessIssueLabel,
  validateTourPublishReadiness,
  type LodariqBlock,
  type LodariqDocument,
  type PublishReadinessIssue,
} from '@lodariq/schema';
import { authoringText } from '../i18n';
import { simulateDocument, type QaFinding, type QaStepInput } from './predictive-qa';
import { targetVerificationPresentation } from './target-verification';
import type { AuthoringTargetHealthPresentation } from './target-health-ledger';
import { selectExperienceRootBlocks } from './experience-authoring-capabilities';

export type CheckRowKind =
  'contrast' | 'layout' | 'target' | 'alt-text' | 'translation' | 'readiness';

export type CheckSeverity = 'blocker' | 'warning' | 'info';

export interface CheckJump {
  readonly stepId: string;
  readonly section: 'style' | 'placement' | 'target' | 'actions';
}

export interface CheckRow {
  readonly kind: CheckRowKind;
  readonly severity: CheckSeverity;
  readonly message: string;
  /** Absent only for rows that belong to the document rather than a step. */
  readonly jump?: CheckJump;
  /** Exact schema finding when the controller can open the failing setting. */
  readonly repairIssue?: PublishReadinessIssue;
  /** Secondary readout, shown beside the primary result rather than instead of it. */
  readonly detail?: string;
  readonly locale?: string;
}

export interface CheckReport {
  readonly rows: readonly CheckRow[];
  /** Rows that would stop a publish. Empty while a rule is still warning-only. */
  readonly blockers: readonly CheckRow[];
}

export interface CheckInput {
  readonly document: LodariqDocument;
  /** Simulation inputs per step, from captured geometry. */
  readonly steps: readonly QaStepInput[];
  /** Verification state per target id. */
  readonly targetHealth: ReadonlyMap<string, AuthoringTargetHealthPresentation>;
  /** Locales the document claims to support, so gaps can be named. */
  readonly locales?: readonly string[];
}

export function buildCheckReport(input: CheckInput): CheckReport {
  const readinessIssues = validateTourPublishReadiness(input.document);
  const rows = [
    ...readinessRows(input.document, readinessIssues),
    ...contrastRows(input.document),
    ...layoutRows(simulateDocument(input.steps)),
    ...targetRows(input, readinessIssues),
    ...altTextRows(input.document),
    ...translationRows(input),
    ...localeShapeRows(input.document),
  ];
  return { rows, blockers: rows.filter((row) => row.severity === 'blocker') };
}

/**
 * Everything `targetRows` already reports, in the schema's vocabulary rather
 * than the creator's. Dropped here so one missing target is one row, not two.
 */
const TARGET_CODES_ALREADY_REPORTED = new Set([
  'missing_step_target',
  'broken_target_reference',
  'target_unverified',
  'target_needs_review',
  'target_unresolved',
  'target_ambiguous',
]);

/**
 * The schema's own publish gate, in the one report that claims to be it.
 *
 * Check's opening line is "everything that must be true before this can
 * publish", and until now it was everything *except* the rules that literally
 * decide that. Those lived only on Release, which meant a creator could clear
 * Check and still be refused — and the two surfaces could disagree about a step
 * without either being wrong.
 */
function readinessRows(
  document: LodariqDocument,
  issues: readonly PublishReadinessIssue[],
): readonly CheckRow[] {
  const stepIds = new Set(tourSteps(document).map((step) => step.id));
  return issues
    .filter((issue) => !TARGET_CODES_ALREADY_REPORTED.has(issue.code))
    .map((issue) => ({
      kind: 'readiness' as const,
      severity: issue.severity === 'warning' ? ('warning' as const) : ('blocker' as const),
      message: publishReadinessIssueLabel(issue.code),
      repairIssue: issue,
      ...(issue.blockId && stepIds.has(issue.blockId)
        ? { jump: { stepId: issue.blockId, section: 'style' as const } }
        : {}),
    }));
}

/**
 * Contrast at edit time on the pairs actually in use — not a theoretical audit of
 * the palette. WCAG 2.x AA is the gate; APCA rides along as the detail line.
 */
function contrastRows(document: LodariqDocument): readonly CheckRow[] {
  const rows: CheckRow[] = [];
  for (const step of tourSteps(document)) {
    const tooltip =
      step.type === 'tooltip' ? step : step.children.find((child) => child.type === 'tooltip');
    const style = tooltip?.props.tooltipStyle;
    if (!style?.textColor || !style.surfaceColor) continue;
    const wcag = evaluateContrast(
      style.textColor,
      style.surfaceColor,
      CONTRAST_RATIO_TARGETS.text,
      CONTRAST_RATIO_TARGETS.textUnusable,
    );
    if (wcag.state === 'pass') continue;
    const apca = Math.abs(apcaLightnessContrast(style.textColor, style.surfaceColor));
    rows.push({
      kind: 'contrast',
      severity: wcag.state === 'blocker' ? 'blocker' : 'warning',
      message: authoringText(
        'Body text on this card is {ratio}:1, below the {required}:1 minimum.',
        {
          ratio: wcag.ratio,
          required: wcag.requiredRatio,
        },
      ),
      detail: authoringText('APCA Lc {value}, where body text wants {target}.', {
        value: Math.round(apca),
        target: APCA_TARGETS.bodyText,
      }),
      jump: { stepId: step.id, section: 'style' },
    });
  }
  return rows;
}

const LAYOUT_SECTION_SEVERITY: Readonly<Record<QaFinding['severity'], CheckSeverity>> = {
  blocker: 'blocker',
  warning: 'warning',
};

function layoutRows(findings: readonly QaFinding[]): readonly CheckRow[] {
  return findings.map((finding) => ({
    kind: 'layout' as const,
    severity: LAYOUT_SECTION_SEVERITY[finding.severity],
    message: finding.message,
    ...(finding.locale ? { locale: finding.locale } : {}),
    jump: { stepId: finding.stepId, section: finding.fixSection },
  }));
}

/** Targets grouped by the creator's three states, so the report matches the canvas. */
function targetRows(
  input: CheckInput,
  issues: readonly PublishReadinessIssue[],
): readonly CheckRow[] {
  const rows: CheckRow[] = [];
  for (const step of tourSteps(input.document)) {
    const tooltip =
      step.type === 'tooltip' ? step : step.children.find((child) => child.type === 'tooltip');
    const targetId = tooltip?.props.targetId ?? step.props.targetId;
    if (!targetId) {
      const repairIssue = issues.find(
        (issue) => issue.code === 'missing_step_target' && issue.blockId === step.id,
      );
      rows.push({
        kind: 'target',
        severity: 'blocker',
        message: authoringText('This step does not point at anything yet.'),
        jump: { stepId: step.id, section: 'target' },
        ...(repairIssue ? { repairIssue } : {}),
      });
      continue;
    }
    const presentation = input.targetHealth.get(targetId);
    // `unverified` is no observation yet, not a finding — same as no entry at all.
    if (!presentation || presentation === 'unverified') continue;
    const shown = targetVerificationPresentation(presentation);
    if (shown.state === 'verified' || shown.state === 'checking') continue;
    rows.push({
      kind: 'target',
      severity: shown.state === 'cannot-find' ? 'blocker' : 'warning',
      message: `${shown.label} · ${shown.meaning}`,
      detail: shown.action,
      jump: { stepId: step.id, section: 'target' },
    });
  }
  return rows;
}

function altTextRows(document: LodariqDocument): readonly CheckRow[] {
  const rows: CheckRow[] = [];
  for (const step of tourSteps(document)) {
    for (const block of descendants(step)) {
      if (block.type !== 'media') continue;
      const described = block.props.media?.accessibilityName?.trim();
      if (described) continue;
      rows.push({
        kind: 'alt-text',
        severity: 'warning',
        message: authoringText('A media block has no description for screen readers.'),
        jump: { stepId: step.id, section: 'style' },
      });
    }
  }
  return rows;
}

/**
 * Untranslated strings, grouped with unverified-in-locale items as §7.6 asks.
 * Reported per locale rather than per string, because a hundred rows for one
 * missing locale is the "cries wolf" failure mode (§13).
 */
function translationRows(input: CheckInput): readonly CheckRow[] {
  const locales = input.locales ?? [];
  if (locales.length === 0) return [];
  const variants = new Map(
    (input.document.localization?.variants ?? []).map((variant) => [variant.locale, variant]),
  );
  const rows: CheckRow[] = [];
  for (const locale of locales) {
    const variant = variants.get(locale);
    if (!variant) {
      rows.push({
        kind: 'translation',
        severity: 'warning',
        message: authoringText('{locale} has no translations yet.', { locale }),
      });
      continue;
    }
    // Both problems belong to the same locale, so they sit together (§7.6).
    const missing = translatableBlockIds(input.document).filter(
      (blockId) => !variant.blocks.some((block) => block.blockId === blockId),
    ).length;
    if (missing > 0) {
      rows.push({
        kind: 'translation',
        severity: 'warning',
        message: authoringText('{locale} is missing {count} translations.', {
          locale,
          count: missing,
        }),
      });
    }
    for (const override of variant.targetOverrides ?? []) {
      const presentation = input.targetHealth.get(override.replacementTargetId);
      // Same rule as `targetRows`: never looked at is not a finding.
      if (!presentation || presentation === 'unverified') continue;
      const shown = targetVerificationPresentation(presentation);
      if (shown.state === 'verified') continue;
      rows.push({
        kind: 'translation',
        severity: shown.state === 'cannot-find' ? 'blocker' : 'warning',
        message: authoringText('The {locale} target for one step is {state}.', {
          locale,
          state: shown.label.toLocaleLowerCase(),
        }),
        detail: shown.action,
      });
    }
  }
  return rows;
}

/**
 * Two regions of one language with no plain version of it (§7.6).
 *
 * The runtime matches a viewer by exact tag, then by the plain language, then by
 * any region of it. A document holding `pt-BR` and `pt-PT` but no `pt` has
 * nothing to give a Portuguese speaker in Angola except one of the two, chosen
 * for them. That choice is now deterministic rather than authoring-order, but it
 * is still a choice the creator did not make and cannot see — so it is said out
 * loud here instead.
 */
function localeShapeRows(document: LodariqDocument): readonly CheckRow[] {
  const locales = (document.localization?.variants ?? []).map((variant) => variant.locale);
  const byLanguage = new Map<string, string[]>();
  for (const locale of locales) {
    const language = locale.split('-')[0]?.toLowerCase();
    if (!language) continue;
    byLanguage.set(language, [...(byLanguage.get(language) ?? []), locale]);
  }
  const rows: CheckRow[] = [];
  for (const [language, tags] of byLanguage) {
    const regional = tags.filter((tag) => tag.toLowerCase() !== language);
    if (regional.length < 2 || tags.length !== regional.length) continue;
    rows.push({
      kind: 'translation',
      severity: 'warning',
      message: authoringText('{locales} cover {language}, but plain {language} is missing.', {
        locales: regional.join(', '),
        language,
      }),
      detail: authoringText('Readers elsewhere get one of them picked for them. Add {language}.', {
        language,
      }),
    });
  }
  return rows;
}

/**
 * Locales that would produce a Check row — the count Operations puts on the
 * Language row. Shares `translatableBlockIds` with `translationRows` so the badge
 * and the section can never disagree about what "incomplete" means.
 */
export function incompleteLocales(
  document: LodariqDocument,
  locales: readonly string[],
): readonly string[] {
  const variants = new Map(
    (document.localization?.variants ?? []).map((variant) => [variant.locale, variant]),
  );
  const translatable = translatableBlockIds(document);
  return locales.filter((locale) => {
    const variant = variants.get(locale);
    if (!variant) return true;
    return translatable.some(
      (blockId) => !variant.blocks.some((block) => block.blockId === blockId),
    );
  });
}

/** How much of one locale is written, for the meter Language draws per row. */
export interface LocaleCoverage {
  readonly locale: string;
  readonly translated: number;
  readonly total: number;
  /** 0–100, rounded. 100 with nothing to translate, so an empty tour reads as done. */
  readonly percent: number;
  readonly missing: number;
}

/**
 * Coverage for every locale at once, against the same `translatableBlockIds` the
 * Check rows and the nav badge use — so a row saying "71%" and a badge saying
 * "incomplete" are always the same claim measured once.
 */
export function localeCoverage(
  document: LodariqDocument,
  locales: readonly string[],
): readonly LocaleCoverage[] {
  const variants = new Map(
    (document.localization?.variants ?? []).map((variant) => [variant.locale, variant]),
  );
  const translatable = translatableBlockIds(document);
  return locales.map((locale) => {
    const written = new Set((variants.get(locale)?.blocks ?? []).map((block) => block.blockId));
    const translated = translatable.filter((blockId) => written.has(blockId)).length;
    const total = translatable.length;
    return {
      locale,
      translated,
      total,
      percent: total === 0 ? 100 : Math.round((translated / total) * 100),
      missing: total - translated,
    };
  });
}

/** Leaf blocks that carry creator-facing copy, which is all a locale translates. */
function translatableBlockIds(document: LodariqDocument): readonly string[] {
  return document.blocks
    .flatMap(descendants)
    .filter((block) => block.children.length === 0 && block.content !== undefined)
    .map((block) => block.id);
}

function tourSteps(document: LodariqDocument): readonly LodariqBlock[] {
  return selectExperienceRootBlocks(document);
}

function descendants(block: LodariqBlock): readonly LodariqBlock[] {
  return [block, ...block.children.flatMap(descendants)];
}
