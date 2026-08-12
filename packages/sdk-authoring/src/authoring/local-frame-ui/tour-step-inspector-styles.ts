import { createNonceStyleElement } from '@lodariq/schema/dom';
import { useLayoutEffect } from 'react';
import { AUTHORING_BLOCK_INSPECTOR_CSS } from './styles/block-inspector';
import { AUTHORING_POPUP_TRANSFORM_CSS } from './styles/popup-transform';
import { AUTHORING_STEP_SETTINGS_CSS } from './styles/step-settings';

const TOUR_STEP_INSPECTOR_CSS = `
  ${AUTHORING_BLOCK_INSPECTOR_CSS}
  ${AUTHORING_POPUP_TRANSFORM_CSS}
  ${AUTHORING_STEP_SETTINGS_CSS}
`;

interface InspectorStyleRecord {
  references: number;
  style: HTMLStyleElement;
}

const INSPECTOR_STYLES = new WeakMap<Document, InspectorStyleRecord>();

export function useTourStepInspectorStyles(): void {
  useLayoutEffect(() => {
    const ownerDocument = globalThis.document;
    const existing = INSPECTOR_STYLES.get(ownerDocument);
    if (existing) {
      existing.references += 1;
      return () => releaseTourStepInspectorStyles(ownerDocument);
    }

    const style = createNonceStyleElement(ownerDocument, TOUR_STEP_INSPECTOR_CSS);
    style.dataset.lodariqTourStepInspectorStyles = 'true';
    ownerDocument.head.appendChild(style);
    INSPECTOR_STYLES.set(ownerDocument, { references: 1, style });
    return () => releaseTourStepInspectorStyles(ownerDocument);
  }, []);
}

function releaseTourStepInspectorStyles(ownerDocument: Document): void {
  const record = INSPECTOR_STYLES.get(ownerDocument);
  if (!record) return;
  record.references -= 1;
  if (record.references > 0) return;
  record.style.remove();
  INSPECTOR_STYLES.delete(ownerDocument);
}
