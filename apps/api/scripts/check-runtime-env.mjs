#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process';
import { URL } from 'node:url';

const forbiddenDatabaseRoles = new Set(['neondb_owner', 'postgres']);

const requiredHttpsUrls = [
  'LODARIQ_PUBLIC_API_BASE_URL',
  'LODARIQ_LOADER_SRC',
  'LODARIQ_CREATOR_LOADER_SRC',
  'LODARIQ_AUTHORING_IFRAME_SRC',
];

function main(env = process.env) {
  const failures = [];

  if (env.NODE_ENV !== 'production') {
    failures.push('NODE_ENV must be production for the deployed API runtime.');
  }

  if (env.LODARIQ_AUTH_MODE?.trim() && env.LODARIQ_AUTH_MODE.trim() !== 'clerk') {
    failures.push('LODARIQ_AUTH_MODE must be unset or "clerk" for the deployed API runtime.');
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

  if (!env.CLERK_SECRET_KEY?.trim() && !env.CLERK_JWT_KEY?.trim()) {
    failures.push('CLERK_SECRET_KEY or CLERK_JWT_KEY is required for Clerk verification.');
  }

  const authorizedParties = parseCsv(env.CLERK_AUTHORIZED_PARTIES);
  if (!authorizedParties.length) {
    failures.push('CLERK_AUTHORIZED_PARTIES must include the exact dashboard origin(s).');
  }
  for (const party of authorizedParties) {
    requireHttpsUrl(`CLERK_AUTHORIZED_PARTIES entry ${party}`, party, failures);
  }

  for (const key of requiredHttpsUrls) {
    requireHttpsUrl(key, env[key], failures);
  }

  if (failures.length) {
    fail(failures);
  }

  stdout.write('Lodariq API production environment is ready for a live smoke check.\n');
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

function parseCsv(value) {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function fail(failures) {
  stderr.write(`Lodariq API production environment is not ready:\n`);
  for (const failure of failures) {
    stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

main();
