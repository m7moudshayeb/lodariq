#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process';
import { URL } from 'node:url';

function main(env = process.env) {
  const failures = [];

  if (env.NODE_ENV !== 'production') {
    failures.push('NODE_ENV must be production for the deployed dashboard runtime.');
  }

  requireClerkPublishableKey(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, failures);
  requireClerkSecretKey(env.CLERK_SECRET_KEY, failures);
  requireHttpsUrl('LODARIQ_API_BASE_URL', env.LODARIQ_API_BASE_URL, failures);

  if (failures.length) {
    fail(failures);
  }

  stdout.write('Lodariq dashboard production environment is ready for a live smoke check.\n');
}

function requireClerkPublishableKey(value, failures) {
  if (!value?.trim()) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for dashboard sign-in.');
    return;
  }
  if (!/^pk_(test|live)_/.test(value)) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must look like a Clerk publishable key.');
  }
}

function requireClerkSecretKey(value, failures) {
  if (!value?.trim()) {
    failures.push('CLERK_SECRET_KEY is required for dashboard route protection.');
    return;
  }
  if (!/^sk_(test|live)_/.test(value)) {
    failures.push('CLERK_SECRET_KEY must look like a Clerk secret key.');
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
