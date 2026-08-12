import {
  applyAuthoringLocale,
  authoringText,
  configureAuthoringLocale,
} from '@lodariq/sdk-authoring/i18n';

export const authoringFrameReady = initializeAuthoringFrame();

async function initializeAuthoringFrame(): Promise<void> {
  try {
    await configureAuthoringLocale([...navigator.languages, document.documentElement.lang]);
    applyAuthoringLocale(document);
    await import('./authoring-frame-app');
  } catch {
    const root = document.getElementById('authoring');
    if (!root) return;
    root.setAttribute('data-state', 'error');
    root.textContent = authoringText('Lodariq authoring could not start.');
  }
}
