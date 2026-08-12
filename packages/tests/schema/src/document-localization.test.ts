import { describe, expect, it } from 'vitest';
import {
  LodariqDocument,
  documentLocalizationIssues,
  materializeLocalizedDocument,
  resolveDocumentLocaleChain,
  validate,
  type LodariqDocument as LodariqDocumentType,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

function localizedDocument(): LodariqDocumentType {
  const document = structuredClone(tourFixture) as LodariqDocumentType;
  document.localization = {
    defaultLocale: 'en',
    variants: [
      {
        locale: 'de',
        fallbackLocale: 'en',
        title: 'Willkommenstour',
        blocks: [
          {
            blockId: 'block_heading_1',
            content: 'Erstellen Sie Ihr erstes Projekt',
          },
        ],
      },
      {
        locale: 'de-AT',
        fallbackLocale: 'de',
        blocks: [
          {
            blockId: 'block_paragraph_1',
            content: 'Projekte organisieren die Arbeit Ihres Teams.',
          },
        ],
      },
    ],
  };
  return document;
}

describe('customer-authored document localization', () => {
  it('validates sparse locale variants bound to canonical block identities', () => {
    const document = localizedDocument();

    expect(validate(LodariqDocument, document).valid).toBe(true);
    expect(documentLocalizationIssues(document)).toEqual([]);
  });

  it('materializes explicit fallback chains without changing canonical structure', () => {
    const document = localizedDocument();

    expect(resolveDocumentLocaleChain(document.localization, 'de-AT')).toEqual([
      'de-AT',
      'de',
      'en',
    ]);
    const localized = materializeLocalizedDocument(document, 'de-AT');
    const tooltip = localized.blocks[0]?.children[0];

    expect(localized.title).toBe('Willkommenstour');
    expect(tooltip?.children.map((block) => [block.id, block.content])).toEqual([
      ['block_heading_1', 'Erstellen Sie Ihr erstes Projekt'],
      ['block_paragraph_1', 'Projekte organisieren die Arbeit Ihres Teams.'],
      ['block_button_1', 'Continue'],
    ]);
    expect(localized.blocks.map((block) => block.id)).toEqual(
      document.blocks.map((block) => block.id),
    );
    expect(document.title).toBe('Welcome tour');
  });

  it('reports invalid fallback graphs and translations for unknown blocks', () => {
    const document = localizedDocument();
    document.localization!.variants = [
      {
        locale: 'de',
        fallbackLocale: 'fr',
        blocks: [{ blockId: 'block_missing', content: 'Fehlt' }],
      },
      { locale: 'fr', fallbackLocale: 'de', blocks: [] },
    ];

    expect(documentLocalizationIssues(document)).toEqual(
      expect.arrayContaining([
        { code: 'unknown_block', locale: 'de', blockId: 'block_missing' },
        { code: 'fallback_cycle', locale: 'de' },
        { code: 'fallback_cycle', locale: 'fr' },
      ]),
    );
  });
});
