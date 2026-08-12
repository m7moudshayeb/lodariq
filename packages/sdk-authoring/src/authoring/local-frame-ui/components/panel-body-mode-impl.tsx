import { authoringDateTime, authoringText } from '../../../i18n';
import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  resolveExperienceAppearance,
  validateTourPublishReadiness,
  type ExperienceAppearance,
  type RuntimeExperienceAppearance,
} from '@lodariq/schema';
import type { ReactNode } from 'react';
import type {
  AuthoringBrandRoleChange,
  AuthoringReleaseCheck,
  AuthoringReleaseVerification,
} from '../../local-frame-types';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  LockKeyhole,
  Palette,
  Rocket,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Wand2,
} from '../design-system';
import { canApproveAndPromote, deriveAuthoringReleasePresentation } from '../release-presentation';
import { useOptionalPanelModeStyles } from '../optional-panel-styles';
import { publishIssueKey } from '../publish-issue-repair';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { BrandDriftPanel } from './brand-drift';
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

function AppearanceMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const brand = workflow.brand;
  const appearance = resolveExperienceAppearance(
    snapshot.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE,
  );
  const busy = workflow.operation === 'sampling-brand' || workflow.operation === 'applying-brand';
  const themeVersion =
    typeof brand.version === 'number'
      ? authoringText('Version {version}', { version: brand.version })
      : authoringText('Safe default');
  const bindingLabel =
    snapshot.documentState.themeBinding?.policy === 'pinned'
      ? authoringText('Pinned')
      : authoringText('Inherited');

  return (
    <PanelModeShell
      className="appearance-mode-shell"
      controller={controller}
      description={authoringText(
        'Start with the workspace theme, then keep only intentional differences.',
      )}
      eyebrow={authoringText('Appearance')}
      focusToken={workflow.focusToken}
      title={authoringText('Feel native to this product')}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      <ol className="appearance-flow" aria-label={authoringText('Appearance setup')}>
        <li className="appearance-step completed" data-appearance-step="1">
          <span className="appearance-step-marker" aria-hidden="true">
            1
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading">
              <span className="appearance-step-heading-copy">
                <strong id="appearance-workspace-theme-title">
                  {authoringText('Workspace Brand theme')}
                </strong>
                <span className="appearance-step-pill inherited">{bindingLabel}</span>
              </span>
            </div>
            <section
              className="appearance-brand-row"
              aria-labelledby="appearance-workspace-theme-title brand-current-title"
            >
              <span className="appearance-brand-name">
                <span className="panel-mode-card-icon" aria-hidden="true">
                  <Palette size={16} strokeWidth={2.2} />
                </span>
                <strong id="brand-current-title">{brand.themeName}</strong>
              </span>
              <span className={`panel-status-pill ${brand.status}`}>{themeVersion}</span>
              <span className="appearance-brand-source">
                <CircleCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                <span>
                  <strong>{brand.source.label}</strong>
                  {brand.source.revision ? (
                    <small>
                      {authoringText('Revision')} {brand.source.revision}
                    </small>
                  ) : null}
                </span>
              </span>
              <p className="panel-mode-help">{brand.source.detail}</p>
            </section>
          </div>
        </li>

        <li className="appearance-step completed" data-appearance-step="2">
          <span className="appearance-step-marker" aria-hidden="true">
            2
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading">
              <span className="appearance-step-heading-copy">
                <strong id="appearance-product-match-title">
                  {authoringText('Check and match product')}
                </strong>
                <span className="appearance-step-pill">{authoringText('Optional')}</span>
              </span>
            </div>

            <PanelFeedback error={workflow.brandDrift.error} notice={null} />
            <BrandDriftPanel
              acknowledging={workflow.brandDrift.operation === 'acknowledging'}
              checking={workflow.brandDrift.operation === 'checking'}
              previewActive={workflow.brandDrift.previewActive}
              previewing={workflow.brandDrift.operation === 'previewing'}
              previewMode={workflow.brandDrift.previewMode}
              model={workflow.brandDrift.model}
              onAcknowledge={() => controller.acknowledgeBrandTheme()}
              onCheck={() => controller.checkBrandDrift()}
              onPreviewCurrent={() => controller.previewCurrentBrandDrift()}
              onPreviewProposed={() => controller.previewProposedBrandDrift()}
              onReviewProposal={() => controller.reviewBrandDriftProposal()}
            />

            <div className="panel-mode-primary-actions appearance-match-actions">
              <button
                className="panel-mode-primary-button"
                disabled={busy || !brand.canEdit}
                onClick={() => controller.matchProductBrand('current-target')}
                type="button"
              >
                {busy ? (
                  <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Wand2 size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {busy ? authoringText('Matching product…') : authoringText('Match product')}
              </button>
              <button
                className="panel-mode-secondary-button"
                disabled={busy || !brand.canEdit}
                onClick={() => controller.matchProductBrand('select-element')}
                type="button"
              >
                <ScanSearch size={16} strokeWidth={2.2} aria-hidden="true" />
                {authoringText('Use this element’s look')}
              </button>
            </div>
            {!brand.canEdit ? (
              <p className="panel-mode-inline-note appearance-match-note">
                <LockKeyhole size={14} strokeWidth={2.1} aria-hidden="true" />
                <span>
                  {authoringText(
                    'Product matching becomes available in an authenticated authoring session with Brand edit access.',
                  )}
                </span>
              </p>
            ) : null}
          </div>
        </li>

        <li className="appearance-step current" data-appearance-step="3">
          <span className="appearance-step-marker" aria-hidden="true">
            3
          </span>
          <div className="appearance-step-content">
            <div className="appearance-step-heading appearance-step-heading-with-action">
              <span>
                <span className="appearance-step-heading-copy">
                  <strong id="appearance-experience-title">
                    {authoringText('Adjust this experience only')}
                  </strong>
                  <span className="appearance-step-pill">{authoringText('Optional')}</span>
                </span>
                <span className="appearance-step-summary">{appearanceSummary(appearance)}</span>
              </span>
              <button
                className="panel-mode-text-button appearance-reset-button"
                onClick={() => controller.setDocumentAppearance(DEFAULT_EXPERIENCE_APPEARANCE)}
                type="button"
              >
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                {authoringText('Reset')}
              </button>
            </div>
            <div className="appearance-overrides-grid">
              <AppearanceChoiceGroup
                label={authoringText('Style')}
                options={APPEARANCE_PRESET_OPTIONS}
                value={appearance.preset}
                onChange={(preset) => controller.setDocumentAppearance({ ...appearance, preset })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Density')}
                options={APPEARANCE_DENSITY_OPTIONS}
                value={appearance.density}
                onChange={(density) => controller.setDocumentAppearance({ ...appearance, density })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Width')}
                options={APPEARANCE_WIDTH_OPTIONS}
                value={appearance.width}
                onChange={(width) => controller.setDocumentAppearance({ ...appearance, width })}
              />
              <AppearanceChoiceGroup
                label={authoringText('Mode')}
                options={APPEARANCE_MODE_OPTIONS}
                value={appearance.colorMode}
                onChange={(colorMode) =>
                  controller.setDocumentAppearance({ ...appearance, colorMode })
                }
              />
              <AppearanceChoiceGroup
                label={authoringText('Display target outline')}
                options={APPEARANCE_TARGET_OUTLINE_OPTIONS}
                value={appearance.displayTargetOutline}
                onChange={(displayTargetOutline) =>
                  controller.setDocumentAppearance({ ...appearance, displayTargetOutline })
                }
              />
            </div>
          </div>
        </li>
      </ol>
    </PanelModeShell>
  );
}

function BrandMatchReviewMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const workflow = snapshot.panelWorkflow;
  const proposal = workflow.brandProposal;
  const busy = workflow.operation === 'applying-brand' || workflow.operation === 'sampling-brand';

  return (
    <PanelModeShell
      controller={controller}
      eyebrow={authoringText('Brand match')}
      focusToken={workflow.focusToken}
      title={authoringText('Review meaningful changes')}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      {proposal ? (
        <>
          <section className="panel-mode-card brand-provenance-card">
            <div className="panel-mode-card-heading">
              <span className="panel-mode-card-icon" aria-hidden="true">
                <ScanSearch size={16} strokeWidth={2.2} />
              </span>
              <span>
                <small>{authoringText('Proposed from')}</small>
                <strong>{proposal.source.label}</strong>
              </span>
              <span className={`panel-confidence-pill ${proposal.confidence}`}>
                {confidenceLabel(proposal.confidence)}
              </span>
            </div>
            <p className="panel-mode-help">{proposal.confidenceReason}</p>
            {proposal.source.revision ? (
              <p className="panel-source-line">
                {authoringText('Source revision')} {proposal.source.revision}
              </p>
            ) : null}
          </section>

          <section className="panel-mode-section" aria-labelledby="semantic-changes-title">
            <div className="panel-mode-section-heading">
              <span>
                <small>{authoringText('Before and after')}</small>
                <strong id="semantic-changes-title">{authoringText('Semantic roles only')}</strong>
              </span>
            </div>
            <div className="brand-change-list">
              {proposal.changes.map((change) => (
                <BrandRoleChange key={change.role} change={change} />
              ))}
            </div>
          </section>

          <div className="panel-mode-callout">
            <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
            <p>
              {authoringText(
                'Raw CSS, selectors, class names, DOM snapshots, URLs, and coordinates are never saved as Brand data.',
              )}
            </p>
          </div>

          <div className="panel-mode-sticky-actions">
            <button
              className="panel-mode-primary-button"
              disabled={busy}
              onClick={() => controller.acceptBrandMatch()}
              type="button"
            >
              {busy ? (
                <LoaderCircle className="tour-release-spinner" size={16} aria-hidden="true" />
              ) : (
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
              )}
              {busy ? authoringText('Saving proposal…') : authoringText('Use proposed draft')}
            </button>
            <button
              className="panel-mode-secondary-button"
              disabled={busy}
              onClick={() => controller.chooseAnotherBrandSource()}
              type="button"
            >
              {authoringText('Choose another element')}
            </button>
          </div>
        </>
      ) : (
        <PanelEmptyState
          detail={authoringText(
            'Return to Appearance and choose Match product to create a safe semantic proposal.',
          )}
          title={authoringText('No Brand proposal to review')}
        />
      )}
    </PanelModeShell>
  );
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
  const localIssues = validateTourPublishReadiness(snapshot.documentState);
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

function PanelModeShell({
  children,
  className,
  controller,
  description,
  eyebrow,
  focusToken,
  title,
}: {
  children: ReactNode;
  className?: string;
  controller: LocalAuthoringFrameController;
  description?: string;
  eyebrow: string;
  focusToken: number;
  title: string;
}) {
  return (
    <section className={`panel-mode-shell ${className ?? ''}`.trim()} aria-label={title}>
      <header className="panel-mode-header">
        <button
          aria-label={authoringText('Back to authoring')}
          className="panel-mode-back"
          onClick={() => controller.closePanelMode()}
          type="button"
        >
          <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <span>
          <small>{eyebrow}</small>
          <strong key={focusToken} tabIndex={-1} data-panel-mode-heading>
            {title}
          </strong>
          {description ? <p className="panel-mode-subtitle">{description}</p> : null}
        </span>
      </header>
      <div className="panel-mode-body">{children}</div>
    </section>
  );
}

function PanelFeedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p className={`panel-feedback ${error ? 'error' : 'notice'}`} role={error ? 'alert' : 'status'}>
      {error ?? notice}
    </p>
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

function PanelEmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="panel-empty-state">
      <span className="panel-mode-card-icon" aria-hidden="true">
        <Rocket size={17} strokeWidth={2.1} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function AppearanceChoiceGroup<TValue extends string | boolean>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: TValue) => void;
  options: ReadonlyArray<{ value: TValue; label: string }>;
  value: TValue;
}) {
  return (
    <fieldset className="appearance-choice-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={value === option.value ? 'selected' : ''}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function BrandRoleChange({ change }: { change: AuthoringBrandRoleChange }) {
  return (
    <article className="brand-change-row">
      <span className="brand-change-label">{change.label}</span>
      <span className="brand-change-values">
        <span>
          <small>{authoringText('Before')}</small>
          <strong>{change.before}</strong>
        </span>
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>
          <small>{authoringText('Proposed')}</small>
          <strong>{change.after}</strong>
        </span>
      </span>
      {change.consequence ? (
        <small className="brand-change-consequence">{change.consequence}</small>
      ) : null}
    </article>
  );
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

function confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
  if (confidence === 'high') return authoringText('High confidence');
  if (confidence === 'medium') return authoringText('Review source');
  return authoringText('Low confidence');
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

function appearanceSummary(appearance: RuntimeExperienceAppearance): string {
  const preset = APPEARANCE_PRESET_OPTIONS.find((option) => option.value === appearance.preset);
  const density = APPEARANCE_DENSITY_OPTIONS.find((option) => option.value === appearance.density);
  const width = APPEARANCE_WIDTH_OPTIONS.find((option) => option.value === appearance.width);
  const colorMode = APPEARANCE_MODE_OPTIONS.find((option) => option.value === appearance.colorMode);
  return [
    preset?.label,
    density?.label,
    width?.label,
    colorMode?.label,
    appearance.displayTargetOutline ? authoringText('Target outline') : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

const APPEARANCE_PRESET_OPTIONS = [
  { value: 'default' as const, label: authoringText('Brand') },
  { value: 'accent' as const, label: authoringText('Accent') },
  { value: 'inverse' as const, label: authoringText('Inverse') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['preset']; label: string }>;

const APPEARANCE_DENSITY_OPTIONS = [
  { value: 'compact' as const, label: authoringText('Compact') },
  { value: 'comfortable' as const, label: authoringText('Comfortable') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['density']; label: string }>;

const APPEARANCE_WIDTH_OPTIONS = [
  { value: 'narrow' as const, label: authoringText('Narrow') },
  { value: 'standard' as const, label: authoringText('Standard') },
  { value: 'wide' as const, label: authoringText('Wide') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['width']; label: string }>;

const APPEARANCE_MODE_OPTIONS = [
  { value: 'system' as const, label: authoringText('System') },
  { value: 'light' as const, label: authoringText('Light') },
  { value: 'dark' as const, label: authoringText('Dark') },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['colorMode']; label: string }>;

const APPEARANCE_TARGET_OUTLINE_OPTIONS = [
  { value: false, label: authoringText('Off') },
  { value: true, label: authoringText('On') },
] satisfies ReadonlyArray<{
  value: NonNullable<ExperienceAppearance['displayTargetOutline']>;
  label: string;
}>;
