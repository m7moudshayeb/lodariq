import type { Metadata } from 'next';
import { DashboardClerkProvider } from '../components/dashboard-clerk-provider';
import { ThemeProvider } from '../components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lodariq Experience Workspace',
  description: 'Lodariq dashboard for authoring, installing, and publishing product experiences.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <DashboardClerkProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </DashboardClerkProvider>
      </body>
    </html>
  );
}
