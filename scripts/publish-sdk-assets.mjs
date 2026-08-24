#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const defaultManifestPath = resolve(repoRoot, 'dist/sdk-assets/manifest.json');
const uploadConfirmation = 'UPLOAD SDK ASSETS';
const accountIdPattern = /^[a-f0-9]{32}$/u;
const bucketPattern = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/u;
const r2Jurisdictions = new Set(['default', 'eu', 'fedramp']);
const assetPathPattern = /^\/sdk\/[A-Za-z0-9][A-Za-z0-9._/-]*\.js$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const cacheControlByPolicy = {
  immutable: 'public,max-age=31536000,immutable',
  short: 'public,max-age=300,must-revalidate',
};

const mode = process.argv.includes('--plan')
  ? 'plan'
  : process.argv.includes('--verify-public')
    ? 'verify-public'
    : 'publish';
const manifestPath = resolve(process.env.LODARIQ_SDK_ASSET_MANIFEST ?? defaultManifestPath);
const plan = createUploadPlan(manifestPath);

if (mode === 'plan') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (mode === 'verify-public') {
  const publicBaseUrl = selectedPublicBaseUrl(plan);
  await verifyPublicAssets(plan, publicBaseUrl);
  process.stdout.write(`Verified ${plan.files.length} public SDK assets without uploading.\n`);
} else {
  await publish(plan);
}

export function createUploadPlan(path = defaultManifestPath) {
  const manifest = readJson(path, 'SDK asset manifest');
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !hasExactKeys(manifest, [
      'creatorModule',
      'entries',
      'files',
      'generatedAt',
      'prefix',
      'publicLoader',
    ]) ||
    typeof manifest.generatedAt !== 'string' ||
    manifest.prefix !== '/sdk/' ||
    !manifest.entries ||
    typeof manifest.entries !== 'object' ||
    !hasExactKeys(manifest.entries, ['authoring', 'runtime']) ||
    !Array.isArray(manifest.entries.authoring) ||
    !Array.isArray(manifest.entries.runtime) ||
    !Array.isArray(manifest.files) ||
    !manifest.creatorModule ||
    typeof manifest.creatorModule !== 'object' ||
    !hasExactKeys(manifest.creatorModule, ['integrity', 'url', 'version']) ||
    !manifest.publicLoader ||
    typeof manifest.publicLoader !== 'object' ||
    !hasExactKeys(manifest.publicLoader, ['integrity', 'path']) ||
    typeof manifest.publicLoader.path !== 'string' ||
    typeof manifest.publicLoader.integrity !== 'string' ||
    !/^sha256-[A-Za-z0-9+/]+={0,2}$/u.test(manifest.publicLoader.integrity)
  ) {
    throw new Error('SDK asset manifest has an invalid closed shape');
  }

  const assetRoot = resolve(repoRoot, 'dist/sdk-assets');
  const seen = new Set();
  const files = manifest.files.map((candidate) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !hasExactKeys(candidate, ['bytes', 'cache', 'path', 'sha256']) ||
      typeof candidate.path !== 'string' ||
      !assetPathPattern.test(candidate.path) ||
      candidate.path.includes('..') ||
      candidate.path.includes('//') ||
      typeof candidate.bytes !== 'number' ||
      !Number.isSafeInteger(candidate.bytes) ||
      candidate.bytes < 1 ||
      typeof candidate.sha256 !== 'string' ||
      !sha256Pattern.test(candidate.sha256) ||
      (candidate.cache !== 'short' && candidate.cache !== 'immutable') ||
      seen.has(candidate.path)
    ) {
      throw new Error('SDK asset manifest contains an invalid file entry');
    }
    seen.add(candidate.path);
    const localPath = resolve(assetRoot, `.${candidate.path}`);
    if (!localPath.startsWith(`${assetRoot}${sep}`)) {
      throw new Error('SDK asset path escapes its prepared root');
    }
    const bytes = readFileSync(localPath);
    if (
      bytes.byteLength !== candidate.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== candidate.sha256
    ) {
      throw new Error('SDK asset bytes do not match the reviewed manifest');
    }
    return {
      key: candidate.path.slice(1),
      path: candidate.path,
      localPath,
      bytes: candidate.bytes,
      sha256: candidate.sha256,
      cache: candidate.cache,
      cacheControl: cacheControlByPolicy[candidate.cache],
    };
  });

  if (!files.length) throw new Error('SDK asset manifest must contain at least one file');
  const creatorUrl = canonicalHttpsUrl(manifest.creatorModule.url, 'creator module URL');
  const creatorFile = files.find((file) => file.path === creatorUrl.pathname);
  if (
    !creatorFile ||
    creatorFile.cache !== 'immutable' ||
    manifest.creatorModule.version !== `sha256-${creatorFile.sha256}` ||
    typeof manifest.creatorModule.integrity !== 'string' ||
    manifest.creatorModule.integrity !==
      `sha256-${createHash('sha256').update(readFileSync(creatorFile.localPath)).digest('base64')}`
  ) {
    throw new Error('Creator module identity does not match its immutable asset');
  }

  return {
    manifestPath: path,
    creatorModule: {
      url: creatorUrl.toString(),
      version: manifest.creatorModule.version,
      integrity: manifest.creatorModule.integrity,
    },
    files,
  };
}

async function publish(plan) {
  const accountId = requiredEnvironment('R2_ACCOUNT_ID');
  const bucket = requiredEnvironment('R2_BUCKET');
  const jurisdiction = process.env.R2_JURISDICTION ?? 'default';
  const publicBaseUrl = selectedPublicBaseUrl(plan);
  if (process.env.LODARIQ_SDK_ASSET_UPLOAD_CONFIRMATION !== uploadConfirmation) {
    throw new Error(`SDK asset upload requires exact confirmation: ${uploadConfirmation}`);
  }
  if (!accountIdPattern.test(accountId)) throw new Error('R2_ACCOUNT_ID is invalid');
  if (!bucketPattern.test(bucket)) throw new Error('R2_BUCKET is invalid');
  if (!r2Jurisdictions.has(jurisdiction)) throw new Error('R2_JURISDICTION is invalid');
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Bucket-scoped R2 S3 credentials are required');
  }

  const jurisdictionSubdomain = jurisdiction === 'default' ? '' : `.${jurisdiction}`;
  const endpoint = `https://${accountId}${jurisdictionSubdomain}.r2.cloudflarestorage.com`;
  runAws(['s3api', 'head-bucket', '--bucket', bucket, '--endpoint-url', endpoint]);
  for (const file of plan.files) {
    runAws([
      's3api',
      'put-object',
      '--bucket',
      bucket,
      '--key',
      file.key,
      '--body',
      file.localPath,
      '--content-type',
      'application/javascript; charset=utf-8',
      '--cache-control',
      file.cacheControl,
      '--metadata',
      `sha256=${file.sha256}`,
      '--endpoint-url',
      endpoint,
    ]);
    const head = readCommandJson(
      runAws([
        's3api',
        'head-object',
        '--bucket',
        bucket,
        '--key',
        file.key,
        '--endpoint-url',
        endpoint,
      ]),
      'R2 object verification',
    );
    if (
      head.ContentLength !== file.bytes ||
      head.CacheControl !== file.cacheControl ||
      head.Metadata?.sha256 !== file.sha256
    ) {
      throw new Error('Uploaded SDK asset metadata does not match the reviewed manifest');
    }
  }

  await verifyPublicAssets(plan, publicBaseUrl);
  process.stdout.write(`Published and verified ${plan.files.length} SDK assets.\n`);
}

function selectedPublicBaseUrl(plan) {
  const publicBaseUrl = canonicalHttpsOrigin(
    requiredEnvironment('R2_PUBLIC_BASE_URL'),
    'R2 public base URL',
  );
  if (new URL(plan.creatorModule.url).origin !== publicBaseUrl.origin) {
    throw new Error('Creator module and selected public CDN origins must match');
  }
  return publicBaseUrl;
}

async function verifyPublicAssets(plan, publicBaseUrl) {
  for (const file of plan.files) {
    const url = new URL(file.path, publicBaseUrl);
    url.searchParams.set('lodariqAsset', file.sha256);
    url.searchParams.set('lodariqVerification', randomUUID());
    const response = await fetch(url, {
      headers: { origin: 'https://deployment-probe.invalid' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Public SDK asset verification failed');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.byteLength !== file.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== file.sha256
    ) {
      throw new Error('Public SDK asset bytes do not match the reviewed manifest');
    }
    if (!cacheControlMatches(response.headers.get('cache-control'), file.cacheControl)) {
      throw new Error(
        `Public SDK asset cache policy does not match the reviewed manifest: ${file.path}`,
      );
    }
    if (response.headers.get('access-control-allow-origin') !== '*') {
      throw new Error('Public SDK asset CORS policy must allow anonymous cross-origin loading');
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/javascript')) {
      throw new Error('Public SDK asset content type is not JavaScript');
    }
  }
}

function cacheControlMatches(actual, expected) {
  const actualDirectives = cacheControlDirectives(actual);
  const expectedDirectives = cacheControlDirectives(expected);
  if (
    !actualDirectives ||
    !expectedDirectives ||
    actualDirectives.size !== expectedDirectives.size
  ) {
    return false;
  }
  return [...expectedDirectives].every(
    ([directive, value]) => actualDirectives.get(directive) === value,
  );
}

function cacheControlDirectives(value) {
  if (!value) return undefined;
  const directives = new Map();
  for (const entry of value.split(',')) {
    const [rawDirective, ...rawValue] = entry.trim().split('=');
    const directive = rawDirective?.toLowerCase();
    if (!directive || directives.has(directive)) return undefined;
    directives.set(directive, rawValue.join('=').trim().toLowerCase());
  }
  return directives;
}

function runAws(args) {
  return execFileSync('aws', ['--region', 'auto', '--no-cli-pager', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readCommandJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hasExactKeys(value, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function canonicalHttpsOrigin(value, label) {
  const url = canonicalHttpsUrl(value, label);
  if (url.pathname !== '/' || url.origin !== value) {
    throw new Error(`${label} must be an exact HTTPS origin`);
  }
  return url;
}

function canonicalHttpsUrl(value, label) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && !url.pathname.startsWith('/sdk/'))
  ) {
    throw new Error(`${label} must be a canonical HTTPS URL`);
  }
  return url;
}
