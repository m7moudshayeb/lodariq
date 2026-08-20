import { ControllerPreviewFeature } from './controller-preview';
import { authoringText } from '../../i18n';
import { experienceDefinition, listExperienceDefinitions } from '../experiences/definition';
import type { DocumentType } from '@lodariq/schema';

/** Matches the storyboard canvas control, so both surfaces zoom in the same steps. */
export const CANVAS_ZOOM_STEP = 15;
export const CANVAS_ZOOM_LIMITS = { min: 40, max: 200 } as const;

/**
 * The mode pill's remaining rows (§3.3).
 *
 * These were printed by the menu and did nothing, which is the one thing a menu
 * must never do. Each is now the real operation: switching the experience type
 * re-seeds the document through the registry, recording turns product clicks into
 * steps, and the zoom rows drive the same canvas variable the storyboard control
 * writes.
 */
export abstract class ControllerChromeFeature extends ControllerPreviewFeature {
  protected canvasZoomPercent = 100;
  protected recordingSteps = false;

  /**
   * §5 — the model is type-agnostic, so this is a document field plus a re-seed,
   * not a conversion. Undoable, because a creator who picks the wrong type from a
   * menu should not lose their draft to it.
   */
  switchExperienceType(type: string): void {
    if (type === this.documentState.type) return;
    const definition = experienceDefinition(type as DocumentType);
    if (!definition) {
      this.setStatus(authoringText('That experience type is not available in this build.'));
      return;
    }
    this.recordChange();
    this.documentState = { ...this.documentState, type: type as DocumentType };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus(
      authoringText('Now authoring as {type}.', {
        type: labelForType(type),
      }),
    );
    this.recordMetric('experience.type.changed');
    this.emit();
  }

  /**
   * §4.4c. Recording only arms the target picker to keep firing — Lodariq never
   * invokes the product, it watches what the creator does to it.
   */
  toggleStepRecording(): void {
    this.recordingSteps = !this.recordingSteps;
    this.setStatus(
      this.recordingSteps
        ? authoringText('Recording. Every click you make on the product becomes a step.')
        : authoringText('Recording stopped.'),
    );
    this.recordMetric(this.recordingSteps ? 'recording.started' : 'recording.stopped');
    if (this.recordingSteps) this.appendStepAndChooseTarget();
    this.emit();
  }

  zoomCanvas(direction: 'in' | 'out' | 'reset'): void {
    const next =
      direction === 'reset'
        ? 100
        : this.canvasZoomPercent + (direction === 'in' ? CANVAS_ZOOM_STEP : -CANVAS_ZOOM_STEP);
    this.canvasZoomPercent = Math.min(
      CANVAS_ZOOM_LIMITS.max,
      Math.max(CANVAS_ZOOM_LIMITS.min, next),
    );
    this.setStatus(authoringText('Canvas at {percent}%.', { percent: this.canvasZoomPercent }));
    this.emit();
  }

  /** Replays the authored experience from step one, without leaving authoring. */
  restartFromFirstStep(): void {
    const first = this.documentState.blocks.find((block) => block.type === 'tourStep');
    if (!first) {
      this.setStatus(authoringText('There is no step to restart from yet.'));
      return;
    }
    void this.sendPreviewRequest('full', first.id);
    this.setStatus(authoringText('Restarted from the first step.'));
  }
}

function labelForType(type: string): string {
  const known = listExperienceDefinitions().find((definition) => definition.type === type);
  return known ? known.type : type;
}
