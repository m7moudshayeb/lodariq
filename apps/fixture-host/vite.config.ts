import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vite';

/*
 * The loader tag injected into every proxied HTML page from the host app, so
 * the launcher survives a refresh and client-side navigation instead of living
 * only until the next page load.
 */
const LODARIQ_EMBED_TAG = [
  '<script type="module" src="/src/lodariq-embed.ts" data-lodariq-loader',
  ' data-workspace="wk_local_dev" data-env="development"',
  ' data-manifest="/lodariq-local/manifest.json"></script>',
].join('');

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  /*
   * The emoji picker is a lazy chunk inside the SDK's built output, so Vite only
   * discovers `frimousse` when a creator first opens that panel — and rebuilding
   * the SDK invalidates the optimiser mid-session. The chunk then 504s with
   * "Outdated Optimize Dep" and the picker never arrives. Naming it up front
   * makes it a known dependency instead of one discovered too late. Flow map
   * uses React Flow lazily as well; prebundle it up front so its React import
   * cannot be invalidated into a second optimized React URL mid-session.
   */
  optimizeDeps: { include: ['frimousse', '@xyflow/react'] },
  /*
   * Cross-origin embedding for local evaluation: a host app on another port
   * (SocialHub's dev build on :3000) loads `src/lodariq-embed.ts` and
   * `authoring.html` from here.
   *
   * Vite 6.0.9 tightened `server.cors` for CVE-2025-24010, so `cors: true` no
   * longer emits `Access-Control-Allow-Origin` and the browser refuses to
   * *execute* the cross-origin module even though it fetches fine. An explicit
   * origin plus `server.headers` is what actually lands the header.
   *
   * Local evaluation only — do not carry this into a deployed config.
   */
  server: {
    port: 5175,
    cors: { origin: true, credentials: false },
    headers: { 'Access-Control-Allow-Origin': '*' },
    allowedHosts: true,
    /*
     * HOST_APP_PROXY — local evaluation against a real application.
     *
     * Loading the SDK cross-origin into another dev server fights Vite 6's
     * tightened CORS and the host's CSP. Serving the host app *through* this
     * origin removes both: same origin, no preflight, no CSP negotiation, and
     * cookies carry over because they ignore port numbers.
     *
     * Everything that is not a Vite dev asset is forwarded to the host app, so
     * `http://localhost:5175/inbox/tickets` is that app, served from here, with
     * the SDK loadable as a same-origin module.
     *
     * Local evaluation only — never carry this into a deployed config.
     */
    ...hostAppProxy(),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: 'index.html',
        authoring: 'authoring.html',
      },
    },
  },
});

/**
 * The host-app proxy is OPT-IN.
 *
 * Without `LODARIQ_HOST_APP` this is the ordinary fixture host: its own pages,
 * `window.__meridian`, the e2e suites. Set the variable and every non-Vite path
 * is forwarded to that app instead, which is how the SDK gets evaluated against
 * a real product — but it also swallows the fixture's own routes, so it must
 * never be the default.
 *
 *   LODARIQ_HOST_APP=http://localhost:3000 pnpm --filter @lodariq/fixture-host dev
 */
function hostAppProxy(): Record<string, unknown> {
  const target = process.env['LODARIQ_HOST_APP'];
  if (!target) return {};
  return {
    proxy: {
      '^(?!/(?:src/|@fs/|@vite/|@id/|node_modules/|lodariq-local/|authoring\\.html|__lodariq)).+': {
        target: target,
        changeOrigin: false,
        secure: false,
        ws: true,
        /*
         * Take the response so HTML can carry the loader tag. Everything that
         * is not HTML streams through untouched.
         */
        selfHandleResponse: true,
        configure: (proxy: {
          on: (event: string, handler: (...args: never[]) => void) => void;
        }): void => {
          proxy.on('proxyReq', ((proxyReq: { setHeader: (k: string, v: string) => void }) => {
            // Uncompressed, so the body can be rewritten without inflating it.
            proxyReq.setHeader('accept-encoding', 'identity');
          }) as never);
          proxy.on('proxyRes', ((
            proxyRes: IncomingMessage,
            _req: IncomingMessage,
            res: ServerResponse,
          ) => {
            const headers = { ...proxyRes.headers };
            const isHtml = String(headers['content-type'] ?? '').includes('text/html');
            /*
             * Local evaluation only: the host's CSP is written for its own
             * origin and would reject the SDK's injected styles. Dropping it
             * here keeps the experiment moving — the real strict-CSP work is a
             * separate, unbuilt piece.
             */
            delete headers['content-security-policy'];
            delete headers['content-security-policy-report-only'];
            if (!isHtml) {
              res.writeHead(proxyRes.statusCode ?? 200, headers);
              proxyRes.pipe(res);
              return;
            }
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8');
              /*
               * Into <head>, not before </body>. Host apps in this monorepo
               * take over the page by replacing <body>, which would delete a
               * body-injected tag before it ever ran — and take the launcher's
               * mount point with it. A module script in <head> is deferred to
               * after parse, so it still runs late enough, and survives.
               */
              const patched = body.includes('data-lodariq-loader')
                ? body
                : /<\/head>/i.test(body)
                  ? body.replace(/<\/head>/i, `${LODARIQ_EMBED_TAG}</head>`)
                  : body.replace(/<\/body>/i, `${LODARIQ_EMBED_TAG}</body>`);
              delete headers['content-length'];
              res.writeHead(proxyRes.statusCode ?? 200, headers);
              res.end(patched);
            });
          }) as never);
        },
      },
    },
  };
}
