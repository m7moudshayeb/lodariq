import { describe, expect, it } from 'vitest';
import type { TalmehDocument } from '@talmeh/schema';
import { importDocument } from '@talmeh/sdk-runtime/local-dev';
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
});
