import { randomUUID } from 'node:crypto';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import {
  type AuthoringAuthorizationRequestRecord,
  type CreateAuthoringAuthorizationRequestInput,
  type ResolvedAuthoringAuthorizationForUser,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
  hasValidFutureTtl,
  isAuthoringPkceChallenge,
  isSha256Hash,
  isValidAuthoringCapabilities,
  isValidAuthoringDocumentIntent,
  normalizeExactOrigin,
} from '../repository';
import {
  authoringAuthorizationRequests,
  environments,
  publicSdkBootstrapGrants,
  workspaceMemberships,
} from '../schema';
import {
  runWithAuthUserScope,
  runWithPublicSdkBootstrapGrantLookupScope,
} from '../scoped-transaction';
import { AUTHORING_REQUEST_ID_SETTING, AuthoringAtomicWriteRejected } from './types';
import {
  toAuthoringAuthorizationRequestRecord,
  isAuthoringEnvironmentKind,
  isUniqueConstraintViolation,
  hasAuthoringWorkspaceRole,
} from './helpers';
import { DrizzleRepositorySdkBootstrap } from './sdk-bootstrap';

export class DrizzleRepositoryAuthoringRequest extends DrizzleRepositorySdkBootstrap {
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

    try {
      return await runWithPublicSdkBootstrapGrantLookupScope(
        this.database,
        input.installationId,
        exactOrigin,
        input.bootstrapGrantHash,
        async (tx) => {
          const now = new Date();
          const [bootstrapGrant] = await tx
            .update(publicSdkBootstrapGrants)
            .set({ consumedAt: now })
            .where(
              and(
                eq(publicSdkBootstrapGrants.installationId, input.installationId),
                eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
                eq(publicSdkBootstrapGrants.grantHash, input.bootstrapGrantHash),
                isNull(publicSdkBootstrapGrants.consumedAt),
                isNull(publicSdkBootstrapGrants.revokedAt),
                sql`${publicSdkBootstrapGrants.expiresAt} > ${now}`,
                sql`exists (
                select 1
                from public_sdk_installations installation
                inner join public_sdk_installation_origins origin_mapping
                  on origin_mapping.workspace_id = installation.workspace_id
                  and origin_mapping.installation_id = installation.id
                inner join environments environment
                  on environment.workspace_id = origin_mapping.workspace_id
                  and environment.id = origin_mapping.environment_id
                where installation.id = ${publicSdkBootstrapGrants.installationId}
                  and installation.workspace_id = ${publicSdkBootstrapGrants.workspaceId}
                  and installation.revoked_at is null
                  and origin_mapping.exact_origin = ${publicSdkBootstrapGrants.exactOrigin}
                  and origin_mapping.environment_id = ${publicSdkBootstrapGrants.environmentId}
                  and origin_mapping.authoring_enabled = true
                  and environment.enabled = true
                  and environment.authoring_enabled = true
                  and environment.kind <> 'production'
                  and environment.origin_allowlist ? origin_mapping.exact_origin
              )`,
              ),
            )
            .returning();
          if (!bootstrapGrant) return null;

          await this.setWorkspaceScope(tx, bootstrapGrant.workspaceId);
          const environment = await this.findAuthoringEnvironment(
            tx,
            bootstrapGrant.workspaceId,
            bootstrapGrant.environmentId,
          );
          if (!environment) throw new AuthoringAtomicWriteRejected();
          if (
            !(await this.isResolvedAuthoringDocumentIntent(
              tx,
              bootstrapGrant.workspaceId,
              input.documentIntent,
            ))
          ) {
            throw new AuthoringAtomicWriteRejected();
          }

          const [request] = await tx
            .insert(authoringAuthorizationRequests)
            .values({
              id: `authreq_${randomUUID()}`,
              bootstrapGrantId: bootstrapGrant.id,
              bootstrapGrantHash: bootstrapGrant.grantHash,
              installationId: bootstrapGrant.installationId,
              workspaceId: bootstrapGrant.workspaceId,
              environmentId: bootstrapGrant.environmentId,
              exactOrigin: bootstrapGrant.exactOrigin,
              stateHash: input.stateHash,
              codeChallenge: input.codeChallenge,
              codeChallengeMethod: 'S256',
              requestedCapabilities: [...input.requestedCapabilities],
              documentIntent: input.documentIntent ?? null,
              creatorId: null,
              authorizationCodeHash: null,
              expiresAt: new Date(input.expiresAt),
              approvedAt: null,
              authorizationCodeExpiresAt: null,
              authorizationCodeUsedAt: null,
              createdAt: now,
            })
            .onConflictDoNothing()
            .returning();
          if (!request) throw new AuthoringAtomicWriteRejected();
          return toAuthoringAuthorizationRequestRecord(request, environment);
        },
      );
    } catch (error) {
      if (error instanceof AuthoringAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async getAuthoringAuthorizationRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const now = new Date();
      const [row] = await tx
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
            eq(authoringAuthorizationRequests.workspaceId, workspaceId),
            eq(authoringAuthorizationRequests.id, requestId),
            sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
            sql`${environments.kind} <> 'production'`,
            this.activeAuthorizationRequestScopeCondition(),
          ),
        )
        .limit(1);
      return row && isAuthoringEnvironmentKind(row.environment)
        ? toAuthoringAuthorizationRequestRecord(row.request, row.environment)
        : null;
    });
  }

  async getAuthoringAuthorizationRequestForUser(
    userId: string,
    requestId: string,
  ): Promise<ResolvedAuthoringAuthorizationForUser | null> {
    const candidate = await runWithAuthUserScope(this.database, userId, async (tx) => {
      await tx.execute(sql`select set_config(${AUTHORING_REQUEST_ID_SETTING}, ${requestId}, true)`);
      const [row] = await tx
        .select({
          workspaceId: authoringAuthorizationRequests.workspaceId,
          membership: workspaceMemberships,
        })
        .from(authoringAuthorizationRequests)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, authoringAuthorizationRequests.workspaceId),
            eq(workspaceMemberships.userId, userId),
            or(
              eq(workspaceMemberships.role, 'member'),
              eq(workspaceMemberships.role, 'admin'),
              eq(workspaceMemberships.role, 'owner'),
            ),
          ),
        )
        .where(
          and(
            eq(authoringAuthorizationRequests.id, requestId),
            sql`${authoringAuthorizationRequests.expiresAt} > now()`,
          ),
        )
        .limit(1);
      return row;
    });
    if (!candidate) return null;

    const request = await this.getAuthoringAuthorizationRequest(candidate.workspaceId, requestId);
    const membership = await this.resolveWorkspaceMembership(candidate.workspaceId, userId);
    if (!request || !membership || !hasAuthoringWorkspaceRole(membership.role)) return null;
    return {
      request,
      membership,
    };
  }
}
