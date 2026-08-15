#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import process, { stderr, stdout } from 'node:process';
import { URL } from 'node:url';

const forbiddenDatabaseRoles = new Set(['neondb_owner', 'postgres']);

const requiredHttpsUrls = [
  'LODARIQ_PUBLIC_API_BASE_URL',
  'LODARIQ_LOADER_SRC',
  'LODARIQ_PUBLIC_LOADER_SRC',
  'LODARIQ_CREATOR_LOADER_SRC',
  'LODARIQ_CREATOR_MODULE_URL',
  'LODARIQ_AUTHORING_IFRAME_SRC',
];

function main(env = process.env) {
  const failures = [];

  if (env.NODE_ENV !== 'production') {
    failures.push('NODE_ENV must be production for the deployed API runtime.');
  }

  requireOwnedAuthMode(env.LODARIQ_AUTH_MODE, failures);
  requireInternalBffSecret(env.LODARIQ_AUTH_BFF_SOURCE_SECRET, failures);
  requireEmailVerification(env, failures);
  requirePublicAuthCapabilities(env, failures);
  requirePasswordHashAdmission(env, failures);
  requireWebAuthnConfiguration(env, failures);
  requireOidcConfiguration(env, failures);
  requireEnterpriseOidcConfiguration(env, failures);

  if (env.LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL?.trim()) {
    failures.push(
      'LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL is operator-only and must not enter the API runtime.',
    );
  }

  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL, failures);
  if (databaseUrl) {
    if (forbiddenDatabaseRoles.has(databaseUrl.username)) {
      failures.push('DATABASE_URL must use a non-owner app role with BYPASSRLS disabled.');
    }
    if (!databaseUrl.password) {
      failures.push('DATABASE_URL must include the runtime database role password.');
    }
  }

  for (const key of requiredHttpsUrls) {
    requireHttpsUrl(key, env[key], failures);
  }
  requireCreatorModuleDescriptor(env, failures);
  requireDeploymentOriginTuple(env, failures);

  if (failures.length) {
    fail(failures);
  }

  stdout.write('Lodariq API production environment is ready for a live smoke check.\n');
}

function requireDeploymentOriginTuple(env, failures) {
  const tuples = {
    'https://dev-api.lodariq.io': {
      app: 'https://dev-app.lodariq.io',
      cdn: 'https://dev-cdn.lodariq.io',
      editor: 'https://dev-editor.lodariq.io',
    },
    'https://api.lodariq.io': {
      app: 'https://app.lodariq.io',
      cdn: 'https://cdn.lodariq.io',
      editor: 'https://editor.lodariq.io',
    },
    'https://staging-api.lodariq.io': {
      app: 'https://staging-app.lodariq.io',
      cdn: 'https://staging-cdn.lodariq.io',
      editor: 'https://staging-editor.lodariq.io',
    },
  };
  const apiOrigin = exactOrigin(env.LODARIQ_PUBLIC_API_BASE_URL);
  const tuple = tuples[apiOrigin];
  if (!tuple) {
    failures.push('LODARIQ_PUBLIC_API_BASE_URL must select a canonical Lodariq deployment.');
    return;
  }
  for (const key of [
    'LODARIQ_LOADER_SRC',
    'LODARIQ_PUBLIC_LOADER_SRC',
    'LODARIQ_CREATOR_LOADER_SRC',
    'LODARIQ_CREATOR_MODULE_URL',
  ]) {
    if (exactOrigin(env[key]) !== tuple.cdn) {
      failures.push(`${key} must use the selected deployment CDN origin.`);
    }
  }
  if (exactOrigin(env.LODARIQ_AUTHORING_IFRAME_SRC) !== tuple.editor) {
    failures.push('LODARIQ_AUTHORING_IFRAME_SRC must use the selected editor origin.');
  }
  if (
    env.LODARIQ_WEBAUTHN_MODE?.trim() === 'enabled' &&
    exactOrigin(env.LODARIQ_WEBAUTHN_ORIGIN) !== tuple.app
  ) {
    failures.push('LODARIQ_WEBAUTHN_ORIGIN must use the selected deployment app origin.');
  }
  if (env.LODARIQ_OIDC_MODE?.trim() === 'enabled') {
    for (const key of [
      'LODARIQ_GOOGLE_OIDC_REDIRECT_URI',
      'LODARIQ_MICROSOFT_OIDC_REDIRECT_URI',
    ]) {
      if (env[key]?.trim() && exactOrigin(env[key]) !== tuple.app) {
        failures.push(`${key} must use the selected deployment app origin.`);
      }
    }
  }
  if (
    env.LODARIQ_ENTERPRISE_OIDC_MODE?.trim() === 'enabled' &&
    exactOrigin(env.LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI) !== tuple.app
  ) {
    failures.push(
      'LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI must use the selected deployment app origin.',
    );
  }
  if (apiOrigin !== 'https://api.lodariq.io') {
    const allowedOrigins = new Set(
      (env.LODARIQ_AUTH_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!allowedOrigins.has(tuple.app)) {
      failures.push(
        'LODARIQ_AUTH_ALLOWED_ORIGINS must include the selected non-production app origin.',
      );
    }
  }
}

function requireWebAuthnConfiguration(env, failures) {
  const mode = env.LODARIQ_WEBAUTHN_MODE?.trim() ?? 'disabled';
  if (mode === 'disabled') return;
  if (mode !== 'enabled') {
    failures.push('LODARIQ_WEBAUTHN_MODE must be "enabled" or "disabled".');
    return;
  }
  const origin = exactOrigin(env.LODARIQ_WEBAUTHN_ORIGIN);
  if (!origin || origin !== env.LODARIQ_WEBAUTHN_ORIGIN?.trim() || !origin.startsWith('https://')) {
    failures.push('LODARIQ_WEBAUTHN_ORIGIN must be an exact HTTPS origin.');
    return;
  }
  const host = new URL(origin).hostname;
  if (env.LODARIQ_WEBAUTHN_RP_ID?.trim() !== host) {
    failures.push('LODARIQ_WEBAUTHN_RP_ID must equal the WebAuthn origin host.');
  }
}

function requireOidcConfiguration(env, failures) {
  const mode = env.LODARIQ_OIDC_MODE?.trim() ?? 'disabled';
  if (mode === 'disabled') return;
  if (mode !== 'enabled') {
    failures.push('LODARIQ_OIDC_MODE must be "enabled" or "disabled".');
    return;
  }
  requireInternalSecret('LODARIQ_OIDC_STATE_SECRET', env.LODARIQ_OIDC_STATE_SECRET, failures);
  let providerCount = 0;
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    const clientId = env[`LODARIQ_${provider}_OIDC_CLIENT_ID`]?.trim();
    const clientSecret = env[`LODARIQ_${provider}_OIDC_CLIENT_SECRET`]?.trim();
    const redirectUri = env[`LODARIQ_${provider}_OIDC_REDIRECT_URI`]?.trim();
    const configured = [clientId, clientSecret, redirectUri].filter(Boolean).length;
    if (configured === 0) continue;
    providerCount += 1;
    if (configured !== 3) failures.push(`${provider} OIDC configuration must be complete.`);
    requireExactOidcRedirectUri(
      `LODARIQ_${provider}_OIDC_REDIRECT_URI`,
      redirectUri,
      `/api/auth/oidc/${provider.toLowerCase()}/callback`,
      failures,
    );
  }
  if (providerCount === 0) failures.push('At least one OIDC provider must be configured.');
  const tenant = env.LODARIQ_MICROSOFT_OIDC_TENANT?.trim() ?? '';
  if (
    env.LODARIQ_MICROSOFT_OIDC_CLIENT_ID?.trim() &&
    !/^(?:common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.test(tenant)
  ) {
    failures.push('LODARIQ_MICROSOFT_OIDC_TENANT is invalid.');
  }
}

function requireEnterpriseOidcConfiguration(env, failures) {
  const mode = env.LODARIQ_ENTERPRISE_OIDC_MODE?.trim() ?? 'disabled';
  const dependentValues = [
    env.LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI?.trim(),
    env.LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS?.trim(),
  ].filter(Boolean);
  if (mode === 'disabled') {
    if (dependentValues.length) {
      failures.push(
        'Enterprise OIDC callback and client secrets must be absent when enterprise OIDC is disabled.',
      );
    }
    return;
  }
  if (mode !== 'enabled') {
    failures.push('LODARIQ_ENTERPRISE_OIDC_MODE must be "enabled" or "disabled".');
    return;
  }
  requireInternalSecret('LODARIQ_OIDC_STATE_SECRET', env.LODARIQ_OIDC_STATE_SECRET, failures);
  requireExactOidcRedirectUri(
    'LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI',
    env.LODARIQ_ENTERPRISE_OIDC_REDIRECT_URI?.trim(),
    '/api/auth/enterprise/oidc/callback',
    failures,
  );
  const rawSecrets = env.LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS?.trim() ?? '';
  let secrets;
  try {
    secrets = JSON.parse(rawSecrets);
  } catch {
    failures.push('LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS must be a JSON object.');
    return;
  }
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    failures.push('LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS must be a JSON object.');
    return;
  }
  const entries = Object.entries(secrets);
  if (entries.length < 1 || entries.length > 100) {
    failures.push(
      'LODARIQ_ENTERPRISE_OIDC_CLIENT_SECRETS must contain between one and 100 connections.',
    );
  }
  for (const [connectionId, secret] of entries) {
    if (!/^sso_[A-Za-z0-9_-]{20,}$/u.test(connectionId)) {
      failures.push('Enterprise OIDC client secret map contains an invalid connection ID.');
    }
    const byteLength = typeof secret === 'string' ? Buffer.byteLength(secret, 'utf8') : 0;
    if (byteLength < 32 || byteLength > 1024 || /[\r\n]/u.test(String(secret))) {
      failures.push(`Enterprise OIDC client secret for ${connectionId} is invalid.`);
    }
  }
}

function requireExactOidcRedirectUri(name, value, expectedPath, failures) {
  try {
    const url = new URL(value ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== expectedPath ||
      url.search ||
      url.hash
    ) {
      failures.push(`${name} must be an exact public HTTPS callback URL.`);
    }
  } catch {
    failures.push(`${name} must be an exact public HTTPS callback URL.`);
  }
}

function exactOrigin(value) {
  try {
    const url = new URL(value?.trim() ?? '');
    return url.origin;
  } catch {
    return '';
  }
}

function requireInternalBffSecret(value, failures) {
  if (!value?.trim() || Buffer.byteLength(value.trim()) < 32) {
    failures.push('LODARIQ_AUTH_BFF_SOURCE_SECRET must contain at least 32 bytes.');
  }
}

function requireEmailVerification(env, failures) {
  const mode = env.LODARIQ_EMAIL_DELIVERY_MODE?.trim();
  if (mode === 'disabled') return;
  if (mode !== 'resend') {
    failures.push('LODARIQ_EMAIL_DELIVERY_MODE must be "disabled" or "resend".');
    return;
  }

  requireHttpsOrigin('LODARIQ_APP_BASE_URL', env.LODARIQ_APP_BASE_URL, failures);
  if (!/^re_[A-Za-z0-9_-]{8,253}$/u.test(env.RESEND_API_KEY?.trim() ?? '')) {
    failures.push('RESEND_API_KEY must be a valid Resend API key when email delivery is enabled.');
  }
  if (!env.LODARIQ_AUTH_EMAIL_FROM?.trim()) {
    failures.push('LODARIQ_AUTH_EMAIL_FROM is required when email delivery is enabled.');
  }
  requireEmailTokenKeyring(env, failures);
}

function requireEmailTokenKeyring(env, failures) {
  const serialized = env.LODARIQ_AUTH_EMAIL_TOKEN_KEYS?.trim();
  if (!serialized) {
    requireInternalSecret(
      'LODARIQ_AUTH_EMAIL_TOKEN_SECRET',
      env.LODARIQ_AUTH_EMAIL_TOKEN_SECRET,
      failures,
    );
    return;
  }
  let keys;
  try {
    keys = JSON.parse(serialized);
  } catch {
    failures.push('LODARIQ_AUTH_EMAIL_TOKEN_KEYS must be a JSON object.');
    return;
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    failures.push('LODARIQ_AUTH_EMAIL_TOKEN_KEYS must be a JSON object.');
    return;
  }
  const entries = Object.entries(keys);
  if (entries.length < 1 || entries.length > 8) {
    failures.push('LODARIQ_AUTH_EMAIL_TOKEN_KEYS must contain between one and eight keys.');
  }
  for (const [keyId, secret] of entries) {
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(keyId)) {
      failures.push(`Invalid auth email token key id: ${keyId}.`);
    }
    requireInternalSecret(`LODARIQ_AUTH_EMAIL_TOKEN_KEYS.${keyId}`, secret, failures);
  }
  const activeKeyId = env.LODARIQ_AUTH_EMAIL_TOKEN_ACTIVE_KEY_ID?.trim() ?? '';
  if (!Object.hasOwn(keys, activeKeyId)) {
    failures.push('LODARIQ_AUTH_EMAIL_TOKEN_ACTIVE_KEY_ID must identify a configured key.');
  }
}

function requirePublicAuthCapabilities(env, failures) {
  const signupMode = env.LODARIQ_PUBLIC_SIGNUP_MODE?.trim();
  const recoveryMode = env.LODARIQ_PASSWORD_RECOVERY_MODE?.trim();
  if (signupMode !== 'disabled' && signupMode !== 'email-verification') {
    failures.push('LODARIQ_PUBLIC_SIGNUP_MODE must be "disabled" or "email-verification".');
  }
  if (recoveryMode !== 'disabled' && recoveryMode !== 'email') {
    failures.push('LODARIQ_PASSWORD_RECOVERY_MODE must be "disabled" or "email".');
  }
  if (
    (signupMode === 'email-verification' || recoveryMode === 'email') &&
    env.LODARIQ_EMAIL_DELIVERY_MODE?.trim() !== 'resend'
  ) {
    failures.push(
      'Public signup and password recovery require LODARIQ_EMAIL_DELIVERY_MODE="resend".',
    );
  }
}

function requirePasswordHashAdmission(env, failures) {
  requireBoundedInteger('LODARIQ_PASSWORD_HASH_MAX_ACTIVE', env, failures, 1, 4);
  requireBoundedInteger('LODARIQ_PASSWORD_HASH_MAX_QUEUED', env, failures, 0, 100);
  requireBoundedInteger('LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS', env, failures, 100, 30_000);
}

function requireBoundedInteger(name, env, failures, minimum, maximum) {
  const raw = env[name]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failures.push(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function requireInternalSecret(name, value, failures) {
  if (!value?.trim() || Buffer.byteLength(value.trim()) < 32) {
    failures.push(`${name} must contain at least 32 bytes.`);
  }
}

function requireOwnedAuthMode(value, failures) {
  if (value?.trim() !== 'lodariq') {
    failures.push(
      'LODARIQ_AUTH_MODE must be "lodariq" for the deployed API runtime; header auth is local/test-only.',
    );
  }
}

function requireCreatorModuleDescriptor(env, failures) {
  const urlValue = env.LODARIQ_CREATOR_MODULE_URL?.trim();
  const version = env.LODARIQ_CREATOR_MODULE_VERSION?.trim();
  const integrity = env.LODARIQ_CREATOR_MODULE_INTEGRITY?.trim();
  if (!version) failures.push('LODARIQ_CREATOR_MODULE_VERSION is required.');
  if (!integrity) {
    failures.push('LODARIQ_CREATOR_MODULE_INTEGRITY is required.');
    return;
  }
  if (!/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
    failures.push('LODARIQ_CREATOR_MODULE_INTEGRITY must be a sha256 SRI value.');
    return;
  }
  if (!urlValue) return;
  try {
    const url = new URL(urlValue);
    const pathDigest = /\/sha256-([0-9a-f]{64})(?:\/|$)/u.exec(url.pathname)?.[1];
    const integrityDigest = Buffer.from(integrity.slice('sha256-'.length), 'base64').toString(
      'hex',
    );
    if (!pathDigest || pathDigest !== integrityDigest) {
      failures.push(
        'LODARIQ_CREATOR_MODULE_URL content address must match LODARIQ_CREATOR_MODULE_INTEGRITY.',
      );
    }
  } catch {
    // The general URL validator reports malformed values.
  }
}

function parseDatabaseUrl(value, failures) {
  if (!value?.trim()) {
    failures.push('DATABASE_URL is required for the deployed API runtime.');
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      failures.push('DATABASE_URL must use postgres:// or postgresql://.');
    }
    if (!url.username) {
      failures.push('DATABASE_URL must include the runtime database role name.');
    }
    return url;
  } catch {
    failures.push('DATABASE_URL must be a valid PostgreSQL connection string.');
    return undefined;
  }
}

function requireHttpsUrl(name, value, failures) {
  if (!value?.trim()) {
    failures.push(`${name} is required.`);
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      failures.push(`${name} must use https://.`);
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      failures.push(`${name} must not point at localhost in production.`);
    }
  } catch {
    failures.push(`${name} must be a valid URL.`);
  }
}

function requireHttpsOrigin(name, value, failures) {
  if (!value?.trim()) {
    failures.push(`${name} is required.`);
    return;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1'
    ) {
      failures.push(`${name} must be an absolute public HTTPS origin.`);
    }
  } catch {
    failures.push(`${name} must be an absolute public HTTPS origin.`);
  }
}

function fail(failures) {
  stderr.write(`Lodariq API production environment is not ready:\n`);
  for (const failure of failures) {
    stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

main();
