import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, TalmehDocument, validate } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';

describe('canonical tour fixture', () => {
  it('validates against the TalmehDocument schema (PRD §16.0 acceptance)', () => {
    const result = validate(TalmehDocument, tourFixture);
    if (!result.valid) {
      throw new Error(`fixture invalid:\n${JSON.stringify(result.errors, null, 2)}`);
    }
    expect(result.valid).toBe(true);
  });

  it('is stamped with the current schema version', () => {
    expect(tourFixture.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects a document missing required fields', () => {
    const broken = { ...tourFixture, blocks: undefined };
    const result = validate(TalmehDocument, broken);
    expect(result.valid).toBe(false);
  });

  it('rejects arbitrary CSS, JavaScript, and raw HTML props', () => {
    const broken = JSON.parse(JSON.stringify(tourFixture));
    broken.blocks[0].children[0].children[0].props = {
      level: 2,
      style: 'color: red',
      onclick: 'alert(1)',
      html: '<script>alert(1)</script>',
    };

    const result = validate(TalmehDocument, broken);

    expect(result.valid).toBe(false);
  });

  it('accepts typed product-click button actions without code-like payloads', () => {
    const document = JSON.parse(JSON.stringify(tourFixture));
    document.blocks[0].children[0].children[2].props.action = { type: 'clickTarget' };

    const result = validate(TalmehDocument, document);

    expect(result.valid).toBe(true);
  });
});
