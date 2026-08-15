import type { AuthAssuranceLevel, OidcProviderId, VerifiedExternalIdentity } from '@lodariq/schema';

export interface BeginOidcAuthorizationInput {
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface VerifyOidcAuthorizationInput {
  code: string;
  codeVerifier: string;
  expectedNonce: string;
}

/**
 * Provider-neutral proof boundary. Adapters verify provider tokens but never
 * create Lodariq accounts, sessions, or identity links as a side effect.
 */
export interface IdentityProviderAdapter {
  readonly providerId: OidcProviderId;
  readonly label: string;
  readonly redirectUri: string;
  begin(input: BeginOidcAuthorizationInput): URL;
  verifyCallback(input: VerifyOidcAuthorizationInput): Promise<VerifiedExternalIdentity>;
  resolveAssurance(identity: VerifiedExternalIdentity): AuthAssuranceLevel;
}

export type IdentityProviderRegistry = ReadonlyMap<OidcProviderId, IdentityProviderAdapter>;
