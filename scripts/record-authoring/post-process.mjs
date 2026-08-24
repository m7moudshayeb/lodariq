#!/usr/bin/env node
/**
 * Turns any screen recording into the files the hero actually loads.
 *
 * Point it at a QuickTime .mov, an .mp4, anything ffmpeg reads:
 *   node scripts/record-authoring/post-process.mjs ~/Desktop/authoring.mov
 *
 * With no argument it picks up the newest capture in ./artifacts, so the
 * Playwright rig works as a source too.
 *
 * What it does that matters: strips the audio track entirely (a video with no
 * audio track autoplays under every browser policy; a muted track that still
 * exists does not), encodes both VP9 and H.264 because Safari needs the latter,
 * and pulls a poster frame so the hero's first paint is not an empty box.
 *
 * Trim points depend on the take, so they are env vars:
 *   TRIM_START=2.4 TRIM_DURATION=14 POSTER_AT=6 node post-process.mjs take.mov
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const artifacts = join(here, 'artifacts');
const outDir = resolve(here, '../../apps/marketing/public/media');

const TRIM_START = process.env.TRIM_START ?? '1.6';
const TRIM_DURATION = process.env.TRIM_DURATION ?? '16';
const POSTER_AT = process.env.POSTER_AT ?? '7';
const WIDTH = process.env.WIDTH ?? '1280';
const FPS = process.env.FPS ?? '24';

const ffmpeg = process.env.FFMPEG ?? 'ffmpeg';
const run = (args) => execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/** Playwright names videos by a hash, so take the newest rather than guessing. */
function newestCapture(dir) {
  const found = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.webm')) found.push({ full, mtime: statSync(full).mtimeMs });
    }
  };
  try {
    walk(dir);
  } catch {
    throw new Error(
      `No capture directory at ${dir}. Either record with the Playwright rig, or pass a ` +
        `screen recording directly: node post-process.mjs ~/Desktop/authoring.mov`,
    );
  }
  if (found.length === 0) throw new Error(`No .webm under ${dir} — did the recording fail?`);
  return found.sort((a, b) => b.mtime - a.mtime)[0].full;
}

const argument = process.argv[2];
const source = argument ? resolve(process.cwd(), argument) : newestCapture(artifacts);
if (argument && !statSync(source, { throwIfNoEntry: false })) {
  throw new Error(`No such file: ${source}`);
}
mkdirSync(outDir, { recursive: true });
console.log(`source   ${source}`);

// scale to an even width; -2 keeps the aspect and stays divisible by 2, which
// H.264 requires and which silently breaks encodes when it is forgotten.
const filters = `scale=${WIDTH}:-2:flags=lanczos,fps=${FPS}`;
const trim = ['-ss', TRIM_START, '-t', TRIM_DURATION];

// -an everywhere: a video with no audio track autoplays under every browser
// policy, and a muted track that still exists does not always.
run([...trim, '-i', source, '-vf', filters, '-an', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0',
     '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', join(outDir, 'authoring.webm')]);

run([...trim, '-i', source, '-vf', filters, '-an', '-c:v', 'libx264', '-profile:v', 'high',
     '-crf', '25', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
     join(outDir, 'authoring.mp4')]);

run(['-ss', String(Number(TRIM_START) + Number(POSTER_AT)), '-i', source, '-vframes', '1',
     '-vf', filters, '-q:v', '4', join(outDir, 'authoring-poster.jpg')]);

for (const name of ['authoring.webm', 'authoring.mp4', 'authoring-poster.jpg']) {
  const kb = Math.round(statSync(join(outDir, name)).size / 1024);
  console.log(`${kb.toString().padStart(6)} KB  ${name}`);
}
console.log(`\nwritten to ${outDir}`);
console.log('If the webm is over ~900 KB, raise -crf or shorten TRIM_DURATION —');
console.log('this file sits on the hero and competes with LCP.');
