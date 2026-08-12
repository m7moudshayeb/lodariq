import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  type CreatePublicSdkBootstrapGrantInput,
  type ConsumePublicSdkBootstrapGrantInput,
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationRecord,
  type ResolvedPublicSdkInstallation,
  assertPublicSdkBootstrapGrantHash,
  assertPublicSdkBootstrapGrantLifetime,
  normalizeExactOrigin,
  isPublicSdkBootstrapGrantHash,
  requireExactHttpOrigin,
} from '../repository';
import {
  environments,
  publicSdkBootstrapGrants,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
} from '../schema';
import {
  runWithPublicSdkBootstrapGrantLookupScope,
  runWithPublicSdkInstallationLookupScope,
} from '../scoped-transaction';
import {
  toPublicSdkInstallationRecord,
  toPublicSdkBootstrapGrantRecord,
  toWorkspaceEnvironment,
} from './helpers';
import { DrizzleRepositorySdkOrigins } from './sdk-origins';

export class DrizzleRepositorySdkBootstrap extends DrizzleRepositorySdkOrigins {
  async resolvePublicSdkInstallation(
    installationId: string,
    origin: string,
  ): Promise<ResolvedPublicSdkInstallation | null> {
    const exactOrigin = normalizeExactOrigin(origin);
    if (!exactOrigin) return null;
    return runWithPublicSdkInstallationLookupScope(
      this.database,
      installationId,
      exactOrigin,
      async (tx) => {
        const rows = await tx
          .select({
            installation: publicSdkInstallations,
            mapping: publicSdkInstallationOrigins,
            environment: environments,
          })
          .from(publicSdkInstallationOrigins)
          .innerJoin(
            publicSdkInstallations,
            eq(publicSdkInstallationOrigins.installationId, publicSdkInstallations.id),
          )
          .innerJoin(
            environments,
            and(
              eq(publicSdkInstallationOrigins.workspaceId, environments.workspaceId),
              eq(publicSdkInstallationOrigins.environmentId, environments.id),
            ),
          )
          .where(
            and(
              eq(publicSdkInstallations.id, installationId),
              isNull(publicSdkInstallations.revokedAt),
              eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
              eq(environments.enabled, true),
            ),
          )
          .limit(2);
        if (rows.length !== 1) return null;
        const [row] = rows;
        if (!row) return null;
        const environment = toWorkspaceEnvironment(row.environment);
        if (!environment.originAllowlist.includes(exactOrigin)) return null;
        return {
          installation: toPublicSdkInstallationRecord(row.installation),
          environment,
          exactOrigin: row.mapping.exactOrigin,
          authoringEnabled:
            row.environment.kind === 'production'
              ? false
              : row.environment.authoringEnabled && row.mapping.authoringEnabled,
        };
      },
    );
  }

  async revokePublicSdkInstallation(
    workspaceId: string,
    installationId: string,
    _actorUserId: string,
  ): Promise<PublicSdkInstallationRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const existing = await this.findPublicSdkInstallation(tx, workspaceId, installationId);
      if (!existing) return null;
      const now = new Date();
      const [revoked] = await tx
        .update(publicSdkInstallations)
        .set({ revokedAt: existing.revokedAt ?? now, updatedAt: now })
        .where(
          and(
            eq(publicSdkInstallations.workspaceId, workspaceId),
            eq(publicSdkInstallations.id, installationId),
          ),
        )
        .returning();
      return revoked ? toPublicSdkInstallationRecord(revoked) : null;
    });
  }

  async createPublicSdkBootstrapGrant(
    input: CreatePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord> {
    assertPublicSdkBootstrapGrantLifetime(input.expiresAt);
    assertPublicSdkBootstrapGrantHash(input.grantHash);
    const exactOrigin = requireExactHttpOrigin(input.exactOrigin);
    return this.scoped(input.workspaceId, async (tx) => {
      const contexts = await tx
        .select({
          installation: publicSdkInstallations,
          mapping: publicSdkInstallationOrigins,
          environment: environments,
        })
        .from(publicSdkInstallationOrigins)
        .innerJoin(
          publicSdkInstallations,
          and(
            eq(publicSdkInstallationOrigins.workspaceId, publicSdkInstallations.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, publicSdkInstallations.id),
          ),
        )
        .innerJoin(
          environments,
          and(
            eq(publicSdkInstallationOrigins.workspaceId, environments.workspaceId),
            eq(publicSdkInstallationOrigins.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(publicSdkInstallations.workspaceId, input.workspaceId),
            eq(publicSdkInstallations.id, input.installationId),
            isNull(publicSdkInstallations.revokedAt),
            eq(publicSdkInstallationOrigins.environmentId, input.environmentId),
            eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
            eq(publicSdkInstallationOrigins.authoringEnabled, true),
            eq(environments.enabled, true),
            eq(environments.authoringEnabled, true),
            sql`${environments.kind} <> 'production'`,
            sql`${environments.originAllowlist} ? ${exactOrigin}`,
          ),
        )
        .limit(2);
      if (contexts.length !== 1) {
        throw new Error('authoring-enabled public SDK installation origin not found');
      }

      const now = new Date();
      const [grant] = await tx
        .insert(publicSdkBootstrapGrants)
        .values({
          id: `sdkboot_${randomUUID()}`,
          installationId: input.installationId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          exactOrigin,
          grantHash: input.grantHash,
          createdAt: now,
          expiresAt: new Date(input.expiresAt),
          consumedAt: null,
          revokedAt: null,
        })
        .returning();
      if (!grant) throw new Error('failed to persist public SDK bootstrap grant');
      return toPublicSdkBootstrapGrantRecord(grant);
    });
  }

  async consumePublicSdkBootstrapGrant(
    input: ConsumePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isPublicSdkBootstrapGrantHash(input.grantHash)) return null;
    return runWithPublicSdkBootstrapGrantLookupScope(
      this.database,
      input.installationId,
      exactOrigin,
      input.grantHash,
      async (tx) => {
        const now = new Date();
        const [consumed] = await tx
          .update(publicSdkBootstrapGrants)
          .set({ consumedAt: now })
          .where(
            and(
              eq(publicSdkBootstrapGrants.installationId, input.installationId),
              eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
              eq(publicSdkBootstrapGrants.grantHash, input.grantHash),
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
        return consumed ? toPublicSdkBootstrapGrantRecord(consumed) : null;
      },
    );
  }
}
