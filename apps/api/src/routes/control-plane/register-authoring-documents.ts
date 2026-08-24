import {
  AI_CREDIT_METER_VERSION,
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringTranslationRequest,
  AuthoringTranslationResult,
  LodariqDocument,
  ReleaseRecoveryStateResponse,
  documentLocalizationIssues,
  documentLocaleCount,
  canonicalContentLocale,
  resolveDocumentLocalization,
  validate,
  type AuthoringTranslationRequest as AuthoringTranslationRequestType,
} from '@lodariq/schema';
import { Type } from '@sinclair/typebox';
import {
  assertCommercialFeature,
  CommercialEntitlementError,
  DocumentSaveConflictError,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createObservabilityEvent } from '../../observability';
import {
  AuthoringTranslationFailure,
  translateMissingAuthoringCopy,
} from '../../authoring-translation';
import { creditsForProviderUsage } from '../../authoring-assist';
import { emitObservability } from '../control-plane-access';
import {
  ApiErrorResponse,
  EnvironmentParams,
  HOSTED_RELEASE_RECOVERY_PATH,
  HOSTED_AUTHORING_TRANSLATION_PATH,
  SdkAuthoringDocumentBody,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  deploymentOriginsForApiBaseUrl,
  handleReleaseRecoveryState,
  authoringRecoveryPermissionIntersection,
  handleAuthoringReleaseState,
  authenticateHostedEditorSession,
  authoringSessionThemeMatches,
  authoringSessionArtifactMatches,
  sendAuthoringSessionCompatibilityChanged,
  requireAuthoringSessionCapability,
  requireHostedReleaseStateCapability,
  validateAuthoringDocumentPayload,
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
  compileAndValidate,
  resolveDocumentTheme,
  findAuthoringStepLockConflict,
} from './helpers';

export function registerAuthoringDocumentRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor);

  fastify.get('/v1/authoring/document', async (request, reply) => {
    if (!requireEditorOrigin(request, reply)) return;
    setCredentialResponseHeaders(reply);
    const session = await authenticateHostedEditorSession(options.repository, request, reply);
    if (!session) return;
    if (
      !requireAuthoringSessionCapability(
        session,
        AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
        reply,
      )
    ) {
      return;
    }

    const record = await options.repository.getDocument(session.workspaceId, session.documentId);
    if (!record) {
      return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
    }
    const theme = await resolveDocumentTheme(options.repository, record.document);
    if (!authoringSessionThemeMatches(session, theme)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    return validateAuthoringDocumentPayload({
      document: record.document,
      documentUpdatedAt: record.updatedAt,
      theme,
    });
  });

  fastify.post(
    '/v1/authoring/document',
    { schema: { body: SdkAuthoringDocumentBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          reply,
        )
      ) {
        return;
      }

      const body = request.body as {
        document: unknown;
        expectedDocumentUpdatedAt?: string;
      };
      const payload = validate(LodariqDocument, body.document);
      if (!payload.valid) {
        return reply.code(400).send({
          error: 'invalid_document',
          message: 'Request body must contain canonical Lodariq block JSON',
          issues: payload.errors,
        });
      }
      const document = payload.value;
      const localizationIssues = documentLocalizationIssues(document);
      if (localizationIssues.length > 0) {
        return reply.code(400).send({
          error: 'invalid_document_localization',
          message: 'Experience language variants or fallback rules are invalid',
          issues: localizationIssues,
        });
      }
      if (document.workspaceId !== session.workspaceId || document.id !== session.documentId) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Authoring session does not match the document being saved',
        });
      }

      const current = await options.repository.getDocument(session.workspaceId, session.documentId);
      if (!current) {
        return reply
          .code(404)
          .send({ error: 'not_found', message: 'Authoring document not found' });
      }
      const lockConflict = await findAuthoringStepLockConflict(
        options.repository,
        current.document,
        document,
        session.id,
      );
      if (lockConflict) {
        return reply.code(409).send({
          error: 'step_lock_conflict',
          message: `${lockConflict.holderName} is editing this step`,
          stepId: lockConflict.stepId,
          holderName: lockConflict.holderName,
          expiresAt: lockConflict.expiresAt,
        });
      }

      const compiled = await compileAndValidate(options.repository, document);
      if (!authoringSessionArtifactMatches(session, compiled)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: session.correlationId,
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          environmentId: session.environmentId,
          userId: session.createdByUserId,
          attributes: { source: 'hosted-editor-save', contentHash: compiled.contentHash },
        }),
      );
      let saved;
      try {
        saved = await options.repository.saveDocument({
          workspaceId: session.workspaceId,
          actorUserId: session.createdByUserId,
          document,
          artifact: compiled,
          ...(body.expectedDocumentUpdatedAt
            ? { expectedUpdatedAt: body.expectedDocumentUpdatedAt }
            : {}),
        });
      } catch (error) {
        if (error instanceof DocumentSaveConflictError) {
          return reply.code(409).send({
            error: 'document_conflict',
            message: 'The draft changed in another authoring session; reload before saving',
            currentDocumentUpdatedAt: error.currentUpdatedAt,
          });
        }
        throw error;
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.save.completed',
          correlationId: session.correlationId,
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          environmentId: session.environmentId,
          userId: session.createdByUserId,
          attributes: {
            source: 'hosted-editor',
            contentHash: saved.latestArtifact?.contentHash,
          },
        }),
      );
      return validateAuthoringDocumentPayload({
        document: saved.document,
        documentUpdatedAt: saved.updatedAt,
        theme: await resolveDocumentTheme(options.repository, saved.document),
      });
    },
  );

  fastify.post(
    HOSTED_AUTHORING_TRANSLATION_PATH,
    {
      schema: {
        body: AuthoringTranslationRequest,
        response: {
          200: AuthoringTranslationResult,
          400: Type.Unknown(),
          403: Type.Unknown(),
          413: Type.Unknown(),
          502: Type.Unknown(),
          503: Type.Unknown(),
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          reply,
        )
      ) {
        return;
      }
      const provider = options.authoringTranslationProvider;
      if (!provider) {
        return reply.code(503).send({
          error: 'translation_unavailable',
          message: 'Automatic translation is not configured',
        });
      }

      const body = request.body as AuthoringTranslationRequestType;
      const document = body.document;
      const localizationIssues = documentLocalizationIssues(document);
      if (localizationIssues.length > 0) {
        return reply.code(400).send({
          error: 'invalid_document_localization',
          message: 'Experience language variants or fallback rules are invalid',
          issues: localizationIssues,
        });
      }
      if (document.workspaceId !== session.workspaceId || document.id !== session.documentId) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Authoring session does not match the document being translated',
        });
      }
      const theme = await resolveDocumentTheme(options.repository, document);
      if (!authoringSessionThemeMatches(session, theme)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }

      try {
        const entitlement = await options.repository.readWorkspaceEntitlementSnapshot(
          session.workspaceId,
        );
        assertCommercialFeature(entitlement.entitlements, 'auto-translate');
        const targetLocale = canonicalContentLocale(body.targetLocale);
        const localization = resolveDocumentLocalization(document);
        const addsLocale = !localization.variants.some(
          (variant) => canonicalContentLocale(variant.locale) === targetLocale,
        );
        const localeLimit = entitlement.entitlements.locales;
        const localeCount = documentLocaleCount(document);
        if (addsLocale && localeLimit !== null && localeCount + 1 > localeLimit) {
          throw new CommercialEntitlementError('locales', localeCount, localeLimit);
        }
        const result = await translateMissingAuthoringCopy(document, body.targetLocale, provider);
        if (result.providerUsage) {
          await options.repository.debitAiCredits({
            workspaceId: session.workspaceId,
            operationId: body.operationId,
            provider: result.providerUsage.provider,
            meterVersion: AI_CREDIT_METER_VERSION,
            usageUnit: result.providerUsage.usageUnit,
            inputUnits: result.providerUsage.inputUnits,
            outputUnits: result.providerUsage.outputUnits,
            providerCostMicros: result.providerUsage.providerCostMicros,
            credits: creditsForProviderUsage(result.providerUsage),
            occurredAt: new Date().toISOString(),
          });
        }
        emitObservability(
          options.observability,
          createObservabilityEvent({
            name: 'authoring.translation.completed',
            correlationId: session.correlationId,
            workspaceId: session.workspaceId,
            documentId: session.documentId,
            environmentId: session.environmentId,
            userId: session.createdByUserId,
            attributes: {
              sourceLocale: result.sourceLocale,
              targetLocale: result.targetLocale,
              translatedBlockCount: result.translatedBlockCount,
              translatedCharacterCount: result.translatedCharacterCount,
            },
          }),
        );
        const { providerUsage: _providerUsage, ...response } = result;
        return response;
      } catch (error) {
        if (error instanceof CommercialEntitlementError) {
          return reply.code(403).send({ error: error.code, message: error.message });
        }
        if (!(error instanceof AuthoringTranslationFailure)) throw error;
        const clientErrors = new Set([
          'unsupported_locale',
          'default_locale_target',
          'request_too_large',
        ]);
        if (clientErrors.has(error.code)) {
          const status = error.code === 'request_too_large' ? 413 : 400;
          return reply.code(status).send({
            error: error.code,
            message:
              error.code === 'request_too_large'
                ? 'Automatic translation is limited to 50,000 source characters per request'
                : 'The requested experience language cannot be translated',
          });
        }
        return reply.code(502).send({
          error: 'translation_failed',
          message: 'The translation provider could not complete this request',
        });
      }
    },
  );

  fastify.get('/v1/authoring/release-state', async (request, reply) => {
    if (!requireEditorOrigin(request, reply)) return;
    setCredentialResponseHeaders(reply);
    const session = await authenticateHostedEditorSession(options.repository, request, reply);
    if (!session) return;
    if (!(await requireHostedReleaseStateCapability(options.repository, session, reply))) return;
    return handleAuthoringReleaseState(options, session, reply, 'hosted-editor');
  });

  fastify.get(
    HOSTED_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireHostedReleaseStateCapability(options.repository, session, reply))) return;
      const { environmentId } = request.params as { environmentId: string };
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        reply,
        authoringRecoveryPermissionIntersection(session),
      );
    },
  );
}
