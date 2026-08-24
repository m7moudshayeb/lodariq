import {
  AUTHORING_SESSION_CAPABILITIES,
  AUTHORING_SESSION_HEADER,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
  resolveEnvironmentGovernanceCapabilities,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type AuthoringSessionCapability,
  type CompiledDocument as CompiledDocumentType,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
} from '@lodariq/schema';
import {
  hashAuthoringSessionToken,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseExactBrowserOrigin } from '../../../sdk-origin';
import {
  GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY,
  type ReleaseCapability,
} from '../../control-plane-access';
import { sendReleaseRecoveryCapabilityDenied } from './release-recovery';
import {
  authoringSessionCapabilitiesForGovernance,
  findEnvironment,
  resolveCurrentAuthoringMembershipRole,
} from './authoring-membership';
import { readHeader, isExactEditorIframeSource } from './sdk-auth';

export function requireVerificationOrigin(
  environment: WorkspaceEnvironment,
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin && environment.originAllowlist.includes(exactOrigin)) return exactOrigin;
  void reply.code(403).send({
    error: 'origin_mismatch',
    message: 'Browser verification must run on the exact allowlisted staging Origin',
  });
  return null;
}

export async function authenticateHostedEditorSession(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null> {
  const rawToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!rawToken) {
    await reply.code(401).send({
      error: 'authoring_session_required',
      message: 'A valid hosted-editor authoring session is required',
    });
    return null;
  }

  const session = await repository.resolveAuthoringSessionByTokenHash(
    hashAuthoringSessionToken(rawToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return null;
  }
  const isActivatedHostedSession =
    session.environment !== 'production' &&
    Boolean(session.installationId) &&
    Boolean(session.activationGrantId) &&
    Boolean(session.customerOrigin) &&
    Array.isArray(session.capabilities) &&
    session.compilerVersion === COMPILER_VERSION &&
    session.rendererContractVersion === RENDERER_CONTRACT_VERSION &&
    session.themeContractVersion === BRAND_THEME_CONTRACT_VERSION &&
    Boolean(session.themeVersionId) &&
    isExactEditorIframeSource(session.iframeSrc);
  if (!isActivatedHostedSession) {
    await reply.code(403).send({
      error: 'authoring_session_scope_forbidden',
      message: 'Authoring session is not valid for the hosted editor',
    });
    return null;
  }
  return {
    ...session,
    capabilities: await authoringSessionCapabilitiesForGovernance(repository, session),
  };
}

export function authoringSessionThemeMatches(
  session: AuthoringSessionRecord,
  theme: BrandThemeSnapshotType,
): boolean {
  return (
    session.themeContractVersion === theme.contractVersion &&
    session.themeVersionId === theme.themeVersionId
  );
}

export function authoringSessionArtifactMatches(
  session: AuthoringSessionRecord,
  compiled: CompiledDocumentType,
): boolean {
  return (
    'theme' in compiled &&
    'rendererContractVersion' in compiled &&
    session.compilerVersion === compiled.compilerVersion &&
    session.rendererContractVersion === compiled.rendererContractVersion &&
    authoringSessionThemeMatches(session, compiled.theme)
  );
}

export function sendAuthoringSessionCompatibilityChanged(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'authoring_session_compatibility_changed',
    message: 'The document compatibility contract changed; reopen Lodariq authoring to continue',
  });
}

export function requireAuthoringSessionCapability(
  session: AuthoringSessionRecord,
  capability: AuthoringSessionCapability,
  reply: FastifyReply,
): boolean {
  if (session.capabilities?.includes(capability)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'Authoring session does not grant this document operation',
  });
  return false;
}

export async function requireHostedStagingPublicationCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
      reply,
    )
  ) {
    return false;
  }
  if (await currentAuthoringMemberCanPublishToStaging(repository, session)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'This workspace membership cannot publish to staging',
  });
  return false;
}

export async function requireHostedReleaseStateCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
      reply,
    )
  ) {
    return false;
  }
  if ((await resolveCurrentAuthoringMembershipRole(repository, session)) !== null) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'An active workspace membership is required to read release state',
  });
  return false;
}

export async function requireDirectSdkStagingPublicationCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (await directSdkSessionCanPublishToStaging(repository, session)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'This authoring session cannot publish to staging',
  });
  return false;
}

export async function requireDirectSdkReleaseStateCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (await directSdkSessionCanReadReleaseState(repository, session)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'This authoring session cannot read document release state',
  });
  return false;
}

export async function requireDirectReleaseRecoveryCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
): Promise<boolean> {
  const sessionCapability =
    request.action === 'rollback'
      ? AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE
      : AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE;
  const releaseCapability: ReleaseCapability =
    request.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
  if (
    session.environment === 'staging' &&
    directSdkSessionHasCapability(session, sessionCapability) &&
    (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability))
  ) {
    return true;
  }
  void sendReleaseRecoveryCapabilityDenied(request, reply);
  return false;
}

export async function requireHostedReleaseRecoveryCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
): Promise<boolean> {
  const sessionCapability =
    request.action === 'rollback'
      ? AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE
      : AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE;
  const releaseCapability: ReleaseCapability =
    request.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
  if (
    session.environment === 'staging' &&
    session.capabilities?.includes(sessionCapability) &&
    (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability))
  ) {
    return true;
  }
  void sendReleaseRecoveryCapabilityDenied(request, reply);
  return false;
}

export async function directSdkSessionCanReadReleaseState(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  if (session.environment === 'production') return false;
  if (!directSdkSessionHasCapability(session, AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE)) {
    return false;
  }
  return (await resolveCurrentAuthoringMembershipRole(repository, session)) !== null;
}

export async function directSdkSessionCanPublishToStaging(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  if (session.environment !== 'staging') return false;
  if (!directSdkSessionHasCapability(session, AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING)) {
    return false;
  }
  return currentAuthoringMemberCanPublishToStaging(repository, session);
}

/**
 * `authoring_sessions.capabilities` is nullable, so a session can carry no
 * capability list at all. That grants nothing — it is not a wildcard.
 */
export function directSdkSessionHasCapability(
  session: AuthoringSessionRecord,
  capability: AuthoringSessionCapability,
): boolean {
  return Array.isArray(session.capabilities) && session.capabilities.includes(capability);
}

export async function currentAuthoringMemberCanPublishToStaging(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  return currentAuthoringMemberHasReleaseCapability(repository, session, 'publish-staging');
}

export async function currentAuthoringMemberHasReleaseCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  capability: ReleaseCapability,
): Promise<boolean> {
  const [role, environment] = await Promise.all([
    resolveCurrentAuthoringMembershipRole(repository, session),
    findEnvironment(repository, session.workspaceId, session.environmentId),
  ]);
  if (!role) return false;
  if (
    !environment ||
    environment.enabled === false ||
    environment.authoringEnabled === false ||
    environment.kind === 'production'
  ) {
    return false;
  }
  const resolved = await repository.resolveGovernanceCapabilityProfile(
    session.workspaceId,
    session.environmentId,
    session.createdByUserId,
  );
  if (!resolved || resolved.membershipRole !== role) return false;
  const grants = resolveEnvironmentGovernanceCapabilities({
    role: resolved.membershipRole,
    environmentCapabilities: environment.governanceCapabilities ?? [],
    profile: resolved.profile,
  });
  return grants.includes(GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY[capability]);
}
