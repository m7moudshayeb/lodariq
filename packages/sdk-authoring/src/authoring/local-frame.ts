import { mountLocalAuthoringReactFrame } from './local-frame-app';
import type { LocalAuthoringFrameOptions } from './local-frame-types';

export type {
  LocalAuthoringFrameMetricEvent,
  LocalAuthoringFrameMetricName,
  LocalAuthoringFrameOptions,
  LocalAuthoringFrameServices,
} from './local-frame-types';

export function mountLocalAuthoringFrame(options: LocalAuthoringFrameOptions): void {
  mountLocalAuthoringReactFrame(options);
}
