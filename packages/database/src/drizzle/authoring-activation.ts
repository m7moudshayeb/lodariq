import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  type LodariqDocument,
  type QueryAuthoringDocumentsResult,
} from '@lodariq/schema';
import {
  type ActivatedAuthoringDocumentSessionRecord,
  type AuthoringActivationGrantRecord,
  authoringSessionThemeReference,
  type ConsumeAuthoringActivationGrantInput,
  type CreateAuthoringDocumentSessionFromActivationInput,
  createAuthoringSessionCompatibilityPins,
  type QueryAuthoringDocumentsFromActivationInput,
  AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS,
  canActivateDocumentIntent,
  createServerOwnedTourDraft,
  getAuthoringDocumentSessionCapabilities,
  hasValidFutureTtl,
  isAuthoringDocumentQueryScope,
  isSha256Hash,
  isTrustedEditorIframeSrc,
  isValidAuthoringDocumentIntent,
  matchesAuthoringPageContext,
  normalizeAuthoringPathname,
  normalizeExactOrigin,
} from '../repository';
import {
  authoringActivationGrants,
  authoringSessions,
  documents,
  documentVersions,
  environments,
  themes,
  themeVersions,
} from '../schema';
import { ACTIVATION_GRANT_HASH_SETTING, AuthoringAtomicWriteRejected } from './types';
import {
  toAuthoringActivationGrantRecord,
  toAuthoringDocumentSessionRecord,
  isAuthoringEnvironmentKind,
  isUniqueConstraintViolation,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryAuthoringExchange } from './authoring-exchange';

export class DrizzleRepositoryAuthoringActivation extends DrizzleRepositoryAuthoringExchange {
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

  async queryAuthoringDocumentsFromActivation(
    input: QueryAuthoringDocumentsFromActivationInput,
  ): Promise<QueryAuthoringDocumentsResult | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isSha256Hash(input.activationGrantHash) ||
      !isAuthoringDocumentQueryScope(input.scope)
    ) {
      return null;
    }

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('lodariq.public_installation_id', ${input.installationId}, true),
        set_config('lodariq.public_origin', ${exactOrigin}, true),
        set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);
      const now = new Date();
      const candidates = await tx
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
            eq(authoringActivationGrants.grantHash, input.activationGrantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .limit(2);
      if (candidates.length !== 1) return null;
      const [candidate] = candidates;
      if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;
      const grant = toAuthoringActivationGrantRecord(candidate.grant, candidate.environment);
      if (!grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)) {
        return null;
      }

      await this.setTenantActorScope(tx, grant.workspaceId, grant.creatorId);
      if (
        !(await this.hasActiveAuthoringScope(
          tx,
          grant.workspaceId,
          grant.environmentId,
          grant.installationId,
          grant.exactOrigin,
        )) ||
        !(await this.hasAuthoringMembership(tx, grant.workspaceId, grant.creatorId))
      ) {
        return null;
      }

      const pageContext = { pathname };
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, grant.workspaceId), eq(documents.type, 'tour')))
        .orderBy(desc(documents.updatedAt));
      const matchingRows = rows.filter(
        (row) =>
          row.canonical.type === 'tour' &&
          (input.scope === 'workspace' ||
            matchesAuthoringPageContext(row.canonical, exactOrigin, pageContext)),
      );
      const summaries: QueryAuthoringDocumentsResult['documents'] = [];
      for (const row of matchingRows) {
        summaries.push({
          id: row.id,
          title: row.canonical.title,
          type: 'tour' as const,
          status: row.canonical.status,
          updatedAt: toIsoString(row.updatedAt),
          releases: await this.getLatestPublicationsForDocument(tx, grant.workspaceId, row.id),
        });
      }

      return { scope: input.scope, pageContext, documents: summaries };
    });
  }

  async createAuthoringDocumentSessionFromActivation(
    input: CreateAuthoringDocumentSessionFromActivationInput,
  ): Promise<ActivatedAuthoringDocumentSessionRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isAuthoringDocumentQueryScope(input.selectionScope) ||
      !input.documentIntent ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      (input.documentIntent.kind === 'new-draft' && input.selectionScope !== 'page') ||
      !isSha256Hash(input.activationGrantHash) ||
      !isSha256Hash(input.sessionTokenHash) ||
      !input.correlationId.trim() ||
      !isTrustedEditorIframeSrc(input.iframeSrc) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS)
    ) {
      return null;
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select
          set_config('lodariq.public_installation_id', ${input.installationId}, true),
          set_config('lodariq.public_origin', ${exactOrigin}, true),
          set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);
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
              eq(authoringActivationGrants.grantHash, input.activationGrantHash),
              isNull(authoringActivationGrants.usedAt),
              isNull(authoringActivationGrants.revokedAt),
              sql`${authoringActivationGrants.expiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) {
          return null;
        }
        const grant = toAuthoringActivationGrantRecord(candidate.grant, candidate.environment);
        if (
          !canActivateDocumentIntent(grant, input.documentIntent) ||
          (input.selectionScope === 'workspace' &&
            !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS))
        ) {
          return null;
        }

        await this.setTenantActorScope(
          tx,
          candidate.grant.workspaceId,
          candidate.grant.creatorId,
        );
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

        const [consumedGrant] = await tx
          .update(authoringActivationGrants)
          .set({ usedAt: now })
          .where(
            and(
              eq(authoringActivationGrants.id, candidate.grant.id),
              eq(authoringActivationGrants.installationId, input.installationId),
              eq(authoringActivationGrants.exactOrigin, exactOrigin),
              eq(authoringActivationGrants.grantHash, input.activationGrantHash),
              isNull(authoringActivationGrants.usedAt),
              isNull(authoringActivationGrants.revokedAt),
              sql`${authoringActivationGrants.expiresAt} > ${now}`,
            ),
          )
          .returning();
        if (!consumedGrant) return null;

        let documentId: string;
        let sessionDocument: LodariqDocument;
        let documentCreated = false;
        if (input.documentIntent.kind === 'existing') {
          const [document] = await tx
            .select({ id: documents.id, canonical: documents.canonical })
            .from(documents)
            .where(
              and(
                eq(documents.workspaceId, consumedGrant.workspaceId),
                eq(documents.id, input.documentIntent.documentId),
                eq(documents.type, 'tour'),
              ),
            )
            .limit(1);
          if (
            !document ||
            document.canonical.type !== 'tour' ||
            (input.selectionScope === 'page' &&
              !matchesAuthoringPageContext(document.canonical, exactOrigin, { pathname }))
          ) {
            throw new AuthoringAtomicWriteRejected();
          }
          documentId = document.id;
          sessionDocument = document.canonical;
        } else {
          const [defaultTheme] = await tx
            .select({ id: themes.id, activeVersionId: themes.activeVersionId })
            .from(themes)
            .where(
              and(
                eq(themes.workspaceId, consumedGrant.workspaceId),
                eq(themes.isDefault, true),
                sql`${themes.activeVersionId} is not null`,
              ),
            )
            .limit(1);
          const draft = createServerOwnedTourDraft(
            consumedGrant.workspaceId,
            candidate.environment,
            exactOrigin,
            { pathname },
            defaultTheme ?? null,
          );
          const [document] = await tx
            .insert(documents)
            .values({
              id: draft.id,
              workspaceId: draft.workspaceId,
              type: draft.type,
              status: draft.status,
              title: draft.title,
              schemaVersion: draft.schemaVersion,
              canonical: draft,
              createdByUserId: consumedGrant.creatorId,
              updatedByUserId: consumedGrant.creatorId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: documents.id });
          if (!document) throw new AuthoringAtomicWriteRejected();
          const [version] = await tx
            .insert(documentVersions)
            .values({
              id: `${draft.id}_v_1`,
              workspaceId: draft.workspaceId,
              documentId: draft.id,
              version: 1,
              canonical: draft,
              createdByUserId: consumedGrant.creatorId,
              createdAt: now,
            })
            .returning({ id: documentVersions.id });
          if (!version) throw new AuthoringAtomicWriteRejected();
          documentId = document.id;
          sessionDocument = draft;
          documentCreated = true;
        }

        const themeReference = authoringSessionThemeReference(sessionDocument);
        if (!themeReference) throw new AuthoringAtomicWriteRejected();
        if (themeReference.source === 'workspace') {
          const [resolvedThemeVersion] = await tx
            .select({
              id: themeVersions.id,
              contractVersion: themeVersions.contractVersion,
            })
            .from(themeVersions)
            .where(
              and(
                eq(themeVersions.workspaceId, consumedGrant.workspaceId),
                eq(themeVersions.themeId, themeReference.themeId),
                eq(themeVersions.id, themeReference.themeVersionId),
              ),
            )
            .limit(1);
          if (
            !resolvedThemeVersion ||
            resolvedThemeVersion.contractVersion !== BRAND_THEME_CONTRACT_VERSION
          ) {
            throw new AuthoringAtomicWriteRejected();
          }
        }
        const compatibility = createAuthoringSessionCompatibilityPins(
          themeReference.themeVersionId,
        );
        const capabilities = getAuthoringDocumentSessionCapabilities(candidate.environment);
        const [session] = await tx
          .insert(authoringSessions)
          .values({
            id: `authsess_${randomUUID()}`,
            correlationId: input.correlationId,
            workspaceId: consumedGrant.workspaceId,
            environmentId: consumedGrant.environmentId,
            documentId,
            installationId: consumedGrant.installationId,
            activationGrantId: consumedGrant.id,
            customerOrigin: consumedGrant.exactOrigin,
            capabilities,
            ...compatibility,
            tokenHash: input.sessionTokenHash,
            iframeSrc: input.iframeSrc,
            createdByUserId: consumedGrant.creatorId,
            expiresAt: new Date(input.expiresAt),
            revokedAt: null,
            createdAt: now,
          })
          .returning();
        if (!session) throw new AuthoringAtomicWriteRejected();

        return {
          activationGrant: toAuthoringActivationGrantRecord(consumedGrant, candidate.environment),
          session: toAuthoringDocumentSessionRecord(session, candidate.environment),
          documentCreated,
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
