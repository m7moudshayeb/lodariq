export interface BootstrapOriginClaims {
  origin?: string;
  href?: string;
}

/**
 * Accept only a canonical browser origin. Paths, credentials, query strings,
 * fragments, and non-HTTP schemes are not environment identities.
 */
export function parseExactBrowserOrigin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;

  try {
    const url = new URL(value);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isOriginOnly =
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '';
    return isHttp && isOriginOnly ? url.origin : null;
  } catch {
    return null;
  }
}

/** The request Origin is authoritative; payload fields can only narrow it. */
export function bootstrapClaimsMatchOrigin(
  exactOrigin: string,
  claims: BootstrapOriginClaims,
): boolean {
  if (claims.origin && parseExactBrowserOrigin(claims.origin) !== exactOrigin) return false;
  if (!claims.href) return true;

  try {
    const href = new URL(claims.href);
    return (
      (href.protocol === 'http:' || href.protocol === 'https:') &&
      href.username === '' &&
      href.password === '' &&
      href.origin === exactOrigin
    );
  } catch {
    return false;
  }
}
