import {
  canonicalContentLocale,
  resolveDocumentLocalization,
  type AuthoringTranslationResult,
  type DocumentLocaleVariant,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqDocument,
  type LocalizedBlockContent,
} from '@lodariq/schema';
import type { MeasuredProviderUsage } from './authoring-assist';

const DEEPL_FREE_API_ORIGIN = 'https://api-free.deepl.com';
const DEEPL_PRO_API_ORIGIN = 'https://api.deepl.com';
const DEEPL_TRANSLATE_PATH = '/v2/translate';
const DEEPL_REQUEST_TIMEOUT_MS = 20_000;
const DEEPL_BATCH_TEXT_LIMIT = 40;
const DEEPL_BATCH_CHARACTER_LIMIT = 50_000;
const AUTHORING_TRANSLATION_CHARACTER_LIMIT = 50_000;

const DEEPL_LANGUAGE_BY_CONTENT_LOCALE = {
  en: { source: 'EN', target: 'EN-US' },
  de: { source: 'DE', target: 'DE' },
  fr: { source: 'FR', target: 'FR' },
  es: { source: 'ES', target: 'ES' },
  pt: { source: 'PT', target: 'PT-PT' },
  ar: { source: 'AR', target: 'AR' },
  tr: { source: 'TR', target: 'TR' },
  it: { source: 'IT', target: 'IT' },
  'nl-BE': { source: 'NL', target: 'NL' },
} as const;

const TRANSLATION_PLACEHOLDER_PATTERN =
  /\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[A-Za-z][A-Za-z0-9_.-]*\}|%(?:\d+\$)?[a-zA-Z]|https?:\/\/[^\s<>"']+/gu;

export interface AuthoringTranslationProviderInput {
  sourceLocale: string;
  targetLocale: string;
  texts: readonly string[];
  context: string;
}

export interface AuthoringTranslationProvider {
  translateTexts: (
    input: AuthoringTranslationProviderInput,
  ) => Promise<{ texts: string[]; usage: MeasuredProviderUsage & { usageUnit: 'characters' } }>;
}

export type AuthoringTranslationExecutionResult = AuthoringTranslationResult & {
  providerUsage?: MeasuredProviderUsage;
};

export class AuthoringTranslationFailure extends Error {
  constructor(
    readonly code:
      | 'unsupported_locale'
      | 'default_locale_target'
      | 'request_too_large'
      | 'provider_failed'
      | 'invalid_provider_response',
  ) {
    super(code);
  }
}

interface TranslationSegment {
  blockId?: string;
  kind: 'title' | 'block' | 'run';
  prefix: string;
  suffix: string;
  text: string;
  runIndex?: number;
}

/**
 * Translates only sparse copy missing from the requested locale. Existing
 * localized title and block values are immutable at this boundary.
 */
export async function translateMissingAuthoringCopy(
  document: LodariqDocument,
  targetLocaleValue: string,
  provider: AuthoringTranslationProvider,
): Promise<AuthoringTranslationExecutionResult> {
  const next = structuredClone(document);
  const localization = resolveDocumentLocalization(next);
  const sourceLocale = requireSupportedLocale(localization.defaultLocale);
  const targetLocale = requireSupportedLocale(targetLocaleValue);
  if (targetLocale === sourceLocale) {
    throw new AuthoringTranslationFailure('default_locale_target');
  }

  const variant = localization.variants.find(
    (candidate) => canonicalContentLocale(candidate.locale) === targetLocale,
  );
  const existingBlockIds = new Set(variant?.blocks.map((block) => block.blockId) ?? []);
  const blocks = translatableLeafBlocks(next.blocks).filter(
    (block) => !existingBlockIds.has(block.id) && Boolean(block.content?.trim()),
  );
  const segments: TranslationSegment[] = [];
  if (variant?.title === undefined && next.title.trim()) {
    segments.push(segmentForText('title', next.title));
  }
  for (const block of blocks) appendBlockSegments(segments, block);

  const translatedCharacterCount = segments.reduce(
    (total, segment) => total + segment.text.length,
    0,
  );
  if (translatedCharacterCount > AUTHORING_TRANSLATION_CHARACTER_LIMIT) {
    throw new AuthoringTranslationFailure('request_too_large');
  }
  if (segments.length === 0) {
    return {
      document: next,
      sourceLocale,
      targetLocale,
      translatedTitle: false,
      translatedBlockCount: 0,
      translatedCharacterCount: 0,
    };
  }

  const providerResult = await provider.translateTexts({
    sourceLocale,
    targetLocale,
    texts: segments.map((segment) => segment.text),
    context: translationContext(next, targetLocale),
  });
  const translated = providerResult.texts;
  if (translated.length !== segments.length) {
    throw new AuthoringTranslationFailure('invalid_provider_response');
  }

  const translatedTitleSegment = segments.findIndex((segment) => segment.kind === 'title');
  const localizedBlocks = buildLocalizedBlocks(blocks, segments, translated);
  const translatedTitle = translatedTitleSegment >= 0;
  const nextVariant: DocumentLocaleVariant = variant
    ? structuredClone(variant)
    : { locale: targetLocale, fallbackLocale: sourceLocale, blocks: [] };
  nextVariant.locale = targetLocale;
  if (translatedTitle) {
    nextVariant.title = translatedText(
      segments[translatedTitleSegment]!,
      translated[translatedTitleSegment]!,
    );
  }
  nextVariant.blocks.push(...localizedBlocks);

  const variants = localization.variants.map((candidate) =>
    candidate === variant ? nextVariant : structuredClone(candidate),
  );
  if (!variant) variants.push(nextVariant);
  next.localization = { defaultLocale: sourceLocale, variants };

  return {
    document: next,
    sourceLocale,
    targetLocale,
    translatedTitle,
    translatedBlockCount: localizedBlocks.length,
    translatedCharacterCount,
    providerUsage: providerResult.usage,
  };
}

export function createDeepLAuthoringTranslationProvider(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): AuthoringTranslationProvider | undefined {
  const apiKey = environment.LODARIQ_DEEPL_API_KEY?.trim();
  if (!apiKey) return undefined;
  const apiOrigin = apiKey.endsWith(':fx') ? DEEPL_FREE_API_ORIGIN : DEEPL_PRO_API_ORIGIN;

  return {
    translateTexts: async (input) => {
      const source = deepLLanguage(input.sourceLocale).source;
      const target = deepLLanguage(input.targetLocale).target;
      const translated: string[] = [];
      for (const batch of translationBatches(input.texts)) {
        const masked = batch.map(maskTranslationPlaceholders);
        const body: Record<string, unknown> = {
          text: masked.map((item) => item.text),
          source_lang: source,
          target_lang: target,
          context: input.context,
          preserve_formatting: true,
          formality: 'prefer_less',
          tag_handling: 'xml',
          tag_handling_version: 'v2',
          ignore_tags: ['x'],
          non_splitting_tags: ['x'],
        };
        const result = await requestDeepLTranslation(
          fetchImplementation,
          new URL(DEEPL_TRANSLATE_PATH, apiOrigin),
          apiKey,
          body,
          batch.length,
        );
        translated.push(
          ...result.map((text, index) => restoreTranslationPlaceholders(text, masked[index]!)),
        );
      }
      return {
        texts: translated,
        usage: {
          provider: 'deepl',
          usageUnit: 'characters',
          inputUnits: input.texts.reduce((total, text) => total + text.length, 0),
          outputUnits: translated.reduce((total, text) => total + text.length, 0),
          providerCostMicros: 0,
        },
      };
    },
  };
}

interface MaskedTranslationText {
  text: string;
  placeholders: readonly string[];
}

function maskTranslationPlaceholders(value: string): MaskedTranslationText {
  const placeholders: string[] = [];
  let cursor = 0;
  let text = '<lq>';
  for (const match of value.matchAll(TRANSLATION_PLACEHOLDER_PATTERN)) {
    const index = match.index;
    if (index === undefined) continue;
    text += escapeXml(value.slice(cursor, index));
    const placeholderId = placeholders.push(match[0]) - 1;
    text += `<x id="${placeholderId}"></x>`;
    cursor = index + match[0].length;
  }
  text += `${escapeXml(value.slice(cursor))}</lq>`;
  return { text, placeholders };
}

function restoreTranslationPlaceholders(value: string, masked: MaskedTranslationText): string {
  const wrapper = value.match(/^\s*<lq>([\s\S]*)<\/lq>\s*$/u);
  if (!wrapper) throw new AuthoringTranslationFailure('invalid_provider_response');
  let text = wrapper[1]!;
  const restoredIds = new Set<number>();
  text = text.replace(/<x\s+id=["'](\d+)["']\s*(?:\/>|>\s*<\/x>)/gu, (_match, idValue: string) => {
    const id = Number(idValue);
    const placeholder = masked.placeholders[id];
    if (placeholder === undefined || restoredIds.has(id)) {
      throw new AuthoringTranslationFailure('invalid_provider_response');
    }
    restoredIds.add(id);
    return placeholder;
  });
  if (restoredIds.size !== masked.placeholders.length || /<\/?[A-Za-z][^>]*>/u.test(text)) {
    throw new AuthoringTranslationFailure('invalid_provider_response');
  }
  return unescapeXml(text);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function unescapeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/gu, (_match, entity: string) => {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as const;
    return entities[entity as keyof typeof entities];
  });
}

function requireSupportedLocale(value: string): keyof typeof DEEPL_LANGUAGE_BY_CONTENT_LOCALE {
  const locale = canonicalContentLocale(value);
  if (!locale || !(locale in DEEPL_LANGUAGE_BY_CONTENT_LOCALE)) {
    throw new AuthoringTranslationFailure('unsupported_locale');
  }
  return locale as keyof typeof DEEPL_LANGUAGE_BY_CONTENT_LOCALE;
}

function deepLLanguage(
  locale: string,
): (typeof DEEPL_LANGUAGE_BY_CONTENT_LOCALE)[keyof typeof DEEPL_LANGUAGE_BY_CONTENT_LOCALE] {
  return DEEPL_LANGUAGE_BY_CONTENT_LOCALE[requireSupportedLocale(locale)];
}

function translatableLeafBlocks(blocks: readonly LodariqBlock[]): LodariqBlock[] {
  const result: LodariqBlock[] = [];
  const visit = (block: LodariqBlock): void => {
    if (block.children.length === 0 && block.content !== undefined) result.push(block);
    block.children.forEach(visit);
  };
  blocks.forEach(visit);
  return result;
}

function appendBlockSegments(segments: TranslationSegment[], block: LodariqBlock): void {
  if (block.contentRuns?.length) {
    block.contentRuns.forEach((run, runIndex) => {
      if (!run.text.trim()) return;
      segments.push({ ...segmentForText('run', run.text), blockId: block.id, runIndex });
    });
    return;
  }
  if (block.content?.trim()) {
    segments.push({ ...segmentForText('block', block.content), blockId: block.id });
  }
}

function segmentForText(kind: TranslationSegment['kind'], value: string): TranslationSegment {
  const prefix = value.match(/^\s*/u)?.[0] ?? '';
  const suffix = value.match(/\s*$/u)?.[0] ?? '';
  const end = Math.max(prefix.length, value.length - suffix.length);
  return { kind, prefix, suffix, text: value.slice(prefix.length, end) };
}

function buildLocalizedBlocks(
  blocks: readonly LodariqBlock[],
  segments: readonly TranslationSegment[],
  translated: readonly string[],
): LocalizedBlockContent[] {
  const translatedByBlock = new Map<string, Array<{ segment: TranslationSegment; text: string }>>();
  segments.forEach((segment, index) => {
    if (!segment.blockId) return;
    const entries = translatedByBlock.get(segment.blockId) ?? [];
    entries.push({ segment, text: translatedText(segment, translated[index]!) });
    translatedByBlock.set(segment.blockId, entries);
  });

  return blocks.flatMap((block) => {
    const entries = translatedByBlock.get(block.id);
    if (!entries?.length) return [];
    if (!block.contentRuns?.length) {
      return [{ blockId: block.id, content: entries[0]!.text }];
    }
    const runs: InlineTextRun[] = structuredClone(block.contentRuns);
    for (const entry of entries) {
      if (entry.segment.runIndex === undefined || !runs[entry.segment.runIndex]) continue;
      runs[entry.segment.runIndex] = { ...runs[entry.segment.runIndex]!, text: entry.text };
    }
    return [
      { blockId: block.id, content: runs.map((run) => run.text).join(''), contentRuns: runs },
    ];
  });
}

function translatedText(segment: TranslationSegment, value: string): string {
  if (!value.trim()) throw new AuthoringTranslationFailure('invalid_provider_response');
  return `${segment.prefix}${value.trim()}${segment.suffix}`;
}

function translationContext(document: LodariqDocument, targetLocale: string): string {
  const regionalContext = targetLocale === 'nl-BE' ? ' The target readers use Belgian Dutch.' : '';
  return `Customer-authored in-product guidance titled "${document.title.slice(0, 400)}".${regionalContext}`;
}

function translationBatches(texts: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let characters = 0;
  for (const text of texts) {
    if (
      batch.length >= DEEPL_BATCH_TEXT_LIMIT ||
      (batch.length > 0 && characters + text.length > DEEPL_BATCH_CHARACTER_LIMIT)
    ) {
      batches.push(batch);
      batch = [];
      characters = 0;
    }
    batch.push(text);
    characters += text.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function requestDeepLTranslation(
  fetchImplementation: typeof fetch,
  url: URL,
  apiKey: string,
  body: Record<string, unknown>,
  expectedCount: number,
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEEPL_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `DeepL-Auth-Key ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new AuthoringTranslationFailure('provider_failed');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new AuthoringTranslationFailure('provider_failed');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AuthoringTranslationFailure('invalid_provider_response');
  }
  const translations = translationTextsFromResponse(payload);
  if (translations.length !== expectedCount) {
    throw new AuthoringTranslationFailure('invalid_provider_response');
  }
  return translations;
}

function translationTextsFromResponse(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('translations' in value)) return [];
  const translations = (value as { translations?: unknown }).translations;
  if (!Array.isArray(translations)) return [];
  return translations.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('text' in entry)) return [];
    const text = (entry as { text?: unknown }).text;
    return typeof text === 'string' && text.trim() ? [text] : [];
  });
}
