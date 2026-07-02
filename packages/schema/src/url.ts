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

const DEFAULT_RELATIVE_BASE_URL = 'https://app.lodariq.local/';
const ALWAYS_ALLOWED_SCHEMES = new Set(['https:', 'mailto:']);

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

function parseUrl(rawUrl: string, baseUrl?: URL): URL | null {
  try {
    return baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    return null;
  }
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
