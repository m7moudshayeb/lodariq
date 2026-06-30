import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../database/scripts/verify-live-rls.mjs', import.meta.url),
);

describe('live Neon RLS verification script', () => {
  it('fails closed without a live DATABASE_URL', () => {
    expect(() => runLiveRlsCheck({ DATABASE_URL: '' })).toThrow(
      /DATABASE_URL is required for live Neon RLS verification/,
    );
  });

  it('requires explicit scratch-write consent before opening a live connection', () => {
    expect(() =>
      runLiveRlsCheck({
        DATABASE_URL: 'postgres://user:password@example.invalid/neondb',
        LODARIQ_LIVE_RLS_WRITE_CHECK: '',
      }),
    ).toThrow(/LODARIQ_LIVE_RLS_WRITE_CHECK must be set/);
  });
});

function runLiveRlsCheck(env: Record<string, string>): string {
  try {
    return execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: 'pipe',
    });
  } catch (error) {
    if (isExecError(error)) {
      throw new Error(`${error.stdout}\n${error.stderr}`);
    }
    throw error;
  }
}

function isExecError(
  error: unknown,
): error is Error & { stdout: string | Buffer; stderr: string | Buffer } {
  return Boolean(error && typeof error === 'object' && 'stdout' in error && 'stderr' in error);
}
