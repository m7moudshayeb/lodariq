/**
 * Meridian's own Lodariq integration. Two things matter here beyond installing:
 *
 *  - `identify` runs on every navigation, so conditions, branches and adaptive
 *    skipping evaluate against a real payload rather than a fixture constant.
 *  - resume is the SDK's, not Meridian's. This host deliberately keeps no
 *    resume state and puts nothing in its own URL: a fixture that solves the
 *    problem itself cannot show whether the product solves it.
 */
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';
import { compilePreview, saveDocument } from '@lodariq/sdk-runtime/local-dev';
import { getState, navigate, subscribe } from './router';
import { approachFixtureDocument } from './approach-fixture';
import { experienceTypeFixtureDocument } from './experience-type-fixture';

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
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const pageParams = new URLSearchParams(window.location.search);
  const fixtureScenario = pageParams.get('scenario');
  let baseDocument = tourFixture as LodariqDocument;
  if (params.get('conditional-content') === '1' || fixtureScenario === 'conditional') {
    baseDocument = conditionalContentDocument();
  }
  if (fixtureScenario === 'presentation') baseDocument = presentationDocument();
  if (fixtureScenario === 'experience-type') {
    baseDocument =
      experienceTypeFixtureDocument(pageParams.get('type'), pageParams.get('surface')) ??
      baseDocument;
  }
  if (fixtureScenario === 'approach') {
    baseDocument = approachFixtureDocument();
    baseDocument.id = (tourFixture as LodariqDocument).id;
    saveDocument(baseDocument);
  }
  const lodariq = await installLocalLodariqAuthoringFromScript({
    baseDocument,
    iframeSrc: '/authoring.html',
  });
  if (!lodariq) throw new Error('Lodariq loader config is invalid');

  lodariq.identify(currentTraits());
  subscribe(() => lodariq.identify(currentTraits()));

  const play = async (documentId?: string): Promise<void> => {
    const shouldPlayScenarioDocument = documentId === undefined && Boolean(fixtureScenario);
    if (
      shouldPlayScenarioDocument ||
      documentId === baseDocument.id ||
      fixtureScenario === 'presentation'
    ) {
      const compiled = await compilePreview(baseDocument);
      await lodariq.playTour(
        fixtureScenario === 'presentation' ? { ...compiled, showLodariqBadge: true } : compiled,
      );
    } else if (documentId && lodariq.playTourById) await lodariq.playTourById(documentId);
    else await lodariq.playTour();
  };

  window.__meridian = {
    playTour: play,
    openAuthoring: () => lodariq.openAuthoring(),
    stopTour: () => lodariq.stopTour(),
    identify: (traits) => lodariq.identify(traits),
  };

  wireLaunchers(play, () => lodariq.openAuthoring());

  // An explicit `?tour=` is the harness asking for a fresh run. Everything else
  // is the SDK's business: `installLodariq` has already restored a stored step
  // by the time this runs, and re-entering playback here would restart it.
  const requested = params.get('tour') ?? pageParams.get('tour');
  if (requested) await play(requested === '1' ? undefined : requested);
}

function presentationDocument(): LodariqDocument {
  const document = structuredClone(tourFixture as LodariqDocument);
  document.id = 'doc_tour_presentation';
  const step = document.blocks[0];
  if (step) {
    step.props.motion = {
      durationMs: 900,
      easing: 'standard',
      recipe: 'lift',
      reducedMotion: 'none',
    };
  }
  return document;
}

function conditionalContentDocument(): LodariqDocument {
  const document = structuredClone(tourFixture as LodariqDocument);
  document.id = 'doc_tour_conditional_content';
  document.title = 'Conditional content tour';
  const tooltip = document.blocks[0]?.children.find((block) => block.type === 'tooltip');
  const heading = tooltip?.children.find((block) => block.type === 'heading');
  const paragraph = tooltip?.children.find((block) => block.type === 'paragraph');
  if (!heading || !paragraph) return document;
  heading.content = 'Growth plan guidance';
  paragraph.content = 'Free plan guidance should stay hidden';
  heading.props.showWhen = {
    source: 'identifyTrait',
    key: 'plan',
    operator: 'equals',
    value: 'growth',
  };
  paragraph.props.showWhen = {
    source: 'identifyTrait',
    key: 'plan',
    operator: 'equals',
    value: 'free',
  };
  return document;
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
