import type { AuthSessionRecord, WorkspaceAuthPolicyRecord } from '@lodariq/database';
import type { AuthAssuranceLevel, AuthenticationMethod } from '@lodariq/schema';

export const RECENT_AUTHENTICATION_MAX_AGE_MS = 15 * 60 * 1_000;

const ASSURANCE_RANK = Object.freeze({
  aal1: 1,
  aal2: 2,
  aal3: 3,
} satisfies Record<AuthAssuranceLevel, number>);

export type WorkspaceSessionPolicyFailure =
  'minimum_assurance_required' | 'password_not_allowed' | 'enterprise_sso_required';

export function isRecentAuthentication(
  authenticatedAt: string,
  now: Date,
  maximumAgeMs = RECENT_AUTHENTICATION_MAX_AGE_MS,
): boolean {
  const authenticatedAtMs = Date.parse(authenticatedAt);
  return (
    Number.isFinite(authenticatedAtMs) &&
    Number.isSafeInteger(maximumAgeMs) &&
    maximumAgeMs > 0 &&
    authenticatedAtMs <= now.getTime() + 30_000 &&
    now.getTime() - authenticatedAtMs <= maximumAgeMs
  );
}

export function assuranceAtLeast(
  actual: AuthAssuranceLevel,
  required: AuthAssuranceLevel,
): boolean {
  return ASSURANCE_RANK[actual] >= ASSURANCE_RANK[required];
}

export function workspaceSessionPolicyFailure(
  session: Pick<AuthSessionRecord, 'assuranceLevel' | 'authenticationMethod'>,
  policy: Pick<WorkspaceAuthPolicyRecord, 'minimumAssurance' | 'passwordAllowed' | 'ssoRequired'>,
  workspaceSsoIdentitySatisfied = false,
): WorkspaceSessionPolicyFailure | null {
  if (!assuranceAtLeast(session.assuranceLevel, policy.minimumAssurance)) {
    return 'minimum_assurance_required';
  }
  if (!policy.passwordAllowed && session.authenticationMethod === 'password') {
    return 'password_not_allowed';
  }
  if (
    policy.ssoRequired &&
    (!isSsoAuthenticationMethod(session.authenticationMethod) || !workspaceSsoIdentitySatisfied)
  ) {
    return 'enterprise_sso_required';
  }
  return null;
}

function isSsoAuthenticationMethod(method: AuthenticationMethod): boolean {
  return method === 'oidc' || method === 'saml';
}
