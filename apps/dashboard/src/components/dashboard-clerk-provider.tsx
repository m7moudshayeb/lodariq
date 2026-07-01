import { ClerkProvider } from '@clerk/nextjs';
import { readDashboardClerkConfig } from '../lib/clerk-config';

interface DashboardClerkProviderProps {
  children: React.ReactNode;
}

export function DashboardClerkProvider({
  children,
}: DashboardClerkProviderProps): React.ReactElement {
  const config = readDashboardClerkConfig();

  if (!config.publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={config.publishableKey}
      signInUrl={config.signInPath}
      signUpUrl={config.signUpPath}
      signInFallbackRedirectUrl={config.afterAuthPath}
      signUpFallbackRedirectUrl={config.afterAuthPath}
      afterSignOutUrl={config.signInPath}
      appearance={{
        variables: {
          colorPrimary: '#174f55',
          colorPrimaryForeground: '#ffffff',
          colorBackground: '#ffffff',
          colorForeground: '#18212f',
          colorMutedForeground: '#697386',
          colorInput: '#f6f7f9',
          colorInputForeground: '#18212f',
          colorBorder: '#dbe2ea',
          colorRing: '#2458c7',
          borderRadius: '0.625rem',
        },
        elements: {
          cardBox: 'shadow-none border border-border bg-card',
          formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
          footerActionLink: 'text-primary hover:text-primary',
          headerTitle: 'text-foreground',
          headerSubtitle: 'text-muted-foreground',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
