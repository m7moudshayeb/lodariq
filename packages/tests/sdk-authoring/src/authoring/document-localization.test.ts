import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { addAuthoringDocumentLocale } from '../../../../../packages/sdk-authoring/src/authoring/document-localization';

describe('adding an authoring locale', () => {
  it('adds a sparse arbitrary locale and leaves default or duplicate locales unchanged', () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
    const added = addAuthoringDocumentLocale(document, 'ja-JP');

    expect(added.localization?.variants).toContainEqual({
      locale: 'ja-JP',
      fallbackLocale: 'en',
      blocks: [],
    });
    expect(addAuthoringDocumentLocale(added, 'ja-JP').localization?.variants).toEqual(
      added.localization?.variants,
    );
    expect(addAuthoringDocumentLocale(added, 'en').localization?.variants).toEqual(
      added.localization?.variants,
    );
  });

  it('does not impose the product translation catalog or a fixed client-side cap', () => {
    let document = structuredClone(tourFixture) as LodariqDocument;
    for (let index = 0; index < 51; index += 1) {
      const first = String.fromCharCode(65 + Math.floor(index / 26));
      const second = String.fromCharCode(65 + (index % 26));
      document = addAuthoringDocumentLocale(document, `en-${first}${second}`);
    }

    expect(document.localization?.variants).toHaveLength(54);
    expect(addAuthoringDocumentLocale(document, 'sw').localization?.variants).toContainEqual({
      locale: 'sw',
      fallbackLocale: 'en',
      blocks: [],
    });
  });
});
