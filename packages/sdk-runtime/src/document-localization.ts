import type { CompiledDocument, CompiledDocumentV3 } from '@lodariq/schema';
import { COMPILED_ARTIFACT_SCHEMA_VERSION } from '@lodariq/schema/version';

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

  const selected = selectCompiledVariant(document, requested);
  const locale = selected?.locale ?? document.localization.defaultLocale;
  return {
    document: selected
      ? {
          ...document,
          steps: structuredClone(selected.steps),
        }
      : document,
    locale,
    title: selected?.title ?? document.localization.defaultTitle,
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
): document is CompiledDocumentV3 {
  return (
    document.artifactSchemaVersion === COMPILED_ARTIFACT_SCHEMA_VERSION &&
    'localization' in document
  );
}

function selectCompiledVariant(
  document: CompiledDocumentV3,
  requested: string | null,
): CompiledDocumentV3['localization']['variants'][number] | null {
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
