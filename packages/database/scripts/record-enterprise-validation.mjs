#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import process, { stderr, stdout } from 'node:process';
import { URL } from 'node:url';
import { createControlPlaneRepositoryFromEnvironment } from '../dist/index.js';

const CONNECTION_PATTERN = /^sso_[A-Za-z0-9_-]{20,}$/u;
const TARGETS = new Set(['okta', 'entra']);
const VALIDATOR_ROLE = 'lodariq_enterprise_validator';

async function main() {
  const workspaceId = requiredArgument('--workspace-id');
  const connectionId = requiredArgument('--connection-id');
  const target = requiredArgument('--target');
  const protocol = requiredArgument('--protocol');
  const evidenceReference = requiredArgument('--evidence-reference');
  const validatedBy = requiredArgument('--validated-by');
  const confirmation = requiredArgument('--confirm');
  if (!workspaceId.trim() || workspaceId.length > 256) fail('--workspace-id is invalid');
  if (!CONNECTION_PATTERN.test(connectionId)) fail('--connection-id is invalid');
  if (!TARGETS.has(target)) fail('--target must be okta or entra');
  if (protocol !== 'oidc') {
    fail('--protocol must be oidc; Lodariq does not ship or activate an in-process SAML parser');
  }
  if (evidenceReference.length < 8 || evidenceReference.length > 512) {
    fail('--evidence-reference must contain 8–512 non-secret characters');
  }
  if (/token|secret|password|credential/iu.test(evidenceReference)) {
    fail('--evidence-reference must be an opaque ticket/run identifier, never a credential');
  }
  if (validatedBy.length < 3 || validatedBy.length > 256) fail('--validated-by is invalid');
  if (confirmation !== `VALIDATE:${connectionId}`) {
    fail(`--confirm must equal VALIDATE:${connectionId}`);
  }
  const databaseUrl = process.env.LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL?.trim();
  if (!databaseUrl) fail('LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL is required');
  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    fail('LODARIQ_ENTERPRISE_VALIDATION_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (decodeURIComponent(parsedUrl.username) !== VALIDATOR_ROLE) {
    fail(`Enterprise validation must use the dedicated ${VALIDATOR_ROLE} database role`);
  }

  const repository = createControlPlaneRepositoryFromEnvironment({
    env: { ...process.env, DATABASE_URL: databaseUrl },
    allowInMemoryFallback: false,
  });
  const validatedAt = new Date().toISOString();
  const evidenceId = createId('ssoevidence');
  try {
    const result = await repository.recordEnterpriseValidationEvidence({
      evidence: {
        id: evidenceId,
        connectionId,
        workspaceId,
        target,
        protocol,
        evidenceReference,
        validatedBy,
        validatedAt,
        revokedAt: null,
      },
      auditEvent: {
        id: createId('ssoevt'),
        workspaceId,
        actorUserId: null,
        eventType: 'sso_connection_validated',
        connectionId,
        targetUserId: null,
        correlationId: createId('validation').slice(0, 128),
        metadata: { target, protocol, evidenceReference },
        occurredAt: validatedAt,
      },
    });
    if (result !== 'completed') fail(`Validation evidence was not recorded: ${result}`);
    stdout.write(
      `${JSON.stringify({ status: 'completed', evidenceId, connectionId, validatedAt }, null, 2)}\n`,
    );
  } finally {
    await repository.close?.();
  }
}

function requiredArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : '';
  if (!value) fail(`${name} is required`);
  return value;
}

function createId(prefix) {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function fail(message) {
  stderr.write(`${message}\n`);
  process.exit(1);
}

await main();
