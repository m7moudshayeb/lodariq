import { randomBytes } from 'node:crypto';

const processLocalDevelopmentSecret = randomBytes(32).toString('base64url');

export interface EmailVerificationConfiguration {
  available: boolean;
  secret: string;
  keyId: string;
  exposeDevelopmentToken: boolean;
}

/** Supplied only by a real delivery adapter wired into the API process. */
export interface EmailVerificationDeliveryCapability {
  kind: 'email-verification-dispatcher-v1';
  secret: string;
  keyId?: string;
}

export function readEmailVerificationConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
  deliveryCapability?: EmailVerificationDeliveryCapability,
): EmailVerificationConfiguration {
  const production = environment.NODE_ENV === 'production';
  const configuredSecret = deliveryCapability?.secret.trim();
  const secretIsStrong = Boolean(configuredSecret && Buffer.byteLength(configuredSecret) >= 32);
  return {
    available: production ? Boolean(deliveryCapability) && secretIsStrong : true,
    secret: secretIsStrong ? configuredSecret! : processLocalDevelopmentSecret,
    keyId: deliveryCapability?.keyId ?? 'legacy',
    exposeDevelopmentToken:
      !production && environment.LODARIQ_EXPOSE_DEV_VERIFICATION_TOKEN !== 'false',
  };
}

export function formatEmailVerificationUrl(
  appBaseUrl: string,
  challengeId: string,
  rawToken: string,
): string {
  const url = new URL('/verify-email', appBaseUrl);
  url.searchParams.set('challenge', challengeId);
  // The secret belongs in the fragment so browsers do not send it in HTTP
  // requests, referrers, reverse-proxy logs, or server access logs.
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}

export function formatPasswordResetUrl(
  appBaseUrl: string,
  challengeId: string,
  rawToken: string,
): string {
  const url = new URL('/reset-password', appBaseUrl);
  url.searchParams.set('challenge', challengeId);
  // Password-reset secrets use the fragment for the same reason as email
  // verification secrets: they must not cross the HTTP request boundary.
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}

export function formatWorkspaceInvitationUrl(
  appBaseUrl: string,
  invitationId: string,
  rawToken: string,
): string {
  const url = new URL('/accept-invitation', appBaseUrl);
  url.searchParams.set('invitation', invitationId);
  // Invitation secrets stay in the fragment so they never enter access logs,
  // referrers, server components, or intermediary request metadata.
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}

export function formatAccountEmailChangeUrl(
  appBaseUrl: string,
  challengeId: string,
  proof: 'current_email' | 'new_email',
  rawToken: string,
): string {
  const url = new URL('/account/email-change', appBaseUrl);
  url.searchParams.set('challenge', challengeId);
  url.searchParams.set('proof', proof);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}
