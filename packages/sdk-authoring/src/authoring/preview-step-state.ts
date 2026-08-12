import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';

export function findContainingTourStepId(
  blocks: LodariqBlock[],
  blockId: string,
  currentStepId?: string,
): string | undefined {
  for (const block of blocks) {
    const stepId = block.type === 'tourStep' ? block.id : currentStepId;
    if (block.id === blockId) return stepId;
    const childStepId = findContainingTourStepId(block.children, blockId, stepId);
    if (childStepId) return childStepId;
  }
  return undefined;
}

export function resolvePreviewStepId(
  document: LodariqDocument | null,
  pendingBlockId: string | null,
  currentStepId: string | null,
): string | undefined {
  if (!document) return currentStepId ?? undefined;
  const pendingStepId = pendingBlockId
    ? findContainingTourStepId(document.blocks, pendingBlockId)
    : undefined;
  return pendingStepId ?? currentStepId ?? undefined;
}
