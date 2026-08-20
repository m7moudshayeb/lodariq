import type { TriggerDefinition } from './document';

/**
 * Where a visitor currently is, reduced to the only two facts that may decide
 * whether an experience belongs on the page (ADR-0027).
 *
 * Query strings and fragments are deliberately excluded: they routinely carry
 * session identifiers, search terms, and other visitor data, and admitting them
 * to the matcher would let an authored pattern read them back out.
 */
export interface PageEligibilityContext {
  /** Exact browser origin, scheme and host only, e.g. `https://app.example.com`. */
  exactOrigin: string;
  /** Location pathname, always leading-slash, e.g. `/settings/billing`. */
  pathname: string;
}

/**
 * Parse the untrusted `href` page intent into a matcher context.
 *
 * Returns null when the href is unparseable or claims a different origin than
 * the one the browser proved; callers must then treat the page as eligible
 * rather than silently hiding experiences.
 */
export function readPageEligibilityContext(
  href: string | undefined,
  exactOrigin: string,
): PageEligibilityContext | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== exactOrigin) return null;
  return { exactOrigin, pathname: url.pathname || '/' };
}

/**
 * Decide whether a compiled document's trigger can fire on this page.
 *
 * Only `urlMatch` narrows a page. `manual`, `pageLoad`, and `event` documents
 * stay eligible everywhere: a manual document is played by host code through
 * `playTourById`, and an event document by an arbitrary later `track` call, so
 * neither can be ruled out from the URL alone. This fails OPEN by design — a
 * trigger shape this function does not recognise keeps the page eligible, so a
 * newer authored trigger can never make a live experience silently vanish.
 */
export function triggerMatchesPage(
  trigger: TriggerDefinition,
  page: PageEligibilityContext,
): boolean {
  if (trigger.type !== 'urlMatch') return true;
  return patternMatchesPage(trigger.config.pattern, trigger.config.mode ?? 'exact', page);
}

/**
 * The one implementation of what an authored URL pattern means.
 *
 * The API uses it to scope a bootstrap response; the browser uses it to rule a
 * page out before calling the API at all. Both must agree exactly — a browser
 * that is stricter than the server hides live experiences, and one that is
 * looser makes the whole pre-flight pointless — so neither gets its own copy.
 *
 * A pattern is matched against both the bare pathname and the origin-qualified
 * path, so an author may write either `/settings` or
 * `https://app.example.com/settings` and get what they meant.
 */
export function patternMatchesPage(
  pattern: string,
  mode: 'exact' | 'prefix' | 'contains',
  page: PageEligibilityContext,
): boolean {
  const candidates = [page.pathname, `${page.exactOrigin}${page.pathname}`];
  if (mode === 'prefix') return candidates.some((candidate) => candidate.startsWith(pattern));
  if (mode === 'contains') return candidates.some((candidate) => candidate.includes(pattern));
  return candidates.includes(pattern);
}
