import type {
  AuthoringMediaAssetKind,
  AuthoringMediaAssetResource,
  BrandThemeSnapshot,
  LodariqDocument,
} from '@lodariq/schema';
import {
  compilePreview,
  exportDocument,
  exportLocalMetricsReport,
  importDocument,
  listLocalMetrics,
  loadDocument,
  recordLocalMetric,
  resetLocalDocuments,
  saveDocument,
  summarizeLocalMetrics,
} from '@lodariq/sdk-runtime/lodariq-local-dev';
import { LOCAL_AUTHORING_SESSION_ID } from '../authoring/constants';
import {
  mountLocalAuthoringFrame,
  type LocalAuthoringFrameServices,
} from '../authoring/local-frame';
import {
  loadLocalMediaAssetBlob,
  loadLocalMediaAssetResources,
  saveLocalMediaAssetRecord,
} from './local-media-store';

export interface MountLocalAuthoringDevFrameOptions {
  root: HTMLElement;
  baseDocument: LodariqDocument;
  previewTheme?: BrandThemeSnapshot;
  frameMode?: 'standalone' | 'panel';
  sessionId?: string;
  targetOrigin?: string;
  peerWindow?: Window;
  now?: () => number;
  services?: Partial<LocalAuthoringFrameServices>;
}

export async function mountLocalAuthoringDevFrame(
  options: MountLocalAuthoringDevFrameOptions,
): Promise<void> {
  await hydrateLocalMediaAssets();
  const services = createLocalAuthoringDevFrameServices(options.services);
  const frameContext = localFrameContextFromLocation(options.root.ownerDocument.defaultView);
  let contextDocument: LodariqDocument | null = null;
  if (frameContext.documentId === options.baseDocument.id) {
    contextDocument = options.baseDocument;
  } else if (frameContext.documentId) {
    contextDocument = services.loadDocument(frameContext.documentId);
  }
  if (frameContext.documentId && !contextDocument) {
    throw new Error(`Lodariq local authoring document not found: ${frameContext.documentId}`);
  }
  await mountLocalAuthoringFrame({
    root: options.root,
    baseDocument: contextDocument ?? options.baseDocument,
    ...(options.previewTheme ? { previewTheme: structuredClone(options.previewTheme) } : {}),
    frameMode: options.frameMode ?? frameModeFromLocation(options.root.ownerDocument.defaultView),
    sessionId: options.sessionId ?? frameContext.sessionId ?? LOCAL_AUTHORING_SESSION_ID,
    targetOrigin: options.targetOrigin,
    peerWindow: options.peerWindow,
    now: options.now,
    services,
  });
}

interface LocalFrameContext {
  documentId: string | null;
  sessionId: string | null;
}

interface CachedLocalMediaAsset {
  blob?: Blob;
  resource: AuthoringMediaAssetResource;
}

const localMediaAssets = new Map<string, CachedLocalMediaAsset>();

async function hydrateLocalMediaAssets(): Promise<void> {
  const durableAssets = await loadLocalMediaAssetResources();
  localMediaAssets.clear();
  for (const resource of durableAssets) {
    localMediaAssets.set(resource.id, { resource });
  }
}

function localFrameContextFromLocation(view: Window | null): LocalFrameContext {
  if (!view) return { documentId: null, sessionId: null };
  try {
    const params = new URLSearchParams(view.location.search);
    return {
      documentId: nonEmptyParam(params.get('lodariqDocument')),
      sessionId: nonEmptyParam(params.get('lodariqSession')),
    };
  } catch {
    return { documentId: null, sessionId: null };
  }
}

function nonEmptyParam(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function frameModeFromLocation(view: Window | null): 'standalone' | 'panel' {
  if (!view) return 'standalone';
  try {
    return new URLSearchParams(view.location.search).get('lodariqFrame') === 'panel'
      ? 'panel'
      : 'standalone';
  } catch {
    return 'standalone';
  }
}

function createLocalAuthoringDevFrameServices(
  overrides: Partial<LocalAuthoringFrameServices> = {},
): LocalAuthoringFrameServices {
  return {
    loadDocument,
    saveDocument,
    exportDocument,
    importDocument,
    resetDocuments: resetLocalDocuments,
    compilePreview,
    loadMediaAssets: () =>
      [...localMediaAssets.values()].map(({ resource }) => structuredClone(resource)),
    loadMediaAssetPreview: async (asset) => {
      const stored = localMediaAssets.get(asset.id);
      if (!stored) throw new Error(`Local media asset not found: ${asset.id}`);
      const blob = stored.blob ?? (await loadLocalMediaAssetBlob(asset.id));
      if (!blob) throw new Error(`Local media asset data not found: ${asset.id}`);
      stored.blob = blob;
      return blob.slice(0, blob.size, blob.type);
    },
    uploadMediaAsset: uploadLocalMediaAsset,
    recordMetric: recordLocalMetric,
    getMetricsSummary: (sessionId) => summarizeLocalMetrics(listLocalMetrics(sessionId)),
    exportMetricsReport: (sessionId) => exportLocalMetricsReport({ sessionId }),
    ...overrides,
  };
}

async function uploadLocalMediaAsset(
  kind: AuthoringMediaAssetKind,
  file: File,
  options: { onProgress?: (progress: number) => void; savedToLibrary: boolean },
): Promise<AuthoringMediaAssetResource> {
  const id = `asset_local_${crypto.randomUUID().split('-').join('')}`;
  const bytes = await readFileWithProgress(file, options.onProgress);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  options.onProgress?.(90);
  const contentHash = `sha256-${[...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
  const resource: AuthoringMediaAssetResource = {
    id,
    kind,
    filename: file.name.slice(0, 180) || `${kind}-asset`,
    contentType: (file.type || contentTypeForLocalAsset(kind)).slice(0, 100),
    byteLength: file.size,
    contentHash,
    savedToLibrary: options.savedToLibrary,
    createdAt: new Date().toISOString(),
    downloadPath: `/v1/authoring/media-assets/${id}`,
  };
  const record = { resource, blob: file.slice(0, file.size, resource.contentType) };
  await saveLocalMediaAssetRecord(record);
  localMediaAssets.set(id, record);
  options.onProgress?.(100);
  return structuredClone(resource);
}

async function readFileWithProgress(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> {
  onProgress?.(0);
  if (typeof file.stream !== 'function') {
    const bytes = await file.arrayBuffer();
    onProgress?.(80);
    return bytes;
  }
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value);
    loadedBytes += chunk.value.byteLength;
    const fraction = file.size > 0 ? loadedBytes / file.size : 1;
    onProgress?.(Math.min(80, Math.round(fraction * 80)));
  }
  const bytes = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer as ArrayBuffer;
}

function contentTypeForLocalAsset(kind: AuthoringMediaAssetKind): string {
  if (kind === 'captions') return 'text/vtt';
  if (kind === 'video') return 'video/mp4';
  return 'image/png';
}
