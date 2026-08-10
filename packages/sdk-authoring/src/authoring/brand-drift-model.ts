import {
  BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCE_LABELS,
  BRAND_DRIFT_SEMANTIC_ROLE_LABELS,
  type BrandDocumentThemeReviewState,
  type BrandDriftCheckResult,
  type BrandDriftClassification,
  type BrandDriftRuntimePreview,
  type ProductStyleProposal,
  type ProductStyleSourceKind,
} from '@lodariq/schema';

const SOURCE_LABELS: Record<ProductStyleSourceKind, string> = {
  registered_tokens: 'Registered product tokens',
  selected_element: 'Selected product element',
  page_typography: 'Page typography',
  ancestor_context: 'Ancestor context',
  nearby_control: 'Nearby controls',
  fallback: 'Accessible fallback',
};

const SOURCE_CHANGE_LABELS = {
  added: 'New evidence',
  removed: 'Evidence unavailable',
  changed: 'Fingerprint changed',
} as const;

const CLASSIFICATION_PRESENTATION: Record<
  BrandDriftClassification,
  { label: string; detail: string }
> = {
  unchanged: {
    label: 'Brand is current',
    detail: 'Normalized product evidence still matches the approved Brand theme.',
  },
  warning: {
    label: 'Brand evidence needs attention',
    detail: 'Product evidence changed, but it is not strong enough to propose an automatic repair.',
  },
  actionable: {
    label: 'Brand change ready to review',
    detail: 'Strong semantic evidence produced a proposal. Nothing changes until you adopt it.',
  },
};

const EXPERIENCE_IMPACT_LABELS = {
  needs_review: 'Needs review for the approved Brand version',
  would_require_review_on_approval: 'Would need review after Brand approval',
} as const;

export interface AuthoringBrandDriftSourceItem {
  id: string;
  label: string;
  changeLabel: string;
  confidenceLabel: string;
  revision?: string;
}

export interface AuthoringBrandDriftRoleItem {
  id: string;
  label: string;
}

export interface AuthoringBrandDriftConsequenceItem {
  id: string;
  label: string;
  severity: 'review' | 'blocking';
}

export interface AuthoringBrandDriftAffectedExperienceItem {
  documentId: string;
  impact: keyof typeof EXPERIENCE_IMPACT_LABELS;
  impactLabel: string;
}

export interface AuthoringBrandAcknowledgementViewModel {
  state: 'unavailable' | 'current' | 'needs-review' | 'pinned';
  label: string;
  detail: string;
  canAcknowledge: boolean;
  approvedThemeVersionId?: string;
}

export interface AuthoringBrandDriftViewModel {
  state: 'not-checked' | BrandDriftClassification;
  label: string;
  detail: string;
  confidenceLabel?: string;
  checkedAt?: string;
  sourceItems: AuthoringBrandDriftSourceItem[];
  roleItems: AuthoringBrandDriftRoleItem[];
  consequenceItems: AuthoringBrandDriftConsequenceItem[];
  affectedExperienceItems: AuthoringBrandDriftAffectedExperienceItem[];
  affectedExperienceCount: number;
  proposal?: ProductStyleProposal;
  runtimePreview?: BrandDriftRuntimePreview;
  acknowledgement: AuthoringBrandAcknowledgementViewModel;
}

export function createAuthoringBrandDriftViewModel(
  result: BrandDriftCheckResult | null,
  reviewState: BrandDocumentThemeReviewState | null,
): AuthoringBrandDriftViewModel {
  const acknowledgement = acknowledgementViewModel(reviewState);
  if (!result) {
    return {
      state: 'not-checked',
      label: 'Brand has not been checked',
      detail: 'Check normalized product evidence without changing the Brand theme.',
      sourceItems: [],
      roleItems: [],
      consequenceItems: [],
      affectedExperienceItems: [],
      affectedExperienceCount: 0,
      acknowledgement,
    };
  }

  const presentation = CLASSIFICATION_PRESENTATION[result.classification];
  const affectedExperienceItems = dedupeAffectedExperiences(result.affectedExperiences);
  return {
    state: result.classification,
    label: presentation.label,
    detail: presentation.detail,
    confidenceLabel: confidenceLabel(result.confidence),
    checkedAt: result.checkedAt,
    sourceItems: result.sourceComparisons.map((comparison) => {
      const revision = sourceRevision(comparison);
      return {
        id: `${comparison.kind}:${comparison.sourceId}`,
        label: SOURCE_LABELS[comparison.kind],
        changeLabel: SOURCE_CHANGE_LABELS[comparison.change],
        confidenceLabel: confidenceLabel(comparison.confidence),
        ...(revision ? { revision } : {}),
      };
    }),
    roleItems: result.changedRoles.map((role) => ({
      id: role,
      label: BRAND_DRIFT_SEMANTIC_ROLE_LABELS[role],
    })),
    consequenceItems: result.accessibilityConsequences.map((consequence) => ({
      id: consequence.code,
      label: BRAND_DRIFT_ACCESSIBILITY_CONSEQUENCE_LABELS[consequence.code],
      severity: consequence.severity,
    })),
    affectedExperienceItems,
    affectedExperienceCount: affectedExperienceItems.length,
    ...(result.classification === 'actionable'
      ? { proposal: structuredClone(result.proposal) }
      : {}),
    acknowledgement,
  };
}

export function withAuthoringBrandDriftRuntimePreview(
  model: AuthoringBrandDriftViewModel,
  runtimePreview: BrandDriftRuntimePreview | undefined,
): AuthoringBrandDriftViewModel {
  return runtimePreview ? { ...model, runtimePreview: structuredClone(runtimePreview) } : model;
}

function dedupeAffectedExperiences(
  affected: BrandDriftCheckResult['affectedExperiences'],
): AuthoringBrandDriftAffectedExperienceItem[] {
  const byDocumentId = new Map<string, AuthoringBrandDriftAffectedExperienceItem>();
  for (const experience of affected) {
    const existing = byDocumentId.get(experience.documentId);
    if (existing?.impact === 'needs_review') continue;
    byDocumentId.set(experience.documentId, {
      documentId: experience.documentId,
      impact: experience.impact,
      impactLabel: EXPERIENCE_IMPACT_LABELS[experience.impact],
    });
  }
  return [...byDocumentId.values()].sort((left, right) =>
    left.documentId.localeCompare(right.documentId),
  );
}

function acknowledgementViewModel(
  reviewState: BrandDocumentThemeReviewState | null,
): AuthoringBrandAcknowledgementViewModel {
  if (!reviewState) {
    return {
      state: 'unavailable',
      label: 'Brand acknowledgement unavailable',
      detail: 'This session does not include document Brand acknowledgement truth.',
      canAcknowledge: false,
    };
  }
  if (reviewState.policy === 'pinned') {
    return {
      state: 'pinned',
      label: 'Pinned Brand version',
      detail: 'This experience remains on its explicitly pinned immutable Brand version.',
      canAcknowledge: false,
    };
  }
  if (reviewState.reviewState === 'needs_review') {
    return {
      state: 'needs-review',
      label: 'New Brand version needs review',
      detail: 'Review this experience, then explicitly acknowledge the approved Brand version.',
      canAcknowledge: true,
      approvedThemeVersionId: reviewState.approvedThemeVersionId,
    };
  }
  return {
    state: 'current',
    label: 'Brand version acknowledged',
    detail: 'This experience acknowledges the current approved Brand version.',
    canAcknowledge: false,
    approvedThemeVersionId: reviewState.approvedThemeVersionId,
  };
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 85) return `High confidence · ${confidence}%`;
  if (confidence >= 70) return `Medium confidence · ${confidence}%`;
  return `Low confidence · ${confidence}%`;
}

function sourceRevision(
  comparison: BrandDriftCheckResult['sourceComparisons'][number],
): string | undefined {
  if ('observedRevision' in comparison && comparison.observedRevision) {
    return comparison.observedRevision;
  }
  if ('previousRevision' in comparison) return comparison.previousRevision;
  return undefined;
}
