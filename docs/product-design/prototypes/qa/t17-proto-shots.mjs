/** Screenshot every prototype Operations section as the reference set. */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('proto');
const PROTO = new URL('../authoring-spec.html', import.meta.url).href;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(PROTO);
await p.waitForTimeout(1500);

const ids = ['map', 'storyboard', 'batch', 'templates', 'appearance', 'language',
  'audience', 'ab', 'check', 'analytics', 'release', 'recovery', 'collab', 'share'];

for (const id of ids) {
  await p.evaluate((s) => window.openOps?.(s), id);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${id}.png` });
}
console.log('shot', ids.length, 'sections ->', OUT);
await browser.close();
