import type { OverlayChromeCorner } from './solver.types';

/** The pill's own view of mode — not the shell presentation type (§3.3). */
export type ModePillMode = 'editing' | 'browsing' | 'previewing' | 'picking';

/** §8.1. `retry` always carries the property that failed. */
export type ModePillSaveState = 'saved' | 'saving' | 'retry' | 'reconnecting';

/** One other creator here now. Initials and hue are both derived from these. */
export interface ModePillPeer {
  readonly creatorId: string;
  readonly name: string;
  /** Optional semantic selection detail for the existing faces tooltip. */
  readonly detail?: string;
}

export interface ModePillState {
  readonly mode: ModePillMode;
  /** `Staging` / `Dev`. Never `Production` — ADR-0015 rejects it at every layer. */
  readonly environment: string;
  /** 1-based. Runtime step while previewing, selection while composing (§4.1). */
  readonly stepNumber: number | null;
  readonly stepCount: number;
  readonly save: ModePillSaveState;
  /** Creator-facing property name, required when `save` is `retry`. */
  readonly saveProperty?: string;
  readonly panelsHidden: boolean;
  /** Other creators live on this document (§15.2 layer 1). Empty hides the faces. */
  readonly peers: readonly ModePillPeer[];
  /**
   * The draft has moved past what is published (§8.2). Shown as a dot on the
   * environment chip: editing a published experience makes a new draft and leaves
   * the live artifact alone, so the creator needs to see that divergence.
   */
  readonly draftDiverged: boolean;
  /** The document's experience type, so the menu can mark the current one. */
  readonly experienceType: string;
  /** Every registered type, in registry order. Empty hides the group. */
  readonly experienceTypes: readonly { readonly type: string; readonly label: string }[];
  /** Recording turns one menu row into its own stop control (§4.1). */
  readonly recording: boolean;
  /** Selectable environments. `Production` is always printed, always disabled. */
  readonly environments: readonly string[];
  /**
   * Launcher quick actions that exist in this build, by id.
   *
   * The panel covers the launcher while it is open, so the menu is the only
   * route left to these (§3.3). Which ones exist is the launcher's decision —
   * it derives them from capabilities — so the ids are carried rather than
   * assumed, and an action that is not here is not printed.
   *
   * The menu no longer asks the launcher to run them: each row opens the shared
   * experiences flyout against itself. These ids are still how the pill knows
   * which rows the build has earned.
   */
  readonly launcherActions: readonly string[];
}

export interface ModePillCallbacks {
  /** The Editing ⇄ Browsing switch — the most-used control in the product. */
  readonly onModeChange: (mode: 'editing' | 'browsing') => void;
  readonly onPreview: () => void;
  /** Amplitude's edit-during-preview: selects the showing step, keeps preview state. */
  /** Optionally at a named section, so the menu can route straight to it. */
  readonly onOpenOperations: (tab?: string) => void;
  readonly onToggleAllPanels: () => void;
  readonly onRetrySave: () => void;
  readonly onExitAuthoring: () => void;
  /** Fired after a drag settles on a corner, so placement can be remembered. */
  readonly onCornerChange?: (corner: OverlayChromeCorner) => void;
  /** §5 — the same document, authored as a different kind of experience. */
  readonly onSwitchExperience: (type: string) => void;
  /** `Production` is refused here, not hidden, so the reason can be said out loud. */
  readonly onEnvironmentChange: (environment: string) => void;
  readonly onToggleRecording: () => void;
  readonly onCanvasZoom: (direction: 'in' | 'out' | 'reset') => void;
  readonly onKeyboardMap: () => void;
  /** §7.5's palette. ⌘K opens it too, but a shortcut is never the only route. */
  readonly onCommandPalette: () => void;
  readonly onRestart: () => void;
  /**
   * A create or open that failed inside the experiences submenu.
   *
   * The submenu is rendered by the pill but the work belongs to whoever owns the
   * experiences, so a failure has to travel back out to the host's own error
   * channel rather than the menu inventing a second place to report it.
   */
  readonly onExperienceMenuError?: (error: unknown) => void;
}

export interface ModePill {
  readonly element: HTMLElement;
  readonly setState: (patch: Partial<ModePillState>) => void;
  readonly state: () => ModePillState;
  readonly corner: () => OverlayChromeCorner;
  readonly setCorner: (corner: OverlayChromeCorner) => void;
  readonly setCollapsed: (collapsed: boolean) => void;
  readonly destroy: () => void;
}
