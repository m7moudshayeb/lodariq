import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTHORING_RESOURCES_FILE_NAME,
  INITIAL_BASELINE_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME,
  PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME,
  listCheckedInSqlFiles,
  readInitialBaseline,
  readPublicationVerificationRendererContractMigration,
  readPublicationVerificationRendererV4Migration,
} from './migration-test-utils.js';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/check-migration-safety.mjs', import.meta.url),
);

describe('database migration safety guard', () => {
  it('keeps the immutable initial baseline followed by ordered forward migrations', () => {
    expect(listCheckedInSqlFiles()).toEqual([
      INITIAL_BASELINE_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_V3_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_V4_FILE_NAME,
      PUBLICATION_VERIFICATION_RENDERER_CONTRACT_FILE_NAME,
      AUTHORING_RESOURCES_FILE_NAME,
    ]);
  });

  it('preserves renderer-v3 verification evidence while admitting renderer-v4 writes', () => {
    const migration = readPublicationVerificationRendererV4Migration();

    expect(migration).toContain("rendererContractVersion' in ('3', '4')");
    expect(migration).toContain(') not valid;');
    expect(migration).toContain('validate constraint publication_verifications_report_json_check;');
  });

  it('keeps future renderer evidence schema-valid without another literal-version migration', () => {
    const migration = readPublicationVerificationRendererContractMigration();

    expect(migration).toContain("rendererContractVersion' ~ '^[1-9][0-9]{0,31}$'");
    expect(migration).not.toContain("rendererContractVersion' in (");
    expect(migration).toContain(') not valid;');
    expect(migration).toContain('validate constraint publication_verifications_report_json_check;');
  });

  it('passes the checked-in initial baseline', () => {
    expect(runMigrationCheck()).toContain('Migration safety check passed');
  });

  it('applies the initial baseline atomically', () => {
    const baseline = readInitialBaseline();
    expect(baseline).toMatch(/\nbegin;\n/u);
    expect(baseline.trimEnd().endsWith('commit;')).toBe(true);
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
