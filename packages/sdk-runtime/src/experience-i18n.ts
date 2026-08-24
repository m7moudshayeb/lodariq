import { pseudoLocalize } from '@lodariq/i18n';
import { currentRuntimeLocale, type RuntimeMessageValues } from './i18n';
import { EXPERIENCE_RUNTIME_CATALOGS } from './experience-i18n-catalogs';

/** Non-tour delivery copy loads only when a non-tour experience starts. */
export function experienceRuntimeText(source: string, values?: RuntimeMessageValues): string {
  const locale = currentRuntimeLocale();
  const translated =
    EXPERIENCE_RUNTIME_CATALOGS[locale]?.[source] ?? pseudoLocalize(source, locale);
  if (!values) return translated;
  return translated.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
