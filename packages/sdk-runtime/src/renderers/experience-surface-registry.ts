export type ExperienceSurfaceKind = 'popup' | 'modal' | 'hotspot';

export interface ExperienceSurfaceDefinition {
  kind: ExperienceSurfaceKind;
  anchor: 'target' | 'viewport';
  ariaRole: 'button' | 'dialog';
  focus: 'contained' | 'roving' | 'trap';
  dismissal: readonly ('close-control' | 'escape' | 'outside-press')[];
  backdrop: boolean;
  resizable: boolean;
  defaultSize: Readonly<{ width: number; height: number }>;
}

const EXPERIENCE_SURFACE_REGISTRY = Object.freeze({
  popup: Object.freeze({
    kind: 'popup',
    anchor: 'target',
    ariaRole: 'dialog',
    focus: 'contained',
    dismissal: ['close-control', 'escape', 'outside-press'] as const,
    backdrop: false,
    resizable: true,
    defaultSize: Object.freeze({ width: 368, height: 280 }),
  }),
  modal: Object.freeze({
    kind: 'modal',
    anchor: 'viewport',
    ariaRole: 'dialog',
    focus: 'trap',
    dismissal: ['close-control', 'escape'] as const,
    backdrop: true,
    resizable: true,
    defaultSize: Object.freeze({ width: 520, height: 400 }),
  }),
  hotspot: Object.freeze({
    kind: 'hotspot',
    anchor: 'target',
    ariaRole: 'button',
    focus: 'roving',
    dismissal: ['escape', 'outside-press'] as const,
    backdrop: false,
    resizable: false,
    defaultSize: Object.freeze({ width: 40, height: 40 }),
  }),
} as const satisfies Record<ExperienceSurfaceKind, ExperienceSurfaceDefinition>);

export function getExperienceSurfaceDefinition(
  kind: ExperienceSurfaceKind,
): ExperienceSurfaceDefinition {
  return EXPERIENCE_SURFACE_REGISTRY[kind];
}

export function listExperienceSurfaceDefinitions(): readonly ExperienceSurfaceDefinition[] {
  return Object.values(EXPERIENCE_SURFACE_REGISTRY);
}
