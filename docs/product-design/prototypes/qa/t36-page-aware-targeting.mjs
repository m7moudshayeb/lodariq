/**
 * Page-aware targeting, against the built resolver on a host that never removes
 * anything.
 *
 * `t35` proves the presentation half: the card hides when the visitor leaves.
 * That is not the dangerous half. Two paths — a click-for-me step and the action
 * at the end of a tour — call `.click()` on whatever the resolver handed back,
 * so a target that still *matches* off-page presses an unrelated control in the
 * customer's live application whether a card is showing or not.
 *
 * This host puts the same button, with the same markup and the same accessible
 * name, on two screens at once. Both are in the DOM from the first paint and
 * neither is ever removed. The only thing telling them apart is the page.
 *
 *   pnpm --filter @lodariq/sdk-runtime build
 *   node docs/product-design/prototypes/qa/t36-page-aware-targeting.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, REPO } from './env.mjs';

const RUNTIME_DIST = normalize(join(REPO, 'packages/sdk-runtime/dist'));
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json' };

const HOST_HTML = `<!doctype html>
<title>Page-aware targeting host</title>
<style>
  body { margin: 0; font: 14px system-ui; }
  nav { display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid #ddd; }
  section { padding: 24px; }
</style>
<!-- Built once. Routing toggles the hidden attribute and nothing else. -->
<nav aria-label="Primary">
  <a href="#/projects" data-nav="projects">Projects</a>
  <a href="#/billing" data-nav="billing">Billing</a>
</nav>
<section data-route="projects">
  <h1>Projects</h1>
  <button type="button" data-id="publish" aria-label="Publish">Publish</button>
</section>
<section data-route="billing" hidden>
  <h1>Billing</h1>
  <!-- Same tag, same name, same marker: the lookalike a fingerprint cannot rule out. -->
  <button type="button" data-id="publish" aria-label="Publish">Publish</button>
</section>
<script type="module">
  const show = () => {
    // A record id deepens the path without changing the screen — the case prefix is for.
    const route = (location.hash.slice(2).split('?')[0].split('/')[0]) || 'projects';
    for (const section of document.querySelectorAll('[data-route]')) {
      section.hidden = section.dataset.route !== route;
    }
  };
  addEventListener('hashchange', show);
  show();
</script>
<script type="module">
  import { resolveTarget } from '/resolver/index.js';
  const identity = (page) => ({
    schemaVersion: 2,
    targetId: 'target_publish',
    intent: { elementKind: 'control', requiredAction: 'observe-click' },
    invariants: { configuredAttributes: { 'data-id': 'publish' } },
    semantics: { tagName: 'button', role: 'button' },
    context: { ...(page ? { page } : {}), ancestorRoles: [] },
    localizedEvidence: [{ locale: 'en', accessibleName: 'Publish' }],
    captureEvidence: {
      sampleCount: 3,
      stableSignalFamilies: ['configured-attribute', 'element-semantics'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.75,
      quality: 'strong',
    },
    display: { authorLabel: 'Publish' },
  });
  window.__try = (page) => {
    const target = {
      id: 'target_publish',
      fingerprint: { tagName: 'button', role: 'button', accessibleName: 'Publish', stableAttributes: { 'data-id': 'publish' } },
      identity: identity(page),
    };
    const result = resolveTarget(target, document);
    const owner = result.element?.closest('[data-route]')?.dataset.route ?? null;
    // What both buttons look like at this instant, whatever the resolver said.
    const buttons = [...document.querySelectorAll('[data-id="publish"]')].map((b) => ({
      route: b.closest('[data-route]').dataset.route,
      connected: b.isConnected,
      name: b.getAttribute('aria-label'),
    }));
    return { state: result.state, reasonCode: result.reasonCode, owner, buttons, hash: location.hash };
  };
</script>`;

const dist = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(HOST_HTML);
  }
  const path = normalize(join(RUNTIME_DIST, decodeURIComponent(pathname)));
  if (!path.startsWith(RUNTIME_DIST)) return res.writeHead(403).end();
  try {
    await stat(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => dist.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${dist.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 300)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const attempt = (scope) => page.evaluate((value) => window.__try(value), scope ?? null);
const go = async (hash) => {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await page.waitForTimeout(300);
};

await page.goto(`${origin}/#/projects`, { waitUntil: 'networkidle' });

const authored = { key: '/#/projects' };

// Both lookalikes exist from the first paint. If any assertion below passed
// because a button was missing rather than because of the page, this says so.
const onPage = await attempt(authored);
check(
  'both Publish buttons are in the DOM',
  onPage.buttons.length === 2,
  JSON.stringify(onPage.buttons),
);
check(
  'resolves on the page it was authored on',
  onPage.state === 'found' && onPage.owner === 'projects',
  JSON.stringify(onPage),
);

await go('#/billing');
const away = await attempt(authored);
check(
  'refuses the lookalike on /billing',
  away.state === 'missing' && away.reasonCode === 'route_mismatch',
  JSON.stringify(away),
);
check(
  '  ...while that lookalike is present and connected',
  away.buttons.every((b) => b.connected) && away.buttons.length === 2,
  JSON.stringify(away.buttons),
);

// The same call with no page recorded — what every target looks like today.
const unscoped = await attempt(null);
check(
  'without a page it takes the billing lookalike, which is the bug',
  unscoped.state === 'found' && unscoped.owner === 'billing',
  JSON.stringify(unscoped),
);

await go('#/projects');
const back = await attempt(authored);
check(
  'comes back on /projects',
  back.state === 'found' && back.owner === 'projects',
  JSON.stringify(back),
);

// A visitor sorting a column or opening a dialog has not changed page.
await go('#/projects?sort=name&pop=import');
const queried = await attempt(authored);
check(
  'a hash query is not a different page',
  queried.state === 'found' && queried.owner === 'projects',
  JSON.stringify(queried),
);

// An author who asked for "pages starting with" gets the record-id case.
await go('#/projects/8f21');
check('exact refuses a deeper path', (await attempt(authored)).state === 'missing');
check(
  'prefix covers it',
  (await attempt({ key: '/#/projects', match: 'prefix' })).state === 'found',
);

await browser.close();
dist.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
