import type { TalmehDocument } from '@talmeh/schema';
import { compilePreview } from '@talmeh/sdk-runtime/local-dev';
import { TourPlayer } from '@talmeh/sdk-runtime/renderers/tour';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { renderApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

renderApp(root);

// Boot the local SDK against the fixture: compile the canonical tour (preview
// only) and play it back through the framework-free runtime (PRD §16.1).
root.querySelector('[data-talmeh-id="start-tour"]')?.addEventListener('click', async () => {
  const compiled = await compilePreview(tourFixture as TalmehDocument);
  const player = new TourPlayer(compiled, {
    onComplete: () => console.info('[talmeh] tour complete'),
  });
  player.start();
});
