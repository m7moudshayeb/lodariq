import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringDocumentPayload,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingVerificationResult,
  validate,
  type AuthoringDocumentPayload as AuthoringDocumentPayloadType,
  type AuthoringStagingPublicationResult as AuthoringStagingPublicationResultType,
  type AuthoringStagingReleaseState as AuthoringStagingReleaseStateType,
  type AuthoringStagingVerificationResult as AuthoringStagingVerificationResultType,
  type AuthoringSessionCapability,
} from '@lodariq/schema';
import {
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type ResolvedEnvironmentToken,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  RELEASE_CAPABILITY_FORBIDDEN_MESSAGES,
  type ReleaseCapability,
} from '../../control-plane-access';
import {
  requireAuthoringSessionCapability,
  directSdkSessionHasCapability,
  currentAuthoringMemberHasReleaseCapability,
} from './session-capabilities';
import {
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  requireDirectSdkAuthoringOrigin,
} from './sdk-auth';
import { resolveCurrentAuthoringMembershipRole } from './authoring-membership';

export async function requireHostedAuthoringOperation(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (!requireAuthoringSessionCapability(session, sessionCapability, reply)) return false;
  if (releaseCapability !== 'sample-product-style' && session.environment !== 'staging') {
    void reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging Origin for this release action',
    });
    return false;
  }
  if (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability)) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[releaseCapability],
  });
  return false;
}

export async function requireDirectAuthoringOperation(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (!directSdkSessionHasCapability(session, sessionCapability)) {
    void reply.code(403).send({
      error: 'authoring_capability_forbidden',
      message: 'Authoring session does not grant this document operation',
    });
    return false;
  }
  if (releaseCapability !== 'sample-product-style' && session.environment !== 'staging') {
    void reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging Origin for this release action',
    });
    return false;
  }
  if (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability)) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[releaseCapability],
  });
  return false;
}

export async function authenticateDirectAuthoringOperation(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
): Promise<{ token: ResolvedEnvironmentToken; session: AuthoringSessionRecord } | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  if (
    !(await requireDirectAuthoringOperation(
      repository,
      session,
      sessionCapability,
      releaseCapability,
      reply,
    ))
  ) {
    return null;
  }
  return { token, session };
}

export async function requireAuthoringDocumentWrite(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
      reply,
    )
  ) {
    return false;
  }
  if ((await resolveCurrentAuthoringMembershipRole(repository, session)) !== null) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'An active workspace membership is required to acknowledge a Brand version',
  });
  return false;
}

export async function authenticateDirectAuthoringDocumentWrite(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ token: ResolvedEnvironmentToken; session: AuthoringSessionRecord } | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  if (!(await requireAuthoringDocumentWrite(repository, session, reply))) return null;
  return { token, session };
}

export function validateAuthoringDocumentPayload(value: unknown): AuthoringDocumentPayloadType {
  const result = validate(AuthoringDocumentPayload, value);
  if (!result.valid) {
    throw new Error(
      `Authoring document response failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

export function validateAuthoringStagingReleaseState(
  value: unknown,
): AuthoringStagingReleaseStateType {
  const result = validate(AuthoringStagingReleaseState, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging release state failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

export function validateAuthoringStagingPublicationResult(
  value: unknown,
): AuthoringStagingPublicationResultType {
  const result = validate(AuthoringStagingPublicationResult, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging publication result failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

export function validateAuthoringStagingVerificationResult(
  value: unknown,
): AuthoringStagingVerificationResultType {
  const result = validate(AuthoringStagingVerificationResult, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging verification result failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}
