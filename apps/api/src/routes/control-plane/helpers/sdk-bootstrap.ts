import { createHash } from 'node:crypto';
import { canonicalJson } from '@lodariq/compiler';
import {
  AuthoringAuthorizationContext,
  AuthoringAuthorizationResult,
  AuthoringCodeExchangeResult,
  AuthoringDocumentSessionResult,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  CreatorModuleDescriptor,
  MAX_ACTIVE_DOCUMENT_MANIFESTS,
  RENDERER_CONTRACT_VERSION,
  validate,
  type ActiveManifestPointerV2,
  type CreatorModuleDescriptor as CreatorModuleDescriptorType,
  type PublicSdkBootstrapContext as PublicSdkBootstrapContextType,
  type PublicSdkBootstrapRequest as PublicSdkBootstrapRequestType,
  type SdkInstallContext as SdkInstallContextType,
} from '@lodariq/schema';
import {
  createPublicSdkBootstrapGrant,
  hashPublicSdkBootstrapGrant,
  type ControlPlaneRepository,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type ResolvedEnvironmentToken,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { bootstrapClaimsMatchOrigin, parseExactBrowserOrigin } from '../../../sdk-origin';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import {
  PUBLIC_SDK_BOOTSTRAP_GRANT_TTL_MS,
  CREATOR_MODULE_CONTENT_ADDRESS_PATTERN,
} from '../support';
import {
  readHeader,
  setCredentialResponseHeaders,
  deploymentOriginsForApiBaseUrl,
} from './sdk-auth';
import {
  validateSdkInstallContext,
  validatePublicSdkBootstrapContext,
  getLegacyCurrentPublication,
  createCorrelationId,
} from './sdk-context';
import { setAllowedSdkCorsHeaders } from './sdk-cors';

export async function bootstrapPublicSdkInstallation(
  options: ControlPlaneRouteOptions,
  body: PublicSdkBootstrapRequestType,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<PublicSdkBootstrapContextType | FastifyReply> {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (!exactOrigin) {
    return reply.code(400).send({
      error: 'origin_required',
      message: 'Public SDK bootstrap requires one canonical browser Origin',
    });
  }
  if (!bootstrapClaimsMatchOrigin(exactOrigin, body)) {
    return reply.code(403).send({
      error: 'origin_claim_mismatch',
      message: 'Bootstrap page intent does not match the request Origin',
    });
  }

  const resolved = await options.repository.resolvePublicSdkInstallation(
    body.installationId,
    exactOrigin,
  );
  if (!resolved) {
    return reply.code(403).send({
      error: 'installation_origin_forbidden',
      message: 'Installation is not configured for this Origin',
    });
  }
  setAllowedSdkCorsHeaders(exactOrigin, reply);

  const deployments = await options.repository.listDocumentDeployments(
    resolved.installation.workspaceId,
    resolved.environment.id,
  );
  let publication: PersistedPublication | null = null;
  let delivery: PublicSdkBootstrapContextType['delivery'];
  if (deployments.length > 0) {
    const activeDeployments = deployments
      .filter((deployment) => deployment.state === 'active')
      .sort((left, right) => left.documentId.localeCompare(right.documentId));
    if (activeDeployments.length > MAX_ACTIVE_DOCUMENT_MANIFESTS) {
      return reply.code(409).send({
        error: 'active_document_limit_exceeded',
        message: `This SDK installation has more than ${MAX_ACTIVE_DOCUMENT_MANIFESTS} active documents; deactivate documents before bootstrapping`,
        maximum: MAX_ACTIVE_DOCUMENT_MANIFESTS,
      });
    }
    const manifests = await Promise.all(
      activeDeployments.map((deployment) =>
        createActiveManifestPointer(options.repository, options.publicApiBaseUrl, deployment),
      ),
    );
    if (manifests.some((manifest) => manifest === null)) {
      return reply.code(409).send({
        error: 'deployment_publication_missing',
        message: 'An active document deployment does not resolve to an immutable publication',
      });
    }
    const activeManifests = manifests.filter(
      (manifest): manifest is ActiveManifestPointerV2 => manifest !== null,
    );
    delivery =
      activeManifests.length > 0
        ? {
            state: 'available',
            mode: 'document-scoped-v2',
            manifests: activeManifests,
            defaultDocumentId: activeManifests[0]!.documentId,
            ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
          }
        : { state: 'unavailable' };
  } else {
    publication = await getLegacyCurrentPublication(
      options.repository,
      resolved.installation.workspaceId,
      resolved.environment.id,
      reply,
    );
    if (reply.sent) return reply;
    delivery = publication
      ? {
          state: 'available',
          manifest: createManifestPointer(publication),
          currentDocumentUrl: new URL(
            '/v1/sdk/current-document',
            options.publicApiBaseUrl,
          ).toString(),
          ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
        }
      : { state: 'unavailable' };
  }

  let authoring: PublicSdkBootstrapContextType['authoring'] = { state: 'disabled' };
  const canAuthor =
    resolved.environment.kind !== 'production' && resolved.authoringEnabled === true;
  if (canAuthor) {
    const bootstrapGrant = createPublicSdkBootstrapGrant();
    const bootstrapGrantExpiresAt = new Date(
      Date.now() + PUBLIC_SDK_BOOTSTRAP_GRANT_TTL_MS,
    ).toISOString();
    await options.repository.createPublicSdkBootstrapGrant({
      workspaceId: resolved.installation.workspaceId,
      installationId: resolved.installation.installationId,
      environmentId: resolved.environment.id,
      exactOrigin,
      grantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
      expiresAt: bootstrapGrantExpiresAt,
    });
    authoring = {
      state: 'available',
      appOrigin: deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl).app,
      activationUrl: deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl).activation,
      authorizationRequestUrl: new URL(
        '/v1/sdk/authoring/authorization-requests',
        options.publicApiBaseUrl,
      ).toString(),
      exchangeUrl: new URL('/v1/sdk/authoring/exchange', options.publicApiBaseUrl).toString(),
      bootstrapGrant,
      bootstrapGrantExpiresAt,
    };
    setCredentialResponseHeaders(reply);
  }

  return validatePublicSdkBootstrapContext({
    installationId: resolved.installation.installationId,
    environmentId: resolved.environment.id,
    environment: resolved.environment.kind,
    customerOrigin: exactOrigin,
    correlationId: publication?.correlationId ?? createCorrelationId('bootstrap'),
    delivery,
    authoring,
  });
}

export function resolveCreatorModule(
  configured: CreatorModuleDescriptorType | undefined,
): CreatorModuleDescriptorType | null {
  const validation = validate(CreatorModuleDescriptor, configured);
  if (!validation.valid) return null;

  try {
    const url = new URL(validation.value.url);
    if (!CREATOR_MODULE_CONTENT_ADDRESS_PATTERN.test(url.pathname)) return null;
  } catch {
    return null;
  }
  return validation.value;
}

export function validateAuthoringAuthorizationContext(context: unknown) {
  const validation = validate(AuthoringAuthorizationContext, context);
  if (!validation.valid) {
    throw new Error(
      `Authoring authorization context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function validateAuthoringAuthorizationResult(result: unknown) {
  const validation = validate(AuthoringAuthorizationResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring authorization result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function validateAuthoringCodeExchangeResult(result: unknown) {
  const validation = validate(AuthoringCodeExchangeResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring code exchange result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function validateAuthoringDocumentSessionResult(result: unknown) {
  const validation = validate(AuthoringDocumentSessionResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring document session result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

export function createViewerSdkInstallContext(
  publicApiBaseUrl: string,
  token: ResolvedEnvironmentToken,
  publication: PersistedPublication,
  deployment: PersistedDocumentDeployment | null,
): SdkInstallContextType {
  const analyticsPointers =
    deployment?.state === 'active' && deployment.activePublicationId === publication.id
      ? [
          {
            documentId: publication.documentId,
            generation: deployment.generation,
            publicationId: publication.id,
            contentHash: publication.contentHash,
          },
        ]
      : [];
  const context = {
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    correlationId: publication.correlationId,
    manifest: createManifestPointer(publication),
    currentDocumentUrl: new URL('/v1/sdk/current-document', publicApiBaseUrl).toString(),
    ingestUrl:
      analyticsPointers.length > 0 ? new URL('/v1/sdk/events', publicApiBaseUrl).toString() : '',
    ...(analyticsPointers.length > 0 ? { analyticsPointers } : {}),
    authoring: { enabled: false },
  };
  return validateSdkInstallContext(context);
}

export function createManifestPointer(
  publication: PersistedPublication,
): SdkInstallContextType['manifest'] {
  return {
    documentId: publication.documentId,
    currentVersion: publication.contentHash,
    artifact: {
      contentHash: publication.artifact.contentHash,
      compilerVersion: publication.artifact.compilerVersion,
      createdAt: publication.artifact.createdAt,
      ...(publication.artifact.documentVersionId
        ? { documentVersionId: publication.artifact.documentVersionId }
        : {}),
    },
  };
}

export async function createActiveManifestPointer(
  repository: ControlPlaneRepository,
  publicApiBaseUrl: string,
  deployment: PersistedDocumentDeployment,
): Promise<ActiveManifestPointerV2 | null> {
  if (deployment.state !== 'active') return null;
  const publication = await repository.getCurrentPublicationForDocument(
    deployment.workspaceId,
    deployment.environmentId,
    deployment.documentId,
  );
  return publication
    ? createActiveManifestPointerFromPublication(publicApiBaseUrl, deployment, publication)
    : null;
}

export function createActiveManifestPointerFromPublication(
  publicApiBaseUrl: string,
  deployment: PersistedDocumentDeployment,
  publication: PersistedPublication,
): ActiveManifestPointerV2 | null {
  const compiled = publication.artifact.compiled;
  if (
    deployment.state !== 'active' ||
    compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    compiled.compilerVersion !== COMPILER_VERSION ||
    compiled.rendererContractVersion !== RENDERER_CONTRACT_VERSION ||
    compiled.theme.contractVersion !== BRAND_THEME_CONTRACT_VERSION ||
    publication.documentId !== deployment.documentId ||
    publication.id !== deployment.activePublicationId ||
    publication.contentHash !== compiled.contentHash
  ) {
    return null;
  }

  const encodedWorkspaceId = encodeURIComponent(deployment.workspaceId);
  const encodedEnvironmentId = encodeURIComponent(deployment.environmentId);
  const encodedDocumentId = encodeURIComponent(deployment.documentId);
  const encodedContentHash = encodeURIComponent(compiled.contentHash);
  const artifactUrl = new URL(
    `/v1/sdk/workspaces/${encodedWorkspaceId}/environments/${encodedEnvironmentId}/documents/${encodedDocumentId}/artifacts/${encodedContentHash}`,
    publicApiBaseUrl,
  ).toString();
  const canonicalArtifact = canonicalJson(compiled);
  return {
    schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    workspaceId: deployment.workspaceId,
    environmentId: deployment.environmentId,
    documentId: deployment.documentId,
    state: 'active',
    generation: deployment.generation,
    publicationId: publication.id,
    activatedAt: publication.publishedAt,
    artifact: {
      artifactSchemaVersion: compiled.artifactSchemaVersion,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      rendererContractVersion: compiled.rendererContractVersion,
      themeContractVersion: compiled.theme.contractVersion,
      themeVersionId: compiled.theme.themeVersionId,
      themeContentHash: compiled.theme.contentHash,
      url: artifactUrl,
      integrity: `sha256-${createHash('sha256').update(canonicalArtifact).digest('base64')}`,
    },
  };
}

export function createJsonEtag(body: string): string {
  return `"sha256-${createHash('sha256').update(body).digest('hex')}"`;
}

export function requestMatchesEtag(request: FastifyRequest, etag: string): boolean {
  const header = readHeader(request, 'if-none-match');
  if (!header) return false;
  const normalized = etag.replace(/^W\//u, '');
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//u, ''))
    .some((value) => value === '*' || value === normalized);
}

export function setManifestResponseHeaders(reply: FastifyReply, etag: string): void {
  setPrivateDocumentResponseHeaders(reply);
  reply.header('etag', etag);
}

export function setPrivateDocumentResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store');
  reply.header('x-content-type-options', 'nosniff');
}

export function setImmutableArtifactResponseHeaders(reply: FastifyReply, etag: string): void {
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  reply.header('etag', etag);
  reply.header('x-content-type-options', 'nosniff');
}
