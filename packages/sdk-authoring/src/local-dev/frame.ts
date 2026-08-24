import {
  AUTHORING_RESOURCE_LIMITS,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  type AuthoringMediaAssetKind,
  type AuthoringMediaAssetResource,
  type GenerateNarrationResult,
  type BrandThemeSnapshot,
  type LodariqDocument,
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
  type LocalAuthoringInitialWorkspace,
  type LocalAuthoringFrameServices,
} from '../authoring/local-frame';
import {
  createDirectAuthoringHostServices,
  type DirectAuthoringHostServiceHandle,
} from '../authoring/direct-host-services';
import {
  loadLocalMediaAssetBlob,
  loadLocalMediaAssetResources,
  saveLocalMediaAssetRecord,
} from './local-media-store';
import {
  hydrateLocalAuthoringResources,
  localDraftCheckpoints,
  localStepStyleRecipes,
  saveLocalAuthoringResources,
} from './local-resource-store';
import { mockAssistProposal } from './mock-assist';
import { createLocalDevOperations } from './mock-operations';
import { createLocalDevBrandServices } from './mock-brand';
import { estimateCueMs, splitNarrationCues } from '../authoring/narration/narration-rehearsal';

export interface MountLocalAuthoringDevFrameOptions {
  root: HTMLElement;
  baseDocument: LodariqDocument;
  initialWorkspace?: LocalAuthoringInitialWorkspace;
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
  await Promise.all([hydrateLocalMediaAssets(), hydrateLocalAuthoringResources()]);
  const services = createLocalAuthoringDevFrameServices(options.services);
  const ownerWindow = options.root.ownerDocument.defaultView;
  const frameContext = localFrameContextFromLocation(ownerWindow);
  const frameMode = options.frameMode ?? frameModeFromLocation(ownerWindow);
  let contextDocument: LodariqDocument | null = null;
  if (frameContext.documentId === options.baseDocument.id) {
    contextDocument = options.baseDocument;
  } else if (frameContext.documentId) {
    contextDocument = services.loadDocument(frameContext.documentId);
  }
  if (frameContext.documentId && !contextDocument) {
    throw new Error(`Lodariq local authoring document not found: ${frameContext.documentId}`);
  }
  const activeDocument = contextDocument ?? options.baseDocument;
  /*
   * WIRE_BE: the authenticated session supplies the real provider. Without one
   * the whole assist surface is unavailable, which makes it impossible to review
   * — so local development gets a deterministic stand-in with the same contract.
   */
  if (!services.requestAiAssist) {
    services.requestAiAssist = async (request) =>
      mockAssistProposal(request, services.loadDocument(activeDocument.id) ?? activeDocument);
  }
  if (!services.generateNarration) {
    services.generateNarration = (stepId) =>
      generateLocalNarration(services.loadDocument(activeDocument.id) ?? activeDocument, stepId);
  }
  if (!services.narrationVoices?.length) {
    services.narrationVoices = [
      { id: 'local-neutral', name: 'Local neutral', locale: 'en-US', gender: 'neutral' },
    ];
  }
  /*
   * WIRE_BE: the Operations boundary is a per-session host service. Absent, the
   * frame silently disables nine tabs; present and stubbed, every one of them can
   * be designed against.
   */
  if (!services.operations) {
    services.operations = createLocalDevOperations({
      document: () => services.loadDocument(activeDocument.id) ?? activeDocument,
    });
  }
  const sessionId = options.sessionId ?? frameContext.sessionId ?? LOCAL_AUTHORING_SESSION_ID;
  const directHostServices = connectLocalPanelHostServices({
    activeDocument,
    frameMode,
    ownerWindow,
    peerWindow: options.peerWindow,
    services,
    sessionId,
    targetOrigin: options.targetOrigin,
  });
  installLocalBrandServices(services, options.previewTheme, directHostServices);
  try {
    await mountLocalAuthoringFrame({
      root: options.root,
      baseDocument: activeDocument,
      ...(options.initialWorkspace ? { initialWorkspace: options.initialWorkspace } : {}),
      ...(options.previewTheme ? { previewTheme: structuredClone(options.previewTheme) } : {}),
      frameMode,
      sessionId,
      targetOrigin: options.targetOrigin,
      peerWindow: options.peerWindow,
      now: options.now,
      services,
    });
  } catch (error) {
    directHostServices?.stop();
    throw error;
  }
}

interface LocalPanelHostServiceOptions {
  activeDocument: LodariqDocument;
  frameMode: 'standalone' | 'panel';
  ownerWindow: Window | null;
  peerWindow?: Window;
  services: LocalAuthoringFrameServices;
  sessionId: string;
  targetOrigin?: string;
}

/**
 * The Brand seam, when the host is not supplying one.
 *
 * `sampleProductStyle` is the host panel's real element picker, reached over the
 * bridge; the rest is local. With no workspace theme the accessible fallback is
 * the baseline — the same one the runtime paints with — and the state keeps
 * saying so until a match is adopted.
 */
function installLocalBrandServices(
  services: LocalAuthoringFrameServices,
  previewTheme: BrandThemeSnapshot | undefined,
  directHostServices: DirectAuthoringHostServiceHandle | null,
): void {
  if (services.getBrandWorkflowState) return;
  const sampleProductStyle = directHostServices?.services.sampleProductStyle;
  const brand = createLocalDevBrandServices({
    initialTheme: previewTheme ?? (LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1 as BrandThemeSnapshot),
    ...(previewTheme ? {} : { fallbackTheme: true }),
    ...(sampleProductStyle ? { sampleProductStyle } : {}),
  });
  Object.assign(services, brand);
}

function connectLocalPanelHostServices(
  options: LocalPanelHostServiceOptions,
): DirectAuthoringHostServiceHandle | null {
  if (options.frameMode !== 'panel') return null;
  const peerWindow = options.peerWindow ?? parentWindow(options.ownerWindow);
  const targetOrigin = options.targetOrigin ?? parentOrigin(options.ownerWindow);
  if (!peerWindow || !targetOrigin) return null;

  const handle = createDirectAuthoringHostServices({
    peerWindow,
    allowedOrigins: [targetOrigin],
    targetOrigin,
    sessionId: options.sessionId,
    workspaceId: options.activeDocument.workspaceId,
    documentId: options.activeDocument.id,
    publishToStaging: false,
    localeLayoutQa: true,
    /* The host already answers this; only the frame never asked. */
    sampleProductStyle: true,
  });
  if (handle.services.runLocaleLayoutQa && !options.services.runLocaleLayoutQa) {
    options.services.runLocaleLayoutQa = handle.services.runLocaleLayoutQa;
  }
  const stop = () => handle.stop();
  options.ownerWindow?.addEventListener('pagehide', stop, { once: true });
  return handle;
}

function parentWindow(ownerWindow: Window | null): Window | null {
  if (!ownerWindow || ownerWindow.parent === ownerWindow) return null;
  return ownerWindow.parent;
}

function parentOrigin(ownerWindow: Window | null): string | null {
  const parent = parentWindow(ownerWindow);
  if (!parent) return null;
  try {
    return parent.location.origin;
  } catch {
    try {
      return new URL(ownerWindow?.document.referrer ?? '').origin;
    } catch {
      return null;
    }
  }
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
    /*
     * WIRE_BE: the hosted editor persists these through the control plane. The
     * local trio keeps them in IndexedDB instead, so a named style or a
     * checkpoint is still there after a refresh — a checkpoint you cannot come
     * back to is not a checkpoint.
     */
    loadStepStyleRecipes: localStepStyleRecipes,
    loadDraftCheckpoints: localDraftCheckpoints,
    saveAuthoringResources: saveLocalAuthoringResources,
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
  if (file.size < 1 || file.size > AUTHORING_RESOURCE_LIMITS.assetBytes) {
    const maxMegabytes = AUTHORING_RESOURCE_LIMITS.assetBytes / 1_048_576;
    throw new Error(`Media files must be ${maxMegabytes} MB or smaller.`);
  }
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
  if (kind === 'audio') return 'audio/wav';
  if (kind === 'captions') return 'text/vtt';
  if (kind === 'video') return 'video/mp4';
  return 'image/png';
}

async function generateLocalNarration(
  document: LodariqDocument,
  stepId: string,
): Promise<GenerateNarrationResult> {
  const step = document.blocks.find((block) => block.id === stepId);
  const narration = step?.props.narration;
  if (!narration?.script.trim()) throw new Error('Narration script is required');
  let cursor = 0;
  const cues = splitNarrationCues(narration.script).map((text) => {
    const durationMs = estimateCueMs(text, narration.speed);
    const cue = { text, startMs: cursor, durationMs };
    cursor += durationMs;
    return cue;
  });
  const durationMs = Math.max(100, cursor);
  const bytes = silentWav(durationMs);
  const audioBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const file = new File([audioBuffer], `narration-${stepId}.wav`, { type: 'audio/wav' });
  const asset = await uploadLocalMediaAsset('audio', file, { savedToLibrary: false });
  const source = new TextEncoder().encode(
    JSON.stringify({
      script: narration.script,
      voiceId: narration.voiceId ?? null,
      speed: narration.speed ?? 1,
      locale: narration.localeOverride ?? null,
      model: 'local-silence-v1',
    }),
  );
  const sourceDigest = await crypto.subtle.digest('SHA-256', source);
  const sourceHash = `sha256-${[...new Uint8Array(sourceDigest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
  return {
    operationId: `ttsop_${crypto.randomUUID().replace(/-/gu, '')}`,
    replayed: false,
    asset,
    audio: {
      assetId: asset.id,
      contentHash: asset.contentHash,
      contentType: 'audio/wav',
      durationMs,
      cues,
      sourceHash,
    },
  };
}

function silentWav(durationMs: number): Uint8Array {
  const sampleRate = 8_000;
  const sampleCount = Math.max(1, Math.ceil((durationMs / 1_000) * sampleRate));
  const bytes = new Uint8Array(44 + sampleCount);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(bytes, 8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, sampleCount, true);
  bytes.fill(128, 44);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1)
    bytes[offset + index] = value.charCodeAt(index);
}
