import type { CompiledDocument, ManifestPointer } from '@talmeh/schema';
import type { IdentifyTraits, RuntimeConfig, TalmehRuntime } from '../runtime';

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

export interface TalmehBrowserApi {
  manifest: ManifestPointer;
  identify: (traits: IdentifyTraits) => void;
  track: (name: string, props?: Record<string, unknown>) => void;
  playTour: (doc?: CompiledDocument) => Promise<void>;
  openAuthoring: () => Promise<void>;
  stopTour: () => void;
}

interface TourPlayerLike {
  start: () => void;
  stop: () => void;
}

interface TourRendererModule {
  TourPlayer: new (doc: CompiledDocument, options?: { onComplete?: () => void }) => TourPlayerLike;
}

interface RuntimeModule {
  TalmehRuntime: new (config: RuntimeConfig) => TalmehRuntime;
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
    Talmeh?: TalmehBrowserApi;
  }
}

const DEFAULT_CDN_ORIGIN = 'https://cdn.talmeh.io';
const ENVIRONMENTS = new Set<LoaderConfig['environment']>(['development', 'staging', 'production']);

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
  if (!url.trim()) throw new Error('Talmeh manifest URL is required');
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Talmeh manifest fetch failed: ${res.status}`);
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
    throw new Error('Talmeh.playTour requires compiled delivery JSON with documentId and steps');
  }
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

export async function installTalmeh(
  config: LoaderConfig,
  options: InstallOptions = {},
): Promise<TalmehBrowserApi> {
  const fetchManifestFn = options.fetchManifest ?? fetchManifest;
  const loadRuntimeFn = options.loadRuntime ?? loadRuntime;
  const loadTourRendererFn = options.loadTourRenderer ?? loadTourRenderer;
  const loadCurrentTourFn = options.loadCurrentTour;
  const openAuthoringFn = options.openAuthoring;
  const [manifest, runtimeModule] = await Promise.all([
    fetchManifestFn(config.manifestUrl),
    loadRuntimeFn(),
  ]);
  const runtime = new runtimeModule.TalmehRuntime(config);
  let activeTour: TourPlayerLike | null = null;
  let tourRequestId = 0;

  async function playTour(doc?: CompiledDocument): Promise<void> {
    const requestId = ++tourRequestId;
    if (!isManifestEligible(manifest, config.environment)) {
      throw new Error(`Talmeh manifest is not eligible for ${config.environment}`);
    }
    const tour = doc ?? (await loadCurrentTourFn?.(manifest));
    if (requestId !== tourRequestId) return;
    assertCompiledDocument(tour);
    stopTour();
    const { TourPlayer } = await loadTourRendererFn();
    if (requestId !== tourRequestId) return;
    const player = new TourPlayer(tour, {
      onComplete: () => {
        if (activeTour === player) activeTour = null;
        runtime.track('tour_completed', { documentId: tour.documentId });
      },
    });
    activeTour = player;
    runtime.track('tour_started', { documentId: tour.documentId });
    player.start();
  }

  async function openAuthoring(): Promise<void> {
    if (!openAuthoringFn) throw new Error('Talmeh.openAuthoring is not configured');
    await openAuthoringFn(manifest);
  }

  function stopTour(): void {
    activeTour?.stop();
    activeTour = null;
  }

  const api: TalmehBrowserApi = {
    manifest,
    identify: (traits) => runtime.identify(traits),
    track: (name, props) => runtime.track(name, props),
    playTour,
    openAuthoring,
    stopTour,
  };

  window.Talmeh = api;
  return api;
}

export async function installTalmehFromScript(
  script: HTMLScriptElement,
  options?: InstallOptions,
): Promise<TalmehBrowserApi | null> {
  const config = readConfigFromScript(script);
  return config ? installTalmeh(config, options) : null;
}
