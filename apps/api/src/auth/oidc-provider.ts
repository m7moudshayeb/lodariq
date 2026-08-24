import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from 'jose';
import type { OidcProviderId, VerifiedExternalIdentity } from '@lodariq/schema';
import type {
  BeginOidcAuthorizationInput,
  IdentityProviderAdapter,
  IdentityProviderRegistry,
  VerifyOidcAuthorizationInput,
} from './identity-provider-adapter';
import { matchesSha256, sha256Hex } from './oidc-crypto';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const MICROSOFT_TENANT_PATTERN =
  /^(?:common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;
const MICROSOFT_TID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface ProviderSettings {
  providerId: OidcProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: URL;
  tokenEndpoint: URL;
  jwksUri: URL;
  issuer: string | string[];
  configuredTenant?: string;
}

export interface OidcConfiguration {
  stateSecret: string;
  providers: IdentityProviderRegistry;
}

export function readOidcConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OidcConfiguration | null {
  const mode = environment.LODARIQ_OIDC_MODE?.trim() ?? 'disabled';
  if (mode === 'disabled') return null;
  if (mode !== 'enabled') throw new Error('LODARIQ_OIDC_MODE must be enabled or disabled');
  const stateSecret = requireSecret('LODARIQ_OIDC_STATE_SECRET', environment);
  const providers = new Map<OidcProviderId, IdentityProviderAdapter>();
  const google = readGoogleSettings(environment);
  if (google) providers.set('google', new StandardOidcProviderAdapter(google));
  const microsoft = readMicrosoftSettings(environment);
  if (microsoft) providers.set('microsoft', new StandardOidcProviderAdapter(microsoft));
  if (providers.size === 0)
    throw new Error('OIDC is enabled but no complete provider is configured');
  return { stateSecret, providers };
}

class StandardOidcProviderAdapter implements IdentityProviderAdapter {
  readonly providerId: OidcProviderId;
  readonly label: string;
  readonly redirectUri: string;
  private readonly jwks;

  constructor(private readonly settings: ProviderSettings) {
    this.providerId = settings.providerId;
    this.label = settings.label;
    this.redirectUri = settings.redirectUri;
    this.jwks = createRemoteJWKSet(settings.jwksUri, {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }

  begin(input: BeginOidcAuthorizationInput): URL {
    const url = new URL(this.settings.authorizationEndpoint);
    url.searchParams.set('client_id', this.settings.clientId);
    url.searchParams.set('redirect_uri', this.settings.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url;
  }

  async verifyCallback(input: VerifyOidcAuthorizationInput): Promise<VerifiedExternalIdentity> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
      redirect_uri: this.settings.redirectUri,
      code_verifier: input.codeVerifier,
    });
    const response = await fetch(this.settings.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('OIDC token exchange failed');
    const tokenResponse = (await response.json()) as { id_token?: unknown };
    if (typeof tokenResponse.id_token !== 'string' || tokenResponse.id_token.length > 16_384) {
      throw new Error('OIDC token response did not contain a bounded ID token');
    }
    const issuer = this.resolveExpectedIssuer(tokenResponse.id_token);
    const verified = await jwtVerify(tokenResponse.id_token, this.jwks, {
      issuer,
      audience: this.settings.clientId,
      algorithms: ['RS256'],
      clockTolerance: 5,
      maxTokenAge: '10m',
    });
    return toVerifiedIdentity(this.settings, verified.payload, input.expectedNonce);
  }

  resolveAssurance(): 'aal1' {
    return 'aal1';
  }

  private resolveExpectedIssuer(idToken: string): string | string[] {
    if (this.providerId === 'google') return this.settings.issuer;
    const tid = decodeJwt(idToken).tid;
    if (typeof tid !== 'string' || !MICROSOFT_TID_PATTERN.test(tid)) {
      throw new Error('Microsoft ID token tenant is invalid');
    }
    const configured = this.settings.configuredTenant;
    if (
      configured &&
      !['common', 'organizations', 'consumers'].includes(configured) &&
      configured !== tid
    ) {
      throw new Error('Microsoft ID token tenant is not allowed');
    }
    return `https://login.microsoftonline.com/${tid}/v2.0`;
  }
}

function toVerifiedIdentity(
  settings: ProviderSettings,
  payload: JWTPayload,
  expectedNonce: string,
): VerifiedExternalIdentity {
  if (
    typeof payload.nonce !== 'string' ||
    !matchesSha256(payload.nonce, sha256Hex(expectedNonce)) ||
    !payload.sub ||
    !payload.iss
  ) {
    throw new Error('OIDC ID token proof binding failed');
  }
  const providerTenantId = settings.providerId === 'microsoft' ? payload.tid : settings.providerId;
  if (typeof providerTenantId !== 'string' || !providerTenantId) {
    throw new Error('OIDC provider tenant is unavailable');
  }
  const identity: VerifiedExternalIdentity = {
    kind: 'oidc',
    issuer: settings.providerId === 'google' ? 'https://accounts.google.com' : payload.iss,
    subject: payload.sub,
    providerTenantId,
    assuranceLevel: 'aal1',
  };
  if (typeof payload.email === 'string') identity.email = payload.email;
  if (typeof payload.email_verified === 'boolean') identity.emailVerified = payload.email_verified;
  if (typeof payload.name === 'string' && payload.name.trim())
    identity.name = payload.name.trim().slice(0, 120);
  return identity;
}

function readGoogleSettings(environment: NodeJS.ProcessEnv): ProviderSettings | null {
  const values = readProviderValues('GOOGLE', environment);
  if (!values) return null;
  return {
    providerId: 'google',
    label: 'Google',
    ...values,
    authorizationEndpoint: new URL('https://accounts.google.com/o/oauth2/v2/auth'),
    tokenEndpoint: new URL('https://oauth2.googleapis.com/token'),
    jwksUri: new URL('https://www.googleapis.com/oauth2/v3/certs'),
    issuer: GOOGLE_ISSUERS,
  };
}

function readMicrosoftSettings(environment: NodeJS.ProcessEnv): ProviderSettings | null {
  const values = readProviderValues('MICROSOFT', environment);
  if (!values) return null;
  const tenant = environment.LODARIQ_MICROSOFT_OIDC_TENANT?.trim().toLowerCase() ?? '';
  if (!MICROSOFT_TENANT_PATTERN.test(tenant)) {
    throw new Error('LODARIQ_MICROSOFT_OIDC_TENANT is invalid');
  }
  const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  return {
    providerId: 'microsoft',
    label: 'Microsoft',
    ...values,
    authorizationEndpoint: new URL(`${base}/authorize`),
    tokenEndpoint: new URL(`${base}/token`),
    jwksUri: new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
    issuer: '',
    configuredTenant: tenant,
  };
}

function readProviderValues(prefix: 'GOOGLE' | 'MICROSOFT', environment: NodeJS.ProcessEnv) {
  const keys = [
    `LODARIQ_${prefix}_OIDC_CLIENT_ID`,
    `LODARIQ_${prefix}_OIDC_CLIENT_SECRET`,
    `LODARIQ_${prefix}_OIDC_REDIRECT_URI`,
  ] as const;
  const values = keys.map((key) => environment[key]?.trim() ?? '');
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) throw new Error(`${prefix} OIDC configuration is incomplete`);
  const redirectUri = requireExactRedirectUri(
    keys[2],
    values[2]!,
    `/v1/auth/oidc/${prefix.toLowerCase()}/callback`,
  );
  return { clientId: values[0]!, clientSecret: values[1]!, redirectUri };
}

function requireExactRedirectUri(key: string, value: string, expectedPath: string): string {
  const url = new URL(value);
  if (
    url.hash ||
    url.search ||
    url.pathname !== expectedPath ||
    (url.protocol !== 'https:' && url.hostname !== 'localhost')
  ) {
    throw new Error(`${key} must be an exact HTTPS callback URL`);
  }
  return url.toString();
}

function requireSecret(key: string, environment: NodeJS.ProcessEnv): string {
  const value = environment[key]?.trim() ?? '';
  if (Buffer.byteLength(value, 'utf8') < 32)
    throw new Error(`${key} must contain at least 32 bytes`);
  return value;
}
