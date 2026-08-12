import {
  DEFAULT_LOCALE,
  localeDirection,
  pseudoLocalize,
  resolveClientLocale,
  type SupportedLocale,
} from '@lodariq/i18n';
import { AUTHORING_LOCALE_QUERY_PARAMETER } from '@lodariq/schema/authoring-entry-runtime';
import { RUNTIME_CATALOGS } from './i18n-catalogs';

export type RuntimeMessageValues = Readonly<Record<string, string | number>>;

let configuredLocale: SupportedLocale | null = null;

/** Override automatic page-language detection for a runtime instance. */
export function configureRuntimeLocale(
  candidates: ReadonlyArray<string | null | undefined>,
): SupportedLocale {
  const locale = resolveClientLocale([explicitRuntimeLocale(), ...candidates]);
  configuredLocale = locale;
  return locale;
}

/** Delivery follows the customer page language unless explicitly configured. */
export function currentRuntimeLocale(): SupportedLocale {
  if (configuredLocale) return configuredLocale;
  const pageLocale = typeof document === 'undefined' ? null : document.documentElement.lang;
  const navigatorLocales = typeof navigator === 'undefined' ? [] : navigator.languages;
  return resolveClientLocale([explicitRuntimeLocale(), pageLocale, ...navigatorLocales]);
}

function explicitRuntimeLocale(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(AUTHORING_LOCALE_QUERY_PARAMETER);
  } catch {
    return null;
  }
}

export function applyRuntimeLocale(root: HTMLElement | Document = document): SupportedLocale {
  const locale = currentRuntimeLocale();
  const element = root instanceof Document ? root.documentElement : root;
  element.lang = locale;
  element.dir = localeDirection(locale);
  return locale;
}

export function runtimeText(source: string, values?: RuntimeMessageValues): string {
  const locale = currentRuntimeLocale();
  const translated = RUNTIME_CATALOGS[locale]?.[source] ?? pseudoLocalize(source, locale);
  return interpolate(translated, values);
}

function interpolate(template: string, values?: RuntimeMessageValues): string {
  if (!values) return template;
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

export function resetRuntimeLocaleForTests(): void {
  configuredLocale = null;
}

export { DEFAULT_LOCALE };
