import type { Environment } from '@lodariq/schema';

export interface SdkInstallationSnippetInput {
  clientToken: string;
  environment: Environment;
  apiBaseUrl: string;
  loaderSrc?: string;
  creatorLoaderSrc?: string;
  authoringSessionToken?: string;
}

export interface PublicSdkInstallationSnippetInput {
  installationId: string;
  loaderSrc?: string;
  /** Origin the SDK calls for bootstrap and eligibility; preconnected. */
  apiBaseUrl?: string;
  /** `sha384-…` digest of the loader build, when the deployment pins one. */
  loaderIntegrity?: string;
}

const DEFAULT_RUNTIME_LOADER_SRC = 'https://cdn.lodariq.io/sdk/lodariq-loader.js';
const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.lodariq.io';
/** Accepts the three digests browsers implement for subresource integrity. */
const LOADER_INTEGRITY_PATTERN = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/u;
const DEFAULT_PUBLIC_LOADER_SRC = 'https://cdn.lodariq.io/sdk/lodariq-public-bootstrap.js';
const DEFAULT_CREATOR_LOADER_SRC = 'https://cdn.lodariq.io/sdk/lodariq-creator.js';

/**
 * Canonical one-time installation. The public installation identifier is
 * configuration identity, not a bearer credential. Environment selection and
 * authoring policy are resolved from the browser's exact Origin by the API.
 */
export function renderPublicSdkInstallationSnippet(
  input: PublicSdkInstallationSnippetInput,
): string {
  const loaderSrc = input.loaderSrc ?? DEFAULT_PUBLIC_LOADER_SRC;
  const apiBaseUrl = input.apiBaseUrl ?? DEFAULT_PUBLIC_API_BASE_URL;
  // Two preconnects, because the loader immediately talks to two origins it
  // was not itself fetched from. Without them the eligibility check pays a
  // fresh DNS + TLS handshake, which costs a customer's page far more
  // milliseconds than the loader costs it bytes.
  const lines = [
    `<link rel="preconnect" href="${escapeHtmlAttribute(originOf(loaderSrc))}" crossorigin>`,
    `<link rel="preconnect" href="${escapeHtmlAttribute(originOf(apiBaseUrl))}" crossorigin>`,
    `<script type="module" async crossorigin="anonymous" src="${escapeHtmlAttribute(loaderSrc)}"`,
    `  data-lodariq-loader`,
    `  data-installation="${escapeHtmlAttribute(input.installationId)}"`,
  ];
  // Subresource integrity is opt-in per deployment: a pinned digest means a
  // loader rollout requires re-issuing the snippet, which suits customers whose
  // security review demands it and nobody else.
  if (input.loaderIntegrity && LOADER_INTEGRITY_PATTERN.test(input.loaderIntegrity)) {
    lines.push(`  integrity="${escapeHtmlAttribute(input.loaderIntegrity)}"`);
  }
  lines.push(`></script>`);
  return lines.join('\n');
}

/**
 * The Content-Security-Policy directives an installation needs, as a block a
 * customer's platform team can paste into review.
 *
 * Deliberately minimal: no `unsafe-inline` anywhere, no `unsafe-eval`, no
 * frame-src in production. Lodariq's own styles live in a shadow root and honor
 * the page's nonce when one is present, so `style-src` needs nothing added
 * beyond what the customer already allows.
 */
export function renderPublicSdkCspGuidance(
  input: { apiBaseUrl?: string; loaderSrc?: string } = {},
): string {
  const cdnOrigin = originOf(input.loaderSrc ?? DEFAULT_PUBLIC_LOADER_SRC);
  const apiOrigin = originOf(input.apiBaseUrl ?? DEFAULT_PUBLIC_API_BASE_URL);
  return [
    `script-src ${cdnOrigin};`,
    `connect-src ${apiOrigin} ${cdnOrigin};`,
    `img-src ${apiOrigin} data:;`,
  ].join('\n');
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

/** @deprecated Compatibility snippet for environment-token installations. */
export function renderSdkInstallationSnippet(input: SdkInstallationSnippetInput): string {
  const creatorLoaderSrc =
    input.creatorLoaderSrc ?? deriveCreatorLoaderSrc(input.loaderSrc) ?? DEFAULT_CREATOR_LOADER_SRC;
  const loaderSrc = input.authoringSessionToken
    ? creatorLoaderSrc
    : (input.loaderSrc ?? DEFAULT_RUNTIME_LOADER_SRC);
  const lines = [
    `<script type="module" async crossorigin="anonymous" src="${escapeHtmlAttribute(loaderSrc)}"`,
    `  data-lodariq-loader`,
    `  data-lodariq-environment="${escapeHtmlAttribute(input.environment)}"`,
    `  data-lodariq-token="${escapeHtmlAttribute(input.clientToken)}"`,
    `  data-lodariq-api="${escapeHtmlAttribute(input.apiBaseUrl)}"`,
  ];
  if (input.authoringSessionToken) {
    lines.push(
      `  data-lodariq-authoring-session="${escapeHtmlAttribute(input.authoringSessionToken)}"`,
    );
  }
  lines.push(`></script>`);
  return lines.join('\n');
}

function deriveCreatorLoaderSrc(loaderSrc: string | undefined): string | undefined {
  if (!loaderSrc) return undefined;
  if (!/lodariq-loader\.js(?:\?.*)?$/.test(loaderSrc)) return undefined;
  return loaderSrc.replace(/lodariq-loader\.js(\?.*)?$/, 'lodariq-creator.js$1');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
