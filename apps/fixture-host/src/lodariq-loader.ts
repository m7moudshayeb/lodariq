/**
 * Meridian's own Lodariq integration. Two things matter here beyond installing:
 *
 *  - `identify` runs on every navigation, so conditions, branches and adaptive
 *    skipping evaluate against a real payload rather than a fixture constant.
 *  - the tour is launched from the URL (`?tour=`/`&step=`), so a full page
 *    reload resumes where it stopped instead of restarting.
 */
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';
import { getState, navigate, subscribe } from './router';

const RESUME_KEY = 'meridian.tour.resume';

/** What Meridian knows about the signed-in person. `userId` is required. */
interface MeridianTraits {
  userId: string;
  email: string;
  plan: string;
  role: string;
  seats: number;
  signupDays: number;
  locale: string;
  route: string;
  /** The SDK accepts any extra traits a product wants to send. */
  [key: string]: unknown;
}

interface MeridianTestApi {
  playTour: (documentId?: string) => Promise<void>;
  openAuthoring: () => Promise<void>;
  stopTour: () => void;
  identify: (traits: MeridianTraits) => void;
}

declare global {
  interface Window {
    __meridian?: MeridianTestApi;
  }
}

function currentTraits(): MeridianTraits {
  const state = getState();
  return {
    userId: 'usr_meridian_demo',
    email: 'you@meridian.io',
    plan: 'growth',
    role: 'admin',
    seats: 12,
    signupDays: 3,
    locale: state.locale,
    route: state.route,
  };
}

async function bootLocalLodariq(): Promise<void> {
  const lodariq = await installLocalLodariqAuthoringFromScript({
    baseDocument: tourFixture as LodariqDocument,
    iframeSrc: '/authoring.html',
  });
  if (!lodariq) throw new Error('Lodariq loader config is invalid');

  lodariq.identify(currentTraits());
  subscribe(() => lodariq.identify(currentTraits()));

  const play = async (documentId?: string): Promise<void> => {
    sessionStorage.setItem(RESUME_KEY, documentId ?? 'default');
    if (documentId && lodariq.playTourById) await lodariq.playTourById(documentId);
    else await lodariq.playTour();
  };

  window.__meridian = {
    playTour: play,
    openAuthoring: () => lodariq.openAuthoring(),
    stopTour: () => {
      sessionStorage.removeItem(RESUME_KEY);
      lodariq.stopTour();
    },
    identify: (traits) => lodariq.identify(traits),
  };

  wireLaunchers(play, () => lodariq.openAuthoring());

  // A tour named in the URL wins; otherwise the runtime's own resume applies.
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const requested = params.get('tour');
  if (requested) {
    await play(requested === '1' ? undefined : requested);
    return;
  }
  if (sessionStorage.getItem(RESUME_KEY)) {
    // The runtime restores its own step; this only re-enters playback.
    await play();
  }
}

/**
 * Launchers live in the product's own chrome, not in a Lodariq strip: the
 * account menu for a guided tour, a keyboard-reachable button for authoring.
 */
function wireLaunchers(play: () => Promise<void>, openAuthoring: () => Promise<void>): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const label = target?.textContent?.trim();
    if (!target || !label) return;
    if (target.matches('.pop button') && label === 'Preferences') {
      event.preventDefault();
      navigate({ pop: null });
      void openAuthoring();
    }
  });

  /*
   * Meridian ships no Lodariq controls of its own — the SDK's launcher and the
   * product's own chrome are the only ways in, which is the whole point of a
   * fixture. This delegated handler is the programmatic seam the e2e harness
   * drives; nothing in the page renders a button for it.
   */
  document.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-host-action]')
      ?.dataset['hostAction'];
    if (action === 'tour') void play();
    if (action === 'authoring') void openAuthoring();
    if (action === 'reload') window.location.reload();
  });
}

void bootLocalLodariq();
