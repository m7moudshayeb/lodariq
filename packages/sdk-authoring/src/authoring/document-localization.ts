import {
  DEFAULT_CONTENT_LOCALE,
  canonicalContentLocale,
  materializeLocalizedDocument,
  resolveDocumentLocalization,
  type DocumentLocaleVariant,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqDocument,
} from '@lodariq/schema';

/** Normalizes legacy drafts and removes translations for blocks that no longer exist. */
export function normalizeAuthoringDocumentLocalization(document: LodariqDocument): LodariqDocument {
  const next = structuredClone(document);
  const localization = resolveDocumentLocalization(next);
  const defaultLocale =
    canonicalContentLocale(localization.defaultLocale) ?? DEFAULT_CONTENT_LOCALE;
  const blockIds = new Set<string>();
  visitBlocks(next.blocks, (block) => blockIds.add(block.id));
  const targetIds = new Set(next.targets.map((target) => target.id));
  const variants = new Map<string, DocumentLocaleVariant>();
  for (const candidate of localization.variants) {
    const locale = canonicalContentLocale(candidate.locale);
    if (!locale || locale === defaultLocale || variants.has(locale)) continue;
    const requestedFallback = canonicalContentLocale(candidate.fallbackLocale);
    // Overrides are dropped with their targets, exactly as translations are with blocks.
    const targetOverrides = (candidate.targetOverrides ?? []).filter(
      (override) =>
        targetIds.has(override.targetId) && targetIds.has(override.replacementTargetId),
    );
    variants.set(locale, {
      locale,
      fallbackLocale:
        requestedFallback && requestedFallback !== locale ? requestedFallback : defaultLocale,
      ...(candidate.title !== undefined ? { title: candidate.title } : {}),
      blocks: candidate.blocks.filter((block) => blockIds.has(block.blockId)),
      ...(targetOverrides.length > 0 ? { targetOverrides } : {}),
    });
  }
  for (const variant of variants.values()) {
    if (variant.fallbackLocale !== defaultLocale && !variants.has(variant.fallbackLocale)) {
      variant.fallbackLocale = defaultLocale;
    }
  }
  next.localization = { defaultLocale, variants: [...variants.values()] };
  return next;
}

export function localizedAuthoringDocument(
  document: LodariqDocument,
  locale: string,
): LodariqDocument {
  return materializeLocalizedDocument(document, locale);
}

export function setAuthoringLocalizedTitle(
  document: LodariqDocument,
  locale: string,
  title: string,
): LodariqDocument {
  const next = normalizeAuthoringDocumentLocalization(document);
  if (isDefaultDocumentLocale(next, locale)) return { ...next, title };
  const variant = mutableVariant(next, locale);
  variant.title = title;
  return next;
}

export function setAuthoringLocalizedBlockContent(
  document: LodariqDocument,
  locale: string,
  blockId: string,
  content: string,
  contentRuns?: InlineTextRun[],
): LodariqDocument {
  const next = normalizeAuthoringDocumentLocalization(document);
  if (isDefaultDocumentLocale(next, locale)) {
    next.blocks = next.blocks.map((block) =>
      replaceBlockContent(block, blockId, content, contentRuns),
    );
    return next;
  }
  const variant = mutableVariant(next, locale);
  const localized = {
    blockId,
    content,
    ...(contentRuns?.length ? { contentRuns: structuredClone(contentRuns) } : {}),
  };
  const index = variant.blocks.findIndex((block) => block.blockId === blockId);
  if (index >= 0) variant.blocks[index] = localized;
  else variant.blocks.push(localized);
  return next;
}

export function isDefaultDocumentLocale(document: LodariqDocument, locale: string): boolean {
  const localization = resolveDocumentLocalization(document);
  return canonicalContentLocale(locale) === canonicalContentLocale(localization.defaultLocale);
}

function mutableVariant(document: LodariqDocument, localeValue: string): DocumentLocaleVariant {
  const localization = document.localization!;
  const locale = canonicalContentLocale(localeValue) ?? localeValue;
  let variant = localization.variants.find((candidate) => candidate.locale === locale);
  if (!variant) {
    variant = { locale, fallbackLocale: localization.defaultLocale, blocks: [] };
    localization.variants.push(variant);
  }
  return variant;
}

function replaceBlockContent(
  block: LodariqBlock,
  blockId: string,
  content: string,
  contentRuns?: InlineTextRun[],
): LodariqBlock {
  const next = {
    ...block,
    children: block.children.map((child) =>
      replaceBlockContent(child, blockId, content, contentRuns),
    ),
  };
  if (block.id !== blockId) return next;
  next.content = content;
  if (contentRuns?.length) next.contentRuns = structuredClone(contentRuns);
  else delete next.contentRuns;
  return next;
}

function visitBlocks(blocks: readonly LodariqBlock[], visit: (block: LodariqBlock) => void): void {
  for (const block of blocks) {
    visit(block);
    visitBlocks(block.children, visit);
  }
}

/**
 * Points one step's target at a different element for a single locale (§7.6).
 * Passing `null` removes the override, restoring the shared target. Overrides
 * only exist on non-default locales: the default *is* the shared binding.
 */
export function setAuthoringLocalizedTarget(
  document: LodariqDocument,
  locale: string,
  targetId: string,
  replacementTargetId: string | null,
): LodariqDocument {
  const next = normalizeAuthoringDocumentLocalization(document);
  if (isDefaultDocumentLocale(next, locale)) return next;
  const variant = mutableVariant(next, locale);
  const overrides = (variant.targetOverrides ?? []).filter(
    (override) => override.targetId !== targetId,
  );
  if (replacementTargetId && replacementTargetId !== targetId) {
    overrides.push({ targetId, replacementTargetId });
  }
  if (overrides.length > 0) variant.targetOverrides = overrides;
  else delete variant.targetOverrides;
  return next;
}

/** The replacement this locale uses for a shared target, if any. */
export function authoringLocalizedTarget(
  document: LodariqDocument,
  locale: string,
  targetId: string,
): string | null {
  const variant = document.localization?.variants.find(
    (candidate) => canonicalContentLocale(candidate.locale) === canonicalContentLocale(locale),
  );
  return (
    variant?.targetOverrides?.find((override) => override.targetId === targetId)
      ?.replacementTargetId ?? null
  );
}
