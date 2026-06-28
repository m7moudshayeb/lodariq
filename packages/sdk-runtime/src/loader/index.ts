import type { ManifestPointer } from '@talmeh/schema';

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

const DEFAULT_CDN_ORIGIN = 'https://cdn.talmeh.io';
const ENVIRONMENTS = new Set<LoaderConfig['environment']>([
  'development',
  'staging',
  'production',
]);

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

/**
 * Lazy-load the runtime/player. The authoring bundle is NEVER loaded for
 * ordinary production viewers (PRD §6.2, §20).
 */
export async function loadRuntime() {
  return import('../runtime');
}

export async function loadTourRenderer() {
  return import('../renderers/tour');
}
