import { describe, expect, it } from 'vitest';
import type { TalmehDocument } from '@talmeh/schema';
import { compilePreview, exportDocument, importDocument } from '@talmeh/sdk-runtime/local-dev';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';

describe('local-dev document import', () => {
  it('validates shared document JSON before returning it', () => {
    const imported = importDocument(JSON.stringify(tourFixture));

    expect(imported.id).toBe((tourFixture as TalmehDocument).id);
  });

  it('rejects malformed document JSON', () => {
    expect(() => importDocument(JSON.stringify({ id: 'doc_missing_shape' }))).toThrow(
      /Invalid Talmeh document import/,
    );
  });

  it('exports, re-imports, and compiles without losing stable IDs', async () => {
    const fixture = tourFixture as TalmehDocument;
    const imported = importDocument(exportDocument(fixture));
    const compiled = await compilePreview(imported);

    expect(imported.blocks.map((block) => block.id)).toEqual(
      fixture.blocks.map((block) => block.id),
    );
    expect(imported.targets.map((target) => target.id)).toEqual(
      fixture.targets.map((target) => target.id),
    );
    expect(compiled.steps.map((step) => step.id)).toEqual(fixture.blocks.map((block) => block.id));
    expect(compiled.targets.map((target) => target.id)).toEqual(
      fixture.targets.map((target) => target.id),
    );
  });
});
