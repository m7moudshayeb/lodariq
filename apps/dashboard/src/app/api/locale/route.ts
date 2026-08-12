import {
  DASHBOARD_LOCALE_COOKIE,
  isProductLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '@lodariq/i18n';
import { NextResponse } from 'next/server';
import { rejectUnsafeMutation } from '../../../lib/auth-proxy';

const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export async function POST(request: Request): Promise<Response> {
  const rejectedRequest = await rejectUnsafeMutation(request);
  if (rejectedRequest) return rejectedRequest;

  const body = await readRequestBody(request);
  if (
    !body ||
    !isSupportedLocale(body.locale) ||
    (process.env.NODE_ENV === 'production' && !isProductLocale(body.locale))
  ) {
    return NextResponse.json(
      { error: 'unsupported_locale' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }

  const response = NextResponse.json(
    { locale: body.locale },
    { headers: { 'cache-control': 'no-store' } },
  );
  response.cookies.set({
    name: DASHBOARD_LOCALE_COOKIE,
    value: body.locale,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

async function readRequestBody(request: Request): Promise<{ locale?: SupportedLocale } | null> {
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const locale = (value as Record<string, unknown>)['locale'];
    return typeof locale === 'string' ? { locale: locale as SupportedLocale } : {};
  } catch {
    return null;
  }
}
