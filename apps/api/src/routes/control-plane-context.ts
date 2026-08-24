import type { ControlPlaneRepository } from '@lodariq/database';
import type { CreatorModuleDescriptor as CreatorModuleDescriptorType } from '@lodariq/schema';
import type { AuthProvider } from '../auth';
import type { ObservabilitySink } from '../observability';
import type { AuthoringTranslationProvider } from '../authoring-translation';
import type { AuthoringAssistCoordinator, AuthoringAssistProvider } from '../authoring-assist';
import type { NarrationGenerationCoordinator, NarrationProvider } from '../authoring-narration';
import type { BrandDriftEmailNotifier } from '../brand-drift-email';
import type { CommercialBillingProvider } from '../commercial-billing';

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
  authoringAssistProvider?: AuthoringAssistProvider;
  authoringAssistCoordinator: AuthoringAssistCoordinator;
  narrationProvider?: NarrationProvider;
  narrationGenerationCoordinator: NarrationGenerationCoordinator;
  webhookSigningKey?: string;
  /** HMAC key used only to bind the public demo session cookie to its link. */
  demoLinkSecret?: string;
  /**
   * Whether anything will ever act on the work these routes accept. Billing
   * already refuses with 503 when its provider is absent; residency and the
   * warehouse accepted the request, returned 201 and a pending row, and left an
   * admin watching a migration that nothing was ever going to advance.
   */
  dataResidencyExecutorConfigured?: boolean;
  analyticsWarehouseExecutorConfigured?: boolean;
  brandDriftEmailNotifier?: BrandDriftEmailNotifier;
  billingProvider?: CommercialBillingProvider;
}
