import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const INITIAL_BASELINE_FILE_NAME = '0000_initial_baseline.sql';
export const PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME =
  '0001_publication_verification_renderer_v3.sql';
export const PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME =
  '0002_publication_verification_renderer_v4.sql';

export const INITIAL_BASELINE_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${INITIAL_BASELINE_FILE_NAME}`, import.meta.url),
);
export const PUBLICATION_VERIFICATION_RENDERER_V4_PATH = fileURLToPath(
  new URL(
    `../../../database/drizzle/${PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME}`,
    import.meta.url,
  ),
);

export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../database/drizzle/', import.meta.url),
);

export function readInitialBaseline(): string {
  return readFileSync(INITIAL_BASELINE_PATH, 'utf8');
}

export function readPublicationVerificationRendererV4Migration(): string {
  return readFileSync(PUBLICATION_VERIFICATION_RENDERER_V4_PATH, 'utf8');
}

export function listCheckedInSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

export function listCheckedInSqlPaths(): string[] {
  return listCheckedInSqlFiles().map((fileName) => join(MIGRATIONS_DIRECTORY, fileName));
}
