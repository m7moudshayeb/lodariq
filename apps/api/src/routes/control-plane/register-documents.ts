import { Type } from '@sinclair/typebox';
import {
  LodariqDocument,
  DashboardDocumentsResponse,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
  validate,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
  type ThemeBinding as ThemeBindingType,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import { createObservabilityEvent } from '../../observability';
import {
  authenticate,
  emitObservability,
  releaseRoleHasCapability,
  requireRole,
  type ReleaseCapability,
} from '../control-plane-access';
import {
  ApiErrorResponse,
  DASHBOARD_RELEASE_RECOVERY_PATH,
  DocumentEnvironmentParams,
  DocumentParams,
  SetDocumentThemeBindingBody,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import { DOCUMENT_RELEASE_MIGRATION_REQUIRED_ERROR } from './support';
import {
  handleReleaseRecoveryState,
  handleReleaseRecoveryMutation,
  sendReleaseRecoveryCapabilityDenied,
  createCorrelationId,
  compileAndValidate,
  bindNewDocumentToDefaultTheme,
  listDocumentSummariesWithReadiness,
} from './helpers';

export function registerDocumentRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/documents',
    { schema: { response: { 200: DashboardDocumentsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      return {
        documents: await listDocumentSummariesWithReadiness(options.repository, auth.workspaceId),
      };
    },
  );

  fastify.get(
    '/v1/documents/:documentId',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      return record;
    },
  );

  fastify.post(
    '/v1/documents/:documentId/theme-binding',
    { schema: { params: DocumentParams, body: SetDocumentThemeBindingBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const { binding } = request.body as { binding: ThemeBindingType };
      const [record, theme] = await Promise.all([
        options.repository.getDocument(auth.workspaceId, documentId),
        options.repository.getWorkspaceTheme(auth.workspaceId, binding.themeId),
      ]);
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      }
      const versionId =
        binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId;
      const versions = await options.repository.listWorkspaceThemeVersions(
        auth.workspaceId,
        binding.themeId,
      );
      if (!versions.some((version) => version.id === versionId)) {
        return reply.code(409).send({
          error: 'theme_version_unavailable',
          message: 'Choose an approved Brand theme version',
        });
      }
      if (
        binding.policy === 'workspace-current' &&
        theme.activeVersionId !== binding.acknowledgedThemeVersionId
      ) {
        return reply.code(409).send({
          error: 'theme_version_changed',
          message: 'Reload Brand impact before acknowledging the current approved version',
          activeThemeVersionId: theme.activeVersionId,
        });
      }

      const document = structuredClone(record.document);
      delete document.themeRef;
      document.themeBinding = binding;
      const compiled = await compileAndValidate(options.repository, document);
      const saved = await options.repository.saveDocument({
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        document,
        artifact: compiled,
      });
      return { document: saved.document, latestArtifact: saved.latestArtifact ?? null };
    },
  );

  fastify.get(
    DASHBOARD_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: DocumentEnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId, environmentId } = request.params as {
        documentId: string;
        environmentId: string;
      };
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId,
          documentId,
          actorUserId: auth.userId,
        },
        reply,
      );
    },
  );

  fastify.post(
    DASHBOARD_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: DocumentEnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryResult,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const requiredCapability: ReleaseCapability =
        recoveryRequest.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
      if (!releaseRoleHasCapability(auth.role, requiredCapability)) {
        return sendReleaseRecoveryCapabilityDenied(recoveryRequest, reply);
      }
      const { documentId, environmentId } = request.params as {
        documentId: string;
        environmentId: string;
      };
      return handleReleaseRecoveryMutation(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId,
          documentId,
          actorUserId: auth.userId,
        },
        recoveryRequest,
        reply,
      );
    },
  );

  fastify.post('/v1/documents', { schema: { body: Type.Unknown() } }, async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    if (!requireRole(auth, 'member', reply)) return;
    const canonical = validate(LodariqDocument, request.body);
    if (!canonical.valid) {
      return reply.code(400).send({
        error: 'invalid_document',
        message: 'Request body must be canonical Lodariq block JSON',
        issues: canonical.errors,
      });
    }
    let document = canonical.value;
    if (document.workspaceId !== auth.workspaceId) {
      return reply.code(403).send({
        error: 'workspace_mismatch',
        message: 'Document workspaceId must match the authenticated workspace',
      });
    }
    const existing = await options.repository.getDocument(auth.workspaceId, document.id);
    if (!existing && !document.themeBinding && !document.themeRef) {
      document = await bindNewDocumentToDefaultTheme(options.repository, document);
    }

    const compileCorrelationId = createCorrelationId('compile');
    const compiled = await compileAndValidate(options.repository, document);
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: 'compile.completed',
        correlationId: compileCorrelationId,
        workspaceId: auth.workspaceId,
        documentId: document.id,
        userId: auth.userId,
        attributes: { source: 'control-plane-save', contentHash: compiled.contentHash },
      }),
    );
    const saved = await options.repository.saveDocument({
      workspaceId: auth.workspaceId,
      actorUserId: auth.userId,
      document,
      artifact: compiled,
    });

    return reply.code(201).send(saved);
  });

  fastify.post(
    '/v1/documents/:documentId/compile',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });

      const compileCorrelationId = createCorrelationId('compile');
      const compiled = await compileAndValidate(options.repository, record.document);
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: compileCorrelationId,
          workspaceId: auth.workspaceId,
          documentId,
          userId: auth.userId,
          attributes: { source: 'control-plane-compile', contentHash: compiled.contentHash },
        }),
      );
      const saved = await options.repository.saveDocument({
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        document: record.document,
        artifact: compiled,
      });

      return { artifact: saved.latestArtifact };
    },
  );

  fastify.post(
    '/v1/documents/:documentId/publish',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      return reply.code(409).send({
        error: DOCUMENT_RELEASE_MIGRATION_REQUIRED_ERROR,
        message:
          'Legacy direct publishing is disabled; review an immutable artifact and use the document-scoped release API',
      });
    },
  );
}
