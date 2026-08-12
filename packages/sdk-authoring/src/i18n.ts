import {
  DEFAULT_LOCALE,
  localeDirection,
  pseudoLocalize,
  resolveClientLocale,
  type SupportedLocale,
} from '@lodariq/i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import { loadAuthoringCatalog } from './i18n-catalog-loader';
import type { AuthoringCatalog } from './i18n-catalog-types';

export type AuthoringMessageValues = Readonly<Record<string, string | number>>;

let configuredLocale: SupportedLocale | null = null;
let loadedCatalogLocale = currentAuthoringLocale();
let loadedCatalog: AuthoringCatalog = await loadAuthoringCatalog(loadedCatalogLocale);

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
  configuredLocale = locale;
  if (locale !== loadedCatalogLocale) {
    const catalog = await loadAuthoringCatalog(locale);
    if (configuredLocale === locale) {
      loadedCatalog = catalog;
      loadedCatalogLocale = locale;
    }
  }
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
