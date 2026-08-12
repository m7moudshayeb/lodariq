'use client';

import type { SupportedLocale } from '@lodariq/i18n';

export async function updateDashboardLocale(locale: SupportedLocale): Promise<void> {
  const response = await fetch('/api/locale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale }),
  });
  if (!response.ok) throw new Error('locale_update_failed');
}
