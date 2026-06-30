import type { CompiledDocument, ManifestPointer, SdkInstallContext } from '@lodariq/schema';
import type { IdentifyTraits, RuntimeConfig, LodariqRuntime } from '../runtime';

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
  authoring: {
    enabled: boolean;
    iframeSrc?: string;
  };
  identify: (traits: IdentifyTraits) => void;
  track: (name: string, props?: Record<string, unknown>) => void;
  playTour: (doc?: CompiledDocument, options?: TourPlaybackOptions) => Promise<void>;
  openAuthoring: () => Promise<void>;
  stopTour: () => void;
}

export interface TourPlaybackOptions {
  initialStepId?: string;
  initialStepIndex?: number;
}

interface TourPlayerLike {
  start: () => void;
  stop: () => void;
}

interface TourRendererModule {
  TourPlayer: new (
    doc: CompiledDocument,
    options?: TourPlaybackOptions & {
      onBeforeStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
      onComplete?: () => void;
      onDismiss?: () => void;
      onStepChange?: (index: number, step: CompiledDocument['steps'][number]) => void;
    },
  ) => TourPlayerLike;
}

interface RuntimeModule {
  LodariqRuntime: new (config: RuntimeConfig) => LodariqRuntime;
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
  openAuthoring?: (manifest: ManifestPointer, context: SdkInstallContext) => Promise<void>;
}

declare global {
  interface Window {
    Lodariq?: LodariqBrowserApi;
  }
}

const DEFAULT_CDN_ORIGIN = 'https://cdn.lodariq.com';
const ENVIRONMENTS = new Set<LoaderConfig['environment']>(['development', 'staging', 'production']);
const TOUR_RESUME_PREFIX = 'lodariq:tour-resume:';
const TOUR_RESUME_MAX_AGE_MS = 30 * 60 * 1000;
const AUTO_INSTALL_ATTRIBUTE = 'data-lodariq-installed';

interface TourResumeState {
  documentId: string;
  manifestVersion: string;
  contentHash: string;
  stepId: string;
  updatedAt: number;
}

function isEnvironment(value: string): value is LoaderConfig['environment'] {
  return ENVIRONMENTS.has(value as LoaderConfig['environment']);
}

export function readConfigFromScript(script: HTMLScriptElement): LoaderConfig | null {
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
  if (!url.trim()) throw new Error('Lodariq current document URL is required');
  const headers: Record<string, string> = {};
  if (clientToken) headers['authorization'] = `Bearer ${clientToken}`;
  const response = await fetch(url, {
    credentials: 'omit',
    headers,
  });
  if (!response.ok) throw new Error(`Lodariq current document fetch failed: ${response.status}`);
  return (await response.json()) as CompiledDocument;
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

function resumeKey(config: Pick<RuntimeConfig, 'workspaceId' | 'environment'>): string {
  return `${TOUR_RESUME_PREFIX}${config.workspaceId}:${config.environment}`;
}

function readResumeState(
  config: Pick<RuntimeConfig, 'workspaceId' | 'environment'>,
  manifest: ManifestPointer,
): TourResumeState | null {
  try {
    const raw = sessionStorage.getItem(resumeKey(config));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TourResumeState>;
    const fresh =
      typeof parsed.updatedAt === 'number' &&
      Date.now() - parsed.updatedAt <= TOUR_RESUME_MAX_AGE_MS;
    if (
      fresh &&
      parsed.documentId === manifest.documentId &&
      parsed.manifestVersion === manifest.currentVersion &&
      typeof parsed.contentHash === 'string' &&
      typeof parsed.stepId === 'string'
    ) {
      return parsed as TourResumeState;
    }
    clearResumeState(config);
  } catch {
    clearResumeState(config);
  }
  return null;
}

function writeResumeState(
  config: Pick<RuntimeConfig, 'workspaceId' | 'environment'>,
  manifest: ManifestPointer,
  doc: CompiledDocument,
  step: CompiledDocument['steps'][number],
): void {
  try {
    sessionStorage.setItem(
      resumeKey(config),
      JSON.stringify({
        documentId: doc.documentId,
        manifestVersion: manifest.currentVersion,
        contentHash: doc.contentHash,
        stepId: step.id,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    /* Tour resume is best-effort and must never break the host app. */
  }
}

function clearResumeState(config: Pick<RuntimeConfig, 'workspaceId' | 'environment'>): void {
  try {
    sessionStorage.removeItem(resumeKey(config));
  } catch {
    /* Ignore unavailable storage. */
  }
}

function resumeMatchesTour(resume: TourResumeState, tour: CompiledDocument): boolean {
  return (
    resume.documentId === tour.documentId &&
    resume.contentHash === tour.contentHash &&
    tour.steps.some((step) => step.id === resume.stepId)
  );
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
    ...(context.ingestUrl ? { ingestUrl: context.ingestUrl } : {}),
    ...(config.clientToken ? { authorizationToken: config.clientToken } : {}),
  };
  const runtime = new runtimeModule.LodariqRuntime(runtimeConfig);
  const authoring = createAuthoringStatus(config, context, Boolean(openAuthoringFn));
  let activeTour: TourPlayerLike | null = null;
  let tourRequestId = 0;

  async function playTour(
    doc?: CompiledDocument,
    playbackOptions: TourPlaybackOptions = {},
  ): Promise<void> {
    try {
      const requestId = ++tourRequestId;
      const rawEnvironments = (manifest as ManifestPointer & { environments?: unknown }).environments;
      if (
        rawEnvironments !== undefined &&
        (!Array.isArray(rawEnvironments) || !rawEnvironments.includes(context.environment))
      ) {
        throw new Error(`Lodariq manifest is not eligible for ${context.environment}`);
      }
      const tour = doc ?? (await loadCurrentTourFn?.(manifest, context));
      if (requestId !== tourRequestId) return;
      assertCompiledDocument(tour);
      stopTour();
      const { TourPlayer } = await loadTourRendererFn();
      if (requestId !== tourRequestId) return;
      const player = new TourPlayer(tour, {
        ...playbackOptions,
        onBeforeStepChange: (_index, step) => writeResumeState(runtimeConfig, manifest, tour, step),
        onStepChange: (_index, step) => writeResumeState(runtimeConfig, manifest, tour, step),
        onComplete: () => {
          if (activeTour === player) activeTour = null;
          clearResumeState(runtimeConfig);
          runtime.track('tour_completed', { documentId: tour.documentId });
        },
        onDismiss: () => {
          if (activeTour === player) activeTour = null;
          clearResumeState(runtimeConfig);
          runtime.track('tour_dismissed', { documentId: tour.documentId });
        },
      });
      activeTour = player;
      runtime.track('tour_started', { documentId: tour.documentId });
      player.start();
    } catch (error) {
      runtime.reportError(error, {
        phase: 'playback',
        documentId: manifest.documentId,
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

  function stopTour(): void {
    activeTour?.stop();
    activeTour = null;
    clearResumeState(runtimeConfig);
  }

  async function resumeTourIfPending(): Promise<void> {
    const resume = readResumeState(runtimeConfig, manifest);
    if (!resume) return;
    if (!loadCurrentTourFn) {
      clearResumeState(runtimeConfig);
      return;
    }
    try {
      const tour = await loadCurrentTourFn(manifest, context);
      assertCompiledDocument(tour);
      if (!resumeMatchesTour(resume, tour)) {
        clearResumeState(runtimeConfig);
        return;
      }
      await playTour(tour, { initialStepId: resume.stepId });
    } catch {
      clearResumeState(runtimeConfig);
    }
  }

  const api: LodariqBrowserApi = {
    manifest,
    authoring,
    identify: (traits) => runtime.identify(traits),
    track: (name, props) => runtime.track(name, props),
    playTour,
    openAuthoring,
    stopTour,
  };

  window.Lodariq = api;
  await resumeTourIfPending();
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
    moduleLocation.pathname.startsWith(scriptLocation.pathname.replace(/lodariq-loader\.js$/, ''))
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
