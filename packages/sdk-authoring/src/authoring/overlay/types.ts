import type { AuthoringShellPresentation } from '@lodariq/schema';
import type { LodariqDocument } from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import type { OverlayPlacement } from '../canvas/edge-resize';

export type OverlayShellPresentation = AuthoringShellPresentation;

export interface OverlayShellCallbacks {
  onAddStep: () => void;
  onClose: () => void;
  onCollapse: () => void;
  onExitPreview: () => void;
  onMoveStep: (stepId: string, direction: 'up' | 'down') => void;
  onCloseOperations: () => void;
  onOpenOperations: () => void;
  onRetarget: () => void;
  onPlacementCommit: (blockId: string, placement: OverlayPlacement) => void;
  onPopupSizeCommit: (widthPx: number, heightPx: number) => void;
  onSelectStep: (stepId: string) => void;
  onTitleCommit: (title: string) => void;
}

export interface OverlayShell {
  destroy: () => void;
  presentation: () => OverlayShellPresentation;
  refreshPulses: () => void;
  setActiveStepId: (stepId: string | null) => void;
  setCardRect: (rect: ProtectedSurfaceRect | null) => void;
  setDocument: (document: LodariqDocument | null, title?: string) => void;
  setPresentation: (presentation: OverlayShellPresentation) => void;
  setTargetRect: (rect: ProtectedSurfaceRect | null) => void;
}
