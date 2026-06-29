import type { CompiledDocument, ManifestPointer } from '@lodariq/schema';
import type { IdentifyTraits, RuntimeConfig, LodariqRuntime } from '../runtime';

/**
 * Tiny install-script bootstrap (PRD §6.2, §9.2).
 *
 * Reads workspace/env config from the script tag, fetches the manifest pointer,
 * and lazy-loads only the runtime modules a page actually needs. Target CI
 * budget: under 3 KB gzipped (PRD §9.1) — keep this dependency-free.
 */
export interface LoaderConfig {
  workspaceId: string;
  environment: 'development' | 'staging' | 'production';
  manifestUrl: string;
}

export interface LodariqBrowserApi {
  manifest: ManifestPointer;
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
  fetchManifest?: (url: string) => Promise<ManifestPointer>;
  loadRuntime?: () => Promise<RuntimeModule>;
  loadTourRenderer?: () => Promise<TourRendererModule>;
  loadCurrentTour?: (manifest: ManifestPointer) => Promise<CompiledDocument>;
  openAuthoring?: (manifest: ManifestPointer) => Promise<void>;
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

export function defaultManifestUrl(
  workspaceId: string,
  environment: LoaderConfig['environment'],
): string {
  return `${DEFAULT_CDN_ORIGIN}/workspaces/${encodeURIComponent(
    workspaceId,
  )}/${environment}/manifest.json`;
}

export function readConfigFromScript(script: HTMLScriptElement): LoaderConfig | null {
  const workspaceId = script.dataset['workspace'];
  const rawEnvironment = script.dataset['env'] ?? 'production';
  if (!workspaceId) return null;
  if (!isEnvironment(rawEnvironment)) return null;
  const manifestUrl =
    script.dataset['manifest']?.trim() || defaultManifestUrl(workspaceId, rawEnvironment);
  return { workspaceId, environment: rawEnvironment, manifestUrl };
}

export async function fetchManifest(url: string): Promise<ManifestPointer> {
  if (!url.trim()) throw new Error('Lodariq manifest URL is required');
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Lodariq manifest fetch failed: ${res.status}`);
  return (await res.json()) as ManifestPointer;
}

export function isManifestEligible(
  manifest: ManifestPointer,
  environment: LoaderConfig['environment'],
): boolean {
  const rawEnvironments = (manifest as ManifestPointer & { environments?: unknown }).environments;
  if (rawEnvironments === undefined) return true;
  if (!Array.isArray(rawEnvironments)) return false;
  return rawEnvironments.some((value) => value === environment);
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

function resumeKey(config: LoaderConfig): string {
  return `${TOUR_RESUME_PREFIX}${config.workspaceId}:${config.environment}`;
}

function readResumeState(config: LoaderConfig, manifest: ManifestPointer): TourResumeState | null {
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
  config: LoaderConfig,
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

function clearResumeState(config: LoaderConfig): void {
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
  const loadRuntimeFn = options.loadRuntime ?? loadRuntime;
  const loadTourRendererFn = options.loadTourRenderer ?? loadTourRenderer;
  const loadCurrentTourFn = options.loadCurrentTour;
  const openAuthoringFn = options.openAuthoring;
  const [manifest, runtimeModule] = await Promise.all([
    fetchManifestFn(config.manifestUrl),
    loadRuntimeFn(),
  ]);
  const runtime = new runtimeModule.LodariqRuntime(config);
  let activeTour: TourPlayerLike | null = null;
  let tourRequestId = 0;

  async function playTour(
    doc?: CompiledDocument,
    playbackOptions: TourPlaybackOptions = {},
  ): Promise<void> {
    const requestId = ++tourRequestId;
    if (!isManifestEligible(manifest, config.environment)) {
      throw new Error(`Lodariq manifest is not eligible for ${config.environment}`);
    }
    const tour = doc ?? (await loadCurrentTourFn?.(manifest));
    if (requestId !== tourRequestId) return;
    assertCompiledDocument(tour);
    stopTour();
    const { TourPlayer } = await loadTourRendererFn();
    if (requestId !== tourRequestId) return;
    const player = new TourPlayer(tour, {
      ...playbackOptions,
      onBeforeStepChange: (_index, step) => writeResumeState(config, manifest, tour, step),
      onStepChange: (_index, step) => writeResumeState(config, manifest, tour, step),
      onComplete: () => {
        if (activeTour === player) activeTour = null;
        clearResumeState(config);
        runtime.track('tour_completed', { documentId: tour.documentId });
      },
      onDismiss: () => {
        if (activeTour === player) activeTour = null;
        clearResumeState(config);
        runtime.track('tour_dismissed', { documentId: tour.documentId });
      },
    });
    activeTour = player;
    runtime.track('tour_started', { documentId: tour.documentId });
    player.start();
  }

  async function openAuthoring(): Promise<void> {
    if (!openAuthoringFn) throw new Error('Lodariq.openAuthoring is not configured');
    await openAuthoringFn(manifest);
  }

  function stopTour(): void {
    activeTour?.stop();
    activeTour = null;
    clearResumeState(config);
  }

  async function resumeTourIfPending(): Promise<void> {
    const resume = readResumeState(config, manifest);
    if (!resume) return;
    if (!loadCurrentTourFn) {
      clearResumeState(config);
      return;
    }
    try {
      const tour = await loadCurrentTourFn(manifest);
      assertCompiledDocument(tour);
      if (!resumeMatchesTour(resume, tour)) {
        clearResumeState(config);
        return;
      }
      await playTour(tour, { initialStepId: resume.stepId });
    } catch {
      clearResumeState(config);
    }
  }

  const api: LodariqBrowserApi = {
    manifest,
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

export async function installLodariqFromScript(
  script: HTMLScriptElement,
  options?: InstallOptions,
): Promise<LodariqBrowserApi | null> {
  const config = readConfigFromScript(script);
  return config ? installLodariq(config, options) : null;
}
