#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const forbiddenDatabaseRoles = new Set(['neondb_owner', 'postgres']);
const requiredProfile = Object.freeze({
  LODARIQ_AUTH_MODE: 'lodariq',
  LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
  LODARIQ_EXPOSE_DEV_VERIFICATION_TOKEN: 'false',
  LODARIQ_PASSWORD_RECOVERY_MODE: 'email',
  LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
});

export function createProductionParityLocalEnvironment(source = process.env) {
  const configured = {
    ...source,
    LODARIQ_API_BASE_URL: 'http://127.0.0.1:3001',
    LODARIQ_APP_BASE_URL: 'http://localhost:3000',
    LODARIQ_AUTH_MODE: 'lodariq',
    LODARIQ_EMAIL_DELIVERY_MODE: 'resend',
    LODARIQ_EXPOSE_DEV_VERIFICATION_TOKEN: 'false',
    LODARIQ_PASSWORD_HASH_MAX_ACTIVE: '1',
    LODARIQ_PASSWORD_HASH_MAX_QUEUED: '8',
    LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS: '2000',
    LODARIQ_PASSWORD_RECOVERY_MODE: 'email',
    LODARIQ_PUBLIC_SIGNUP_MODE: 'email-verification',
  };
  // Owner/admin URLs are operator-only and must not reach runtime packages.
  for (const name of [
    'NEON_DB_URL',
    'NEON_OWNER_DATABASE_URL',
    'PRODUCTION_NEON_OWNER_DATABASE_URL',
    'STAGING_NEON_OWNER_DATABASE_URL',
  ]) {
    delete configured[name];
  }
  return configured;
}

export function validateLocalAuthEnvironment(environment = process.env) {
  const failures = [];

  for (const [name, expected] of Object.entries(requiredProfile)) {
    if (environment[name]?.trim() !== expected) {
      failures.push(`${name} must be ${JSON.stringify(expected)}.`);
    }
  }

  validateDatabaseUrl(environment.DATABASE_URL, failures);
  validateAppOrigin(environment.LODARIQ_APP_BASE_URL, failures);
  validateResendKey(environment.RESEND_API_KEY, failures);
  validateSender(environment.LODARIQ_AUTH_EMAIL_FROM, failures);
  validateSecret(
    'LODARIQ_AUTH_EMAIL_TOKEN_SECRET',
    environment.LODARIQ_AUTH_EMAIL_TOKEN_SECRET,
    failures,
  );
  validateBoundedInteger('LODARIQ_PASSWORD_HASH_MAX_ACTIVE', environment, failures, 1, 4);
  validateBoundedInteger('LODARIQ_PASSWORD_HASH_MAX_QUEUED', environment, failures, 0, 100);
  validateBoundedInteger(
    'LODARIQ_PASSWORD_HASH_QUEUE_TIMEOUT_MS',
    environment,
    failures,
    100,
    30_000,
  );

  return failures;
}

function validateDatabaseUrl(value, failures) {
  if (!value?.trim()) {
    failures.push('DATABASE_URL is required and must use the Neon development runtime role.');
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    failures.push('DATABASE_URL must be a valid PostgreSQL URL.');
    return;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    failures.push('DATABASE_URL must use postgres:// or postgresql://.');
  }
  const role = decodeURIComponent(url.username).trim();
  if (!role || forbiddenDatabaseRoles.has(role)) {
    failures.push('DATABASE_URL must use a non-owner Neon runtime role.');
  }
  if (!url.password) failures.push('DATABASE_URL must include the runtime-role password.');
  if (!url.hostname.endsWith('.neon.tech')) {
    failures.push('DATABASE_URL must target the dedicated Neon development database.');
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== 'require' && sslMode !== 'verify-full') {
    failures.push('DATABASE_URL must require TLS with sslmode=require or sslmode=verify-full.');
  }
}

function validateAppOrigin(value, failures) {
  try {
    const url = new URL(value ?? '');
    if (
      url.protocol !== 'http:' ||
      url.hostname !== 'localhost' ||
      url.port !== '3000' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error('invalid local origin');
    }
  } catch {
    failures.push('LODARIQ_APP_BASE_URL must be exactly http://localhost:3000.');
  }
}

function validateResendKey(value, failures) {
  if (!/^re_[A-Za-z0-9_-]{8,253}$/u.test(value?.trim() ?? '')) {
    failures.push('RESEND_API_KEY must be a valid Resend API key.');
  }
}

function validateSender(value, failures) {
  const sender = value?.trim() ?? '';
  if (!sender || sender.length > 320 || /[\r\n]/u.test(sender)) {
    failures.push('LODARIQ_AUTH_EMAIL_FROM must be a valid verified sender address.');
    return;
  }
  const friendly = /^(?:[^<>]{1,200})<([^<>]+)>$/u.exec(sender);
  const address = friendly?.[1]?.trim() ?? sender;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address)) {
    failures.push('LODARIQ_AUTH_EMAIL_FROM must be a valid verified sender address.');
  }
}

function validateSecret(name, value, failures) {
  const size = Buffer.byteLength(value?.trim() ?? '', 'utf8');
  if (size < 32 || size > 256) failures.push(`${name} must contain between 32 and 256 bytes.`);
}

function validateBoundedInteger(name, environment, failures, minimum, maximum) {
  const raw = environment[name]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failures.push(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = validateLocalAuthEnvironment(
    createProductionParityLocalEnvironment(process.env),
  );
  if (failures.length) {
    console.error('Lodariq local authentication environment is not ready:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Lodariq local Neon + Resend authentication environment is ready.');
}
