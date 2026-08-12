import type { WorkspaceThemeImpactDto } from '../../lib/api';

const THEME_BINDING_LABELS = {
  'workspace-current': 'Follows approved',
  pinned: 'Pinned version',
  legacy: 'Legacy fallback',
} as const satisfies Record<WorkspaceThemeImpactDto['bindingPolicy'], string>;

export function impactCountLabel(count: number): string {
  return `${count} experience${count === 1 ? '' : 's'}`;
}

export function formatThemeBinding(binding: WorkspaceThemeImpactDto['bindingPolicy']): string {
  return THEME_BINDING_LABELS[binding];
}

export function withCurrentOption<T extends string | number>(
  options: readonly { value: T; label: string }[],
  currentValue: T,
  currentLabel: string,
): Array<{ value: T; label: string }> {
  if (options.some((option) => option.value === currentValue)) return [...options];
  return [{ value: currentValue, label: `${currentLabel} · ${currentValue}` }, ...options];
}
