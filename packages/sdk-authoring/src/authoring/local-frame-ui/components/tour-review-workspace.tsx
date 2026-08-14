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
  SlidersHorizontal,
} from '../design-system';
import { blockDisplayTitle, targetIdOf } from '../utils';
import { Inspector } from './inspector';
import {
  AccessibilityPreviewEditor,
  CompletionBehaviorEditor,
  DraftCheckpointEditor,
} from '../properties/flow-settings-editors';

interface ReviewRow {
  action: 'accessibility' | 'checkpoints' | 'completion' | 'details' | 'placement';
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
  const placedSteps = steps.filter((candidate) => Boolean(targetIdOf(candidate))).length;
  const targetIssues = issues.filter((issue) => issue.code.includes('target'));
  const rows = reviewRows({
    issueCount: issues.length,
    placedSteps,
    saveLabel: snapshot.saveState.label,
    targetIssueCount: targetIssues.length,
    totalSteps: steps.length,
  });

  return (
    <section
      className="tour-review-workspace panel-advanced-editor"
      aria-label={authoringText('Review & recovery')}
    >
      <header className="tour-review-header panel-advanced-header">
        <button
          className="panel-advanced-back"
          onClick={() => controller.closeAdvancedEditor()}
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
                data-tone={row.tone}
                key={row.label}
                aria-expanded={
                  row.action === 'placement' ? undefined : activeSection === row.action
                }
                onClick={() => {
                  if (row.action === 'placement') {
                    controller.closeAdvancedEditor();
                    controller.activateTourStep(step.id);
                    return;
                  }
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
            {activeSection === 'details' ? (
              <Inspector controller={controller} snapshot={snapshot} />
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
  placedSteps,
  saveLabel,
  targetIssueCount,
  totalSteps,
}: {
  issueCount: number;
  placedSteps: number;
  saveLabel: string;
  targetIssueCount: number;
  totalSteps: number;
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
      action: 'placement',
      description:
        targetIssueCount > 0
          ? authoringText('{count} to fix before release', { count: targetIssueCount })
          : authoringText('Verified in this context.'),
      detail: `${placedSteps}/${totalSteps}`,
      icon: Check,
      label: authoringText('Placement'),
      tone: targetIssueCount > 0 ? 'attention' : 'ready',
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
    {
      action: 'details',
      description: authoringText('Open advanced step settings'),
      detail: authoringText('Edit details'),
      icon: SlidersHorizontal,
      label: authoringText('Edit details'),
      tone: 'ready',
    },
  ];
}
