import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const DEMO_URL_PREFIX = '/demo/';
const DEMO_SOURCE_DIR = resolve(__dirname, '../fixture-host/dist-demo');

const DEMO_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function copyDirectory(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    const destination = join(to, name);
    if (statSync(source).isDirectory()) copyDirectory(source, destination);
    else copyFileSync(source, destination);
  }
}

/**
 * Serves the demo build of the fixture host (see scripts/prepare-demo.mjs)
 * under /demo/ in dev, and copies it into dist/demo on build. The demo is a
 * sibling app's build output rather than a source import, so the package
 * boundary between apps stays intact.
 */
function fixtureHostDemoPlugin(): Plugin {
  return {
    name: 'lodariq-fixture-host-demo',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!url.startsWith(DEMO_URL_PREFIX)) return next();
        const relative = url.slice(DEMO_URL_PREFIX.length) || 'index.html';
        const filePath = join(DEMO_SOURCE_DIR, relative);
        if (!filePath.startsWith(DEMO_SOURCE_DIR) || !existsSync(filePath)) return next();
        res.setHeader(
          'Content-Type',
          DEMO_CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
        );
        res.end(readFileSync(filePath));
      });
    },
    closeBundle() {
      if (!existsSync(DEMO_SOURCE_DIR)) {
        throw new Error(
          'Demo fixture host missing — run `pnpm --filter @lodariq/marketing demo:prepare` first',
        );
      }
      copyDirectory(DEMO_SOURCE_DIR, resolve(__dirname, 'dist/demo'));
    },
  };
}

export default defineConfig({
  plugins: [fixtureHostDemoPlugin()],
  server: { port: 5178 },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
