'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function DashboardQueryProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 5 * 60_000,
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return true;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode !== 'number' || statusCode === 429 || statusCode >= 500;
}
