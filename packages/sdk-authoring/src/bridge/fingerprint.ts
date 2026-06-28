import type { ElementFingerprint } from '@talmeh/schema';
import {
  accessibleNameOf,
  ancestorLandmarksOf,
  attributeEntry,
  nearbyTextOf,
  roleOf,
  stableAttributesOf,
} from '@talmeh/schema/dom';

export function captureElementFingerprint(
  element: Element,
  event?: MouseEvent,
): ElementFingerprint {
  const stableAttributes = stableAttributesOf(element);
  const role = roleOf(element);
  const accessibleName = accessibleNameOf(element);
  const rect = element.getBoundingClientRect();

  return {
    stableAttributes,
    tagName: element.tagName.toLowerCase(),
    ...(role ? { role } : {}),
    ...(accessibleName ? { accessibleName, label: accessibleName } : {}),
    ...(element instanceof HTMLInputElement ? { inputType: element.type } : {}),
    ...attributeEntry(element, 'placeholder'),
    ...attributeEntry(element, 'title'),
    ...attributeEntry(element, 'alt'),
    nearbyText: nearbyTextOf(element),
    ancestorLandmarks: ancestorLandmarksOf(element),
    relativePosition: {
      ...(element.parentElement ? { parentRole: roleOf(element.parentElement) } : {}),
      siblingIndex: element.parentElement
        ? [...element.parentElement.children].indexOf(element)
        : undefined,
    },
    diagnosticCoordinates: {
      x: event?.clientX ?? rect.left + rect.width / 2,
      y: event?.clientY ?? rect.top + rect.height / 2,
    },
  };
}
