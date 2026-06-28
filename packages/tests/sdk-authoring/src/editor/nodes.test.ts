import { describe, expect, it } from 'vitest';
import {
  createTalmehEditor,
  TALMEH_MVP_BLOCK_TYPES,
  type SerializedTalmehBlockNode,
} from '@talmeh/sdk-authoring/editor';

function serializedBlock(type: (typeof TALMEH_MVP_BLOCK_TYPES)[number]): SerializedTalmehBlockNode {
  return {
    type: 'talmeh-block',
    version: 1,
    talmehBlockId: `block_${type}`,
    blockType: type,
    props: {},
    children: [],
    direction: null,
    format: '',
    indent: 0,
  };
}

describe('Talmeh Lexical nodes (PRD §16.1)', () => {
  it('exports a registered MVP node shape for every pre-phase block type', () => {
    expect(TALMEH_MVP_BLOCK_TYPES).toEqual([
      'paragraph',
      'heading',
      'tourStep',
      'tooltip',
      'button',
      'targetChip',
      'validationBadge',
    ]);
    const editor = createTalmehEditor();
    for (const type of TALMEH_MVP_BLOCK_TYPES) {
      const state = editor.parseEditorState(
        JSON.stringify({
          root: {
            type: 'root',
            version: 1,
            children: [serializedBlock(type)],
            direction: null,
            format: '',
            indent: 0,
          },
        }),
      );
      expect(state.toJSON().root.children[0]).toMatchObject({
        type: 'talmeh-block',
        talmehBlockId: `block_${type}`,
        blockType: type,
      });
    }
  });

  it('round-trips Talmeh block IDs without exposing Lexical node keys', () => {
    const editor = createTalmehEditor();
    const state = editor.parseEditorState(
      JSON.stringify({
        root: {
          type: 'root',
          version: 1,
          children: [serializedBlock('tourStep')],
          direction: null,
          format: '',
          indent: 0,
        },
      }),
    );

    const json = state.toJSON();

    expect(json.root.children[0]).toMatchObject({
      type: 'talmeh-block',
      talmehBlockId: 'block_tourStep',
      blockType: 'tourStep',
    });
    expect(JSON.stringify(json)).not.toContain('"key"');
  });
});
