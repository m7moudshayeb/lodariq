import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type CreateEnvironmentTokenInput,
  type EnvironmentTokenRecord,
  type ResolvedEnvironmentToken,
} from '../repository';
import { environments, environmentTokens } from '../schema';
import { runWithEnvironmentTokenLookupScope } from '../scoped-transaction';
import { toIsoString } from './helpers';
import { DrizzleRepositoryAuthoringActivation } from './authoring-activation';

export class DrizzleRepositoryTokens extends DrizzleRepositoryAuthoringActivation {
  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(eq(environmentTokens.workspaceId, workspaceId))
        .orderBy(desc(environmentTokens.createdAt));

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
      }));
    });
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    return runWithEnvironmentTokenLookupScope(this.database, tokenHash, async (tx) => {
      const [row] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenHash: environmentTokens.tokenHash,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
          originAllowlist: environments.originAllowlist,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(
          and(
            eq(environmentTokens.tokenHash, tokenHash),
            isNull(environmentTokens.revokedAt),
            eq(environments.enabled, true),
          ),
        )
        .limit(1);

      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenHash: row.tokenHash,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
        originAllowlist: row.originAllowlist,
      };
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.enabled, true),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error('environment not found in workspace');
      }

      const [token] = await tx
        .insert(environmentTokens)
        .values({
          id: `envtok_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          name: input.name,
          tokenHash: input.tokenHash,
          tokenPrefix: input.tokenPrefix,
          createdByUserId: input.actorUserId,
        })
        .returning();

      if (!token) throw new Error('failed to create environment token');

      return {
        id: token.id,
        workspaceId: token.workspaceId,
        environmentId: token.environmentId,
        environment: environment.kind,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        createdAt: toIsoString(token.createdAt),
        revokedAt: token.revokedAt ? toIsoString(token.revokedAt) : null,
      };
    });
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [current] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(
          and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
        )
        .limit(1);

      if (!current) return null;

      let revokedAt = current.revokedAt;
      if (!revokedAt) {
        const [updated] = await tx
          .update(environmentTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
          )
          .returning({ revokedAt: environmentTokens.revokedAt });
        revokedAt = updated?.revokedAt ?? new Date();
      }

      return {
        id: current.id,
        workspaceId: current.workspaceId,
        environmentId: current.environmentId,
        environment: current.environment,
        name: current.name,
        tokenPrefix: current.tokenPrefix,
        createdAt: toIsoString(current.createdAt),
        revokedAt: toIsoString(revokedAt),
      };
    });
  }
}
