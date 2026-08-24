/**
 * How the panel finds out who owns the experiences.
 *
 * The launcher is installed by the host and the panel is opened later, possibly
 * from a different chunk; a module-level registry would only work if the bundler
 * happened to put them in the same one. A synchronous event handshake works
 * whatever the chunking, and matches how the two already talk (§3.3).
 */
import { LOCAL_AUTHORING_EXPERIENCE_PROVIDER_EVENT } from '../authoring/constants';
import type { ExperienceMenuProvider } from './types';

interface ProviderHandshake {
  provide: (provider: ExperienceMenuProvider) => void;
}

/** Called by whoever holds the capabilities — in practice, the launcher. */
export function publishExperienceMenuProvider(
  view: Window,
  provider: ExperienceMenuProvider,
): () => void {
  const onRequest = (event: Event): void => {
    (event as CustomEvent<ProviderHandshake>).detail?.provide(provider);
  };
  view.addEventListener(LOCAL_AUTHORING_EXPERIENCE_PROVIDER_EVENT, onRequest);
  return () => view.removeEventListener(LOCAL_AUTHORING_EXPERIENCE_PROVIDER_EVENT, onRequest);
}

/**
 * Returns null when nobody answered, which is the honest answer for a host that
 * installed the panel without the launcher's capabilities. The menu prints no
 * rows in that case rather than rows that lead nowhere.
 */
export function requestExperienceMenuProvider(view: Window): ExperienceMenuProvider | null {
  let found: ExperienceMenuProvider | null = null;
  view.dispatchEvent(
    new CustomEvent<ProviderHandshake>(LOCAL_AUTHORING_EXPERIENCE_PROVIDER_EVENT, {
      detail: {
        provide: (provider) => {
          found = provider;
        },
      },
    }),
  );
  return found;
}
