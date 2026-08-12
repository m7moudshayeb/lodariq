import { BLOCK_ACTION_TYPES, isPresentationAnchor, type LodariqBlock } from './block';
import type { LodariqDocument } from './document';
import type { ResolverDiagnostic } from './bridge';
import { TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN } from './target';
import { isSafeNavigationUrl } from './url';

export type PublishReadinessIssueCode =
  | 'unsupported_document_type'
  | 'empty_tour'
  | 'unsupported_tour_block'
  | 'empty_step'
  | 'missing_step_tooltip'
  | 'missing_step_target'
  | 'broken_target_reference'
  | 'target_unverified'
  | 'target_needs_review'
  | 'target_unresolved'
  | 'target_ambiguous'
  | 'button_missing_action'
  | 'link_missing_action'
  | 'open_page_missing_url'
  | 'open_page_unsafe_url'
  | 'action_not_allowed'
  | 'incomplete_media'
  | 'unresolved_lifecycle_hint'
  | 'invalid_presentation_anchor'
  | 'invalid_block'
  | 'incomplete_block';

export interface PublishReadinessIssue {
  code: PublishReadinessIssueCode;
  blockId?: string;
  targetId?: string;
  message: string;
}

export interface ValidateTourPublishReadinessOptions {
  targetDiagnostics?:
    | ReadonlyMap<string, ResolverDiagnostic | { diagnostic: ResolverDiagnostic }>
    | Record<string, ResolverDiagnostic | { diagnostic: ResolverDiagnostic } | undefined>;
  /** Require a fresh factual observation for every target in this publish attempt. */
  requireVerifiedTargets?: boolean;
}

type TargetDiagnosticValue = ResolverDiagnostic | { diagnostic: ResolverDiagnostic };
type TargetDiagnosticSource = NonNullable<ValidateTourPublishReadinessOptions['targetDiagnostics']>;
type TargetFingerprint = LodariqDocument['targets'][number]['fingerprint'];
type ActionBlockKind = 'button' | 'link';
type TooltipChildValidator = (block: LodariqBlock, issues: PublishReadinessIssue[]) => void;

const TOUR_ROOT_BLOCK_TYPES = new Set(['tourStep']);
const TOUR_TOOLTIP_BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'list',
  'divider',
  'button',
  'link',
  'media',
  'targetChip',
  'validationBadge',
]);
const TOUR_STEP_CHILD_TYPES = new Set(['tooltip', 'targetChip', 'validationBadge']);
const ACTION_TYPES = new Set<string>(BLOCK_ACTION_TYPES);
const RICH_TEXT_BLOCK_TYPES = new Set(['heading', 'paragraph']);
const ACTION_STYLE_BLOCK_TYPES = new Set(['button', 'link']);
const VISIBLE_WITHOUT_CONTENT_TYPES = new Set(['divider']);
const HIDDEN_TOUR_CONTENT_TYPES = new Set(['media', 'targetChip', 'validationBadge']);
const ACTIONABLE_FINGERPRINT_TEXT_FIELDS = [
  'accessibleName',
  'role',
  'label',
  'placeholder',
  'title',
  'alt',
] as const satisfies ReadonlyArray<keyof TargetFingerprint>;
const MISSING_ACTION_ISSUE_CODES = {
  button: 'button_missing_action',
  link: 'link_missing_action',
} as const satisfies Record<ActionBlockKind, PublishReadinessIssueCode>;
const PUBLISH_READINESS_ISSUE_LABELS = {
  unsupported_document_type: 'Unsupported document',
  empty_tour: 'Empty tour',
  unsupported_tour_block: 'Unsupported block',
  empty_step: 'Empty step',
  missing_step_tooltip: 'Missing step content',
  missing_step_target: 'Missing target',
  broken_target_reference: 'Broken target',
  target_unverified: 'Unverified target',
  target_needs_review: 'Target needs review',
  target_unresolved: 'Unresolved target',
  target_ambiguous: 'Ambiguous target',
  button_missing_action: 'Incomplete button action',
  link_missing_action: 'Incomplete link action',
  open_page_missing_url: 'Missing URL',
  open_page_unsafe_url: 'Unsafe URL',
  action_not_allowed: 'Unsupported action',
  incomplete_media: 'Incomplete media',
  unresolved_lifecycle_hint: 'Unresolved lifecycle hint',
  invalid_presentation_anchor: 'Invalid presentation area',
  invalid_block: 'Invalid block',
  incomplete_block: 'Incomplete block',
} as const satisfies Record<PublishReadinessIssueCode, string>;

const TOOLTIP_CHILD_VALIDATORS: Readonly<Record<string, TooltipChildValidator>> = {
  button: (block, issues) => validateActionBlock(block, 'button', issues),
  link: (block, issues) => validateActionBlock(block, 'link', issues),
  media: validateMediaBlock,
};

/**
 * Publish-equivalent readiness gate for Phase 1 linear tours.
 *
 * Draft saves remain permissive; this function is used before publish or
 * production-shaped local playback so creators get actionable blockers.
 */
export function validateTourPublishReadiness(
  document: LodariqDocument,
  options: ValidateTourPublishReadinessOptions = {},
): PublishReadinessIssue[] {
  const issues: PublishReadinessIssue[] = [];
  if (document.type !== 'tour') {
    return [
      {
        code: 'unsupported_document_type',
        message: 'Only tour documents can be published in this phase.',
      },
    ];
  }

  const targetsById = new Map(document.targets.map((target) => [target.id, target]));
  const steps = document.blocks.filter((block) => block.type === 'tourStep');
  if (steps.length === 0) {
    issues.push({ code: 'empty_tour', message: 'Add at least one step before publishing.' });
  }

  for (const block of document.blocks) {
    if (!TOUR_ROOT_BLOCK_TYPES.has(block.type)) {
      issues.push({
        code: 'unsupported_tour_block',
        blockId: block.id,
        message: `${blockLabel(block)} is not supported at the top level of a tour.`,
      });
      continue;
    }
    validateTourStep(block, targetsById, options, issues);
  }

  return issues;
}

export function firstPublishBlocker(document: LodariqDocument): string | null {
  return validateTourPublishReadiness(document)[0]?.message ?? null;
}

export function publishReadinessIssueLabel(code: PublishReadinessIssueCode): string {
  return PUBLISH_READINESS_ISSUE_LABELS[code];
}

function validateTourStep(
  step: LodariqBlock,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
  options: ValidateTourPublishReadinessOptions,
  issues: PublishReadinessIssue[],
): void {
  if (step.status === 'invalid') {
    issues.push({
      code: 'invalid_block',
      blockId: step.id,
      message: `${stepLabel(step)} needs a configuration fix before publishing.`,
    });
  }

  const unsupportedChild = step.children.find((child) => !TOUR_STEP_CHILD_TYPES.has(child.type));
  if (unsupportedChild) {
    issues.push({
      code: 'unsupported_tour_block',
      blockId: unsupportedChild.id,
      message: `${blockLabel(unsupportedChild)} is not supported directly inside a tour step.`,
    });
  }

  const tooltip = step.children.find((child) => child.type === 'tooltip');
  if (!tooltip) {
    issues.push({
      code: 'missing_step_tooltip',
      blockId: step.id,
      message: `${stepLabel(step)} needs step content before publishing.`,
    });
    return;
  }

  validatePresentationAnchorConfiguration(step, tooltip, issues);
  validateStructuredStylePlacement(step, issues);
  validateStructuredStylePlacement(tooltip, issues);

  const editableChildren = tooltip.children.filter(
    (child) => child.type !== 'targetChip' && child.type !== 'validationBadge',
  );
  const hasVisibleContent = editableChildren.some(hasVisibleTourContent);
  if (!hasVisibleContent) {
    issues.push({
      code: 'empty_step',
      blockId: step.id,
      message: `${stepLabel(step)} needs content before publishing.`,
    });
  }

  const targetId = typeof tooltip.props.targetId === 'string' ? tooltip.props.targetId : undefined;
  if (!targetId) {
    issues.push({
      code: 'missing_step_target',
      blockId: step.id,
      message: `${stepLabel(step)} needs a placement before publishing.`,
    });
  } else if (!targetsById.has(targetId)) {
    issues.push({
      code: 'broken_target_reference',
      blockId: step.id,
      targetId,
      message: `${stepLabel(step)} references a placement that no longer exists.`,
    });
  } else {
    const target = targetsById.get(targetId);
    validateTargetLifecycle(step, target, issues);
    const captureNeedsReview = Boolean(
      target?.identity &&
      (target.identity.captureEvidence.quality === 'weak' ||
        target.identity.captureEvidence.uniqueCandidateCount !== 1 ||
        target.identity.captureEvidence.runnerUpMargin < TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN),
    );
    if (captureNeedsReview) {
      issues.push({
        code: 'target_needs_review',
        blockId: step.id,
        targetId,
        message: `${stepLabel(step)} placement needs a more specific selection before publishing.`,
      });
    }
    const diagnostic = targetDiagnostic(options.targetDiagnostics, targetId);
    if (!diagnostic && options.requireVerifiedTargets) {
      issues.push({
        code: 'target_unverified',
        blockId: step.id,
        targetId,
        message: `${stepLabel(step)} placement has not been verified on this environment and page state.`,
      });
    }
    if (diagnostic?.state === 'missing') {
      issues.push({
        code: 'target_unresolved',
        blockId: step.id,
        targetId,
        message: `${stepLabel(step)} placement could not be found. Choose or check it again.`,
      });
    }
    if (diagnostic?.state === 'ambiguous') {
      issues.push({
        code: 'target_ambiguous',
        blockId: step.id,
        targetId,
        message: `${stepLabel(step)} placement matches more than one element. Pick a more specific placement.`,
      });
    }
    if (diagnostic?.state === 'needs_review' && !captureNeedsReview) {
      issues.push({
        code: 'target_needs_review',
        blockId: step.id,
        targetId,
        message: `${stepLabel(step)} placement drifted from its saved evidence. Verify or choose it again.`,
      });
    }
  }

  for (const child of tooltip.children) validateTooltipChild(child, issues);
}

function validatePresentationAnchorConfiguration(
  step: LodariqBlock,
  tooltip: LodariqBlock,
  issues: PublishReadinessIssue[],
): void {
  visitBlockTree(step, (block) => {
    const presentationAnchor = block.props.presentationAnchor;
    if (presentationAnchor === undefined) return;
    if (block !== tooltip) {
      issues.push({
        code: 'invalid_presentation_anchor',
        blockId: block.id,
        message:
          `${blockLabel(block)} has a presentation area outside the step placement. ` +
          'Clear it and choose the area again.',
      });
      return;
    }
    if (!isPresentationAnchor(presentationAnchor)) {
      issues.push({
        code: 'invalid_presentation_anchor',
        blockId: step.id,
        targetId: typeof tooltip.props.targetId === 'string' ? tooltip.props.targetId : undefined,
        message:
          `${stepLabel(step)} has a presentation area outside its selected element. ` +
          'Choose the area again.',
      });
    }
  });
}

function visitBlockTree(block: LodariqBlock, visit: (candidate: LodariqBlock) => void): void {
  visit(block);
  for (const child of block.children) visitBlockTree(child, visit);
}

function validateTargetLifecycle(
  step: LodariqBlock,
  target: LodariqDocument['targets'][number] | undefined,
  issues: PublishReadinessIssue[],
): void {
  const lifecycle = target?.lifecycle;
  if (!lifecycle) return;
  const lifecycleWaitText = lifecycle.waitForText?.trim();
  if (
    (typeof lifecycle.waitForText === 'string' && !lifecycleWaitText) ||
    (lifecycle.waitForTextLocale && !lifecycleWaitText)
  ) {
    issues.push({
      code: 'unresolved_lifecycle_hint',
      blockId: step.id,
      targetId: target.id,
      message: `${stepLabel(step)} has an incomplete lifecycle text wait. Add text or clear it.`,
    });
  }
  for (const fingerprint of [
    lifecycle.waitForElement,
    lifecycle.scrollContainer,
    lifecycle.openPanel,
    lifecycle.selectTab,
  ]) {
    if (fingerprint && !hasActionableFingerprint(fingerprint)) {
      issues.push({
        code: 'unresolved_lifecycle_hint',
        blockId: step.id,
        targetId: target.id,
        message: `${stepLabel(step)} has a lifecycle hint that cannot be resolved reliably.`,
      });
      return;
    }
  }
}

function validateTooltipChild(block: LodariqBlock, issues: PublishReadinessIssue[]): void {
  if (!TOUR_TOOLTIP_BLOCK_TYPES.has(block.type)) {
    issues.push({
      code: 'unsupported_tour_block',
      blockId: block.id,
      message: `${blockLabel(block)} is not supported inside a tour step.`,
    });
    return;
  }
  validateStructuredStylePlacement(block, issues);
  if (block.status === 'invalid') {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} needs a configuration fix before publishing.`,
    });
  }
  validateInlineContent(block, issues);
  TOOLTIP_CHILD_VALIDATORS[block.type]?.(block, issues);
  for (const child of block.children) validateTooltipChild(child, issues);
}

function validateStructuredStylePlacement(
  block: LodariqBlock,
  issues: PublishReadinessIssue[],
): void {
  if (block.contentRuns?.length && !RICH_TEXT_BLOCK_TYPES.has(block.type)) {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has rich-text formatting that is not supported for this block type.`,
    });
  }
  if (block.props.buttonStyle && !ACTION_STYLE_BLOCK_TYPES.has(block.type)) {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has action styling that is not supported for this block type.`,
    });
  }
  if (block.props.tooltipLayout && block.type !== 'tooltip') {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has popup layout settings outside a tooltip.`,
    });
  }
}

function validateInlineContent(block: LodariqBlock, issues: PublishReadinessIssue[]): void {
  if (!block.contentRuns?.length) return;
  if (block.contentRuns.map((run) => run.text).join('') !== (block.content ?? '')) {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has inconsistent rich-text content. Reopen and save the text.`,
    });
  }
  if (block.contentRuns.some((run) => run.link && !isSafeNavigationUrl(run.link))) {
    issues.push({
      code: 'open_page_unsafe_url',
      blockId: block.id,
      message: `${blockLabel(block)} contains a text link that is not allowed.`,
    });
  }
}

function validateMediaBlock(block: LodariqBlock, issues: PublishReadinessIssue[]): void {
  issues.push({
    code: 'incomplete_media',
    blockId: block.id,
    message: `${blockLabel(block)} needs media added or the placeholder removed.`,
  });
}

function validateActionBlock(
  block: LodariqBlock,
  kind: ActionBlockKind,
  issues: PublishReadinessIssue[],
): void {
  const action = block.props.action;
  if (!action) {
    issues.push({
      code: MISSING_ACTION_ISSUE_CODES[kind],
      blockId: block.id,
      message: `${blockLabel(block)} needs an action before publishing.`,
    });
    return;
  }
  if (!ACTION_TYPES.has(action.type)) {
    issues.push({
      code: 'action_not_allowed',
      blockId: block.id,
      message: `${blockLabel(block)} uses an unsupported action.`,
    });
    return;
  }
  if (action.type !== 'openPage' && action.url) {
    issues.push({
      code: 'action_not_allowed',
      blockId: block.id,
      message: `${blockLabel(block)} has a page URL on an action that does not use one.`,
    });
  }
  if (action.type !== 'openPage' && action.navigationBehavior) {
    issues.push({
      code: 'action_not_allowed',
      blockId: block.id,
      message: `${blockLabel(block)} has navigation behavior on an action that does not navigate.`,
    });
  }
  if (action.type === 'openPage') {
    if (!action.url?.trim()) {
      issues.push({
        code: 'open_page_missing_url',
        blockId: block.id,
        message: `${blockLabel(block)} needs a page URL before publishing.`,
      });
      return;
    }
    if (!isSafeNavigationUrl(action.url)) {
      issues.push({
        code: 'open_page_unsafe_url',
        blockId: block.id,
        message: `${blockLabel(block)} uses a URL that is not allowed.`,
      });
    }
  }
}

function hasVisibleTourContent(block: LodariqBlock): boolean {
  if (VISIBLE_WITHOUT_CONTENT_TYPES.has(block.type)) return true;
  if (HIDDEN_TOUR_CONTENT_TYPES.has(block.type)) return false;
  if (typeof block.content === 'string' && block.content.trim()) return true;
  return block.children.some(hasVisibleTourContent);
}

function hasActionableFingerprint(fingerprint: TargetFingerprint): boolean {
  return (
    ACTIONABLE_FINGERPRINT_TEXT_FIELDS.some((field) => hasText(fingerprint[field])) ||
    fingerprint.nearbyText?.some(hasText) === true ||
    Object.values(fingerprint.stableAttributes).some(hasText)
  );
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function targetDiagnostic(
  diagnostics: ValidateTourPublishReadinessOptions['targetDiagnostics'],
  targetId: string,
): ResolverDiagnostic | null {
  const value = targetDiagnosticValue(diagnostics, targetId);
  if (!value) return null;
  return 'diagnostic' in value ? value.diagnostic : value;
}

function targetDiagnosticValue(
  diagnostics: ValidateTourPublishReadinessOptions['targetDiagnostics'],
  targetId: string,
): TargetDiagnosticValue | null {
  if (!diagnostics) return null;
  if (isTargetDiagnosticMap(diagnostics)) return diagnostics.get(targetId) ?? null;
  return diagnostics[targetId] ?? null;
}

function isTargetDiagnosticMap(
  diagnostics: TargetDiagnosticSource,
): diagnostics is ReadonlyMap<string, TargetDiagnosticValue> {
  return typeof (diagnostics as ReadonlyMap<string, TargetDiagnosticValue>).get === 'function';
}

function blockLabel(block: LodariqBlock): string {
  const text = block.content?.trim();
  if (text) return `"${text}"`;
  if (block.type === 'tourStep') return stepLabel(block);
  if (block.type === 'media') return 'Media placeholder';
  return block.type;
}

function stepLabel(block: LodariqBlock): string {
  if (typeof block.props.index === 'number') return `Step ${block.props.index + 1}`;
  return 'Step';
}
