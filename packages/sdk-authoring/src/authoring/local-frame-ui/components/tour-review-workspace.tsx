import { authoringText } from '../../../i18n';
import { useState } from 'react';
import { isPublishReadinessBlocker, validateTourPublishReadiness } from '@lodariq/schema';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import {
  ArrowLeft,
  AuthoringButton,
  Check,
  ChevronRight,
  CircleAlert,
  RotateCcw,
  Save,
  ShieldCheck,
} from '../design-system';
import { blockDisplayTitle } from '../utils';
import {
  AccessibilityPreviewEditor,
  CompletionBehaviorEditor,
  DraftCheckpointEditor,
} from '../properties/flow-settings-editors';

/*
 * Placement and Edit details used to be rows here and are not any more.
 *
 * Placement rendered the *same* `StepPlacementEditor` the card's own property
 * tray does — one component, two places, and the card is where you are looking
 * when you care about placement. Edit details opened the review-and-preview
 * aside, whose preview buttons are on the toolbar, whose issue list is Check,
 * and whose support package is one of Advanced's four links. Its label promised
 * step settings it never showed.
 *
 * What is left is what only this surface offers: the three flow-level settings
 * that belong to the experience rather than to a step.
 */
interface ReviewRow {
  action: 'accessibility' | 'checkpoints' | 'completion';
  description: string;
  detail: string;
  icon: typeof Check;
  label: string;
  tone: 'attention' | 'ready';
}

export function TourReviewWorkspace({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}) {
  const [activeSection, setActiveSection] = useState<ReviewRow['action'] | null>(null);
  const issues = validateTourPublishReadiness(snapshot.documentState, {
    targetDiagnostics: snapshot.targetDiagnostics,
    requireVerifiedTargets: true,
  }).filter(isPublishReadinessBlocker);
  const steps = snapshot.documentState.blocks.filter((block) => block.type === 'tourStep');
  const rows = reviewRows({
    issueCount: issues.length,
    saveLabel: snapshot.saveState.label,
  });

  return (
    <section
      className="tour-review-workspace panel-advanced-editor"
      aria-label={authoringText('Review & recovery')}
    >
      <header className="tour-review-header panel-advanced-header">
        <button
          className="panel-advanced-back"
          onClick={() => controller.closeOperationsMode()}
          type="button"
        >
          <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Back to editor')}
        </button>
        <span className="panel-advanced-title">
          <small>{authoringText('Review & recovery')}</small>
          <strong>{blockDisplayTitle(step)}</strong>
        </span>
        <span
          className="tour-review-save panel-advanced-save-status"
          data-state={snapshot.saveState.state}
        >
          <Check size={15} strokeWidth={2.2} aria-hidden="true" />
          {snapshot.saveState.label}
        </span>
      </header>
      <div
        className="tour-review-main panel-advanced-main document-main"
        data-active-section={activeSection ?? 'none'}
      >
        <div className="tour-review-list">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <button
                className="tour-review-row"
                data-review-row={row.action}
                data-tone={row.tone}
                key={row.label}
                aria-expanded={activeSection === row.action}
                onClick={() => {
                  setActiveSection((current) => (current === row.action ? null : row.action));
                }}
                type="button"
              >
                <span className="tour-review-row-icon">
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                <span className="tour-review-row-copy">
                  <strong>{row.label}</strong>
                  <small>{row.description}</small>
                </span>
                <span className="tour-review-row-detail">{row.detail}</span>
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {activeSection ? (
          <div className="tour-review-detail">
            <AuthoringButton
              icon={<ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />}
              onClick={() => setActiveSection(null)}
              tone="ghost"
            >
              {authoringText('Review & recovery')}
            </AuthoringButton>
            {activeSection === 'accessibility' ? (
              <AccessibilityPreviewEditor controller={controller} />
            ) : null}
            {activeSection === 'checkpoints' ? (
              <DraftCheckpointEditor
                checkpoints={snapshot.draftCheckpoints}
                controller={controller}
              />
            ) : null}
            {activeSection === 'completion' ? (
              <CompletionBehaviorEditor
                controller={controller}
                document={snapshot.documentState}
                steps={steps}
              />
            ) : null}
            {activeSection === 'accessibility' && issues.length ? (
              <aside className="tour-review-note">
                <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>
                    {authoringText('{count} to fix before release', { count: issues.length })}
                  </strong>
                  <small>{authoringText('Draft stays saved while you fix them')}</small>
                </span>
              </aside>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function reviewRows({
  issueCount,
  saveLabel,
}: {
  issueCount: number;
  saveLabel: string;
}): readonly ReviewRow[] {
  return [
    {
      action: 'accessibility',
      description:
        issueCount > 0
          ? authoringText('{count} to fix before release', { count: issueCount })
          : authoringText('Ready to preview'),
      detail: issueCount > 0 ? authoringText('Needs review') : authoringText('Ready'),
      icon: ShieldCheck,
      label: authoringText('Accessibility preview'),
      tone: issueCount > 0 ? 'attention' : 'ready',
    },
    {
      action: 'checkpoints',
      description: saveLabel,
      detail: authoringText('Draft saved'),
      icon: Save,
      label: authoringText('Draft checkpoints'),
      tone: 'ready',
    },
    {
      action: 'completion',
      description: authoringText('Advanced recovery'),
      detail: authoringText('Ready'),
      icon: RotateCcw,
      label: authoringText('Completion behavior'),
      tone: 'ready',
    },
  ];
}
