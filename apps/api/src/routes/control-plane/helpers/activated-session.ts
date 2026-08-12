import { canonicalJson, runBasicVisualPreflight, sha256Hex } from '@lodariq/compiler';
import {
  CreateAuthoringDocumentSessionRequest,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  evaluateEnvironmentReleasePolicy,
  validate,
  type CreateAuthoringDocumentSessionRequest as CreateAuthoringDocumentSessionRequestType,
  type WorkspaceEnvironmentPolicyRow,
} from '@lodariq/schema';
import {
  createAuthoringSessionToken,
  hashAuthoringSessionToken,
  hashAuthoringActivationGrant,
  type ControlPlaneRepository,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type VisualCheckRunRecord,
  type WorkspaceEnvironment,
  toWorkspaceEnvironmentPolicy,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type AuthRole } from '../../../auth';
import { createObservabilityEvent } from '../../../observability';
import { parseExactBrowserOrigin } from '../../../sdk-origin';
import { authRoleFromMembership, emitObservability } from '../../control-plane-access';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import { AUTHORING_SESSION_TTL_MS } from '../support';
import { authoringSessionCapabilitiesForRole } from './authoring-membership';
import {
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
  isExpectedEditorIframeSource,
  deploymentOriginsForApiBaseUrl,
} from './sdk-auth';
import { validateAuthoringDocumentSessionResult } from './sdk-bootstrap';
import { createCorrelationId } from './sdk-context';

export async function createActivatedAuthoringDocumentSession(
  options: ControlPlaneRouteOptions,
  request: FastifyRequest,
  reply: FastifyReply,
  activationGrant: string,
) {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  if (!requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor)) return;

  const bodyValidation = validate(CreateAuthoringDocumentSessionRequest, request.body);
  if (!bodyValidation.valid) {
    return reply.code(400).send({
      error: 'invalid_authoring_session_request',
      message: 'Activation-grant sessions require one closed document intent',
    });
  }
  const body: CreateAuthoringDocumentSessionRequestType = bodyValidation.value;
  const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
  if (!exactCustomerOrigin || exactCustomerOrigin !== body.customerOrigin) {
    return reply.code(400).send({
      error: 'invalid_customer_origin',
      message: 'Customer origin must be one canonical HTTP(S) browser origin',
    });
  }
  if (!isExpectedEditorIframeSource(options.authoringIframeSrc, deploymentOrigins.editor)) {
    return reply.code(503).send({
      error: 'authoring_editor_unavailable',
      message: 'The hosted authoring editor is not configured',
    });
  }

  const authoringSessionToken = createAuthoringSessionToken();
  const correlationId = createCorrelationId('authoring');
  const activated = await options.repository.createAuthoringDocumentSessionFromActivation({
    installationId: body.installationId,
    exactOrigin: exactCustomerOrigin,
    activationGrantHash: hashAuthoringActivationGrant(activationGrant),
    pageContext: body.pageContext,
    selectionScope: body.selectionScope,
    documentIntent: body.documentIntent,
    correlationId,
    sessionTokenHash: hashAuthoringSessionToken(authoringSessionToken),
    iframeSrc: options.authoringIframeSrc,
    expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
  });
  if (!activated) {
    return reply.code(403).send({
      error: 'authoring_session_rejected',
      message: 'Activation grant or requested document scope is invalid, expired, or already used',
    });
  }

  const session = activated.session;
  const membership = await options.repository.resolveWorkspaceMembership(
    session.workspaceId,
    session.creatorId,
  );
  const responseCapabilities = authoringSessionCapabilitiesForRole(
    session.capabilities,
    membership ? authRoleFromMembership(membership.role) : 'viewer',
  );
  emitObservability(
    options.observability,
    createObservabilityEvent({
      name: 'authoring.session.created',
      correlationId: session.correlationId,
      workspaceId: session.workspaceId,
      documentId: session.documentId,
      environmentId: session.environmentId,
      userId: session.creatorId,
      attributes: {
        source: 'activation-grant',
        documentCreated: activated.documentCreated,
      },
    }),
  );

  const result = validateAuthoringDocumentSessionResult({
    authoringSessionToken,
    context: {
      sessionId: session.sessionId,
      correlationId: session.correlationId,
      compilerVersion: session.compilerVersion,
      rendererContractVersion: session.rendererContractVersion,
      themeContractVersion: session.themeContractVersion,
      themeVersionId: session.themeVersionId,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      environment: session.environment,
      documentId: session.documentId,
      customerOrigin: session.customerOrigin,
      editorOrigin: deploymentOrigins.editor,
      creatorId: session.creatorId,
      capabilities: responseCapabilities,
      ...(options.authoringTranslationProvider
        ? { translation: { state: 'available' as const } }
        : {}),
      expiresAt: session.expiresAt,
    },
  });
  setCredentialResponseHeaders(reply);
  return reply.code(201).send(result);
}

export async function findEnvironmentPolicyRow(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<WorkspaceEnvironmentPolicyRow | null> {
  return (await findEnvironmentPolicyScope(repository, workspaceId, environmentId))?.policy ?? null;
}

export async function findEnvironmentPolicyScope(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<{ environment: WorkspaceEnvironment; policy: WorkspaceEnvironmentPolicyRow } | null> {
  const environments = await repository.listEnvironments(workspaceId);
  const environment = environments.find((candidate) => candidate.id === environmentId);
  const policy = toWorkspaceEnvironmentPolicy(workspaceId, environments).environments.find(
    (candidate) => candidate.id === environmentId,
  );
  return environment && policy ? { environment, policy } : null;
}

export function requireDirectPublishEnvironmentPolicy(
  environment: WorkspaceEnvironmentPolicyRow,
  actor: { role: AuthRole; userId: string },
  reply: FastifyReply,
): boolean {
  const decision = evaluateEnvironmentReleasePolicy({
    environment,
    action: 'direct-publish',
    actorRole: actor.role,
    actorUserId: actor.userId,
  });
  if (decision.allowed) return true;
  const statusCode = decision.code === 'role_forbidden' ? 403 : 409;
  void reply.code(statusCode).send({
    error: 'environment_policy_forbidden',
    code: decision.code,
    message: decision.message,
  });
  return false;
}

export function sendEnvironmentPolicyDecision(
  decision: ReturnType<typeof evaluateEnvironmentReleasePolicy>,
  reply: FastifyReply,
) {
  const statusCode = decision.code === 'role_forbidden' ? 403 : 409;
  return reply.code(statusCode).send({
    error: 'environment_policy_forbidden',
    code: decision.code,
    message: decision.message,
  });
}

export interface ReviewedReleaseArtifact {
  artifact: PersistedCompiledArtifact;
  document: PersistedDocument['document'];
}

export async function loadReviewedReleaseArtifact(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  artifactId: string,
  contentHash: string,
): Promise<ReviewedReleaseArtifact | null> {
  const artifact = await repository.getCompiledArtifact(workspaceId, documentId, artifactId);
  if (!artifact || artifact.contentHash !== contentHash || !artifact.documentVersionId) {
    return null;
  }
  const version = await repository.getDocumentVersion(
    workspaceId,
    documentId,
    artifact.documentVersionId,
  );
  if (
    !version ||
    version.canonical.id !== documentId ||
    version.canonical.workspaceId !== workspaceId
  ) {
    return null;
  }
  return { artifact, document: version.canonical };
}

export async function findVisualCheckForArtifact(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  environmentId: string,
  artifact: PersistedCompiledArtifact,
): Promise<VisualCheckRunRecord | null> {
  const runs = await repository.listVisualCheckRuns(workspaceId, documentId);
  return (
    runs.find(
      (run) =>
        run.environmentId === environmentId &&
        run.compiledArtifactId === artifact.id &&
        run.contentHash === artifact.contentHash,
    ) ?? null
  );
}

export interface StagingPublicationHashInput {
  workspaceId: string;
  documentId: string;
  environmentId: string;
  artifactId: string;
  contentHash: string;
  expectedGeneration: number;
}

export async function createStagingPublicationRequestHash(
  input: StagingPublicationHashInput,
): Promise<string> {
  const canonicalRequest = canonicalJson({
    action: 'publish',
    artifactId: input.artifactId,
    contentHash: input.contentHash,
    documentId: input.documentId,
    environmentId: input.environmentId,
    expectedGeneration: input.expectedGeneration,
    workspaceId: input.workspaceId,
  });
  return `sha256-${await sha256Hex(canonicalRequest)}`;
}

export interface RunVisualPreflightInput {
  repository: ControlPlaneRepository;
  workspaceId: string;
  documentId: string;
  environmentId: string;
  artifact: PersistedCompiledArtifact;
  actorUserId: string;
}

export async function runAndPersistVisualPreflight(input: RunVisualPreflightInput) {
  const existingRuns = await input.repository.listVisualCheckRuns(
    input.workspaceId,
    input.documentId,
  );
  const existing = existingRuns.find(
    (run) =>
      run.environmentId === input.environmentId &&
      run.compiledArtifactId === input.artifact.id &&
      run.contentHash === input.artifact.contentHash,
  );
  if (existing) return existing;

  const compiled = input.artifact.compiled;
  if (compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION) {
    throw new Error('visual preflight requires the current compiled artifact contract');
  }
  if (!input.artifact.documentVersionId) {
    throw new Error('visual preflight requires an immutable document version');
  }
  const report = await runBasicVisualPreflight(compiled, new Date().toISOString());
  return input.repository.createVisualCheckRun({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    documentVersionId: input.artifact.documentVersionId,
    compiledArtifactId: input.artifact.id,
    themeVersionId: compiled.theme.themeVersionId,
    environmentId: input.environmentId,
    contentHash: input.artifact.contentHash,
    report,
    actorUserId: input.actorUserId,
  });
}
