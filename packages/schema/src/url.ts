export interface SafeNavigationUrlOptions {
  /**
   * Schemes, with or without a trailing colon, that an installation has
   * explicitly approved for app handoff links. Examples: `slack`, `zoommtg`.
   */
  approvedAppSchemes?: readonly string[];
  /**
   * Base URL used to prove relative paths stay on the same application origin.
   * Runtime code should pass `window.location.href`; schema/publish checks use
   * a stable dummy app origin because canonical documents store relative paths.
   */
  baseUrl?: string;
}

export type SafeNavigationDestinationKind = 'internal' | 'external' | 'handoff';

export interface SafeNavigationDestination {
  href: string;
  kind: SafeNavigationDestinationKind;
}

const DEFAULT_RELATIVE_BASE_URL = 'https://app.lodariq.local/';
const ALWAYS_ALLOWED_SCHEMES = new Set(['https:', 'mailto:']);
const BARE_HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#]|$)/iu;

/**
 * Phase 1 navigation policy for author-controlled action URLs.
 *
 * Allowed by default:
 * - HTTPS absolute URLs
 * - mailto links
 * - relative same-app paths, including query and hash links
 *
 * Everything else, including `http:`, protocol-relative URLs, JavaScript URLs,
 * data URLs, and unapproved app schemes, is blocked.
 */
export function isSafeNavigationUrl(
  rawUrl: string | undefined,
  options: SafeNavigationUrlOptions = {},
): boolean {
  return resolveSafeNavigationUrl(rawUrl, options) !== null;
}

export function resolveSafeNavigationUrl(
  rawUrl: string | undefined,
  options: SafeNavigationUrlOptions = {},
): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;

  const baseUrl = options.baseUrl ?? DEFAULT_RELATIVE_BASE_URL;
  const base = parseUrl(baseUrl);
  if (!base) return null;

  const inferredHttpsUrl = inferHttpsUrl(trimmed);
  if (inferredHttpsUrl) return inferredHttpsUrl.href;

  const explicitUrl = parseUrl(trimmed);
  if (!explicitUrl) {
    if (trimmed.startsWith('//')) return null;

    const relativeUrl = parseUrl(trimmed, base);
    if (!relativeUrl || relativeUrl.origin !== base.origin) return null;
    return trimmed;
  }

  if (ALWAYS_ALLOWED_SCHEMES.has(explicitUrl.protocol)) {
    return explicitUrl.href;
  }

  if (isApprovedAppScheme(explicitUrl.protocol, options.approvedAppSchemes)) {
    return explicitUrl.href;
  }

  return null;
}

/**
 * Classifies a safe action URL relative to the customer page that will open it.
 * Internal web navigation stays in the current tab, external HTTPS navigation
 * opens separately, and non-web protocols keep their native handoff behavior.
 */
export function resolveSafeNavigationDestination(
  rawUrl: string | undefined,
  options: SafeNavigationUrlOptions = {},
): SafeNavigationDestination | null {
  const href = resolveSafeNavigationUrl(rawUrl, options);
  if (!href) return null;

  const base = parseUrl(options.baseUrl ?? DEFAULT_RELATIVE_BASE_URL);
  const destination = base ? parseUrl(href, base) : null;
  if (!base || !destination) return null;
  if (destination.origin === base.origin) return { href, kind: 'internal' };
  if (destination.protocol === 'https:') return { href, kind: 'external' };
  return { href, kind: 'handoff' };
}

function parseUrl(rawUrl: string, baseUrl?: URL): URL | null {
  try {
    return baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return null;
  }
}

function inferHttpsUrl(rawUrl: string): URL | null {
  if (!BARE_HOSTNAME_PATTERN.test(rawUrl)) return null;
  const inferredUrl = parseUrl(`https://${rawUrl}`);
  if (!inferredUrl || inferredUrl.username || inferredUrl.password) return null;
  return inferredUrl;
}

function isApprovedAppScheme(
  protocol: string,
  approvedAppSchemes: readonly string[] | undefined,
): boolean {
  if (!approvedAppSchemes?.length) return false;
  const normalized = protocol.toLowerCase();
  return approvedAppSchemes.some((scheme) => normalizeScheme(scheme) === normalized);
}

function normalizeScheme(scheme: string): string {
  const normalized = scheme.trim().toLowerCase();
  return normalized.endsWith(':') ? normalized : `${normalized}:`;
}
