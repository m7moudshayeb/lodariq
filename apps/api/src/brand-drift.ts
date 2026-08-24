import { randomUUID } from 'node:crypto';
import { canonicalJson } from '@lodariq/compiler';
import {
  AuthoringBrandDriftCheckResult as AuthoringBrandDriftCheckResultSchema,
  BrandDriftCheckRequest as BrandDriftCheckRequestSchema,
  classifyBrandDrift,
  createBrandDriftAuditReport,
  validate,
  type AuthoringBrandDriftCheckResult,
  type BrandDocumentThemeReviewState,
  type BrandDriftAffectedExperience,
  type BrandDriftCheckRequest,
  type BrandThemeSnapshot,
  type LodariqDocument,
  type ProductStyleSource,
} from '@lodariq/schema';
import type {
  AuthoringSessionRecord,
  ControlPlaneRepository,
  StyleSourceRecord,
  WorkspaceThemeImpactRecord,
  WorkspaceThemeRecord,
} from '@lodariq/database';
import { createWorkspaceThemeDraftPreviewSnapshot } from '@lodariq/database';
import { mergeProductStyleTokensIntoDraft } from './product-style-theme';
import { enqueueGovernanceWebhookEvent } from './governance-events';
import type { BrandDriftEmailNotifier } from './brand-drift-email';
import type { ObservabilitySink } from './observability';

export const BRAND_DRIFT_CHECK_ERROR_CODES = [
  'invalid_brand_drift_check',
  'brand_drift_document_unavailable',
  'brand_drift_theme_unavailable',
  'authoring_session_compatibility_changed',
] as const;
export type BrandDriftCheckErrorCode = (typeof BRAND_DRIFT_CHECK_ERROR_CODES)[number];

export class BrandDriftCheckError extends Error {
  constructor(
    readonly code: BrandDriftCheckErrorCode,
    readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'BrandDriftCheckError';
  }
}

export interface CheckAuthoringBrandDriftInput {
  repository: ControlPlaneRepository;
  session: AuthoringSessionRecord;
  request: BrandDriftCheckRequest;
  now?: () => Date;
  createCheckId?: () => string;
  emailNotifier?: BrandDriftEmailNotifier;
  observability?: ObservabilitySink;
}

/**
 * Authenticated-authoring drift detection. It appends one bounded immutable
 * audit report, but never mutates the document, Brand draft/approval state, or
 * staging/production pointers.
 */
export async function checkAuthoringBrandDrift(
  input: CheckAuthoringBrandDriftInput,
): Promise<AuthoringBrandDriftCheckResult> {
  const request = validate(BrandDriftCheckRequestSchema, input.request);
  if (!request.valid) {
    throw new BrandDriftCheckError(
      'invalid_brand_drift_check',
      400,
      'Brand drift requires one bounded normalized product-style observation',
    );
  }

  const record = await input.repository.getDocument(
    input.session.workspaceId,
    input.session.documentId,
  );
  if (!record) {
    throw new BrandDriftCheckError(
      'brand_drift_document_unavailable',
      404,
      'The authoring document is unavailable',
    );
  }
  const context = await resolveDriftContext(input.repository, input.session, record.document);
  const drift = classifyBrandDrift({
    checkId: (input.createCheckId ?? defaultCheckId)(),
    checkedAt: (input.now ?? defaultNow)().toISOString(),
    trigger: request.value.trigger,
    baselineTheme: context.baselineTheme,
    baselineSources: context.baselineSources,
    observedProposal: request.value.proposal,
    affectedExperiences: context.affectedExperiences,
  });
  const runtimePreview =
    drift.classification === 'actionable'
      ? createRuntimePreview(context, request.value.proposal)
      : undefined;
  await input.repository.createBrandDriftRun({
    workspaceId: input.session.workspaceId,
    environmentId: input.session.environmentId,
    documentId: input.session.documentId,
    themeId: drift.themeId,
    baselineThemeVersionId: drift.baselineThemeVersionId,
    report: createBrandDriftAuditReport(drift),
    actorUserId: input.session.createdByUserId,
  });
  if (drift.classification !== 'unchanged') {
    await enqueueGovernanceWebhookEvent(input.repository, {
      workspaceId: input.session.workspaceId,
      type: 'brand.drift_detected',
      occurredAt: drift.checkedAt,
      data: {
        checkId: drift.checkId,
        documentId: input.session.documentId,
        environmentId: input.session.environmentId,
        themeId: drift.themeId,
        baselineThemeVersionId: drift.baselineThemeVersionId,
        classification: drift.classification,
        confidence: drift.confidence,
        changedRoles: [...drift.changedRoles],
        affectedExperienceCount: drift.affectedExperiences.length,
      },
    });
    await sendBrandDriftEmail(input, drift);
  }
  const result = validate(AuthoringBrandDriftCheckResultSchema, {
    documentId: input.session.documentId,
    drift,
    documentThemeReview: context.documentThemeReview,
    documentUpdatedAt: record.updatedAt,
    ...(runtimePreview ? { runtimePreview } : {}),
  });
  if (!result.valid) {
    throw new Error('Brand drift result failed canonical schema validation');
  }
  return structuredClone(result.value);
}

async function sendBrandDriftEmail(
  input: CheckAuthoringBrandDriftInput,
  drift: AuthoringBrandDriftCheckResult['drift'],
): Promise<void> {
  if (!input.emailNotifier) return;
  const recipient = await input.repository.getIdentityUser(input.session.createdByUserId);
  if (!recipient?.emailVerifiedAt) return;
  try {
    await input.emailNotifier.send({
      recipientEmail: recipient.email,
      recipientName: recipient.name ?? null,
      workspaceId: input.session.workspaceId,
      documentId: input.session.documentId,
      environmentId: input.session.environmentId,
      drift,
    });
    input.observability?.emit({
      name: 'brand_drift.email_delivered',
      timestamp: drift.checkedAt,
      correlationId: drift.checkId,
      workspaceId: input.session.workspaceId,
      documentId: input.session.documentId,
      environmentId: input.session.environmentId,
      userId: input.session.createdByUserId,
    });
  } catch {
    input.observability?.emit({
      name: 'brand_drift.email_failed',
      timestamp: drift.checkedAt,
      correlationId: drift.checkId,
      workspaceId: input.session.workspaceId,
      documentId: input.session.documentId,
      environmentId: input.session.environmentId,
      userId: input.session.createdByUserId,
    });
  }
}

interface BrandDriftContext {
  baselineTheme: BrandThemeSnapshot;
  baselineSources: ProductStyleSource[];
  affectedExperiences: BrandDriftAffectedExperience[];
  documentThemeReview: BrandDocumentThemeReviewState | null;
  workspaceTheme: WorkspaceThemeRecord;
}

async function resolveDriftContext(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  document: LodariqDocument,
): Promise<BrandDriftContext> {
  const binding = document.themeBinding;
  if (!binding) {
    throw new BrandDriftCheckError(
      'brand_drift_theme_unavailable',
      409,
      'Choose an approved workspace Brand theme before checking drift',
    );
  }

  const [theme, versions, sourceRecords, impact] = await Promise.all([
    repository.getWorkspaceTheme(document.workspaceId, binding.themeId),
    repository.listWorkspaceThemeVersions(document.workspaceId, binding.themeId),
    repository.listStyleSources(document.workspaceId, binding.themeId),
    repository.listWorkspaceThemeImpact(document.workspaceId, binding.themeId),
  ]);
  if (!theme) {
    throw new BrandDriftCheckError(
      'brand_drift_theme_unavailable',
      409,
      'The document Brand theme is unavailable',
    );
  }
  const baselineVersionId =
    binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId;
  const baselineVersion = versions.find((version) => version.id === baselineVersionId);
  if (!baselineVersion) {
    throw new BrandDriftCheckError(
      'brand_drift_theme_unavailable',
      409,
      'The acknowledged Brand theme version is unavailable',
    );
  }
  assertSessionTheme(session, baselineVersion.snapshot);

  return {
    baselineTheme: baselineVersion.snapshot,
    baselineSources: latestCompleteStyleSourceSet(sourceRecords, {
      environmentId: session.environmentId,
      approvedAt: baselineVersion.approvedAt,
    }).map((record) => structuredClone(record.source)),
    affectedExperiences: affectedExperiences(theme, impact),
    documentThemeReview: documentThemeReviewState(binding, theme),
    workspaceTheme: theme,
  };
}

function createRuntimePreview(
  context: BrandDriftContext,
  proposal: BrandDriftCheckRequest['proposal'],
) {
  const proposedDraft = mergeProductStyleTokensIntoDraft(context.workspaceTheme.draft, proposal);
  const draftChanged = canonicalJson(proposedDraft) !== canonicalJson(context.workspaceTheme.draft);
  const proposedTheme = createWorkspaceThemeDraftPreviewSnapshot({
    id: context.workspaceTheme.id,
    name: context.workspaceTheme.name,
    draft: proposedDraft,
    revision: context.workspaceTheme.revision + (draftChanged ? 1 : 0),
  });
  return {
    currentTheme: structuredClone(context.baselineTheme),
    proposedTheme,
  };
}

export function latestCompleteStyleSourceSet(
  records: readonly StyleSourceRecord[],
  scope: { environmentId: string; approvedAt: string },
): StyleSourceRecord[] {
  const eligible = records
    .filter(
      (record) =>
        record.environmentId === scope.environmentId && record.createdAt <= scope.approvedAt,
    )
    .sort(compareStyleSourceRecency);
  const proposalIds = [...new Set(eligible.map((record) => record.proposalId))];
  for (const proposalId of proposalIds) {
    const proposalRecords = eligible
      .filter((record) => record.proposalId === proposalId)
      .sort(
        (left, right) =>
          left.sourceOrdinal - right.sourceOrdinal || left.id.localeCompare(right.id),
      );
    const sourceCount = proposalRecords[0]?.sourceCount ?? 0;
    if (
      sourceCount > 0 &&
      proposalRecords.length === sourceCount &&
      proposalRecords.every(
        (record, ordinal) =>
          record.sourceCount === sourceCount &&
          record.sourceOrdinal === ordinal &&
          record.appliedThemeRevision === proposalRecords[0]?.appliedThemeRevision,
      )
    ) {
      return proposalRecords.map((record) => structuredClone(record));
    }
  }
  return [];
}

function affectedExperiences(
  theme: WorkspaceThemeRecord,
  impact: readonly WorkspaceThemeImpactRecord[],
): BrandDriftAffectedExperience[] {
  return impact.flatMap((item) => {
    if (item.bindingPolicy !== 'workspace-current') return [];
    const needsReview =
      Boolean(theme.activeVersionId) && item.acknowledgedThemeVersionId !== theme.activeVersionId;
    return [
      {
        documentId: item.documentId,
        bindingPolicy: 'workspace-current' as const,
        impact: needsReview
          ? ('needs_review' as const)
          : ('would_require_review_on_approval' as const),
      },
    ];
  });
}

function documentThemeReviewState(
  binding: NonNullable<LodariqDocument['themeBinding']>,
  theme: WorkspaceThemeRecord,
): BrandDocumentThemeReviewState {
  if (binding.policy === 'pinned') {
    return {
      policy: 'pinned',
      reviewState: 'pinned',
      themeId: binding.themeId,
      themeVersionId: binding.themeVersionId,
    };
  }
  const approvedThemeVersionId = theme.activeVersionId ?? binding.acknowledgedThemeVersionId;
  return {
    policy: 'workspace-current',
    reviewState:
      approvedThemeVersionId === binding.acknowledgedThemeVersionId ? 'current' : 'needs_review',
    themeId: binding.themeId,
    approvedThemeVersionId,
    acknowledgedThemeVersionId: binding.acknowledgedThemeVersionId,
  };
}

function assertSessionTheme(
  session: AuthoringSessionRecord,
  baselineTheme: BrandThemeSnapshot,
): void {
  if (session.themeVersionId === baselineTheme.themeVersionId) return;
  throw new BrandDriftCheckError(
    'authoring_session_compatibility_changed',
    409,
    'The document Brand theme changed; reopen authoring before checking Brand drift',
  );
}

function compareStyleSourceRecency(left: StyleSourceRecord, right: StyleSourceRecord): number {
  const createdOrder = right.createdAt.localeCompare(left.createdAt);
  if (createdOrder !== 0) return createdOrder;
  const proposalOrder = right.proposalId.localeCompare(left.proposalId);
  if (proposalOrder !== 0) return proposalOrder;
  return left.sourceOrdinal - right.sourceOrdinal || left.id.localeCompare(right.id);
}

function defaultCheckId(): string {
  return `brand_check_${randomUUID()}`;
}

function defaultNow(): Date {
  return new Date();
}
