import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { BRAND_THEME_CONTRACT_VERSION } from '@lodariq/schema';
import {
  type AcknowledgeDocumentThemeInput,
  type AuthoringSessionRecord,
  authoringSessionThemeReference,
  type CreateAuthoringSessionInput,
  createAuthoringSessionCompatibilityPins,
  type PersistedDocument,
  type RevokeAuthoringSessionInput,
  isSha256Hash,
} from '../repository';
import { assertWorkspaceScope } from '../rls';
import { authoringSessions, documents, environments, themes, themeVersions } from '../schema';
import { runWithAuthoringSessionLookupScope } from '../scoped-transaction';
import { assertArtifactMatchesDocument, toAuthoringSessionRecord, toIsoString } from './helpers';
import { DrizzleRepositoryTokens } from './tokens';

export class DrizzleRepositoryAuthoringSessions extends DrizzleRepositoryTokens {
  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.enabled, true),
            eq(environments.authoringEnabled, true),
            sql`${environments.kind} <> 'production'`,
          ),
        )
        .limit(1)
        .for('share');

      if (!environment) {
        throw new Error('environment not found in workspace');
      }
      if (!(await this.hasAuthoringMembership(tx, input.workspaceId, input.actorUserId))) {
        throw new Error('authoring session creator is not an active workspace member');
      }

      const [document] = await tx
        .select({ id: documents.id, canonical: documents.canonical })
        .from(documents)
        .where(
          and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)),
        )
        .limit(1);

      if (!document) {
        throw new Error('document not found in workspace');
      }

      const themeReference = authoringSessionThemeReference(document.canonical);
      if (!themeReference) {
        throw new Error('document theme is unavailable for an authoring session');
      }
      if (themeReference.source === 'workspace') {
        const [resolvedThemeVersion] = await tx
          .select({
            id: themeVersions.id,
            contractVersion: themeVersions.contractVersion,
          })
          .from(themeVersions)
          .where(
            and(
              eq(themeVersions.workspaceId, input.workspaceId),
              eq(themeVersions.themeId, themeReference.themeId),
              eq(themeVersions.id, themeReference.themeVersionId),
            ),
          )
          .limit(1);
        if (
          !resolvedThemeVersion ||
          resolvedThemeVersion.contractVersion !== BRAND_THEME_CONTRACT_VERSION
        ) {
          throw new Error('document theme is unavailable for an authoring session');
        }
      }
      const compatibility = createAuthoringSessionCompatibilityPins(themeReference.themeVersionId);

      const [session] = await tx
        .insert(authoringSessions)
        .values({
          id: `authsess_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          tokenHash: input.tokenHash,
          iframeSrc: input.iframeSrc,
          createdByUserId: input.actorUserId,
          expiresAt: new Date(input.expiresAt),
          ...compatibility,
        })
        .returning();

      if (!session) throw new Error('failed to create authoring session');
      return toAuthoringSessionRecord(session, environment.kind);
    });
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          id: authoringSessions.id,
          workspaceId: authoringSessions.workspaceId,
          environmentId: authoringSessions.environmentId,
          environment: environments.kind,
          documentId: authoringSessions.documentId,
          installationId: authoringSessions.installationId,
          activationGrantId: authoringSessions.activationGrantId,
          customerOrigin: authoringSessions.customerOrigin,
          capabilities: authoringSessions.capabilities,
          compilerVersion: authoringSessions.compilerVersion,
          rendererContractVersion: authoringSessions.rendererContractVersion,
          themeContractVersion: authoringSessions.themeContractVersion,
          themeVersionId: authoringSessions.themeVersionId,
          correlationId: authoringSessions.correlationId,
          tokenHash: authoringSessions.tokenHash,
          iframeSrc: authoringSessions.iframeSrc,
          createdByUserId: authoringSessions.createdByUserId,
          createdAt: authoringSessions.createdAt,
          expiresAt: authoringSessions.expiresAt,
          revokedAt: authoringSessions.revokedAt,
        })
        .from(authoringSessions)
        .innerJoin(environments, eq(authoringSessions.environmentId, environments.id))
        .where(
          and(
            eq(authoringSessions.workspaceId, workspaceId),
            eq(authoringSessions.tokenHash, tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
            eq(environments.enabled, true),
            eq(environments.authoringEnabled, true),
            sql`${environments.kind} <> 'production'`,
          ),
        )
        .limit(1);

      if (!row) return null;
      await this.setTenantActorScope(tx, row.workspaceId, row.createdByUserId);
      if (!(await this.hasAuthoringMembership(tx, row.workspaceId, row.createdByUserId))) {
        return null;
      }
      return toAuthoringSessionRecord(row, row.environment);
    });
  }

  async resolveAuthoringSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    if (!isSha256Hash(tokenHash)) return null;
    return runWithAuthoringSessionLookupScope(this.database, tokenHash, async (tx) => {
      const [session] = await tx
        .select()
        .from(authoringSessions)
        .where(
          and(
            eq(authoringSessions.tokenHash, tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);
      if (!session) return null;

      await this.setTenantActorScope(tx, session.workspaceId, session.createdByUserId);
      const [environment] = await tx
        .select({ kind: environments.kind })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, session.workspaceId),
            eq(environments.id, session.environmentId),
            eq(environments.enabled, true),
            eq(environments.authoringEnabled, true),
            sql`${environments.kind} <> 'production'`,
          ),
        )
        .limit(1);
      if (!environment) return null;
      if (!(await this.hasAuthoringMembership(tx, session.workspaceId, session.createdByUserId))) {
        return null;
      }
      if (
        session.installationId &&
        session.customerOrigin &&
        !(await this.hasActiveAuthoringScope(
          tx,
          session.workspaceId,
          session.environmentId,
          session.installationId,
          session.customerOrigin,
        ))
      ) {
        return null;
      }
      return toAuthoringSessionRecord(session, environment.kind);
    });
  }

  async acknowledgeDocumentTheme(
    input: AcknowledgeDocumentThemeInput,
  ): Promise<PersistedDocument | null> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(documents)
        .where(
          and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)),
        )
        .limit(1)
        .for('update');
      const binding = current?.canonical.themeBinding;
      const nextBinding = input.document.themeBinding;
      if (
        !current ||
        toIsoString(current.updatedAt) !== input.expectedDocumentUpdatedAt ||
        !binding ||
        binding.policy !== 'workspace-current' ||
        binding.acknowledgedThemeVersionId !== input.expectedThemeVersionId ||
        !nextBinding ||
        nextBinding.policy !== 'workspace-current' ||
        nextBinding.themeId !== binding.themeId ||
        nextBinding.acknowledgedThemeVersionId !== input.reviewedThemeVersionId ||
        input.document.id !== input.documentId
      ) {
        return null;
      }

      const [theme] = await tx
        .select({ activeVersionId: themes.activeVersionId })
        .from(themes)
        .where(and(eq(themes.workspaceId, input.workspaceId), eq(themes.id, binding.themeId)))
        .limit(1)
        .for('update');
      if (theme?.activeVersionId !== input.reviewedThemeVersionId) return null;

      const [session] = await tx
        .select()
        .from(authoringSessions)
        .where(
          and(
            eq(authoringSessions.workspaceId, input.workspaceId),
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.documentId, input.documentId),
            eq(authoringSessions.createdByUserId, input.actorUserId),
            eq(authoringSessions.themeVersionId, input.expectedThemeVersionId),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1)
        .for('update');
      if (!session) return null;

      const now = new Date();
      const [savedDocument] = await tx
        .update(documents)
        .set({
          type: input.document.type,
          status: input.document.status,
          title: input.document.title,
          schemaVersion: input.document.schemaVersion,
          canonical: input.document,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(documents.workspaceId, input.workspaceId),
            eq(documents.id, input.documentId),
            eq(documents.updatedAt, current.updatedAt),
          ),
        )
        .returning();
      if (!savedDocument) throw new Error('document Brand acknowledgement CAS failed');

      const documentVersion = await this.insertDocumentVersion(tx, input, now);
      const latestArtifact = await this.persistCompiledArtifact(
        tx,
        input.workspaceId,
        documentVersion.id,
        input.artifact,
        now,
      );
      const [advancedSession] = await tx
        .update(authoringSessions)
        .set({ themeVersionId: input.reviewedThemeVersionId })
        .where(
          and(
            eq(authoringSessions.workspaceId, input.workspaceId),
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.documentId, input.documentId),
            eq(authoringSessions.createdByUserId, input.actorUserId),
            eq(authoringSessions.themeVersionId, input.expectedThemeVersionId),
            isNull(authoringSessions.revokedAt),
          ),
        )
        .returning({ id: authoringSessions.id });
      if (!advancedSession) throw new Error('authoring session Brand acknowledgement CAS failed');

      return {
        document: savedDocument.canonical,
        createdByUserId: savedDocument.createdByUserId,
        updatedByUserId: savedDocument.updatedByUserId,
        updatedAt: toIsoString(savedDocument.updatedAt),
        latestArtifact,
      };
    });
  }

  async revokeAuthoringSession(
    input: RevokeAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord | null> {
    if (!input.sessionId.trim() || !isSha256Hash(input.tokenHash)) return null;
    return runWithAuthoringSessionLookupScope(this.database, input.tokenHash, async (tx) => {
      const [session] = await tx
        .select()
        .from(authoringSessions)
        .where(
          and(
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.tokenHash, input.tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);
      if (!session) return null;

      await this.setTenantActorScope(tx, session.workspaceId, session.createdByUserId);
      const [environment] = await tx
        .select({ kind: environments.kind })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, session.workspaceId),
            eq(environments.id, session.environmentId),
          ),
        )
        .limit(1);
      if (!environment) return null;
      if (
        session.installationId &&
        session.customerOrigin &&
        (!(await this.hasActiveAuthoringScope(
          tx,
          session.workspaceId,
          session.environmentId,
          session.installationId,
          session.customerOrigin,
        )) ||
          !(await this.hasAuthoringMembership(tx, session.workspaceId, session.createdByUserId)))
      ) {
        return null;
      }

      const [revoked] = await tx
        .update(authoringSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authoringSessions.workspaceId, session.workspaceId),
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.tokenHash, input.tokenHash),
            isNull(authoringSessions.revokedAt),
          ),
        )
        .returning();
      return revoked ? toAuthoringSessionRecord(revoked, environment.kind) : null;
    });
  }
}
