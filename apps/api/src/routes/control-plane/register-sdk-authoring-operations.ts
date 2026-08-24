import { randomBytes } from 'node:crypto';
import { canonicalJson, sha256Hex } from '@lodariq/compiler';
import {
  AI_CREDIT_METER_VERSION,
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringAssistOperationRequest,
  AuthoringAssistOperationResult,
  AuthoringAuditEventList,
  AuthoringCollaborationEvent,
  AuthoringCollaborationSnapshot,
  AuthoringPresenceHeartbeatBody,
  AnalyticsExportJob,
  AnalyticsExportJobList,
  CreateAnalyticsExportRequest,
  GenerateNarrationRequest,
  GenerateNarrationResult,
  ClaimExperienceStepLockBody,
  CreateExperienceCommentBody,
  CreateExperimentBody,
  CreateDeploymentScheduleBody,
  CancelDeploymentScheduleBody,
  DeliveryTransitionHistoryList,
  DeploymentSchedule,
  DeploymentScheduleList,
  ExperienceAnalytics,
  ExperienceCommentsResponse,
  ExperienceSessionsResponse,
  ExperienceStepLocksResponse,
  ExperienceStepLockClaimResponse,
  ExperimentResponse,
  ReplyExperienceCommentBody,
  ResolveExperienceCommentBody,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  WorkspaceApplicationsResponse,
  WorkspaceCommercialUsage,
  WorkspaceDataCatalog,
  CANONICAL_DOCUMENT_TEMPLATES,
  AuthoringDocumentVersionList,
  CompareAuthoringDocumentVersionsRequest,
  SemanticVersionDiff,
  ChangeAwareCopySuggestion,
  ChangeAwareCopySuggestionList,
  CreateChangeAwareCopySuggestionsRequest,
  ChangeAwareCopySuggestionDecisionRequest,
  CanonicalTemplateInstantiationResult,
  InstantiateCanonicalTemplateRequest,
  instantiateCanonicalTemplate,
  semanticVersionDiff,
  CreateDemoLinkRequest,
  DemoArtifactReview,
  DemoAnalyticsSummary,
  DemoLink,
  DemoLinkAnalyticsEvent,
  PUBLIC_DEMO_ARTIFACT_ROUTE,
  PUBLIC_DEMO_EVENTS_ROUTE,
  PUBLIC_DEMO_PAGE_ROUTE,
  PublicDemoArtifact,
  ReviewDemoArtifactRequest,
  validate,
  type ClaimExperienceStepLockBody as ClaimExperienceStepLockBodyType,
  type CreateAnalyticsExportRequest as CreateAnalyticsExportRequestType,
  type AuthoringAssistOperationRequest as AuthoringAssistOperationRequestType,
  type AuthoringPresenceHeartbeatBody as AuthoringPresenceHeartbeatBodyType,
  type GenerateNarrationRequest as GenerateNarrationRequestType,
  type CreateExperienceCommentBody as CreateExperienceCommentBodyType,
  type CreateExperimentBody as CreateExperimentBodyType,
  type CreateDeploymentScheduleBody as CreateDeploymentScheduleBodyType,
  type CancelDeploymentScheduleBody as CancelDeploymentScheduleBodyType,
  type ReplyExperienceCommentBody as ReplyExperienceCommentBodyType,
  type ResolveExperienceCommentBody as ResolveExperienceCommentBodyType,
  type UpdateExperienceMeasurementBody as UpdateExperienceMeasurementBodyType,
  type UpdateExperimentBody as UpdateExperimentBodyType,
  type InstantiateCanonicalTemplateRequest as InstantiateCanonicalTemplateRequestType,
  type CompareAuthoringDocumentVersionsRequest as CompareAuthoringDocumentVersionsRequestType,
  type CreateChangeAwareCopySuggestionsRequest as CreateChangeAwareCopySuggestionsRequestType,
  type ChangeAwareCopySuggestionDecisionRequest as ChangeAwareCopySuggestionDecisionRequestType,
  type ReviewDemoArtifactRequest as ReviewDemoArtifactRequestType,
  type LodariqDocument,
  ExperienceMeasurementConfig,
} from '@lodariq/schema';
import {
  AccessibilitySweepResult,
  RunAccessibilitySweepRequest,
  type RunAccessibilitySweepRequest as RunAccessibilitySweepRequestType,
} from '@lodariq/schema/accessibility-governance';
import {
  assertCommercialFeature,
  AnalyticsExportBackpressureError,
  CommercialEntitlementError,
  DeploymentScheduleConflictError,
  ExperimentRuleError,
  IdempotencyConflictError,
  toDeploymentSchedule,
  toAnalyticsExportJob,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorResponse } from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  authenticateHostedEditorSession,
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  deploymentOriginsForApiBaseUrl,
  requireAuthoringSessionCapability,
  requireDirectSdkAuthoringOrigin,
  requireExpectedEditorOrigin,
  resolveCurrentAuthoringMembershipRole,
  setCredentialResponseHeaders,
} from './helpers';
import { directSdkSessionHasCapability } from './helpers';
import {
  commentAnchorExists,
  requireDocument,
  requireEnvironment,
  tourStepIds,
} from './register-experience-measurement';
import { AuthoringAssistFailure, creditsForProviderUsage } from '../../authoring-assist';
import { NarrationGenerationFailure } from '../../authoring-narration';
import { authoringAuditCsv, listAuthoringAuditEvents } from '../../authoring-audit';
import { workspaceGovernanceCapabilityAllowed } from '../control-plane-access';
import {
  AuthoringCollaborationHub,
  readAuthoringCollaborationSnapshot,
} from '../../authoring-collaboration';
import { AuthoringDemoLinkError, AuthoringDemoLinks } from '../../authoring-demo-links';
import { renderPublicDemoShell } from '../../public-demo-shell';
import {
  AuthoringCopySuggestionError,
  AuthoringCopySuggestions,
} from '../../authoring-copy-suggestions';
import { bindNewDocumentToDefaultTheme, compileAndValidate } from './helpers/document-compilation';
import { runWorkspaceAccessibilitySweep } from '../../accessibility-governance';

const ASSIST_FEATURE_BY_KIND = {
  rewrite: 'copy-assist',
  'draft-step': 'copy-assist',
  command: 'ask-assist',
  translate: 'auto-translate',
} as const;

/**
 * Operations, for the panel that is open on the customer's page (§4.7).
 *
 * The same surface the dashboard reads, reached with the credential the panel
 * actually holds: an authoring session, not a workspace login. Everything is
 * scoped to the session's own document and environment — no route here takes a
 * document id, so a session cannot read a neighbouring experience.
 */
export function registerSdkAuthoringOperationsRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const collaborationHub = new AuthoringCollaborationHub(options.repository);
  /*
   * No per-process fallback. A random secret works until the process restarts
   * or a second machine answers, and then every shared demo link handed out
   * before that stops verifying — non-deterministically, which is the worst
   * way for a link to die. Unconfigured now means the feature is off and says
   * so, the same way the webhook signing key already works; production is
   * covered separately by `check-runtime-env.mjs`.
   */
  const demoLinks = new AuthoringDemoLinks(
    options.repository,
    options.demoLinkSecret?.trim() ?? null,
  );
  const copySuggestions = new AuthoringCopySuggestions(options.repository);
  const routeSets: readonly OperationsRouteSet[] = [
    {
      basePath: '/v1/sdk/authoring/operations',
      authenticate: (request, reply, mode) =>
        authenticateDirectOperations(options.repository, request, reply, mode),
    },
    {
      basePath: '/v1/authoring/operations',
      authenticate: (request, reply, mode) =>
        authenticateHostedOperations(
          options.repository,
          request,
          reply,
          mode,
          deploymentOrigins.editor,
        ),
    },
  ];

  for (const routeSet of routeSets) {
    registerOperationsRouteSet(
      fastify,
      options,
      routeSet,
      collaborationHub,
      demoLinks,
      copySuggestions,
    );
  }

  registerPublicDemoRoutes(fastify, demoLinks);
}

interface OperationsRouteSet {
  readonly basePath: '/v1/sdk/authoring/operations' | '/v1/authoring/operations';
  readonly authenticate: (
    request: FastifyRequest,
    reply: FastifyReply,
    mode: 'read' | 'write',
  ) => Promise<AuthoringSessionRecord | null>;
}

function registerOperationsRouteSet(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
  routeSet: OperationsRouteSet,
  collaborationHub: AuthoringCollaborationHub,
  demoLinks: AuthoringDemoLinks,
  copySuggestions: AuthoringCopySuggestions,
): void {
  const read = (request: FastifyRequest, reply: FastifyReply) =>
    routeSet.authenticate(request, reply, 'read');
  const write = (request: FastifyRequest, reply: FastifyReply) =>
    routeSet.authenticate(request, reply, 'write');
  const path = (suffix: string): string => `${routeSet.basePath}${suffix}`;

  fastify.get(
    path('/copy-suggestions'),
    { schema: { response: { 200: ChangeAwareCopySuggestionList } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send({
        suggestions: await copySuggestions.list(session.workspaceId, session.documentId),
      });
    },
  );

  fastify.post(
    path('/copy-suggestions'),
    {
      schema: {
        body: CreateChangeAwareCopySuggestionsRequest,
        response: {
          201: ChangeAwareCopySuggestionList,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to create copy suggestions',
        });
      }
      const body = request.body as CreateChangeAwareCopySuggestionsRequestType;
      try {
        return reply.code(201).send({
          suggestions: await copySuggestions.create({
            ...scopeOf(session),
            environmentId: session.environmentId,
            actorUserId: session.createdByUserId,
            ...body,
          }),
        });
      } catch (error) {
        return sendCopySuggestionError(reply, error);
      }
    },
  );

  fastify.post(
    path('/copy-suggestions/decisions'),
    {
      schema: {
        body: ChangeAwareCopySuggestionDecisionRequest,
        response: {
          201: ChangeAwareCopySuggestion,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to review copy suggestions',
        });
      }
      const body = request.body as ChangeAwareCopySuggestionDecisionRequestType;
      try {
        return reply.code(201).send(
          await copySuggestions.decide({
            ...scopeOf(session),
            environmentId: session.environmentId,
            actorUserId: session.createdByUserId,
            ...body,
          }),
        );
      } catch (error) {
        return sendCopySuggestionError(reply, error);
      }
    },
  );

  fastify.get(
    path('/document-versions'),
    {
      schema: {
        response: { 200: AuthoringDocumentVersionList, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      if (!(await options.repository.getDocument(session.workspaceId, session.documentId))) {
        return reply.code(404).send({
          error: 'document_not_found',
          message: 'The authoring document no longer exists',
        });
      }
      const versions = (
        await options.repository.listDocumentVersions(session.workspaceId, session.documentId)
      ).slice(0, 500);
      const summaries = await Promise.all(
        versions.map(async (version) => ({
          id: version.id,
          version: version.version,
          createdAt: version.createdAt,
          createdByUserId: version.createdByUserId,
          hasCompiledArtifact: Boolean(
            await options.repository.getCompiledArtifactForDocumentVersion(
              session.workspaceId,
              session.documentId,
              version.id,
            ),
          ),
        })),
      );
      return reply.send({ versions: summaries });
    },
  );

  fastify.post(
    path('/document-version-diff'),
    {
      schema: {
        body: CompareAuthoringDocumentVersionsRequest,
        response: { 200: SemanticVersionDiff, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const body = request.body as CompareAuthoringDocumentVersionsRequestType;
      const [before, after] = await Promise.all([
        options.repository.getDocumentVersion(
          session.workspaceId,
          session.documentId,
          body.beforeVersionId,
        ),
        options.repository.getDocumentVersion(
          session.workspaceId,
          session.documentId,
          body.afterVersionId,
        ),
      ]);
      if (!before || !after) {
        return reply.code(404).send({
          error: 'document_version_not_found',
          message: 'One or both document versions are unavailable',
        });
      }
      const [beforeArtifact, afterArtifact] = await Promise.all([
        options.repository.getCompiledArtifactForDocumentVersion(
          session.workspaceId,
          session.documentId,
          before.id,
        ),
        options.repository.getCompiledArtifactForDocumentVersion(
          session.workspaceId,
          session.documentId,
          after.id,
        ),
      ]);
      return reply.send(
        semanticVersionDiff({
          beforeId: before.id,
          afterId: after.id,
          beforeCanonical: before.canonical,
          afterCanonical: after.canonical,
          beforeCompiled: beforeArtifact?.compiled,
          afterCompiled: afterArtifact?.compiled,
        }),
      );
    },
  );

  fastify.post(
    path('/templates/instantiate'),
    {
      schema: {
        body: InstantiateCanonicalTemplateRequest,
        response: {
          201: CanonicalTemplateInstantiationResult,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          422: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to create a template draft',
        });
      }
      const body = request.body as InstantiateCanonicalTemplateRequestType;
      const template = CANONICAL_DOCUMENT_TEMPLATES.find(
        (candidate) => candidate.id === body.templateId,
      );
      if (!template) {
        return reply.code(404).send({
          error: 'template_not_found',
          message: 'That template is no longer available',
        });
      }
      const source = await options.repository.getDocument(session.workspaceId, session.documentId);
      if (!source) {
        return reply.code(404).send({
          error: 'document_not_found',
          message: 'The source authoring document no longer exists',
        });
      }
      const identityHash = await sha256Hex(
        canonicalJson({
          workspaceId: session.workspaceId,
          operationId: body.operationId,
          templateId: template.id,
          templateVersion: template.version,
        }),
      );
      const documentId = `doc_template_${identityHash.slice(0, 32)}`;
      const existing = await options.repository.getDocument(session.workspaceId, documentId);
      if (existing) {
        return reply.code(201).send({
          operationId: body.operationId,
          templateId: template.id,
          templateVersion: template.version,
          documentId,
          title: existing.document.title,
          type: existing.document.type,
          targetProposals: template.targetProposals,
          created: false,
        });
      }

      let blockSequence = 0;
      const canonical = instantiateCanonicalTemplate({
        templateId: template.id,
        documentId,
        workspaceId: session.workspaceId,
        environment: source.document.audience.environments[0] ?? 'development',
        schemaVersion: source.document.schemaVersion,
        createBlockId: () => {
          blockSequence += 1;
          return `block_template_${identityHash.slice(0, 20)}_${blockSequence}`;
        },
      });
      try {
        const document = await bindNewDocumentToDefaultTheme(options.repository, canonical);
        const artifact = await compileAndValidate(options.repository, document);
        await options.repository.saveDocument({
          workspaceId: session.workspaceId,
          document,
          actorUserId: session.createdByUserId,
          artifact,
        });
        return reply.code(201).send({
          operationId: body.operationId,
          templateId: template.id,
          templateVersion: template.version,
          documentId,
          title: document.title,
          type: document.type,
          targetProposals: template.targetProposals,
          created: true,
        });
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        // A fixed message: whatever threw is not necessarily the caller's doing,
        // and its text is not something a caller should be shown.
        request.log.error({ err: error }, 'template instantiation failed');
        return reply.code(422).send({
          error: 'template_instantiation_failed',
          message: 'Template draft could not be created',
        });
      }
    },
  );

  fastify.get(
    path('/demo-links'),
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: { links: { type: 'array', items: DemoLink } },
            required: ['links'],
            additionalProperties: false,
          },
        },
      },
    },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const links = await demoLinks.list({
        workspaceId: session.workspaceId,
        environmentId: session.environmentId,
        documentId: session.documentId,
      });
      return reply.send({ links });
    },
  );

  fastify.get(
    path('/demo-links/analytics'),
    { schema: { response: { 200: DemoAnalyticsSummary } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send(
        await demoLinks.analytics({
          workspaceId: session.workspaceId,
          environmentId: session.environmentId,
          documentId: session.documentId,
        }),
      );
    },
  );

  fastify.post(
    path('/demo-links/review'),
    {
      schema: {
        body: ReviewDemoArtifactRequest,
        response: { 200: DemoArtifactReview, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to review a demo artifact',
        });
      }
      try {
        return reply.send(
          await demoLinks.review({
            workspaceId: session.workspaceId,
            environmentId: session.environmentId,
            documentId: session.documentId,
            request: request.body as ReviewDemoArtifactRequestType,
          }),
        );
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );

  fastify.post(
    path('/demo-links'),
    { schema: { body: CreateDemoLinkRequest, response: { 201: DemoLink, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to share a demo',
        });
      }
      try {
        const link = await demoLinks.create({
          workspaceId: session.workspaceId,
          environmentId: session.environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
          request: request.body as CreateDemoLinkRequest,
        });
        return reply.code(201).send(link);
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );

  fastify.delete(
    path('/demo-links/:demoId'),
    { schema: { params: DemoIdParams, response: { 200: DemoLink, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'A workspace member, admin, or owner is required to revoke a demo',
        });
      }
      try {
        const { demoId } = request.params as { demoId: string };
        return reply.send(
          await demoLinks.revoke({
            workspaceId: session.workspaceId,
            environmentId: session.environmentId,
            documentId: session.documentId,
            id: demoId,
          }),
        );
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );

  /*
   * A declared response schema. Every client validates what comes back against
   * `ExperienceMeasurementConfig`, so drift in `adaptivePolicy` or
   * `successEvent` surfaced as a contract error in the browser instead of being
   * caught by the serializer here.
   */
  fastify.get(path('/measurement'), { schema: { response: { 200: ExperienceMeasurementConfig } } }, async (request, reply) => {
    const session = await read(request, reply);
    if (!session) return;
    const measurement = await options.repository.readExperienceMeasurement(scopeOf(session));
    return reply.send(toMeasurementResponse(session.documentId, measurement));
  });

  fastify.patch(
    path('/measurement'),
    {
      schema: {
        body: UpdateExperienceMeasurementBody,
        response: { 200: ExperienceMeasurementConfig },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as UpdateExperienceMeasurementBodyType;
      const measurement = await options.repository.updateExperienceMeasurement({
        ...scopeOf(session),
        ...(body.successEvent === undefined ? {} : { successEvent: body.successEvent }),
        ...(body.adaptivePolicy ? { adaptivePolicy: body.adaptivePolicy } : {}),
        actorUserId: session.createdByUserId,
      });
      return reply.send(toMeasurementResponse(session.documentId, measurement));
    },
  );

  fastify.get(
    path('/analytics'),
    { schema: { response: { 200: ExperienceAnalytics } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      const analytics = await options.repository.readExperienceAnalytics({
        ...scopeOf(session),
        environmentId: session.environmentId,
        stepIdsInOrder: tourStepIds(document),
      });
      return reply.send(analytics);
    },
  );

  fastify.post(
    path('/analytics-exports'),
    {
      schema: {
        body: CreateAnalyticsExportRequest,
        response: {
          202: AnalyticsExportJob,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
          422: ApiErrorResponse,
          429: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as CreateAnalyticsExportRequestType;
      const requestHash = `sha256-${await sha256Hex(
        canonicalJson({
          environmentId: session.environmentId,
          documentId: session.documentId,
          kind: body.kind,
          ...(body.release ? { release: body.release } : {}),
        }),
      )}`;
      try {
        const job = await options.repository.createAnalyticsExportJob({
          ...scopeOf(session),
          environmentId: session.environmentId,
          operationId: body.operationId,
          requestHash,
          kind: body.kind,
          ...(body.release ? { release: body.release } : {}),
          actorUserId: session.createdByUserId,
          requestedAt: new Date().toISOString(),
        });
        return reply.code(202).send(toAnalyticsExportJob(job));
      } catch (error) {
        if (error instanceof AnalyticsExportBackpressureError) {
          reply.header('retry-after', '5');
          return reply.code(429).send({ error: error.code, message: error.message });
        }
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        request.log.error({ err: error }, 'analytics export could not be queued');
        return reply.code(422).send({
          error: 'analytics_export_scope_invalid',
          message: 'Analytics export could not be queued',
        });
      }
    },
  );

  fastify.get(
    path('/analytics-exports'),
    { schema: { response: { 200: AnalyticsExportJobList } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const jobs = await options.repository.listAnalyticsExportJobs({
        ...scopeOf(session),
        environmentId: session.environmentId,
      });
      return reply.send({ jobs: jobs.map(toAnalyticsExportJob) });
    },
  );

  fastify.get(
    path('/analytics-exports/:jobId'),
    {
      schema: {
        params: AnalyticsExportJobIdParams,
        response: { 200: AnalyticsExportJob, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const { jobId } = request.params as { jobId: string };
      const job = await options.repository.getAnalyticsExportJob(session.workspaceId, jobId);
      if (
        !job ||
        job.environmentId !== session.environmentId ||
        job.documentId !== session.documentId
      ) {
        return reply.code(404).send({ error: 'not_found', message: 'Analytics export not found' });
      }
      return reply.send(toAnalyticsExportJob(job));
    },
  );

  fastify.get(
    path('/analytics-exports/:jobId/download'),
    { schema: { params: AnalyticsExportJobIdParams } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const { jobId } = request.params as { jobId: string };
      const job = await options.repository.getAnalyticsExportJob(session.workspaceId, jobId);
      if (
        !job ||
        job.environmentId !== session.environmentId ||
        job.documentId !== session.documentId
      ) {
        return reply.code(404).send({ error: 'not_found', message: 'Analytics export not found' });
      }
      if (job.status === 'expired') {
        return reply
          .code(410)
          .send({ error: 'analytics_export_expired', message: 'Export expired' });
      }
      if (job.status !== 'completed' || !job.contentBase64 || !job.filename || !job.contentType) {
        return reply.code(409).send({
          error: 'analytics_export_not_ready',
          message: 'Analytics export is not ready',
        });
      }
      const downloadedAt = new Date().toISOString();
      const available = await options.repository.markAnalyticsExportDownloaded(
        session.workspaceId,
        job.id,
        session.createdByUserId,
        downloadedAt,
      );
      if (!available) {
        return reply
          .code(410)
          .send({ error: 'analytics_export_expired', message: 'Export expired' });
      }
      reply.header('cache-control', 'private, no-store');
      reply.header('content-type', job.contentType);
      reply.header(
        'content-disposition',
        `attachment; filename="${job.filename.replace(/["\\\r\n]/gu, '-')}"`,
      );
      return reply.send(Buffer.from(job.contentBase64, 'base64'));
    },
  );

  fastify.get(
    path('/sessions'),
    { schema: { response: { 200: ExperienceSessionsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      if (
        !(await requireEnvironment(
          options.repository,
          session.workspaceId,
          session.environmentId,
          reply,
        ))
      ) {
        return;
      }
      const sessions = await options.repository.listExperienceSessions({
        ...scopeOf(session),
        environmentId: session.environmentId,
      });
      return reply.send({ sessions });
    },
  );

  fastify.get(
    path('/experiment'),
    { schema: { response: { 200: ExperimentResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send(
        await options.repository.readExperiment({
          ...scopeOf(session),
          environmentId: session.environmentId,
        }),
      );
    },
  );

  fastify.post(
    path('/experiment'),
    { schema: { body: CreateExperimentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as CreateExperimentBodyType;
      try {
        const experiment = await options.repository.createExperiment({
          ...scopeOf(session),
          varies: body.varies,
          successEventName: body.successEventName,
          arms: body.arms,
          actorUserId: session.createdByUserId,
        });
        return reply.code(201).send({ experiment });
      } catch (error) {
        // Rule violations only; anything else is ours and answers 5xx.
        if (error instanceof ExperimentRuleError) {
          return reply.code(409).send({ error: 'experiment_conflict', message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.patch(
    path('/experiment/:experimentId'),
    { schema: { params: ExperimentIdParams, body: UpdateExperimentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const { experimentId } = request.params as { experimentId: string };
      try {
        const experiment = await options.repository.updateExperiment({
          ...scopeOf(session),
          experimentId,
          ...(request.body as UpdateExperimentBodyType),
        });
        if (!experiment) {
          return reply.code(404).send({ error: 'not_found', message: 'Experiment not found' });
        }
        return reply.send({ experiment });
      } catch (error) {
        if (error instanceof ExperimentRuleError) {
          return reply.code(422).send({ error: 'experiment_invalid', message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.get(
    path('/comments'),
    { schema: { response: { 200: ExperienceCommentsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const comments = await options.repository.listExperienceComments(scopeOf(session));
      return reply.send({ comments });
    },
  );

  fastify.post(
    path('/comments'),
    { schema: { body: CreateExperienceCommentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as CreateExperienceCommentBodyType;
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      if (!commentAnchorExists(document, body.anchor)) {
        return reply.code(422).send({
          error: 'comment_anchor_invalid',
          message: 'Comment anchor is not part of this document',
        });
      }
      const author = await options.repository.getIdentityUser(session.createdByUserId);
      const comment = await options.repository.createExperienceComment({
        ...scopeOf(session),
        anchor: body.anchor,
        body: body.body,
        authorUserId: session.createdByUserId,
        authorName: author?.name ?? 'Teammate',
      });
      collaborationHub.publish(scopeOf(session));
      return reply.code(201).send({ comment });
    },
  );

  fastify.post(
    path('/comments/:commentId/replies'),
    { schema: { params: CommentIdParams, body: ReplyExperienceCommentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const { commentId } = request.params as { commentId: string };
      const body = request.body as ReplyExperienceCommentBodyType;
      const author = await options.repository.getIdentityUser(session.createdByUserId);
      const comment = await options.repository.replyToExperienceComment({
        ...scopeOf(session),
        threadId: commentId,
        body: body.body,
        authorUserId: session.createdByUserId,
        authorName: author?.name ?? 'Teammate',
      });
      if (!comment) {
        return reply.code(404).send({ error: 'not_found', message: 'Comment thread not found' });
      }
      collaborationHub.publish(scopeOf(session));
      return reply.code(201).send({ comment });
    },
  );

  fastify.patch(
    path('/comments/:commentId'),
    { schema: { params: CommentIdParams, body: ResolveExperienceCommentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const { commentId } = request.params as { commentId: string };
      const comment = await options.repository.resolveExperienceComment({
        ...scopeOf(session),
        commentId,
        resolved: (request.body as ResolveExperienceCommentBodyType).resolved,
        actorUserId: session.createdByUserId,
      });
      if (!comment) {
        return reply.code(404).send({ error: 'not_found', message: 'Comment not found' });
      }
      collaborationHub.publish(scopeOf(session));
      return reply.send({ comment });
    },
  );

  fastify.get(
    path('/step-locks'),
    { schema: { response: { 200: ExperienceStepLocksResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const locks = await options.repository.listExperienceStepLocks(scopeOf(session));
      return reply.send({ locks });
    },
  );

  /**
   * A lease, not a lock. The winner comes back either way, so the panel can say
   * who holds the step instead of only that the claim failed.
   */
  fastify.post(
    path('/step-locks'),
    {
      schema: {
        body: ClaimExperienceStepLockBody,
        response: {
          201: ExperienceStepLockClaimResponse,
          403: ApiErrorResponse,
          409: ExperienceStepLockClaimResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as ClaimExperienceStepLockBodyType;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      const canTakeover = role === 'admin' || role === 'owner';
      if (body.takeover && !canTakeover) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Workspace role admin or higher is required to take over a step',
        });
      }
      const holder = await options.repository.getIdentityUser(session.createdByUserId);
      const result = await options.repository.claimExperienceStepLock({
        ...scopeOf(session),
        stepId: body.stepId,
        holderUserId: session.createdByUserId,
        holderName: holder?.name ?? 'Teammate',
        sessionId: session.id,
        ...(body.takeover ? { takeover: true } : {}),
      });
      collaborationHub.publish(scopeOf(session));
      return reply.code(result.acquired ? 201 : 409).send({ ...result, canTakeover });
    },
  );

  fastify.delete(
    path('/step-locks'),
    { schema: { body: ClaimExperienceStepLockBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as ClaimExperienceStepLockBodyType;
      await options.repository.releaseExperienceStepLock({
        ...scopeOf(session),
        stepId: body.stepId,
        holderUserId: session.createdByUserId,
        holderName: '',
        sessionId: session.id,
      });
      collaborationHub.publish(scopeOf(session));
      return reply.code(204).send();
    },
  );

  fastify.put(
    path('/collaboration/presence'),
    {
      schema: {
        body: AuthoringPresenceHeartbeatBody,
        response: {
          200: AuthoringCollaborationSnapshot,
          403: ApiErrorResponse,
          422: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as AuthoringPresenceHeartbeatBodyType;
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      if (!presenceStateExists(document, body)) {
        return reply.code(422).send({
          error: 'presence_state_invalid',
          message: 'Presence step or selection is not part of this document',
        });
      }
      const creator = await options.repository.getIdentityUser(session.createdByUserId);
      try {
        await options.repository.heartbeatAuthoringPresence({
          ...scopeOf(session),
          sessionId: session.id,
          creatorId: session.createdByUserId,
          creatorName: creator?.name ?? 'Teammate',
          stepId: body.stepId,
          selection: body.selection,
          ...(body.documentUpdatedAt ? { documentUpdatedAt: body.documentUpdatedAt } : {}),
        });
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        throw error;
      }
      collaborationHub.publish(scopeOf(session));
      return reply.send(
        await readAuthoringCollaborationSnapshot(options.repository, scopeOf(session), {
          sessionId: session.id,
          creatorId: session.createdByUserId,
        }),
      );
    },
  );

  fastify.delete(path('/collaboration/presence'), async (request, reply) => {
    const session = await write(request, reply);
    if (!session) return;
    await options.repository.leaveAuthoringPresence({
      ...scopeOf(session),
      sessionId: session.id,
    });
    collaborationHub.publish(scopeOf(session));
    return reply.code(204).send();
  });

  fastify.get(path('/collaboration/events'), async (request, reply) => {
    const session = await read(request, reply);
    if (!session) return;
    const entitlements = await options.repository.readWorkspaceEntitlementSnapshot(
      session.workspaceId,
    );
    try {
      assertCommercialFeature(entitlements.entitlements, 'presence');
    } catch (error) {
      if (error instanceof CommercialEntitlementError) {
        return reply.code(403).send({ error: error.code, message: error.message });
      }
      throw error;
    }

    let closed = false;
    let unsubscribe = (): void => undefined;
    let keepalive: ReturnType<typeof setInterval> | null = null;
    const close = (): void => {
      if (closed) return;
      closed = true;
      if (keepalive) clearInterval(keepalive);
      unsubscribe();
      if (!reply.raw.destroyed) reply.raw.end();
    };
    try {
      unsubscribe = collaborationHub.subscribe(scopeOf(session), {
        sessionId: session.id,
        creatorId: session.createdByUserId,
        send: (eventId, snapshot) => {
          if (closed || reply.raw.destroyed) return false;
          const result = validate(AuthoringCollaborationEvent, { eventId, snapshot });
          if (!result.valid) return false;
          return reply.raw.write(
            `id: ${eventId}\nevent: collaboration\ndata: ${JSON.stringify(result.value)}\n\n`,
          );
        },
        replaced: close,
      });
    } catch {
      return reply.code(429).send({
        error: 'collaboration_capacity_reached',
        message: 'Too many active collaboration clients for this document',
      });
    }

    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.hijack();
    reply.raw.writeHead(200, {
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream; charset=utf-8',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('retry: 1000\n\n');
    keepalive = setInterval(() => {
      if (!reply.raw.write(': keepalive\n\n')) close();
    }, 15_000);
    request.raw.once('close', close);
    return reply;
  });

  fastify.get(
    path('/applications'),
    { schema: { response: { 200: WorkspaceApplicationsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const applications = await options.repository.listWorkspaceApplications(session.workspaceId);
      return reply.send({ applications });
    },
  );

  fastify.get(
    path('/commercial-usage'),
    { schema: { response: { 200: WorkspaceCommercialUsage } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send(await options.repository.readWorkspaceCommercialUsage(session.workspaceId));
    },
  );

  fastify.get(
    path('/data-catalog'),
    { schema: { response: { 200: WorkspaceDataCatalog } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send(await options.repository.readWorkspaceDataCatalog(session.workspaceId));
    },
  );

  fastify.get(
    path('/delivery-schedules'),
    { schema: { response: { 200: DeploymentScheduleList } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const environments = await options.repository.listEnvironments(session.workspaceId);
      const schedules = (
        await Promise.all(
          environments.map((environment) =>
            options.repository.listDeploymentSchedules(
              session.workspaceId,
              environment.id,
              session.documentId,
            ),
          ),
        )
      )
        .flat()
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      return reply.send({ schedules: schedules.map(toDeploymentSchedule) });
    },
  );

  fastify.get(
    path('/delivery-schedules/history'),
    { schema: { response: { 200: DeliveryTransitionHistoryList } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const environments = await options.repository.listEnvironments(session.workspaceId);
      const history = (
        await Promise.all(
          environments.map((environment) =>
            options.repository.listDeliveryTransitionHistory(
              session.workspaceId,
              environment.id,
              session.documentId,
            ),
          ),
        )
      )
        .flat()
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
      return reply.send({ history });
    },
  );

  fastify.post(
    path('/delivery-schedules'),
    {
      schema: {
        body: CreateDeploymentScheduleBody,
        response: { 201: DeploymentSchedule, 403: ApiErrorResponse, 409: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.SCHEDULE_RELEASE,
          reply,
        )
      ) {
        return;
      }
      const body = request.body as CreateDeploymentScheduleBodyType;
      const requestHash = `sha256-${await sha256Hex(
        canonicalJson({
          publicationId: body.publicationId,
          environmentId: body.environmentId,
          startAt: body.startAt,
          ...(body.endAt ? { endAt: body.endAt } : {}),
          expectedGeneration: body.expectedGeneration,
        }),
      )}`;
      try {
        const schedule = await options.repository.createDeploymentSchedule({
          workspaceId: session.workspaceId,
          environmentId: body.environmentId,
          documentId: session.documentId,
          publicationId: body.publicationId,
          startAt: body.startAt,
          ...(body.endAt ? { endAt: body.endAt } : {}),
          expectedGeneration: body.expectedGeneration,
          idempotencyKey: body.idempotencyKey,
          requestHash,
          actorUserId: session.createdByUserId,
        });
        return reply.code(201).send(toDeploymentSchedule(schedule));
      } catch (error) {
        if (
          error instanceof DeploymentScheduleConflictError ||
          error instanceof IdempotencyConflictError
        ) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.delete(
    path('/delivery-schedules/:scheduleId'),
    {
      schema: {
        params: ScheduleIdParams,
        body: CancelDeploymentScheduleBody,
        response: {
          200: DeploymentSchedule,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.SCHEDULE_RELEASE,
          reply,
        )
      ) {
        return;
      }
      const { scheduleId } = request.params as { scheduleId: string };
      const body = request.body as CancelDeploymentScheduleBodyType;
      try {
        const environments = await options.repository.listEnvironments(session.workspaceId);
        const schedule = (
          await Promise.all(
            environments.map((environment) =>
              options.repository.listDeploymentSchedules(
                session.workspaceId,
                environment.id,
                session.documentId,
              ),
            ),
          )
        )
          .flat()
          .find((candidate) => candidate.id === scheduleId);
        if (!schedule) {
          return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
        }
        const cancelled = await options.repository.cancelDeploymentSchedule({
          workspaceId: session.workspaceId,
          environmentId: schedule.environmentId,
          documentId: session.documentId,
          scheduleId,
          expectedRevision: body.expectedRevision,
          actorUserId: session.createdByUserId,
        });
        if (!cancelled) {
          return reply.code(404).send({ error: 'not_found', message: 'Schedule not found' });
        }
        return reply.send(toDeploymentSchedule(cancelled));
      } catch (error) {
        if (error instanceof DeploymentScheduleConflictError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.post(
    path('/narration'),
    {
      schema: {
        body: GenerateNarrationRequest,
        response: {
          200: GenerateNarrationResult,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
          422: ApiErrorResponse,
          502: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const provider = options.narrationProvider;
      if (!provider) {
        return reply.code(503).send({
          error: 'narration_unavailable',
          message: 'Narration generation is not configured',
        });
      }
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      const body = request.body as GenerateNarrationRequestType;
      try {
        const entitlement = await options.repository.readWorkspaceEntitlementSnapshot(
          session.workspaceId,
        );
        assertCommercialFeature(entitlement.entitlements, 'narration');
        const result = await options.narrationGenerationCoordinator.request({
          sessionId: session.id,
          operationId: body.operationId,
          stepId: body.stepId,
          document,
          provider,
          commit: async (generated, audio) => {
            await options.repository.debitAiCredits({
              workspaceId: session.workspaceId,
              operationId: `aiop_${await sha256Hex(`narration:${body.operationId}`)}`,
              provider: generated.usage.provider,
              meterVersion: AI_CREDIT_METER_VERSION,
              usageUnit: generated.usage.usageUnit,
              inputUnits: generated.usage.inputUnits,
              outputUnits: generated.usage.outputUnits,
              providerCostMicros: generated.usage.providerCostMicros,
              credits: creditsForProviderUsage(generated.usage),
              occurredAt: new Date().toISOString(),
            });
            const extension = { 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[
              generated.contentType
            ];
            const asset = await options.repository.createAuthoringMediaAsset({
              workspaceId: session.workspaceId,
              actorUserId: session.createdByUserId,
              kind: 'audio',
              filename: `narration-${body.stepId}.${extension}`,
              contentType: generated.contentType,
              contentBase64: Buffer.from(generated.bytes).toString('base64'),
              byteLength: generated.bytes.byteLength,
              contentHash: audio.contentHash,
              savedToLibrary: false,
            });
            return { audio: { ...audio, assetId: asset.id }, asset, usage: generated.usage };
          },
        });
        return reply.send({
          operationId: body.operationId,
          replayed: result.replayed,
          audio: result.audio,
          asset: result.asset,
        });
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        if (!(error instanceof NarrationGenerationFailure)) throw error;
        if (error.code === 'step_not_found') {
          return reply
            .code(404)
            .send({ error: error.code, message: 'Narration step was not found' });
        }
        if (error.code === 'idempotency_conflict') {
          return reply.code(409).send({
            error: error.code,
            message: 'The operation id belongs to another narration request',
          });
        }
        if (
          error.code === 'narration_missing' ||
          error.code === 'voice_unavailable' ||
          error.code === 'voice_consent_required'
        ) {
          return reply.code(422).send({ error: error.code, message: error.message });
        }
        return reply.code(502).send({
          error: error.code,
          message: 'The narration provider returned invalid audio',
        });
      }
    },
  );

  fastify.post(
    path('/assist'),
    {
      schema: {
        body: AuthoringAssistOperationRequest,
        response: {
          200: AuthoringAssistOperationResult,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
          422: ApiErrorResponse,
          429: ApiErrorResponse,
          502: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const provider = options.authoringAssistProvider;
      if (!provider) {
        return reply.code(503).send({
          error: 'assist_unavailable',
          message: 'Ask Lodariq is not configured',
        });
      }
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      const body = request.body as AuthoringAssistOperationRequestType;
      try {
        const entitlement = await options.repository.readWorkspaceEntitlementSnapshot(
          session.workspaceId,
        );
        assertCommercialFeature(
          entitlement.entitlements,
          ASSIST_FEATURE_BY_KIND[body.request.kind],
        );
        if (body.request.scope === 'batch') {
          assertCommercialFeature(entitlement.entitlements, 'batch-operations');
        }
        const result = await options.authoringAssistCoordinator.request({
          sessionId: session.id,
          operationId: body.operationId,
          document,
          request: body.request,
          provider,
        });
        await options.repository.debitAiCredits({
          workspaceId: session.workspaceId,
          operationId: body.operationId,
          provider: result.usage.provider,
          meterVersion: AI_CREDIT_METER_VERSION,
          usageUnit: result.usage.usageUnit,
          inputUnits: result.usage.inputUnits,
          outputUnits: result.usage.outputUnits,
          providerCostMicros: result.usage.providerCostMicros,
          credits: creditsForProviderUsage(result.usage),
          occurredAt: new Date().toISOString(),
        });
        return reply.send({
          operationId: body.operationId,
          proposal: result.proposal,
          replayed: result.replayed,
        });
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        if (!(error instanceof AuthoringAssistFailure)) throw error;
        if (error.code === 'rate_limited') {
          reply.header('retry-after', String(error.retryAfterSeconds ?? 1));
          return reply.code(429).send({
            error: error.code,
            message: 'Ask Lodariq is receiving too many requests; try again shortly',
          });
        }
        if (error.code === 'idempotency_conflict') {
          return reply.code(409).send({
            error: error.code,
            message: 'The operation id belongs to another Ask Lodariq request',
          });
        }
        if (error.code === 'invalid_request_scope') {
          return reply.code(422).send({
            error: error.code,
            message: 'Ask Lodariq must stay inside existing selected steps',
          });
        }
        return reply.code(502).send({
          error: error.code,
          message: 'Ask Lodariq returned an invalid bounded proposal',
        });
      }
    },
  );

  fastify.get(
    path('/audit-events'),
    { schema: { response: { 200: AuthoringAuditEventList, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const entitlements = await options.repository.readWorkspaceEntitlementSnapshot(
        session.workspaceId,
      );
      try {
        assertCommercialFeature(entitlements.entitlements, 'audit-log');
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        throw error;
      }
      if (
        !(await workspaceGovernanceCapabilityAllowed(
          options.repository,
          session.workspaceId,
          session.createdByUserId,
          'audit:export',
        ))
      ) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'The audit export workspace capability is required',
        });
      }
      const events = await listAuthoringAuditEvents(
        options.repository,
        session.workspaceId,
        session.createdByUserId,
      );
      if (!events) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Current workspace membership is required to read the audit log',
        });
      }
      return reply.send({ events });
    },
  );

  fastify.post(
    path('/accessibility-sweeps'),
    {
      schema: {
        body: RunAccessibilitySweepRequest,
        response: { 201: AccessibilitySweepResult, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const role = await resolveCurrentAuthoringMembershipRole(options.repository, session);
      if (!role || role === 'viewer') {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Accessibility sweeps require a member, admin, or owner role',
        });
      }
      const body = request.body as RunAccessibilitySweepRequestType;
      return reply.code(201).send(
        await runWorkspaceAccessibilitySweep({
          repository: options.repository,
          workspaceId: session.workspaceId,
          actorUserId: session.createdByUserId,
          operationId: body.operationId,
        }),
      );
    },
  );

  fastify.get(path('/audit-events.csv'), async (request, reply) => {
    const session = await read(request, reply);
    if (!session) return;
    const entitlements = await options.repository.readWorkspaceEntitlementSnapshot(
      session.workspaceId,
    );
    try {
      assertCommercialFeature(entitlements.entitlements, 'audit-log');
    } catch (error) {
      if (error instanceof CommercialEntitlementError) {
        return reply.code(403).send({ error: error.code, message: error.message });
      }
      throw error;
    }
    if (
      !(await workspaceGovernanceCapabilityAllowed(
        options.repository,
        session.workspaceId,
        session.createdByUserId,
        'audit:export',
      ))
    ) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'The audit export workspace capability is required',
      });
    }
    const events = await listAuthoringAuditEvents(
      options.repository,
      session.workspaceId,
      session.createdByUserId,
    );
    if (!events) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'Current workspace membership is required to export the audit log',
      });
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="lodariq-audit-log.csv"');
    return reply.send(authoringAuditCsv(events));
  });
}

const ExperimentIdParams = {
  type: 'object',
  required: ['experimentId'],
  additionalProperties: false,
  properties: { experimentId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const CommentIdParams = {
  type: 'object',
  required: ['commentId'],
  additionalProperties: false,
  properties: { commentId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const ScheduleIdParams = {
  type: 'object',
  required: ['scheduleId'],
  additionalProperties: false,
  properties: { scheduleId: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

const AnalyticsExportJobIdParams = {
  type: 'object',
  required: ['jobId'],
  additionalProperties: false,
  properties: {
    jobId: { type: 'string', pattern: '^anx_[A-Za-z0-9_-]{20,}$', maxLength: 160 },
  },
} as const;

const DemoIdParams = {
  type: 'object',
  required: ['demoId'],
  additionalProperties: false,
  properties: {
    demoId: { type: 'string', pattern: '^demo_[A-Za-z0-9_-]{20,}$', maxLength: 160 },
  },
} as const;

function registerPublicDemoRoutes(fastify: FastifyInstance, demoLinks: AuthoringDemoLinks): void {
  fastify.get(
    PUBLIC_DEMO_PAGE_ROUTE,
    { schema: { params: DemoIdParams } },
    async (request, reply) => {
      try {
        const result = await demoLinks.publicShell({
          demoId: (request.params as { demoId: string }).demoId,
          requestOrigin: request.headers.origin,
          requestHost: request.headers.host,
          cookieHeader: request.headers.cookie,
        });
        if (result.setCookie) reply.header('set-cookie', result.setCookie);
        const shell = renderPublicDemoShell(randomBytes(18).toString('base64url'));
        reply.header('content-security-policy', shell.contentSecurityPolicy);
        reply.header('cache-control', 'private, no-store');
        reply.header('x-content-type-options', 'nosniff');
        reply.header('referrer-policy', 'no-referrer');
        reply.header('x-frame-options', 'DENY');
        return reply.type('text/html; charset=utf-8').send(shell.html);
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );

  fastify.get(
    PUBLIC_DEMO_ARTIFACT_ROUTE,
    { schema: { params: DemoIdParams, response: { 200: PublicDemoArtifact } } },
    async (request, reply) => {
      try {
        const result = await demoLinks.publicArtifact({
          demoId: (request.params as { demoId: string }).demoId,
          requestOrigin: request.headers.origin,
          requestHost: request.headers.host,
          cookieHeader: request.headers.cookie,
        });
        if (result.setCookie) reply.header('set-cookie', result.setCookie);
        reply.header('cache-control', 'private, no-store');
        reply.header('x-content-type-options', 'nosniff');
        return reply.send(result.artifact);
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );

  fastify.post(
    PUBLIC_DEMO_EVENTS_ROUTE,
    { schema: { params: DemoIdParams, body: DemoLinkAnalyticsEvent } },
    async (request, reply) => {
      try {
        await demoLinks.recordPublicEvent({
          demoId: (request.params as { demoId: string }).demoId,
          event: request.body as DemoLinkAnalyticsEvent,
          requestOrigin: request.headers.origin,
          requestHost: request.headers.host,
          cookieHeader: request.headers.cookie,
        });
        return reply.code(204).send();
      } catch (error) {
        return sendDemoLinkError(reply, error);
      }
    },
  );
}

function sendDemoLinkError(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof AuthoringDemoLinkError)) throw error;
  const status = demoLinkErrorStatus(error.code);
  return reply.code(status).send({ error: error.code, message: error.message });
}

function demoLinkErrorStatus(code: AuthoringDemoLinkError['code']): number {
  if (code === 'demo_event_rate_limited') return 429;
  if (code === 'demo_session_invalid') return 401;
  if (code === 'demo_origin_invalid') return 403;
  if (code === 'demo_operation_conflict' || code === 'demo_review_stale') return 409;
  if (code === 'demo_link_expired') return 410;
  if (code === 'demo_link_revoked' || code === 'demo_link_not_found') return 404;
  return 422;
}

function sendCopySuggestionError(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof AuthoringCopySuggestionError)) throw error;
  return reply.code(404).send({ error: error.code, message: error.message });
}

function scopeOf(session: AuthoringSessionRecord): {
  workspaceId: string;
  documentId: string;
} {
  return { workspaceId: session.workspaceId, documentId: session.documentId };
}

function presenceStateExists(
  document: LodariqDocument,
  state: AuthoringPresenceHeartbeatBodyType,
): boolean {
  if (state.stepId && !tourStepIds(document).includes(state.stepId)) return false;
  const selection = state.selection;
  if (!selection) return true;
  if (selection.type === 'target') {
    return document.targets.some((target) => target.id === selection.targetId);
  }
  return document.blocks.some((block) => blockTreeContains(block, selection.blockId));
}

function blockTreeContains(block: LodariqDocument['blocks'][number], blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => blockTreeContains(child, blockId));
}

function toMeasurementResponse(
  documentId: string,
  measurement: { successEvent?: unknown; adaptivePolicy: unknown },
): Record<string, unknown> {
  return {
    documentId,
    ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
    adaptivePolicy: measurement.adaptivePolicy,
  };
}

/**
 * Operations is document configuration, not a release action, so it asks only
 * for the document capability the session already carries. Writing needs
 * `WRITE_DOCUMENT`: declaring a success event or stopping a test changes what
 * the experience means, even though it never touches the artifact.
 */
async function authenticateDirectOperations(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: 'read' | 'write',
): Promise<AuthoringSessionRecord | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  const capability =
    mode === 'write'
      ? AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT
      : AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT;
  if (!directSdkSessionHasCapability(session, capability)) {
    await reply.code(403).send({
      error: 'authoring_capability_forbidden',
      message: 'Authoring session does not grant this Operations request',
    });
    return null;
  }
  return session;
}

async function authenticateHostedOperations(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: 'read' | 'write',
  editorOrigin: string,
): Promise<AuthoringSessionRecord | null> {
  if (!requireExpectedEditorOrigin(request, reply, editorOrigin)) return null;
  setCredentialResponseHeaders(reply);
  const session = await authenticateHostedEditorSession(repository, request, reply);
  if (!session) return null;
  const capability =
    mode === 'write'
      ? AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT
      : AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT;
  return requireAuthoringSessionCapability(session, capability, reply) ? session : null;
}
