import type { ControlPlaneRepository } from '@lodariq/database';
import type { CreatorModuleDescriptor as CreatorModuleDescriptorType } from '@lodariq/schema';
import type { AuthProvider } from '../auth';
import type { ObservabilitySink } from '../observability';
import type { AuthoringTranslationProvider } from '../authoring-translation';

export interface ControlPlaneRouteOptions {
  repository: ControlPlaneRepository;
  authProvider: AuthProvider;
  publicApiBaseUrl: string;
  loaderSrc?: string;
  publicLoaderSrc?: string;
  /** Optional `sha384-…` digest pinned to the deployed public loader build. */
  publicLoaderIntegrity?: string;
  creatorLoaderSrc?: string;
  creatorModule?: CreatorModuleDescriptorType;
  authoringIframeSrc: string;
  observability: ObservabilitySink;
  authoringTranslationProvider?: AuthoringTranslationProvider;
}
