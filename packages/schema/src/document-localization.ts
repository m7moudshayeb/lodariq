import { Type, type Static } from '@sinclair/typebox';
import { InlineTextRun, type LodariqBlock } from './block';

export const DEFAULT_CONTENT_LOCALE = 'en' as const;
export const CONTENT_LOCALE_PATTERN = '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$';

/** A bounded BCP 47 language tag used for customer-authored experience copy. */
export const ContentLocale = Type.String({
  $id: 'ContentLocale',
  minLength: 2,
  maxLength: 35,
  pattern: CONTENT_LOCALE_PATTERN,
});
export type ContentLocale = Static<typeof ContentLocale>;

/** One translated leaf block, bound to the canonical stable block identity. */
export const LocalizedBlockContent = Type.Object(
  {
    blockId: Type.String({ minLength: 1 }),
    content: Type.String({ maxLength: 10_000 }),
    contentRuns: Type.Optional(Type.Array(Type.Ref(InlineTextRun), { maxItems: 256 })),
  },
  { $id: 'LocalizedBlockContent', additionalProperties: false },
);
export type LocalizedBlockContent = Static<typeof LocalizedBlockContent>;

/**
 * Redirects one step's target for a single locale.
 *
 * Targets are shared across locales by default — that is the point of keeping
 * variants text-only — but a localized UI sometimes genuinely differs. Both ends
 * are existing document targets, so evidence and identity stay intact (ADR-0016),
 * and the swap is resolved when a locale is materialized rather than by asking a
 * creator to keep locales in manual sync.
 */
export const LocalizedTargetOverride = Type.Object(
  {
    targetId: Type.String({ minLength: 1 }),
    replacementTargetId: Type.String({ minLength: 1 }),
  },
  { $id: 'LocalizedTargetOverride', additionalProperties: false },
);
export type LocalizedTargetOverride = Static<typeof LocalizedTargetOverride>;

/**
 * Sparse copy for one locale. Structure and behavior always come from the
 * canonical document; creator-facing text and, where a localized UI genuinely
 * differs, target bindings may vary by locale.
 */
export const DocumentLocaleVariant = Type.Object(
  {
    locale: Type.Ref(ContentLocale),
    /** Explicit next locale for missing block copy. Chains terminate at the document default. */
    fallbackLocale: Type.Ref(ContentLocale),
    title: Type.Optional(Type.String({ maxLength: 1_024 })),
    blocks: Type.Array(Type.Ref(LocalizedBlockContent), { maxItems: 2_000 }),
    targetOverrides: Type.Optional(
      Type.Array(Type.Ref(LocalizedTargetOverride), { maxItems: 200 }),
    ),
  },
  { $id: 'DocumentLocaleVariant', additionalProperties: false },
);
export type DocumentLocaleVariant = Static<typeof DocumentLocaleVariant>;

export const DocumentLocalization = Type.Object(
  {
    /** The canonical document title and block content are authored in this locale. */
    defaultLocale: Type.Ref(ContentLocale),
    variants: Type.Array(Type.Ref(DocumentLocaleVariant), { maxItems: 50 }),
  },
  { $id: 'DocumentLocalization', additionalProperties: false },
);
export type DocumentLocalization = Static<typeof DocumentLocalization>;

export interface DocumentLocalizationIssue {
  code:
    | 'duplicate_locale'
    | 'default_locale_variant'
    | 'duplicate_block'
    | 'unknown_block'
    | 'non_leaf_block'
    | 'invalid_content_runs'
    | 'missing_fallback'
    | 'fallback_cycle'
    | 'unknown_target_override'
    | 'self_target_override'
    | 'duplicate_target_override';
  locale: string;
  blockId?: string;
  targetId?: string;
}

export interface LocalizableDocument {
  title: string;
  blocks: LodariqBlock[];
  localization?: DocumentLocalization;
  /** Present on full documents; target overrides are only validated when it is. */
  targets?: readonly { id: string }[];
}

/** Canonicalizes a bounded language tag without accepting arbitrary locale-shaped strings. */
export function canonicalContentLocale(value: string | null | undefined): string | null {
  const candidate = value?.trim().replace(/_/gu, '-');
  if (!candidate || !new RegExp(CONTENT_LOCALE_PATTERN, 'u').test(candidate)) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

/** Adds the backwards-compatible default policy used by pre-localization drafts. */
export function resolveDocumentLocalization(
  document: Pick<LocalizableDocument, 'localization'>,
): DocumentLocalization {
  const defaultLocale =
    canonicalContentLocale(document.localization?.defaultLocale) ?? DEFAULT_CONTENT_LOCALE;
  return {
    defaultLocale,
    variants: structuredClone(document.localization?.variants ?? []),
  };
}

/**
 * Resolves exact tag, same-language variant, explicit fallbacks, then the
 * canonical default. The returned order starts with the selected locale.
 */
export function resolveDocumentLocaleChain(
  localizationInput: DocumentLocalization | undefined,
  requestedLocale: string | null | undefined,
): string[] {
  const localization = resolveDocumentLocalization({ localization: localizationInput });
  const defaultLocale =
    canonicalContentLocale(localization.defaultLocale) ?? DEFAULT_CONTENT_LOCALE;
  const variants = new Map(
    localization.variants.flatMap((variant) => {
      const locale = canonicalContentLocale(variant.locale);
      return locale ? [[locale, variant] as const] : [];
    }),
  );
  const requested = canonicalContentLocale(requestedLocale);
  const selected = requested ? selectVariantLocale(variants, requested) : null;
  const chain: string[] = [];
  const seen = new Set<string>();
  let locale = selected;
  while (locale && locale !== defaultLocale && !seen.has(locale)) {
    seen.add(locale);
    chain.push(locale);
    const fallback = canonicalContentLocale(variants.get(locale)?.fallbackLocale);
    locale = fallback && variants.has(fallback) ? fallback : defaultLocale;
  }
  chain.push(defaultLocale);
  return chain;
}

/** Materializes a locale view while retaining canonical structure, identity, and behavior. */
export function materializeLocalizedDocument<T extends LocalizableDocument>(
  document: T,
  requestedLocale: string | null | undefined,
): T {
  const next = structuredClone(document);
  const localization = resolveDocumentLocalization(document);
  const variants = new Map(
    localization.variants.flatMap((variant) => {
      const locale = canonicalContentLocale(variant.locale);
      return locale ? [[locale, variant] as const] : [];
    }),
  );
  const chain = resolveDocumentLocaleChain(localization, requestedLocale);
  for (const locale of [...chain].reverse()) {
    const variant = variants.get(locale);
    if (!variant) continue;
    if (variant.title !== undefined) next.title = variant.title;
    const contentByBlockId = new Map(variant.blocks.map((block) => [block.blockId, block]));
    next.blocks = next.blocks.map((block) => localizeBlock(block, contentByBlockId));
    const targetSwaps = new Map(
      (variant.targetOverrides ?? []).map((override) => [
        override.targetId,
        override.replacementTargetId,
      ]),
    );
    if (targetSwaps.size > 0) {
      next.blocks = next.blocks.map((block) => retargetBlock(block, targetSwaps));
    }
  }
  return next;
}

/** Semantic validation that JSON Schema cannot express across recursive block identities. */
export function documentLocalizationIssues(
  document: LocalizableDocument,
): DocumentLocalizationIssue[] {
  if (!document.localization) return [];
  const issues: DocumentLocalizationIssue[] = [];
  const defaultLocale =
    canonicalContentLocale(document.localization.defaultLocale) ?? DEFAULT_CONTENT_LOCALE;
  const blocks = flattenBlocks(document.blocks);
  const variantsByLocale = new Map<string, DocumentLocaleVariant>();

  for (const variant of document.localization.variants) {
    const locale = canonicalContentLocale(variant.locale) ?? variant.locale;
    if (locale === defaultLocale) issues.push({ code: 'default_locale_variant', locale });
    if (variantsByLocale.has(locale)) issues.push({ code: 'duplicate_locale', locale });
    variantsByLocale.set(locale, variant);
    const seenBlocks = new Set<string>();
    for (const localized of variant.blocks) {
      if (seenBlocks.has(localized.blockId)) {
        issues.push({ code: 'duplicate_block', locale, blockId: localized.blockId });
      }
      seenBlocks.add(localized.blockId);
      const canonical = blocks.get(localized.blockId);
      if (!canonical) {
        issues.push({ code: 'unknown_block', locale, blockId: localized.blockId });
      } else if (canonical.children.length > 0 || canonical.content === undefined) {
        issues.push({ code: 'non_leaf_block', locale, blockId: localized.blockId });
      }
      if (
        localized.contentRuns &&
        localized.contentRuns.map((run) => run.text).join('') !== localized.content
      ) {
        issues.push({ code: 'invalid_content_runs', locale, blockId: localized.blockId });
      }
    }
    issues.push(...targetOverrideIssues(document, variant, locale));
  }

  for (const [locale, variant] of variantsByLocale) {
    const fallback = canonicalContentLocale(variant.fallbackLocale) ?? variant.fallbackLocale;
    if (fallback !== defaultLocale && !variantsByLocale.has(fallback)) {
      issues.push({ code: 'missing_fallback', locale });
      continue;
    }
    const seen = new Set([locale]);
    let cursor = fallback;
    while (cursor !== defaultLocale) {
      if (seen.has(cursor)) {
        issues.push({ code: 'fallback_cycle', locale });
        break;
      }
      seen.add(cursor);
      const next = variantsByLocale.get(cursor);
      if (!next) break;
      cursor = canonicalContentLocale(next.fallbackLocale) ?? next.fallbackLocale;
    }
  }
  return issues;
}

function selectVariantLocale(
  variants: ReadonlyMap<string, DocumentLocaleVariant>,
  requested: string,
): string | null {
  if (variants.has(requested)) return requested;
  const language = requested.split('-')[0]?.toLowerCase();
  if (!language) return null;
  return (
    [...variants.keys()].find((locale) => locale.toLowerCase() === language) ??
    [...variants.keys()].find((locale) => locale.split('-')[0]?.toLowerCase() === language) ??
    null
  );
}

function localizeBlock(
  block: LodariqBlock,
  contentByBlockId: ReadonlyMap<string, LocalizedBlockContent>,
): LodariqBlock {
  const localized = contentByBlockId.get(block.id);
  const next: LodariqBlock = {
    ...block,
    children: block.children.map((child) => localizeBlock(child, contentByBlockId)),
  };
  if (!localized) return next;
  next.content = localized.content;
  if (localized.contentRuns) next.contentRuns = structuredClone(localized.contentRuns);
  else delete next.contentRuns;
  return next;
}

/**
 * Both ends of an override must be real document targets, so a locale can never
 * point a step at evidence that does not exist (ADR-0016).
 */
function targetOverrideIssues(
  document: LocalizableDocument,
  variant: DocumentLocaleVariant,
  locale: string,
): DocumentLocalizationIssue[] {
  const overrides = variant.targetOverrides ?? [];
  if (overrides.length === 0) return [];
  const issues: DocumentLocalizationIssue[] = [];
  const known = document.targets ? new Set(document.targets.map((target) => target.id)) : null;
  const seen = new Set<string>();
  for (const override of overrides) {
    const { targetId, replacementTargetId } = override;
    if (seen.has(targetId)) issues.push({ code: 'duplicate_target_override', locale, targetId });
    seen.add(targetId);
    if (targetId === replacementTargetId) {
      issues.push({ code: 'self_target_override', locale, targetId });
      continue;
    }
    if (known && (!known.has(targetId) || !known.has(replacementTargetId))) {
      issues.push({ code: 'unknown_target_override', locale, targetId });
    }
  }
  return issues;
}

/** Applies a locale's target swaps. Only the binding moves; nothing else changes. */
function retargetBlock(block: LodariqBlock, swaps: ReadonlyMap<string, string>): LodariqBlock {
  const next: LodariqBlock = {
    ...block,
    children: block.children.map((child) => retargetBlock(child, swaps)),
  };
  const replacement = block.props.targetId ? swaps.get(block.props.targetId) : undefined;
  if (replacement) next.props = { ...next.props, targetId: replacement };
  return next;
}

function flattenBlocks(blocks: readonly LodariqBlock[]): Map<string, LodariqBlock> {
  const result = new Map<string, LodariqBlock>();
  const visit = (block: LodariqBlock): void => {
    result.set(block.id, block);
    block.children.forEach(visit);
  };
  blocks.forEach(visit);
  return result;
}
