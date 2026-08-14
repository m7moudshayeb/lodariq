import { runBasicVisualPreflight } from '@lodariq/compiler';
import { COMPILED_ARTIFACT_SCHEMA_VERSION, basicVisualPreflightIssueLabel } from '@lodariq/schema';
import {
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type PersistedCompiledArtifact,
  type PersistedReleaseOperation,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import type { AuthoringReleaseClient } from './release-recovery';
import {
  authoringSessionArtifactMatches,
  sendAuthoringSessionCompatibilityChanged,
} from './session-capabilities';
import { validateAuthoringStagingReleaseState } from './authoring-auth';
import {
  getThemeReleaseReview,
  hasLegacyThemeReference,
  validateDocumentReleaseReadiness,
} from './document-compilation';

export async function handleAuthoringReleaseState(
  options: ControlPlaneRouteOptions,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
  client: AuthoringReleaseClient,
) {
  const record = await options.repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const deployment = await options.repository.getDocumentDeployment(
    session.workspaceId,
    session.environmentId,
    session.documentId,
  );
  const activePublication = await options.repository.getCurrentPublicationForDocument(
    session.workspaceId,
    session.environmentId,
    session.documentId,
  );
  const latestArtifactCandidate = record.latestArtifact ?? null;
  if (
    latestArtifactCandidate &&
    !authoringSessionArtifactMatches(session, latestArtifactCandidate.compiled)
  ) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const latestArtifact = latestArtifactCandidate;
  const visualChecks = latestArtifact
    ? await options.repository.listVisualCheckRuns(session.workspaceId, session.documentId)
    : [];
  const visualCheck =
    visualChecks.find(
      (run) =>
        run.environmentId === session.environmentId &&
        run.compiledArtifactId === latestArtifact?.id &&
        run.contentHash === latestArtifact?.contentHash,
    ) ?? null;
  const publishIssues = validateDocumentReleaseReadiness(record.document);
  const themeMigrationRequired = hasLegacyThemeReference(record.document);
  const themeReview = themeMigrationRequired
    ? null
    : await getThemeReleaseReview(options.repository, record.document);
  const visualReport =
    visualCheck?.report ??
    (latestArtifact?.compiled.artifactSchemaVersion === COMPILED_ARTIFACT_SCHEMA_VERSION
      ? await runBasicVisualPreflight(latestArtifact.compiled, new Date().toISOString())
      : null);
  const findings = [
    ...publishIssues.map((issue) => ({
      code: issue.code,
      severity: issue.severity ?? ('blocker' as const),
      label: issue.message,
    })),
    ...(themeMigrationRequired
      ? [
          {
            code: 'theme_migration_required',
            severity: 'blocker' as const,
            label: 'Choose an approved Brand theme before publishing this legacy draft.',
          },
        ]
      : []),
    ...(themeReview
      ? [
          {
            code: 'theme_review_required',
            severity: 'blocker' as const,
            label: 'Review the latest approved Brand theme before publishing this draft.',
          },
        ]
      : []),
    ...(visualReport?.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      label: basicVisualPreflightIssueLabel(issue.code),
    })) ?? []),
  ];
  let state: 'open_in_staging' | 'no_saved_artifact' | 'ready' | 'current';
  if (session.environment !== 'staging') {
    state = 'open_in_staging';
  } else if (!latestArtifact) {
    state = 'no_saved_artifact';
  } else if (activePublication?.contentHash === latestArtifact.contentHash) {
    state = 'current';
  } else {
    state = 'ready';
  }
  const pipeline = await buildAuthoringReleasePipeline(
    options.repository,
    session.workspaceId,
    session.documentId,
    latestArtifact,
    findings.some((finding) => finding.severity === 'blocker'),
  );
  const releaseState = {
    available: session.environment === 'staging',
    environment: session.environment,
    environmentId: session.environmentId,
    documentId: session.documentId,
    expectedGeneration: deployment?.generation ?? 0,
    draftArtifactId: latestArtifact?.id ?? null,
    draftContentHash: latestArtifact?.contentHash ?? null,
    activeContentHash: activePublication?.contentHash ?? null,
    state,
    findings,
    ...(pipeline ? { pipeline } : {}),
  };
  if (client === 'direct-sdk') {
    return validateAuthoringStagingReleaseState(releaseState);
  }
  return { ...releaseState, visualCheck };
}

export async function buildAuthoringReleasePipeline(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  draftArtifact: PersistedCompiledArtifact | null,
  hasBlockers: boolean,
) {
  const environments = await repository.listEnvironments(workspaceId);
  const stagingEnvironment = environments.find((environment) => environment.kind === 'staging');
  const productionEnvironment = environments.find(
    (environment) => environment.kind === 'production',
  );
  if (!stagingEnvironment || !productionEnvironment) return null;

  const [stagingDeployment, productionDeployment, stagingPublication, productionPublication] =
    await Promise.all([
      repository.getDocumentDeployment(workspaceId, stagingEnvironment.id, documentId),
      repository.getDocumentDeployment(workspaceId, productionEnvironment.id, documentId),
      repository.getCurrentPublicationForDocument(workspaceId, stagingEnvironment.id, documentId),
      repository.getCurrentPublicationForDocument(
        workspaceId,
        productionEnvironment.id,
        documentId,
      ),
    ]);
  const verifications = stagingPublication
    ? await repository.listPublicationVerifications(workspaceId, stagingPublication.id)
    : [];
  const latestVerification = verifications[0] ?? null;
  const pendingOperation = productionDeployment?.pendingReleaseOperationId
    ? await repository.getReleaseOperationById(
        workspaceId,
        productionDeployment.pendingReleaseOperationId,
      )
    : null;
  const approvals = pendingOperation
    ? await repository.listReleaseApprovals(workspaceId, pendingOperation.id)
    : [];
  const approvedCount = Math.min(
    approvals.filter((approval) => approval.decision === 'approved').length,
    1,
  );
  const rejected = approvals.some((approval) => approval.decision === 'rejected');
  const presentation = deriveAuthoringReleasePipelinePresentation({
    hasBlockers,
    hasDraft: Boolean(draftArtifact),
    stagingIsCurrent:
      Boolean(draftArtifact) &&
      stagingPublication?.compiledArtifactId === draftArtifact?.id &&
      stagingPublication?.contentHash === draftArtifact?.contentHash,
    stagingPublished: Boolean(stagingPublication),
    verificationStatus: latestVerification?.result ?? null,
    productionIsCurrent:
      Boolean(stagingPublication) &&
      productionPublication?.compiledArtifactId === stagingPublication?.compiledArtifactId &&
      productionPublication?.contentHash === stagingPublication?.contentHash,
    promotionStatus: pendingOperation?.status ?? null,
    rejected,
  });
  return {
    state: presentation.state,
    nextAction: presentation.nextAction,
    staging: {
      environmentId: stagingEnvironment.id,
      generation: stagingDeployment?.generation ?? 0,
      publicationId: stagingPublication?.id ?? null,
      sourcePublicationId: stagingPublication?.id ?? null,
      compiledArtifactId: stagingPublication?.compiledArtifactId ?? null,
      contentHash: stagingPublication?.contentHash ?? null,
      verification: {
        state: latestVerification?.result ?? 'not_run',
        ...(latestVerification
          ? {
              verificationId: latestVerification.id,
              verifiedAt: latestVerification.createdAt,
            }
          : {}),
      },
    },
    production: {
      environmentId: productionEnvironment.id,
      generation: productionDeployment?.generation ?? 0,
      publicationId: productionPublication?.id ?? null,
      compiledArtifactId: productionPublication?.compiledArtifactId ?? null,
      contentHash: productionPublication?.contentHash ?? null,
    },
    approvals: {
      operationId: pendingOperation?.id ?? null,
      requiredCount: productionEnvironment.requiredApprovalCount ?? 0,
      approvedCount,
      rejected,
    },
  };
}

export interface ReleasePipelinePresentationInput {
  hasBlockers: boolean;
  hasDraft: boolean;
  stagingIsCurrent: boolean;
  stagingPublished: boolean;
  verificationStatus: 'passed' | 'failed' | null;
  productionIsCurrent: boolean;
  promotionStatus: PersistedReleaseOperation['status'] | null;
  rejected: boolean;
}

export function deriveAuthoringReleasePipelinePresentation(
  input: ReleasePipelinePresentationInput,
): {
  state:
    | 'not_published'
    | 'active_unverified'
    | 'verified'
    | 'update_available'
    | 'awaiting_approval'
    | 'failed';
  nextAction:
    | 'review_blockers'
    | 'publish_staging'
    | 'verify_staging'
    | 'request_approval'
    | 'promote_production'
    | 'live_in_production';
} {
  if (input.hasBlockers) {
    return { state: 'failed', nextAction: 'review_blockers' };
  }
  if (!input.hasDraft || !input.stagingPublished) {
    return { state: 'not_published', nextAction: 'publish_staging' };
  }
  if (!input.stagingIsCurrent) {
    return { state: 'update_available', nextAction: 'publish_staging' };
  }
  if (input.verificationStatus === null || input.verificationStatus === 'failed') {
    return {
      state: input.verificationStatus === 'failed' ? 'failed' : 'active_unverified',
      nextAction: 'verify_staging',
    };
  }
  if (input.rejected || input.promotionStatus === 'failed') {
    return { state: 'failed', nextAction: 'promote_production' };
  }
  if (input.promotionStatus === 'awaiting_approval') {
    return { state: 'awaiting_approval', nextAction: 'request_approval' };
  }
  if (!input.productionIsCurrent) {
    return { state: 'verified', nextAction: 'promote_production' };
  }
  return { state: 'verified', nextAction: 'live_in_production' };
}
