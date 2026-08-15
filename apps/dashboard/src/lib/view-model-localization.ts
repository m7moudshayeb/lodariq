import type { SupportedLocale } from '@lodariq/i18n';
import type { MessageDescriptor } from '@lingui/core';

export interface DashboardViewModelLocalization {
  locale: SupportedLocale;
  translate: (descriptor: MessageDescriptor, values?: Record<string, string | number>) => string;
}
