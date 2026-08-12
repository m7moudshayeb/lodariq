import { authoringText } from '../../../i18n';
import { lazy, Suspense } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

export interface PanelBodyModeProps {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}

const optionalPanelBodyModePromise = import('./panel-body-mode-impl');

const LazyOptionalPanelBodyMode = lazy(async () => {
  const module = await optionalPanelBodyModePromise;
  return { default: module.OptionalPanelBodyMode };
});

export function PanelBodyMode(props: PanelBodyModeProps) {
  return (
    <Suspense fallback={<OptionalPanelBodyModeFallback />}>
      <LazyOptionalPanelBodyMode {...props} />
    </Suspense>
  );
}

export function OptionalPanelBodyModeFallback() {
  return (
    <p aria-busy="true" aria-live="polite" role="status">
      {authoringText('Loading authoring tools…')}
    </p>
  );
}
