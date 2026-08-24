/**
 * Page scope on a host that never removes anything.
 *
 * `t34` runs against the fixture host, and the fixture host wipes the document
 * on every route (`root.innerHTML = shell(state)`, apps/fixture-host/src/app.ts).
 * That is the easy case: half the steps would hide anyway, just because their
 * target stopped existing, and a target-availability check would look like a
 * working page scope.
 *
 * Real applications do not work that way. React and Vue keep the chrome mounted
 * and swap only the outlet, so the nav a step is anchored to is the *same node*
 * on every screen for the life of the tab. This host is that: one DOM, built
 * once, every screen present from the first paint, routes toggling nothing but
 * `hidden`. Nothing is ever added or removed after boot.
 *
 * If page scope were really target availability wearing a hat, every assertion
 * below would fail — the anchors are all still there, still visible, still the
 * identical node objects.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, REPO } from './env.mjs';

const RUNTIME_DIST = normalize(join(REPO, 'packages/sdk-runtime/dist'));
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json' };

const HOST_HTML = `<!doctype html>
<title>Persistent DOM host</title>
<style>
  body { margin: 0; font: 14px system-ui; }
  nav { display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid #ddd; }
  section { padding: 24px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 12px; }
</style>
<!-- Built once. Nothing below is ever removed, replaced or re-created. -->
<nav aria-label="Primary">
  <a href="#/projects" data-nav="projects">Projects</a>
  <a href="#/billing" data-nav="billing">Billing</a>
  <a href="#/reports" data-nav="reports">Reports</a>
</nav>
<section data-route="projects">
  <h1>Projects</h1>
  <button data-id="new-project" aria-label="New project">New project</button>
  <table data-id="projects-table"><thead><tr><th>Project</th><th>Owner</th><th>Team</th></tr></thead>
    <tbody><tr><td>Atlas</td><td>Dana</td><td>Core</td></tr></tbody></table>
</section>
<section data-route="billing" hidden>
  <h1>Billing</h1>
  <table data-id="invoices-table"><thead><tr><th>Invoice</th><th>Period</th><th>Amount</th></tr></thead>
    <tbody><tr><td>INV-1</td><td>Aug</td><td>$40</td></tr></tbody></table>
</section>
<section data-route="reports" hidden><h1>Reports</h1></section>
<script type="module">
  // Visibility only. No node is created or destroyed by routing.
  const show = () => {
    const route = (location.hash.slice(2).split('?')[0]) || 'projects';
    for (const section of document.querySelectorAll('[data-route]')) {
      section.hidden = section.dataset.route !== route;
    }
  };
  addEventListener('hashchange', show);
  show();
  window.__nodes = () => ({
    nav: document.querySelector('[data-nav="reports"]'),
    newProject: document.querySelector('[data-id="new-project"]'),
    projectsTable: document.querySelector('[data-id="projects-table"]'),
  });
</script>
<script type="module">
  import { TourPlayer } from '/renderers/tour.js';
  const step = (id, targetId, text) => ({
    id,
    targetId,
    placement: 'bottom',
    body: [
      { id: id + '_h', type: 'heading', text, props: {} },
      { id: id + '_b', type: 'button', text: 'Continue', props: { action: { type: 'next' } } },
    ],
  });
  window.__play = () => {
    const player = new TourPlayer({
      documentId: 'doc_persistent',
      type: 'tour',
      contentHash: 'local',
      schemaVersion: '1.0.0',
      compilerVersion: '0.1.0',
      targets: [
        { id: 't_new', fingerprint: { tagName: 'button', role: 'button', accessibleName: 'New project', stableAttributes: { 'data-id': 'new-project' } } },
        { id: 't_nav', fingerprint: { tagName: 'a', role: 'link', accessibleName: 'Reports', stableAttributes: { 'data-nav': 'reports' } } },
      ],
      steps: [
        step('s_new', 't_new', 'Create your first project'),
        step('s_nav', 't_nav', 'Reports live here'),
      ],
    });
    window.__player = player;
    player.start();
    return player;
  };
</script>`;

const dist = createServer(async (req, res) => {
  const path = normalize(join(RUNTIME_DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(RUNTIME_DIST)) return res.writeHead(403).end();
  if (new URL(req.url, 'http://x').pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(HOST_HTML);
  }
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

const state = () =>
  page.evaluate(() => {
    const card = document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('[role="dialog"]');
    const anchor = document.querySelector('[data-nav="reports"]');
    const newProject = document.querySelector('[data-id="new-project"]');
    return {
      hash: location.hash,
      visible: card ? !card.hidden : false,
      text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28),
      // Proof the anchors never went anywhere.
      navConnected: Boolean(anchor?.isConnected),
      navSameNode: anchor === window.__firstNav,
      newProjectConnected: Boolean(newProject?.isConnected),
      newProjectVisible: Boolean(newProject?.offsetParent),
    };
  });

const go = async (hash) => {
  await page.evaluate((value) => { location.hash = value; }, hash);
  await page.waitForTimeout(1_500);
};

await page.goto(`${origin}/#/projects`, { waitUntil: 'networkidle' });
await page.evaluate(() => { window.__firstNav = document.querySelector('[data-nav="reports"]'); });
await page.evaluate(() => window.__play());
await page.waitForTimeout(1_200);

// Step 1 anchors a button that stays in the DOM on every screen — it is only
// inside a hidden section, which is exactly how a real SPA hides a route.
const projects = await state();
check('step 1 shows on /projects', projects.visible, JSON.stringify(projects));
await go('#/billing');
const billing = await state();
check('step 1 suspends on /billing', !billing.visible, JSON.stringify(billing));
check('  ...and its anchor never left the DOM', billing.newProjectConnected, `connected=${billing.newProjectConnected}`);
await go('#/projects');
check('step 1 returns on /projects', (await state()).visible, JSON.stringify(await state()));

// Step 2 anchors the persistent nav link: same node, visible, on every screen.
await page.evaluate(() => {
  const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
  [...(shadow?.querySelectorAll('button') ?? [])].find((b) => /continue/i.test(b.textContent ?? ''))?.click();
});
await page.waitForTimeout(1_200);
const navStep = await state();
check('step 2 shows, anchored to the always-present nav', navStep.visible, JSON.stringify(navStep));
await go('#/billing');
const navAway = await state();
check('step 2 suspends on /billing', !navAway.visible, JSON.stringify(navAway));
check(
  '  ...while its anchor is the identical node, still on screen',
  navAway.navSameNode && navAway.navConnected,
  `sameNode=${navAway.navSameNode} connected=${navAway.navConnected}`,
);

await browser.close();
dist.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
