import type { CompiledDocument, ManifestPointer } from '@lodariq/schema';
import type { LodariqRuntime } from '../runtime';
import type { TourPlaybackOptions, TourPlayerLike, TourRendererModule } from './contracts';

interface CreateTrackedTourPlayerOptions {
  TourPlayer: TourRendererModule['TourPlayer'];
  document: CompiledDocument;
  manifest: ManifestPointer;
  playback: TourPlaybackOptions;
  runtime: LodariqRuntime;
  onStopped: () => void;
}

/** Viewer behavior loaded only when a tour is explicitly played. */
export function createTrackedTourPlayer({
  TourPlayer,
  document,
  manifest,
  playback,
  runtime,
  onStopped,
}: CreateTrackedTourPlayerOptions): TourPlayerLike {
  const documentId = document.documentId;
  const eventPrefix = deliverableEventPrefix(document.type);
  const finish = (outcome: 'completed' | 'dismissed' | 'skipped'): void => {
    onStopped();
    // Finishing and skipping are decisions about the experience; dismissing is a
    // decision about right now, so only the first two are remembered.
    if (outcome !== 'dismissed') runtime.recordExperienceOutcome(documentId, outcome);
    runtime.endTour(`${eventPrefix}_${outcome}`, documentId);
  };

  return new TourPlayer(document, {
    ...playback,
    flowConditionContext: {
      identifyTraits:
        playback.flowConditionContext?.identifyTraits ??
        (typeof runtime.flowIdentifyTraits === 'function' ? runtime.flowIdentifyTraits() : {}),
      ...(playback.flowConditionContext?.documentState
        ? { documentState: playback.flowConditionContext.documentState }
        : {}),
    },
    onBeforeStepChange: (_index, step) => {
      if (document.type === 'tour') runtime.writeTourResume(manifest, document, step);
    },
    onFormResponses: (responses) => runtime.submitFormResponses(documentId, responses),
    onStepChange: (index, step) => {
      if (document.type === 'tour') runtime.writeTourResume(manifest, document, step);
      runtime.track(`${eventPrefix}_step_changed`, { documentId, stepId: step.id, index });
    },
    onTargetResolution: (step, result) => {
      runtime.trackTargetResolution(documentId, step.id, step.targetId, result);
      playback.onTargetResolution?.(step, result);
    },
    onChoreographyStageChange: (step, update) => {
      runtime.track('tour_choreography_stage', {
        documentId,
        stepId: step.id,
        stage: update.stage,
        stageIndex: update.stageIndex,
        status: update.status,
        elapsedMs: update.elapsedMs,
      });
      playback.onChoreographyStageChange?.(step, update);
    },
    onChoreographyRecovery: (step, update) => {
      runtime.track(`tour_choreography_${update.status}`, {
        documentId,
        stepId: step.id,
        retryCount: update.retryCount,
      });
      playback.onChoreographyRecovery?.(step, update);
    },
    onConditionDiagnostic: (step, diagnostic) => {
      runtime.track('tour_condition_diagnostic', {
        documentId,
        stepId: step.id,
        blockId: diagnostic.blockId,
        reason: diagnostic.reason,
        source: diagnostic.source,
      });
      playback.onConditionDiagnostic?.(step, diagnostic);
    },
    onBranchChoice: (step, ruleIndex, destination) => {
      runtime.track('tour_branch_chosen', {
        documentId,
        stepId: step.id,
        ...(ruleIndex === null ? { fallback: true } : { ruleIndex }),
        destination,
      });
      playback.onBranchChoice?.(step, ruleIndex, destination);
    },
    onAdaptiveDecision: playback.onAdaptiveDecision,
    onAdaptiveSkip: (step, decision) => {
      runtime.track('tour_adaptive_step_skipped', {
        documentId,
        stepId: step.id,
        reason: decision.reason,
        eventName: decision.eventName,
        occurrences: decision.occurrences,
        minimumOccurrences: decision.minimumOccurrences,
        lookbackDays: decision.lookbackDays,
      });
      playback.onAdaptiveSkip?.(step, decision);
    },
    onChecklistItemChange: (blockId, completed, completedCount, total) => {
      runtime.track('checklist_item_completed', {
        documentId,
        blockId,
        completed,
        completedCount,
        total,
      });
    },
    onSurveySubmit: () => runtime.track('survey_submitted', { documentId }),
    onStart: () => {
      runtime.track(`${eventPrefix}_started`, { documentId });
      runtime.track('experience_shown', { documentId, experienceType: eventPrefix });
    },
    onFrequencySuppressed: () => {
      onStopped();
      runtime.track(`${eventPrefix}_frequency_suppressed`, { documentId });
    },
    onComplete: () => finish('completed'),
    onDismiss: () => finish('dismissed'),
    onSkip: () => finish('skipped'),
  });
}

function deliverableEventPrefix(
  type: string,
): 'announcement' | 'checklist' | 'hotspot' | 'survey' | 'tour' {
  if (type === 'announcement' || type === 'checklist' || type === 'hotspot' || type === 'survey') {
    return type;
  }
  return 'tour';
}
