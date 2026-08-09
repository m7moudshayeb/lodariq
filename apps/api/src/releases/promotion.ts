import { createHash } from 'node:crypto';
import type {
  ControlPlaneRepository,
  PromoteVerifiedPublicationInput,
  PromotionResult,
} from '@lodariq/database';

/**
 * Promotion is intentionally isolated from the compiler-owning control-plane
 * route module. The only mutable input is the destination pointer guard; the
 * repository reloads the active verified staging publication and reuses its
 * immutable artifact.
 */
export async function promoteExactVerifiedPublication(
  repository: ControlPlaneRepository,
  input: Omit<PromoteVerifiedPublicationInput, 'requestHash'>,
): Promise<PromotionResult> {
  return repository.promoteVerifiedPublication({
    ...input,
    requestHash: createPromotionRequestHash(input),
  });
}

export function createPromotionRequestHash(
  input: Pick<
    PromoteVerifiedPublicationInput,
    | 'workspaceId'
    | 'sourceEnvironmentId'
    | 'targetEnvironmentId'
    | 'documentId'
    | 'expectedSourcePublicationId'
    | 'expectedGeneration'
  >,
): string {
  const canonicalRequest = JSON.stringify({
    workspaceId: input.workspaceId,
    sourceEnvironmentId: input.sourceEnvironmentId,
    targetEnvironmentId: input.targetEnvironmentId,
    documentId: input.documentId,
    expectedSourcePublicationId: input.expectedSourcePublicationId,
    expectedGeneration: input.expectedGeneration,
  });
  return `sha256-${createHash('sha256').update(canonicalRequest).digest('hex')}`;
}
