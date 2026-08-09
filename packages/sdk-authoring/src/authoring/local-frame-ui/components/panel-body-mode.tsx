import {
  DEFAULT_EXPERIENCE_APPEARANCE,
  publishReadinessIssueLabel,
  validateTourPublishReadiness,
  type ExperienceAppearance,
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
  LoaderCircle,
  Palette,
  Rocket,
  ScanSearch,
  ShieldCheck,
  Wand2,
} from '../design-system';
import { canApproveAndPromote, deriveAuthoringReleasePresentation } from '../release-presentation';
import type { LocalAuthoringFrameSnapshot } from '../types';

export function PanelBodyMode({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
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
  const appearance = snapshot.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE;
  const busy = workflow.operation === 'sampling-brand' || workflow.operation === 'applying-brand';
  const themeVersion =
    typeof brand.version === 'number' ? `Version ${brand.version}` : 'Safe default';

  return (
    <PanelModeShell
      controller={controller}
      eyebrow="Appearance"
      focusToken={workflow.focusToken}
      title="Feel native to this product"
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />

      <section className="panel-mode-card brand-current-card" aria-labelledby="brand-current-title">
        <div className="panel-mode-card-heading">
          <span className="panel-mode-card-icon" aria-hidden="true">
            <Palette size={16} strokeWidth={2.2} />
          </span>
          <span>
            <small>Workspace Brand theme</small>
            <strong id="brand-current-title">{brand.themeName}</strong>
          </span>
          <span className={`panel-status-pill ${brand.status}`}>{themeVersion}</span>
        </div>
        <p className="panel-source-line">
          <span>{brand.source.label}</span>
          {brand.source.revision ? <span>Revision {brand.source.revision}</span> : null}
        </p>
        <p className="panel-mode-help">{brand.source.detail}</p>
      </section>

      <div className="panel-mode-primary-actions">
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
          {busy ? 'Matching product…' : 'Match product'}
        </button>
        <button
          className="panel-mode-secondary-button"
          disabled={busy || !brand.canEdit}
          onClick={() => controller.matchProductBrand('select-element')}
          type="button"
        >
          <ScanSearch size={16} strokeWidth={2.2} aria-hidden="true" />
          Use this element’s look
        </button>
      </div>
      {!brand.canEdit ? (
        <p className="panel-mode-inline-note">
          Product matching becomes available in an authenticated authoring session with Brand edit
          access.
        </p>
      ) : null}

      <details className="panel-mode-disclosure">
        <summary>
          <span>
            <small>Optional fine-tuning</small>
            <strong>Adjust this experience only</strong>
            <span>{appearanceSummary(appearance)}</span>
          </span>
          <ChevronRight className="panel-mode-disclosure-chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="panel-mode-disclosure-body">
          <div className="panel-mode-section-heading">
            <span>
              <small>Experience override</small>
              <strong>Keep only intentional differences</strong>
            </span>
            <button
              className="panel-mode-text-button"
              onClick={() => controller.setDocumentAppearance(DEFAULT_EXPERIENCE_APPEARANCE)}
              type="button"
            >
              Reset
            </button>
          </div>
          <AppearanceChoiceGroup
            label="Style"
            options={APPEARANCE_PRESET_OPTIONS}
            value={appearance.preset}
            onChange={(preset) => controller.setDocumentAppearance({ ...appearance, preset })}
          />
          <AppearanceChoiceGroup
            label="Density"
            options={APPEARANCE_DENSITY_OPTIONS}
            value={appearance.density}
            onChange={(density) => controller.setDocumentAppearance({ ...appearance, density })}
          />
          <AppearanceChoiceGroup
            label="Width"
            options={APPEARANCE_WIDTH_OPTIONS}
            value={appearance.width}
            onChange={(width) => controller.setDocumentAppearance({ ...appearance, width })}
          />
          <AppearanceChoiceGroup
            label="Mode"
            options={APPEARANCE_MODE_OPTIONS}
            value={appearance.colorMode}
            onChange={(colorMode) => controller.setDocumentAppearance({ ...appearance, colorMode })}
          />
        </div>
      </details>
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
      eyebrow="Brand match"
      focusToken={workflow.focusToken}
      title="Review meaningful changes"
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
                <small>Proposed from</small>
                <strong>{proposal.source.label}</strong>
              </span>
              <span className={`panel-confidence-pill ${proposal.confidence}`}>
                {confidenceLabel(proposal.confidence)}
              </span>
            </div>
            <p className="panel-mode-help">{proposal.confidenceReason}</p>
            {proposal.source.revision ? (
              <p className="panel-source-line">Source revision {proposal.source.revision}</p>
            ) : null}
          </section>

          <section className="panel-mode-section" aria-labelledby="semantic-changes-title">
            <div className="panel-mode-section-heading">
              <span>
                <small>Before and after</small>
                <strong id="semantic-changes-title">Semantic roles only</strong>
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
              Raw CSS, selectors, class names, DOM snapshots, URLs, and coordinates are never saved
              as Brand data.
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
              {busy ? 'Saving proposal…' : 'Use proposed draft'}
            </button>
            <button
              className="panel-mode-secondary-button"
              disabled={busy}
              onClick={() => controller.chooseAnotherBrandSource()}
              type="button"
            >
              Choose another element
            </button>
          </div>
        </>
      ) : (
        <PanelEmptyState
          detail="Return to Appearance and choose Match product to create a safe semantic proposal."
          title="No Brand proposal to review"
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
      eyebrow="Release"
      focusToken={workflow.focusToken}
      title={localIssues.length ? 'Resolve release blockers' : 'Verify the exact artifact'}
    >
      <PanelFeedback error={workflow.error} notice={workflow.notice} />
      <p className="panel-release-truth">{presentation.truth}</p>

      <ReleaseVerificationContent
        controller={controller}
        live={live}
        localIssues={localIssues}
        presentation={presentation}
        releaseWorkflow={releaseWorkflow}
        verification={verification}
        verifying={verifying}
      />
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
            <small>Before staging</small>
            <strong id="blocker-title">
              {localIssues.length} {localIssues.length === 1 ? 'item' : 'items'} need attention
            </strong>
          </span>
        </div>
        <ul className="panel-check-list">
          {localIssues.slice(0, 4).map((issue) => (
            <li className="failed" key={`${issue.code}:${issue.blockId ?? ''}`}>
              <CircleAlert size={14} aria-hidden="true" />
              <span>
                <strong>{publishReadinessIssueLabel(issue.code)}</strong>
                <small>{issue.message}</small>
              </span>
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
              ? 'Publish the saved draft to staging first. Lodariq will then verify that exact artifact here.'
              : presentation.detail
          }
          title={canPublish ? 'No staged artifact yet' : presentation.title}
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
              {presentation.actionLabel ?? 'Publish to staging'}
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
            <small>Browser readiness</small>
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
            Lodariq checks the exact origin, targets, Brand rendering, responsiveness, SDK, and
            renderer contract without leaving this page.
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
            Continue to production
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
            {verifying ? 'Verifying exact artifact…' : 'Verify on staging'}
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
      eyebrow="Production"
      focusToken={workflowState.focusToken}
      title="Promote the version you verified"
    >
      <PanelFeedback error={workflowState.error} notice={workflowState.notice} />
      {workflow && staging ? (
        <>
          <div className="exact-artifact-banner">
            <ShieldCheck size={18} strokeWidth={2.2} aria-hidden="true" />
            <span>
              <strong>Exact staged artifact</strong>
              <small>No rebuild and no automatic theme changes</small>
            </span>
          </div>

          <dl className="panel-fact-list">
            <PanelFact
              label="Verified on staging"
              value={formatTimestamp(staging.verification.verifiedAt) ?? 'Verification recorded'}
            />
            <PanelFact
              label="Production origin"
              value={workflow.production?.exactOrigin ?? 'Configured exact production origin'}
            />
            <PanelFact label="Artifact" value={shortArtifact(staging.artifactId)} />
            <PanelFact
              label="Brand theme"
              value={
                workflow.theme
                  ? `${workflow.theme.name} v${workflow.theme.version}`
                  : 'Compiled approved snapshot'
              }
            />
            <PanelFact
              label="Renderer"
              value={workflow.rendererVersion ?? 'Compiled renderer contract'}
            />
          </dl>

          <section className="panel-mode-section" aria-labelledby="promotion-change-title">
            <div className="panel-mode-section-heading">
              <span>
                <small>Meaningful change</small>
                <strong id="promotion-change-title">What production will receive</strong>
              </span>
            </div>
            <ul className="promotion-change-list">
              {(workflow.changes?.length
                ? workflow.changes
                : [
                    'The content, targets, appearance, theme snapshot, and renderer already verified.',
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
                  ? 'Approval is requested. Review once, then approve this exact staged artifact.'
                  : 'Approval is requested. The verified staging artifact remains unchanged.'}
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
                {requestingApproval ? 'Requesting approval…' : 'Request approval'}
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
                {approving ? 'Approving & promoting…' : 'Approve & promote'}
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
                {promoting ? 'Promoting exact version…' : 'Promote exact version'}
              </button>
            ) : null}
            <button
              className="panel-mode-secondary-button"
              disabled={promoting || requestingApproval || approving}
              onClick={() => controller.closePanelMode()}
              type="button"
            >
              Keep in staging
            </button>
          </div>
        </>
      ) : (
        <PanelEmptyState
          detail="Return to release verification and verify a staged artifact before promotion."
          title="No verified artifact selected"
        />
      )}
    </PanelModeShell>
  );
}

function PanelModeShell({
  children,
  controller,
  eyebrow,
  focusToken,
  title,
}: {
  children: ReactNode;
  controller: LocalAuthoringFrameController;
  eyebrow: string;
  focusToken: number;
  title: string;
}) {
  return (
    <section className="panel-mode-shell" aria-label={title}>
      <header className="panel-mode-header">
        <button
          aria-label="Back to authoring"
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

function AppearanceChoiceGroup<TValue extends string>({
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
            key={option.value}
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
          <small>Before</small>
          <strong>{change.before}</strong>
        </span>
        <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>
          <small>Proposed</small>
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
          <small>Exact staging artifact</small>
          <strong>{shortArtifact(staging.artifactId)}</strong>
        </span>
        <span className="panel-status-pill current">Current</span>
      </div>
      <dl className="artifact-inline-facts">
        <div>
          <dt>Origin</dt>
          <dd>{staging.exactOrigin ?? 'Current configured staging origin'}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>
            {workflow.theme
              ? `${workflow.theme.name} v${workflow.theme.version}`
              : 'Compiled snapshot'}
          </dd>
        </div>
        <div>
          <dt>Renderer</dt>
          <dd>{workflow.rendererVersion ?? 'Compiled contract'}</dd>
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
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Review source';
  return 'Low confidence';
}

function verificationTitle(state: 'not-run' | 'running' | 'passed' | 'failed'): string {
  if (state === 'passed') return 'Ready for production';
  if (state === 'running') return 'Running on this page';
  if (state === 'failed') return 'Fix the failed checks';
  return 'Ready to check this page';
}

function verificationStatusLabel(state: 'not-run' | 'running' | 'passed' | 'failed'): string {
  if (state === 'passed') return 'Verified';
  if (state === 'running') return 'Running';
  if (state === 'failed') return 'Needs attention';
  return 'Not run';
}

function shortArtifact(artifactId: string): string {
  if (artifactId.length <= 18) return artifactId;
  return `Artifact …${artifactId.slice(-10)}`;
}

function formatTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function appearanceSummary(appearance: ExperienceAppearance): string {
  const preset = APPEARANCE_PRESET_OPTIONS.find((option) => option.value === appearance.preset);
  const density = APPEARANCE_DENSITY_OPTIONS.find((option) => option.value === appearance.density);
  const width = APPEARANCE_WIDTH_OPTIONS.find((option) => option.value === appearance.width);
  const colorMode = APPEARANCE_MODE_OPTIONS.find((option) => option.value === appearance.colorMode);
  return [preset?.label, density?.label, width?.label, colorMode?.label]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

const APPEARANCE_PRESET_OPTIONS = [
  { value: 'default' as const, label: 'Brand' },
  { value: 'accent' as const, label: 'Accent' },
  { value: 'inverse' as const, label: 'Inverse' },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['preset']; label: string }>;

const APPEARANCE_DENSITY_OPTIONS = [
  { value: 'compact' as const, label: 'Compact' },
  { value: 'comfortable' as const, label: 'Comfortable' },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['density']; label: string }>;

const APPEARANCE_WIDTH_OPTIONS = [
  { value: 'narrow' as const, label: 'Narrow' },
  { value: 'standard' as const, label: 'Standard' },
  { value: 'wide' as const, label: 'Wide' },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['width']; label: string }>;

const APPEARANCE_MODE_OPTIONS = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
] satisfies ReadonlyArray<{ value: ExperienceAppearance['colorMode']; label: string }>;
