import type { Metadata } from 'next';
import { DashboardClerkProvider } from '../components/dashboard-clerk-provider';
import { ThemeProvider } from '../components/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lodariq Control Plane',
  description: 'Lodariq dashboard for staging SDK installation and document operations.',
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
