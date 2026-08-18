import type { AuthoringPanelLayoutMode } from '@lodariq/schema';
import { authoringText } from '../i18n';
import {
  Focus,
  GripVertical,
  Maximize2,
  Minus,
  PanelRight,
  PanelRightClose,
  X,
  type IconNode,
} from 'lucide';

export const AUTHORING_PANEL_LAYOUTS = {
  compact: { width: 320, height: 520 },
  standard: { width: 1120, height: 800 },
  focus: { width: 1600, height: 1200 },
} as const satisfies Readonly<Record<AuthoringPanelLayoutMode, AuthoringPanelSize>>;
export const AUTHORING_PANEL_LAYOUT_VALUES = new Set<string>(Object.keys(AUTHORING_PANEL_LAYOUTS));
export type AuthoringPanelLayoutChoice = AuthoringPanelLayoutMode | 'custom';
export const AUTHORING_PANEL_LAYOUT_OPTIONS = [
  { value: 'compact', label: authoringText('Compact'), icon: PanelRightClose },
  { value: 'standard', label: authoringText('Standard'), icon: PanelRight },
  { value: 'focus', label: authoringText('Focused'), icon: Focus },
  {
    value: 'custom',
    label: authoringText('Custom'),
    icon: Maximize2,
    omitFromList: true,
  },
] as const satisfies ReadonlyArray<{
  value: AuthoringPanelLayoutChoice;
  label: string;
  icon: IconNode;
  omitFromList?: boolean;
}>;
export const DEFAULT_AUTHORING_PANEL_LAYOUT: AuthoringPanelLayoutMode = 'standard';
export const AUTHORING_PANEL_ZOOM_OPTIONS = [
  { value: '50', label: '50%' },
  { value: '62', label: '62%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
] as const;
export type AuthoringPanelZoomValue = (typeof AUTHORING_PANEL_ZOOM_OPTIONS)[number]['value'];
export const DEFAULT_AUTHORING_PANEL_ZOOM: AuthoringPanelZoomValue = '100';
export const DEFAULT_AUTHORING_PANEL_WIDTH = AUTHORING_PANEL_LAYOUTS.standard.width;
export const TARGET_PICKING_PANEL_WIDTH = 320;
export const MIN_AUTHORING_PANEL_WIDTH = 320;
export const DEFAULT_AUTHORING_PANEL_HEIGHT = AUTHORING_PANEL_LAYOUTS.standard.height;
export const COMPACT_AUTHORING_PANEL_HEIGHT = 480;
export const MIN_AUTHORING_PANEL_HEIGHT = 320;
export const SMALL_VIEWPORT_PANEL_HEIGHT = 280;
export const COMPACT_AUTHORING_PANEL_VIEWPORT_RATIO = 0.72;
export const AUTHORING_PANEL_HEADER_HEIGHT = 64;
export const AUTHORING_COLLAPSED_PANEL_HEIGHT = 44;
export const AUTHORING_PAGE_REVEAL_GUTTER = 32;
export const AUTHORING_PANEL_DRAG_THRESHOLD = 4;
export const AUTHORING_AUTOSAVE_DEBOUNCE_MS = 650;
export const AUTHORING_AUTOSAVE_RETRY_MS = 1_200;
export const AUTHORING_AUTOSAVE_MAX_RETRIES = 2;
export const AUTHORING_SAVE_REQUEST_TIMEOUT_MS = 5_000;
export const HOSTED_SESSION_CLOSE_TIMEOUT_MS = 5_000;
export const AUTHORING_PANEL_LABELS = {
  close: authoringText('Close authoring'),
  draftSaved: authoringText('Draft saved'),
  minimize: authoringText('Minimize authoring panel'),
  movePanel: authoringText('Move Lodariq authoring panel. Use arrow keys to reposition it.'),
  restore: authoringText('Restore authoring panel'),
  savingDraft: authoringText('Saving draft…'),
  discardingDraft: authoringText('Closing authoring…'),
  selectExactArea: authoringText('Choose an exact area · Esc to cancel'),
  selectTarget: authoringText('Select an element · Esc to cancel'),
  addStep: authoringText('Add step'),
  changeTarget: authoringText('Change target'),
  operations: authoringText('Operations'),
  exitPreview: authoringText('Exit preview'),
  filmstrip: authoringText('Tour steps'),
  experienceTitle: authoringText('Experience title'),
  placementAbove: authoringText('Above'),
  placementRight: authoringText('Right'),
  placementBelow: authoringText('Below'),
  placementLeft: authoringText('Left'),
} as const;
export const AUTHORING_PANEL_KEYBOARD_OFFSETS: Readonly<
  Partial<Record<KeyboardEvent['key'], { x: number; y: number }>>
> = {
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
};

export interface AuthoringPanelGeometry {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface AuthoringPanelSize {
  height: number;
  width: number;
}

export interface AuthoringPanelRestoreState {
  focusedElement: HTMLElement | null;
  geometry: AuthoringPanelGeometry;
}

export const AUTHORING_PANEL_ICONS = {
  close: X,
  drag: GripVertical,
  maximize: Maximize2,
  minimize: Minus,
} as const satisfies Readonly<Record<string, IconNode>>;
export type AuthoringPanelIcon = keyof typeof AUTHORING_PANEL_ICONS;
