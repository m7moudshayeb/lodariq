export type ContextualToolMode = 'content' | 'placement' | 'popup';
export type PopupInspectorSection = 'layout' | 'appearance' | 'presentation';
export type PopupCompositionSection = Exclude<PopupInspectorSection, 'presentation'>;
export type PopupAppearanceSection = 'surface' | 'text' | 'border' | 'weight' | 'shadow';

export interface PopupThemeColors {
  borderColor: string;
  surfaceColor: string;
  textColor: string;
}
