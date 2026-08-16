'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { DashboardToaster } from './ui/toaster';

export const dashboardThemeStorageKey = 'lodariq-dashboard-color-scheme-v7';

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={['dark', 'light']}
      storageKey={dashboardThemeStorageKey}
      disableTransitionOnChange
    >
      {children}
      <DashboardToaster />
    </NextThemesProvider>
  );
}
