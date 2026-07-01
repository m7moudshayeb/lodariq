import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, RefreshCcw, RotateCcw, RotateCw, Save } from '../design-system';

export function CanvasActions({ controller }: { controller: LocalAuthoringFrameController }) {
  return (
    <div className="canvas-actionbar" aria-label="Experience actions">
      <AuthoringButton
        aria-label="Save"
        className="canvas-icon-action"
        data-action="save"
        icon={<Save size={15} strokeWidth={2.2} />}
        onClick={() => controller.saveCurrentDocument()}
        tone="primary"
      />
      <AuthoringButton
        aria-label="Undo"
        className="canvas-icon-action"
        data-action="undo"
        icon={<RotateCcw size={15} strokeWidth={2.2} />}
        onClick={() => controller.undo()}
      />
      <AuthoringButton
        aria-label="Redo"
        className="canvas-icon-action"
        data-action="redo"
        icon={<RotateCw size={15} strokeWidth={2.2} />}
        onClick={() => controller.redo()}
      />
      <AuthoringButton
        aria-label="Reset experience"
        className="canvas-icon-action"
        data-action="reset"
        icon={<RefreshCcw size={15} strokeWidth={2.2} />}
        onClick={() => controller.reset()}
      />
    </div>
  );
}
