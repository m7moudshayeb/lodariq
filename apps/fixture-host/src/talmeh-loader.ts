import type { TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { LOCAL_AUTHORING_SESSION_ID } from '@talmeh/sdk-authoring';
import { installTalmehFromScript } from '@talmeh/sdk-runtime/talmeh-loader';
import { compilePreview } from '@talmeh/sdk-runtime/talmeh-local-dev';

async function bootLocalTalmeh(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>('script[data-talmeh-loader]');
  if (!script) throw new Error('Talmeh loader script not found');
  const talmeh = await installTalmehFromScript(script, {
    // Browser compilation is preview-only for the local fixture (PRD §20).
    loadCurrentTour: () => compilePreview(tourFixture as TalmehDocument),
    openAuthoring: async (manifest) => {
      const { openLocalAuthoringPanel } = await import('@talmeh/sdk-authoring/talmeh-authoring');
      openLocalAuthoringPanel(
        {
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: manifest.documentId,
          workspaceId: 'wk_local_dev',
          environment: 'development',
        },
        { iframeSrc: '/authoring.html' },
      );
    },
  });
  if (!talmeh) throw new Error('Talmeh loader config is invalid');

  const authoringButton = document.createElement('button');
  authoringButton.type = 'button';
  authoringButton.textContent = 'Author';
  authoringButton.setAttribute('aria-label', 'Open Talmeh authoring');
  authoringButton.className = 'talmeh-authoring-trigger';
  authoringButton.addEventListener('click', () => {
    void talmeh.openAuthoring();
  });
  document.body.appendChild(authoringButton);

  document.querySelector('[data-talmeh-id="start-tour"]')?.addEventListener('click', async () => {
    await talmeh.playTour();
  });
}

void bootLocalTalmeh();
