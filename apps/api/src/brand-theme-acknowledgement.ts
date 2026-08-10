import {
  AuthoringBrandThemeAcknowledgementResult as AuthoringBrandThemeAcknowledgementResultSchema,
  validate,
  type AuthoringBrandThemeAcknowledgementResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type BrandDocumentThemeReviewState,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import type {
  AuthoringSessionRecord,
  ControlPlaneRepository,
  WorkspaceThemeRecord,
} from '@lodariq/database';

export const BRAND_THEME_ACKNOWLEDGEMENT_ERROR_CODES = [
  'brand_theme_acknowledgement_unavailable',
  'brand_drift_document_unavailable',
  'brand_drift_theme_unavailable',
  'authoring_session_compatibility_changed',
] as const;
export type BrandThemeAcknowledgementErrorCode =
  (typeof BRAND_THEME_ACKNOWLEDGEMENT_ERROR_CODES)[number];

export class BrandThemeAcknowledgementError extends Error {
  constructor(
    readonly code: BrandThemeAcknowledgementErrorCode,
    readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'BrandThemeAcknowledgementError';
  }
}

export interface AcknowledgeAuthoringBrandThemeInput {
  repository: ControlPlaneRepository;
  session: AuthoringSessionRecord;
  request: AuthoringBrandThemeAcknowledgementRequest;
  compile: (document: LodariqDocument) => Promise<CompiledDocument>;
}

/**
 * Explicitly advances one workspace-current document to the approved Brand
 * version. Pinned documents are returned unchanged, and no publication pointer
 * or approved/live Brand state is touched.
 */
export async function acknowledgeAuthoringBrandTheme(
  input: AcknowledgeAuthoringBrandThemeInput,
): Promise<AuthoringBrandThemeAcknowledgementResult> {
  const record = await input.repository.getDocument(
    input.session.workspaceId,
    input.session.documentId,
  );
  if (!record) {
    throw new BrandThemeAcknowledgementError(
      'brand_drift_document_unavailable',
      404,
      'The authoring document is unavailable',
    );
  }
  const binding = record.document.themeBinding;
  if (!binding) {
    throw new BrandThemeAcknowledgementError(
      'brand_theme_acknowledgement_unavailable',
      409,
      'Choose an approved workspace Brand theme before acknowledging it',
    );
  }
  const [theme, versions] = await Promise.all([
    input.repository.getWorkspaceTheme(input.session.workspaceId, binding.themeId),
    input.repository.listWorkspaceThemeVersions(input.session.workspaceId, binding.themeId),
  ]);
  if (!theme) throw unavailableTheme();

  if (binding.policy === 'pinned') {
    throw new BrandThemeAcknowledgementError(
      'brand_theme_acknowledgement_unavailable',
      409,
      'Pinned Brand versions do not follow workspace approvals',
    );
  }

  if (
    input.request.expectedDocumentUpdatedAt !== record.updatedAt ||
    input.request.expectedAcknowledgedThemeVersionId !== binding.acknowledgedThemeVersionId ||
    input.session.themeVersionId !== input.request.expectedAcknowledgedThemeVersionId
  ) {
    throw compatibilityChanged();
  }
  const reviewedDocumentBinding = input.request.document.themeBinding;
  if (
    input.request.document.workspaceId !== input.session.workspaceId ||
    input.request.document.id !== input.session.documentId ||
    !reviewedDocumentBinding ||
    reviewedDocumentBinding.policy !== 'workspace-current' ||
    reviewedDocumentBinding.themeId !== binding.themeId ||
    reviewedDocumentBinding.acknowledgedThemeVersionId !==
      input.request.expectedAcknowledgedThemeVersionId
  ) {
    throw compatibilityChanged();
  }
  if (theme.activeVersionId !== input.request.reviewedThemeVersionId) {
    throw new BrandThemeAcknowledgementError(
      'authoring_session_compatibility_changed',
      409,
      'The approved Brand version changed after review; check Brand again before acknowledging',
    );
  }
  const approved = versions.find((version) => version.id === input.request.reviewedThemeVersionId);
  if (!approved) throw unavailableTheme();

  if (binding.acknowledgedThemeVersionId === approved.id) {
    return checkedResult({
      document: record.document,
      theme: approved.snapshot,
      documentThemeReview: currentReviewState(theme, approved.id),
      documentUpdatedAt: record.updatedAt,
    });
  }

  const document = structuredClone(input.request.document);
  delete document.themeRef;
  document.themeBinding = {
    policy: 'workspace-current',
    themeId: binding.themeId,
    acknowledgedThemeVersionId: approved.id,
  };
  const compiled = await input.compile(document);
  if (
    !('theme' in compiled) ||
    compiled.theme.themeId !== binding.themeId ||
    compiled.theme.themeVersionId !== approved.id ||
    compiled.theme.contentHash !== approved.snapshot.contentHash
  ) {
    throw compatibilityChanged();
  }
  const saved = await input.repository.acknowledgeDocumentTheme({
    workspaceId: input.session.workspaceId,
    sessionId: input.session.id,
    documentId: input.session.documentId,
    actorUserId: input.session.createdByUserId,
    expectedDocumentUpdatedAt: input.request.expectedDocumentUpdatedAt,
    expectedThemeVersionId: input.request.expectedAcknowledgedThemeVersionId,
    reviewedThemeVersionId: input.request.reviewedThemeVersionId,
    document,
    artifact: compiled,
  });
  if (!saved) throw compatibilityChanged();

  return checkedResult({
    document: saved.document,
    theme: approved.snapshot,
    documentThemeReview: currentReviewState(theme, approved.id),
    documentUpdatedAt: saved.updatedAt,
  });
}

function currentReviewState(
  theme: WorkspaceThemeRecord,
  approvedThemeVersionId: string,
): BrandDocumentThemeReviewState {
  return {
    policy: 'workspace-current',
    reviewState: 'current',
    themeId: theme.id,
    approvedThemeVersionId,
    acknowledgedThemeVersionId: approvedThemeVersionId,
  };
}

function checkedResult(
  value: AuthoringBrandThemeAcknowledgementResult,
): AuthoringBrandThemeAcknowledgementResult {
  const result = validate(AuthoringBrandThemeAcknowledgementResultSchema, value);
  if (!result.valid) throw new Error('Brand acknowledgement failed canonical schema validation');
  return structuredClone(result.value);
}

function unavailableTheme(): BrandThemeAcknowledgementError {
  return new BrandThemeAcknowledgementError(
    'brand_drift_theme_unavailable',
    409,
    'The approved Brand theme version is unavailable',
  );
}

function compatibilityChanged(): BrandThemeAcknowledgementError {
  return new BrandThemeAcknowledgementError(
    'authoring_session_compatibility_changed',
    409,
    'The document Brand theme changed; reopen authoring before continuing',
  );
}
