export const dashboardSignInPath = '/sign-in';
export const dashboardSignUpPath = '/sign-up';
export const dashboardAfterAuthPath = '/';

export interface DashboardClerkConfig {
  publishableKey?: string;
  secretKey?: string;
  signInPath: string;
  signUpPath: string;
  afterAuthPath: string;
}

export function readDashboardClerkConfig(
  env: Record<string, string | undefined> = process.env,
): DashboardClerkConfig {
  return {
    publishableKey: readEnv(env, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
    secretKey: readEnv(env, 'CLERK_SECRET_KEY'),
    signInPath: dashboardSignInPath,
    signUpPath: dashboardSignUpPath,
    afterAuthPath: dashboardAfterAuthPath,
  };
}

export function hasDashboardClerkProvider(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(readDashboardClerkConfig(env).publishableKey);
}

export function hasDashboardClerkRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const config = readDashboardClerkConfig(env);
  return Boolean(config.publishableKey && config.secretKey);
}

export function shouldProtectDashboardRoutes(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NODE_ENV === 'production' || hasDashboardClerkRuntime(env);
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
