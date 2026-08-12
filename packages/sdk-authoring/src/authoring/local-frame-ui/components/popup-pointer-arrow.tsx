import type { TooltipPlacement } from '../../document-ops';

export function PopupPointerArrow({
  placement,
  visible,
}: {
  placement: TooltipPlacement;
  visible: boolean;
}) {
  if (!visible) return null;
  return <span aria-hidden="true" className="storyboard-popup-arrow" data-placement={placement} />;
}
