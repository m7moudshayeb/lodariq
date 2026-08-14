import {
  activeContextualSurfaceIdOf,
  createAuthoringInteractionActor,
} from './state/interaction-machine';

const surfaceActor = createAuthoringInteractionActor();
surfaceActor.start();
const closeCallbacks = new Map<string, () => void>();

/** One authoring frame may expose exactly one transient contextual surface. */
export function claimContextualSurface(id: string, close: () => void): () => void {
  const activeId = activeContextualSurfaceIdOf(surfaceActor);
  if (activeId !== id) closeCallbacks.get(activeId ?? '')?.();
  closeCallbacks.set(id, close);
  surfaceActor.send({ type: 'OPEN_CONTEXTUAL_SURFACE', surfaceId: id });
  return () => {
    closeCallbacks.delete(id);
    surfaceActor.send({ type: 'CLOSE_CONTEXTUAL_SURFACE', surfaceId: id });
  };
}
