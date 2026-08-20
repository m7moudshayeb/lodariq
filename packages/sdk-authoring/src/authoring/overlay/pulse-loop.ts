/** How often geometry is re-solved when nothing has fired an event. */
export const PULSE_INTERVAL_MS = 400;

/**
 * Geometry is re-solved on a timer because a target moves for reasons no event
 * reports — a sibling collapsing, a font arriving, an animation settling.
 *
 * The loop stops while the page is away: a bfcached page keeps its timers, and
 * re-measuring a page nobody is looking at costs a creator battery for nothing.
 */
export function startPulseLoop(tick: () => void, ownerWindow: Window = window): () => void {
  tick();
  const onScroll = (): void => tick();
  let timer: number | null = null;
  const start = (): void => {
    if (timer === null) timer = ownerWindow.setInterval(tick, PULSE_INTERVAL_MS);
  };
  const stop = (): void => {
    if (timer !== null) ownerWindow.clearInterval(timer);
    timer = null;
  };
  ownerWindow.addEventListener('scroll', onScroll, true);
  ownerWindow.addEventListener('resize', onScroll);
  ownerWindow.addEventListener('pagehide', stop);
  ownerWindow.addEventListener('pageshow', start);
  start();
  return () => {
    ownerWindow.removeEventListener('scroll', onScroll, true);
    ownerWindow.removeEventListener('resize', onScroll);
    ownerWindow.removeEventListener('pagehide', stop);
    ownerWindow.removeEventListener('pageshow', start);
    stop();
  };
}
