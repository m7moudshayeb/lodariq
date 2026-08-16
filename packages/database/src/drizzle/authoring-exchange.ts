import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  type ApproveAuthoringAuthorizationRequestInput,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringCodeExchangeRecord,
  type ExchangeAuthoringAuthorizationCodeInput,
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  hasValidBoundedFutureTtl,
  hasValidFutureTtl,
  isSha256Hash,
  normalizeExactOrigin,
} from '../repository';
import {
  authoringActivationGrants,
  authoringAuthorizationRequests,
  environments,
  publicSdkBootstrapGrants,
  workspaceMemberships,
} from '../schema';
import { verifyAuthoringPkceS256Challenge } from '../tokens';
import {
  AUTHORING_REQUEST_ID_SETTING,
  AUTHORING_STATE_HASH_SETTING,
  AUTHORING_CODE_HASH_SETTING,
  ACTIVATION_GRANT_HASH_SETTING,
  AuthoringAtomicWriteRejected,
} from './types';
import {
  toAuthoringAuthorizationRequestRecord,
  toAuthoringActivationGrantRecord,
  isAuthoringEnvironmentKind,
  isUniqueConstraintViolation,
} from './helpers';
import { DrizzleRepositoryAuthoringRequest } from './authoring-request';

export class DrizzleRepositoryAuthoringExchange extends DrizzleRepositoryAuthoringRequest {
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

    try {
      return await this.actorScoped(input.workspaceId, input.creatorId, async (tx) => {
        const now = new Date();
        const [candidate] = await tx
          .select({ request: authoringAuthorizationRequests, environment: environments.kind })
          .from(authoringAuthorizationRequests)
          .innerJoin(
            environments,
            and(
              eq(authoringAuthorizationRequests.workspaceId, environments.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, environments.id),
            ),
          )
          .innerJoin(
            workspaceMemberships,
            and(
              eq(authoringAuthorizationRequests.workspaceId, workspaceMemberships.workspaceId),
              eq(workspaceMemberships.userId, input.creatorId),
              or(
                eq(workspaceMemberships.role, 'member'),
                eq(workspaceMemberships.role, 'admin'),
                eq(workspaceMemberships.role, 'owner'),
              ),
            ),
          )
          .where(
            and(
              eq(authoringAuthorizationRequests.workspaceId, input.workspaceId),
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              isNull(authoringAuthorizationRequests.creatorId),
              isNull(authoringAuthorizationRequests.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.approvedAt),
              isNull(authoringAuthorizationRequests.authorizationCodeExpiresAt),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${environments.kind} <> 'production'`,
              this.activeAuthorizationRequestScopeCondition(),
            ),
          )
          .limit(1);
        if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;

        const [approved] = await tx
          .update(authoringAuthorizationRequests)
          .set({
            creatorId: input.creatorId,
            authorizationCodeHash: input.authorizationCodeHash,
            approvedAt: now,
            authorizationCodeExpiresAt: new Date(input.authorizationCodeExpiresAt),
          })
          .where(
            and(
              eq(authoringAuthorizationRequests.workspaceId, input.workspaceId),
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              isNull(authoringAuthorizationRequests.creatorId),
              isNull(authoringAuthorizationRequests.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.approvedAt),
              isNull(authoringAuthorizationRequests.authorizationCodeExpiresAt),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
            ),
          )
          .returning();
        return approved
          ? toAuthoringAuthorizationRequestRecord(approved, candidate.environment)
          : null;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return null;
      throw error;
    }
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
      !hasValidFutureTtl(input.activationGrantExpiresAt, AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS)
    ) {
      return null;
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select
          set_config('lodariq.public_installation_id', ${input.installationId}, true),
          set_config('lodariq.public_origin', ${exactOrigin}, true),
          set_config('lodariq.bootstrap_grant_hash', ${input.bootstrapGrantHash}, true),
          set_config(${AUTHORING_REQUEST_ID_SETTING}, ${input.requestId}, true),
          set_config(${AUTHORING_STATE_HASH_SETTING}, ${input.stateHash}, true),
          set_config(${AUTHORING_CODE_HASH_SETTING}, ${input.authorizationCodeHash}, true),
          set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);

        const now = new Date();
        const [candidate] = await tx
          .select({ request: authoringAuthorizationRequests, environment: environments.kind })
          .from(authoringAuthorizationRequests)
          .innerJoin(
            environments,
            and(
              eq(authoringAuthorizationRequests.workspaceId, environments.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, environments.id),
            ),
          )
          .where(
            and(
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.installationId, input.installationId),
              eq(authoringAuthorizationRequests.exactOrigin, exactOrigin),
              eq(authoringAuthorizationRequests.bootstrapGrantHash, input.bootstrapGrantHash),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              eq(authoringAuthorizationRequests.authorizationCodeHash, input.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${authoringAuthorizationRequests.authorizationCodeExpiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (
          !candidate ||
          !candidate.request.creatorId ||
          !candidate.request.approvedAt ||
          !candidate.request.authorizationCodeExpiresAt ||
          !isAuthoringEnvironmentKind(candidate.environment) ||
          !verifyAuthoringPkceS256Challenge(input.codeVerifier, candidate.request.codeChallenge)
        ) {
          return null;
        }

        const [bootstrapGrant] = await tx
          .select()
          .from(publicSdkBootstrapGrants)
          .where(
            and(
              eq(publicSdkBootstrapGrants.id, candidate.request.bootstrapGrantId),
              eq(publicSdkBootstrapGrants.installationId, input.installationId),
              eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
              eq(publicSdkBootstrapGrants.grantHash, input.bootstrapGrantHash),
              sql`${publicSdkBootstrapGrants.consumedAt} is not null`,
              isNull(publicSdkBootstrapGrants.revokedAt),
              sql`${publicSdkBootstrapGrants.expiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (!bootstrapGrant) return null;

        await this.setTenantActorScope(
          tx,
          candidate.request.workspaceId,
          candidate.request.creatorId,
        );
        if (
          !(await this.hasActiveAuthoringScope(
            tx,
            candidate.request.workspaceId,
            candidate.request.environmentId,
            candidate.request.installationId,
            candidate.request.exactOrigin,
          )) ||
          !(await this.hasAuthoringMembership(
            tx,
            candidate.request.workspaceId,
            candidate.request.creatorId,
          ))
        ) {
          return null;
        }

        const [consumedRequest] = await tx
          .update(authoringAuthorizationRequests)
          .set({ authorizationCodeUsedAt: now })
          .where(
            and(
              eq(authoringAuthorizationRequests.id, candidate.request.id),
              eq(authoringAuthorizationRequests.workspaceId, candidate.request.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, candidate.request.environmentId),
              eq(authoringAuthorizationRequests.installationId, input.installationId),
              eq(authoringAuthorizationRequests.exactOrigin, exactOrigin),
              eq(authoringAuthorizationRequests.bootstrapGrantHash, input.bootstrapGrantHash),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              eq(authoringAuthorizationRequests.authorizationCodeHash, input.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${authoringAuthorizationRequests.authorizationCodeExpiresAt} > ${now}`,
            ),
          )
          .returning();
        if (!consumedRequest || !consumedRequest.creatorId) return null;

        const [activationGrant] = await tx
          .insert(authoringActivationGrants)
          .values({
            id: `authgrant_${randomUUID()}`,
            requestId: consumedRequest.id,
            installationId: consumedRequest.installationId,
            workspaceId: consumedRequest.workspaceId,
            environmentId: consumedRequest.environmentId,
            exactOrigin: consumedRequest.exactOrigin,
            creatorId: consumedRequest.creatorId,
            capabilities: [...consumedRequest.requestedCapabilities],
            documentIntent: consumedRequest.documentIntent,
            grantHash: input.activationGrantHash,
            expiresAt: new Date(input.activationGrantExpiresAt),
            usedAt: null,
            revokedAt: null,
            createdAt: now,
          })
          .returning();
        if (!activationGrant) throw new AuthoringAtomicWriteRejected();

        return {
          authorizationRequest: toAuthoringAuthorizationRequestRecord(
            consumedRequest,
            candidate.environment,
          ),
          activationGrant: toAuthoringActivationGrantRecord(activationGrant, candidate.environment),
        };
      });
    } catch (error) {
      if (error instanceof AuthoringAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }
}
