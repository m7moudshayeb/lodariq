import type {
  ActiveManifestPointerV2,
  CompiledDocument,
  CustomerBrandTokenRegistration,
  ManifestPointer,
  SdkInstallContext,
} from '@lodariq/schema';
import type { IdentifyTraits, RuntimeConfig, LodariqRuntime } from '../runtime';
import type {
  AuthoringPreviewPlaybackOptions,
  TourPlayerLike,
  TourPlaybackOptions,
  TourRendererModule,
} from './contracts';

export type {
  AuthoringPreviewPlaybackOptions,
  TourPlaybackOptions,
  TourRendererModule,
} from './contracts';

/**
 * Tiny install-script bootstrap (PRD §6.2, §9.2).
 *
 * Reads workspace/env config from the script tag, fetches the manifest pointer,
 * and lazy-loads only the runtime modules a page actually needs. Target CI
 * budget: under 3 KB gzipped (PRD §9.1) — keep this dependency-free.
 */
export interface LoaderConfig {
  workspaceId?: string;
  environment: 'development' | 'staging' | 'production';
  manifestUrl?: string;
  apiBaseUrl?: string;
  clientToken?: string;
  authoringSessionToken?: string;
}

export interface LodariqBrowserApi {
  manifest: ManifestPointer;
  /** Active pointers exposed by the permanent multi-document public install. */
  readonly manifests?: readonly ManifestPointer[];
  readonly defaultDocumentId?: string;
  authoring: {
    enabled: boolean;
    iframeSrc?: string;
  };
  identify: (traits: IdentifyTraits) => void;
  /** Present on the permanent public installation; values remain in page memory only. */
  registerBrandTokens?: (registration: CustomerBrandTokenRegistration) => void;
  track: (name: string, props?: Record<string, unknown>) => void;
  playTour: (doc?: CompiledDocument, options?: TourPlaybackOptions) => Promise<void>;
  playTourById?: (documentId: string, options?: TourPlaybackOptions) => Promise<void>;
  /** Creator-only, side-effect-free preview playback on verified non-production installs. */
  playAuthoringPreview?: (
    doc: CompiledDocument,
    options: AuthoringPreviewPlaybackOptions,
  ) => Promise<void>;
  /** Stops only the preview owned by this creator session. */
  stopAuthoringPreview?: (ownerId: string) => void;
  openAuthoring: () => Promise<void>;
  stopTour: () => void;
}

interface RuntimeModule {
  LodariqRuntime: new (config: RuntimeConfig) => LodariqRuntime;
}

interface AuthoringPreviewController {
  play: (
    document: CompiledDocument,
    playbackOptions: AuthoringPreviewPlaybackOptions,
  ) => Promise<void>;
  stop: (ownerId: string) => void;
}

export interface InstallOptions {
  fetchInstallContext?: (config: LoaderConfig) => Promise<SdkInstallContext>;
  fetchManifest?: (url: string) => Promise<ManifestPointer>;
  loadRuntime?: () => Promise<RuntimeModule>;
  loadTourRenderer?: () => Promise<TourRendererModule>;
  loadCurrentTour?: (
    manifest: ManifestPointer,
    context: SdkInstallContext,
  ) => Promise<CompiledDocument>;
  /** Resolves document-specific manifests for multi-document public delivery. */
  resolveManifestForDocument?: (documentId: string) => ManifestPointer | undefined;
  /** Exact public artifact pins; required for every permanent-install playback. */
  resolveArtifactManifestForDocument?: (documentId: string) => ActiveManifestPointerV2 | undefined;
  openAuthoring?: (manifest: ManifestPointer, context: SdkInstallContext) => Promise<void>;
  observability?: RuntimeConfig['observability'];
  publicInstallationId?: string;
  /** Server-issued active pointers used as analytics assertions, never identity. */
  analyticsPointers?: RuntimeConfig['analyticsPointers'];
}

declare global {
  interface Window {
    Lodariq?: LodariqBrowserApi;
  }
}

const DEFAULT_CDN_ORIGIN = 'https://cdn.lodariq.io';
const ENVIRONMENTS = new Set<LoaderConfig['environment']>(['development', 'staging', 'production']);
const AUTO_INSTALL_ATTRIBUTE = 'data-lodariq-installed';

function isEnvironment(value: string): value is LoaderConfig['environment'] {
  return ENVIRONMENTS.has(value as LoaderConfig['environment']);
}

export function readConfigFromScript(script: HTMLScriptElement): LoaderConfig | null {
  if (script.hasAttribute('data-installation')) return null;

  const workspaceId =
    script.dataset['workspace']?.trim() || script.dataset['lodariqWorkspace']?.trim();
  const rawEnvironment =
    script.dataset['env']?.trim() ?? script.dataset['lodariqEnvironment']?.trim() ?? 'production';
  if (!isEnvironment(rawEnvironment)) return null;
  const manifestUrl =
    script.dataset['manifest']?.trim() || script.dataset['lodariqManifest']?.trim();
  const apiBaseUrl = script.dataset['lodariqApi']?.trim();
  const clientToken = script.dataset['lodariqToken']?.trim();
  const authoringSessionToken = script.dataset['lodariqAuthoringSession']?.trim();

  if (apiBaseUrl || clientToken) {
    if (!apiBaseUrl || !clientToken) return null;
    return {
      ...(workspaceId ? { workspaceId } : {}),
      environment: rawEnvironment,
      ...(manifestUrl ? { manifestUrl } : {}),
      apiBaseUrl,
      clientToken,
      ...(authoringSessionToken ? { authoringSessionToken } : {}),
    };
  }

  if (!workspaceId) return null;
  return {
    workspaceId,
    environment: rawEnvironment,
    manifestUrl:
      manifestUrl ||
      `${DEFAULT_CDN_ORIGIN}/workspaces/${encodeURIComponent(workspaceId)}/${rawEnvironment}/manifest.json`,
  };
}

export async function fetchManifest(url: string): Promise<ManifestPointer> {
  if (!url.trim()) throw new Error('Lodariq manifest URL is required');
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Lodariq manifest fetch failed: ${res.status}`);
  return (await res.json()) as ManifestPointer;
}

export async function fetchInstallContext(
  config: LoaderConfig,
  fetchManifestFn: (url: string) => Promise<ManifestPointer> = fetchManifest,
): Promise<SdkInstallContext> {
  if (config.clientToken && config.apiBaseUrl) {
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.clientToken}`,
      'content-type': 'application/json',
    };
    if (config.authoringSessionToken) {
      headers['x-lodariq-authoring-session'] = config.authoringSessionToken;
    }
    const response = await fetch(new URL('/v1/sdk/bootstrap', config.apiBaseUrl), {
      method: 'POST',
      credentials: 'omit',
      headers,
      body: JSON.stringify({
        environment: config.environment,
        ...(typeof location !== 'undefined'
          ? { href: location.href, origin: location.origin }
          : {}),
      }),
    });
    if (!response.ok) throw new Error(`Lodariq SDK bootstrap failed: ${response.status}`);
    return (await response.json()) as SdkInstallContext;
  }

  if (!config.workspaceId || !config.manifestUrl) {
    throw new Error(
      'Lodariq loader requires either workspace/manifest config or an API token config',
    );
  }

  const manifest = await fetchManifestFn(config.manifestUrl);
  return {
    workspaceId: config.workspaceId,
    environment: config.environment,
    correlationId: `local_${manifest.currentVersion}`,
    manifest,
    currentDocumentUrl: '',
    ingestUrl: '',
  };
}

export async function fetchCurrentDocument(
  url: string,
  clientToken?: string,
): Promise<CompiledDocument> {
  const { fetchCompiledDocument } = await import('./current-document');
  return fetchCompiledDocument(url, clientToken);
}

function assertCompiledDocument(value: unknown): asserts value is CompiledDocument {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as Partial<CompiledDocument>).documentId !== 'string' ||
    !Array.isArray((value as Partial<CompiledDocument>).steps)
  ) {
    throw new Error('Lodariq.playTour requires compiled delivery JSON with documentId and steps');
  }
}

function isArtifactCompatibilityError(error: unknown): boolean {
  return error instanceof Error && error.name === 'LodariqArtifactCompatibilityError';
}

/**
 * Lazy-load the runtime/player. The authoring bundle is NEVER loaded for
 * ordinary production viewers (PRD §6.2, §20).
 */
export async function loadRuntime(): Promise<RuntimeModule> {
  return import('../runtime');
}

export async function loadTourRenderer(): Promise<TourRendererModule> {
  return import('../renderers/tour');
}

export async function installLodariq(
  config: LoaderConfig,
  options: InstallOptions = {},
): Promise<LodariqBrowserApi> {
  const fetchManifestFn = options.fetchManifest ?? fetchManifest;
  const fetchInstallContextFn =
    options.fetchInstallContext ??
    ((input: LoaderConfig) => fetchInstallContext(input, fetchManifestFn));
  const loadRuntimeFn = options.loadRuntime ?? loadRuntime;
  const loadTourRendererFn = options.loadTourRenderer ?? loadTourRenderer;
  const openAuthoringFn = options.openAuthoring;
  const [context, runtimeModule] = await Promise.all([
    fetchInstallContextFn(config),
    loadRuntimeFn(),
  ]);
  const manifest = context.manifest;
  const loadCurrentTourFn =
    options.loadCurrentTour ??
    (context.currentDocumentUrl
      ? (_manifest: ManifestPointer, installContext: SdkInstallContext) =>
          fetchCurrentDocument(installContext.currentDocumentUrl, config.clientToken)
      : undefined);
  const runtimeConfig: RuntimeConfig = {
    workspaceId: context.workspaceId,
    environment: context.environment,
    ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    ...(options.observability ? { observability: options.observability } : {}),
    ...(context.ingestUrl ? { ingestUrl: context.ingestUrl } : {}),
    ...(config.clientToken ? { authorizationToken: config.clientToken } : {}),
    ...(options.publicInstallationId ? { publicInstallationId: options.publicInstallationId } : {}),
    analyticsPointers: options.analyticsPointers ?? context.analyticsPointers,
  };
  const runtime = new runtimeModule.LodariqRuntime(runtimeConfig);
  const authoring = createAuthoringStatus(config, context, Boolean(openAuthoringFn));
  let activeTour: TourPlayerLike | null = null;
  let authoringPreviewController: Promise<AuthoringPreviewController> | null = null;
  let loadedAuthoringPreviewController: AuthoringPreviewController | null = null;
  let tourRequestId = 0;

  async function playTour(
    doc?: CompiledDocument,
    playbackOptions: TourPlaybackOptions = {},
  ): Promise<void> {
    let playbackManifest = manifest;
    try {
      const requestId = ++tourRequestId;
      const rawEnvironments = (manifest as ManifestPointer & { environments?: unknown })
        .environments;
      if (
        rawEnvironments !== undefined &&
        (!Array.isArray(rawEnvironments) || !rawEnvironments.includes(context.environment))
      ) {
        throw new Error(`Lodariq manifest is not eligible for ${context.environment}`);
      }
      const candidate = doc ?? (await loadCurrentTourFn?.(manifest, context));
      if (requestId !== tourRequestId) return;
      assertCompiledDocument(candidate);
      const tour = candidate;
      const documentId = tour.documentId;
      playbackManifest = options.resolveManifestForDocument?.(documentId) ?? manifest;
      if ('artifactSchemaVersion' in tour || 'rendererContractVersion' in tour || 'theme' in tour) {
        const artifactManifest = options.resolveArtifactManifestForDocument?.(documentId);
        const { assertPlaybackArtifact } = await import('./artifact-validation');
        assertPlaybackArtifact(tour, Boolean(options.publicInstallationId), artifactManifest);
      }
      stopTour();
      const { TourPlayer } = await loadTourRendererFn();
      if (requestId !== tourRequestId) return;
      const player = new TourPlayer(tour, {
        ...playbackOptions,
        onBeforeStepChange: (_index, step) => runtime.writeTourResume(playbackManifest, tour, step),
        onStepChange: (_index, step) => runtime.writeTourResume(playbackManifest, tour, step),
        onTargetResolution: (step, result) => {
          runtime.trackTargetResolution(documentId, step.id, step.targetId, result);
          playbackOptions.onTargetResolution?.(step, result);
        },
        onComplete: () => {
          activeTour = null;
          runtime.endTour('tour_completed', documentId);
        },
        onDismiss: () => {
          activeTour = null;
          runtime.endTour('tour_dismissed', documentId);
        },
        onSkip: () => {
          activeTour = null;
          runtime.endTour('tour_skipped', documentId);
        },
      });
      activeTour = player;
      runtime.track('tour_started', { documentId });
      player.start();
    } catch (error) {
      if (isArtifactCompatibilityError(error)) throw error;
      runtime.reportError(error, {
        phase: 'playback',
        documentId: playbackManifest.documentId,
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      });
      throw error;
    }
  }

  async function openAuthoring(): Promise<void> {
    if (!openAuthoringFn || !authoring.enabled) {
      throw new Error('Lodariq authoring is not enabled for this session');
    }
    await openAuthoringFn(manifest, context);
  }

  async function playAuthoringPreview(
    doc: CompiledDocument,
    playbackOptions: AuthoringPreviewPlaybackOptions,
  ): Promise<void> {
    const controller = await getAuthoringPreviewController();
    await controller.play(doc, playbackOptions);
  }

  function stopAuthoringPreview(ownerIdValue: string): void {
    if (loadedAuthoringPreviewController) {
      loadedAuthoringPreviewController.stop(ownerIdValue);
      return;
    }
    void getAuthoringPreviewController().then((controller) => controller.stop(ownerIdValue));
  }

  function getAuthoringPreviewController() {
    authoringPreviewController ??= import('./authoring-preview')
      .then((module) => module.createAuthoringPreviewController(loadTourRendererFn))
      .then((controller) => {
        loadedAuthoringPreviewController = controller;
        return controller;
      });
    return authoringPreviewController;
  }

  function stopTour(): void {
    activeTour?.stop();
    activeTour = null;
    runtime.clearTourResume();
  }

  const api: LodariqBrowserApi = {
    manifest,
    authoring,
    identify: (traits) => runtime.identify(traits),
    track: (name, props) => runtime.track(name, props),
    playTour,
    ...(context.environment !== 'production' ? { playAuthoringPreview, stopAuthoringPreview } : {}),
    openAuthoring,
    stopTour,
  };

  window.Lodariq = api;
  const resume = runtime.readTourResume(manifest);
  if (resume) {
    const { resumePendingTour } = await import('./resume-tour');
    await resumePendingTour(resume, runtime, manifest, context, loadCurrentTourFn, playTour);
  }
  return api;
}

function createAuthoringStatus(
  config: LoaderConfig,
  context: SdkInstallContext,
  hasOpenAuthoring: boolean,
): LodariqBrowserApi['authoring'] {
  if (!hasOpenAuthoring || context.environment === 'production') return { enabled: false };

  if (config.clientToken && context.authoring?.enabled !== true) {
    return { enabled: false };
  }

  return {
    enabled: true,
    ...(context.authoring?.iframeSrc ? { iframeSrc: context.authoring.iframeSrc } : {}),
  };
}

export async function installLodariqFromScript(
  script: HTMLScriptElement,
  options?: InstallOptions,
): Promise<LodariqBrowserApi | null> {
  const config = readConfigFromScript(script);
  return config ? installLodariq(config, options) : null;
}

function autoInstallFromScript(): void {
  const script = findAutoInstallScript();
  if (!script || script.getAttribute(AUTO_INSTALL_ATTRIBUTE) === 'true') return;
  script.setAttribute(AUTO_INSTALL_ATTRIBUTE, 'true');
  void installLodariqFromScript(script).catch((error: unknown) => {
    window.dispatchEvent(
      new CustomEvent('lodariq:error', {
        detail: {
          error,
          phase: 'install',
        },
      }),
    );
  });
}

function findAutoInstallScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') return null;
  const moduleUrl = normalizedUrl(import.meta.url);
  const scripts = [...document.scripts].reverse();
  return (
    scripts.find(
      (script): script is HTMLScriptElement =>
        script instanceof HTMLScriptElement &&
        script.hasAttribute('data-lodariq-loader') &&
        Boolean(readConfigFromScript(script)) &&
        scriptMatchesModule(script, moduleUrl),
    ) ?? null
  );
}

function scriptMatchesModule(script: HTMLScriptElement, moduleUrl: string): boolean {
  const scriptUrl = normalizedUrl(script.src);
  if (!scriptUrl || !moduleUrl) return false;
  if (scriptUrl === moduleUrl) return true;
  const scriptLocation = new URL(scriptUrl);
  const moduleLocation = new URL(moduleUrl);
  return (
    scriptLocation.origin === moduleLocation.origin &&
    scriptLocation.pathname.endsWith('/lodariq-loader.js') &&
    moduleLocation.pathname.startsWith(scriptLocation.pathname.slice(0, -17))
  );
}

function normalizedUrl(value: string): string {
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return '';
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  queueMicrotask(autoInstallFromScript);
}
