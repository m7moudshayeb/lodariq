import { DEMO_PLAYER_MODULE_URL } from '@lodariq/schema';

export interface PublicDemoShell {
  contentSecurityPolicy: string;
  html: string;
}

/** Static, credential-free shell served only from demo.lodariq.io. */
export function renderPublicDemoShell(styleNonce: string): PublicDemoShell {
  if (!/^[A-Za-z0-9_-]{20,}$/u.test(styleNonce)) {
    throw new Error('A strong public demo style nonce is required');
  }
  const moduleOrigin = new URL(DEMO_PLAYER_MODULE_URL).origin;
  const contentSecurityPolicy = [
    "default-src 'none'",
    `script-src ${moduleOrigin}`,
    `style-src 'nonce-${styleNonce}'`,
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    contentSecurityPolicy,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>Lodariq demo</title>
    <style nonce="${styleNonce}">
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #f5f6f8; color: #171a1f; }
      main { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
      header, footer { padding: 18px 24px; color: #5f6672; font-size: 13px; }
      header { border-bottom: 1px solid #e3e6eb; background: rgba(255,255,255,.82); }
      #lodariq-demo-player { position: relative; min-height: min(760px, calc(100vh - 116px)); overflow: hidden; }
      [data-lodariq-demo-status] { place-self: center; max-width: 36rem; padding: 24px; text-align: center; }
    </style>
    <script type="module" src="${DEMO_PLAYER_MODULE_URL}"></script>
  </head>
  <body>
    <main>
      <header>Lodariq structured demo</header>
      <section id="lodariq-demo-player" aria-label="Interactive product demo">
        <p data-lodariq-demo-status role="status">Loading demo…</p>
      </section>
      <footer>This demo uses reviewed, immutable content and anonymous scoped analytics.</footer>
    </main>
  </body>
</html>`,
  };
}
