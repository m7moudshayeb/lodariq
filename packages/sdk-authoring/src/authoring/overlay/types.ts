import type { AnchorAlign } from '@lodariq/schema';
import type { AuthoringShellPresentation } from '@lodariq/schema';
import type { LodariqDocument } from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import type { OverlayPlacement } from '../canvas/edge-resize';
import type { ModePillState } from './mode-pill.types';
import type { PresenceState } from '../presence/presence-model';

export type OverlayShellPresentation = AuthoringShellPresentation;

export interface OverlayShellCallbacks {
  onAddStep: () => void;
  /** The ⊕ between two chips: a step at that position, then the picker (§4.5). */
  onInsertStepBefore: (stepId: string) => void;
  /** Remove a step from the filmstrip. Undoable, so it is not confirmed (§4.5). */
  onDeleteStep: (stepId: string) => void;
  /** The lock band's way out: your own copy of a step someone else holds (§15.2). */
  onDuplicateStep: (stepId: string) => void;
  onClose: () => void;
  onCollapse: () => void;
  onExitPreview: () => void;
  onMoveStep: (stepId: string, direction: 'up' | 'down') => void;
  onCloseOperations: () => void;
  onOpenOperations: (tab?: string) => void;
  onRetarget: () => void;
  /** The ring's band was clicked: show §4.3's Target kind. */
  onSelectTarget: () => void;
  /** The resolver's verdict changed, so the ring can say it. */
  onTargetStateChange?: (state: 'ok' | 'ctx' | 'bad' | null) => void;
  onPlacementCommit: (blockId: string, placement: OverlayPlacement, align?: AnchorAlign) => void;
  /** Live gap while the compass dot is dragged, then the committed value. */
  onAnchorOffsetPreview?: (blockId: string, offsetPx: number) => void;
  onAnchorOffsetCommit?: (blockId: string, offsetPx: number) => void;
  /** Null on an axis the dragged edge does not drive, so it stays unauthored. */
  onPopupSizeCommit: (widthPx: number | null, heightPx: number | null) => void;
  onSelectStep: (stepId: string) => void;
  /** ⌘-click adds, ⇧-click extends — the selection `Apply to…` acts on (§4.5). */
  onSelectStepAdditive: (stepId: string, mode: 'add' | 'range') => void;
  onTitleCommit: (title: string) => void;
  /** The Editing ⇄ Browsing switch (§3.3). */
  onBrowsingChange: (browsing: boolean) => void;
  onStartPreview: () => void;
  /** §5 — re-author the same document as a different kind of experience. */
  onSwitchExperience: (type: string) => void;
  onEnvironmentChange: (environment: string) => void;
  /** Turns the creator's own clicks on the product into steps (§4.4c). */
  onToggleRecording: () => void;
  /** Runs the predictive pass and opens Check on what it found (§7.3). */
  onSimulateUser: () => void;
  onCanvasZoom: (direction: 'in' | 'out' | 'reset') => void;
  /** Replays the experience from its first step. */
  onRestart: () => void;
  /** Amplitude's edit-during-preview: select the showing step without resetting preview. */
  onEditPreviewStep: () => void;
  /** The preview bar's step arrows: replay from the neighbouring step (§4.7). */
  onPreviewStep: (direction: 'previous' | 'next') => void;
  onToggleAllPanels: (hidden: boolean) => void;
  onRetrySave: () => void;
  /** §7.5 — the creator's own words, for the frame to anchor to a step. */
  onAskLodariq: (prompt: string) => void;
}

import type { ToastOptions } from './toasts';

export interface OverlayShell {
  destroy: () => void;
  presentation: () => OverlayShellPresentation;
  refreshPulses: () => void;
  setActiveStepId: (stepId: string | null) => void;
  setCardRect: (rect: ProtectedSurfaceRect | null) => void;
  setDocument: (document: LodariqDocument | null, title?: string) => void;
  setPresentation: (presentation: OverlayShellPresentation) => void;
  setTargetRect: (rect: ProtectedSurfaceRect | null) => void;
  /** Whether the inspector is showing the target rather than the card (§4.3). */
  setTargetSelected: (selected: boolean) => void;
  /** Steps in the batch selection, so the filmstrip can mark them. */
  setSelectedStepIds: (stepIds: readonly string[]) => void;
  /** Who else is on this document (§15.2). Null when the host has no presence source. */
  setPresence: (presence: PresenceState | null) => void;
  /** Environment, save state and progress, all rendered by the mode pill (§4.1). */
  setPillState: (patch: Partial<ModePillState>) => void;
  /** What the frame's session can do, so host chrome disables rather than lies. */
  setAssistAvailable: (available: boolean) => void;
  /** ⌘K, wherever it was pressed — the frame forwards it because it cannot host it. */
  openCommandPalette: () => void;
  /** A transient notice, top centre. Meaning rides in the message, not the tint. */
  notify: (message: string, options?: ToastOptions) => void;
  /** Progress bound to the runtime step during preview rather than the selection (audit #6). */
  setRuntimeStepId: (stepId: string | null) => void;
  browsing: () => boolean;
}
