import {
  DEFAULT_LOCALE,
  localeDirection,
  pseudoLocalize,
  resolveClientLocale,
  type SupportedLocale,
} from '@lodariq/i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import { loadAuthoringCatalog } from './i18n-catalog-loader';
import { EMPTY_AUTHORING_CATALOG, type AuthoringCatalog } from './i18n-catalog-types';

export type AuthoringMessageValues = Readonly<Record<string, string | number>>;

let configuredLocale: SupportedLocale | null = null;
let loadedCatalogLocale = currentAuthoringLocale();
let loadedCatalog: AuthoringCatalog = EMPTY_AUTHORING_CATALOG;

/**
 * The catalog fetch starts at module evaluation but is deliberately not awaited
 * here.
 *
 * A top-level await would make this module async, and because nearly every
 * authoring module imports `authoringText`, that asynchrony propagates: the
 * whole graph would have to wait on one network fetch before any of it could
 * evaluate. That put the locale catalog on the critical path ahead of the
 * application chunk and cost a full round trip on every non-English boot.
 *
 * Reading a message before this settles is safe rather than wrong: a missing
 * key already falls through to the English source. Callers that must not paint
 * untranslated text await `configureAuthoringLocale`, which resolves once the
 * catalog is in memory — so the download still overlaps everything else, and
 * only the render waits.
 */
let catalogReady: Promise<unknown> = adoptAuthoringCatalog(loadedCatalogLocale);

async function adoptAuthoringCatalog(locale: SupportedLocale): Promise<void> {
  const catalog = await loadAuthoringCatalog(locale);
  // A later `configureAuthoringLocale` may have superseded this load.
  if (configuredLocale !== null && configuredLocale !== locale) return;
  loadedCatalog = catalog;
  loadedCatalogLocale = locale;
}

export async function configureAuthoringLocale(
  candidates: ReadonlyArray<string | null | undefined>,
): Promise<SupportedLocale> {
  const locale = resolveClientLocale([explicitAuthoringLocale(), ...candidates]);
  return loadConfiguredAuthoringLocale(locale);
}

/** Apply the dashboard preference after the exact-source activation handshake. */
export async function configureAuthoringLocalePreference(
  locale: SupportedLocale,
): Promise<SupportedLocale> {
  return loadConfiguredAuthoringLocale(locale);
}

async function loadConfiguredAuthoringLocale(locale: SupportedLocale): Promise<SupportedLocale> {
  const previous = configuredLocale;
  configuredLocale = locale;
  // The module-level load already covers the detected locale; re-entering for
  // the same one would fetch a catalog that is either in memory or in flight.
  if (locale === loadedCatalogLocale && previous === null) {
    await catalogReady;
    return locale;
  }
  if (locale !== loadedCatalogLocale) {
    catalogReady = adoptAuthoringCatalog(locale);
  }
  await catalogReady;
  return locale;
}

export function currentAuthoringLocale(): SupportedLocale {
  if (configuredLocale) return configuredLocale;
  const documentLocale = typeof document === 'undefined' ? null : document.documentElement.lang;
  const navigatorLocales = typeof navigator === 'undefined' ? [] : navigator.languages;
  return resolveClientLocale([explicitAuthoringLocale(), ...navigatorLocales, documentLocale]);
}

function explicitAuthoringLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(AUTHORING_LOCALE_QUERY_PARAMETER);
  } catch {
    return null;
  }
}

export function applyAuthoringLocale(root: HTMLElement | Document = document): SupportedLocale {
  const locale = currentAuthoringLocale();
  const element = root instanceof Document ? root.documentElement : root;
  element.lang = locale;
  element.dir = localeDirection(locale);
  return locale;
}

export function authoringText(source: string, values?: AuthoringMessageValues): string {
  const locale = currentAuthoringLocale();
  const translated =
    (locale === loadedCatalogLocale ? loadedCatalog[source] : undefined) ??
    pseudoLocalize(source, locale);
  return interpolate(translated, values);
}

export function authoringNumber(value: number | bigint): string {
  return new Intl.NumberFormat(currentAuthoringLocale()).format(value);
}

export function authoringDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(currentAuthoringLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function interpolate(template: string, values?: AuthoringMessageValues): string {
  if (!values) return template;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function resetAuthoringLocaleForTests(): void {
  configuredLocale = null;
}

export { DEFAULT_LOCALE };
