import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Design-token boundary check.
 *
 * Creator-chrome surfaces may not carry raw colour literals. Every colour comes
 * from `creator-chrome-tokens.ts` through an `--lq-*` custom property, so a
 * palette change is one edit rather than a sweep across 40+ style modules.
 *
 * Why this exists rather than a stylelint rule: `postcss-styled-syntax` only
 * parses *tagged* template literals, and every style module in this package uses
 * an untagged `export const X_CSS = \`…\`` — so `pnpm styles:check` currently
 * inspects zero declarations. See docs/plans/authoring-ux-implementation.md B7.
 * Once the templates are tagged, the stylelint rule takes over and this script
 * can be deleted.
 */

const ROOT = process.cwd();

const STYLE_DIR = 'packages/sdk-authoring/src/authoring/local-frame-ui/styles';

/**
 * Style modules outside the styles directory. `panel-styles.ts` draws the chrome
 * that sits over the customer page, so the boundary matters there most.
 */
const EXTRA_STYLE_FILES = ['packages/sdk-authoring/src/authoring/panel-styles.ts'];

/**
 * Known violations that predate this check. The gate fails only on entries not
 * listed here, so the boundary holds for new work while the backlog is retired
 * incrementally. Regenerate with `--write-baseline` after a deliberate sweep;
 * the file only ever shrinks.
 */
const BASELINE_FILE = 'scripts/design-tokens.baseline.json';

/** The one file allowed to hold colour values: it declares the custom properties. */
const TOKEN_DECLARATION_FILES = new Set(['foundation.ts']);

/** Colour-bearing declarations. A raw value in any of these is a failure. */
const COLOUR_PROPERTIES = [
  'background',
  'background-color',
  'border',
  'border-block',
  'border-bottom',
  'border-bottom-color',
  'border-color',
  'border-inline',
  'border-left',
  'border-left-color',
  'border-right',
  'border-right-color',
  'border-top',
  'border-top-color',
  'box-shadow',
  'caret-color',
  'color',
  'fill',
  'outline',
  'outline-color',
  'stroke',
  'text-decoration-color',
  'text-shadow',
];

/** Literal colour forms. Named colours are allowed: they are unambiguous and rare. */
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(/;

const DECLARATION = new RegExp(
  `(^|[;{\\n])\\s*(${COLOUR_PROPERTIES.join('|')})\\s*:([^;{}]*)`,
  'g',
);

async function styleFiles() {
  const entries = await readdir(path.join(ROOT, STYLE_DIR), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .filter((entry) => !TOKEN_DECLARATION_FILES.has(entry.name))
    .map((entry) => path.join(STYLE_DIR, entry.name))
    .concat(EXTRA_STYLE_FILES);
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Baseline keys carry an occurrence index rather than a line number, so editing
 * a file above a known violation does not present it as new work.
 */
const findings = [];
const files = await styleFiles();
const seen = new Map();

for (const file of files) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  for (const match of source.matchAll(DECLARATION)) {
    const [, , property, rawValue] = match;
    const value = rawValue ?? '';
    // `${TOKEN.x}` interpolations are token-sourced and therefore fine.
    if (value.includes('${')) continue;
    if (!RAW_COLOUR.test(value)) continue;
    const declaration = `${property}:${value.trim()}`;
    const key = `${file} — ${declaration}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    findings.push({
      key: `${key} #${occurrence}`,
      report: `${file}:${lineOf(source, match.index ?? 0)} — ${declaration}`,
    });
  }
}

const failures = findings.map((finding) => finding.key);
const reportOf = new Map(findings.map((finding) => [finding.key, finding.report]));

if (process.argv.includes('--write-baseline')) {
  await writeFile(
    path.join(ROOT, BASELINE_FILE),
    `${JSON.stringify([...failures].sort(), null, 2)}\n`,
    'utf8',
  );
  console.log(`Wrote ${failures.length} known violations to ${BASELINE_FILE}.`);
  process.exit(0);
}

let baseline = [];
try {
  baseline = JSON.parse(await readFile(path.join(ROOT, BASELINE_FILE), 'utf8'));
} catch {
  baseline = [];
}
const known = new Set(baseline);
const introduced = failures.filter((failure) => !known.has(failure));
const retired = baseline.filter((entry) => !failures.includes(entry));

if (introduced.length > 0) {
  console.error(
    `Design-token check failed: ${introduced.length} new raw colour ${
      introduced.length === 1 ? 'literal' : 'literals'
    } outside creator-chrome-tokens.ts.`,
  );
  console.error('Use an --lq-* custom property instead.\n');
  for (const failure of introduced) console.error(`- ${reportOf.get(failure) ?? failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Design-token boundary passed (${files.length} style modules checked, ` +
      `${failures.length} known violations remaining).`,
  );
  if (retired.length > 0) {
    console.log(
      `${retired.length} baseline ${retired.length === 1 ? 'entry is' : 'entries are'} now clean — ` +
        'run with --write-baseline to shrink the baseline.',
    );
  }
}
