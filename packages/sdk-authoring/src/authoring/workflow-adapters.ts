import type {
  AuthoringStagingReleaseState,
  BrowserVerificationCheckCode,
  BrandThemeSnapshot,
  ProductStyleProposal,
  PublicationVerification,
  ProductionPromotionResult,
} from '@lodariq/schema';
import type {
  AuthoringBrandMatchProposal,
  AuthoringBrandSourceDescriptor,
  AuthoringBrandWorkspaceState,
  AuthoringReleaseArtifactState,
  AuthoringReleaseVerification,
  AuthoringReleaseWorkflowState,
} from './local-frame-types';

const VERIFICATION_CHECK_LABELS: Record<BrowserVerificationCheckCode, string> = {
  artifact_integrity: 'Exact artifact loaded',
  renderer_ready: 'Renderer ready',
  targets_resolved: 'Targets resolved',
  overflow: 'Content fits',
  primary_action_clipping: 'Primary action visible',
  target_collision: 'Placement avoids target collision',
  font_fallback: 'Fonts loaded',
  stacking_context: 'Experience appears above the product',
  responsive_widths: 'Responsive width',
  dark_mode: 'Dark mode',
  rtl: 'Right-to-left layout',
  reduced_motion: 'Reduced motion',
  zoom_200: '200% zoom',
};

export interface ReleaseWorkflowCapabilities {
  canVerify: boolean;
  canPromote: boolean;
  canApprove?: boolean;
}

export function brandWorkspaceStateFromTheme(
  theme: BrandThemeSnapshot,
  proposal?: ProductStyleProposal,
): AuthoringBrandWorkspaceState {
  if (!proposal) {
    return {
      themeId: theme.themeId,
      themeName: theme.name,
      version: theme.version,
      status: 'approved',
      source: {
        kind: 'approved-theme',
        label: 'Approved Brand theme',
        detail: `Version ${theme.version} is used by this draft.`,
        revision: theme.themeVersionId,
      },
      canEdit: true,
      canApprove: false,
    };
  }
  return {
    themeId: theme.themeId,
    themeName: theme.name,
    version: theme.version,
    status: 'draft',
    source: proposalSourceDescriptor(proposal),
    canEdit: true,
    canApprove: false,
  };
}

export function brandMatchProposalForFrame(
  proposal: ProductStyleProposal,
  theme: BrandThemeSnapshot,
): AuthoringBrandMatchProposal {
  const current = theme.definition.tokens;
  const light = proposal.tokens.modes?.light;
  const proposedTypography = light?.typography ?? proposal.tokens.typography;
  const changes: AuthoringBrandMatchProposal['changes'] = [];
  appendRoleChange(
    changes,
    'accent',
    'Accent',
    current.modes.light.colors.accent,
    light?.colors?.accent,
  );
  appendRoleChange(
    changes,
    'surface',
    'Surface',
    current.modes.light.colors.surface,
    light?.colors?.surface,
  );
  appendRoleChange(changes, 'text', 'Text', current.modes.light.colors.text, light?.colors?.text);
  appendRoleChange(
    changes,
    'font',
    'Font',
    current.typography.fontFamilies.join(', '),
    proposedTypography?.fontFamilies?.join(', '),
  );
  appendRoleChange(
    changes,
    'radius',
    'Corner radius',
    `${current.radii.md}px`,
    proposal.tokens.radii?.md === undefined ? undefined : `${proposal.tokens.radii.md}px`,
  );
  return {
    id: proposal.proposalId,
    source: proposalSourceDescriptor(proposal),
    confidence: confidenceLevel(proposal.confidence),
    confidenceReason: confidenceReason(proposal),
    requiresConfirmation: proposal.requiresConfirmation,
    changes,
    evidence: structuredClone(proposal),
  };
}

export function releaseWorkflowFromState(
  release: AuthoringStagingReleaseState,
  capabilities: ReleaseWorkflowCapabilities,
): AuthoringReleaseWorkflowState {
  const pipeline = release.pipeline;
  if (!pipeline) return legacyReleaseWorkflow(release);
  const staging =
    pipeline.staging.compiledArtifactId && pipeline.staging.contentHash
      ? {
          environmentId: pipeline.staging.environmentId,
          generation: pipeline.staging.generation,
          ...(pipeline.staging.publicationId
            ? { publicationId: pipeline.staging.publicationId }
            : {}),
          artifactId: pipeline.staging.compiledArtifactId,
          contentHash: pipeline.staging.contentHash,
          verification: {
            state: verificationState(pipeline.staging.verification.state),
            ...(pipeline.staging.verification.verifiedAt
              ? { verifiedAt: pipeline.staging.verification.verifiedAt }
              : {}),
            checks: [],
          },
        }
      : null;
  const production =
    pipeline.production.compiledArtifactId && pipeline.production.contentHash
      ? {
          environmentId: pipeline.production.environmentId,
          generation: pipeline.production.generation,
          ...(pipeline.production.publicationId
            ? { publicationId: pipeline.production.publicationId }
            : {}),
          artifactId: pipeline.production.compiledArtifactId,
          contentHash: pipeline.production.contentHash,
        }
      : null;
  return {
    draft: {
      contentHash: release.draftContentHash ?? undefined,
      dirty: Boolean(
        release.draftContentHash && release.draftContentHash !== pipeline.staging.contentHash,
      ),
    },
    staging,
    production,
    environments: releasePipelineEnvironments(pipeline),
    canVerify: capabilities.canVerify,
    canPromote: capabilities.canPromote,
    canApprove: capabilities.canApprove ?? false,
    ...(pipeline.approvals.operationId
      ? { approvalOperationId: pipeline.approvals.operationId }
      : {}),
    approval: approvalState(pipeline),
  };
}

export function verificationForFrame(
  verification: PublicationVerification,
): AuthoringReleaseVerification {
  return {
    state: verification.result === 'passed' ? 'passed' : 'failed',
    verifiedAt: verification.createdAt,
    exactOrigin: verification.verifiedOrigin,
    checks: verification.report.checks.map((check) => {
      const status = verificationCheckStatus(check.status);
      return {
        id: check.code,
        label: VERIFICATION_CHECK_LABELS[check.code],
        status,
        detail: verificationCheckDetail(status),
      };
    }),
  };
}

export function productionArtifactForFrame(
  result: Extract<ProductionPromotionResult, { ok: true; state: 'completed' }>,
  productionEnvironmentId: string,
): AuthoringReleaseArtifactState {
  return {
    publicationId: result.publicationId,
    environmentId: productionEnvironmentId,
    generation: result.generation,
    artifactId: result.compiledArtifactId,
    contentHash: result.contentHash,
  };
}

function legacyReleaseWorkflow(
  release: AuthoringStagingReleaseState,
): AuthoringReleaseWorkflowState {
  const staging =
    release.activeContentHash && release.draftArtifactId
      ? {
          environmentId: release.environmentId,
          generation: release.expectedGeneration,
          artifactId: release.draftArtifactId,
          contentHash: release.activeContentHash,
          verification: { state: 'not-run' as const, checks: [] },
        }
      : null;
  return {
    draft: {
      contentHash: release.draftContentHash ?? undefined,
      dirty: Boolean(
        release.draftContentHash && release.draftContentHash !== release.activeContentHash,
      ),
    },
    staging,
    production: null,
    environments: [{ environment: 'staging', environmentId: release.environmentId }],
    // Legacy Slice 2 state has no publication identity or production CAS
    // pointer. Keep it visible as read-only truth, but never authorize an
    // exact-artifact mutation from incomplete evidence.
    canVerify: false,
    canPromote: false,
    canApprove: false,
    approval: 'not-required',
  };
}

function releasePipelineEnvironments(
  pipeline: NonNullable<AuthoringStagingReleaseState['pipeline']>,
): AuthoringReleaseWorkflowState['environments'] {
  const environments: NonNullable<AuthoringReleaseWorkflowState['environments']> = [
    { environment: 'staging', environmentId: pipeline.staging.environmentId },
  ];
  if (pipeline.production.environmentId !== pipeline.staging.environmentId) {
    return [
      ...environments,
      { environment: 'production', environmentId: pipeline.production.environmentId },
    ];
  }
  return environments;
}

function appendRoleChange(
  changes: AuthoringBrandMatchProposal['changes'],
  role: AuthoringBrandMatchProposal['changes'][number]['role'],
  label: string,
  before: string,
  after: string | undefined,
): void {
  if (!after || after === before) return;
  changes.push({ role, label, before, after });
}

function proposalSourceDescriptor(proposal: ProductStyleProposal): AuthoringBrandSourceDescriptor {
  const source =
    proposal.sources.find((candidate) => candidate.kind !== 'fallback') ?? proposal.sources[0];
  if (!source) {
    return {
      kind: 'accessible-fallback',
      label: 'Accessible fallback',
      detail: 'No product evidence was available.',
    };
  }
  if (source.kind === 'registered_tokens') {
    return {
      kind: 'registered-tokens',
      label: 'Registered product tokens',
      detail: `Explicit semantic tokens · ${source.confidence}% confidence`,
      ...(source.revision ? { revision: source.revision } : {}),
    };
  }
  return {
    kind: 'sampled-element',
    label: 'Product style sample',
    detail: `Privacy-safe semantic evidence · ${proposal.confidence}% confidence`,
  };
}

function confidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 85) return 'high';
  if (confidence >= 70) return 'medium';
  return 'low';
}

function confidenceReason(proposal: ProductStyleProposal): string {
  if (proposal.sources.some((source) => source.kind === 'registered_tokens')) {
    return 'Explicit product tokens take priority over inferred browser styles.';
  }
  if (proposal.confidence >= 85) {
    return 'The selected element produced a strong semantic style match.';
  }
  return 'The sample relies on surrounding styles, so confirm the proposed Brand roles.';
}

function verificationState(
  state: 'not_run' | 'passed' | 'failed',
): 'not-run' | 'passed' | 'failed' {
  return state === 'not_run' ? 'not-run' : state;
}

function approvalState(
  pipeline: NonNullable<AuthoringStagingReleaseState['pipeline']>,
): AuthoringReleaseWorkflowState['approval'] {
  if (pipeline.approvals.requiredCount === 0) return 'not-required';
  if (pipeline.approvals.approvedCount >= pipeline.approvals.requiredCount) return 'approved';
  return pipeline.state === 'awaiting_approval' ? 'requested' : 'required';
}

function verificationCheckDetail(status: 'passed' | 'warning' | 'failed'): string {
  if (status === 'passed') return 'Passed on this exact staging page.';
  if (status === 'warning') return 'Non-blocking review recommended.';
  return 'Fix this before production promotion.';
}

function verificationCheckStatus(value: unknown): 'passed' | 'warning' | 'failed' {
  if (value === 'passed' || value === 'warning' || value === 'failed') return value;
  return 'failed';
}
