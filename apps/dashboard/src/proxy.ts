import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { shouldProtectDashboardRoutes } from './lib/clerk-config';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

const protectedDashboardProxy = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  await auth.protect();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!shouldProtectDashboardRoutes()) return NextResponse.next();
  return protectedDashboardProxy(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
