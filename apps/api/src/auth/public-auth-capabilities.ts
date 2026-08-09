export const PUBLIC_SIGNUP_MODES = ['disabled', 'email-verification'] as const;
export const PASSWORD_RECOVERY_MODES = ['disabled', 'email'] as const;

export type PublicSignupMode = (typeof PUBLIC_SIGNUP_MODES)[number];
export type PasswordRecoveryMode = (typeof PASSWORD_RECOVERY_MODES)[number];

export function publicSignupMode(environment: NodeJS.ProcessEnv = process.env): PublicSignupMode {
  const configured = environment.LODARIQ_PUBLIC_SIGNUP_MODE?.trim();
  if (configured === 'disabled' || configured === 'email-verification') return configured;
  if (configured) return 'disabled';
  return environment.NODE_ENV === 'production' ? 'disabled' : 'email-verification';
}

export function passwordRecoveryMode(
  environment: NodeJS.ProcessEnv = process.env,
): PasswordRecoveryMode {
  const configured = environment.LODARIQ_PASSWORD_RECOVERY_MODE?.trim();
  if (configured === 'disabled' || configured === 'email') return configured;
  if (configured) return 'disabled';
  return environment.NODE_ENV === 'production' ? 'disabled' : 'email';
}

export function isPublicSignupEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return publicSignupMode(environment) === 'email-verification';
}

export function isPasswordRecoveryEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return passwordRecoveryMode(environment) === 'email';
}
