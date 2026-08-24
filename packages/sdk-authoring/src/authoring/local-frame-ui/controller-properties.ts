import { ControllerReliabilityFeature } from './controller-reliability';
import { authoringText } from '../../i18n';
import type { StepEmphasisPatch } from './types';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  CONTRAST_RATIO_TARGETS,
  evaluateContrast,
  resolveExperienceAppearance,
  sanitizeTooltipLayoutProps,
  sanitizeTooltipStyleProps,
  type BlockLayoutProps,
  type ButtonStyleProps,
  type LodariqBlock,
  type LodariqDocument,
  type OpenPageNavigationBehavior,
  type ExperienceAppearance,
  type InlineTextRun,
  type TextStyleProps,
  type TooltipLayoutProps,
  type TooltipStyleProps,
  type JourneyHandoff,
  type StepChoreography,
  type BlockActionProps,
  type TourCompletionBehavior,
  type StepTransition,
  type TourMotionPresentation,
  type ResponsiveStepPresentation,
  type SpotlightPresentation,
  type MediaPresentation,
  type LocalizedMediaVariant,
  type StructuredCompositionPresentation,
  STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
  type ExperienceSurfaceForm,
  type AnchorAlign,
  type StepEmphasis,
  type StepTransitionCondition,
  type ExperienceBehavior,
} from '@lodariq/schema';
import {
  setBlockLayout as setBlockLayoutInTree,
  setBlockAction,
  setBlockPlacement,
  setBlockTextStyle,
  setBlockVariant,
  setButtonStyle as setButtonStyleInTree,
  setTooltipLayout as setTooltipLayoutInTree,
  setTooltipStyle as setTooltipStyleInTree,
  transformBlocks,
  updateBlockProps,
  type EditableBlockType,
  type TooltipPlacement,
  setBlockEmphasis,
  setBlockShowWhen,
} from '../document-ops';
import type { EditableButtonVariant, EditableActionType } from './types';
import { blockTypeLabel, findBlockById, isEditableContentBlock } from './utils';
import { slashCommandDefaultContent } from './controller-model';
import { localizedAuthoringDocument, setAuthoringLocalizedTitle } from '../document-localization';
import {
  blockSupportsAuthoringCapability,
  registeredExperienceDefinition,
} from '../experience-authoring-capabilities';
import { dropRegion, type DropPoint } from '../experiences/gestures';

const STRUCTURED_COMPOSITION_BLOCK_TYPES = new Set<string>(
  STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
);
const TYPOGRAPHY_BLOCK_TYPES = new Set<LodariqBlock['type']>([
  'heading',
  'paragraph',
  ...STRUCTURED_COMPOSITION_BLOCK_TYPE_VALUES,
]);

export abstract class ControllerPropertyFeature extends ControllerReliabilityFeature {
  setButtonAction(blockId: string, actionType: EditableActionType): void {
    this.setAction(blockId, actionType);
  }

  setButtonSequence(blockId: string, sequence: StepChoreography): void {
    if (!this.deliveryCapabilities.has('choreography.v1')) return;
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    const action: BlockActionProps = { type: 'runSequence', sequence: structuredClone(sequence) };
    if (JSON.stringify(block.props.action) === JSON.stringify(action)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `sequence:${blockId}`,
      operations: [{ op: 'setAction', action }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockAction(document.blocks, blockId, action),
      }),
      scope: 'behavior',
      status: authoringText('Sequence updated'),
    });
  }

  setButtonTransition(blockId: string, transition: StepTransition | undefined): void {
    if (!this.deliveryCapabilities.has('flow.v1')) return;
    const block = findBlockById(this.documentState.blocks, blockId);
    const currentAction = block?.props.action;
    if (!block || !currentAction || (block.type !== 'button' && block.type !== 'link')) return;
    const action = transition
      ? { ...currentAction, transition: structuredClone(transition) }
      : (Object.fromEntries(
          Object.entries(currentAction).filter(([key]) => key !== 'transition'),
        ) as BlockActionProps);
    if (JSON.stringify(currentAction) === JSON.stringify(action)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `transition:${blockId}`,
      operations: [{ op: 'setAction', action }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockAction(document.blocks, blockId, action),
      }),
      scope: 'behavior',
      status: authoringText('Action branch updated'),
    });
  }

  setButtonVariant(blockId: string, variant: EditableButtonVariant): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    if (block.props.variant === variant) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `button:${blockId}`,
      operations: [{ op: 'setVariant', variant }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockVariant(document.blocks, blockId, variant),
      }),
      status: authoringText('Button style changed to {variant}', { variant }),
    });
  }

  commitRichTextContent(blockId: string, value: string, contentRuns?: InlineTextRun[]): void {
    this.commitContentRuns(blockId, value, contentRuns);
  }

  setTextBlockStyle(blockId: string, patch: Partial<TextStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !TYPOGRAPHY_BLOCK_TYPES.has(block.type)) return;
    const textStyle = { ...block.props.textStyle, ...patch };
    if (JSON.stringify(block.props.textStyle ?? {}) === JSON.stringify(textStyle)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `text:${blockId}`,
      operations: [{ op: 'setTextStyle', textStyle }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockTextStyle(document.blocks, blockId, textStyle),
      }),
      status: authoringText('Text formatting updated'),
    });
  }

  resetTextBlockStyle(blockId: string): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !TYPOGRAPHY_BLOCK_TYPES.has(block.type)) return;
    if (!block.props.textStyle) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `text:${blockId}`,
      operations: [{ op: 'setTextStyle' }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockTextStyle(document.blocks, blockId),
      }),
      status: authoringText('Text formatting reset to the Brand Theme'),
    });
  }

  setContentBlockLayout(blockId: string, patch: Partial<BlockLayoutProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !isEditableContentBlock(block)) return;
    const blockLayout = { ...block.props.blockLayout, ...patch };
    if (JSON.stringify(block.props.blockLayout ?? {}) === JSON.stringify(blockLayout)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `layout:${blockId}`,
      operations: [{ op: 'setBlockLayout', blockLayout }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockLayoutInTree(document.blocks, blockId, blockLayout),
      }),
      status: authoringText('Block layout updated'),
    });
  }

  setButtonStyle(blockId: string, patch: Partial<ButtonStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    const buttonStyle = { ...block.props.buttonStyle, ...patch };
    this.commitButtonStyle(block, buttonStyle);
  }

  resetButtonStyleFields(blockId: string, fields: ReadonlyArray<keyof ButtonStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    const buttonStyle = { ...block.props.buttonStyle };
    for (const field of fields) delete buttonStyle[field];
    this.commitButtonStyle(block, buttonStyle);
  }

  protected commitButtonStyle(block: LodariqBlock, buttonStyle: ButtonStyleProps): void {
    if (JSON.stringify(block.props.buttonStyle ?? {}) === JSON.stringify(buttonStyle)) return;
    this.commitCoordinatedMutation({
      blockId: block.id,
      coalescingKey: `button:${block.id}`,
      operations: [{ op: 'setButtonStyle', buttonStyle }],
      reduce: (document) => ({
        ...document,
        blocks: setButtonStyleInTree(document.blocks, block.id, buttonStyle),
      }),
      status: authoringText('Action styling updated'),
    });
    this.recordCustomContrast(block.id, buttonStyle.textColor, buttonStyle.fillColor);
  }

  setTooltipLayout(blockId: string, patch: Partial<TooltipLayoutProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip') return;
    const tooltipLayout = sanitizeTooltipLayoutProps({ ...block.props.tooltipLayout, ...patch });
    if (JSON.stringify(block.props.tooltipLayout ?? {}) === JSON.stringify(tooltipLayout ?? {})) {
      return;
    }
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `popup:${blockId}`,
      operations: [
        tooltipLayout ? { op: 'setTooltipLayout', tooltipLayout } : { op: 'setTooltipLayout' },
      ],
      reduce: (document) => ({
        ...document,
        blocks: setTooltipLayoutInTree(document.blocks, blockId, tooltipLayout),
      }),
      status: authoringText('Popup layout updated'),
    });
  }

  setTooltipStyle(blockId: string, patch: Partial<TooltipStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip') return;
    const tooltipStyle = sanitizeTooltipStyleProps({ ...block.props.tooltipStyle, ...patch });
    this.commitTooltipStyle(block, tooltipStyle);
  }

  resetTooltipStyle(blockId: string): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip') return;
    this.commitTooltipStyle(block, undefined);
  }

  private commitTooltipStyle(block: LodariqBlock, tooltipStyle?: TooltipStyleProps): void {
    if (JSON.stringify(block.props.tooltipStyle ?? {}) === JSON.stringify(tooltipStyle ?? {})) {
      return;
    }
    this.commitCoordinatedMutation({
      blockId: block.id,
      coalescingKey: `popup:${block.id}`,
      operations: [
        tooltipStyle ? { op: 'setTooltipStyle', tooltipStyle } : { op: 'setTooltipStyle' },
      ],
      reduce: (document) => ({
        ...document,
        blocks: setTooltipStyleInTree(document.blocks, block.id, tooltipStyle),
      }),
      status: authoringText('Popup styling updated'),
    });
    this.recordCustomContrast(block.id, tooltipStyle?.textColor, tooltipStyle?.surfaceColor);
  }

  private recordCustomContrast(
    blockId: string,
    foreground: string | undefined,
    background: string | undefined,
  ): void {
    if (!foreground || !background) return;
    const result = evaluateContrast(
      foreground,
      background,
      CONTRAST_RATIO_TARGETS.text,
      CONTRAST_RATIO_TARGETS.textUnusable,
    );
    if (result.state === 'pass') return;
    this.recordMetric(result.state === 'blocker' ? 'contrast.blocker' : 'contrast.warning', {
      blockId,
      state: result.state,
    });
  }

  setTooltipPlacement(
    blockId: string,
    placement: TooltipPlacement,
    anchor: { align?: AnchorAlign; offsetPx?: number } = {},
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip') return;
    const unchanged =
      block.props.placement === placement &&
      (anchor.align === undefined || block.props.anchorAlign === anchor.align) &&
      (anchor.offsetPx === undefined || block.props.anchorOffsetPx === anchor.offsetPx);
    if (unchanged) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `popup:${blockId}`,
      operations: [
        {
          op: 'setPlacement',
          placement,
          ...(anchor.align ? { align: anchor.align } : {}),
          ...(anchor.offsetPx === undefined ? {} : { offsetPx: anchor.offsetPx }),
        },
      ],
      reduce: (document) => ({
        ...document,
        blocks: setBlockPlacement(document.blocks, blockId, placement, anchor),
      }),
      status:
        anchor.offsetPx === undefined
          ? `Tooltip moved ${placement}`
          : `Tooltip gap ${anchor.offsetPx}px`,
    });
  }

  /**
   * The visibility rule for a step or one of its blocks. Passing nothing clears
   * it, which is how a creator says "show this to everyone" again.
   */
  setBlockShowWhen(blockId: string, showWhen?: StepTransitionCondition): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block) return;
    if (JSON.stringify(block.props.showWhen ?? null) === JSON.stringify(showWhen ?? null)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `showWhen:${blockId}`,
      operations: [showWhen ? { op: 'setShowWhen', showWhen } : { op: 'setShowWhen' }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockShowWhen(document.blocks, blockId, showWhen),
      }),
      status: showWhen
        ? authoringText('Visibility rule updated')
        : authoringText('Visibility rule removed'),
    });
  }

  /**
   * One emphasis key at a time, merged against the live document.
   *
   * Every §4.3 ring control used to spread the emphasis it was rendered with, so
   * two edits in the same render lost the first: setting Line then Glow shipped
   * only Glow. The base has to be read at write time.
   */
  patchStepEmphasis(blockId: string, patch: StepEmphasisPatch): void {
    const current = findBlockById(this.documentState.blocks, blockId)?.props.emphasis;
    const next: StepEmphasis = { ...current };
    for (const key of ['backdrop', 'targetOutline', 'viewportFocus'] as const) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) delete next[key];
      // Merged, not replaced: the caller sends only the property it changed.
      else Object.assign(next, { [key]: { ...current?.[key], ...value } });
      // Turning a section on sends the whole object, so the merge cannot leave a
      // required field unset — only a patch on something already there gets here.
    }
    this.setStepEmphasis(blockId, next);
  }

  /** Backdrop, target outline and viewport focus for one step. */
  setStepEmphasis(blockId: string, emphasis?: StepEmphasis): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block) return;
    const next = emphasis && Object.values(emphasis).some(Boolean) ? emphasis : undefined;
    if (JSON.stringify(block.props.emphasis ?? null) === JSON.stringify(next ?? null)) return;
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `emphasis:${blockId}`,
      operations: [next ? { op: 'setEmphasis', emphasis: next } : { op: 'setEmphasis' }],
      reduce: (document) => ({
        ...document,
        blocks: setBlockEmphasis(document.blocks, blockId, next),
      }),
      status: authoringText('Emphasis updated'),
    });
  }

  setActionUrl(blockId: string, url: string): void {
    this.commitActionUrl(blockId, url);
  }

  setActionNavigationBehavior(
    blockId: string,
    navigationBehavior: OpenPageNavigationBehavior,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    const action = block?.props.action;
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    if (action?.type !== 'openPage' || action.navigationBehavior === navigationBehavior) return;
    const nextAction = { ...action, navigationBehavior };
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockAction(this.documentState.blocks, blockId, nextAction),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setAction', action: nextAction }]);
    this.setStatus(
      navigationBehavior === 'continue'
        ? authoringText('Tour will continue after same-site navigation')
        : authoringText('Tour will keep this step after navigation'),
    );
  }

  transformEditableBlock(blockId: string, type: EditableBlockType): void {
    this.transformBlock(blockId, type);
  }

  applyStepContentCommand(
    stepBlockId: string,
    childBlockId: string,
    type: EditableBlockType,
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    if (!currentBlocks.some((block) => block.id === childBlockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: transformBlocks(
        this.documentState.blocks,
        childBlockId,
        type,
        slashCommandDefaultContent(type),
      ),
    };
    this.selectedBlockId = childBlockId;
    this.afterDocumentMutation();
    this.focusInsertedBlock(childBlockId);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Changed line to ${blockTypeLabel(type).toLowerCase()}`);
    this.sendPreviewPatch(childBlockId, [{ op: 'transformBlock', type }]);
  }

  commitDocumentTitle(value: string): void {
    const title = value.trim() || 'Untitled experience';
    const currentTitle = localizedAuthoringDocument(this.documentState, this.contentLocale).title;
    if (currentTitle === title) return;
    this.recordChange();
    this.documentState = setAuthoringLocalizedTitle(this.documentState, this.contentLocale, title);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Title updated'));
    this.sendPreviewPatch(
      this.documentState.id,
      [{ op: 'setDocumentTitle', title }],
      this.contentLocale,
    );
  }

  setDocumentAppearance(appearance: ExperienceAppearance): void {
    const current = resolveExperienceAppearance(
      this.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE,
    );
    const next = resolveExperienceAppearance(appearance);
    if (
      current.preset === next.preset &&
      current.density === next.density &&
      current.width === next.width &&
      current.colorMode === next.colorMode &&
      current.displayTargetOutline === next.displayTargetOutline
    ) {
      return;
    }
    const previewContextId = this.selectedTourStep()?.id ?? this.documentState.id;
    this.commitCoordinatedMutation({
      blockId: previewContextId,
      coalescingKey: `experience:${this.documentState.id}`,
      operations: [{ op: 'setAppearance', appearance: structuredClone(next) }],
      reduce: (document) => ({ ...document, appearance: structuredClone(next) }),
      status: authoringText('Appearance updated'),
    });
  }

  /**
   * The §5 gesture: dropping the card decides the form. Announcements become a
   * banner at the top edge, a slide-in at the other edges, a modal in the middle;
   * checklists become a drawer at any edge and float in the middle. A type that
   * does not answer the gesture ignores the drop.
   */
  setSurfaceFormFromDrop(point: DropPoint): void {
    const definition = registeredExperienceDefinition(this.documentState.type);
    if (!definition?.formFromRegion) return;
    const form = definition.formFromRegion(dropRegion(point));
    if (this.documentState.surfaceForm === form) return;
    this.recordChange();
    this.documentState = this.normalizeDocument({ ...this.documentState, surfaceForm: form });
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(SURFACE_FORM_STATUS[form]);
    this.emit();
  }

  setExperienceSurfaceForm(form: ExperienceSurfaceForm): void {
    const definition = registeredExperienceDefinition(this.documentState.type);
    if (!definition?.formFromRegion) return;
    const allowed =
      this.documentState.type === 'announcement'
        ? form === 'modal' || form === 'banner' || form === 'slideIn'
        : this.documentState.type === 'checklist' && (form === 'drawer' || form === 'floating');
    if (!allowed || this.documentState.surfaceForm === form) return;
    const nextDocument = this.normalizeDocument({ ...this.documentState, surfaceForm: form });
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: `surface-form:${this.documentState.id}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: () => nextDocument,
      scope: 'behavior',
      status: SURFACE_FORM_STATUS[form],
    });
  }

  setExperienceBehavior(experience: ExperienceBehavior): void {
    if (experience.type !== this.documentState.type) return;
    if (JSON.stringify(this.documentState.experience) === JSON.stringify(experience)) return;
    const nextDocument = this.normalizeDocument({
      ...this.documentState,
      experience: structuredClone(experience),
    });
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: `experience-behavior:${this.documentState.id}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: () => nextDocument,
      scope: 'behavior',
      status: authoringText('Experience behavior updated'),
    });
  }

  setTourCompletionBehavior(completion: TourCompletionBehavior | undefined): void {
    if (!this.deliveryCapabilities.has('flow.v1')) return;
    const nextDocument = completion
      ? { ...this.documentState, completion: structuredClone(completion) }
      : (Object.fromEntries(
          Object.entries(this.documentState).filter(([key]) => key !== 'completion'),
        ) as LodariqDocument);
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: `completion:${this.documentState.id}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: () => nextDocument,
      scope: 'behavior',
      status: authoringText('Completion behavior updated'),
    });
  }

  setBlockPresentation(
    blockId: string,
    patch: {
      motion?: TourMotionPresentation | undefined;
      responsive?: ResponsiveStepPresentation | undefined;
      spotlight?: SpotlightPresentation | undefined;
      composition?: StructuredCompositionPresentation | undefined;
      accessibilityName?: string | undefined;
    },
  ): void {
    if (!this.deliveryCapabilities.has('presentation.v1')) return;
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !blockSupportsAuthoringCapability(block, 'presentation')) return;
    const props = { ...block.props, ...patch };
    const nextDocument = {
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, blockId, props),
    };
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `presentation:${blockId}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: (document) => ({
        ...document,
        blocks: updateBlockProps(document.blocks, blockId, props),
      }),
      scope: 'appearance',
      status: authoringText('Step presentation updated'),
    });
  }

  setTourStepPresentation(
    stepId: string,
    patch: {
      motion?: TourMotionPresentation | undefined;
      responsive?: ResponsiveStepPresentation | undefined;
      spotlight?: SpotlightPresentation | undefined;
      composition?: StructuredCompositionPresentation | undefined;
      accessibilityName?: string | undefined;
    },
  ): void {
    this.setBlockPresentation(stepId, patch);
  }

  setBlockEntrySequence(blockId: string, entrySequence: StepChoreography | undefined): void {
    if (!this.deliveryCapabilities.has('choreography.v1')) return;
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !blockSupportsAuthoringCapability(block, 'presentation')) return;
    const props = { ...block.props, entrySequence };
    const nextDocument = {
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, blockId, props),
    };
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `entry-sequence:${blockId}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: (document) => ({
        ...document,
        blocks: updateBlockProps(document.blocks, blockId, props),
      }),
      scope: 'behavior',
      status: authoringText('Automatic step sequence updated'),
    });
  }

  setTourStepEntrySequence(stepId: string, entrySequence: StepChoreography | undefined): void {
    this.setBlockEntrySequence(stepId, entrySequence);
  }

  /** Where the journey continues when this step hands off (§4.3 `Continues in`). */
  setStepHandoff(blockId: string, handoff: JourneyHandoff | undefined): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block) return;
    if (JSON.stringify(block.props.handoff ?? null) === JSON.stringify(handoff ?? null)) return;
    const props = { ...block.props, handoff };
    const nextDocument = {
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, blockId, props),
    };
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `handoff:${blockId}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: (document) => ({
        ...document,
        blocks: updateBlockProps(document.blocks, blockId, props),
      }),
      scope: 'behavior',
      status: authoringText('Handoff updated'),
    });
  }

  setMediaPresentation(blockId: string, media: MediaPresentation | undefined): void {
    if (!this.deliveryCapabilities.has('media-assets.v1')) return;
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'media') return;
    const props = { ...block.props, media };
    const nextDocument = {
      ...this.documentState,
      blocks: updateBlockProps(this.documentState.blocks, blockId, props),
    };
    this.commitCoordinatedMutation({
      blockId,
      coalescingKey: `media:${blockId}`,
      operations: [{ op: 'replaceDocument', document: nextDocument }],
      reduce: (document) => ({
        ...document,
        blocks: updateBlockProps(document.blocks, blockId, props),
      }),
      scope: 'content',
      status: authoringText('Media settings updated'),
    });
  }

  setMediaLocaleVariant(
    blockId: string,
    variant: LocalizedMediaVariant,
    fallbackLocale?: string,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    const media = block?.props.media;
    if (!media || !variant.assetId || !variant.accessibilityName.trim()) return;
    const localeVariants = [
      ...(media.localeVariants ?? []).filter((candidate) => candidate.locale !== variant.locale),
      structuredClone(variant),
    ];
    this.setMediaPresentation(blockId, {
      ...structuredClone(media),
      localeVariants,
      ...(fallbackLocale ? { fallbackLocale } : {}),
    });
  }

  setStructuredCompositionAccessibilityName(blockId: string, accessibilityName: string): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !STRUCTURED_COMPOSITION_BLOCK_TYPES.has(block.type)) return;
    this.setBlockPresentation(blockId, {
      composition: block.props.composition,
      accessibilityName: accessibilityName.trim().slice(0, 300) || undefined,
    });
  }

  setStructuredCompositionPresentation(
    blockId: string,
    composition: StructuredCompositionPresentation,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || block.type !== composition.kind) return;
    this.setBlockPresentation(blockId, {
      composition,
      accessibilityName: block.props.accessibilityName,
    });
  }
}

/** One line per form, so the gesture always says what it just decided. */
const SURFACE_FORM_STATUS: Record<ExperienceSurfaceForm, string> = {
  modal: authoringText('Shows as a centred modal'),
  banner: authoringText('Shows as a banner across the top'),
  slideIn: authoringText('Slides in from the edge'),
  drawer: authoringText('Shows as a drawer at the edge'),
  floating: authoringText('Floats over the page'),
  inline: authoringText('Shows inline'),
};
