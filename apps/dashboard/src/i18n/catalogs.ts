import 'server-only';

import type { Messages } from '@lingui/core';
import type { SupportedLocale } from '@lodariq/i18n';
import { messages as arMessages } from '../locales/ar/messages';
import { messages as deMessages } from '../locales/de/messages';
import { messages as enMessages } from '../locales/en/messages';
import { messages as enXaMessages } from '../locales/en-XA/messages';
import { messages as esMessages } from '../locales/es/messages';
import { messages as frMessages } from '../locales/fr/messages';
import { messages as itMessages } from '../locales/it/messages';
import { messages as nlBeMessages } from '../locales/nl-BE/messages';
import { messages as ptMessages } from '../locales/pt/messages';
import { messages as trMessages } from '../locales/tr/messages';

const DASHBOARD_CATALOGS: Readonly<Record<SupportedLocale, Messages>> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  es: esMessages,
  pt: ptMessages,
  ar: arMessages,
  tr: trMessages,
  it: itMessages,
  'nl-BE': nlBeMessages,
  'en-XA': enXaMessages,
  // The RTL pseudo-locale intentionally reuses the expanded pseudo copy. Its
  // distinct value controls document direction while keeping one generated
  // pseudo catalog as the source of long-copy stress cases.
  'ar-XB': enXaMessages,
};

export function dashboardCatalog(locale: SupportedLocale): Messages {
  return DASHBOARD_CATALOGS[locale];
}
