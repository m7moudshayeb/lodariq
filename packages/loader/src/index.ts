/**
 * The npm escape hatch (ADR-0027).
 *
 * The canonical Lodariq install is a `<script>` tag, and it stays that way:
 * nothing of ours belongs in a customer's bundle graph, and a CDN tag is the
 * only shape that keeps it out. But some teams cannot put a third-party tag in
 * their markup — a strict CSP pipeline that generates script tags itself, a
 * platform that owns the document head, a security policy that requires every
 * external origin to be declared in code and reviewed in a pull request.
 *
 * This package is for them. It adds roughly a kilobyte to their bundle and then
 * does exactly what the tag would have done. The loader, the runtime, and every
 * renderer still come from the CDN and are still absent from their build.
 *
 * It has no dependencies, touches no globals of its own, and is safe to call
 * during render, in an effect, or from a server-rendered page's hydration —
 * repeated calls for the same installation are a no-op.
 */

const DEFAULT_LOADER_SRC = 'https://cdn.lodariq.io/sdk/lodariq-public-bootstrap.js';
const DEFAULT_API_BASE_URL = 'https://api.lodariq.io';
const INSTALLATION_ID_PATTERN = /^ins_pub_[A-Za-z0-9_-]{16,128}$/u;
const MARKER_ATTRIBUTE = 'data-lodariq-loader';

export interface InstallLodariqLoaderOptions {
  /** The public installation identifier from the Lodariq dashboard. */
  installationId: string;
  /** Override the loader URL. Only useful for self-hosted CDN deployments. */
  src?: string;
  /** Override the control-plane origin. Only useful for self-hosted deployments. */
  apiBaseUrl?: string;
  /** `sha256-…`/`sha384-…`/`sha512-…` digest, when the deployment pins one. */
  integrity?: string;
  /**
   * Emit `<link rel="preconnect">` for the loader and API origins. On by
   * default: the handshake it saves is worth more than the two tags cost.
   */
  preconnect?: boolean;
  /** Document to install into. Defaults to the ambient one. */
  document?: Document;
}

export interface LodariqLoaderInstallation {
  /** The injected script element, or the existing one if already installed. */
  readonly script: HTMLScriptElement;
  /** Remove the tags this call added. Does not unload an already-running SDK. */
  remove(): void;
}

/**
 * Install the Lodariq loader by injecting the same tag the dashboard snippet
 * would have produced.
 *
 * Returns null when there is no document to install into — a server render, a
 * worker — so callers can invoke it unconditionally without branching on
 * environment. Returns the existing installation, without adding a second tag,
 * when this installation is already present.
 */
export function installLodariqLoader(
  options: InstallLodariqLoaderOptions,
): LodariqLoaderInstallation | null {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document);
  if (!doc) return null;
  if (!INSTALLATION_ID_PATTERN.test(options.installationId)) {
    throw new Error('Lodariq installation id must use the ins_pub_ format');
  }

  const existing = doc.querySelector<HTMLScriptElement>(
    `script[${MARKER_ATTRIBUTE}][data-installation="${cssEscape(options.installationId)}"]`,
  );
  if (existing) return { script: existing, remove: () => undefined };

  const src = options.src ?? DEFAULT_LOADER_SRC;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const added: Element[] = [];

  if (options.preconnect !== false) {
    for (const origin of uniqueOrigins([src, apiBaseUrl])) {
      const link = doc.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      doc.head.append(link);
      added.push(link);
    }
  }

  const script = doc.createElement('script');
  script.type = 'module';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = src;
  script.setAttribute(MARKER_ATTRIBUTE, '');
  script.setAttribute('data-installation', options.installationId);
  if (apiBaseUrl !== DEFAULT_API_BASE_URL) script.setAttribute('data-lodariq-api', apiBaseUrl);
  if (options.integrity) script.integrity = options.integrity;
  doc.head.append(script);
  added.push(script);

  return {
    script,
    remove: () => {
      for (const element of added) element.remove();
    },
  };
}

function uniqueOrigins(values: readonly string[]): string[] {
  const origins: string[] = [];
  for (const value of values) {
    try {
      const { origin } = new URL(value);
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      /* A malformed override simply gets no preconnect. */
    }
  }
  return origins;
}

/**
 * Escape for use inside an attribute-value selector.
 *
 * The installation id is already validated against a conservative pattern
 * above, so this is belt and braces rather than the only line of defence.
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/gu, '\\$&');
}
