import { pseudoLocalize } from '@lodariq/i18n';
import { currentRuntimeLocale, type RuntimeMessageValues } from './i18n';
import { TOUR_RUNTIME_CATALOGS } from './tour-i18n-catalogs';

/** Tour-only copy stays out of the creator activation client's eager locale payload. */
export function tourRuntimeText(source: string, values?: RuntimeMessageValues): string {
  const locale = currentRuntimeLocale();
  const translated = TOUR_RUNTIME_CATALOGS[locale]?.[source] ?? pseudoLocalize(source, locale);
  if (!values) return translated;
  return translated.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
