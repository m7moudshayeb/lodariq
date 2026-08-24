/**
 * Single place for every external destination the page links to.
 * The dashboard is the control plane (PRD): sign-in/up live on app.lodariq.io,
 * never on the marketing origin.
 */
export const DASHBOARD_ORIGIN = 'https://app.lodariq.io';
export const SIGN_IN_URL = `${DASHBOARD_ORIGIN}/sign-in`;
export const SIGN_UP_URL = `${DASHBOARD_ORIGIN}/sign-up`;

/**
 * Waitlist submissions POST here as `{ email, source }` when configured
 * (`VITE_WAITLIST_ENDPOINT`). Until the endpoint exists, the form falls back
 * to a prefilled email draft so no address is silently dropped pre-launch.
 */
export const WAITLIST_ENDPOINT: string | null =
  (import.meta.env['VITE_WAITLIST_ENDPOINT'] as string | undefined) ?? null;
export const WAITLIST_CONTACT_EMAIL = 'hello@lodariq.io';

/** The embedded fixture host (built by scripts/prepare-demo.mjs). */
export const DEMO_URL = '/demo/index.html#/projects/all';
/** Design size of the demo product; the hero scales it down from here. */
export const DEMO_VIEWPORT = { width: 1280, height: 832 } as const;
