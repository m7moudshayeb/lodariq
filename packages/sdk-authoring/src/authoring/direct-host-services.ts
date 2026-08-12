import {
  createDirectAuthoringHostServicesImplementation,
  type DirectAuthoringHostServiceHandle,
} from './direct-host-services-impl';
import type { DirectAuthoringHostServiceOptions } from './direct-host-service-types';

export type {
  DirectAuthoringHostFrameServices,
  DirectAuthoringHostServiceHandle,
} from './direct-host-services-impl';
export type { DirectAuthoringHostServiceOptions } from './direct-host-service-types';

export function createDirectAuthoringHostServices(
  options: DirectAuthoringHostServiceOptions,
): DirectAuthoringHostServiceHandle {
  return createDirectAuthoringHostServicesImplementation(options);
}
