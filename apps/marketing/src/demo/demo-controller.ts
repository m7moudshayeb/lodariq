/**
 * Wires the hero demo: a real fixture-host build in an iframe, the real SDK
 * installed inside it, and a real compiled tour played through the SDK's own
 * public `playTour` API. Same-origin embedding is what keeps this honest —
 * the page talks to `window.Lodariq` in the frame exactly the way the
 * product's own code would.
 */
import { compileDocument } from '@lodariq/compiler';
import { RENDERER_CONTRACT_VERSION, type NewCompiledDocument } from '@lodariq/schema';
import { DEMO_URL, DEMO_VIEWPORT } from '../config';
import { demoBrandTheme } from './demo-theme';
import { MERIDIAN_TOUR } from './meridian-tour';

/**
 * The slice of the SDK's browser API the demo drives. Declared structurally
 * so the marketing app depends only on `@lodariq/schema` + `@lodariq/compiler`
 * — the SDK itself arrives via the embedded fixture-host build, exactly like
 * on a customer page.
 */
interface EmbeddedLodariqApi {
  playTour: (
    doc?: unknown,
    options?: { onTargetResolution?: (step: { id: string }, result: unknown) => void },
  ) => Promise<void>;
  stopTour: () => void;
}

type DemoStatus = 'loading' | 'ready' | 'playing' | 'finished' | 'error';

const MERIDIAN_RESUME_KEY = 'meridian.tour.resume';
const API_POLL_INTERVAL_MS = 100;
const API_POLL_TIMEOUT_MS = 12_000;
const TOUR_CARD_TAG = 'lodariq-tour';
const TOUR_WATCH_INTERVAL_MS = 400;

const STATUS_COPY: Record<DemoStatus, string> = {
  loading: 'Loading the demo product…',
  ready: 'This is a live product — click around, then play the tour.',
  playing: 'Tour running — the rest of the page stays interactive.',
  finished: 'That was the real SDK. Replay it, or keep exploring.',
  error: 'The demo could not load. Refresh the page to try again.',
};

export function mountDemo(root: HTMLElement): void {
  const stage = requireElement(root, '[data-demo-stage]');
  const iframe = requireElement<HTMLIFrameElement>(root, '[data-demo-frame]');
  const playButton = requireElement<HTMLButtonElement>(root, '[data-demo-play]');
  const resetButton = requireElement<HTMLButtonElement>(root, '[data-demo-reset]');
  const statusLine = requireElement(root, '[data-demo-status]');
  const stepDots = Array.from(root.querySelectorAll<HTMLElement>('[data-demo-step]'));

  let compiled: NewCompiledDocument | null = null;
  let tourWatch: ReturnType<typeof setInterval> | undefined;

  const setStatus = (status: DemoStatus): void => {
    root.dataset['demoState'] = status;
    statusLine.textContent = STATUS_COPY[status];
    playButton.disabled = status === 'loading' || status === 'error';
  };

  const setActiveStep = (index: number): void => {
    stepDots.forEach((dot, dotIndex) => {
      dot.dataset['state'] = dotIndex < index ? 'done' : dotIndex === index ? 'active' : 'todo';
    });
  };

  const clearSteps = (): void => {
    stepDots.forEach((dot) => {
      dot.dataset['state'] = 'todo';
    });
  };

  const fitFrame = (): void => {
    const scale = stage.clientWidth / DEMO_VIEWPORT.width;
    iframe.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.round(DEMO_VIEWPORT.height * scale)}px`;
  };

  const frameWindow = (): (Window & { Lodariq?: EmbeddedLodariqApi }) | null =>
    iframe.contentWindow as (Window & { Lodariq?: EmbeddedLodariqApi }) | null;

  const waitForSdk = async (): Promise<EmbeddedLodariqApi> => {
    const startedAt = performance.now();
    for (;;) {
      const api = frameWindow()?.Lodariq;
      if (api) return api;
      if (performance.now() - startedAt > API_POLL_TIMEOUT_MS) {
        throw new Error('Lodariq SDK did not come up inside the demo frame');
      }
      await sleep(API_POLL_INTERVAL_MS);
    }
  };

  const compileTour = async (): Promise<NewCompiledDocument> => {
    // Browser compilation is preview-only by design — identical to how the
    // authoring surface previews a draft before server-side publication.
    compiled ??= await compileDocument({
      document: MERIDIAN_TOUR,
      theme: await demoBrandTheme(),
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
    });
    return compiled;
  };

  const watchForTourEnd = (): void => {
    if (tourWatch) clearInterval(tourWatch);
    tourWatch = setInterval(() => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      if (!doc.querySelector(TOUR_CARD_TAG)) {
        if (tourWatch) clearInterval(tourWatch);
        tourWatch = undefined;
        setStatus('finished');
      }
    }, TOUR_WATCH_INTERVAL_MS);
  };

  const play = async (): Promise<void> => {
    try {
      const [api, tour] = await Promise.all([waitForSdk(), compileTour()]);
      api.stopTour();
      clearSteps();
      setStatus('playing');
      const stepIds = tour.steps.map((step: { id: string }) => step.id);
      await api.playTour(tour, {
        onTargetResolution: (step: { id: string }) => {
          const index = stepIds.indexOf(step.id);
          if (index >= 0) setActiveStep(index);
        },
      });
      watchForTourEnd();
    } catch {
      setStatus('error');
    }
  };

  // The compiled artifact is content-addressed and immutable, so a frame
  // reload only resets the product — the tour never needs recompiling.
  const reset = (): void => {
    if (tourWatch) clearInterval(tourWatch);
    tourWatch = undefined;
    clearSteps();
    setStatus('loading');
    iframe.src = DEMO_URL;
  };

  iframe.addEventListener('load', () => {
    try {
      // The fixture host resumes an interrupted tour by design; a marketing
      // hero should come up quiet instead.
      frameWindow()?.sessionStorage.removeItem(MERIDIAN_RESUME_KEY);
    } catch {
      /* sandboxed or detached frame — nothing to clean */
    }
    setStatus('ready');
  });

  playButton.addEventListener('click', () => void play());
  resetButton.addEventListener('click', reset);

  new ResizeObserver(fitFrame).observe(stage);
  fitFrame();
  setStatus('loading');

  // The demo IS the hero, so it loads unconditionally — but after the page's
  // own load event, so ~700KB of fixture-host bundle never competes with the
  // landing page's first paint.
  //
  // (An IntersectionObserver-based lazy load proved unreliable here: a page
  // opened in a background tab never fires the observer until refocus, and
  // the centerpiece must never depend on that.)
  const startDemo = (): void => {
    iframe.src = DEMO_URL;
  };
  if (document.readyState === 'complete') startDemo();
  else window.addEventListener('load', startDemo, { once: true });
}

function requireElement<T extends HTMLElement = HTMLElement>(
  root: HTMLElement,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Demo markup is missing ${selector}`);
  return element;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
