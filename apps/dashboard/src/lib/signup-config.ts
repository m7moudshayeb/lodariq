import 'server-only';

export type PublicSignupMode = 'disabled' | 'email-verification';

export function publicSignupMode(
  environment: Record<string, string | undefined> = process.env,
): PublicSignupMode {
  const configured = environment.LODARIQ_PUBLIC_SIGNUP_MODE?.trim();
  if (configured === 'disabled' || configured === 'email-verification') return configured;
  if (configured) return 'disabled';
  return environment.NODE_ENV === 'production' ? 'disabled' : 'email-verification';
}

export function isPublicSignupEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return publicSignupMode(environment) === 'email-verification';
}
