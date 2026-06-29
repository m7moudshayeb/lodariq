import type { TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { installLocalTalmehAuthoringFromScript } from '@talmeh/sdk-authoring/local-dev/install';

async function bootLocalTalmeh(): Promise<void> {
  const talmeh = await installLocalTalmehAuthoringFromScript({
    baseDocument: tourFixture as TalmehDocument,
    iframeSrc: '/authoring.html',
  });
  if (!talmeh) throw new Error('Talmeh loader config is invalid');

  document.querySelector('[data-talmeh-id="start-tour"]')?.addEventListener('click', async () => {
    await talmeh.playTour();
  });
}

void bootLocalTalmeh();
