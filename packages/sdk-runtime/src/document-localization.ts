import type { CompiledDocument, CompiledDocumentV3, CompiledDocumentV4 } from '@lodariq/schema';

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

  if (document.artifactSchemaVersion === '4') {
    const selected = selectCompiledVariant(document, requested);
    const locale = selected?.locale ?? document.localization.defaultLocale;
    const resolvedDocument: CompiledDocumentV4 = selected
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
  document: CompiledDocumentV3 | CompiledDocumentV4,
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
): document is CompiledDocumentV3 | CompiledDocumentV4 {
  return (
    (document.artifactSchemaVersion === '3' || document.artifactSchemaVersion === '4') &&
    'localization' in document
  );
}

function selectCompiledVariant<TDocument extends CompiledDocumentV3 | CompiledDocumentV4>(
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
  return (
    document.localization.variants.find((variant) => variant.locale.toLowerCase() === language) ??
    document.localization.variants.find(
      (variant) => variant.locale.split('-')[0]?.toLowerCase() === language,
    ) ??
    null
  );
}
