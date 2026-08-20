import { createContext } from 'react';

/** Host-provided capabilities that decorator UI may use (e.g. opening the Flow Map). */
export interface RichContentHostCapabilities {
  inspectorHost?: HTMLElement | null;
  /** When true, drop the selected-block inspector so a canvas tray can own the surface. */
  suppressInspector?: boolean;
  onInspectOpen?: () => void;
  onOpenSequence?: (blockId: string) => void;
}

export const RichContentHostContext = createContext<RichContentHostCapabilities>({});
