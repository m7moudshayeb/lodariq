import { verifyAuthoringPkceS256Challenge } from '../tokens';
import { normalizeExactOrigin } from '../domains/environments';
import {
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
  type AuthoringActivationGrantRecord,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringCodeExchangeRecord,
  type PublicSdkBootstrapGrantRecord,
  type ResolvedAuthoringAuthorizationForUser,
} from '../domains/sdk-authoring';
import {
  type ApproveAuthoringAuthorizationRequestInput,
  type ConsumeAuthoringActivationGrantInput,
  type CreateAuthoringAuthorizationRequestInput,
  type ExchangeAuthoringAuthorizationCodeInput,
} from '../domains/documents';
import {
  createOpaqueRecordId,
  hasValidBoundedFutureTtl,
  hasValidFutureTtl,
  isAuthoringPkceChallenge,
  isSha256Hash,
  isValidAuthoringCapabilities,
  isValidAuthoringDocumentIntent,
} from '../domains/authoring-policy';
import { clone, hasAuthoringWorkspaceRole } from '../domains/in-memory-helpers';
import { InMemoryRepositorySdk } from './sdk';

export class InMemoryRepositoryAuthoringAuthorization extends InMemoryRepositorySdk {
  async createAuthoringAuthorizationRequest(
    input: CreateAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isAuthoringPkceChallenge(input.codeChallenge) ||
      !isValidAuthoringCapabilities(input.requestedCapabilities) ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS)
    ) {
      return null;
    }

    const matchingGrants = [...this.publicSdkBootstrapGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.bootstrapGrantHash &&
        !candidate.consumedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (matchingGrants.length !== 1) return null;
    const [bootstrapGrant] = matchingGrants;
    if (!bootstrapGrant) return null;

    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== bootstrapGrant.workspaceId ||
      scope.environment.id !== bootstrapGrant.environmentId
    ) {
      return null;
    }
    if (!this.isResolvedDocumentIntent(scope.installation.workspaceId, input.documentIntent)) {
      return null;
    }

    const now = new Date().toISOString();
    const consumedBootstrapGrant: PublicSdkBootstrapGrantRecord = {
      ...bootstrapGrant,
      consumedAt: now,
    };
    const request: AuthoringAuthorizationRequestRecord = {
      requestId: createOpaqueRecordId('authreq'),
      bootstrapGrantId: bootstrapGrant.id,
      installationId: input.installationId,
      workspaceId: scope.installation.workspaceId,
      environmentId: scope.environment.id,
      environment: scope.environment.kind,
      exactOrigin,
      stateHash: input.stateHash,
      bootstrapGrantHash: input.bootstrapGrantHash,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: 'S256',
      requestedCapabilities: [...input.requestedCapabilities],
      ...(input.documentIntent ? { documentIntent: clone(input.documentIntent) } : {}),
      creatorId: null,
      authorizationCodeHash: null,
      createdAt: now,
      expiresAt: input.expiresAt,
      approvedAt: null,
      authorizationCodeExpiresAt: null,
      authorizationCodeUsedAt: null,
    };

    // Both writes are synchronous and adjacent so two concurrent callers cannot
    // consume the same in-memory bootstrap grant.
    this.publicSdkBootstrapGrants.set(consumedBootstrapGrant.id, consumedBootstrapGrant);
    this.authoringAuthorizationRequests.set(request.requestId, request);
    return clone(request);
  }

  async getAuthoringAuthorizationRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    const request = this.authoringAuthorizationRequests.get(requestId);
    if (
      !request ||
      request.workspaceId !== workspaceId ||
      Date.parse(request.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(request.installationId, request.exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }
    return clone(request);
  }

  async getAuthoringAuthorizationRequestForUser(
    userId: string,
    requestId: string,
  ): Promise<ResolvedAuthoringAuthorizationForUser | null> {
    const request = this.authoringAuthorizationRequests.get(requestId);
    if (!request) return null;
    const membership = this.workspaceMemberships.get(this.key(request.workspaceId, userId));
    if (!membership || !hasAuthoringWorkspaceRole(membership.role)) return null;
    const validated = await this.getAuthoringAuthorizationRequest(request.workspaceId, requestId);
    return validated ? { request: validated, membership: clone(membership) } : null;
  }

  async approveAuthoringAuthorizationRequest(
    input: ApproveAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    if (
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !hasValidBoundedFutureTtl(
        input.authorizationCodeExpiresAt,
        AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
        AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
      )
    ) {
      return null;
    }
    const request = this.authoringAuthorizationRequests.get(input.requestId);
    if (
      !request ||
      request.workspaceId !== input.workspaceId ||
      request.stateHash !== input.stateHash ||
      request.approvedAt ||
      request.authorizationCodeHash ||
      Date.parse(request.expiresAt) <= Date.now() ||
      [...this.authoringAuthorizationRequests.values()].some(
        (candidate) => candidate.authorizationCodeHash === input.authorizationCodeHash,
      ) ||
      !this.hasAuthoringMembership(input.workspaceId, input.creatorId)
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(request.installationId, request.exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== input.workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }

    const approved: AuthoringAuthorizationRequestRecord = {
      ...request,
      creatorId: input.creatorId,
      authorizationCodeHash: input.authorizationCodeHash,
      approvedAt: new Date().toISOString(),
      authorizationCodeExpiresAt: input.authorizationCodeExpiresAt,
    };
    this.authoringAuthorizationRequests.set(approved.requestId, approved);
    return clone(approved);
  }

  async exchangeAuthoringAuthorizationCode(
    input: ExchangeAuthoringAuthorizationCodeInput,
  ): Promise<AuthoringCodeExchangeRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !isSha256Hash(input.activationGrantHash) ||
      !hasValidFutureTtl(input.activationGrantExpiresAt, AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS) ||
      [...this.authoringActivationGrants.values()].some(
        (candidate) => candidate.grantHash === input.activationGrantHash,
      )
    ) {
      return null;
    }
    const request = this.authoringAuthorizationRequests.get(input.requestId);
    if (
      !request ||
      request.installationId !== input.installationId ||
      request.exactOrigin !== exactOrigin ||
      request.bootstrapGrantHash !== input.bootstrapGrantHash ||
      request.stateHash !== input.stateHash ||
      request.authorizationCodeHash !== input.authorizationCodeHash ||
      !request.creatorId ||
      !request.approvedAt ||
      request.authorizationCodeUsedAt ||
      !request.authorizationCodeExpiresAt ||
      Date.parse(request.expiresAt) <= Date.now() ||
      Date.parse(request.authorizationCodeExpiresAt) <= Date.now() ||
      !verifyAuthoringPkceS256Challenge(input.codeVerifier, request.codeChallenge) ||
      !this.hasAuthoringMembership(request.workspaceId, request.creatorId)
    ) {
      return null;
    }
    const bootstrapGrant = this.publicSdkBootstrapGrants.get(request.bootstrapGrantId);
    if (
      !bootstrapGrant ||
      bootstrapGrant.grantHash !== input.bootstrapGrantHash ||
      !bootstrapGrant.consumedAt ||
      bootstrapGrant.revokedAt ||
      Date.parse(bootstrapGrant.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== request.workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const consumedRequest: AuthoringAuthorizationRequestRecord = {
      ...request,
      authorizationCodeUsedAt: now,
    };
    const activationGrant: AuthoringActivationGrantRecord = {
      grantId: createOpaqueRecordId('authgrant'),
      requestId: request.requestId,
      installationId: request.installationId,
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      environment: request.environment,
      exactOrigin: request.exactOrigin,
      creatorId: request.creatorId,
      capabilities: [...request.requestedCapabilities],
      ...(request.documentIntent ? { documentIntent: clone(request.documentIntent) } : {}),
      grantHash: input.activationGrantHash,
      createdAt: now,
      expiresAt: input.activationGrantExpiresAt,
      usedAt: null,
      revokedAt: null,
    };
    this.authoringAuthorizationRequests.set(consumedRequest.requestId, consumedRequest);
    this.authoringActivationGrants.set(activationGrant.grantId, activationGrant);
    return clone({ authorizationRequest: consumedRequest, activationGrant });
  }

  async consumeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'consume');
  }

  async revokeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'revoke');
  }
}
