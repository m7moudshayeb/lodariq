import {
  LOCALE_LAYOUT_QA_FINDING_LIMIT,
  LOCALE_LAYOUT_QA_SCHEMA_VERSION,
  LocaleLayoutQaReport as LocaleLayoutQaReportSchema,
  validate,
  type CompiledDocument,
  type LocaleLayoutQaFinding,
  type LocaleLayoutQaIssueCode,
  type LocaleLayoutQaReport,
} from '@lodariq/schema';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';

const EDGE_TOLERANCE_PX = 1;
// Hosted fallback preview owns one player. Keep the sweep sequential so the
// installed and fallback runtimes have identical cancellation semantics.
const PRESENTATION_BATCH_SIZE = 1;
const MAX_PRESENTATIONS_PER_SWEEP = 2_000;

export interface LocaleLayoutVerificationOptions {
  readonly compiled: CompiledDocument;
  readonly documentRevision: number;
  readonly ownerIdPrefix: string;
  readonly playPreview: (options: {
    ownerId: string;
    locale: string;
    stepId: string;
  }) => Promise<void>;
  readonly stopPreview: (ownerId: string) => void;
  readonly now?: () => Date;
}

interface PresentationInput {
  readonly locale: string;
  readonly stepId: string;
  readonly ownerId: string;
}

interface PresentationResult {
  readonly status: 'passed' | 'failed' | 'unavailable';
  readonly finding?: LocaleLayoutQaFinding;
}

/**
 * Materializes every locale/step pair through the real authoring renderer on
 * the customer page. Only bounded issue codes leave the host; DOM, copy,
 * selectors, URLs, and geometry remain ephemeral diagnostics.
 */
export async function runLocaleLayoutVerification(
  options: LocaleLayoutVerificationOptions,
): Promise<LocaleLayoutQaReport> {
  const locales = compiledLocales(options.compiled);
  const stepIds = options.compiled.steps.map((step) => step.id);
  const presentations = presentationInputs(locales, stepIds, options.ownerIdPrefix);
  if (!presentations.length || presentations.length > MAX_PRESENTATIONS_PER_SWEEP) {
    throw new Error('The locale layout sweep is outside its bounded presentation limit');
  }

  const findings: LocaleLayoutQaFinding[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let unavailableCount = 0;

  for (let offset = 0; offset < presentations.length; offset += PRESENTATION_BATCH_SIZE) {
    const batch = presentations.slice(offset, offset + PRESENTATION_BATCH_SIZE);
    const results = await Promise.all(batch.map((input) => inspectPresentation(options, input)));
    for (const result of results) {
      if (result.status === 'passed') passedCount += 1;
      if (result.status === 'failed') failedCount += 1;
      if (result.status === 'unavailable') unavailableCount += 1;
      if (result.finding && findings.length < LOCALE_LAYOUT_QA_FINDING_LIMIT) {
        findings.push(result.finding);
      }
    }
  }

  const viewport = currentViewport(document.defaultView);
  const report = {
    schemaVersion: LOCALE_LAYOUT_QA_SCHEMA_VERSION,
    documentRevision: options.documentRevision,
    contentHash: options.compiled.contentHash,
    checkedAt: (options.now?.() ?? new Date()).toISOString(),
    viewport,
    checkedLocaleCount: locales.length,
    checkedStepCount: stepIds.length,
    checkedPresentationCount: presentations.length,
    passedCount,
    failedCount,
    unavailableCount,
    findingLimitReached: failedCount + unavailableCount > findings.length,
    findings,
  } satisfies LocaleLayoutQaReport;
  const checked = validate(LocaleLayoutQaReportSchema, report);
  if (!checked.valid) throw new Error('Locale layout verification returned an invalid report');
  return checked.value;
}

async function inspectPresentation(
  options: LocaleLayoutVerificationOptions,
  input: PresentationInput,
): Promise<PresentationResult> {
  try {
    await options.playPreview(input);
    const card = ownedPreviewCard(input.ownerId);
    if (!card) return unavailableResult(input);
    const issues = layoutIssues(card, document.defaultView);
    if (!issues.length) return { status: 'passed' };
    return {
      status: 'failed',
      finding: {
        locale: input.locale,
        stepId: input.stepId,
        status: 'failed',
        issues,
      },
    };
  } catch {
    return unavailableResult(input);
  } finally {
    options.stopPreview(input.ownerId);
  }
}

function unavailableResult(input: PresentationInput): PresentationResult {
  return {
    status: 'unavailable',
    finding: {
      locale: input.locale,
      stepId: input.stepId,
      status: 'unavailable',
      issues: ['presentation_unavailable'],
    },
  };
}

function layoutIssues(card: HTMLElement, view: Window | null): LocaleLayoutQaIssueCode[] {
  const issues: LocaleLayoutQaIssueCode[] = [];
  const content = card.querySelector<HTMLElement>('.tour-content') ?? card;
  if (content.scrollWidth > content.clientWidth + EDGE_TOLERANCE_PX) {
    issues.push('horizontal_overflow');
  }
  if (content.scrollHeight > content.clientHeight + EDGE_TOLERANCE_PX) {
    issues.push('vertical_overflow');
  }

  const viewport = currentViewport(view);
  const cardRect = card.getBoundingClientRect();
  if (
    cardRect.left < -EDGE_TOLERANCE_PX ||
    cardRect.top < -EDGE_TOLERANCE_PX ||
    cardRect.right > viewport.width + EDGE_TOLERANCE_PX ||
    cardRect.bottom > viewport.height + EDGE_TOLERANCE_PX
  ) {
    issues.push('viewport_clipping');
  }
  if (interactiveElementIsClipped(card, cardRect)) issues.push('action_clipping');
  return issues;
}

function interactiveElementIsClipped(card: HTMLElement, cardRect: DOMRect): boolean {
  const actions = card.querySelectorAll<HTMLElement>('button, a[href], [role="button"]');
  return [...actions].some((action) => {
    const rect = action.getBoundingClientRect();
    return (
      rect.left < cardRect.left - EDGE_TOLERANCE_PX ||
      rect.top < cardRect.top - EDGE_TOLERANCE_PX ||
      rect.right > cardRect.right + EDGE_TOLERANCE_PX ||
      rect.bottom > cardRect.bottom + EDGE_TOLERANCE_PX
    );
  });
}

function ownedPreviewCard(ownerId: string): HTMLElement | null {
  const hosts = document.querySelectorAll<HTMLElement>(
    `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}]`,
  );
  const host = [...hosts].find(
    (candidate) => candidate.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) === ownerId,
  );
  return host?.shadowRoot?.querySelector<HTMLElement>('div[role="dialog"]') ?? null;
}

function compiledLocales(compiled: CompiledDocument): readonly string[] {
  if (!('localization' in compiled)) return ['en'];
  return [
    compiled.localization.defaultLocale,
    ...compiled.localization.variants.map((variant) => variant.locale),
  ];
}

function presentationInputs(
  locales: readonly string[],
  stepIds: readonly string[],
  ownerIdPrefix: string,
): PresentationInput[] {
  let index = 0;
  return locales.flatMap((locale) =>
    stepIds.map((stepId) => ({
      locale,
      stepId,
      ownerId: `${ownerIdPrefix}_${index++}`,
    })),
  );
}

function currentViewport(view: Window | null): { width: number; height: number } {
  const width = Math.round(view?.visualViewport?.width ?? view?.innerWidth ?? 0);
  const height = Math.round(view?.visualViewport?.height ?? view?.innerHeight ?? 0);
  return { width: Math.max(1, width), height: Math.max(1, height) };
}
