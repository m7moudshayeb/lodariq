import { TEXT_FONT_SIZE_VALUES } from '@lodariq/schema';
import {
  MousePointer2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Type,
} from '../design-system';
import type { EditableActionType } from '../types';
import type { CanvasToolbarPosition } from '../../canvas/canvas-style';
import type { PopupResizeCorner } from '../../canvas/use-popup-transform';

export const TOOLTIP_PLACEMENT_LABELS = {
  top: 'Above',
  bottom: 'Below',
  left: 'Left',
  right: 'Right',
} as const;

export const ADVANCE_OPTION_LABELS = {
  next: 'Next button',
  clickTarget: 'Clicks target',
} as const satisfies Record<Extract<EditableActionType, 'next' | 'clickTarget'>, string>;

export const TOOLTIP_POSITION_OPTIONS = [
  { value: 'top', label: 'Top', icon: PanelTop },
  { value: 'right', label: 'Right', icon: PanelRight },
  { value: 'bottom', label: 'Bottom', icon: PanelBottom },
  { value: 'left', label: 'Left', icon: PanelLeft },
] as const;

export const TEXT_SIZE_OPTIONS = TEXT_FONT_SIZE_VALUES;
export type StoryboardToolMode = 'content' | 'placement' | 'popup';
export type ActionToolbarPosition = CanvasToolbarPosition;
export const CANVAS_ZOOM_LEVELS = [60, 70, 80, 90, 100, 110, 120] as const;
export const DEFAULT_CANVAS_ZOOM = 80;

export const POPUP_RESIZE_CORNERS = [
  { value: 'north-west', label: 'top left' },
  { value: 'north-east', label: 'top right' },
  { value: 'south-west', label: 'bottom left' },
  { value: 'south-east', label: 'bottom right' },
] as const satisfies ReadonlyArray<{ value: PopupResizeCorner; label: string }>;

export const STORYBOARD_TOOL_OPTIONS = [
  { value: 'content', label: 'Content', icon: Type },
  { value: 'placement', label: 'Placement', icon: MousePointer2 },
  { value: 'popup', label: 'Popup', icon: PanelTop },
] as const satisfies ReadonlyArray<{
  value: StoryboardToolMode;
  label: string;
  icon: typeof Type;
}>;
