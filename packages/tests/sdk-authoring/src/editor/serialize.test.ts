import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import {
  createLodariqEditor,
  fromBlockJson,
  migrate,
  toBlockJson,
} from '@lodariq/sdk-authoring/editor';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('editor document migrations (PRD §16.1)', () => {
  it('serializes canonical blocks to Lexical JSON without stable ID loss', () => {
    const fixture = tourFixture as LodariqDocument;
    const lexicalState = fromBlockJson(fixture.blocks);

    expect(JSON.stringify(lexicalState)).toContain('lodariqBlockId');
    expect(JSON.stringify(lexicalState)).not.toContain('"key"');
    expect(lexicalState.root.children[0]).toMatchObject({
      type: 'lodariq-block',
      lodariqBlockId: 'block_step_1',
      blockType: 'tourStep',
    });
  });

  it('deserializes Lexical JSON back to canonical blocks without stable ID loss', () => {
    const fixture = tourFixture as LodariqDocument;
    const editor = createLodariqEditor();
    const parsed = editor.parseEditorState(JSON.stringify(fromBlockJson(fixture.blocks))).toJSON();
    const blocks = toBlockJson(parsed as ReturnType<typeof fromBlockJson>);

    expect(blocks.map((block) => block.id)).toEqual(fixture.blocks.map((block) => block.id));
    expect(blocks[0]?.children[0]?.props.targetId).toBe('target_new_project');
    expect(blocks[0]?.children[0]?.children.map((block) => block.id)).toEqual([
      'block_heading_1',
      'block_paragraph_1',
      'block_button_1',
    ]);
  });

  it('round-trips media placeholder blocks through the authoring editor boundary', () => {
    const blocks = [
      {
        id: 'block_media_1',
        type: 'media',
        content: 'Media placeholder',
        props: {},
        status: 'incomplete',
        children: [],
      },
    ] as LodariqDocument['blocks'];
    const editor = createLodariqEditor();
    const parsed = editor.parseEditorState(JSON.stringify(fromBlockJson(blocks))).toJSON();

    expect(toBlockJson(parsed as ReturnType<typeof fromBlockJson>)).toEqual(blocks);
  });

  it('round-trips structured inline text runs through the Lexical boundary', () => {
    const blocks = [
      {
        id: 'block_rich_text_1',
        type: 'paragraph',
        content: 'Launch in 3 days',
        contentRuns: [
          { text: 'Launch in ' },
          {
            text: '3 days',
            marks: ['bold'],
            fontSizePx: 24,
            color: '#006b58',
            highlightColor: '#fff0a8',
            link: '/billing',
          },
        ],
        props: {},
        children: [],
      },
    ] as LodariqDocument['blocks'];
    const editor = createLodariqEditor();
    const parsed = editor.parseEditorState(JSON.stringify(fromBlockJson(blocks))).toJSON();

    expect(toBlockJson(parsed as ReturnType<typeof fromBlockJson>)).toEqual(blocks);
  });

  it('upgrades an older fixture version without changing stable IDs', () => {
    const legacy = {
      ...(tourFixture as LodariqDocument),
      schemaVersion: '0.9.0',
    };

    const migrated = migrate(legacy);

    expect(migrated.schemaVersion).toBe('1.0.0');
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.blocks.map((block) => block.id)).toEqual(
      legacy.blocks.map((block) => block.id),
    );
    expect(migrated.targets.map((target) => target.id)).toEqual(
      legacy.targets.map((target) => target.id),
    );
  });
});
