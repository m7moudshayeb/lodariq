export const DEFAULT_LOCALE = 'en' as const;
export const GERMAN_LOCALE = 'de' as const;
export const FRENCH_LOCALE = 'fr' as const;
export const SPANISH_LOCALE = 'es' as const;
export const PORTUGUESE_LOCALE = 'pt' as const;
export const ARABIC_LOCALE = 'ar' as const;
export const TURKISH_LOCALE = 'tr' as const;
export const ITALIAN_LOCALE = 'it' as const;
export const BELGIAN_DUTCH_LOCALE = 'nl-BE' as const;
export const EXPANDED_PSEUDO_LOCALE = 'en-XA' as const;
export const RTL_PSEUDO_LOCALE = 'ar-XB' as const;
export const DASHBOARD_LOCALE_COOKIE = 'lq_locale' as const;

export const PRODUCT_LOCALES = [
  DEFAULT_LOCALE,
  GERMAN_LOCALE,
  FRENCH_LOCALE,
  SPANISH_LOCALE,
  PORTUGUESE_LOCALE,
  ARABIC_LOCALE,
  TURKISH_LOCALE,
  ITALIAN_LOCALE,
  BELGIAN_DUTCH_LOCALE,
] as const;

export const SUPPORTED_LOCALES = [
  ...PRODUCT_LOCALES,
  EXPANDED_PSEUDO_LOCALE,
  RTL_PSEUDO_LOCALE,
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type ProductLocale = (typeof PRODUCT_LOCALES)[number];
export type LocaleDirection = 'ltr' | 'rtl';

export interface LocaleOption {
  locale: SupportedLocale;
  label: string;
  direction: LocaleDirection;
  pseudo: boolean;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { locale: DEFAULT_LOCALE, label: 'English', direction: 'ltr', pseudo: false },
  { locale: GERMAN_LOCALE, label: 'Deutsch', direction: 'ltr', pseudo: false },
  { locale: FRENCH_LOCALE, label: 'Français', direction: 'ltr', pseudo: false },
  { locale: SPANISH_LOCALE, label: 'Español', direction: 'ltr', pseudo: false },
  { locale: PORTUGUESE_LOCALE, label: 'Português', direction: 'ltr', pseudo: false },
  { locale: ARABIC_LOCALE, label: 'العربية', direction: 'rtl', pseudo: false },
  { locale: TURKISH_LOCALE, label: 'Türkçe', direction: 'ltr', pseudo: false },
  { locale: ITALIAN_LOCALE, label: 'Italiano', direction: 'ltr', pseudo: false },
  {
    locale: BELGIAN_DUTCH_LOCALE,
    label: 'Nederlands (België)',
    direction: 'ltr',
    pseudo: false,
  },
  {
    locale: EXPANDED_PSEUDO_LOCALE,
    label: 'Pseudo · expanded',
    direction: 'ltr',
    pseudo: true,
  },
  { locale: RTL_PSEUDO_LOCALE, label: 'Pseudo · RTL', direction: 'rtl', pseudo: true },
];

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);
const PRODUCT_LOCALE_SET = new Set<string>(PRODUCT_LOCALES);
const LOCALE_OPTION_BY_LOCALE = new Map(
  LOCALE_OPTIONS.map((option) => [option.locale, option] as const),
);

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALE_SET.has(value);
}

export function isProductLocale(value: unknown): value is (typeof PRODUCT_LOCALES)[number] {
  return typeof value === 'string' && PRODUCT_LOCALE_SET.has(value);
}

export function localeDirection(locale: SupportedLocale): LocaleDirection {
  return LOCALE_OPTION_BY_LOCALE.get(locale)?.direction ?? 'ltr';
}

export function localeOption(locale: SupportedLocale): LocaleOption {
  return LOCALE_OPTION_BY_LOCALE.get(locale) ?? LOCALE_OPTIONS[0]!;
}

export function matchSupportedLocale(value: string | null | undefined): SupportedLocale | null {
  const canonical = canonicalLocale(value);
  if (!canonical) return null;
  if (isSupportedLocale(canonical)) return canonical;

  const language = canonical.split('-')[0]?.toLowerCase();
  if (!language) return null;
  return (
    SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === language) ??
    SUPPORTED_LOCALES.find((locale) => locale.split('-')[0]?.toLowerCase() === language) ??
    null
  );
}

export function localeFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): SupportedLocale | null {
  if (!acceptLanguage) return null;
  const candidates = acceptLanguage
    .split(',')
    .map(parseAcceptLanguageEntry)
    .filter((entry): entry is AcceptLanguageEntry => entry !== null)
    .sort((left, right) => right.quality - left.quality || left.order - right.order);

  for (const candidate of candidates) {
    const locale = matchSupportedLocale(candidate.locale);
    if (locale) return locale;
  }
  return null;
}

export function resolveSupportedLocale(input: {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale {
  return (
    matchSupportedLocale(input.cookieLocale) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}

/** Resolve a browser surface from explicitly ordered language candidates. */
export function resolveClientLocale(
  candidates: ReadonlyArray<string | null | undefined>,
): SupportedLocale {
  for (const candidate of candidates) {
    const locale = matchSupportedLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function formatNumber(
  value: number | bigint,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDateTime(
  value: Date | number | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** Development-only pseudo translation that preserves interpolation placeholders. */
export function pseudoLocalize(source: string, locale: SupportedLocale): string {
  if (locale !== EXPANDED_PSEUDO_LOCALE && locale !== RTL_PSEUDO_LOCALE) return source;
  const transformed = source
    .split(/(\{[A-Za-z][A-Za-z0-9_]*\})/gu)
    .map((part) => {
      if (part.startsWith('{')) return part;
      const expanded =
        locale === EXPANDED_PSEUDO_LOCALE ? part.replace(/[aeiou]/giu, '$&$&') : part;
      return accentPseudoText(expanded);
    })
    .join('');
  if (locale === RTL_PSEUDO_LOCALE) return `‮⟦${transformed}⟧‬`;
  return `⟦${transformed}⟧`;
}

function accentPseudoText(value: string): string {
  const characters: Readonly<Record<string, string>> = {
    A: 'Å',
    B: 'Ɓ',
    C: 'Ç',
    D: 'Ð',
    E: 'É',
    F: 'Ƒ',
    G: 'Ĝ',
    H: 'Ĥ',
    I: 'Î',
    J: 'Ĵ',
    K: 'Ķ',
    L: 'Ļ',
    M: 'Ṁ',
    N: 'Ñ',
    O: 'Ø',
    P: 'Þ',
    Q: 'Ǫ',
    R: 'Ŕ',
    S: 'Š',
    T: 'Ţ',
    U: 'Û',
    V: 'Ṽ',
    W: 'Ŵ',
    X: 'Ẋ',
    Y: 'Ŷ',
    Z: 'Ž',
  };
  return [...value]
    .map((character) => {
      const mapped = characters[character.toUpperCase()];
      return mapped
        ? character === character.toLowerCase()
          ? mapped.toLowerCase()
          : mapped
        : character;
    })
    .join('');
}

interface AcceptLanguageEntry {
  locale: string;
  quality: number;
  order: number;
}

function parseAcceptLanguageEntry(value: string, order: number): AcceptLanguageEntry | null {
  const [rawLocale, ...parameters] = value.trim().split(';');
  const locale = rawLocale?.trim();
  if (!locale || locale === '*') return null;

  let quality = 1;
  for (const parameter of parameters) {
    const [key, rawQuality] = parameter.trim().split('=');
    if (key?.toLowerCase() !== 'q') continue;
    const parsed = Number(rawQuality);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
    quality = parsed;
  }
  if (quality === 0) return null;
  return { locale, quality, order };
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
