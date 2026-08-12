import { describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { resolveCompiledDocumentLocale } from '@lodariq/sdk-runtime';

describe('compiled document locale selection', () => {
  it('selects exact and same-language variants while keeping fallback copy server-resolved', async () => {
    const document = structuredClone(tourFixture) as LodariqDocument;
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
      ],
    };
    const compiled = await compileDocument({
      document,
      theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });

    const exact = resolveCompiledDocumentLocale(compiled, 'de');
    const regional = resolveCompiledDocumentLocale(compiled, 'de-AT');
    const fallback = resolveCompiledDocumentLocale(compiled, 'fr');

    expect(exact).toMatchObject({
      locale: 'de',
      title: 'Willkommenstour',
      requestedLocale: 'de',
      usedFallback: false,
    });
    expect(regional).toMatchObject({
      locale: 'de',
      title: 'Willkommenstour',
      requestedLocale: 'de-AT',
      usedFallback: true,
    });
    expect(regional.document.steps[0]?.body.map((block) => block.text)).toEqual([
      'Erstellen Sie Ihr erstes Projekt',
      "Projects help organize your team's work.",
      'Continue',
    ]);
    expect(fallback).toMatchObject({
      locale: 'en',
      title: 'Welcome tour',
      requestedLocale: 'fr',
      usedFallback: true,
    });
  });
});
