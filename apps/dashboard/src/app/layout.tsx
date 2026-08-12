import type { Metadata } from 'next';
import { DashboardI18nProvider } from '../components/dashboard-i18n-provider';
import { ThemeProvider } from '../components/theme-provider';
import { DashboardQueryProvider } from '../components/dashboard-query-provider';
import { DASHBOARD_METADATA_MESSAGES } from '../i18n/messages';
import { getDashboardI18n } from '../i18n/server';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { i18n } = await getDashboardI18n();
  return {
    title: i18n._(DASHBOARD_METADATA_MESSAGES.title),
    description: i18n._(DASHBOARD_METADATA_MESSAGES.description),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.ReactElement> {
  const { direction, locale, messages } = await getDashboardI18n();
  return (
    <html dir={direction} lang={locale} className="light" suppressHydrationWarning>
      <body>
        <DashboardI18nProvider locale={locale} messages={messages}>
          <DashboardQueryProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </DashboardQueryProvider>
        </DashboardI18nProvider>
      </body>
    </html>
  );
}
