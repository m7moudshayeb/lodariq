#!/usr/bin/env node
/**
 * Budgets for what a creator downloads before the authoring shell paints.
 *
 * The authoring surface is assembled here, in the editor application — not in
 * the packages it consumes. Those packages have size checks of their own, but
 * they measure entry closures, which says nothing about the chunks Rollup
 * actually forms for a creator. Without this gate the boot path was ungoverned:
 * it grew to five serial round trips and 625 KB gzipped before anyone noticed,
 * and the cause each time was a change that looked local.
 *
 * Each check below failed at least once in practice. They are cheap; the thing
 * they are protecting is not.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(appRoot, 'dist');
const assets = join(dist, 'assets');
const manifestPath = join(dist, '.vite', 'manifest.json');
const htmlPath = join(dist, 'authoring.html');

/**
 * Budgets are gzipped bytes, because that is what crosses the wire.
 *
 * Raising one is a deliberate act: it means a creator waits longer, and the
 * number should be moved only alongside a measurement showing the trade was
 * worth it. `node docs/product-design/prototypes/qa/t28-authoring-boot.mjs`
 * prints that measurement.
 */
const BUDGETS = {
  /**
   * Everything the browser must have before the shell can render: the entry,
   * the chunks the document preloads, and their static imports.
   *
   * Measured 2026-08-21 at 435 KB, down from 625 KB. It was briefly 390 KB,
   * with the Rich Content editor discovered a hop late — which showed up as a
   * card that drew its frame and then sat blank for ~190 ms. Preloading it put
   * 45 KB back on this path and took ~95 ms off the moment a creator can read
   * their own content. That trade is the reason this number is not lower.
   */
  firstPaintBytes: 460 * 1024,
  /**
   * No single first-paint chunk may dominate. A chunk this large is a sign that
   * a boundary collapsed — which is exactly how one 1.7 MB chunk came to hold
   * the workspace, Lexical, xstate and the whole icon library at once.
   */
  largestFirstPaintChunkBytes: 320 * 1024,
  /**
   * Emitted JavaScript assets. Sixteen hundred of them once shipped, one per
   * icon in a library the product can only ever use seventy icons from.
   */
  chunkCount: 80,
  /**
   * Bytes attributed to modules that appear in more than one chunk. Duplication
   * is invisible in a per-chunk size report: schema and TypeBox were bundled
   * twice, roughly 250 KB, inside the single largest chunk on the boot path.
   */
  duplicatedBytes: 96 * 1024,
};

/**
 * Modules that must be reachable without waiting for an earlier request to
 * finish. Everything here has to be named by a `modulepreload` in the document,
 * which is what keeps the boot path parallel rather than serial.
 */
const MUST_BE_PRELOADED = [
  'apps/editor/src/authoring-frame-app.ts',
  'sdk-authoring/src/authoring/local-frame-app',
  // Lazy for chunking, preloaded for timing: without it the card renders an
  // empty placeholder while Lexical is fetched a round trip late.
  'sdk-authoring/src/editor/rich-content-editor',
];

const failures = [];
const notes = [];

if (!existsSync(manifestPath)) {
  throw new Error(
    `No build manifest at ${manifestPath}. Run \`pnpm --filter @lodariq/editor build\` first.`,
  );
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');

const byFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
const gzipCache = new Map();
function gzipBytes(file) {
  if (!gzipCache.has(file)) {
    gzipCache.set(file, gzipSync(readFileSync(join(dist, file))).length);
  }
  return gzipCache.get(file);
}

// ---------------------------------------------------------------- first paint

const preloaded = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+)"/g)].map(
  (match) => match[1],
);
const entryScript = html.match(/<script[^>]+type="module"[^>]+src="\/([^"]+)"/)?.[1];
if (!entryScript) failures.push('authoring.html has no module entry script.');

/** Static imports only: a dynamic import is a later round trip, not first paint. */
function staticClosure(files) {
  const seen = new Set();
  const queue = [...files];
  while (queue.length) {
    const file = queue.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const entry = byFile.get(file);
    for (const key of entry?.imports ?? []) {
      const imported = manifest[key]?.file;
      if (imported) queue.push(imported);
    }
  }
  return seen;
}

const firstPaint = staticClosure([entryScript, ...preloaded].filter(Boolean));
const firstPaintBytes = [...firstPaint].reduce((total, file) => total + gzipBytes(file), 0);
notes.push(
  `first paint: ${kib(firstPaintBytes)}/${kib(BUDGETS.firstPaintBytes)} gzipped across ${firstPaint.size} chunks`,
);
if (firstPaintBytes > BUDGETS.firstPaintBytes) {
  failures.push(
    `first-paint payload is ${kib(firstPaintBytes)} gzipped; budget is ${kib(BUDGETS.firstPaintBytes)}.`,
  );
}

const largest = [...firstPaint].reduce(
  (max, file) => (gzipBytes(file) > (max.bytes ?? 0) ? { file, bytes: gzipBytes(file) } : max),
  {},
);
notes.push(`largest first-paint chunk: ${kib(largest.bytes ?? 0)} gzipped (${largest.file})`);
if ((largest.bytes ?? 0) > BUDGETS.largestFirstPaintChunkBytes) {
  failures.push(
    `${largest.file} is ${kib(largest.bytes)} gzipped on the first-paint path; ` +
      `no single chunk may exceed ${kib(BUDGETS.largestFirstPaintChunkBytes)}. Split it.`,
  );
}

// ------------------------------------------------------- preload declarations

const preloadManifestPath = join(dist, '.vite', 'critical-modulepreload.json');
if (!existsSync(preloadManifestPath)) {
  failures.push(
    'The critical-modulepreload plugin wrote no manifest. Either it did not run, ' +
      'or the build no longer declares a critical path at all.',
  );
} else {
  const declared = JSON.parse(readFileSync(preloadManifestPath, 'utf8'));
  for (const marker of MUST_BE_PRELOADED) {
    const resolved = declared[marker];
    if (!resolved) {
      failures.push(`"${marker}" is not declared as a critical module in vite.config.ts.`);
      continue;
    }
    if (!preloaded.includes(resolved) && resolved !== entryScript) {
      failures.push(
        `"${marker}" resolved to ${resolved}, but the document does not preload it. ` +
          'Without the declaration the browser cannot discover it until the chunk ' +
          'before it has finished, which puts another round trip back into the boot.',
      );
    }
  }
}

// --------------------------------------------------------------- chunk count

const emitted = readdirSync(assets).filter((name) => name.endsWith('.js'));
notes.push(`emitted chunks: ${emitted.length}/${BUDGETS.chunkCount}`);
if (emitted.length > BUDGETS.chunkCount) {
  failures.push(
    `${emitted.length} JavaScript assets emitted; cap is ${BUDGETS.chunkCount}. ` +
      'A jump here usually means a library is being loaded by name at runtime.',
  );
}

// ----------------------------------------------------------------- duplicates

const perModule = new Map();
for (const name of emitted) {
  const mapFile = join(assets, `${name}.map`);
  if (!existsSync(mapFile)) continue;
  for (const [module, bytes] of attributeChunk(join(assets, name), mapFile)) {
    const seen = perModule.get(module) ?? [];
    seen.push({ chunk: name, bytes });
    perModule.set(module, seen);
  }
}
let duplicatedBytes = 0;
const worstDuplicates = [];
for (const [module, copies] of perModule) {
  if (copies.length < 2) continue;
  const total = copies.reduce((sum, copy) => sum + copy.bytes, 0);
  const wasted = total - Math.max(...copies.map((copy) => copy.bytes));
  duplicatedBytes += wasted;
  worstDuplicates.push({ module, wasted, copies: copies.length });
}
worstDuplicates.sort((a, b) => b.wasted - a.wasted);
notes.push(
  `duplicated across chunks: ${kib(duplicatedBytes)}/${kib(BUDGETS.duplicatedBytes)} (uncompressed)`,
);
if (duplicatedBytes > BUDGETS.duplicatedBytes) {
  const worst = worstDuplicates
    .slice(0, 5)
    .map((item) => `    ${kib(item.wasted)} in ${item.copies} chunks — ${item.module}`)
    .join('\n');
  failures.push(
    `${kib(duplicatedBytes)} of duplicated module bytes; budget is ${kib(BUDGETS.duplicatedBytes)}.\n${worst}`,
  );
}

// -------------------------------------------------------------------- report

for (const note of notes) process.stdout.write(`  ${note}\n`);
if (failures.length) {
  process.stderr.write(
    `\neditor size gate failed:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write('editor size gate passed\n');

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

/**
 * Attributes a chunk's bytes to source modules through its sourcemap, so a
 * budget can name the module that moved it rather than only the chunk.
 */
function attributeChunk(codeFile, mapFile) {
  const map = JSON.parse(readFileSync(mapFile, 'utf8'));
  const lines = readFileSync(codeFile, 'utf8').split('\n');
  const totals = new Map();
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let sourceIndex = 0;
  map.mappings.split(';').forEach((lineMappings, lineNumber) => {
    if (!lineMappings) return;
    let column = 0;
    const segments = [];
    for (const raw of lineMappings.split(',')) {
      const fields = [];
      let shift = 0;
      let value = 0;
      for (const character of raw) {
        const digit = CHARS.indexOf(character);
        if (digit < 0) return;
        value += (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
          continue;
        }
        const negative = value & 1;
        value >>= 1;
        fields.push(negative ? -value : value);
        shift = 0;
        value = 0;
      }
      if (!fields.length) continue;
      column += fields[0];
      if (fields.length >= 4) sourceIndex += fields[1];
      segments.push({ column, source: fields.length >= 4 ? sourceIndex : null });
    }
    const lineLength = (lines[lineNumber] ?? '').length;
    segments.forEach((segment, index) => {
      if (segment.source === null) return;
      const end = index + 1 < segments.length ? segments[index + 1].column : lineLength;
      const name = groupOf(map.sources[segment.source] ?? '?');
      totals.set(name, (totals.get(name) ?? 0) + Math.max(0, end - segment.column));
    });
  });
  return totals;
}

/** Groups a source path to the unit worth deduplicating: a package, or a file. */
function groupOf(source) {
  if (source.includes('node_modules')) {
    const tail = source.split('node_modules/').pop() ?? source;
    const parts = tail.split('/');
    return `node_modules/${parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]}`;
  }
  return source.replace(/^(\.\.\/)+/, '');
}

if (!statSync(dist).isDirectory()) throw new Error('dist is not a directory');
