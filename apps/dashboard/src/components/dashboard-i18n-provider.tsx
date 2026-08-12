'use client';

import { setupI18n, type Messages } from '@lingui/core';
import type { SupportedLocale } from '@lodariq/i18n';
import { I18nProvider } from '@lingui/react';
import { useState } from 'react';

export function DashboardI18nProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: SupportedLocale;
  messages: Messages;
}): React.ReactElement {
  const [i18n] = useState(() => setupI18n({ locale, messages: { [locale]: messages } }));
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
