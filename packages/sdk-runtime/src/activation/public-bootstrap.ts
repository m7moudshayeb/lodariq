import type {
  CustomerBrandTokenRegistration,
  NonProductionPublicSdkBootstrapContext,
  PublicSdkBootstrapContext,
} from '@lodariq/schema';
import { registerBrandTokens } from '../brand-token-registry';
import type {
  PublicAuthoringActivationOptions,
  PublicAuthoringLauncher,
} from './authoring-activation';
import type { PublicDeliveryBrowserApi } from './public-delivery';

export type {
  HostedCreatorActivation,
  HostedCreatorModule,
  PublicAuthoringActivationOptions,
  PublicAuthoringLauncher,
  PublicAuthoringLauncherState,
} from './authoring-activation';

/** Framework-free pre-authoring boundary, kept outside the sub-3 KB runtime loader. */
export interface PublicLoaderConfig {
  installationId: string;
  apiBaseUrl: string;
}

export interface PublicBootstrapPageIntent {
  href?: string;
  origin?: string;
}

export interface InstallPublicSdkOptions extends Omit<
  PublicAuthoringActivationOptions,
  'refreshContext'
> {
  script?: HTMLScriptElement;
  pageIntent?: PublicBootstrapPageIntent;
}

export interface PublicSdkInstallation {
  readonly environment: PublicSdkBootstrapContext['environment'];
  readonly deliveryState: PublicSdkBootstrapContext['delivery']['state'];
  readonly authoringState: PublicSdkBootstrapContext['authoring']['state'];
  readonly runtime: PublicDeliveryBrowserApi | null;
  readonly launcher: PublicAuthoringLauncher | null;
  registerBrandTokens(registration: CustomerBrandTokenRegistration): void;
  destroy(): void;
}

export const DEFAULT_PUBLIC_API_BASE_URL = 'https://api.lodariq.io';
export const PUBLIC_SDK_INSTALLATION_HEADER = 'x-lodariq-installation-id';
const TRUSTED_PUBLIC_API_ORIGINS = new Set([
  DEFAULT_PUBLIC_API_BASE_URL,
  'https://staging-api.lodariq.io',
]);

const PUBLIC_BOOTSTRAP_PATH = '/v1/sdk/bootstrap';
const AUTO_INSTALL_ATTRIBUTE = 'data-lodariq-public-installed';
const PUBLIC_INSTALLATION_ID_PATTERN = /^ins_pub_[A-Za-z0-9_-]{16,128}$/u;
const LEGACY_SCRIPT_CONFIG_ATTRIBUTES = [
  'data-workspace',
  'data-lodariq-workspace',
  'data-env',
  'data-lodariq-environment',
  'data-manifest',
  'data-lodariq-manifest',
  'data-lodariq-token',
  'data-lodariq-authoring-session',
] as const;

/** Reads only the canonical public identity; mixed legacy configuration fails closed. */
export function readPublicConfigFromScript(script: HTMLScriptElement): PublicLoaderConfig | null {
  if (LEGACY_SCRIPT_CONFIG_ATTRIBUTES.some((attribute) => script.hasAttribute(attribute))) {
    return null;
  }

  const installationId = script.dataset['installation']?.trim();
  if (!installationId || !PUBLIC_INSTALLATION_ID_PATTERN.test(installationId)) return null;
  const apiBaseUrl = normalizeApiOrigin(
    script.dataset['lodariqApi']?.trim() || DEFAULT_PUBLIC_API_BASE_URL,
  );
  return apiBaseUrl ? { installationId, apiBaseUrl } : null;
}

/**
 * Fetches exact-origin bootstrap state. Returned grants stay only in the
 * caller's in-memory value and are never placed in URLs, storage, events, or errors.
 */
export async function fetchPublicSdkBootstrapContext(
  config: PublicLoaderConfig,
  pageIntent: PublicBootstrapPageIntent = readCurrentPageIntent(),
): Promise<PublicSdkBootstrapContext> {
  if (
    !PUBLIC_INSTALLATION_ID_PATTERN.test(config.installationId) ||
    !normalizeApiOrigin(config.apiBaseUrl)
  ) {
    throw new Error('Lodariq public SDK bootstrap configuration is invalid');
  }

  const body = createRequest(config.installationId, pageIntent);
  let response: Response;
  try {
    response = await fetch(new URL(PUBLIC_BOOTSTRAP_PATH, config.apiBaseUrl), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Lodariq public SDK bootstrap request failed');
  }
  if (!response.ok) throw new Error('Lodariq public SDK bootstrap request failed');

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('Lodariq public SDK bootstrap response is invalid');
  }
  if (
    !isPublicContext(value, config.apiBaseUrl) ||
    value.installationId !== config.installationId ||
    (body.origin && value.customerOrigin !== body.origin)
  ) {
    throw new Error('Lodariq public SDK bootstrap response is invalid');
  }
  return value;
}

/**
 * Installs the permanent public SDK boundary. Production and policy-disabled
 * origins never receive a launcher; authoring code remains lazy after exchange.
 */
export async function installPublicSdkFromScript(
  options: InstallPublicSdkOptions = {},
): Promise<PublicSdkInstallation | null> {
  const script = options.script ?? findPublicInstallScript();
  if (!script) return null;
  const config = readPublicConfigFromScript(script);
  if (!config) return null;

  const currentPageIntent = readCurrentPageIntent();
  if (options.pageIntent?.origin && options.pageIntent.origin !== currentPageIntent.origin) {
    throw new Error('Lodariq public SDK page origin does not match the browser');
  }
  const pageIntent: PublicBootstrapPageIntent = {};
  const href = options.pageIntent?.href ?? currentPageIntent.href;
  if (href) pageIntent.href = href;
  if (currentPageIntent.origin) pageIntent.origin = currentPageIntent.origin;
  const context = await fetchPublicSdkBootstrapContext(config, pageIntent);
  const [runtime, authoringModule] = await Promise.all([
    context.delivery.state === 'available'
      ? import('./public-delivery').then(({ installPublicSdkDelivery }) =>
          installPublicSdkDelivery(context),
        )
      : Promise.resolve(null),
    context.environment !== 'production' && context.authoring.state === 'available'
      ? import('./authoring-activation')
      : Promise.resolve(null),
  ]);
  const launcher = authoringModule
    ? authoringModule.createPublicAuthoringLauncher(
        context as NonProductionPublicSdkBootstrapContext,
        {
          ...options,
          onPreview: options.onPreview ?? (runtime ? () => runtime.playTour() : undefined),
          refreshContext: async () => {
            const refreshed = await fetchPublicSdkBootstrapContext(config, pageIntent);
            if (refreshed.environment === 'production') {
              throw new Error('Lodariq authoring is unavailable');
            }
            return refreshed;
          },
        },
      )
    : null;

  return {
    environment: context.environment,
    deliveryState: context.delivery.state,
    authoringState: context.authoring.state,
    runtime,
    launcher,
    registerBrandTokens,
    destroy: () => launcher?.destroy(),
  };
}

function createRequest(
  installationId: string,
  intent: PublicBootstrapPageIntent,
): { installationId: string; href?: string; origin?: string } {
  const href = nonEmpty(intent.href);
  const origin = nonEmpty(intent.origin);
  if (origin && !isExactOrigin(origin)) {
    throw new Error('Lodariq public SDK bootstrap page intent is invalid');
  }
  return { installationId, ...(href ? { href } : {}), ...(origin ? { origin } : {}) };
}

function readCurrentPageIntent(): PublicBootstrapPageIntent {
  return typeof location === 'undefined' ? {} : { href: location.href, origin: location.origin };
}

function normalizeApiOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '' || url.pathname === '/') &&
      TRUSTED_PUBLIC_API_ORIGINS.has(url.origin)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function isPublicContext(value: unknown, apiBaseUrl: string): value is PublicSdkBootstrapContext {
  const keys = [
    'installationId',
    'environmentId',
    'environment',
    'customerOrigin',
    'correlationId',
    'delivery',
    'authoring',
  ];
  if (!exactRecord(value, keys)) return false;
  if (
    !isInstallationId(value['installationId']) ||
    !nonEmpty(value['environmentId']) ||
    !nonEmpty(value['correlationId']) ||
    !isExactOrigin(value['customerOrigin']) ||
    !isDelivery(value['delivery'], apiBaseUrl) ||
    !deliveryMatchesEnvironment(value['delivery'], value['environmentId'])
  )
    return false;

  if (value['environment'] === 'production') {
    return value['customerOrigin'].startsWith('https://') && isDisabled(value['authoring']);
  }
  return Boolean(
    (value['environment'] === 'development' || value['environment'] === 'staging') &&
    (isDisabled(value['authoring']) || isAvailable(value['authoring'], apiBaseUrl)),
  );
}

function isDelivery(value: unknown, apiBaseUrl: string): boolean {
  if (!record(value)) return false;
  if (value['state'] === 'unavailable') return exactRecord(value, ['state']);
  if (value['mode'] === 'document-scoped-v2') {
    return isDocumentScopedDelivery(value, apiBaseUrl);
  }
  if (!exactRecord(value, ['state', 'manifest', 'currentDocumentUrl', 'ingestUrl'])) return false;
  return (
    value['state'] === 'available' &&
    isAvailableManifest(value['manifest']) &&
    isApiUrl(value['currentDocumentUrl'], apiBaseUrl) &&
    isApiUrl(value['ingestUrl'], apiBaseUrl)
  );
}

function isDocumentScopedDelivery(value: Record<string, unknown>, apiBaseUrl: string): boolean {
  if (
    !exactRecord(value, ['state', 'mode', 'manifests', 'defaultDocumentId', 'ingestUrl']) ||
    value['state'] !== 'available' ||
    value['mode'] !== 'document-scoped-v2' ||
    !Array.isArray(value['manifests']) ||
    value['manifests'].length === 0 ||
    value['manifests'].length > 100 ||
    !nonEmpty(value['defaultDocumentId']) ||
    !isApiUrl(value['ingestUrl'], apiBaseUrl)
  ) {
    return false;
  }

  const documentIds = new Set<string>();
  const workspaceIds = new Set<string>();
  for (const manifest of value['manifests']) {
    if (
      !isAvailableManifest(manifest) ||
      !record(manifest) ||
      !Object.prototype.hasOwnProperty.call(manifest, 'schemaVersion')
    ) {
      return false;
    }
    const documentId = nonEmpty(manifest['documentId']);
    const workspaceId = nonEmpty(manifest['workspaceId']);
    if (!documentId || !workspaceId || documentIds.has(documentId)) return false;
    documentIds.add(documentId);
    workspaceIds.add(workspaceId);
  }
  const defaultDocumentId = nonEmpty(value['defaultDocumentId']);
  return Boolean(
    defaultDocumentId && workspaceIds.size === 1 && documentIds.has(defaultDocumentId),
  );
}

function isAvailableManifest(value: unknown): boolean {
  if (!record(value) || !nonEmpty(value['documentId'])) return false;
  const versioned = Object.prototype.hasOwnProperty.call(value, 'schemaVersion');
  if (!versioned) {
    return Boolean(nonEmpty(value['currentVersion']));
  }
  if (!nonEmpty(value['schemaVersion'])) return false;
  if (
    !exactRecord(value, [
      'schemaVersion',
      'workspaceId',
      'environmentId',
      'documentId',
      'state',
      'generation',
      'publicationId',
      'activatedAt',
      'artifact',
    ])
  ) {
    return false;
  }
  const artifact = value['artifact'];
  return Boolean(
    value['state'] === 'active' &&
    Number.isInteger(value['generation']) &&
    Number(value['generation']) >= 1 &&
    nonEmpty(value['workspaceId']) &&
    nonEmpty(value['environmentId']) &&
    nonEmpty(value['publicationId']) &&
    nonEmpty(value['activatedAt']) &&
    exactRecord(artifact, [
      'artifactSchemaVersion',
      'contentHash',
      'compilerVersion',
      'rendererContractVersion',
      'themeContractVersion',
      'themeVersionId',
      'themeContentHash',
      'url',
      'integrity',
    ]) &&
    nonEmpty(artifact['artifactSchemaVersion']) &&
    /^sha256-[0-9a-f]{64}$/u.test(String(artifact['contentHash'])) &&
    nonEmpty(artifact['compilerVersion']) &&
    nonEmpty(artifact['rendererContractVersion']) &&
    nonEmpty(artifact['themeContractVersion']) &&
    nonEmpty(artifact['themeVersionId']) &&
    /^sha256-[0-9a-f]{64}$/u.test(String(artifact['themeContentHash'])) &&
    isHttpUrl(artifact['url']) &&
    /^sha256-[A-Za-z0-9+/]+={0,2}$/u.test(String(artifact['integrity'])),
  );
}

function deliveryMatchesEnvironment(value: unknown, environmentId: unknown): boolean {
  if (!record(value) || value['state'] !== 'available') return true;
  if (value['mode'] === 'document-scoped-v2') {
    return (
      Array.isArray(value['manifests']) &&
      value['manifests'].every(
        (manifest) => record(manifest) && manifest['environmentId'] === environmentId,
      )
    );
  }
  const manifest = value['manifest'];
  return (
    !record(manifest) ||
    !Object.prototype.hasOwnProperty.call(manifest, 'schemaVersion') ||
    manifest['environmentId'] === environmentId
  );
}

function isDisabled(value: unknown): boolean {
  return exactRecord(value, ['state']) && value['state'] === 'disabled';
}

function isAvailable(value: unknown, apiBaseUrl: string): boolean {
  const keys = [
    'state',
    'appOrigin',
    'activationUrl',
    'authorizationRequestUrl',
    'exchangeUrl',
    'bootstrapGrant',
    'bootstrapGrantExpiresAt',
  ];
  return (
    exactRecord(value, keys) &&
    value['state'] === 'available' &&
    value['appOrigin'] === 'https://app.lodariq.io' &&
    value['activationUrl'] === 'https://app.lodariq.io/authoring/activate' &&
    isApiUrl(
      value['authorizationRequestUrl'],
      apiBaseUrl,
      '/v1/sdk/authoring/authorization-requests',
    ) &&
    isApiUrl(value['exchangeUrl'], apiBaseUrl, '/v1/sdk/authoring/exchange') &&
    typeof value['bootstrapGrant'] === 'string' &&
    value['bootstrapGrant'].length >= 32 &&
    value['bootstrapGrant'].length <= 2_048 &&
    isUnexpiredTimestamp(value['bootstrapGrantExpiresAt'])
  );
}

function isApiUrl(value: unknown, apiBaseUrl: string, pathname?: string): boolean {
  if (!isHttpUrl(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.origin === new URL(apiBaseUrl).origin &&
      (!pathname || (url.pathname === pathname && !url.search && !url.hash))
    );
  } catch {
    return false;
  }
}

function isInstallationId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_INSTALLATION_ID_PATTERN.test(value);
}

function isHttpUrl(value: unknown): value is string {
  const text = nonEmpty(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

function isExactOrigin(value: unknown): value is string {
  const text = nonEmpty(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.origin === text
    );
  } catch {
    return false;
  }
}

function isUnexpiredTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => key in value)
  );
}

function findPublicInstallScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;
  return (
    [...document.scripts]
      .reverse()
      .find(
        (script): script is HTMLScriptElement =>
          script instanceof HTMLScriptElement && Boolean(readPublicConfigFromScript(script)),
      ) ?? null
  );
}

function autoInstallPublicSdk(): void {
  const script = findPublicInstallScript();
  if (!script || script.getAttribute(AUTO_INSTALL_ATTRIBUTE) === 'true') return;
  script.setAttribute(AUTO_INSTALL_ATTRIBUTE, 'true');
  void installPublicSdkFromScript({ script }).catch(() => {
    script.setAttribute('data-lodariq-state', 'unavailable');
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  queueMicrotask(autoInstallPublicSdk);
}
