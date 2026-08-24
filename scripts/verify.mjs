import { spawn } from 'node:child_process';
import process from 'node:process';

/*
 * Runs the gates `pnpm verify` used to chain with `&&`, grouped into waves so
 * independent gates overlap. Nothing fails fast: one run reports the whole
 * branch instead of stopping at the first red gate.
 *
 *   node scripts/verify.mjs           every gate
 *   node scripts/verify.mjs static    the cheap gates only (CI static job)
 *   node scripts/verify.mjs heavy     turbo + sdk assets
 *   node scripts/verify.mjs migrations
 */

const VERBOSE = process.env.VERIFY_VERBOSE === '1';
const SELECTED = process.argv.slice(2);

const WAVES = [
  // Alone: i18n:check rewrites apps/dashboard/src/locales and then diffs it, so
  // a concurrent compile turns a clean tree into a spurious failure.
  [{ group: 'static', name: 'localization', run: 'pnpm run i18n:check' }],

  // Compiled catalogs are an input to boundaries, knip and the test run.
  [{ group: 'static', name: 'compile catalogs', run: 'pnpm run i18n:compile' }],

  [
    // One turbo invocation, not five: turbo schedules the whole task graph, so
    // the build fan-out is shared instead of repeated per task.
    {
      group: 'heavy',
      name: 'turbo: build, typecheck, lint, test, size',
      run: 'pnpm exec turbo run build typecheck lint test size',
      stream: true,
    },
    { group: 'static', name: 'architecture', run: 'pnpm run architecture:check' },
    { group: 'static', name: 'design tokens', run: 'pnpm run tokens:check' },
    { group: 'static', name: 'styles', run: 'pnpm run styles:check' },
    { group: 'static', name: 'package boundaries', run: 'pnpm run boundaries:only' },
    { group: 'static', name: 'unused dependencies', run: 'pnpm run knip:only' },
    { group: 'audit', name: 'dependency audit', run: 'pnpm run audit:security' },
  ],

  [{ group: 'heavy', name: 'sdk assets', run: 'pnpm run sdk:prepare-assets' }],

  // Last on purpose. 0041 is unsigned by design, and while this sat ninth in
  // the chain it hid every gate that ran after it.
  [{ group: 'migrations', name: 'migrations', run: 'pnpm run migrations:check' }],
];

const waves = WAVES.map((wave) =>
  wave.filter((gate) => SELECTED.length === 0 || SELECTED.includes(gate.group)),
).filter((wave) => wave.length > 0);

if (waves.length === 0) {
  process.stderr.write(`No gates match: ${SELECTED.join(', ')}\n`);
  process.exit(1);
}

function run(gate) {
  return new Promise((resolve) => {
    const started = Date.now();
    const stream = VERBOSE || gate.stream === true;
    const child = spawn(gate.run, {
      shell: true,
      stdio: stream ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    if (!stream) {
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.stderr.on('data', (chunk) => chunks.push(chunk));
    }
    child.on('close', (code) => {
      resolve({
        name: gate.name,
        ok: code === 0,
        seconds: (Date.now() - started) / 1000,
        output: Buffer.concat(chunks).toString('utf8').trimEnd(),
      });
    });
  });
}

const startedAll = Date.now();
const results = [];

for (const wave of waves) {
  const settled = await Promise.all(
    wave.map((gate) =>
      run(gate).then((result) => {
        process.stdout.write(
          `${result.ok ? '✓' : '✗'} ${result.name} (${result.seconds.toFixed(1)}s)\n`,
        );
        return result;
      }),
    ),
  );
  results.push(...settled);
}

const rule = '─'.repeat(72);
const failed = results.filter((result) => !result.ok);

for (const result of failed) {
  if (!result.output) continue;
  process.stdout.write(`\n${rule}\n${result.name}\n${rule}\n${result.output}\n`);
}

const width = Math.max(...results.map((result) => result.name.length));
process.stdout.write(`\n${rule}\n`);
for (const result of results) {
  process.stdout.write(
    `${result.ok ? '✓ pass' : '✗ FAIL'}  ${result.name.padEnd(width)}  ${result.seconds
      .toFixed(1)
      .padStart(7)}s\n`,
  );
}
process.stdout.write(
  `${rule}\n${results.length - failed.length}/${results.length} gates passed in ${(
    (Date.now() - startedAll) /
    1000
  ).toFixed(1)}s\n`,
);

process.exit(failed.length === 0 ? 0 : 1);
