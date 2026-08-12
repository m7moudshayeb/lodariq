import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INITIAL_BASELINE_FILE_NAME = '0000_initial_baseline.sql';

export const INITIAL_BASELINE_PATH = fileURLToPath(
  new URL(`../../../database/drizzle/${INITIAL_BASELINE_FILE_NAME}`, import.meta.url),
);

export const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../database/drizzle/', import.meta.url),
);

export function readInitialBaseline(): string {
  return readFileSync(INITIAL_BASELINE_PATH, 'utf8');
}

export function listCheckedInSqlFiles(): string[] {
  return readdirSync(MIGRATIONS_DIRECTORY)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}
