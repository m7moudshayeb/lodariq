import type {
  ActiveManifestPointerV2,
  AvailableSdkDeliveryDescriptor,
  CompiledDocument,
  CustomerBrandTokenRegistration,
  DocumentScopedSdkDeliveryDescriptor,
  ManifestPointer,
  PublicSdkBootstrapContext,
  SdkInstallContext,
} from '@lodariq/schema';
import { registerBrandTokens } from '../brand-token-registry';
import {
  installLodariq,
  type LoaderConfig,
  type LodariqBrowserApi,
  type TourPlaybackOptions,
} from '../loader';
import {
  LodariqArtifactCompatibilityError,
  assertSupportedArtifactManifest,
} from '../artifact-compatibility';

const PUBLIC_INSTALLATION_HEADER = 'x-lodariq-installation-id';
type AvailableDelivery = AvailableSdkDeliveryDescriptor | DocumentScopedSdkDeliveryDescriptor;
type AvailableManifest = AvailableSdkDeliveryDescriptor['manifest'];

interface PublicDocumentSource {
  manifest: ManifestPointer;
  artifactManifest?: ActiveManifestPointerV2;
  request: {
    url: string;
    installationId: string;
    integrity?: string;
  };
}

/** Additive multi-document controls exposed by the permanent public install. */
export interface PublicDeliveryBrowserApi extends LodariqBrowserApi {
  readonly manifests: readonly ManifestPointer[];
  readonly defaultDocumentId: string;
  registerBrandTokens(registration: CustomerBrandTokenRegistration): void;
  playTourById(documentId: string, options?: TourPlaybackOptions): Promise<void>;
  destroyDelivery(): void;
}

/**
 * Adapts the permanent public bootstrap to the existing proven viewer runtime.
 * It contains no launcher, popup, creator, React, or editor dependency.
 */
export async function installPublicSdkDelivery(
  context: PublicSdkBootstrapContext,
  assignmentKey?: string,
): Promise<PublicDeliveryBrowserApi | null> {
  if (context.delivery.state !== 'available') return null;

  const delivery = context.delivery;
  const sources = createDocumentSources(context, delivery);
  const sourceByDocumentId = new Map(sources.map((source) => [source.manifest.documentId, source]));
  const defaultDocumentId = getDefaultDocumentId(delivery);
  const defaultSource = sourceByDocumentId.get(defaultDocumentId);
  if (!defaultSource) throw new Error('Lodariq public delivery configuration is invalid');

  const manifest = defaultSource.manifest;
  const workspaceId = getWorkspaceId(context, delivery);
  const analyticsPointers = sources.flatMap((source) =>
    source.artifactManifest
      ? [
          {
            documentId: source.artifactManifest.documentId,
            generation: source.artifactManifest.generation,
            publicationId: source.artifactManifest.publicationId,
            contentHash: source.artifactManifest.artifact.contentHash,
          },
        ]
      : [],
  );
  const installContext: SdkInstallContext = {
    workspaceId,
    environmentId: context.environmentId,
    environment: context.environment,
    correlationId: context.correlationId,
    manifest,
    currentDocumentUrl: defaultSource.request.url,
    ingestUrl: analyticsPointers.length > 0 ? delivery.ingestUrl : '',
    authoring: { enabled: false },
  };
  const config: LoaderConfig = {
    workspaceId,
    environment: context.environment,
  };

  const documentCache = new Map<string, Promise<CompiledDocument>>();
  const loadDocument = (source: PublicDocumentSource): Promise<CompiledDocument> => {
    const cached = documentCache.get(source.manifest.documentId);
    if (cached) return cached;
    const pending = fetchPublicCurrentDocument(
      source.request.url,
      source.artifactManifest ?? source.manifest,
      source.request,
    ).catch((error: unknown) => {
      documentCache.delete(source.manifest.documentId);
      throw error;
    });
    documentCache.set(source.manifest.documentId, pending);
    return pending;
  };

  const api = await installLodariq(config, {
    publicInstallationId: context.installationId,
    assignmentKey,
    analyticsPointers,
    fetchInstallContext: async () => installContext,
    // Honours the manifest it is asked for. Resume names the experience the
    // visitor was actually in, which on a multi-document install is often not
    // the default one.
    loadCurrentTour: async (requestedManifest) =>
      loadDocument(sourceByDocumentId.get(requestedManifest.documentId) ?? defaultSource),
    resolveManifestForDocument: (documentId) => sourceByDocumentId.get(documentId)?.manifest,
    resolveArtifactManifestForDocument: (documentId) =>
      sourceByDocumentId.get(documentId)?.artifactManifest,
  });
  const publicApi = api as PublicDeliveryBrowserApi;
  const playTour = api.playTour.bind(api);
  Object.defineProperties(publicApi, {
    manifests: {
      enumerable: true,
      value: Object.freeze(sources.map((source) => source.manifest)),
    },
    defaultDocumentId: { enumerable: true, value: defaultDocumentId },
  });
  publicApi.playTourById = async (
    documentId: string,
    options: TourPlaybackOptions = {},
  ): Promise<void> => {
    const source = sourceByDocumentId.get(documentId);
    if (!source) throw new Error('Lodariq public tour is not available');
    return publicApi.playTour(await loadDocument(source), options);
  };
  publicApi.playTour = async (document, options = {}): Promise<void> => {
    const source = sourceByDocumentId.get(document?.documentId ?? defaultDocumentId);
    await playTour(document, withServerAdaptiveContext(source, options));
  };
  publicApi.registerBrandTokens = registerBrandTokens;
  const { installDeliveryHooks } = await import('./delivery-hooks');
  publicApi.destroyDelivery = installDeliveryHooks({
    api: publicApi,
    sources,
    environment: context.environment,
    installationId: context.installationId,
    catalogUrl: delivery.catalogUrl,
  });
  return publicApi;
}

function withServerAdaptiveContext(
  source: PublicDocumentSource | undefined,
  options: TourPlaybackOptions,
): TourPlaybackOptions {
  const { adaptiveContext: _ignoredClientContext, ...rest } = options;
  return source?.artifactManifest?.adaptive
    ? { ...rest, adaptiveContext: source.artifactManifest.adaptive }
    : rest;
}

export async function fetchPublicCurrentDocument(
  url: string,
  manifest: ManifestPointer | ActiveManifestPointerV2,
  options: { installationId?: string; integrity?: string },
): Promise<CompiledDocument> {
  if (!url.trim() || (!options.installationId && !options.integrity)) {
    throw new Error('Lodariq public delivery configuration is invalid');
  }
  const headers = options.installationId
    ? { [PUBLIC_INSTALLATION_HEADER]: options.installationId }
    : undefined;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'omit',
      ...(headers ? { headers } : {}),
      ...(options.integrity ? { integrity: options.integrity } : {}),
    });
  } catch {
    throw new Error('Lodariq public document request failed');
  }
  if (!response.ok) throw new Error('Lodariq public document request failed');
  const { readValidatedPublicArtifact } = await import('../artifact-payload-validation');
  return readValidatedPublicArtifact(response, manifest);
}

function createDocumentSources(
  context: PublicSdkBootstrapContext,
  delivery: AvailableDelivery,
): PublicDocumentSource[] {
  if (!isDocumentScopedDelivery(delivery)) {
    return [
      createDocumentSource(context.installationId, delivery.manifest, delivery.currentDocumentUrl),
    ];
  }

  const documentIds = new Set<string>();
  const workspaceIds = new Set<string>();
  const sources = delivery.manifests.map((manifest) => {
    if (manifest.environmentId !== context.environmentId || documentIds.has(manifest.documentId)) {
      throw new Error('Lodariq public delivery configuration is invalid');
    }
    documentIds.add(manifest.documentId);
    workspaceIds.add(manifest.workspaceId);
    return createDocumentSource(context.installationId, manifest, manifest.artifact.url);
  });
  if (
    sources.length === 0 ||
    workspaceIds.size !== 1 ||
    !documentIds.has(delivery.defaultDocumentId)
  ) {
    throw new Error('Lodariq public delivery configuration is invalid');
  }
  return sources;
}

function createDocumentSource(
  installationId: string,
  availableManifest: AvailableManifest,
  legacyDocumentUrl: string,
): PublicDocumentSource {
  if (!isManifestV2(availableManifest)) {
    if (Object.prototype.hasOwnProperty.call(availableManifest, 'schemaVersion')) {
      throw new LodariqArtifactCompatibilityError();
    }
    return {
      manifest: availableManifest,
      request: { url: legacyDocumentUrl, installationId },
    };
  }
  assertSupportedArtifactManifest(availableManifest);
  const manifest = toRuntimeManifest(availableManifest);
  return {
    manifest,
    artifactManifest: availableManifest,
    request: {
      url: availableManifest.artifact.url,
      installationId,
      integrity: availableManifest.artifact.integrity,
    },
  };
}

function getDefaultDocumentId(delivery: AvailableDelivery): string {
  return isDocumentScopedDelivery(delivery)
    ? delivery.defaultDocumentId
    : delivery.manifest.documentId;
}

function getWorkspaceId(context: PublicSdkBootstrapContext, delivery: AvailableDelivery): string {
  if (isDocumentScopedDelivery(delivery)) return delivery.manifests[0]?.workspaceId ?? '';
  return isManifestV2(delivery.manifest) ? delivery.manifest.workspaceId : context.installationId;
}

function isDocumentScopedDelivery(
  delivery: AvailableDelivery,
): delivery is DocumentScopedSdkDeliveryDescriptor {
  return 'mode' in delivery && delivery.mode === 'document-scoped-v2';
}

function toRuntimeManifest(manifest: AvailableManifest): ManifestPointer {
  if (!isManifestV2(manifest)) return manifest;
  return {
    documentId: manifest.documentId,
    currentVersion: manifest.artifact.contentHash,
    artifact: {
      contentHash: manifest.artifact.contentHash,
      compilerVersion: manifest.artifact.compilerVersion,
      createdAt: manifest.activatedAt,
      storageUrl: manifest.artifact.url,
    },
  };
}

function isManifestV2(manifest: AvailableManifest): manifest is ActiveManifestPointerV2 {
  return 'schemaVersion' in manifest;
}
