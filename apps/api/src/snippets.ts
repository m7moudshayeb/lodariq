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
}

const DEFAULT_RUNTIME_LOADER_SRC = 'https://cdn.lodariq.io/sdk/lodariq-loader.js';
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
  return [
    `<script type="module" async crossorigin="anonymous" src="${escapeHtmlAttribute(loaderSrc)}"`,
    `  data-lodariq-loader`,
    `  data-installation="${escapeHtmlAttribute(input.installationId)}"`,
    `></script>`,
  ].join('\n');
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
