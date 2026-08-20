import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';

// The entire argument for this package is that it is too small to matter in a
// customer's bundle. If that stops being true it stops being worth shipping.
const LIMIT_BYTES = 1024;
const entry = new URL('../dist/index.js', import.meta.url).pathname;
const size = gzipSync(readFileSync(entry)).length;
if (size > LIMIT_BYTES) {
  throw new Error(`@lodariq/loader is ${size} bytes gzipped; limit is ${LIMIT_BYTES}`);
}
process.stdout.write(`loader-npm: ${size}/${LIMIT_BYTES} bytes gzipped\n`);
