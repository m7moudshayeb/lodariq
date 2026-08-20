import {
  BLOCK_ACTION_TYPES,
  isPresentationAnchor,
  type BlockActionProps,
  type LodariqBlock,
} from './block';
import type { StepChoreography } from './choreography';
import type { LodariqDocument } from './document';
import type { ResolverDiagnostic } from './bridge';
import { STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES } from './presentation';
import type { TourFlowIssueCode } from './tour-flow-contract';
import { analyzeTourDocumentFlow } from './tour-flow-analysis';
import { TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN, selectionSettlesAmbiguity } from './target';
import { isSafeNavigationUrl } from './url';

export type PublishReadinessIssueCode =
  | TourFlowIssueCode
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
  | 'choreography_target_missing'
  | 'choreography_step_missing'
  | 'choreography_target_unverified'
  | 'incomplete_media'
  | 'media_asset_invalid'
  | 'missing_accessible_name'
  | 'unresolved_lifecycle_hint'
  | 'invalid_presentation_anchor'
  | 'invalid_block'
  | 'incomplete_block';

export interface PublishReadinessIssue {
  code: PublishReadinessIssueCode;
  blockId?: string;
  targetId?: string;
  severity?: 'blocker' | 'warning';
  message: string;
}

export interface ValidateTourPublishReadinessOptions {
  targetDiagnostics?:
    | ReadonlyMap<string, ResolverDiagnostic | { diagnostic: ResolverDiagnostic }>
    | Record<string, ResolverDiagnostic | { diagnostic: ResolverDiagnostic } | undefined>;
  /** Require a fresh factual observation for every target in this publish attempt. */
  requireVerifiedTargets?: boolean;
  /** Server-resolved asset IDs available to this exact workspace. */
  validMediaAssetIds?: ReadonlySet<string>;
  /** Server-resolved asset IDs and their validated delivery kinds. */
  validMediaAssets?: ReadonlyMap<string, 'image' | 'video' | 'captions'>;
  /** Release boundaries require every media reference to resolve server-side. */
  requireValidMediaAssets?: boolean;
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
  'callout',
  'stat',
  'icon',
  'formField',
  'targetChip',
  'validationBadge',
]);
const TOUR_STEP_CHILD_TYPES = new Set(['tooltip', 'targetChip', 'validationBadge']);
const ACTION_TYPES = new Set<string>(BLOCK_ACTION_TYPES);
const RICH_TEXT_BLOCK_TYPES = new Set(['heading', 'paragraph']);
const ACTION_STYLE_BLOCK_TYPES = new Set(['button', 'link']);
const VISIBLE_WITHOUT_CONTENT_TYPES = new Set(['divider']);
const HIDDEN_TOUR_CONTENT_TYPES = new Set(['media', 'targetChip', 'validationBadge']);
const STRUCTURED_COMPOSITION_BLOCK_TYPES = new Set<string>(
  STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
);
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
  choreography_target_missing: 'Sequence target is missing',
  choreography_step_missing: 'Sequence recovery step is missing',
  choreography_target_unverified: 'Sequence target is unverified',
  incomplete_media: 'Incomplete media',
  media_asset_invalid: 'Media asset is unavailable',
  missing_accessible_name: 'Missing accessible name',
  unresolved_lifecycle_hint: 'Unresolved lifecycle hint',
  invalid_presentation_anchor: 'Invalid presentation area',
  invalid_flow_edge: 'Broken flow connection',
  unreachable_step: 'Unreachable step',
  non_terminating_flow: 'Flow does not finish',
  missing_terminal_completion: 'Missing completion path',
  invalid_block: 'Invalid block',
  incomplete_block: 'Incomplete block',
} as const satisfies Record<PublishReadinessIssueCode, string>;

const TOOLTIP_CHILD_VALIDATORS: Readonly<Record<string, TooltipChildValidator>> = {
  button: (block, issues) => validateActionBlock(block, 'button', issues),
  link: (block, issues) => validateActionBlock(block, 'link', issues),
  formField: validateFormFieldBlock,
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
  const stepIds = new Set(steps.map((step) => step.id));
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
    validateTourStep(block, targetsById, stepIds, options, issues);
  }

  issues.push(
    ...analyzeTourDocumentFlow(document).findings.map((finding): PublishReadinessIssue => ({
      code: finding.code,
      blockId: finding.stepId,
      severity: finding.severity,
      message: publishReadinessIssueLabel(finding.code),
    })),
  );

  return issues;
}

export function firstPublishBlocker(document: LodariqDocument): string | null {
  return validateTourPublishReadiness(document).find(isPublishReadinessBlocker)?.message ?? null;
}

export function isPublishReadinessBlocker(issue: Pick<PublishReadinessIssue, 'severity'>): boolean {
  return issue.severity !== 'warning';
}

export function publishReadinessIssueLabel(code: PublishReadinessIssueCode): string {
  return PUBLISH_READINESS_ISSUE_LABELS[code];
}

function validateTourStep(
  step: LodariqBlock,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
  stepIds: ReadonlySet<string>,
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
  validateChoreography(
    step.props.entrySequence,
    step.id,
    targetIdOfTooltip(tooltip),
    targetsById,
    stepIds,
    options,
    issues,
  );
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
    const captureNeedsReview = captureBlocksRelease(target);
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

  for (const child of tooltip.children) {
    validateTooltipChild(child, options, issues);
    validateActionChoreography(child, step.id, targetId, targetsById, stepIds, options, issues);
  }
}

/**
 * Whether saved capture evidence is enough to release, ignoring live verification.
 *
 * Two independent questions, deliberately kept apart. *Is the evidence sound?*
 * — rich enough, stable enough, and pointed at an element that can take the
 * required action. *Is the target decided?* — do several elements read the same
 * way, and if so did the author say which one they meant.
 *
 * Only the second question has an author-side answer, so only the second is
 * cleared by `Target.selection`. A capture that is weak for any reason beyond
 * ambiguity keeps blocking however the author answered: no policy can make thin
 * evidence thick. Capture written before `ambiguityIsSoleWeakness` existed omits
 * it, which keeps those targets blocked until they are picked again.
 */
function captureBlocksRelease(target: LodariqDocument['targets'][number] | undefined): boolean {
  const evidence = target?.identity?.captureEvidence;
  if (!evidence) return false;
  const undecided =
    evidence.uniqueCandidateCount !== 1 ||
    evidence.runnerUpMargin < TARGET_MIN_CAPTURE_RUNNER_UP_MARGIN;
  const settled = undecided && selectionSettlesAmbiguity(target?.selection);
  if (undecided && !settled) return true;
  if (evidence.quality !== 'weak') return false;
  // Weak *and* answered: releasable only when ambiguity was the whole problem.
  return !(settled && evidence.ambiguityIsSoleWeakness === true);
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

function validateTooltipChild(
  block: LodariqBlock,
  options: ValidateTourPublishReadinessOptions,
  issues: PublishReadinessIssue[],
): void {
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
  if (block.type === 'media') validateMediaBlock(block, options, issues);
  validateStructuredCompositionBlock(block, issues);
  for (const child of block.children) validateTooltipChild(child, options, issues);
}

function validateStructuredCompositionBlock(
  block: LodariqBlock,
  issues: PublishReadinessIssue[],
): void {
  const isCompositionBlock = STRUCTURED_COMPOSITION_BLOCK_TYPES.has(block.type);
  if (!isCompositionBlock) return;
  if (block.props.composition?.kind !== block.type) {
    issues.push({
      code: 'incomplete_block',
      blockId: block.id,
      message: `${blockLabel(block)} needs a matching structured-content recipe.`,
    });
  }
  if (!block.props.accessibilityName?.trim()) {
    issues.push({
      code: 'missing_accessible_name',
      blockId: block.id,
      message: `${blockLabel(block)} needs an accessibility name.`,
    });
  }
}

export function collectTourMediaAssetIds(document: LodariqDocument): string[] {
  const assetIds = new Set<string>();
  for (const root of document.blocks) {
    visitBlockTree(root, (block) => {
      const media = block.props.media;
      if (!media) return;
      assetIds.add(media.assetId);
      if (media.kind === 'video') {
        if (media.captionsAssetId) assetIds.add(media.captionsAssetId);
        if (media.posterAssetId) assetIds.add(media.posterAssetId);
      }
    });
  }
  return [...assetIds];
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
  if (block.props.tooltipStyle && block.type !== 'tooltip') {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has popup styling outside a tooltip.`,
    });
  }
  if (block.props.composition && !STRUCTURED_COMPOSITION_BLOCK_TYPES.has(block.type)) {
    issues.push({
      code: 'invalid_block',
      blockId: block.id,
      message: `${blockLabel(block)} has a structured-content recipe on an unsupported block.`,
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

function validateFormFieldBlock(block: LodariqBlock, issues: PublishReadinessIssue[]): void {
  const field = block.props.formField;
  if (!field) {
    issues.push({
      code: 'incomplete_block',
      blockId: block.id,
      message: `${blockLabel(block)} needs a form field type before publishing.`,
    });
    return;
  }
  if (!block.content?.trim()) {
    issues.push({
      code: 'incomplete_block',
      blockId: block.id,
      message: `${blockLabel(block)} needs a visible label before publishing.`,
    });
  }
  if (field.control === 'radio' && (field.options?.length ?? 0) < 2) {
    issues.push({
      code: 'incomplete_block',
      blockId: block.id,
      message: `${blockLabel(block)} needs at least two radio choices before publishing.`,
    });
  }
}

function validateMediaBlock(
  block: LodariqBlock,
  options: ValidateTourPublishReadinessOptions,
  issues: PublishReadinessIssue[],
): void {
  const media = block.props.media;
  if (!media) {
    issues.push({
      code: 'incomplete_media',
      blockId: block.id,
      message: `${blockLabel(block)} needs media added or the placeholder removed.`,
    });
    return;
  }
  if (!media.accessibilityName.trim()) {
    issues.push({
      code: 'missing_accessible_name',
      blockId: block.id,
      message: `${blockLabel(block)} needs an accessibility description.`,
    });
  }
  if (media.kind === 'video' && !media.captionsAssetId) {
    issues.push({
      code: 'incomplete_media',
      blockId: block.id,
      message: `${blockLabel(block)} needs captions before it can be published.`,
    });
  }
  if (!options.requireValidMediaAssets) return;
  const references: Array<{ assetId: string; kind: 'image' | 'video' | 'captions' }> = [
    { assetId: media.assetId, kind: media.kind },
    ...(media.kind === 'video'
      ? [
          ...(media.captionsAssetId
            ? [{ assetId: media.captionsAssetId, kind: 'captions' as const }]
            : []),
          ...(media.posterAssetId
            ? [{ assetId: media.posterAssetId, kind: 'image' as const }]
            : []),
        ]
      : []),
  ];
  const valid = references.every(({ assetId, kind }) => {
    if (options.validMediaAssets) return options.validMediaAssets.get(assetId) === kind;
    return options.validMediaAssetIds?.has(assetId) === true;
  });
  if (valid) return;
  issues.push({
    code: 'media_asset_invalid',
    blockId: block.id,
    message: `${blockLabel(block)} references media that is unavailable in this workspace.`,
  });
}

function validateActionChoreography(
  block: LodariqBlock,
  stepId: string,
  stepTargetId: string | undefined,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
  stepIds: ReadonlySet<string>,
  options: ValidateTourPublishReadinessOptions,
  issues: PublishReadinessIssue[],
): void {
  const action: BlockActionProps | undefined = block.props.action;
  if (action?.type === 'runSequence') {
    validateChoreography(
      action.sequence,
      block.id,
      stepTargetId,
      targetsById,
      stepIds,
      options,
      issues,
    );
  }
  for (const child of block.children) {
    validateActionChoreography(child, stepId, stepTargetId, targetsById, stepIds, options, issues);
  }
}

function validateChoreography(
  sequence: StepChoreography | undefined,
  blockId: string,
  stepTargetId: string | undefined,
  targetsById: ReadonlyMap<string, LodariqDocument['targets'][number]>,
  stepIds: ReadonlySet<string>,
  options: ValidateTourPublishReadinessOptions,
  issues: PublishReadinessIssue[],
): void {
  if (!sequence) return;
  const targetIds = new Set<string>();
  if (sequence.trigger.type !== 'manual') {
    const triggerTargetId = sequence.trigger.targetId ?? stepTargetId;
    if (triggerTargetId) targetIds.add(triggerTargetId);
    else {
      issues.push({
        code: 'choreography_target_missing',
        blockId,
        message: 'Sequence activation needs a semantic target.',
      });
    }
  }
  for (const wait of sequence.waitFor) {
    if (wait.type === 'targetAvailable') targetIds.add(wait.targetId);
  }
  for (const targetId of targetIds) {
    if (!targetsById.has(targetId)) {
      issues.push({
        code: 'choreography_target_missing',
        blockId,
        targetId,
        message: 'Sequence references a target that no longer exists.',
      });
      continue;
    }
    const diagnostic = targetDiagnostic(options.targetDiagnostics, targetId);
    if (options.requireVerifiedTargets && diagnostic?.state !== 'found') {
      issues.push({
        code: 'choreography_target_unverified',
        blockId,
        targetId,
        message: 'Sequence target has not been verified in this environment and page state.',
      });
    }
  }
  const destinationStepIds = [
    ...(sequence.transition.type === 'step' ? [sequence.transition.stepId] : []),
    ...(sequence.onTimeout === 'goToStep' ? [sequence.timeoutStepId] : []),
  ];
  for (const destinationStepId of destinationStepIds) {
    if (stepIds.has(destinationStepId)) continue;
    issues.push({
      code: 'choreography_step_missing',
      blockId,
      message: 'Sequence transition or timeout recovery points to a missing step.',
    });
  }
}

function targetIdOfTooltip(tooltip: LodariqBlock): string | undefined {
  return typeof tooltip.props.targetId === 'string' ? tooltip.props.targetId : undefined;
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
  if (action.type !== 'openPage' && 'url' in action && action.url) {
    issues.push({
      code: 'action_not_allowed',
      blockId: block.id,
      message: `${blockLabel(block)} has a page URL on an action that does not use one.`,
    });
  }
  if (action.type !== 'openPage' && 'navigationBehavior' in action && action.navigationBehavior) {
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
