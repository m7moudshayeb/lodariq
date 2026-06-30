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
          colorPrimary: '#34d399',
          colorPrimaryForeground: '#052e2b',
          colorBackground: '#111827',
          colorForeground: '#f8fafc',
          colorMutedForeground: '#94a3b8',
          colorInput: '#020617',
          colorInputForeground: '#f8fafc',
          colorBorder: '#334155',
          colorRing: '#34d399',
          borderRadius: '0.5rem',
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
