import type { Metadata } from 'next';
import { ThemeProvider } from '../components/theme-provider';
import { DashboardQueryProvider } from '../components/dashboard-query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lodariq Experience Workspace',
  description: 'Lodariq dashboard for authoring, installing, and publishing product experiences.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body>
        <DashboardQueryProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </DashboardQueryProvider>
      </body>
    </html>
  );
}
