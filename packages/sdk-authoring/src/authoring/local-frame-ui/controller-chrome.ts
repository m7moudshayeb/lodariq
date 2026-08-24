import { ControllerPreviewFeature } from './controller-preview';
import { authoringText } from '../../i18n';
import { listExperienceDefinitions } from '../experiences/definition';
import { registeredExperienceDefinition } from '../experience-authoring-capabilities';
import { isDeliverableExperienceType, type DocumentType } from '@lodariq/schema';
import { clampCanvasZoom, steppedCanvasZoom } from './canvas-zoom';

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
    /* commitCoordinatedMutation already emitted the new state; recordMetric emits again. */
    this.recordMetric('experience.type.changed');
  }

  /**
   * §4.4c. Recording only arms the target picker to keep firing — Lodariq never
   * invokes the product, it watches what the creator does to it.
   *
   * The flag used to have no reader at all: one step was appended, the picker
   * answered once, and nothing re-armed it, while the pill still read
   * "Recording". `continueStepRecording` is the missing half.
   */
  toggleStepRecording(): void {
    const recording = !this.recordingSteps;
    this.setStepRecording(recording);
    /*
     * The append comes before the status because `startTargetPick` sets its own
     * ("Select where this step appears"), which would otherwise land last and the
     * creator would never learn that recording had started. Announced once here,
     * then the picker instructs on every round after.
     */
    if (recording) this.appendStepAndChooseTarget();
    this.setStatus(
      recording
        ? authoringText('Recording. Every click you make on the product becomes a step.')
        : authoringText('Recording stopped.'),
    );
  }

  /** Called by the bridge when a placement is answered, to arm the next step. */
  protected continueStepRecording(): void {
    if (!this.recordingSteps) return;
    this.appendStepAndChooseTarget();
  }

  /** Escape out of the picker ends the run — there is nothing left to record into. */
  protected stopStepRecording(): void {
    if (!this.recordingSteps) return;
    this.setStepRecording(false);
    /* The cancel path has already said why it stopped; this adds the run's end. */
    this.setStatus(authoringText('Recording stopped.'));
  }

  private setStepRecording(recording: boolean): void {
    this.recordingSteps = recording;
    this.recordMetricWithoutEmit(recording ? 'recording.started' : 'recording.stopped');
    /* The host draws the pill row's label, and only the frame knows the flag. */
    this.sendShellCapabilities();
    this.emit();
  }

  zoomCanvas(direction: 'in' | 'out' | 'reset'): void {
    this.setCanvasZoom(steppedCanvasZoom(this.canvasZoomPercent, direction));
  }

  /** The storyboard's own control lands here too, so the two never disagree. */
  setCanvasZoom(percent: number): void {
    const next = clampCanvasZoom(percent);
    if (next === this.canvasZoomPercent) return;
    this.canvasZoomPercent = next;
    /* setStatus emits; a second emit here would repaint the canvas twice per click. */
    this.setStatus(authoringText('Canvas at {percent}%.', { percent: next }));
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
