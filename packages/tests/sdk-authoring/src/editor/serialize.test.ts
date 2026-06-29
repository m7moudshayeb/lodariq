import { describe, expect, it } from 'vitest';
import type { TalmehDocument } from '@talmeh/schema';
import {
  createTalmehEditor,
  fromBlockJson,
  migrate,
  toBlockJson,
} from '@talmeh/sdk-authoring/editor';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';

describe('editor document migrations (PRD §16.1)', () => {
  it('serializes canonical blocks to Lexical JSON without stable ID loss', () => {
    const fixture = tourFixture as TalmehDocument;
    const lexicalState = fromBlockJson(fixture.blocks);

    expect(JSON.stringify(lexicalState)).toContain('talmehBlockId');
    expect(JSON.stringify(lexicalState)).not.toContain('"key"');
    expect(lexicalState.root.children[0]).toMatchObject({
      type: 'talmeh-block',
      talmehBlockId: 'block_step_1',
      blockType: 'tourStep',
    });
  });

  it('deserializes Lexical JSON back to canonical blocks without stable ID loss', () => {
    const fixture = tourFixture as TalmehDocument;
    const editor = createTalmehEditor();
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

  it('upgrades an older fixture version without changing stable IDs', () => {
    const legacy = {
      ...(tourFixture as TalmehDocument),
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
