import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * How much of each toolbar control is printed, given the room the bar has.
 *
 * `full` prints icon and label. `icons` drops the labels, leaving glyph buttons
 * whose `title` carries the name. `compact` drops the context label too, which
 * is the last thing to go because it is the only part that says what the middle
 * is currently editing.
 */
export type ToolbarFit = 'full' | 'icons' | 'compact';

const STEPS: readonly ToolbarFit[] = ['full', 'icons', 'compact'];

/**
 * Fits the toolbar's contextual middle into the width it actually has (§4.2a).
 *
 * The middle used to clip. At a 444px card that hid Placement, Actions and
 * Motion completely — three of the step's five controls, with no scrollbar and
 * no overflow menu, so a creator had no way to reach them and no way to know
 * they existed. The prototype lets its bar spill outside its own rounded box
 * instead, which keeps the buttons clickable but looks broken.
 *
 * Neither is right, so the bar steps down instead: labels first, then the
 * context label. Controls are never removed, because a control a creator cannot
 * find is the same as one that is not there.
 *
 * Measuring is done against the natural width, not the rendered one — reading
 * the collapsed width would say "it fits now", expand, overflow, and oscillate.
 * The element is briefly restored to `full` inside the layout effect, measured,
 * and set to its answer before the browser paints.
 */
export function useToolbarFit(ref: RefObject<HTMLElement | null>, contents: string): ToolbarFit {
  const [fit, setFit] = useState<ToolbarFit>('full');

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;

    const measure = (): void => {
      const previous = element.dataset['toolbarFit'];
      let chosen: ToolbarFit = STEPS[STEPS.length - 1] ?? 'compact';
      for (const step of STEPS) {
        element.dataset['toolbarFit'] = step;
        if (element.scrollWidth <= element.clientWidth) {
          chosen = step;
          break;
        }
      }
      if (previous === undefined) delete element.dataset['toolbarFit'];
      else element.dataset['toolbarFit'] = previous;
      setFit(chosen);
    };

    measure();
    const observer = new view.ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [contents, ref]);

  return fit;
}
