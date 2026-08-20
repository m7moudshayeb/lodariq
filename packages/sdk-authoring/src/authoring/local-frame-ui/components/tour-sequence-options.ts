import { TEXT_FONT_SIZE_VALUES } from '@lodariq/schema';
import {
  MousePointer2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
} from '../design-system';
import type { EditableActionType } from '../types';
import type { PopupResizeCorner } from '../../canvas/use-popup-transform';
import { authoringText } from '../../../i18n';

export const TOOLTIP_PLACEMENT_LABELS = {
  top: authoringText('Above'),
  bottom: authoringText('Below'),
  left: authoringText('Left'),
  right: authoringText('Right'),
} as const;

export const ADVANCE_OPTION_LABELS = {
  next: authoringText('Next button'),
  clickTarget: authoringText('Clicks target'),
} as const satisfies Record<Extract<EditableActionType, 'next' | 'clickTarget'>, string>;

export const TOOLTIP_POSITION_OPTIONS = [
  { value: 'top', label: authoringText('Top'), icon: PanelTop },
  { value: 'right', label: authoringText('Right'), icon: PanelRight },
  { value: 'bottom', label: authoringText('Bottom'), icon: PanelBottom },
  { value: 'left', label: authoringText('Left'), icon: PanelLeft },
] as const;

export const TEXT_SIZE_OPTIONS = TEXT_FONT_SIZE_VALUES;
export type StoryboardToolMode = 'content' | 'placement' | 'popup';
export const CANVAS_ZOOM_LEVELS = [60, 70, 80, 90, 100, 110, 120] as const;
export const DEFAULT_CANVAS_ZOOM = 80;

export const POPUP_RESIZE_CORNERS = [
  { value: 'north-west', label: authoringText('top left') },
  { value: 'north-east', label: authoringText('top right') },
  { value: 'south-west', label: authoringText('bottom left') },
  { value: 'south-east', label: authoringText('bottom right') },
] as const satisfies ReadonlyArray<{ value: PopupResizeCorner; label: string }>;

export const STORYBOARD_TOOL_OPTIONS = [
  { value: 'placement', label: authoringText('Placement'), icon: MousePointer2 },
  { value: 'popup', label: authoringText('Popup'), icon: PanelTop },
] as const satisfies ReadonlyArray<{
  value: StoryboardToolMode;
  label: string;
  icon: typeof MousePointer2;
}>;
