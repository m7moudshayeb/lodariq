#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import process, { stderr, stdout } from 'node:process';
import { URL } from 'node:url';

function main(env = process.env) {
  const failures = [];

  if (env.NODE_ENV !== 'production') {
    failures.push('NODE_ENV must be production for the deployed dashboard runtime.');
  }

  requireOwnedAuthMode(env.LODARIQ_AUTH_MODE, failures);
  requireHttpsUrl('LODARIQ_API_BASE_URL', env.LODARIQ_API_BASE_URL, failures);
  requireSecret('LODARIQ_AUTH_BFF_SOURCE_SECRET', env.LODARIQ_AUTH_BFF_SOURCE_SECRET, failures);
  requireSignupMode(env.LODARIQ_PUBLIC_SIGNUP_MODE, failures);
  requirePasswordRecoveryMode(env.LODARIQ_PASSWORD_RECOVERY_MODE, failures);

  if (failures.length) {
    fail(failures);
  }

  stdout.write('Lodariq dashboard production environment is ready for a live smoke check.\n');
}

function requirePasswordRecoveryMode(value, failures) {
  if (value === undefined || value === '') return;
  const mode = value.trim();
  if (mode !== 'disabled' && mode !== 'email') {
    failures.push('LODARIQ_PASSWORD_RECOVERY_MODE must be "disabled" or "email" when set.');
  }
}

function requireSignupMode(value, failures) {
  if (value === undefined || value === '') return;
  const mode = value.trim();
  if (mode !== 'disabled' && mode !== 'email-verification') {
    failures.push(
      'LODARIQ_PUBLIC_SIGNUP_MODE must be "disabled" or "email-verification" when set.',
    );
  }
}

function requireSecret(name, value, failures) {
  if (!value || Buffer.byteLength(value.trim()) < 32) {
    failures.push(`${name} must be a server-only secret of at least 32 bytes.`);
  }
}

function requireOwnedAuthMode(value, failures) {
  if (value?.trim() !== 'lodariq') {
    failures.push(
      'LODARIQ_AUTH_MODE must be "lodariq" for the deployed dashboard runtime; header auth is local/test-only.',
    );
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

function fail(failures) {
  stderr.write(`Lodariq dashboard production environment is not ready:\n`);
  for (const failure of failures) {
    stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

main();
