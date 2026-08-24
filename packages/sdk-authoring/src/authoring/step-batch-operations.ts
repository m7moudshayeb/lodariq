import type { LodariqBlock, LodariqDocument, StepChoreography } from '@lodariq/schema';
import { documentWithBlocks, duplicateTopLevelBlock, renumberTourSteps } from './document-ops';

export type TourStepBatchDirection = 'up' | 'down';
export type TourStepBatchPlacement = 'top' | 'right' | 'bottom' | 'left';
export type TourStepBatchTimeoutPolicy = Exclude<StepChoreography['onTimeout'], 'goToStep'>;

export function applyTourStepBatchPlacement(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
  placement: TourStepBatchPlacement,
): LodariqDocument {
  return mapSelectedSteps(document, stepIds, (step) => ({
    ...step,
    children: mapTree(step.children, (block) =>
      block.type === 'tooltip' ? { ...block, props: { ...block.props, placement } } : block,
    ),
  }));
}

export function applyTourStepBatchTimeoutPolicy(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
  onTimeout: TourStepBatchTimeoutPolicy,
): LodariqDocument {
  return mapSelectedSteps(document, stepIds, (step) => ({
    ...step,
    children: mapTree(step.children, (block) => {
      const action = block.props.action;
      if (action?.type !== 'runSequence') return block;
      return {
        ...block,
        props: {
          ...block.props,
          action: { ...action, sequence: sequenceWithTimeoutPolicy(action.sequence, onTimeout) },
        },
      };
    }),
  }));
}

function sequenceWithTimeoutPolicy(
  sequence: StepChoreography,
  onTimeout: TourStepBatchTimeoutPolicy,
): StepChoreography {
  return {
    trigger: structuredClone(sequence.trigger),
    waitFor: structuredClone(sequence.waitFor),
    transition: structuredClone(sequence.transition),
    timeoutMs: sequence.timeoutMs,
    onTimeout,
  };
}

export function duplicateSelectedTourSteps(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
): LodariqDocument {
  let blocks = document.blocks;
  for (const block of document.blocks) {
    if (block.type !== 'tourStep' || !stepIds.has(block.id)) continue;
    blocks = duplicateTopLevelBlock(blocks, block.id) ?? blocks;
  }
  return { ...document, blocks: renumberTourSteps(blocks) };
}

export function moveSelectedTourSteps(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
  direction: TourStepBatchDirection,
): LodariqDocument {
  const blocks = [...document.blocks];
  if (direction === 'up') {
    for (let index = 1; index < blocks.length; index += 1) {
      if (stepIds.has(blocks[index]!.id) && !stepIds.has(blocks[index - 1]!.id)) {
        [blocks[index - 1], blocks[index]] = [blocks[index]!, blocks[index - 1]!];
      }
    }
  } else {
    for (let index = blocks.length - 2; index >= 0; index -= 1) {
      if (stepIds.has(blocks[index]!.id) && !stepIds.has(blocks[index + 1]!.id)) {
        [blocks[index], blocks[index + 1]] = [blocks[index + 1]!, blocks[index]!];
      }
    }
  }
  return { ...document, blocks: renumberTourSteps(blocks) };
}

export function deleteSelectedTourSteps(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
): LodariqDocument {
  const blocks = renumberTourSteps(document.blocks.filter((block) => !stepIds.has(block.id)));
  return documentWithBlocks(document, blocks);
}

function mapSelectedSteps(
  document: LodariqDocument,
  stepIds: ReadonlySet<string>,
  update: (step: LodariqBlock) => LodariqBlock,
): LodariqDocument {
  return {
    ...document,
    blocks: document.blocks.map((block) =>
      block.type === 'tourStep' && stepIds.has(block.id) ? update(block) : block,
    ),
  };
}

function mapTree(
  blocks: readonly LodariqBlock[],
  update: (block: LodariqBlock) => LodariqBlock,
): LodariqBlock[] {
  return blocks.map((block) => {
    const withChildren = { ...block, children: mapTree(block.children, update) };
    return update(withChildren);
  });
}
