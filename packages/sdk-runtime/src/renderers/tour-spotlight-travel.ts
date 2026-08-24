export interface BackdropTravelRect {
  borderRadius: string;
  height: string;
  left: string;
  top: string;
  width: string;
}

export function animateBackdropTravel(
  backdrop: HTMLElement,
  previous: BackdropTravelRect,
  next: BackdropTravelRect,
): Animation | null {
  if (typeof backdrop.animate !== 'function') return null;
  const keyframe = (rect: BackdropTravelRect): Keyframe => ({
    borderRadius: rect.borderRadius,
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  });
  const duration = Number.parseFloat(
    backdrop.ownerDocument.defaultView
      ?.getComputedStyle(backdrop)
      .getPropertyValue('--lq-tour-motion-duration') ?? '',
  );
  return backdrop.animate([keyframe(previous), keyframe(next)], {
    duration: Number.isFinite(duration) ? Math.min(1_200, Math.max(0, duration)) : 240,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  });
}
