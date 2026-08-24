import { describe, expect, it } from 'vitest';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import fixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { copySuggestionsFromDocumentDrift } from '@lodariq/sdk-authoring';

function firstTextBlock(blocks: LodariqBlock[]): LodariqBlock | null {
  for (const block of blocks) {
    if (block.content) return block;
    const child = firstTextBlock(block.children);
    if (child) return child;
  }
  return null;
}

describe('change-aware copy suggestions', () => {
  it('creates a bounded before/after patch without mutating the source documents', () => {
    const before = structuredClone(fixture) as LodariqDocument;
    const after = structuredClone(before);
    const block = firstTextBlock(after.blocks);
    if (!block || !block.content) throw new Error('Fixture did not contain text');
    const previous = block.content;
    block.content = `${previous} Updated.`;

    const suggestions = copySuggestionsFromDocumentDrift({
      before,
      after,
      now: '2026-08-22T00:00:00.000Z',
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      blockId: block.id,
      before: previous,
      after: `${previous} Updated.`,
      confidence: 85,
      status: 'pending',
    });
    expect(before).not.toEqual(after);
  });
});
