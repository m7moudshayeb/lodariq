import type { ActiveManifestPointerV2 } from '@lodariq/schema';
import type { TourPlaybackOptions } from '../loader';
import type { IdentifyTraits } from '../runtime';
import { installDeliveryOrchestrator } from './delivery-orchestrator';

interface DeliveryHooksBrowserApi {
  identify(traits: IdentifyTraits): void;
  track(name: string, props?: Record<string, unknown>): void;
  playTourById(documentId: string, options?: TourPlaybackOptions): Promise<void>;
  stopTour(): void;
}

export function installDeliveryHooks(input: {
  api: DeliveryHooksBrowserApi;
  sources: readonly { artifactManifest?: ActiveManifestPointerV2 }[];
  environment: 'development' | 'staging' | 'production';
  installationId: string;
  catalogUrl?: string;
}): () => void {
  const orchestration = installDeliveryOrchestrator({
    api: input.api,
    manifests: input.sources.flatMap((source) =>
      source.artifactManifest ? [source.artifactManifest] : [],
    ),
    environment: input.environment,
    installationId: input.installationId,
    catalogUrl: input.catalogUrl,
  });
  return () => {
    orchestration.destroy();
    input.api.stopTour();
  };
}
