/**
 * Getting the creator to the page a preview starts on.
 *
 * A tour that spans two screens starts on one of them. Pressing Preview from
 * the other used to do nothing useful — the first step is not on this page, so
 * it cannot anchor, and the creator is left looking at a tour that will not
 * begin with no idea why. Take them there instead.
 *
 * This never reloads. A reload would end the authoring session and the preview
 * with it, so the only moves available are the ones a client-side router
 * answers. When none of them work we say so rather than pretending.
 */
import { currentPageKey, pageKeyMatches, type TargetPageMatch } from '@lodariq/schema/page-key';

/** Thrown so the caller unwinds the preview it had already started setting up. */
export class PreviewPageUnreachableError extends Error {
  constructor(readonly destination: string) {
    super(`Preview page ${destination} could not be reached`);
    this.name = 'PreviewPageUnreachableError';
  }
}

export interface PreviewPageDestination {
  readonly key: string;
  readonly match?: TargetPageMatch;
}

export type PreviewNavigationOutcome =
  /** Already there, or the step does not care which page it is on. */
  | { readonly kind: 'already-there' }
  | { readonly kind: 'arrived' }
  /** The application did not follow. The creator has to go there themselves. */
  | { readonly kind: 'unreachable'; readonly destination: string };

/** Which page a compiled step's target belongs to, if it named one. */
export function stepPageDestination(
  document: {
    readonly steps: readonly { readonly id: string; readonly targetId?: string }[];
    readonly targets: readonly {
      readonly id: string;
      readonly identity?: { readonly context: { readonly page?: PreviewPageDestination } };
    }[];
  },
  stepId: string | undefined,
): PreviewPageDestination | null {
  const step = stepId
    ? document.steps.find((candidate) => candidate.id === stepId)
    : document.steps[0];
  if (!step?.targetId) return null;
  const page = document.targets.find((target) => target.id === step.targetId)?.identity?.context
    .page;
  return page ?? null;
}

export interface PreviewNavigationOptions {
  /** How long to wait for the application's own router to catch up. */
  readonly timeoutMs?: number;
  readonly view?: Window;
}

/**
 * Put the browser on `destination` and wait for it to actually be there.
 *
 * A hash route is a plain assignment. A different path needs `pushState`, which
 * changes the address without telling anyone, so the popstate every client-side
 * router listens for is dispatched behind it. An application that routes on the
 * server ignores both, which is why the arrival is verified rather than assumed.
 */
export async function goToPreviewPage(
  destination: PreviewPageDestination,
  options: PreviewNavigationOptions = {},
): Promise<PreviewNavigationOutcome> {
  const view = options.view ?? (typeof window === 'undefined' ? undefined : window);
  const here = currentPageKey();
  if (!view || !here) return { kind: 'already-there' };
  if (pageKeyMatches(destination.key, destination.match, here)) return { kind: 'already-there' };

  const [path, route] = splitPageKey(destination.key);
  const samePath = path === (view.location.pathname || '/').replace(/(.)\/$/, '$1');
  if (samePath && route !== null) {
    view.location.hash = route;
  } else {
    view.history.pushState(null, '', route === null ? path : `${path}#${route}`);
    view.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }

  return (await settlesOn(destination, view, options.timeoutMs ?? 1_500))
    ? { kind: 'arrived' }
    : { kind: 'unreachable', destination: readablePage(destination.key) };
}

/** `/app#/billing` -> `['/app', '/billing']`; `/billing` -> `['/billing', null]`. */
function splitPageKey(key: string): [string, string | null] {
  const hash = key.indexOf('#');
  return hash < 0 ? [key, null] : [key.slice(0, hash) || '/', key.slice(hash + 1)];
}

async function settlesOn(
  destination: PreviewPageDestination,
  view: Window,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const key = currentPageKey();
    // The address is ours to set; whether the application rendered the screen
    // is not, so give it a frame or two past the change before giving up.
    if (key && pageKeyMatches(destination.key, destination.match, key)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => view.setTimeout(resolve, 50));
  }
}

/** The address as an author would say it: `Billing`, not `/#/billing/plan`. */
function readablePage(key: string): string {
  const segments = key.replace('#', '/').split('/').filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '/';
}
