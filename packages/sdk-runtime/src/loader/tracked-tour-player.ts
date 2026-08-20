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
  const finish = (eventName: 'tour_completed' | 'tour_dismissed' | 'tour_skipped'): void => {
    onStopped();
    runtime.endTour(eventName, documentId);
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
    onBeforeStepChange: (_index, step) => runtime.writeTourResume(manifest, document, step),
    onFormResponses: (responses) => runtime.submitFormResponses(documentId, responses),
    onStepChange: (index, step) => {
      runtime.writeTourResume(manifest, document, step);
      runtime.track('tour_step_changed', { documentId, stepId: step.id, index });
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
    onBranchChoice: (step, ruleIndex, destination) => {
      runtime.track('tour_branch_chosen', {
        documentId,
        stepId: step.id,
        ...(ruleIndex === null ? { fallback: true } : { ruleIndex }),
        destination,
      });
      playback.onBranchChoice?.(step, ruleIndex, destination);
    },
    onComplete: () => finish('tour_completed'),
    onDismiss: () => finish('tour_dismissed'),
    onSkip: () => finish('tour_skipped'),
  });
}
