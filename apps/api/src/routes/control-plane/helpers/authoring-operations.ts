import {
  BROWSER_VERIFICATION_CHECK_CODES,
  BrowserVerificationReport,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  PublicationVerification,
  validate,
  type AuthoringBrandThemeAcknowledgementRequest as AuthoringBrandThemeAcknowledgementRequestType,
  type AuthoringBrandThemeAcknowledgementResult as AuthoringBrandThemeAcknowledgementResultType,
  type BrandDriftCheckRequest as BrandDriftCheckRequestType,
  type AuthoringStagingVerificationRequest as AuthoringStagingVerificationRequestType,
  type AuthoringStagingVerificationResult as AuthoringStagingVerificationResultType,
  type ProductStyleProposal as ProductStyleProposalType,
  type PublicationVerification as PublicationVerificationType,
} from '@lodariq/schema';
import {
  ActivePublicationChangedError,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type PersistedPublication,
  type PublicationVerificationRecord,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import { BrandDriftCheckError, checkAuthoringBrandDrift } from '../../../brand-drift';
import {
  BrandThemeAcknowledgementError,
  acknowledgeAuthoringBrandTheme,
} from '../../../brand-theme-acknowledgement';
import {
  applyProductStyleProposal,
  sendWorkspaceThemeMutationError,
} from '../../control-plane-theme-service';
import { validateAuthoringStagingVerificationResult } from './authoring-auth';
import { findEnvironment } from './authoring-membership';
import { compileAndValidate, resolveDocumentTheme } from './document-compilation';

export async function handleAuthoringStyleSource(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  proposal: ProductStyleProposalType,
  reply: FastifyReply,
) {
  const record = await repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const resolvedTheme = await resolveDocumentTheme(repository, record.document);
  const theme = await repository.getWorkspaceTheme(session.workspaceId, resolvedTheme.themeId);
  if (!theme) {
    return reply.code(409).send({
      error: 'workspace_theme_required',
      message: 'Choose or create a workspace Brand theme before applying Product match',
    });
  }
  try {
    const applied = await applyProductStyleProposal({
      repository,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      theme,
      proposal,
      actorUserId: session.createdByUserId,
    });
    return reply.code(201).send(applied);
  } catch (error) {
    return sendWorkspaceThemeMutationError(error, reply);
  }
}

export async function handleAuthoringBrandDriftCheck(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: BrandDriftCheckRequestType,
  reply: FastifyReply,
) {
  try {
    return await checkAuthoringBrandDrift({ repository, session, request });
  } catch (error) {
    if (error instanceof BrandDriftCheckError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    throw error;
  }
}

export async function handleAuthoringBrandThemeAcknowledgement(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: AuthoringBrandThemeAcknowledgementRequestType,
  reply: FastifyReply,
): Promise<AuthoringBrandThemeAcknowledgementResultType | FastifyReply> {
  try {
    return await acknowledgeAuthoringBrandTheme({
      repository,
      session,
      request,
      compile: (document) => compileAndValidate(repository, document),
    });
  } catch (error) {
    if (error instanceof BrandThemeAcknowledgementError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    throw error;
  }
}

export interface ExactPublicationVerificationInput {
  workspaceId: string;
  environmentId: string;
  publicationId: string;
  report: AuthoringStagingVerificationRequestType['report'];
  verifiedOrigin: string;
  actorUserId: string;
}

export async function createExactPublicationVerification(
  repository: ControlPlaneRepository,
  input: ExactPublicationVerificationInput,
  reply: FastifyReply,
) {
  try {
    const verification = await persistExactPublicationVerification(repository, input);
    return reply.code(201).send({ verification });
  } catch (error) {
    if (error instanceof InvalidBrowserVerificationReportError) {
      return reply.code(400).send({ error: 'invalid_report', message: error.message });
    }
    if (error instanceof ActivePublicationChangedError) {
      return reply.code(409).send({
        error: 'publication_not_active',
        message: error.message,
        expectedPublicationId: error.expectedPublicationId,
        actualPublicationId: error.actualPublicationId,
      });
    }
    throw error;
  }
}

export async function createAuthoringPublicationVerification(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: AuthoringStagingVerificationRequestType,
  verifiedOrigin: string,
  reply: FastifyReply,
) {
  if (session.environment !== 'staging') {
    return reply.code(409).send({
      ok: false,
      code: 'origin_mismatch',
      message: 'Verification must run in the configured staging environment',
    } satisfies AuthoringStagingVerificationResultType);
  }
  try {
    const verification = await persistExactPublicationVerification(repository, {
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      publicationId: request.publicationId,
      report: request.report,
      verifiedOrigin,
      actorUserId: session.createdByUserId,
    });
    return reply
      .code(201)
      .send(validateAuthoringStagingVerificationResult({ ok: true, verification }));
  } catch (error) {
    if (error instanceof InvalidBrowserVerificationReportError) {
      return reply.code(400).send(
        validateAuthoringStagingVerificationResult({
          ok: false,
          code: 'invalid_report',
          message: error.message,
        }),
      );
    }
    if (error instanceof ActivePublicationChangedError) {
      return reply.code(409).send(
        validateAuthoringStagingVerificationResult({
          ok: false,
          code: 'publication_not_active',
          message: error.message,
        }),
      );
    }
    throw error;
  }
}

export async function persistExactPublicationVerification(
  repository: ControlPlaneRepository,
  input: ExactPublicationVerificationInput,
): Promise<PublicationVerificationType> {
  assertCompleteBrowserVerificationReport(input.report);
  const [environment, publication] = await Promise.all([
    findEnvironment(repository, input.workspaceId, input.environmentId),
    repository.getPublicationById(input.workspaceId, input.publicationId),
  ]);
  if (!environment || environment.kind !== 'staging') {
    throw new Error('publication verification requires a configured staging environment');
  }
  if (!environment.originAllowlist.includes(input.verifiedOrigin)) {
    throw new Error('verification Origin is not allowlisted for the staging environment');
  }
  if (
    !publication ||
    publication.environmentId !== environment.id ||
    publication.workspaceId !== input.workspaceId
  ) {
    throw new ActivePublicationChangedError(input.publicationId, null);
  }
  const compiled = publication.artifact.compiled;
  if (compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION) {
    throw new Error('browser verification requires a Phase 2 compiled artifact');
  }
  const record = await repository.createPublicationVerification({
    workspaceId: input.workspaceId,
    environmentId: environment.id,
    documentId: publication.documentId,
    expectedPublicationId: publication.id,
    report: input.report,
    verifiedOrigin: input.verifiedOrigin,
    actorUserId: input.actorUserId,
  });
  return toPublicationVerification(record, publication);
}

export class InvalidBrowserVerificationReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBrowserVerificationReportError';
  }
}

export function assertCompleteBrowserVerificationReport(
  report: AuthoringStagingVerificationRequestType['report'],
): void {
  const seen = new Set(report.checks.map((check) => check.code));
  const hasEveryRequiredCheck = BROWSER_VERIFICATION_CHECK_CODES.every((code) => seen.has(code));
  if (
    report.checks.length !== BROWSER_VERIFICATION_CHECK_CODES.length ||
    seen.size !== BROWSER_VERIFICATION_CHECK_CODES.length ||
    !hasEveryRequiredCheck
  ) {
    throw new InvalidBrowserVerificationReportError(
      'Browser verification must report each required check exactly once',
    );
  }

  let expectedStatus: AuthoringStagingVerificationRequestType['report']['status'] = 'passed';
  if (report.checks.some((check) => check.status === 'failed')) expectedStatus = 'failed';
  else if (report.checks.some((check) => check.status === 'warning')) expectedStatus = 'warning';
  if (report.status !== expectedStatus) {
    throw new InvalidBrowserVerificationReportError(
      'Browser verification status must match its individual check results',
    );
  }
}

export function toPublicationVerification(
  record: PublicationVerificationRecord,
  publication: PersistedPublication,
): PublicationVerificationType {
  const reportValidation = validate(BrowserVerificationReport, record.report);
  const compiled = publication.artifact.compiled;
  if (
    !reportValidation.valid ||
    compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION
  ) {
    throw new Error('stored browser verification no longer matches its canonical contract');
  }
  const value = {
    id: record.id,
    workspaceId: record.workspaceId,
    environmentId: record.environmentId,
    documentId: record.documentId,
    publicationId: record.publicationId,
    compiledArtifactId: publication.compiledArtifactId,
    artifactSchemaVersion: compiled.artifactSchemaVersion,
    contentHash: publication.contentHash,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    verifiedOrigin: record.verifiedOrigin,
    verifiedByUserId: record.verifiedByUserId,
    createdAt: record.createdAt,
    result: record.result,
    report: reportValidation.value,
  };
  const validation = validate(PublicationVerification, value);
  if (!validation.valid) {
    throw new Error(
      `Publication verification response failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}
