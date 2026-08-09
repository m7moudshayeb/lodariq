import 'server-only';

export type PasswordRecoveryMode = 'disabled' | 'email';

export function passwordRecoveryMode(
  environment: Record<string, string | undefined> = process.env,
): PasswordRecoveryMode {
  const configured = environment.LODARIQ_PASSWORD_RECOVERY_MODE?.trim();
  if (configured === 'disabled' || configured === 'email') return configured;
  if (configured) return 'disabled';
  return environment.NODE_ENV === 'production' ? 'disabled' : 'email';
}

export function isPasswordRecoveryEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return passwordRecoveryMode(environment) === 'email';
}
