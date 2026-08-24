import { and, eq, isNull, sql } from 'drizzle-orm';
import { isDeliverableExperienceType } from '@lodariq/schema';
import {
  type AuthoringActivationGrantRecord,
  type ConsumeAuthoringActivationGrantInput,
  type CreateAuthoringAuthorizationRequestInput,
  type WorkspaceThemeRecord,
  isSha256Hash,
  normalizeExactOrigin,
} from '../repository';
import {
  authoringActivationGrants,
  authoringAuthorizationRequests,
  documents,
  environments,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
  themes,
  themeVersions,
  workspaceMemberships,
} from '../schema';
import {
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_WORKSPACE_ID_SETTING,
  runWithTenantActorScope,
  runWithWorkspaceScope,
} from '../scoped-transaction';
import { ACTIVATION_GRANT_HASH_SETTING } from './types';
import type { LodariqTransaction } from './types';
import {
  toAuthoringActivationGrantRecord,
  isAuthoringEnvironmentKind,
  toWorkspaceThemeRecord,
  toWorkspaceThemeVersionRecord,
  hasAuthoringWorkspaceRole,
} from './helpers';
import { DrizzleRepositoryState } from './state';

export class DrizzleRepositoryGenericHelpers extends DrizzleRepositoryState {
  protected async findWorkspaceTheme(
    tx: LodariqTransaction,
    workspaceId: string,
    themeId: string,
  ): Promise<typeof themes.$inferSelect | null> {
    const [theme] = await tx
      .select()
      .from(themes)
      .where(and(eq(themes.workspaceId, workspaceId), eq(themes.id, themeId)))
      .limit(1);
    return theme ?? null;
  }

  protected async hydrateWorkspaceTheme(
    tx: LodariqTransaction,
    theme: typeof themes.$inferSelect,
  ): Promise<WorkspaceThemeRecord> {
    if (!theme.activeVersionId) return toWorkspaceThemeRecord(theme, null);
    const [activeVersion] = await tx
      .select()
      .from(themeVersions)
      .where(
        and(
          eq(themeVersions.workspaceId, theme.workspaceId),
          eq(themeVersions.themeId, theme.id),
          eq(themeVersions.id, theme.activeVersionId),
        ),
      )
      .limit(1);
    if (!activeVersion) {
      throw new Error('workspace theme active version not found in workspace');
    }
    return toWorkspaceThemeRecord(theme, toWorkspaceThemeVersionRecord(activeVersion));
  }

  protected scoped<TResult>(
    workspaceId: string,
    operation: (transaction: LodariqTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return runWithWorkspaceScope(this.database, workspaceId, operation);
  }

  protected actorScoped<TResult>(
    workspaceId: string,
    actorUserId: string,
    operation: (transaction: LodariqTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return runWithTenantActorScope(this.database, workspaceId, actorUserId, operation);
  }

  protected async lockSortedReleaseDocumentEnvironments(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
    environmentIds: readonly string[],
  ): Promise<void> {
    for (const environmentId of [...new Set(environmentIds)].sort()) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtext(${`${workspaceId}:${environmentId}`}),
          hashtext(${documentId})
        )`,
      );
    }
  }

  protected async setWorkspaceScope(tx: LodariqTransaction, workspaceId: string): Promise<void> {
    await tx.execute(sql`select set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${workspaceId}, true)`);
  }

  protected async setTenantActorScope(
    tx: LodariqTransaction,
    workspaceId: string,
    actorUserId: string,
  ): Promise<void> {
    await tx.execute(
      sql`select
        set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${workspaceId}, true),
        set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${actorUserId}, true)`,
    );
  }

  protected async findAuthoringEnvironment(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
  ): Promise<'development' | 'staging' | null> {
    const [environment] = await tx
      .select({ kind: environments.kind })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId),
          eq(environments.enabled, true),
          eq(environments.authoringEnabled, true),
          sql`${environments.kind} <> 'production'`,
        ),
      )
      .limit(1);
    return environment && isAuthoringEnvironmentKind(environment.kind) ? environment.kind : null;
  }

  protected async isResolvedAuthoringDocumentIntent(
    tx: LodariqTransaction,
    workspaceId: string,
    documentIntent: CreateAuthoringAuthorizationRequestInput['documentIntent'],
  ): Promise<boolean> {
    if (!documentIntent || documentIntent.kind === 'new-draft') return true;
    const [document] = await tx
      .select({ id: documents.id, canonical: documents.canonical })
      .from(documents)
      .where(
        and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentIntent.documentId)),
      )
      .limit(1);
    return Boolean(document && isDeliverableExperienceType(document.canonical.type));
  }

  protected async hasAuthoringMembership(
    tx: LodariqTransaction,
    workspaceId: string,
    creatorId: string,
  ): Promise<boolean> {
    const [membership] = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, creatorId),
        ),
      )
      .limit(1)
      .for('share');
    return Boolean(membership && hasAuthoringWorkspaceRole(membership.role));
  }

  protected async hasActiveAuthoringScope(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
    installationId: string,
    exactOrigin: string,
  ): Promise<boolean> {
    const [scope] = await tx
      .select({ installationId: publicSdkInstallations.id })
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
          eq(publicSdkInstallationOrigins.workspaceId, workspaceId),
          eq(publicSdkInstallationOrigins.environmentId, environmentId),
          eq(publicSdkInstallationOrigins.installationId, installationId),
          eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
          eq(publicSdkInstallationOrigins.authoringEnabled, true),
          isNull(publicSdkInstallations.revokedAt),
          eq(environments.enabled, true),
          eq(environments.authoringEnabled, true),
          sql`${environments.kind} <> 'production'`,
          sql`${environments.originAllowlist} ? ${exactOrigin}`,
        ),
      )
      .limit(2)
      .for('share');
    return Boolean(scope);
  }

  protected activeAuthorizationRequestScopeCondition() {
    return sql`exists (
      select 1
      from public_sdk_installations installation
      inner join public_sdk_installation_origins origin_mapping
        on origin_mapping.workspace_id = installation.workspace_id
        and origin_mapping.installation_id = installation.id
      inner join environments environment
        on environment.workspace_id = origin_mapping.workspace_id
        and environment.id = origin_mapping.environment_id
      where installation.workspace_id = ${authoringAuthorizationRequests.workspaceId}
        and installation.id = ${authoringAuthorizationRequests.installationId}
        and installation.revoked_at is null
        and origin_mapping.environment_id = ${authoringAuthorizationRequests.environmentId}
        and origin_mapping.exact_origin = ${authoringAuthorizationRequests.exactOrigin}
        and origin_mapping.authoring_enabled = true
        and environment.enabled = true
        and environment.authoring_enabled = true
        and environment.kind <> 'production'
        and environment.origin_allowlist ? origin_mapping.exact_origin
    )`;
  }

  protected async mutateAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
    operation: 'consume' | 'revoke',
  ): Promise<AuthoringActivationGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isSha256Hash(input.grantHash)) return null;

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('lodariq.public_installation_id', ${input.installationId}, true),
        set_config('lodariq.public_origin', ${exactOrigin}, true),
        set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.grantHash}, true)`);
      const now = new Date();
      const [candidate] = await tx
        .select({ grant: authoringActivationGrants, environment: environments.kind })
        .from(authoringActivationGrants)
        .innerJoin(
          environments,
          and(
            eq(authoringActivationGrants.workspaceId, environments.workspaceId),
            eq(authoringActivationGrants.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(authoringActivationGrants.installationId, input.installationId),
            eq(authoringActivationGrants.exactOrigin, exactOrigin),
            eq(authoringActivationGrants.grantHash, input.grantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .limit(1);
      if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;

      await this.setTenantActorScope(tx, candidate.grant.workspaceId, candidate.grant.creatorId);
      if (
        !(await this.hasActiveAuthoringScope(
          tx,
          candidate.grant.workspaceId,
          candidate.grant.environmentId,
          candidate.grant.installationId,
          candidate.grant.exactOrigin,
        )) ||
        !(await this.hasAuthoringMembership(
          tx,
          candidate.grant.workspaceId,
          candidate.grant.creatorId,
        ))
      ) {
        return null;
      }

      const mutation = operation === 'consume' ? { usedAt: now } : { revokedAt: now };
      const [mutated] = await tx
        .update(authoringActivationGrants)
        .set(mutation)
        .where(
          and(
            eq(authoringActivationGrants.id, candidate.grant.id),
            eq(authoringActivationGrants.installationId, input.installationId),
            eq(authoringActivationGrants.exactOrigin, exactOrigin),
            eq(authoringActivationGrants.grantHash, input.grantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .returning();
      return mutated ? toAuthoringActivationGrantRecord(mutated, candidate.environment) : null;
    });
  }
}
