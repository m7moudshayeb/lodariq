import type { CompiledDocument } from '@lodariq/schema';
import { assertSupportedCompiledArtifactIfVersioned } from '../artifact-compatibility';
import type { AuthoringPreviewPlaybackOptions, TourRendererModule } from './contracts';

interface AuthoringPreviewController {
  play(document: CompiledDocument, options: AuthoringPreviewPlaybackOptions): Promise<void>;
  stop(ownerId: string): void;
}

/** Creator-only preview state, loaded only after a non-production preview request. */
export function createAuthoringPreviewController(
  loadTourRenderer: () => Promise<TourRendererModule>,
): AuthoringPreviewController {
  const active = new Map<string, InstanceType<TourRendererModule['TourPlayer']>>();
  const requestIds = new Map<string, number>();

  return {
    async play(document, options) {
      const ownerId = options.ownerId.trim();
      if (!ownerId) throw new Error('Lodariq authoring preview owner id is required');
      assertPreviewDocument(document);

      const requestId = (requestIds.get(ownerId) ?? 0) + 1;
      requestIds.set(ownerId, requestId);
      active.get(ownerId)?.stop();
      active.delete(ownerId);

      const { TourPlayer } = await loadTourRenderer();
      if (requestIds.get(ownerId) !== requestId) {
        throw new Error('Lodariq authoring preview was canceled');
      }
      const { ownerId: _ownerId, interactive, ...tourOptions } = options;
      const player = new TourPlayer(document, {
        ...tourOptions,
        authoringPreviewOwnerId: ownerId,
        ...(interactive ? { authoringPreviewInteractive: true } : {}),
      });
      active.set(ownerId, player);
      player.start();
      try {
        await player.waitUntilReady();
        if (requestIds.get(ownerId) !== requestId || active.get(ownerId) !== player) {
          throw new Error('Lodariq authoring preview was canceled');
        }
      } catch (error) {
        if (active.get(ownerId) === player) {
          active.delete(ownerId);
          player.stop();
        }
        throw error;
      }
    },
    stop(ownerIdValue) {
      const ownerId = ownerIdValue.trim();
      if (!ownerId) return;
      requestIds.set(ownerId, (requestIds.get(ownerId) ?? 0) + 1);
      active.get(ownerId)?.stop();
      active.delete(ownerId);
    },
  };
}

function assertPreviewDocument(value: unknown): asserts value is CompiledDocument {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as Partial<CompiledDocument>).documentId !== 'string' ||
    !Array.isArray((value as Partial<CompiledDocument>).steps)
  ) {
    throw new Error('Lodariq.playTour requires compiled delivery JSON with documentId and steps');
  }
  assertSupportedCompiledArtifactIfVersioned(value as CompiledDocument);
}
