'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export const dashboardThemeStorageKey = 'lodariq-dashboard-color-scheme-v7';

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      themes={['dark', 'light']}
      storageKey={dashboardThemeStorageKey}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
