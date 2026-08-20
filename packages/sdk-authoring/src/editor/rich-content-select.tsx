import type { PointerEventHandler, ReactElement } from 'react';
import { AuthoringSelect } from '../authoring/local-frame-ui/design-system';

export interface RichContentSelectOption {
  label: string;
  value: string;
}

/**
 * The picker used inside the card's own inspectors.
 *
 * It was a second implementation — a Radix Select, where the rest of the
 * authoring chrome uses the popover listbox. That cost two visible things at
 * once in the Button settings panel: a Radix Select is modal, so moving between
 * two rows took two clicks, and each root dismissed only itself, which let
 * Width and Icon position sit open over each other. It is now the same control
 * the step inspector uses, so both surfaces behave and read alike.
 */
export function RichContentSelect({
  ariaLabel,
  className = '',
  onOpenChange,
  onPointerDown,
  onValueChange,
  open,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onValueChange: (value: string) => void;
  open?: boolean;
  options: readonly RichContentSelectOption[];
  value: string;
}): ReactElement {
  return (
    <AuthoringSelect
      ariaLabel={ariaLabel}
      className={className}
      onOpenChange={onOpenChange}
      onPointerDown={onPointerDown}
      onValueChange={onValueChange}
      open={open}
      options={options}
      size="compact"
      value={value}
    />
  );
}
