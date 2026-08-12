import 'server-only';

import type { MessageDescriptor } from '@lingui/core';
import { dashboardErrorMessageDescriptor } from './error-messages';
import { getDashboardI18n } from './server';
import type { DashboardApiError } from '../lib/api';

export async function serverMessage(
  descriptor: MessageDescriptor,
  values?: Record<string, string | number>,
): Promise<string> {
  if (process.env.NODE_ENV === 'test') return sourceMessage(descriptor, values);
  const { i18n } = await getDashboardI18n();
  return i18n._(values ? { ...descriptor, values } : descriptor);
}

export async function serverDashboardErrorMessage(error: DashboardApiError): Promise<string> {
  return serverMessage(dashboardErrorMessageDescriptor(error.code, error.statusCode));
}

function sourceMessage(
  descriptor: MessageDescriptor,
  values?: Record<string, string | number>,
): string {
  const message = descriptor.message ?? descriptor.id;
  if (!values) return message;
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/gu, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
