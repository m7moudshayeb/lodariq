import {
  createCopySuggestionFromDrift,
  type ChangeAwareCopySuggestion,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';

export function copySuggestionsFromDocumentDrift(input: {
  before: LodariqDocument;
  after: LodariqDocument;
  locale?: string;
  now?: string;
}): ChangeAwareCopySuggestion[] {
  const beforeById = new Map<string, LodariqBlock>();
  indexBlocks(input.before.blocks, beforeById);
  const suggestions: ChangeAwareCopySuggestion[] = [];
  for (const block of flattenBlocks(input.after.blocks)) {
    const previous = beforeById.get(block.id);
    if (!previous || typeof previous.content !== 'string' || typeof block.content !== 'string') {
      continue;
    }
    if (!previous.content.trim() || previous.content === block.content) continue;
    suggestions.push(
      createCopySuggestionFromDrift({
        id: `copy_${Date.now().toString(36)}_${suggestions.length}_${block.id}`.slice(0, 160),
        driftRunId: `drift_${input.after.id}`,
        checkId: `copy_check_${input.after.id}`,
        documentId: input.after.id,
        blockId: block.id,
        path: `document.blocks.${block.id}.content`,
        ...(input.locale ? { locale: input.locale } : {}),
        before: previous.content,
        after: block.content,
        confidence: 85,
        createdAt: input.now ?? new Date().toISOString(),
      }),
    );
  }
  return suggestions.slice(0, 50);
}

function indexBlocks(blocks: readonly LodariqBlock[], index: Map<string, LodariqBlock>): void {
  for (const block of flattenBlocks(blocks)) index.set(block.id, block);
}

function flattenBlocks(blocks: readonly LodariqBlock[]): LodariqBlock[] {
  const result: LodariqBlock[] = [];
  for (const block of blocks) {
    result.push(block, ...flattenBlocks(block.children));
  }
  return result;
}
