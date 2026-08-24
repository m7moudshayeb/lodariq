/**
 * Narration authoring (§7.7), minus anything that touches a release.
 *
 * What lives here: the script/copy split, language inference, voice filtering,
 * the pronunciation lexicon, and the cache key that stops regeneration churn.
 *
 * Generation and playback live at the service and runtime boundaries.
 */
import { NARRATION_SPEED_RANGE, type StepNarration } from '@lodariq/schema';

export interface NarrationVoice {
  readonly id: string;
  readonly name: string;
  /** BCP 47 language tag this voice speaks. */
  readonly locale: string;
  readonly gender?: 'female' | 'male' | 'neutral';
  readonly accent?: string;
}

/** One product-name pronunciation, per workspace — the override creators need. */
export interface NarrationLexiconEntry {
  readonly written: string;
  /** Respelling, not IPA: creators can write "loh-DAR-ik" and cannot write IPA. */
  readonly spoken: string;
}

/**
 * Infers the script's language so the voice list can filter to it. Making language
 * a separate picker is what produces the Spanish-text-English-voice bug.
 *
 * This is a bounded heuristic over the locales the product supports: writing
 * system first, then function-word scoring for the Latin-script languages. A
 * creator can always override, and the override is stored on the step.
 */
export function inferNarrationLocale(script: string, supported: readonly string[]): string | null {
  const text = script.trim();
  if (!text) return null;
  for (const [locale, pattern] of Object.entries(SCRIPT_RANGES)) {
    if (pattern.test(text) && supportsLanguage(supported, locale)) return locale;
  }
  const words = new Set(text.toLocaleLowerCase().split(/[^\p{L}']+/u).filter(Boolean));
  let best: { locale: string; hits: number } | null = null;
  for (const [locale, markers] of Object.entries(FUNCTION_WORDS)) {
    if (!supportsLanguage(supported, locale)) continue;
    const hits = markers.filter((marker) => words.has(marker)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { locale, hits };
  }
  return best?.locale ?? null;
}

function supportsLanguage(supported: readonly string[], locale: string): boolean {
  return supported.some((candidate) => candidate.split('-')[0] === locale);
}

/** Writing system is decisive where it exists, so it is checked first. */
const SCRIPT_RANGES: Record<string, RegExp> = {
  ar: /\p{Script=Arabic}/u,
  he: /\p{Script=Hebrew}/u,
  ja: /\p{Script=Hiragana}|\p{Script=Katakana}/u,
  ko: /\p{Script=Hangul}/u,
  zh: /\p{Script=Han}/u,
};

/** Short, high-frequency function words: cheap, and they rarely cross languages. */
const FUNCTION_WORDS: Record<string, readonly string[]> = {
  en: ['the', 'and', 'you', 'this', 'with', 'your'],
  de: ['und', 'der', 'die', 'das', 'sie', 'mit', 'für'],
  fr: ['le', 'la', 'les', 'et', 'vous', 'pour', 'dans'],
  es: ['el', 'la', 'los', 'y', 'para', 'con', 'tu'],
  it: ['il', 'la', 'gli', 'e', 'per', 'con', 'tuo'],
  pt: ['o', 'a', 'os', 'e', 'para', 'com', 'seu'],
  nl: ['de', 'het', 'en', 'je', 'voor', 'met'],
  tr: ['ve', 'bir', 'bu', 'için', 'ile'],
};

/** The voices a creator may pick, filtered to the language actually written. */
export function voicesForNarration(
  narration: StepNarration | undefined,
  voices: readonly NarrationVoice[],
  supported: readonly string[],
): readonly NarrationVoice[] {
  const locale =
    narration?.localeOverride ?? inferNarrationLocale(narration?.script ?? '', supported);
  if (!locale) return voices;
  const language = locale.split('-')[0];
  const matches = voices.filter((voice) => voice.locale.split('-')[0] === language);
  // Never present an empty list: an unfiltered choice beats no choice.
  return matches.length > 0 ? matches : voices;
}

/**
 * `Sync from step text` (§7.7): the escape hatch for authors who do not want to
 * write twice. Joins the step's visible copy into sentences a voice can read,
 * without pretending it is well-written narration.
 */
export function narrationScriptFromStepText(lines: readonly string[]): string {
  return lines
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .map((line) => (/[.!?]$/u.test(line) ? line : `${line}.`))
    .join(' ');
}

/** Applies the workspace lexicon, longest written form first so prefixes lose. */
export function applyNarrationLexicon(
  script: string,
  lexicon: readonly NarrationLexiconEntry[],
): string {
  return [...lexicon]
    .filter((entry) => entry.written.trim() && entry.spoken.trim())
    .sort((a, b) => b.written.length - a.written.length)
    .reduce(
      (text, entry) => text.replace(new RegExp(escapeRegExp(entry.written), 'giu'), entry.spoken),
      script,
    );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export interface NarrationCacheKeyInput {
  readonly script: string;
  readonly voiceId: string;
  readonly model: string;
  readonly speed?: number;
}

/**
 * The cost that matters is regeneration churn, not generation. Keying on
 * `(script, voice, model, speed)` means only dirty steps are ever regenerated.
 */
export function narrationCacheKey(input: NarrationCacheKeyInput): string {
  const speed = clampNarrationSpeed(input.speed);
  return [input.model, input.voiceId, speed.toFixed(2), fnv1a(input.script)].join(':');
}

export function clampNarrationSpeed(speed: number | undefined): number {
  if (speed === undefined || !Number.isFinite(speed)) return 1;
  return Math.min(NARRATION_SPEED_RANGE.max, Math.max(NARRATION_SPEED_RANGE.min, speed));
}

/** A short, stable content hash. Not a security boundary — a cache key. */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
