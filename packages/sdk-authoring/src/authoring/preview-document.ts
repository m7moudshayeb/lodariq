import {
  isPresentationAnchor,
  type BlockActionProps,
  type LodariqBlock,
  type LodariqDocument,
  type PreviewPatchOperation,
} from '@lodariq/schema';
import type { InlinePreviewControlContext } from './inline-preview-editor';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  insertBlockInsideTourStep,
  replaceRichContentInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  moveTopLevelBlock,
  renumberTourSteps,
  removeStepChildBlock,
  removeTargetFromBlocks,
  removeTopLevelBlock,
  reorderStepChildBlock,
  reorderTopLevelBlock,
  setBlockAction,
  setBlockEmphasis,
  setBlockLayout,
  setBlockShowWhen,
  setBlockTeaches,
  setBlockPlacement,
  setBlockPresentationAnchor,
  setBlockTextStyle,
  setBlockVariant,
  setButtonStyle,
  setTooltipLayout,
  setTooltipStyle,
  transformBlocks,
  updateBlockContent,
  updateBlockContentRuns,
} from './document-ops';
import { findContainingTourStepId } from './preview-step-state';
import {
  isDefaultDocumentLocale,
  setAuthoringLocalizedBlockContent,
  setAuthoringLocalizedTitle,
} from './document-localization';

export function applyPreviewPatch(
  document: LodariqDocument,
  blockId: string,
  ops: PreviewPatchOperation[],
  locale?: string,
): LodariqDocument {
  let next = structuredClone(document);
  for (const op of ops) {
    if (op.op === 'setDocumentTitle') {
      const title = op.title.trim() || 'Untitled experience';
      next = locale ? setAuthoringLocalizedTitle(next, locale, title) : { ...next, title };
    }
    if (op.op === 'setAppearance') {
      next = { ...next, appearance: structuredClone(op.appearance) };
    }
    if (op.op === 'insertBlock') {
      const inserted = op.anchorBlockId
        ? insertTopLevelBlock(
            next.blocks,
            op.anchorBlockId,
            structuredClone(op.block),
            op.position ?? 'after',
          )
        : [...next.blocks, structuredClone(op.block)];
      if (inserted) next = { ...next, blocks: renumberTourSteps(inserted) };
    }
    if (op.op === 'insertBlocks') {
      next = {
        ...next,
        blocks: renumberTourSteps([...next.blocks, ...structuredClone(op.blocks)]),
      };
    }
    if (op.op === 'insertStepContent') {
      const blocks = insertBlockInsideTourStep(
        next.blocks,
        op.stepBlockId,
        structuredClone(op.block),
        op.index,
      );
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'replaceStepRichContent') {
      const blocks = replaceRichContentInsideTourStep(
        next.blocks,
        op.stepBlockId,
        structuredClone(op.blocks),
      );
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'updateContent') {
      next =
        locale && !isDefaultDocumentLocale(next, locale)
          ? setAuthoringLocalizedBlockContent(next, locale, blockId, op.content)
          : { ...next, blocks: updateBlockContent(next.blocks, blockId, op.content) };
    }
    if (op.op === 'updateContentRuns') {
      next =
        locale && !isDefaultDocumentLocale(next, locale)
          ? setAuthoringLocalizedBlockContent(next, locale, blockId, op.content, op.contentRuns)
          : {
              ...next,
              blocks: updateBlockContentRuns(next.blocks, blockId, op.content, op.contentRuns),
            };
    }
    if (op.op === 'setTextStyle') {
      next = { ...next, blocks: setBlockTextStyle(next.blocks, blockId, op.textStyle) };
    }
    if (op.op === 'setBlockLayout') {
      next = { ...next, blocks: setBlockLayout(next.blocks, blockId, op.blockLayout) };
    }
    if (op.op === 'setButtonStyle') {
      next = { ...next, blocks: setButtonStyle(next.blocks, blockId, op.buttonStyle) };
    }
    if (op.op === 'setTooltipLayout') {
      next = { ...next, blocks: setTooltipLayout(next.blocks, blockId, op.tooltipLayout) };
    }
    if (op.op === 'setTooltipStyle') {
      next = { ...next, blocks: setTooltipStyle(next.blocks, blockId, op.tooltipStyle) };
    }
    if (op.op === 'moveBlock') {
      const blocks = moveTopLevelBlock(next.blocks, blockId, op.direction);
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'moveStepContent') {
      const blocks = moveStepChildBlock(next.blocks, op.stepBlockId, blockId, op.direction);
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'reorderBlock') {
      const blocks = reorderTopLevelBlock(
        next.blocks,
        blockId,
        op.beforeBlockId,
        op.position ?? 'before',
      );
      if (blocks) next = { ...next, blocks: renumberTourSteps(blocks) };
    }
    if (op.op === 'reorderStepContent') {
      const blocks = reorderStepChildBlock(
        next.blocks,
        op.stepBlockId,
        blockId,
        op.targetChildBlockId,
        op.position ?? 'before',
      );
      if (blocks) next = { ...next, blocks };
    }
    if (op.op === 'removeBlock') {
      const blocks = op.stepBlockId
        ? removeStepChildBlock(next.blocks, op.stepBlockId, blockId)
        : removeTopLevelBlock(next.blocks, blockId);
      if (blocks) {
        next = {
          ...next,
          targets: next.targets.filter((target) => blocksReferenceTarget(blocks, target.id)),
          blocks: renumberTourSteps(blocks),
        };
      }
    }
    if (op.op === 'transformBlock') {
      next = { ...next, blocks: transformBlocks(next.blocks, blockId, op.type) };
    }
    if (op.op === 'setAction') {
      next = { ...next, blocks: setBlockAction(next.blocks, blockId, op.action ?? null) };
    }
    if (op.op === 'setVariant') {
      next = { ...next, blocks: setBlockVariant(next.blocks, blockId, op.variant) };
    }
    if (op.op === 'setPlacement') {
      next = {
        ...next,
        blocks: setBlockPlacement(next.blocks, blockId, op.placement, {
          ...(op.align ? { align: op.align } : {}),
          ...(op.offsetPx === undefined ? {} : { offsetPx: op.offsetPx }),
        }),
      };
    }
    /*
     * The three step-level facts. They were declared on the bridge and reduced
     * optimistically in the frame, but never applied here — so a visibility
     * rule, an emphasis or a teaches event showed in the inspector, replayed
     * once, and was gone on the next load.
     */
    if (op.op === 'setShowWhen') {
      next = { ...next, blocks: setBlockShowWhen(next.blocks, blockId, op.showWhen) };
    }
    if (op.op === 'setEmphasis') {
      next = { ...next, blocks: setBlockEmphasis(next.blocks, blockId, op.emphasis) };
    }
    if (op.op === 'setTeaches') {
      next = { ...next, blocks: setBlockTeaches(next.blocks, blockId, op.eventName) };
    }
    if (op.op === 'setPresentationAnchor') {
      const presentationAnchor = op.presentationAnchor;
      if (!presentationAnchor || isPresentationAnchor(presentationAnchor)) {
        next = {
          ...next,
          blocks: setBlockPresentationAnchor(next.blocks, blockId, presentationAnchor),
        };
      }
    }
    if (op.op === 'attachTarget') {
      const previousTarget = next.targets.find((target) => target.id === op.targetId);
      const label =
        op.identity?.display.authorLabel ??
        op.fingerprint.accessibleName ??
        op.fingerprint.stableAttributes['data-lodariq-id'] ??
        op.fingerprint.tagName;
      next = {
        ...next,
        targets: [
          ...next.targets.filter((target) => target.id !== op.targetId),
          {
            id: op.targetId,
            fingerprint: structuredClone(op.fingerprint),
            ...(previousTarget?.lifecycle
              ? { lifecycle: structuredClone(previousTarget.lifecycle) }
              : {}),
            ...(op.identity
              ? {
                  identity: {
                    ...structuredClone(op.identity),
                    targetId: op.targetId,
                  },
                }
              : {}),
          },
        ],
        blocks: attachTargetToBlocks(next.blocks, blockId, op.targetId, label),
      };
    }
    if (op.op === 'updateTargetEvidence') {
      next = {
        ...next,
        targets: next.targets.map((target) =>
          target.id === op.targetId
            ? {
                ...target,
                fingerprint: structuredClone(op.fingerprint),
                identity: {
                  ...structuredClone(op.identity),
                  targetId: op.targetId,
                },
              }
            : target,
        ),
      };
    }
    if (op.op === 'removeTarget') {
      const blocks = removeTargetFromBlocks(next.blocks, blockId, op.targetId);
      next = {
        ...next,
        targets: blocksReferenceTarget(blocks, op.targetId)
          ? next.targets
          : next.targets.filter((target) => target.id !== op.targetId),
        blocks,
      };
    }
    if (op.op === 'setTargetLifecycle') {
      next = {
        ...next,
        targets: next.targets.map((target) => {
          if (target.id !== op.targetId) return target;
          const lifecycle = op.lifecycle ? structuredClone(op.lifecycle) : undefined;
          return lifecycle ? { ...target, lifecycle } : { ...target, lifecycle: undefined };
        }),
      };
    }
    if (op.op === 'replaceDocument') {
      next = structuredClone(op.document);
    }
  }
  return next;
}

export function inlinePreviewControlContext(
  document: LodariqDocument,
  bodyBlockId: string,
): InlinePreviewControlContext | null {
  const stepId = findContainingTourStepId(document.blocks, bodyBlockId);
  const step = document.blocks.find((block) => block.id === stepId && block.type === 'tourStep');
  const tooltip = step?.children.find((block) => block.type === 'tooltip');
  if (!step || !tooltip) return null;
  const actionBlock = firstInlineActionBlock(tooltip.children);
  const actionType = inlineActionType(actionBlock?.props.action?.type);
  return {
    stepId: step.id,
    tooltipBlockId: tooltip.id,
    placement: tooltip.props.placement ?? 'bottom',
    ...(actionBlock ? { actionBlockId: actionBlock.id, actionType } : {}),
  };
}

function firstInlineActionBlock(blocks: LodariqBlock[]): LodariqBlock | null {
  for (const block of blocks) {
    if (block.type === 'button' || block.type === 'link') return block;
    const childAction = firstInlineActionBlock(block.children);
    if (childAction) return childAction;
  }
  return null;
}

function inlineActionType(
  value: BlockActionProps['type'] | undefined,
): NonNullable<InlinePreviewControlContext['actionType']> {
  if (
    value === 'next' ||
    value === 'back' ||
    value === 'complete' ||
    value === 'dismiss' ||
    value === 'clickTarget' ||
    value === 'openPage'
  ) {
    return value;
  }
  return '';
}
