import { describe, expect, it } from 'vitest';
import {
  createLodariqEditor,
  LODARIQ_MVP_BLOCK_TYPES,
  type SerializedLodariqBlockNode,
} from '@lodariq/sdk-authoring/editor';

function serializedBlock(type: (typeof LODARIQ_MVP_BLOCK_TYPES)[number]): SerializedLodariqBlockNode {
  return {
    type: 'lodariq-block',
    version: 1,
    lodariqBlockId: `block_${type}`,
    blockType: type,
    props: {},
    children: [],
    direction: null,
    format: '',
    indent: 0,
  };
}

describe('Lodariq Lexical nodes (PRD §16.1)', () => {
  it('exports a registered MVP node shape for every pre-phase block type', () => {
    expect(LODARIQ_MVP_BLOCK_TYPES).toEqual([
      'paragraph',
      'heading',
      'media',
      'tourStep',
      'tooltip',
      'button',
      'targetChip',
      'validationBadge',
    ]);
    const editor = createLodariqEditor();
    for (const type of LODARIQ_MVP_BLOCK_TYPES) {
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
        type: 'lodariq-block',
        lodariqBlockId: `block_${type}`,
        blockType: type,
      });
    }
  });

  it('round-trips Lodariq block IDs without exposing Lexical node keys', () => {
    const editor = createLodariqEditor();
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
      type: 'lodariq-block',
      lodariqBlockId: 'block_tourStep',
      blockType: 'tourStep',
    });
    expect(JSON.stringify(json)).not.toContain('"key"');
  });
});
