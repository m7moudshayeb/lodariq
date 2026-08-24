import { createHash, randomUUID } from 'node:crypto';
import type { ControlPlaneRepository } from '@lodariq/database';
import type { WebhookEventEnvelope, WebhookEventType } from '@lodariq/schema';

export async function enqueueGovernanceWebhookEvent(
  repository: ControlPlaneRepository,
  input: {
    workspaceId: string;
    type: WebhookEventType;
    occurredAt: string;
    data: Record<string, unknown>;
    eventId?: string;
  },
) {
  const event: WebhookEventEnvelope = {
    schemaVersion: '1',
    id: input.eventId ?? `whevt_${randomUUID()}`,
    workspaceId: input.workspaceId,
    type: input.type,
    occurredAt: input.occurredAt,
    data: structuredClone(input.data),
  };
  return repository.enqueueWebhookEvent({
    event,
    deliveryIdForEndpoint(endpointId) {
      const digest = createHash('sha256')
        .update(`${event.workspaceId}:${event.id}:${endpointId}`)
        .digest('base64url');
      return `whdel_${digest}`;
    },
  });
}

export async function enqueueReleaseWebhookEvent(
  repository: ControlPlaneRepository,
  input: {
    workspaceId: string;
    environmentId: string;
    documentId: string;
    operationId: string;
    action: 'activated' | 'rolled_back' | 'unpublished';
    occurredAt: string;
    generation: number;
    publicationId?: string;
    contentHash?: string;
  },
) {
  const typeByAction = {
    activated: 'release.activated',
    rolled_back: 'release.rolled_back',
    unpublished: 'release.unpublished',
  } as const;
  const digest = createHash('sha256')
    .update(`${input.workspaceId}:${input.operationId}:${input.action}`)
    .digest('base64url');
  return enqueueGovernanceWebhookEvent(repository, {
    workspaceId: input.workspaceId,
    type: typeByAction[input.action],
    occurredAt: input.occurredAt,
    eventId: `whevt_${digest}`,
    data: {
      environmentId: input.environmentId,
      documentId: input.documentId,
      operationId: input.operationId,
      generation: input.generation,
      ...(input.publicationId ? { publicationId: input.publicationId } : {}),
      ...(input.contentHash ? { contentHash: input.contentHash } : {}),
    },
  });
}
