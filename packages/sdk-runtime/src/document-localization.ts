import type {
  CompiledDocument,
  CompiledDocumentV3,
  CompiledDocumentV4,
  CompiledDocumentV5,
} from '@lodariq/schema';

export interface ResolvedCompiledDocumentLocale {
  document: CompiledDocument;
  locale: string;
  title: string | null;
  requestedLocale: string | null;
  usedFallback: boolean;
}

/** Selects an already-compiled locale view without changing the immutable artifact identity. */
export function resolveCompiledDocumentLocale(
  document: CompiledDocument,
  requestedLocale: string | null | undefined,
): ResolvedCompiledDocumentLocale {
  const requested = canonicalLocale(requestedLocale);
  if (!isLocalizedCompiledDocument(document)) {
    return {
      document,
      locale: requested ?? 'en',
      title: null,
      requestedLocale: requested,
      usedFallback: false,
    };
  }

  if (document.artifactSchemaVersion === '4' || document.artifactSchemaVersion === '5') {
    const selected = selectCompiledVariant(document, requested);
    const locale = selected?.locale ?? document.localization.defaultLocale;
    const resolvedDocument: CompiledDocumentV4 | CompiledDocumentV5 = selected
      ? { ...document, steps: structuredClone(selected.steps) }
      : document;
    return resolvedLocaleResult(
      resolvedDocument,
      locale,
      selected?.title ?? document.localization.defaultTitle,
      requested,
    );
  }
  const selected = selectCompiledVariant(document, requested);
  const locale = selected?.locale ?? document.localization.defaultLocale;
  const resolvedDocument: CompiledDocumentV3 = selected
    ? { ...document, steps: structuredClone(selected.steps) }
    : document;
  return resolvedLocaleResult(
    resolvedDocument,
    locale,
    selected?.title ?? document.localization.defaultTitle,
    requested,
  );
}

function resolvedLocaleResult(
  document: CompiledDocumentV3 | CompiledDocumentV4 | CompiledDocumentV5,
  locale: string,
  title: string,
  requested: string | null,
): ResolvedCompiledDocumentLocale {
  return {
    document,
    locale,
    title,
    requestedLocale: requested,
    usedFallback: requested !== null && locale.toLowerCase() !== requested.toLowerCase(),
  };
}

function canonicalLocale(value: string | null | undefined): string | null {
  const candidate = value?.trim().replace(/_/gu, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

export function isLocalizedCompiledDocument(
  document: CompiledDocument,
): document is CompiledDocumentV3 | CompiledDocumentV4 | CompiledDocumentV5 {
  return (
    (document.artifactSchemaVersion === '3' ||
      document.artifactSchemaVersion === '4' ||
      document.artifactSchemaVersion === '5') &&
    'localization' in document
  );
}

function selectCompiledVariant<
  TDocument extends CompiledDocumentV3 | CompiledDocumentV4 | CompiledDocumentV5,
>(
  document: TDocument,
  requested: string | null,
): TDocument['localization']['variants'][number] | null {
  if (!requested) return null;
  const exact = document.localization.variants.find(
    (variant) => variant.locale.toLowerCase() === requested.toLowerCase(),
  );
  if (exact) return exact;
  const language = requested.split('-')[0]?.toLowerCase();
  if (!language) return null;
  const base = document.localization.variants.find(
    (variant) => variant.locale.toLowerCase() === language,
  );
  if (base) return base;
  /*
   * Same language, different region: `pt-AO` against a document holding `pt-BR`
   * and `pt-PT`. This used to take whichever came first in the array — that is
   * the order the creator happened to add them, so two documents with identical
   * content could serve different copy. Least-specific first, then alphabetical:
   * arbitrary is fine, unstable is not.
   */
  return (
    [...document.localization.variants]
      .filter((variant) => variant.locale.split('-')[0]?.toLowerCase() === language)
      .sort(
        (left, right) =>
          left.locale.length - right.locale.length || left.locale.localeCompare(right.locale),
      )[0] ?? null
  );
}
