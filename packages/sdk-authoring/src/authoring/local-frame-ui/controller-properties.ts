import { ControllerDragDropFeature } from './controller-drag-drop';
import { authoringText } from '../../i18n';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  resolveExperienceAppearance,
  sanitizeTooltipLayoutProps,
  sanitizeTooltipStyleProps,
  type BlockLayoutProps,
  type ButtonStyleProps,
  type PreviewPatchOperation,
  type LodariqBlock,
  type OpenPageNavigationBehavior,
  type ExperienceAppearance,
  type InlineTextRun,
  type TextStyleProps,
  type TooltipLayoutProps,
  type TooltipStyleProps,
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
  type EditableBlockType,
  type TooltipPlacement,
} from '../document-ops';
import type { EditableButtonVariant, EditableActionType } from './types';
import { blockTypeLabel, findBlockById, isEditableContentBlock } from './utils';
import { slashCommandDefaultContent } from './controller-model';
import { localizedAuthoringDocument, setAuthoringLocalizedTitle } from '../document-localization';

export abstract class ControllerPropertyFeature extends ControllerDragDropFeature {
  protected abstract afterDocumentMutation(): void;
  protected abstract commitContentRuns(
    blockId: string,
    value: string,
    contentRuns?: InlineTextRun[],
  ): void;
  protected abstract focusInsertedBlock(blockId: string): void;
  protected abstract recordChange(): void;
  protected abstract selectedTourStep(): LodariqBlock | null;
  protected abstract sendPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
  ): void;

  setButtonAction(blockId: string, actionType: EditableActionType): void {
    this.setAction(blockId, actionType);
  }

  setButtonVariant(blockId: string, variant: EditableButtonVariant): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    if (block.props.variant === variant) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockVariant(this.documentState.blocks, blockId, variant),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setVariant', variant }]);
    this.setStatus(`Button style changed to ${variant}`);
  }

  commitRichTextContent(blockId: string, value: string, contentRuns?: InlineTextRun[]): void {
    this.commitContentRuns(blockId, value, contentRuns);
  }

  setTextBlockStyle(blockId: string, patch: Partial<TextStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'heading' && block.type !== 'paragraph')) return;
    const textStyle = { ...block.props.textStyle, ...patch };
    if (JSON.stringify(block.props.textStyle ?? {}) === JSON.stringify(textStyle)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockTextStyle(this.documentState.blocks, blockId, textStyle),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setTextStyle', textStyle }]);
    this.setStatus(authoringText('Text formatting updated'));
  }

  resetTextBlockStyle(blockId: string): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'heading' && block.type !== 'paragraph')) return;
    if (!block.props.textStyle) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockTextStyle(this.documentState.blocks, blockId),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setTextStyle' }]);
    this.setStatus(authoringText('Text formatting reset to the Brand Theme'));
  }

  setContentBlockLayout(blockId: string, patch: Partial<BlockLayoutProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || !isEditableContentBlock(block)) return;
    const blockLayout = { ...block.props.blockLayout, ...patch };
    if (JSON.stringify(block.props.blockLayout ?? {}) === JSON.stringify(blockLayout)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockLayoutInTree(this.documentState.blocks, blockId, blockLayout),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setBlockLayout', blockLayout }]);
    this.setStatus(authoringText('Block layout updated'));
  }

  setActionAlignment(
    blockId: string,
    tooltipId: string,
    actionAlign: NonNullable<TooltipLayoutProps['actionAlign']>,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    const tooltip = findBlockById(this.documentState.blocks, tooltipId);
    if (!block || (block.type !== 'button' && block.type !== 'link')) return;
    if (tooltip?.type !== 'tooltip') return;

    const blockLayout = { ...block.props.blockLayout };
    delete blockLayout.align;
    const tooltipLayout = { ...tooltip.props.tooltipLayout, actionAlign };
    const blockLayoutChanged =
      JSON.stringify(block.props.blockLayout ?? {}) !== JSON.stringify(blockLayout);
    const tooltipLayoutChanged =
      JSON.stringify(tooltip.props.tooltipLayout ?? {}) !== JSON.stringify(tooltipLayout);
    if (!blockLayoutChanged && !tooltipLayoutChanged) return;

    this.recordChange();
    let blocks = this.documentState.blocks;
    if (blockLayoutChanged) {
      blocks = setBlockLayoutInTree(blocks, blockId, blockLayout);
    }
    if (tooltipLayoutChanged) {
      blocks = setTooltipLayoutInTree(blocks, tooltipId, tooltipLayout);
    }
    this.documentState = { ...this.documentState, blocks };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    if (blockLayoutChanged) {
      this.sendPreviewPatch(blockId, [{ op: 'setBlockLayout', blockLayout }]);
    }
    if (tooltipLayoutChanged) {
      this.sendPreviewPatch(tooltipId, [{ op: 'setTooltipLayout', tooltipLayout }]);
    }
    this.setStatus(authoringText('Action alignment updated'));
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
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setButtonStyleInTree(this.documentState.blocks, block.id, buttonStyle),
    };
    this.selectedBlockId = block.id;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(block.id, [{ op: 'setButtonStyle', buttonStyle }]);
    this.setStatus(authoringText('Action styling updated'));
  }

  setTooltipLayout(blockId: string, patch: Partial<TooltipLayoutProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip') return;
    const tooltipLayout = sanitizeTooltipLayoutProps({ ...block.props.tooltipLayout, ...patch });
    if (JSON.stringify(block.props.tooltipLayout ?? {}) === JSON.stringify(tooltipLayout ?? {})) {
      return;
    }
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setTooltipLayoutInTree(this.documentState.blocks, blockId, tooltipLayout),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [
      tooltipLayout ? { op: 'setTooltipLayout', tooltipLayout } : { op: 'setTooltipLayout' },
    ]);
    this.setStatus(authoringText('Popup layout updated'));
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
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setTooltipStyleInTree(this.documentState.blocks, block.id, tooltipStyle),
    };
    this.selectedBlockId = block.id;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(block.id, [
      tooltipStyle ? { op: 'setTooltipStyle', tooltipStyle } : { op: 'setTooltipStyle' },
    ]);
    this.setStatus(authoringText('Popup layout updated'));
  }

  setTooltipPlacement(blockId: string, placement: TooltipPlacement): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip' || block.props.placement === placement) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockPlacement(this.documentState.blocks, blockId, placement),
    };
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setPlacement', placement }]);
    this.setStatus(`Tooltip moved ${placement}`);
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
    this.recordChange();
    this.documentState = { ...this.documentState, appearance: structuredClone(next) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    const previewContextId = this.selectedTourStep()?.id ?? this.documentState.id;
    this.sendPreviewPatch(previewContextId, [
      { op: 'setAppearance', appearance: structuredClone(next) },
    ]);
    this.setStatus(authoringText('Appearance updated'));
  }
}
