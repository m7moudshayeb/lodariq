import { authoringDateTime, authoringText } from '../../../i18n';
import { isPublishReadinessBlocker, validateTourPublishReadiness } from '@lodariq/schema';
import type { ReactNode } from 'react';
import type { AuthoringReleaseCheck, AuthoringReleaseVerification } from '../../local-frame-types';
import type { LocalAuthoringFrameController } from '../controller';
import {
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Rocket,
  RotateCcw,
  ShieldCheck,
} from '../design-system';
import { canApproveAndPromote, deriveAuthoringReleasePresentation } from '../release-presentation';
import { useOptionalPanelModeStyles } from '../optional-panel-styles';
import { publishIssueKey } from '../publish-issue-repair';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { AppearanceMode, BrandMatchReviewMode } from './panel-body-appearance-modes';
import { PanelEmptyState, PanelFeedback, PanelModeShell } from './panel-mode-shell';
import { ReleaseFindings } from './release-findings';
import {
  ReleaseHistoryPanelImplementation as ReleaseHistoryPanel,
  ReleaseRecoveryConfirmationImplementation as ReleaseRecoveryConfirmation,
} from './release-recovery-impl';
import { PublishIssueAction } from './publish-issue-action';

export function OptionalPanelBodyMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  useOptionalPanelModeStyles();
  const mode = snapshot.panelWorkflow.mode;
  if (mode === 'appearance') {
    return <AppearanceMode controller={controller} snapshot={snapshot} />;
  }
  if (mode === 'brand-match-review') {
    return <BrandMatchReviewMode controller={controller} snapshot={snapshot} />;
  }
  if (mode === 'release-verification') {
    return <ReleaseVerificationMode controller={controller} snapshot={snapshot} />;
  }
  if (mode === 'promotion-confirmation') {
    return <PromotionConfirmationMode controller={controller} snapshot={snapshot} />;
  }
  if (mode === 'release-history') {
    return <ReleaseHistoryMode controller={controller} snapshot={snapshot} />;
  }
  if (mode === 'release-recovery-confirmation') {
    return <ReleaseRecoveryConfirmationMode controller={controller} snapshot={snapshot} />;
  }
  return null;
}

function ReleaseVerificationMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const releaseWorkflow = workflow.release;
  const localIssues = validateTourPublishReadiness(snapshot.documentState).filter(
    isPublishReadinessBlocker,
  );
  const presentation = deriveAuthoringReleasePresentation({
    blockerCount: localIssues.length,
    release: snapshot.release,
    workflow: releaseWorkflow,
  });
  const verification = releaseWorkflow?.staging?.verification ?? null;
  const verifying = workflow.operation === 'verifying-release';
  const live = Boolean(
    releaseWorkflow?.production &&
    releaseWorkflow.draft.contentHash &&
    !releaseWorkflow.draft.dirty &&
    releaseWorkflow.production.contentHash === releaseWorkflow.draft.contentHash &&
    releaseWorkflow.staging?.artifactId === releaseWorkflow.production.artifactId,
  );

  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Release')}
      focusToken={workflow.focusToken}
      title={
        localIssues.length
          ? authoringText('Resolve release blockers')
          : authoringText('Verify the exact artifact')
      }
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      <p className="panel-release-truth">{presentation.truth}</p>
      <ReleaseFindings findings={snapshot.release.findings} />

      <ReleaseVerificationContent
        controller={controller}
        live={live}
        localIssues={localIssues}
        presentation={presentation}
        releaseWorkflow={releaseWorkflow}
        verification={verification}
        verifying={verifying}
      />
      <ReleaseHistoryEntry controller={controller} snapshot={snapshot} />
    </PanelModeShell>
  );
}

function ReleaseHistoryEntry({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const recovery = snapshot.panelWorkflow.releaseRecovery;
  const environments = recoveryEnvironments(snapshot.panelWorkflow.release);
  if (!recovery.available || environments.length === 0) return null;
  return (
    <section
      className="panel-mode-section release-history-entry"
      aria-labelledby="release-history-entry-title"
    >
      <div className="panel-mode-section-heading">
        <span>
          <small>{authoringText('Staging and production')}</small>
          <strong id="release-history-entry-title">{authoringText('Release history')}</strong>
        </span>
      </div>
      <p className="panel-mode-help">
        {authoringText(
          'Review immutable publications and use authorized rollback or unpublish recovery.',
        )}
      </p>
      <div className="release-history-environment-actions">
        {environments.map((environment) => (
          <button
            className="panel-mode-secondary-button"
            data-panel-entry={`release-history-${environment.environment}`}
            key={environment.id}
            onClick={() => controller.openReleaseHistoryMode(environment.id)}
            type="button"
          >
            <RotateCcw size={16} strokeWidth={2.2} aria-hidden="true" />
            {authoringText('Review {environment} history', {
              environment: environment.label,
            })}
          </button>
        ))}
      </div>
    </section>
  );
}

function ReleaseHistoryMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const recovery = workflow.releaseRecovery;
  const loading = workflow.operation === 'loading-release-recovery';
  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Release recovery')}
      focusToken={workflow.focusToken}
      title={authoringText('Release history')}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      <div data-panel-entry="release-history-result" tabIndex={-1}>
        {loading ? (
          <div className="panel-empty-state" role="status">
            <LoaderCircle className="tour-release-spinner" size={17} aria-hidden="true" />
            <strong>{authoringText('Loading release history…')}</strong>
          </div>
        ) : recovery.model ? (
          <ReleaseHistoryPanel
            model={recovery.model}
            onStartRecovery={(intent) => controller.startReleaseRecovery(intent)}
          />
        ) : (
          <PanelEmptyState
            detail={authoringText(
              'No server-vetted recovery state is available for this environment.',
            )}
            title={authoringText('Release history unavailable')}
          />
        )}
      </div>
    </PanelModeShell>
  );
}

function ReleaseRecoveryConfirmationMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const recovery = workflow.releaseRecovery;
  const pending = workflow.operation === 'recovering-release';
  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Release recovery')}
      focusToken={workflow.focusToken}
      title={authoringText('Confirm recovery')}
    >
      {recovery.intent && recovery.requestIdentity ? (
        <ReleaseRecoveryConfirmation
          error={workflow.error}
          intent={recovery.intent}
          onCancel={() => controller.cancelReleaseRecoveryConfirmation()}
          onConfirm={(request) => controller.confirmReleaseRecovery(request)}
          pending={pending}
          requestIdentity={recovery.requestIdentity}
        />
      ) : (
        <PanelEmptyState
          detail={authoringText('Return to release history and choose a current recovery action.')}
          title={authoringText('Recovery confirmation expired')}
        />
      )}
    </PanelModeShell>
  );
}

function ReleaseVerificationContent({
  controller,
  live,
  localIssues,
  presentation,
  releaseWorkflow,
  verification,
  verifying,
}: {
  controller: LocalAuthoringFrameController;
  live: boolean;
  localIssues: ReturnType<typeof validateTourPublishReadiness>;
  presentation: ReturnType<typeof deriveAuthoringReleasePresentation>;
  releaseWorkflow: LocalAuthoringFrameSnapshot['panelWorkflow']['release'];
  verification: AuthoringReleaseVerification | null;
  verifying: boolean;
}): ReactNode {
  if (localIssues.length) {
    return (
      <section className="panel-mode-card release-blocker-card" aria-labelledby="blocker-title">
        <div className="panel-mode-card-heading">
          <span className="panel-mode-card-icon warning" aria-hidden="true">
            <CircleAlert size={16} strokeWidth={2.2} />
          </span>
          <span>
            <small>{authoringText('Before staging')}</small>
            <strong id="blocker-title">
              {authoringText(
                localIssues.length === 1
                  ? '{count} item needs attention'
                  : '{count} items need attention',
                { count: localIssues.length },
              )}
            </strong>
          </span>
        </div>
        <ul className="panel-check-list">
          {localIssues.map((issue) => (
            <li className="failed publish-issue-row" key={publishIssueKey(issue)}>
              <PublishIssueAction controller={controller} issue={issue} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (!releaseWorkflow?.staging) {
    const canPublish = presentation.action === 'publish-staging' || presentation.action === 'retry';
    return (
      <>
        <PanelEmptyState
          detail={
            canPublish
              ? authoringText(
                  'Publish the saved draft to staging first. Lodariq will then verify that exact artifact here.',
                )
              : presentation.detail
          }
          title={canPublish ? authoringText('No staged artifact yet') : presentation.title}
        />
        {canPublish ? (
          <div className="panel-mode-sticky-actions">
            <button
              className="panel-mode-primary-button"
              disabled={presentation.tone === 'busy'}
              onClick={() => controller.publishCurrentTourToStaging()}
              type="button"
            >
              <Rocket size={16} strokeWidth={2.2} aria-hidden="true" />
              {presentation.actionLabel ?? authoringText('Publish to staging')}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <ArtifactEvidenceCard workflow={releaseWorkflow} />
      <section className="panel-mode-section" aria-labelledby="verification-checks-title">
        <div className="panel-mode-section-heading">
          <span>
            <small>{authoringText('Browser readiness')}</small>
            <strong id="verification-checks-title">
              {verificationTitle(verification?.state ?? 'not-run')}
            </strong>
          </span>
          <span className={`panel-status-pill ${verification?.state ?? 'not-run'}`}>
            {verificationStatusLabel(verification?.state ?? 'not-run')}
          </span>
        </div>
        {verification?.checks.length ? (
          <ul className="panel-check-list">
            {verification.checks.map((check) => (
              <VerificationCheck key={check.id} check={check} />
            ))}
          </ul>
        ) : (
          <p className="panel-mode-help">
            {authoringText(
              'Lodariq checks the exact origin, targets, Brand rendering, responsiveness, SDK, and renderer contract without leaving this page.',
            )}
          </p>
        )}
      </section>

      <div className="panel-mode-sticky-actions">
        {verification?.state === 'passed' && !live ? (
          <button
            className="panel-mode-primary-button"
            onClick={() => controller.openPromotionConfirmation()}
            type="button"
          >
            {authoringText('Continue to production')}
            <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : null}
        {verification?.state !== 'passed' ? (
          <button
            className="panel-mode-primary-button"
            disabled={verifying || !releaseWorkflow.canVerify}
            onClick={() => controller.verifyCurrentStagingArtifact()}
            type="button"
          >
            {verifying ? (
              <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
            ) : (
              <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
            {verifying
              ? authoringText('Verifying exact artifact…')
              : authoringText('Verify on staging')}
          </button>
        ) : null}
      </div>
    </>
  );
}

function PromotionConfirmationMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflowState = snapshot.panelWorkflow;
  const workflow = workflowState.release;
  const staging = workflow?.staging;
  const promoting = workflowState.operation === 'promoting-release';
  const requestingApproval = workflowState.operation === 'requesting-approval';
  const approving = workflowState.operation === 'approving-release';
  const approvalRequired = workflow?.approval === 'required';
  const approvalRequested = workflow?.approval === 'requested';
  const canPromote = Boolean(workflow?.canPromote && !approvalRequired && !approvalRequested);
  const canApprove = canApproveAndPromote(workflow);

  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Production')}
      focusToken={workflowState.focusToken}
      title={authoringText('Promote the version you verified')}
    >
      <PanelFeedback error={workflowState.error} notice={workflowState.notice} />
      {workflow && staging ? (
        <>
          <div className="exact-artifact-banner">
            <ShieldCheck size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>
              <strong>{authoringText('Exact staged artifact')}</strong>
              <small>{authoringText('No rebuild and no automatic theme changes')}</small>
            </span>
          </div>

          <dl className="panel-fact-list">
            <PanelFact
              label={authoringText('Verified on staging')}
              value={
                formatTimestamp(staging.verification.verifiedAt) ??
                authoringText('Verification recorded')
              }
            />
            <PanelFact
              label={authoringText('Production origin')}
              value={
                workflow.production?.exactOrigin ??
                authoringText('Configured exact production origin')
              }
            />
            <PanelFact
              label={authoringText('Artifact')}
              value={shortArtifact(staging.artifactId)}
            />
            <PanelFact
              label={authoringText('Brand theme')}
              value={
                workflow.theme
                  ? `${workflow.theme.name} v${workflow.theme.version}`
                  : authoringText('Compiled approved snapshot')
              }
            />
            <PanelFact
              label={authoringText('Renderer')}
              value={workflow.rendererVersion ?? authoringText('Compiled renderer contract')}
            />
          </dl>

          <section className="panel-mode-section" aria-labelledby="promotion-change-title">
            <div className="panel-mode-section-heading">
              <span>
                <small>{authoringText('Meaningful change')}</small>
                <strong id="promotion-change-title">
                  {authoringText('What production will receive')}
                </strong>
              </span>
            </div>
            <ul className="promotion-change-list">
              {(workflow.changes?.length
                ? workflow.changes
                : [
                    authoringText(
                      'The content, targets, appearance, theme snapshot, and renderer already verified.',
                    ),
                  ]
              ).map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </section>

          {approvalRequested ? (
            <div className="panel-mode-callout">
              <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
              <p>
                {canApprove
                  ? authoringText(
                      'Approval is requested. Review once, then approve this exact staged artifact.',
                    )
                  : authoringText(
                      'Approval is requested. The verified staging artifact remains unchanged.',
                    )}
              </p>
            </div>
          ) : null}

          <div className="panel-mode-sticky-actions">
            {approvalRequired ? (
              <button
                className="panel-mode-primary-button"
                disabled={requestingApproval}
                onClick={() => controller.requestPromotionApproval()}
                type="button"
              >
                {requestingApproval
                  ? authoringText('Requesting approval…')
                  : authoringText('Request approval')}
              </button>
            ) : null}
            {canApprove ? (
              <button
                className="panel-mode-primary-button"
                disabled={approving}
                onClick={() => controller.approveAndPromoteProduction()}
                type="button"
              >
                {approving ? (
                  <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {approving
                  ? authoringText('Approving & promoting…')
                  : authoringText('Approve & promote')}
              </button>
            ) : null}
            {canPromote ? (
              <button
                className="panel-mode-primary-button"
                disabled={promoting}
                onClick={() => controller.promoteCurrentStagingArtifact()}
                type="button"
              >
                {promoting ? (
                  <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Rocket size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {promoting
                  ? authoringText('Promoting exact version…')
                  : authoringText('Promote exact version')}
              </button>
            ) : null}
            <button
              className="panel-mode-secondary-button"
              disabled={promoting || requestingApproval || approving}
              onClick={() => controller.closePanelMode()}
              type="button"
            >
              {authoringText('Keep in staging')}
            </button>
          </div>
        </>
      ) : (
        <PanelEmptyState
          detail={authoringText(
            'Return to release verification and verify a staged artifact before promotion.',
          )}
          title={authoringText('No verified artifact selected')}
        />
      )}
    </PanelModeShell>
  );
}

function recoveryEnvironments(
  workflow: LocalAuthoringFrameSnapshot['panelWorkflow']['release'],
): Array<{
  id: string;
  environment: 'staging' | 'production';
  label: string;
}> {
  const candidates = workflow?.environments?.length
    ? workflow.environments
    : [
        ...(workflow?.staging?.environmentId
          ? [
              {
                environment: 'staging' as const,
                environmentId: workflow.staging.environmentId,
              },
            ]
          : []),
        ...(workflow?.production?.environmentId
          ? [
              {
                environment: 'production' as const,
                environmentId: workflow.production.environmentId,
              },
            ]
          : []),
      ];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (!candidate.environmentId.trim() || seen.has(candidate.environmentId)) return [];
    seen.add(candidate.environmentId);
    return [
      {
        id: candidate.environmentId,
        environment: candidate.environment,
        label:
          candidate.environment === 'staging'
            ? authoringText('Staging')
            : authoringText('Production'),
      },
    ];
  });
}

function ArtifactEvidenceCard({
  workflow,
}: {
  workflow: NonNullable<LocalAuthoringFrameSnapshot['panelWorkflow']['release']>;
}) {
  const staging = workflow.staging!;
  return (
    <section className="panel-mode-card artifact-evidence-card">
      <div className="panel-mode-card-heading">
        <span className="panel-mode-card-icon" aria-hidden="true">
          <ShieldCheck size={16} strokeWidth={2.2} />
        </span>
        <span>
          <small>{authoringText('Exact staging artifact')}</small>
          <strong>{shortArtifact(staging.artifactId)}</strong>
        </span>
        <span className="panel-status-pill current">{authoringText('Current')}</span>
      </div>
      <dl className="artifact-inline-facts">
        <div>
          <dt>{authoringText('Origin')}</dt>
          <dd>{staging.exactOrigin ?? authoringText('Current configured staging origin')}</dd>
        </div>
        <div>
          <dt>{authoringText('Theme')}</dt>
          <dd>
            {workflow.theme
              ? `${workflow.theme.name} v${workflow.theme.version}`
              : authoringText('Compiled snapshot')}
          </dd>
        </div>
        <div>
          <dt>{authoringText('Renderer')}</dt>
          <dd>{workflow.rendererVersion ?? authoringText('Compiled contract')}</dd>
        </div>
      </dl>
    </section>
  );
}

function VerificationCheck({ check }: { check: AuthoringReleaseCheck }) {
  return (
    <li className={check.status}>
      {check.status === 'passed' ? (
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" />
      )}
      <span>
        <strong>{check.label}</strong>
        <small>{check.detail}</small>
      </span>
    </li>
  );
}

function PanelFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function verificationTitle(state: 'not-run' | 'running' | 'passed' | 'failed'): string {
  if (state === 'passed') return authoringText('Ready for production');
  if (state === 'running') return authoringText('Running on this page');
  if (state === 'failed') return authoringText('Fix the failed checks');
  return authoringText('Ready to check this page');
}

function verificationStatusLabel(state: 'not-run' | 'running' | 'passed' | 'failed'): string {
  if (state === 'passed') return authoringText('Verified');
  if (state === 'running') return authoringText('Running');
  if (state === 'failed') return authoringText('Needs attention');
  return authoringText('Not run');
}

function shortArtifact(artifactId: string): string {
  if (artifactId.length <= 18) return artifactId;
  return authoringText('Artifact …{id}', { id: artifactId.slice(-10) });
}

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return authoringDateTime(date);
}
