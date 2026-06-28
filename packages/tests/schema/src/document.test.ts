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
});
