import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  isDeliverableExperienceType,
  LodariqDocument as LodariqDocumentSchema,
  validate,
  type AuthoringPageDocumentSummary,
  type QueryAuthoringDocumentsResult,
} from '@lodariq/schema';
import { normalizeExactOrigin } from '../domains/environments';
import {
  AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS,
  type ActivatedAuthoringDocumentSessionRecord,
  type AuthoringActivationGrantRecord,
  type AuthoringDocumentSessionRecord,
  type AuthoringSessionRecord,
} from '../domains/sdk-authoring';
import {
  type CreateAuthoringDocumentSessionFromActivationInput,
  type PersistedDocument,
  type QueryAuthoringDocumentsFromActivationInput,
} from '../domains/documents';
import {
  canActivateDocumentIntent,
  createOpaqueRecordId,
  createServerOwnedExperienceDraft,
  getAuthoringDocumentSessionCapabilities,
  hasValidFutureTtl,
  isAuthoringDocumentQueryScope,
  isSha256Hash,
  isTrustedEditorIframeSrc,
  isValidAuthoringDocumentIntent,
  matchesAuthoringPageContext,
  normalizeAuthoringPathname,
} from '../domains/authoring-policy';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryAuthoringAuthorization } from './authoring-authorization';

export class InMemoryRepositoryAuthoringActivation extends InMemoryRepositoryAuthoringAuthorization {
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

    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.activationGrantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant || !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)) {
      return null;
    }

    const authoringScope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !authoringScope ||
      authoringScope.installation.workspaceId !== grant.workspaceId ||
      authoringScope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }

    const pageContext = { pathname };
    const documents = [...this.documents.values()]
      .filter(
        (entry) =>
          entry.document.workspaceId === grant.workspaceId &&
          isDeliverableExperienceType(entry.document.type) &&
          (input.scope === 'workspace' ||
            matchesAuthoringPageContext(entry.document, exactOrigin, pageContext)),
      )
      .flatMap<AuthoringPageDocumentSummary>((entry) =>
        isDeliverableExperienceType(entry.document.type)
          ? [
              {
                id: entry.document.id,
                title: entry.document.title,
                type: entry.document.type,
                status: entry.document.status,
                updatedAt: entry.updatedAt,
                releases: this.listDocumentPublicationSummaries(
                  grant.workspaceId,
                  entry.document.id,
                ),
              },
            ]
          : [],
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return clone({ scope: input.scope, pageContext, documents });
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
      !hasValidFutureTtl(input.expiresAt, AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS) ||
      [...this.authoringSessions.values()].some(
        (candidate) => candidate.tokenHash === input.sessionTokenHash,
      )
    ) {
      return null;
    }

    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.activationGrantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant || !canActivateDocumentIntent(grant, input.documentIntent)) return null;
    if (
      input.selectionScope === 'workspace' &&
      !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== grant.workspaceId ||
      scope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }

    const existingDocument =
      input.documentIntent.kind === 'existing'
        ? this.documents.get(this.key(grant.workspaceId, input.documentIntent.documentId))
        : null;
    if (input.documentIntent.kind === 'existing') {
      if (
        !existingDocument ||
        !isDeliverableExperienceType(existingDocument.document.type) ||
        (input.selectionScope === 'page' &&
          !matchesAuthoringPageContext(existingDocument.document, exactOrigin, { pathname }))
      ) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const documentCreated = input.documentIntent.kind === 'new-draft';
    const defaultTheme = [...this.themes.values()].find(
      (theme) => theme.workspaceId === grant.workspaceId && theme.isDefault,
    );
    const document =
      input.documentIntent.kind === 'new-draft'
        ? createServerOwnedExperienceDraft(
            grant.workspaceId,
            grant.environment,
            exactOrigin,
            { pathname },
            input.documentIntent.documentType,
            defaultTheme,
          )
        : existingDocument?.document;
    if (!document || !validate(LodariqDocumentSchema, document).valid) return null;
    const compatibility = this.resolveAuthoringSessionCompatibility(document);
    if (!compatibility) return null;

    const consumedGrant: AuthoringActivationGrantRecord = { ...grant, usedAt: now };
    const sessionId = createOpaqueRecordId('authsess');
    const capabilities = getAuthoringDocumentSessionCapabilities(grant.environment);
    const session: AuthoringDocumentSessionRecord = {
      sessionId,
      correlationId: input.correlationId,
      installationId: grant.installationId,
      activationGrantId: grant.grantId,
      workspaceId: grant.workspaceId,
      environmentId: grant.environmentId,
      environment: grant.environment,
      documentId: document.id,
      customerOrigin: grant.exactOrigin,
      creatorId: grant.creatorId,
      capabilities,
      ...compatibility,
      tokenHash: input.sessionTokenHash,
      iframeSrc: input.iframeSrc,
      createdAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    const storedSession: AuthoringSessionRecord = {
      id: session.sessionId,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      environment: session.environment,
      documentId: session.documentId,
      correlationId: session.correlationId,
      tokenHash: session.tokenHash,
      iframeSrc: session.iframeSrc,
      createdByUserId: session.creatorId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: null,
      installationId: session.installationId,
      activationGrantId: session.activationGrantId,
      customerOrigin: session.customerOrigin,
      capabilities: [...session.capabilities],
      compilerVersion: session.compilerVersion,
      rendererContractVersion: session.rendererContractVersion,
      themeContractVersion: session.themeContractVersion,
      themeVersionId: session.themeVersionId,
    };

    this.authoringActivationGrants.set(consumedGrant.grantId, consumedGrant);
    if (documentCreated) {
      const persistedDocument: PersistedDocument = {
        document: clone(document),
        createdByUserId: grant.creatorId,
        updatedByUserId: grant.creatorId,
        updatedAt: now,
      };
      this.documents.set(this.key(grant.workspaceId, document.id), persistedDocument);
      this.appendDocumentVersion({
        id: `${document.id}_v_1`,
        workspaceId: grant.workspaceId,
        documentId: document.id,
        version: 1,
        canonical: clone(document),
        createdByUserId: grant.creatorId,
        createdAt: now,
      });
    }
    this.authoringSessions.set(this.key(session.workspaceId, session.sessionId), storedSession);
    return clone({ activationGrant: consumedGrant, session, documentCreated });
  }
}
