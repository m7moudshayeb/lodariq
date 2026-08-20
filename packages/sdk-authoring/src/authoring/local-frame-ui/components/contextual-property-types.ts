export type ContextualToolMode = 'content' | 'placement' | 'popup';
export type PopupInspectorSection = 'layout' | 'appearance' | 'presentation';
/**
 * §4.3 splits the popup's own fields across two inspector sections. Padding and
 * corner are style; how the buttons sit is Actions. `layout` renders both, so a
 * caller that wants only one asks for it by name.
 */
export type PopupLayoutScope = 'all' | 'style' | 'spacing' | 'frame';
/** §4.3 interleaves the colours with spacing, so the group renders in two halves. */
export type PopupAppearanceScope = 'all' | 'colours' | 'edges';
export type PopupCompositionSection = Exclude<PopupInspectorSection, 'presentation'>;
export type PopupAppearanceSection = 'surface' | 'text' | 'border' | 'weight' | 'shadow';

export interface PopupThemeColors {
  borderColor: string;
  surfaceColor: string;
  textColor: string;
  /** What the ring falls back to when no literal colour is set (§4.4). */
  focusColor?: string;
}
