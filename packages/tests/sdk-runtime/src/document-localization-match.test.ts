import { describe, expect, it } from 'vitest';
import type { CompiledDocument } from '@lodariq/schema';
import { resolveCompiledDocumentLocale } from '../../../../packages/sdk-runtime/src/document-localization';

/**
 * Which variant a viewer gets (§7.6).
 *
 * Exact tag, then the plain language, then any region of it. The last step used
 * to be `.find()` over the variants array — the order the creator happened to
 * add them — so two documents with identical content could serve different copy
 * to the same reader.
 */
describe('compiled locale matching', () => {
  it('serves a region viewer the plain language variant', () => {
    const document = documentWith(['en', 'pt']);
    expect(resolveCompiledDocumentLocale(document, 'pt-BR').locale).toBe('pt');
    expect(resolveCompiledDocumentLocale(document, 'en-AU').locale).toBe('en');
  });

  it('prefers an exact tag over the plain language', () => {
    const document = documentWith(['pt', 'pt-BR']);
    expect(resolveCompiledDocumentLocale(document, 'pt-BR').locale).toBe('pt-BR');
    expect(resolveCompiledDocumentLocale(document, 'pt-PT').locale).toBe('pt');
  });

  it('picks the same region variant whatever order they were authored in', () => {
    const forwards = documentWith(['pt-BR', 'pt-PT']);
    const backwards = documentWith(['pt-PT', 'pt-BR']);
    const first = resolveCompiledDocumentLocale(forwards, 'pt-AO').locale;
    const second = resolveCompiledDocumentLocale(backwards, 'pt-AO').locale;
    expect(first).toBe(second);
  });

  it('breaks a tie toward the least specific tag', () => {
    const document = documentWith(['zh-Hant-HK', 'zh-Hans']);
    expect(resolveCompiledDocumentLocale(document, 'zh-MO').locale).toBe('zh-Hans');
  });

  it('falls back to the default when nothing shares the language', () => {
    const document = documentWith(['de', 'fr']);
    const resolved = resolveCompiledDocumentLocale(document, 'ja');
    expect(resolved.locale).toBe('en');
    expect(resolved.usedFallback).toBe(true);
  });
});

/** The narrowest compiled shape the matcher reads. */
function documentWith(locales: readonly string[]): CompiledDocument {
  return {
    artifactSchemaVersion: '4',
    localization: {
      defaultLocale: 'en',
      defaultTitle: 'Welcome tour',
      variants: locales.map((locale) => ({
        locale,
        title: `Title ${locale}`,
        steps: [],
      })),
    },
    steps: [],
  } as unknown as CompiledDocument;
}
