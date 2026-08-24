import { createHash } from 'node:crypto';
import { canonicalJson } from '@lodariq/compiler';
import {
  AuthoringAuthorizationContext,
  AuthoringAuthorizationResult,
  AuthoringCodeExchangeResult,
  AuthoringDocumentSessionResult,
  CreatorModuleDescriptor,
  MAX_ACTIVE_DOCUMENT_MANIFESTS,
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  SDK_ELIGIBILITY_DIGEST_SCHEMA_VERSION,
  SdkEligibilityDigest,
  findSupportedDeliveryContract,
  isValidCompilerVersion,
  readPageEligibilityContext,
  triggerMatchesPage,
  validate,
  type ActiveManifestPointerV2,
  type PageEligibilityContext,
  type SdkEligibilityDigest as SdkEligibilityDigestType,
  type SdkEligibilityPagePattern as SdkEligibilityPagePatternType,
  type SdkEligibilityScope as SdkEligibilityScopeType,
  type TriggerDefinition,
  type CreatorModuleDescriptor as CreatorModuleDescriptorType,
  type PublicSdkBootstrapContext as PublicSdkBootstrapContextType,
  type PublicSdkBootstrapRequest as PublicSdkBootstrapRequestType,
  type SdkInstallContext as SdkInstallContextType,
} from '@lodariq/schema';
import {
  createPublicSdkBootstrapGrant,
  hashAdaptiveVisitorKey,
  hashPublicSdkBootstrapGrant,
  type ControlPlaneRepository,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PublicSdkInstallationRecord,
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

  // The kill switch, enforced a second time here. The digest already stops most
  // pages before they reach this route, but a visitor holding a cached digest
  // from before the pause must not be able to start a tour on the strength of
  // it, so the authoritative path re-checks.
  if (!isInstallationEnabled(resolved.installation)) {
    return validatePublicSdkBootstrapContext({
      installationId: resolved.installation.installationId,
      environmentId: resolved.environment.id,
      environment: resolved.environment.kind,
      customerOrigin: exactOrigin,
      correlationId: createCorrelationId('bootstrap'),
      delivery: { state: 'unavailable' },
      authoring: { state: 'disabled', reason: 'not_enabled' },
    });
  }

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
    const candidates = await Promise.all(
      activeDeployments.map((deployment) =>
        createActiveManifestCandidate(options.repository, options.publicApiBaseUrl, deployment),
      ),
    );
    if (candidates.some((candidate) => candidate === null)) {
      return reply.code(409).send({
        error: 'deployment_publication_missing',
        message: 'An active document deployment does not resolve to an immutable publication',
      });
    }
    // Page scoping (ADR-0027). A visitor on a page no active experience targets
    // pays the bootstrap request and nothing else: no delivery module, no
    // runtime, no artifact. Unparseable or absent page intent falls through to
    // the whole active set, so a missing href can never hide a live experience.
    const selectedManifests = selectManifestsForPage(
      candidates.filter((candidate): candidate is ActiveManifestCandidate => candidate !== null),
      readPageEligibilityContext(body.href, exactOrigin),
    );
    const activeManifests = await attachDeliveryDecisions(
      options.repository,
      candidates.filter((candidate): candidate is ActiveManifestCandidate => candidate !== null),
      selectedManifests,
      body.assignmentKey,
    );
    delivery =
      activeManifests.length > 0
        ? {
            state: 'available',
            mode: 'document-scoped-v2',
            manifests: activeManifests,
            defaultDocumentId: activeManifests[0]!.documentId,
            ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
            catalogUrl: new URL(
              '/v1/sdk/catalog-observations',
              options.publicApiBaseUrl,
            ).toString(),
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
    // The deprecated environment-global branch is page-scoped on the same rule,
    // so a customer still on the compatibility install gets the same idle cost.
    const legacyCompiled = publication?.artifact.compiled;
    const legacyTrigger =
      legacyCompiled && 'trigger' in legacyCompiled
        ? (legacyCompiled.trigger as TriggerDefinition)
        : null;
    const legacyPage = readPageEligibilityContext(body.href, exactOrigin);
    if (
      publication &&
      legacyTrigger &&
      legacyPage &&
      !triggerMatchesPage(legacyTrigger, legacyPage)
    ) {
      publication = null;
    }
    delivery = publication
      ? {
          state: 'available',
          manifest: createManifestPointer(publication),
          currentDocumentUrl: new URL(
            '/v1/sdk/current-document',
            options.publicApiBaseUrl,
          ).toString(),
          ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
          catalogUrl: new URL('/v1/sdk/catalog-observations', options.publicApiBaseUrl).toString(),
        }
      : { state: 'unavailable' };
  }

  const canAuthor =
    resolved.environment.kind !== 'production' && resolved.authoringEnabled === true;
  // §14.4: say which of the two reasons applies, so the SDK can explain the path.
  let authoring: PublicSdkBootstrapContextType['authoring'] = {
    state: 'disabled',
    reason: resolved.environment.kind === 'production' ? 'production_environment' : 'not_enabled',
  };
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

/**
 * Narrow the active pointers to those whose trigger can fire on this page.
 *
 * Fails open twice over: with no usable page context every pointer is kept, and
 * `triggerMatchesPage` keeps anything that is not an explicit `urlMatch` miss.
 * The only way to be dropped here is to carry a URL pattern that demonstrably
 * does not match where the visitor is standing.
 */
export function selectManifestsForPage(
  candidates: readonly ActiveManifestCandidate[],
  page: PageEligibilityContext | null,
): ActiveManifestPointerV2[] {
  if (!page) return candidates.map((candidate) => candidate.pointer);
  return candidates
    .filter((candidate) => !candidate.trigger || triggerMatchesPage(candidate.trigger, page))
    .map((candidate) => candidate.pointer);
}

/**
 * Reduce every active experience's trigger to the smallest scope that still
 * admits all of them.
 *
 * The moment one active experience can fire anywhere — a manual document played
 * by host code, an event document fired by a later `track` call — the whole
 * installation is `all`, because no URL can rule those out. Only when every
 * active experience is pinned to a URL pattern can a page rule itself out.
 */
export function resolveEligibilityScope(
  triggers: readonly (TriggerDefinition | null)[],
): SdkEligibilityScopeType {
  if (triggers.length === 0) return { kind: 'none' };
  const patterns: SdkEligibilityPagePatternType[] = [];
  for (const trigger of triggers) {
    if (!trigger || trigger.type !== 'urlMatch') return { kind: 'all' };
    patterns.push({ pattern: trigger.config.pattern, mode: trigger.config.mode ?? 'exact' });
  }
  return patterns.length > 0 ? { kind: 'patterns', patterns } : { kind: 'none' };
}

/**
 * Whether an installation may deliver anything at all right now.
 *
 * Suspension is checked here rather than inside `resolvePublicSdkInstallation`
 * on purpose: a suspended installation must still resolve, so the digest can
 * report `enabled: false` and the page can distinguish "paused" from "this
 * origin is not yours" — one is a customer's own deliberate act, the other is a
 * misconfiguration worth surfacing.
 */
export function isInstallationEnabled(installation: PublicSdkInstallationRecord): boolean {
  return !installation.revokedAt && !installation.suspendedAt;
}

/** Assemble the cacheable digest for one installation. */
export async function buildSdkEligibilityDigest(
  options: ControlPlaneRouteOptions,
  installationId: string,
  workspaceId: string,
  environmentId: string,
  enabled: boolean,
): Promise<SdkEligibilityDigestType> {
  if (!enabled) {
    // A disabled installation reports no scope at all, so a stale digest can
    // never re-enable delivery on its own.
    return validateEligibilityDigest({
      schemaVersion: SDK_ELIGIBILITY_DIGEST_SCHEMA_VERSION,
      installationId,
      enabled: false,
      scope: { kind: 'none' },
    });
  }
  const deployments = await options.repository.listDocumentDeployments(workspaceId, environmentId);
  const activeDeployments = deployments.filter((deployment) => deployment.state === 'active');
  const candidates = await Promise.all(
    activeDeployments.map((deployment) =>
      createActiveManifestCandidate(options.repository, options.publicApiBaseUrl, deployment),
    ),
  );
  const resolvable = candidates.filter(
    (candidate): candidate is ActiveManifestCandidate => candidate !== null,
  );
  return validateEligibilityDigest({
    schemaVersion: SDK_ELIGIBILITY_DIGEST_SCHEMA_VERSION,
    installationId,
    enabled: true,
    scope: resolveEligibilityScope(resolvable.map((candidate) => candidate.trigger)),
  });
}

/** The digest is validated on the way out; a malformed one is a server fault. */
function validateEligibilityDigest(digest: SdkEligibilityDigestType): SdkEligibilityDigestType {
  const result = validate(SdkEligibilityDigest, digest);
  if (!result.valid) throw new Error('Lodariq SDK eligibility digest failed validation');
  return result.value;
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

/**
 * An active pointer together with the trigger that decides where it may fire.
 *
 * The trigger is read from the immutable published artifact, never from the
 * editable document, so page scoping can never disagree with what is actually
 * deliverable. V1 artifacts predate triggers and report `null`, which the
 * matcher treats as eligible everywhere.
 */
export interface ActiveManifestCandidate {
  pointer: ActiveManifestPointerV2;
  trigger: TriggerDefinition | null;
  experimentId: string | null;
  adaptiveEventNames: readonly string[];
}

export async function createActiveManifestCandidate(
  repository: ControlPlaneRepository,
  publicApiBaseUrl: string,
  deployment: PersistedDocumentDeployment,
): Promise<ActiveManifestCandidate | null> {
  if (deployment.state !== 'active') return null;
  const publication = await repository.getCurrentPublicationForDocument(
    deployment.workspaceId,
    deployment.environmentId,
    deployment.documentId,
  );
  if (!publication) return null;
  const pointer = createActiveManifestPointerFromPublication(
    publicApiBaseUrl,
    deployment,
    publication,
  );
  if (!pointer) return null;
  const compiled = publication.artifact.compiled;
  const trigger = 'trigger' in compiled ? (compiled.trigger as TriggerDefinition) : null;
  const experimentId =
    'experiment' in compiled && compiled.experiment ? compiled.experiment.id : null;
  const adaptiveEventNames = [
    ...new Set(
      compiled.steps
        .map((step) => ('teaches' in step ? step.teaches : undefined))
        .filter((name): name is string => Boolean(name)),
    ),
  ].slice(0, 200);
  return { pointer, trigger, experimentId, adaptiveEventNames };
}

async function attachDeliveryDecisions(
  repository: ControlPlaneRepository,
  candidates: readonly ActiveManifestCandidate[],
  manifests: readonly ActiveManifestPointerV2[],
  assignmentKey?: string,
): Promise<ActiveManifestPointerV2[]> {
  if (!assignmentKey) return [...manifests];
  const byDocumentId = new Map(
    candidates.map((candidate) => [candidate.pointer.documentId, candidate]),
  );
  const evaluatedAt = new Date().toISOString();
  return Promise.all(
    manifests.map(async (manifest) => {
      const candidate = byDocumentId.get(manifest.documentId);
      if (!candidate) return manifest;
      const assignment = candidate.experimentId
        ? await repository.getOrCreateExperimentAssignment({
            workspaceId: manifest.workspaceId,
            environmentId: manifest.environmentId,
            documentId: manifest.documentId,
            experimentId: candidate.experimentId,
            assignmentKey,
          })
        : null;
      let adaptive: ActiveManifestPointerV2['adaptive'];
      if (candidate.adaptiveEventNames.length > 0) {
        try {
          const measurement = await repository.readExperienceMeasurement({
            workspaceId: manifest.workspaceId,
            documentId: manifest.documentId,
          });
          if (measurement.adaptivePolicy.enabled) {
            const adaptiveVisitorKeyHash = hashAdaptiveVisitorKey({
              workspaceId: manifest.workspaceId,
              environmentId: manifest.environmentId,
              assignmentKey,
            });
            adaptive = {
              policy: measurement.adaptivePolicy,
              evaluatedAt,
              evidence: await repository.readAdaptiveBehaviorEvidence({
                workspaceId: manifest.workspaceId,
                environmentId: manifest.environmentId,
                adaptiveVisitorKeyHash,
                eventNames: candidate.adaptiveEventNames,
                lookbackDays: measurement.adaptivePolicy.lookbackDays,
                evaluatedAt,
              }),
            };
          }
        } catch {
          // Analytics must fail open: delivery continues without adaptive skips.
        }
      }
      return {
        ...manifest,
        ...(assignment
          ? {
              experimentAssignment: {
                experimentId: assignment.experimentId,
                armId: assignment.armId,
                allocationRevision: assignment.allocationRevision,
              },
            }
          : {}),
        ...(adaptive ? { adaptive } : {}),
      };
    }),
  );
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
    !('artifactSchemaVersion' in compiled) ||
    !('rendererContractVersion' in compiled) ||
    !('theme' in compiled)
  ) {
    return null;
  }
  const supportedContract = findSupportedDeliveryContract(
    compiled.artifactSchemaVersion,
    compiled.rendererContractVersion,
    compiled.theme.contractVersion,
  );
  if (
    deployment.state !== 'active' ||
    !supportedContract ||
    !isValidCompilerVersion(compiled.compilerVersion) ||
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
    schemaVersion: PUBLIC_MANIFEST_SCHEMA_VERSION,
    workspaceId: deployment.workspaceId,
    environmentId: deployment.environmentId,
    documentId: deployment.documentId,
    state: 'active',
    generation: deployment.generation,
    publicationId: publication.id,
    activatedAt: publication.publishedAt,
    activation:
      'trigger' in compiled && 'audience' in compiled
        ? {
            trigger: structuredClone(compiled.trigger),
            audience: structuredClone(compiled.audience),
          }
        : undefined,
    artifact: {
      artifactSchemaVersion: supportedContract.artifactSchemaVersion,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      rendererContractVersion: supportedContract.rendererContractVersion,
      themeContractVersion: supportedContract.themeContractVersion,
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
