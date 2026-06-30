import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/check-migration-safety.mjs', import.meta.url),
);

describe('database migration safety guard', () => {
  it('passes the checked-in additive Phase 1 migration', () => {
    expect(runMigrationCheck()).toContain('Migration safety check passed');
  });

  it('fails destructive migrations without explicit shared-environment sign-off', () => {
    const directory = createTempMigrationDir({
      '0001_drop_table.sql': 'drop table documents;',
    });

    try {
      expect(() => runMigrationCheck(directory)).toThrow(/Destructive migration guard failed/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('allows destructive migrations only when the file carries explicit sign-off metadata', () => {
    const directory = createTempMigrationDir({
      '0001_signed_drop_table.sql': [
        '-- lodariq-shared-env-destructive-migration-signoff: user@example.com 2026-06-30 APPROVED-123',
        'drop table documents;',
      ].join('\n'),
    });

    try {
      expect(runMigrationCheck(directory)).toContain('Migration safety check passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runMigrationCheck(directory?: string): string {
  try {
    return execFileSync(process.execPath, directory ? [scriptPath, directory] : [scriptPath], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    if (isExecError(error)) {
      throw new Error(`${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
}

function createTempMigrationDir(files: Record<string, string>): string {
  const directory = mkdtempSync(join(tmpdir(), 'lodariq-migrations-'));
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(directory, file), contents);
  }
  return directory;
}

function isExecError(
  error: unknown,
): error is Error & { stdout: string | Buffer; stderr: string | Buffer } {
  return Boolean(error && typeof error === 'object' && 'stdout' in error && 'stderr' in error);
}
