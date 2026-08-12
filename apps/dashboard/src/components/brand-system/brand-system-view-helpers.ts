import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { useLingui } from '@lingui/react';
import type { WorkspaceThemeImpactDto } from '../../lib/api';

const THEME_BINDING_LABELS = {
  'workspace-current': msg({
    id: 'dashboard.brand.binding.followsApproved',
    message: 'Follows approved',
  }),
  pinned: msg({ id: 'dashboard.brand.binding.pinned', message: 'Pinned version' }),
  legacy: msg({ id: 'dashboard.brand.binding.legacy', message: 'Legacy fallback' }),
} as const satisfies Record<WorkspaceThemeImpactDto['bindingPolicy'], MessageDescriptor>;

const EXPERIENCE_COUNT = msg({
  id: 'dashboard.brand.experienceCount',
  message: '{count, plural, one {# experience} other {# experiences}}',
});

type Translate = ReturnType<typeof useLingui>['_'];

export function impactCountLabel(count: number, translate: Translate): string {
  return translate({ ...EXPERIENCE_COUNT, values: { count } });
}

export function formatThemeBinding(
  binding: WorkspaceThemeImpactDto['bindingPolicy'],
  translate: Translate,
): string {
  return translate(THEME_BINDING_LABELS[binding]);
}

export function withCurrentOption<T extends string | number>(
  options: readonly { value: T; label: string }[],
  currentValue: T,
  currentLabel: string,
): Array<{ value: T; label: string }> {
  if (options.some((option) => option.value === currentValue)) return [...options];
  return [{ value: currentValue, label: `${currentLabel} · ${currentValue}` }, ...options];
}
