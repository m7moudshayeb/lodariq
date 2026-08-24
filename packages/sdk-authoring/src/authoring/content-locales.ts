/**
 * Languages a customer authors in — which is not the list of languages Lodariq's
 * own chrome is translated into.
 *
 * `PRODUCT_LOCALES` answers "can we draw our UI in this?". Nothing about the
 * copy inside a card depends on that: it is opaque text we never parse, and the
 * tag on a variant is a routing key, not a claim about its characters. It is what
 * the runtime matches an end user against, what it puts in `lang` so a screen
 * reader pronounces the words, what direction is derived from, and what a
 * translation targets.
 *
 * So the shape is checked (`canonicalContentLocale`) and membership never is. The
 * list below is typeahead, not a gate — anything canonical is accepted.
 */
import { canonicalContentLocale } from '@lodariq/schema';
import { currentAuthoringLocale } from '../i18n';

/**
 * Common tags, offered so nobody has to remember that Japanese is `ja`. Being
 * absent from this list means a language is not *suggested*, never that it is
 * refused.
 *
 * One entry per language: `en-GB` beside `en` reads as a duplicate and makes the
 * list twice as long to scan. A creator who genuinely needs to separate British
 * from American copy still types the tag — the free-form row takes it. `zh-Hans`
 * and `zh-Hant` stay because they are different writing systems, not accents.
 */
export const CONTENT_LOCALE_SUGGESTIONS: readonly string[] = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'nl',
  'da',
  'sv',
  'nb',
  'fi',
  'is',
  'pl',
  'cs',
  'sk',
  'hu',
  'ro',
  'bg',
  'el',
  'hr',
  'sr',
  'sl',
  'et',
  'lv',
  'lt',
  'uk',
  'ru',
  'tr',
  'ar',
  'he',
  'fa',
  'ur',
  'hi',
  'bn',
  'pa',
  'gu',
  'ta',
  'te',
  'kn',
  'ml',
  'mr',
  'ne',
  'si',
  'th',
  'lo',
  'km',
  'my',
  'vi',
  'id',
  'ms',
  'tl',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'sw',
  'am',
  'ha',
  'yo',
  'ig',
  'zu',
  'af',
  'ca',
  'eu',
  'gl',
  'ga',
  'cy',
  'sq',
  'mk',
  'ka',
  'hy',
  'az',
  'kk',
  'uz',
];

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function displayNames(locale: string): Intl.DisplayNames | null {
  const cached = displayNamesCache.get(locale);
  if (cached !== undefined) return cached;
  let instance: Intl.DisplayNames | null = null;
  try {
    instance = new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' });
  } catch {
    instance = null;
  }
  displayNamesCache.set(locale, instance);
  return instance;
}

/**
 * The language's own name for itself — 日本語 rather than "Japanese". A creator
 * picking a language they speak recognizes the endonym first.
 *
 * Falls back to the raw tag, which is the honest answer for a tag `Intl` has
 * never heard of. It never throws and never refuses.
 */
export function contentLocaleLabel(tag: string): string {
  const canonical = canonicalContentLocale(tag) ?? tag;
  try {
    const name = displayNames(canonical)?.of(canonical);
    return name ? standaloneCase(name, canonical) : canonical;
  } catch {
    return canonical;
  }
}

/**
 * `Intl.DisplayNames` returns the sentence form — "français", not "Français" —
 * which reads as a typo in a list of names. CLDR's standalone form capitalizes;
 * this approximates it. Locale-aware so Turkish gets İ rather than I, and a
 * no-op for scripts without case.
 */
function standaloneCase(name: string, locale: string): string {
  const first = [...name][0];
  if (!first) return name;
  return first.toLocaleUpperCase(locale) + name.slice(first.length);
}

/**
 * Everything a creator might type to mean this language: its own name, its name
 * in the language they are reading the UI in, and the tag itself. Searching
 * "Japanese", "日本語" or "ja" all have to land.
 */
export function contentLocaleSearchText(tag: string): string {
  const canonical = canonicalContentLocale(tag) ?? tag;
  const parts = new Set<string>([canonical, contentLocaleLabel(canonical)]);
  try {
    const inUiLocale = displayNames(currentAuthoringLocale())?.of(canonical);
    if (inUiLocale) parts.add(inUiLocale);
    const inEnglish = displayNames('en')?.of(canonical);
    if (inEnglish) parts.add(inEnglish);
  } catch {
    /* A tag Intl cannot name is still searchable by the tag itself. */
  }
  return [...parts].join(' ');
}

/** For a tag CLDR cannot place at all, so every row still leads with a glyph. */
const NO_REGION_FLAG = '🌐';
const REGIONAL_INDICATOR_A = 0x1f1e6;

/**
 * A flag for every language: the region the tag names, or the one CLDR considers
 * most likely for it.
 *
 * Flags are countries and languages are not, so `en` resolving to 🇺🇸 and `ar` to
 * 🇪🇬 is imprecise by construction. That is a deliberate trade — a flag is picked
 * out of a list far faster than a two-letter code, and the tag and the language's
 * own name sit right beside it to carry the precision. `maximize()` at least
 * makes the choice CLDR's rather than ours.
 */
export function contentLocaleFlag(tag: string): string {
  const canonical = canonicalContentLocale(tag);
  if (!canonical) return NO_REGION_FLAG;
  try {
    const locale = new Intl.Locale(canonical);
    const region = locale.region ?? locale.maximize().region;
    if (!region || !/^[A-Z]{2}$/u.test(region)) return NO_REGION_FLAG;
    return [...region]
      .map((letter) =>
        String.fromCodePoint(REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 'A'.charCodeAt(0)),
      )
      .join('');
  } catch {
    return NO_REGION_FLAG;
  }
}

/** Languages written right to left, by their language subtag. */
const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur', 'yi', 'dv', 'ps', 'sd', 'ug', 'ckb']);

/**
 * Which way this language runs, so a card can be authored the way it will read.
 *
 * The runtime already does this when it plays a tour; the editor did not, which
 * meant Arabic copy was typed into a left-to-right card and only straightened
 * out once published.
 */
export function contentLocaleDirection(tag: string): 'ltr' | 'rtl' {
  try {
    const language = new Intl.Locale(canonicalContentLocale(tag) ?? tag).language;
    return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

export interface ContentLocaleOption {
  value: string;
  label: string;
  description?: string;
  searchText: string;
}

/**
 * Suggestions, with the document's own languages first — those are the ones this
 * experience actually has copy for, so they are what a creator reaches for.
 */
export function contentLocaleOptions(inDocument: readonly string[] = []): ContentLocaleOption[] {
  const seen = new Set<string>();
  const options: ContentLocaleOption[] = [];
  const push = (tag: string): void => {
    const canonical = canonicalContentLocale(tag);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    options.push({
      value: canonical,
      /* Flag to find the row, tag to be sure of it, name below to be certain.
         Upper case for the label only — the stored value stays canonical, so
         `pt-BR` is written `pt-BR` in the document. */
      label: `${contentLocaleFlag(canonical)} ${canonical.toLocaleUpperCase('en')}`,
      description: contentLocaleLabel(canonical),
      searchText: contentLocaleSearchText(canonical),
    });
  };
  for (const tag of inDocument) push(tag);
  for (const tag of CONTENT_LOCALE_SUGGESTIONS) push(tag);
  return options;
}
