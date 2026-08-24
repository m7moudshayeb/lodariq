import { ControllerPreviewFeature } from './controller-preview';
import { authoringText } from '../../i18n';
import { listExperienceDefinitions } from '../experiences/definition';
import { registeredExperienceDefinition } from '../experience-authoring-capabilities';
import { isDeliverableExperienceType, type DocumentType } from '@lodariq/schema';

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
   * §5 — changing the type changes which roots the canvas presents; it does not
   * delete the roots for the previous type. The menu explains that switching
   * back restores them, so the mutation must keep that promise and remain
   * undoable.
   */
  switchExperienceType(type: string): void {
    if (type === this.documentState.type) return;
    const definition = registeredExperienceDefinition(type as DocumentType);
    if (!definition || !isDeliverableExperienceType(type)) {
      this.setStatus(authoringText('That experience type is not available in this build.'));
      return;
    }
    const nextType = type as DocumentType;
    this.commitCoordinatedMutation({
      blockId: this.documentState.id,
      coalescingKey: `experience-type:${this.documentState.id}`,
      operations: [
        {
          op: 'replaceDocument',
          document: structuredClone({ ...this.documentState, type: nextType }),
        },
      ],
      reduce: (document) => ({ ...document, type: nextType }),
      scope: 'behavior',
      status: authoringText('Now authoring as {type}.', {
        type: labelForType(type),
      }),
    });
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
