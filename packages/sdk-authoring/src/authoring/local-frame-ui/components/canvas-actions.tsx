import type { LocalAuthoringFrameController } from '../controller';
import {
  AuthoringButton,
  AuthoringPopover,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Save,
} from '../design-system';

export function CanvasActions({ controller }: { controller: LocalAuthoringFrameController }) {
  return (
    <div className="canvas-actionbar" aria-label="Document actions">
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
      <AuthoringPopover
        align="end"
        content={
          <div className="document-action-menu" role="menu" aria-label="More document actions">
            <AuthoringButton
              data-action="reset"
              icon={<RefreshCcw size={14} strokeWidth={2.2} />}
              onClick={() => controller.reset()}
              role="menuitem"
            >
              Reset document
            </AuthoringButton>
          </div>
        }
        contentClassName="document-action-popover"
        trigger={
          <AuthoringButton
            aria-label="More document actions"
            className="canvas-icon-action"
            icon={<MoreHorizontal size={16} strokeWidth={2.2} />}
          />
        }
      />
    </div>
  );
}
