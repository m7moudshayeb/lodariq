import type { SupportedLocale } from '@lodariq/i18n';
import type { MessageDescriptor } from '@lingui/core';
import { DASHBOARD_COMMON_MESSAGES, DASHBOARD_VIEW_MODEL_MESSAGES } from '../i18n/messages';

type Translate = (
  descriptor: MessageDescriptor,
  values?: Record<string, string | number>,
) => string;

export function formatDate(value: string, locale: SupportedLocale, translate: Translate): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate(DASHBOARD_COMMON_MESSAGES.unknown);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(
  value: string,
  locale: SupportedLocale,
  translate: Translate,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate(DASHBOARD_VIEW_MODEL_MESSAGES.unknownTime);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function timestampOf(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
