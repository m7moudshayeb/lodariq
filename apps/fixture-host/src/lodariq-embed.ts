/**
 * App-agnostic local Lodariq embed.
 *
 * `lodariq-loader.ts` is bound to this fixture (its router, its Meridian
 * traits). This entry is the same install with none of that, so any local host
 * — SocialHub's dev build, for example — can load it with a single script tag
 * pointed at this dev server.
 *
 * The one thing that must not be defaulted is `iframeSrc`: it resolves against
 * the *host* page, so `/authoring.html` would 404 on localhost:3000. Deriving it
 * from this module's own URL keeps it on the Lodariq dev server wherever the
 * host happens to live.
 */
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { installLocalLodariqAuthoringFromScript } from '@lodariq/sdk-authoring/local-dev/install';

const lodariqOrigin = new URL(import.meta.url).origin;

void installLocalLodariqAuthoringFromScript({
  baseDocument: tourFixture as unknown as LodariqDocument,
  iframeSrc: `${lodariqOrigin}/authoring.html`,
  authoringTrigger: {
    label: 'LQ',
    ariaLabel: 'Open Lodariq actions',
  },
}).then(
  (api) => {
    if (!api) {
      console.warn(
        '[lodariq] not installed — the loader script tag is missing, or it lacks data-workspace / a development|staging data-env.',
      );
      return;
    }
    console.info('[lodariq] local authoring installed from', lodariqOrigin);
  },
  (error: unknown) => {
    console.error('[lodariq] local install failed', error);
  },
);

/*
 * Host apps here replace <body> when they boot, and some swap it again on a
 * client-side route change. That removes the launcher's mount node while this
 * module stays loaded, so the SDK looks installed but has no UI. Watch for the
 * trigger vanishing and reinstall it.
 *
 * Local evaluation scaffolding — a real installation is a permanent SDK entry
 * in the customer's application shell and does not need this.
 */
const TRIGGER_SELECTOR = '.lodariq-authoring-trigger, [aria-label="Open Lodariq actions"]';
let reinstalling = false;

async function reinstallIfTriggerLost(): Promise<void> {
  if (reinstalling || document.querySelector(TRIGGER_SELECTOR)) return;
  reinstalling = true;
  try {
    await installLocalLodariqAuthoringFromScript({
      baseDocument: tourFixture as unknown as LodariqDocument,
      iframeSrc: `${lodariqOrigin}/authoring.html`,
      authoringTrigger: { label: 'LQ', ariaLabel: 'Open Lodariq actions' },
    });
  } catch (error) {
    console.error('[lodariq] reinstall failed', error);
  } finally {
    reinstalling = false;
  }
}

/*
 * Coalesced, and NOT subtree-wide.
 *
 * The first version observed `document.documentElement` with `subtree: true`,
 * which in a live application means a callback on essentially every DOM
 * mutation — an inbox that streams updates fires this thousands of times a
 * second, and each one ran a `querySelector`. That is a page-wide tax paid by
 * the host, which is exactly what `host-safety.ts` exists to prevent.
 *
 * The launcher mounts as a direct child of <body>, so a body-level `childList`
 * watch sees it disappear without watching everything beneath it. The check is
 * further coalesced to one per idle frame.
 */
let scheduled = false;
function scheduleCheck(): void {
  if (scheduled) return;
  scheduled = true;
  const run = (): void => {
    scheduled = false;
    void reinstallIfTriggerLost();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1_000 });
  else setTimeout(run, 250);
}

const watchdog = new MutationObserver(scheduleCheck);
watchdog.observe(document.body, { childList: true });
window.addEventListener('popstate', scheduleCheck);
