#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const rootPrefix = `${root}/`;
const port = Number(process.env.PORT ?? 3003);
const host = process.env.HOST ?? '0.0.0.0';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('allow', 'GET, HEAD');
    response.writeHead(405).end('Method not allowed');
    return;
  }

  const path = staticPath(request.url ?? '/');
  if (!path) {
    response.writeHead(404).end('Not found');
    return;
  }

  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  response.setHeader('cross-origin-resource-policy', 'cross-origin');
  response.setHeader('content-type', contentTypes.get(extname(path)) ?? 'application/octet-stream');
  response.setHeader(
    'cache-control',
    path.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
  );
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}).listen(port, host, () => {
  process.stdout.write(`Lodariq editor static server listening on ${host}:${port}\n`);
});

function staticPath(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl, 'http://localhost');
  } catch {
    return null;
  }
  const pathname = url.pathname === '/' ? '/authoring.html' : url.pathname;
  let normalized;
  try {
    normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  } catch {
    return null;
  }
  const candidate = join(root, normalized);
  const insideRoot = candidate === root || candidate.startsWith(rootPrefix);
  if (!insideRoot || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  return candidate;
}
