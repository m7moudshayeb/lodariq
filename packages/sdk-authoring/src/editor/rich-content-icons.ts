import type { ICON_RECIPE_VALUES } from '@lodariq/schema';
import type { IconName } from 'lucide-react/dynamic';

type IconRecipe = (typeof ICON_RECIPE_VALUES)[number];

const LUCIDE_ICON_ALIASES: Readonly<Partial<Record<IconRecipe, IconName>>> = {
  warning: 'triangle-alert',
};

export function lucideIconName(icon: IconRecipe): IconName {
  return LUCIDE_ICON_ALIASES[icon] ?? (icon as IconName);
}
