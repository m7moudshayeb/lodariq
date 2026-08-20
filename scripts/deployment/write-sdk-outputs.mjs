import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function readCreatorModule(manifestPath = 'dist/sdk-assets/manifest.json') {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const creator = manifest.creatorModule;

  if (
    typeof creator?.url !== 'string' ||
    typeof creator?.version !== 'string' ||
    typeof creator?.integrity !== 'string'
  ) {
    throw new Error('Prepared SDK manifest has no creator module identity.');
  }
  return creator;
}

/**
 * The public loader's SRI digest (ADR-0027).
 *
 * Read from the same prepared manifest the upload uses, so the digest the API
 * hands to customers always describes the bytes that were actually published.
 */
export function readPublicLoader(manifestPath = 'dist/sdk-assets/manifest.json') {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const loader = manifest.publicLoader;

  if (typeof loader?.path !== 'string' || typeof loader?.integrity !== 'string') {
    throw new Error('Prepared SDK manifest has no public loader identity.');
  }
  return loader;
}

export function writeSdkOutputs(environment = process.env) {
  const outputPath = environment.GITHUB_OUTPUT;
  if (!outputPath) throw new Error('GITHUB_OUTPUT is required.');

  const creator = readCreatorModule();
  const publicLoader = readPublicLoader();
  appendFileSync(
    outputPath,
    [
      `creator_module_url=${creator.url}`,
      `creator_module_version=${creator.version}`,
      `creator_module_integrity=${creator.integrity}`,
      `public_loader_integrity=${publicLoader.integrity}`,
      '',
    ].join('\n'),
    'utf8',
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) writeSdkOutputs();
