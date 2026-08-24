import {
  applyAuthoringLocale,
  authoringText,
  configureAuthoringLocale,
} from '@lodariq/sdk-authoring/i18n';

export const authoringFrameReady = initializeAuthoringFrame();

async function initializeAuthoringFrame(): Promise<void> {
  /**
   * Started before the locale is resolved, not after it.
   *
   * The application chunk and the locale catalog are both needed to render and
   * neither depends on the other, so awaiting them in sequence spent a whole
   * round trip proving that. The rejection handler is attached immediately
   * because the locale may throw first, and an unobserved rejection here would
   * surface as an uncaught error in a creator's console.
   */
  const applicationModule = import('./authoring-frame-app');
  applicationModule.catch(() => {
    // Reported below, once both settle.
  });
  try {
    await configureAuthoringLocale([...navigator.languages, document.documentElement.lang]);
    applyAuthoringLocale(document);
    await applicationModule;
  } catch {
    const root = document.getElementById('authoring');
    if (!root) return;
    root.setAttribute('data-state', 'error');
    root.textContent = authoringText('Lodariq authoring could not start.');
  }
}
