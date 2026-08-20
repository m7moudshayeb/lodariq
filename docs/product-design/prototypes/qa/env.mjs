/**
 * Shared environment for the QA scripts: where output goes, and how Playwright
 * is reached.
 *
 * Both used to be pasted into every script as an absolute path — the output dir
 * pointed at a session scratchpad, which is reaped without warning, and the
 * Playwright path pinned a version, so a bump would break all twenty at once.
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, four levels up from docs/product-design/prototypes/qa/. */
export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Override with LODARIQ_QA_OUT to write into a session scratchpad. The default
 * is outside the reaped tree, so a script run months from now still works.
 */
export const OUT_ROOT = process.env.LODARIQ_QA_OUT ?? join(tmpdir(), 'lodariq-qa');

/** Output dir, created on demand — Playwright will not mkdir for a screenshot. */
export function outDir(sub) {
  const dir = sub ? join(OUT_ROOT, sub) : OUT_ROOT;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Resolved by glob: there is no local dep on Playwright, so no bare import. */
function playwrightEntry() {
  const store = join(REPO, 'node_modules/.pnpm');
  const match = readdirSync(store)
    .filter((name) => name.startsWith('playwright@'))
    .sort()
    .pop();
  if (!match) throw new Error('playwright not found under node_modules/.pnpm');
  return join(store, match, 'node_modules/playwright/index.mjs');
}

export const { chromium } = await import(playwrightEntry());
