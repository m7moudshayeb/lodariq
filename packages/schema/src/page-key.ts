/**
 * Which page a step's target was authored on.
 *
 * ADR-0027 page eligibility answers a different question — may this document
 * load here at all — and drops the hash to answer it. A hash-routed app has one
 * pathname for every screen, so a step-level key that dropped the hash could not
 * tell Projects from Billing. Query strings stay out of both: they carry search
 * terms, sort order, open dialogs and session identifiers, and reading them
 * would break a step every time someone sorted a column.
 */

export const PAGE_KEY_MAX_LENGTH = 512;
/** A path, optionally followed by a hash route. No query, no whitespace. */
export const PAGE_KEY_PATTERN = '^/[^?#\\s]*(?:#/[^?\\s]*)?$';

export const TARGET_PAGE_MATCHES = ['exact', 'prefix'] as const;
export type TargetPageMatch = (typeof TARGET_PAGE_MATCHES)[number];

const PAGE_KEY_REGEX = new RegExp(PAGE_KEY_PATTERN);

/** Pathname, plus the hash route when the application routes through the hash. */
export function pageKeyFrom(pathname: string, hash: string): string {
  const path = withoutTrailingSlash(pathname.startsWith('/') ? pathname : `/${pathname}`);
  // `#/projects/all?sort=name` is a route; `#pricing` is an in-page anchor.
  if (!hash.startsWith('#/')) return path;
  const route = hash.slice(1).split('?')[0] ?? '/';
  return `${path}#${withoutTrailingSlash(route)}`;
}

/** Null outside a browser, and for a location this key cannot describe. */
export function currentPageKey(): string | null {
  if (typeof location === 'undefined') return null;
  const key = pageKeyFrom(location.pathname || '/', location.hash);
  return isPageKey(key) ? key : null;
}

export function isPageKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PAGE_KEY_MAX_LENGTH &&
    PAGE_KEY_REGEX.test(value)
  );
}

/**
 * `prefix` stops at a segment boundary, so `/projects` covers `/projects/123`
 * but never `/projects-archive`. ADR-0027 patterns are bare `startsWith` because
 * an author types them; this key is captured from a live page, so the boundary
 * has to be inferred rather than trusted.
 */
export function pageKeyMatches(
  expected: string,
  match: TargetPageMatch | undefined,
  current: string,
): boolean {
  if (current === expected) return true;
  if (match !== 'prefix' || !current.startsWith(expected)) return false;
  if (expected.endsWith('/') || expected.endsWith('#')) return true;
  const next = current[expected.length];
  return next === '/' || next === '#';
}

function withoutTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}
