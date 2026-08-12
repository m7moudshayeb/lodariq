import 'server-only';

import { setupI18n, type I18n, type Messages } from '@lingui/core';
import {
  DASHBOARD_LOCALE_COOKIE,
  DEFAULT_LOCALE,
  isProductLocale,
  localeDirection,
  resolveSupportedLocale,
  type LocaleDirection,
  type SupportedLocale,
} from '@lodariq/i18n';
import { setI18n } from '@lingui/react/server';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { dashboardCatalog } from './catalogs';

export interface DashboardI18nContext {
  locale: SupportedLocale;
  direction: LocaleDirection;
  messages: Messages;
  i18n: I18n;
}

export const getDashboardI18n = cache(async (): Promise<DashboardI18nContext> => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const resolvedLocale = resolveSupportedLocale({
    cookieLocale: cookieStore.get(DASHBOARD_LOCALE_COOKIE)?.value,
    acceptLanguage: requestHeaders.get('accept-language'),
  });
  const locale =
    process.env.NODE_ENV === 'production' && !isProductLocale(resolvedLocale)
      ? DEFAULT_LOCALE
      : resolvedLocale;
  const messages = dashboardCatalog(locale);
  const i18n = setupI18n({ locale, messages: { [locale]: messages } });
  setI18n(i18n);
  return { locale, direction: localeDirection(locale), messages, i18n };
});
