import { NextResponse, type NextRequest } from 'next/server';
import { dashboardSessionCookieName, isDevelopmentHeaderAuthMode } from './lib/auth-contract';

const PUBLIC_PAGE_PREFIXES = [
  '/healthz',
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/authoring/activate',
] as const;

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/') ||
    PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    isDevelopmentHeaderAuthMode() ||
    hasSessionCookie(request)
  ) {
    return NextResponse.next();
  }

  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set('returnTo', '/');
  return NextResponse.redirect(signInUrl);
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(request.cookies.get(dashboardSessionCookieName())?.value);
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
