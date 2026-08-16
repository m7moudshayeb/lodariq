import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { EnterpriseSsoConnectionRecord } from '@lodariq/database';
import type { AuthAssuranceLevel } from '@lodariq/schema';
import { matchesSha256, sha256Hex } from './oidc-crypto';

const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1_000;
const MAX_ID_TOKEN_BYTES = 16_384;
const MAX_GROUPS = 100;
const OKTA_ISSUER_SUFFIXES = ['okta.com', 'okta-emea.com', 'oktapreview.com'] as const;

export interface VerifiedEnterpriseOidcIdentity {
  issuer: string;
  subject: string;
  externalId: string;
  providerTenantId: string | null;
  email: string;
  emailVerified: true;
  name: string | null;
  groupIds: string[];
  assuranceLevel: AuthAssuranceLevel;
}

export interface EnterpriseOidcConfiguration {
  stateSecret: string;
  redirectUri: string;
  resolveClientSecret(connectionId: string): Promise<string | null>;
}

interface DiscoveryDocument {
  issuer: string;
  authorizationEndpoint: URL;
  tokenEndpoint: URL;
  jwksUri: URL;
}

interface CachedDiscovery {
  value: DiscoveryDocument;
  expiresAt: number;
}

export class EnterpriseOidcProvider {
  private readonly discovery = new Map<string, CachedDiscovery>();
  private readonly jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  constructor(private readonly configuration: EnterpriseOidcConfiguration) {}

  async begin(
    connection: EnterpriseSsoConnectionRecord,
    input: { state: string; nonce: string; codeChallenge: string },
  ): Promise<URL> {
    const discovery = await this.resolveDiscovery(connection);
    const url = new URL(discovery.authorizationEndpoint);
    url.searchParams.set('client_id', connection.clientId);
    url.searchParams.set('redirect_uri', this.configuration.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile groups');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url;
  }

  async verifyCallback(
    connection: EnterpriseSsoConnectionRecord,
    input: { code: string; codeVerifier: string; expectedNonce: string },
  ): Promise<VerifiedEnterpriseOidcIdentity> {
    const [discovery, clientSecret] = await Promise.all([
      this.resolveDiscovery(connection),
      this.configuration.resolveClientSecret(connection.id),
    ]);
    if (!clientSecret || Buffer.byteLength(clientSecret, 'utf8') < 16) {
      throw new Error('Enterprise OIDC client credential is unavailable');
    }
    const response = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        client_id: connection.clientId,
        client_secret: clientSecret,
        redirect_uri: this.configuration.redirectUri,
        code_verifier: input.codeVerifier,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error('Enterprise OIDC token exchange failed');
    const payload = (await response.json()) as { id_token?: unknown };
    if (
      typeof payload.id_token !== 'string' ||
      Buffer.byteLength(payload.id_token, 'utf8') > MAX_ID_TOKEN_BYTES
    ) {
      throw new Error('Enterprise OIDC response did not contain a bounded ID token');
    }
    let jwks = this.jwks.get(discovery.jwksUri.toString());
    if (!jwks) {
      jwks = createRemoteJWKSet(discovery.jwksUri, {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: DISCOVERY_CACHE_TTL_MS,
      });
      this.jwks.set(discovery.jwksUri.toString(), jwks);
    }
    const verified = await jwtVerify(payload.id_token, jwks, {
      issuer: discovery.issuer,
      audience: connection.clientId,
      algorithms: ['RS256'],
      clockTolerance: 5,
      maxTokenAge: '10m',
    });
    return verifiedIdentity(connection, verified.payload, input.expectedNonce);
  }

  private async resolveDiscovery(
    connection: EnterpriseSsoConnectionRecord,
  ): Promise<DiscoveryDocument> {
    assertEnterpriseIssuer(connection);
    const cacheKey = `${connection.id}:${connection.updatedAt}`;
    const cached = this.discovery.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const issuer = canonicalUrl(connection.issuer);
    const discoveryUrl = new URL(`${issuer.toString().replace(/\/$/u, '')}/.well-known/openid-configuration`);
    const response = await fetch(discoveryUrl, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Enterprise OIDC discovery failed');
    const body = (await response.json()) as Record<string, unknown>;
    if (
      typeof body.issuer !== 'string' ||
      typeof body.authorization_endpoint !== 'string' ||
      typeof body.token_endpoint !== 'string' ||
      typeof body.jwks_uri !== 'string'
    ) {
      throw new Error('Enterprise OIDC discovery document is incomplete');
    }
    const discoveredIssuer = canonicalUrl(body.issuer);
    if (discoveredIssuer.toString() !== issuer.toString()) {
      throw new Error('Enterprise OIDC discovery issuer does not match the validated connection');
    }
    const value: DiscoveryDocument = {
      issuer: discoveredIssuer.toString().replace(/\/$/u, ''),
      authorizationEndpoint: trustedProviderEndpoint(connection, body.authorization_endpoint),
      tokenEndpoint: trustedProviderEndpoint(connection, body.token_endpoint),
      jwksUri: trustedProviderEndpoint(connection, body.jwks_uri),
    };
    this.discovery.clear();
    this.discovery.set(cacheKey, { value, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
    return value;
  }
}

export function readEnterpriseOidcConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): EnterpriseOidcConfiguration | null {
  const mode = environment.LODARIQ_ENTERPRISE_OIDC_MODE?.trim() ?? 'disabled';
  if (mode === 'disabled') return null;
  if (mode !== 'enabled') {
    throw new Error('LODARIQ_ENTERPRISE_OIDC_MODE must be enabled or disabled');
  }
  const stateSecret = environment.LODARIQ_OIDC_STATE_SECRET?.trim() ?? '';
  if (Buffer.byteLength(stateSecret, 'utf8') < 32) {
    throw new Error('LODARIQ_OIDC_STATE_SECRET must contain at least 32 bytes');
  }
  const redirectUri = exactEnterpriseRedirectUri(
    environment.LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI?.trim() ?? '',
  );
  const secrets = parseSecretMap(environment.LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS ?? '');
  return {
    stateSecret,
    redirectUri,
    async resolveClientSecret(connectionId) {
      return secrets.get(connectionId) ?? null;
    },
  };
}

function verifiedIdentity(
  connection: EnterpriseSsoConnectionRecord,
  payload: JWTPayload,
  expectedNonce: string,
): VerifiedEnterpriseOidcIdentity {
  if (
    typeof payload.nonce !== 'string' ||
    !matchesSha256(payload.nonce, sha256Hex(expectedNonce)) ||
    typeof payload.iss !== 'string' ||
    canonicalUrl(payload.iss).toString() !== canonicalUrl(connection.issuer).toString() ||
    typeof payload.sub !== 'string' ||
    !payload.sub
  ) {
    throw new Error('Enterprise OIDC token proof binding failed');
  }
  const email = firstString(payload.email, payload.preferred_username, payload.upn);
  if (!email || email.length > 320 || !email.includes('@')) {
    throw new Error('Enterprise OIDC token does not contain an email claim');
  }
  const externalId = firstString(payload.oid, payload.uid, payload.sub);
  if (!externalId || externalId.length > 512) {
    throw new Error('Enterprise OIDC token does not contain a stable external identifier');
  }
  const groups = Array.isArray(payload.groups)
    ? payload.groups.filter((value): value is string => typeof value === 'string').slice(0, MAX_GROUPS)
    : [];
  if (Array.isArray(payload.groups) && groups.length !== payload.groups.length) {
    throw new Error('Enterprise OIDC group claims are invalid or exceed the supported limit');
  }
  const amr = Array.isArray(payload.amr)
    ? payload.amr.filter((value): value is string => typeof value === 'string')
    : [];
  const tenantId = firstString(payload.tid, payload.org_id);
  return {
    issuer: canonicalUrl(payload.iss).toString().replace(/\/$/u, ''),
    subject: payload.sub,
    externalId,
    providerTenantId: tenantId?.slice(0, 256) ?? null,
    email,
    // A validated enterprise issuer plus a separately verified workspace domain
    // is the authority for this claim. The repository still rejects an existing
    // email and never uses it to link an account.
    emailVerified: true,
    name: typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 120)
      : null,
    groupIds: [...new Set(groups)],
    assuranceLevel: amr.includes('mfa') ? 'aal2' : 'aal1',
  };
}

function assertEnterpriseIssuer(connection: EnterpriseSsoConnectionRecord): void {
  if (connection.protocol !== 'oidc' || connection.status !== 'active' || !connection.validatedAt) {
    throw new Error('Enterprise OIDC connection is not active and validated');
  }
  const issuer = canonicalUrl(connection.issuer);
  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.port ||
    issuer.hostname === 'localhost' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(issuer.hostname) ||
    issuer.hostname.includes(':')
  ) {
    throw new Error('Enterprise OIDC issuer is not a trusted public HTTPS endpoint');
  }
  if (connection.provider === 'entra' && issuer.hostname !== 'login.microsoftonline.com') {
    throw new Error('Microsoft Entra issuer host is invalid');
  }
  if (connection.provider === 'okta' && !isAllowedOktaHost(issuer.hostname)) {
    throw new Error('Okta issuer must use a supported Okta tenant hostname');
  }
}

function trustedProviderEndpoint(
  connection: EnterpriseSsoConnectionRecord,
  rawValue: string,
): URL {
  const endpoint = canonicalUrl(rawValue);
  const issuer = canonicalUrl(connection.issuer);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port) {
    throw new Error('Enterprise OIDC endpoint must be public HTTPS');
  }
  if (connection.provider === 'okta' && endpoint.origin !== issuer.origin) {
    throw new Error('Okta OIDC endpoints must remain on the validated issuer origin');
  }
  if (connection.provider === 'entra' && endpoint.hostname !== 'login.microsoftonline.com') {
    throw new Error('Microsoft Entra OIDC endpoint host is invalid');
  }
  return endpoint;
}

function exactEnterpriseRedirectUri(value: string): string {
  const url = new URL(value);
  if (
    url.pathname !== '/api/auth/enterprise/oidc/callback' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
  ) {
    throw new Error('LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI must be an exact callback URL');
  }
  return url.toString();
}

function parseSecretMap(raw: string): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS must be an object');
  }
  const values = new Map<string, string>();
  const entries = Object.entries(parsed);
  if (entries.length < 1 || entries.length > 100) {
    throw new Error('Enterprise OIDC client secret map must contain between one and 100 entries');
  }
  for (const [connectionId, secret] of entries) {
    if (
      !/^sso_[A-Za-z0-9_-]{20,}$/u.test(connectionId) ||
      typeof secret !== 'string' ||
      Buffer.byteLength(secret, 'utf8') < 32 ||
      Buffer.byteLength(secret, 'utf8') > 1024 ||
      /[\r\n]/u.test(secret)
    ) {
      throw new Error('Enterprise OIDC client secret map contains an invalid entry');
    }
    values.set(connectionId, secret);
  }
  if (values.size === 0) throw new Error('Enterprise OIDC client secret map is empty');
  return values;
}

function isAllowedOktaHost(hostname: string): boolean {
  return OKTA_ISSUER_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function canonicalUrl(value: string): URL {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url;
}

function firstString(...values: unknown[]): string | null {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value)) ?? null;
}
