import type { AuthoringBrandDriftViewModel } from '../../brand-drift-model';
import { CircleAlert, CircleCheck, ExternalLink, LoaderCircle } from '../design-system';

export interface BrandDriftPanelProps {
  model: AuthoringBrandDriftViewModel;
  checking?: boolean;
  acknowledging?: boolean;
  previewActive?: boolean;
  previewing?: boolean;
  previewMode?: 'current' | 'proposed';
  onCheck: () => void;
  onPreviewCurrent?: () => void;
  onPreviewProposed?: () => void;
  onReviewProposal?: () => void;
  onAcknowledge?: () => void;
}

/**
 * Authenticated-authoring UI only. Checking appends bounded audit evidence but
 * does not mutate document, Brand, or release state. Adopting the proposal and
 * acknowledging an approved version remain separate explicit actions.
 */
export function BrandDriftPanel({
  model,
  checking = false,
  acknowledging = false,
  previewActive = false,
  previewing = false,
  previewMode = 'current',
  onCheck,
  onPreviewCurrent,
  onPreviewProposed,
  onReviewProposal,
  onAcknowledge,
}: BrandDriftPanelProps) {
  const actionable = model.state === 'actionable' && Boolean(model.proposal);
  const canReview = actionable && Boolean(onReviewProposal);
  const canAcknowledge = model.acknowledgement.canAcknowledge && Boolean(onAcknowledge);

  return (
    <section className="panel-mode-section brand-drift-panel" aria-labelledby="brand-drift-title">
      <div className="brand-drift-summary">
        <div className="panel-mode-section-heading">
          <span>
            <small>Product evidence</small>
            <strong id="brand-drift-title">Brand drift</strong>
          </span>
        </div>

        <div
          aria-atomic="true"
          aria-busy={checking}
          aria-live="polite"
          className={`brand-drift-status ${model.state}`}
          role="status"
        >
          <span className="brand-drift-status-icon" aria-hidden="true">
            {brandDriftStatusIcon(model.state, checking)}
          </span>
          <span className="brand-drift-status-copy">
            <strong>{model.label}</strong>
            <p id="brand-drift-status-detail">{model.detail}</p>
            {model.confidenceLabel ? <small>{model.confidenceLabel}</small> : null}
          </span>
        </div>

        <button
          aria-describedby="brand-drift-status-detail"
          className="panel-mode-text-button"
          disabled={checking || acknowledging || previewing}
          onClick={onCheck}
          type="button"
        >
          <span>{checking ? 'Checking brand…' : 'Check brand'}</span>
          <ExternalLink size={14} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </div>

      {model.sourceItems.length > 0 ? (
        <section aria-labelledby="brand-drift-provenance-title">
          <h3 id="brand-drift-provenance-title">Changed provenance</h3>
          <ul className="brand-change-list">
            {model.sourceItems.map((source) => (
              <li key={source.id}>
                <strong>{source.label}</strong>
                <span>{source.changeLabel}</span>
                <small>{source.confidenceLabel}</small>
                {source.revision ? <small>Revision {source.revision}</small> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actionable ? (
        <>
          <section aria-labelledby="brand-drift-token-title">
            <h3 id="brand-drift-token-title">Changed semantic tokens</h3>
            <ul className="brand-change-list">
              {model.roleItems.map((role) => (
                <li key={role.id}>{role.label}</li>
              ))}
            </ul>
          </section>

          {model.runtimePreview && onPreviewCurrent && onPreviewProposed ? (
            <section aria-labelledby="brand-drift-preview-title">
              <h3 id="brand-drift-preview-title">Runtime before and after</h3>
              <p className="panel-mode-help">
                Switch the production runtime preview on the product page. This temporary review
                never adopts or saves the proposal.
              </p>
              <div
                className="panel-mode-primary-actions"
                role="group"
                aria-label="Brand runtime preview"
              >
                <button
                  aria-pressed={previewActive && previewMode === 'current'}
                  className="panel-mode-secondary-button"
                  disabled={previewing}
                  onClick={onPreviewCurrent}
                  type="button"
                >
                  Preview current
                </button>
                <button
                  aria-pressed={previewActive && previewMode === 'proposed'}
                  className="panel-mode-secondary-button"
                  disabled={previewing}
                  onClick={onPreviewProposed}
                  type="button"
                >
                  Preview proposed
                </button>
              </div>
              <small role="status">
                {runtimePreviewStatus(previewing, previewActive, previewMode)}
              </small>
            </section>
          ) : null}

          <section aria-labelledby="brand-drift-accessibility-title">
            <h3 id="brand-drift-accessibility-title">Accessibility consequences</h3>
            <ul className="brand-change-list">
              {model.consequenceItems.map((consequence) => (
                <li key={consequence.id}>
                  <span>{consequence.label}</span>
                  <small>{consequence.severity === 'blocking' ? 'Blocking' : 'Review'}</small>
                </li>
              ))}
            </ul>
          </section>

          <p className="panel-mode-inline-note">
            {affectedExperienceLabel(model.affectedExperienceCount)} Nothing changes until you
            review and use the proposed draft.
          </p>
          <button
            className="panel-mode-primary-button"
            disabled={!canReview || previewing}
            onClick={onReviewProposal}
            type="button"
          >
            Review proposed Brand draft
          </button>
        </>
      ) : null}

      {model.affectedExperienceItems.length > 0 ? (
        <section aria-labelledby="brand-drift-experiences-title">
          <h3 id="brand-drift-experiences-title">Affected experiences</h3>
          <ul className="brand-change-list">
            {model.affectedExperienceItems.map((experience) => (
              <li key={experience.documentId}>
                <strong>{experience.documentId}</strong>
                <small>{experience.impactLabel}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.acknowledgement.state !== 'unavailable' ? (
        <aside
          aria-labelledby="brand-acknowledgement-title"
          className={`panel-mode-card brand-acknowledgement ${model.acknowledgement.state}`}
        >
          <strong id="brand-acknowledgement-title">{model.acknowledgement.label}</strong>
          <p>{model.acknowledgement.detail}</p>
          {model.acknowledgement.state === 'needs-review' ? (
            <button
              className="panel-mode-secondary-button"
              disabled={!canAcknowledge || acknowledging || previewing}
              onClick={onAcknowledge}
              type="button"
            >
              {acknowledging ? 'Acknowledging Brand version…' : 'Acknowledge Brand version'}
            </button>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}

function brandDriftStatusIcon(state: AuthoringBrandDriftViewModel['state'], checking: boolean) {
  if (checking) {
    return <LoaderCircle className="tour-release-spinner" size={17} strokeWidth={2.1} />;
  }
  if (state === 'unchanged') return <CircleCheck size={17} strokeWidth={2.1} />;
  return <CircleAlert size={17} strokeWidth={2.1} />;
}

function affectedExperienceLabel(count: number): string {
  if (count === 1) return '1 workspace-current experience would need review after approval.';
  return `${count} workspace-current experiences would need review after approval.`;
}

function runtimePreviewStatus(
  previewing: boolean,
  previewActive: boolean,
  previewMode: 'current' | 'proposed',
): string {
  if (previewing) return 'Loading production runtime preview…';
  if (!previewActive) return 'Production runtime preview is ready.';
  if (previewMode === 'proposed') return 'Showing proposed Brand in the production runtime.';
  return 'Showing the current approved Brand in the production runtime.';
}
