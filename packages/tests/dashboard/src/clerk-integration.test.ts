import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  hasDashboardClerkProvider,
  hasDashboardClerkRuntime,
  shouldProtectDashboardRoutes,
} from '../../../../apps/dashboard/src/lib/clerk-config';

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('@lodariq/dashboard Clerk integration', () => {
  it('requires both publishable and secret keys before considering Clerk runtime ready', () => {
    expect(
      hasDashboardClerkRuntime({
        NODE_ENV: 'production',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
        CLERK_SECRET_KEY: '',
      }),
    ).toBe(false);
    expect(
      hasDashboardClerkRuntime({
        NODE_ENV: 'production',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
        CLERK_SECRET_KEY: 'sk_test_fixture',
      }),
    ).toBe(true);
  });

  it('protects production routes even if Clerk configuration is incomplete', () => {
    expect(
      shouldProtectDashboardRoutes({
        NODE_ENV: 'production',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
        CLERK_SECRET_KEY: '',
      }),
    ).toBe(true);
    expect(
      shouldProtectDashboardRoutes({
        NODE_ENV: 'development',
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
        CLERK_SECRET_KEY: '',
      }),
    ).toBe(false);
  });

  it('only renders ClerkProvider when a publishable key is present', () => {
    expect(hasDashboardClerkProvider({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '' })).toBe(false);
    expect(
      hasDashboardClerkProvider({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture' }),
    ).toBe(true);
  });

  it('has App Router sign-in, sign-up, provider, and proxy files wired', () => {
    expect(read('apps/dashboard/src/app/layout.tsx')).toContain('<DashboardClerkProvider>');
    expect(read('apps/dashboard/src/proxy.ts')).toContain('clerkMiddleware');
    expect(read('apps/dashboard/src/proxy.ts')).toContain('auth.protect()');
    expect(read('apps/dashboard/src/app/sign-in/[[...sign-in]]/page.tsx')).toContain('<SignIn');
    expect(read('apps/dashboard/src/app/sign-up/[[...sign-up]]/page.tsx')).toContain('<SignUp');
    expect(read('apps/dashboard/src/components/dashboard-shell.tsx')).toContain(
      '<DashboardAuthControls />',
    );
  });

  it('defaults to dark theme without locking the light theme toggle out', () => {
    const layout = read('apps/dashboard/src/app/layout.tsx');
    expect(layout).toContain('className="dark"');
    expect(layout).not.toContain("colorScheme: 'dark'");
    expect(read('apps/dashboard/src/components/theme-provider.tsx')).toContain(
      'defaultTheme="dark"',
    );
    expect(read('apps/dashboard/src/components/theme-provider.tsx')).toContain(
      'enableSystem={false}',
    );
    expect(read('apps/dashboard/src/components/dashboard-shell.tsx')).toContain('<ThemeToggle />');
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}
