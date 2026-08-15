#!/usr/bin/env node
import process, { stderr, stdout } from 'node:process';
import { createControlPlaneRepositoryFromEnvironment } from '../dist/index.js';

const OUTBOX_ID_PATTERN = /^outbox_[A-Za-z0-9_-]{20,200}$/u;
const PURPOSES = new Set(['email_verification', 'set_password']);

async function main() {
  const purpose = readArgument('--purpose');
  const outboxId = readArgument('--outbox-id');
  if (!purpose || !PURPOSES.has(purpose)) {
    fail('--purpose must be email_verification or set_password');
  }
  if (!outboxId || !OUTBOX_ID_PATTERN.test(outboxId)) {
    fail('--outbox-id must be a valid Lodariq auth outbox id');
  }
  if (!process.env.DATABASE_URL?.trim()) {
    fail('DATABASE_URL for the restricted runtime role is required');
  }

  const repository = createControlPlaneRepositoryFromEnvironment({
    env: process.env,
    allowInMemoryFallback: false,
  });
  try {
    const status = await repository.getAuthDeliveryStatus(purpose, outboxId);
    stdout.write(`${JSON.stringify(status ?? { status: 'not_found' }, null, 2)}\n`);
  } finally {
    await repository.close?.();
  }
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

await main();
