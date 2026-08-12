import { type AuthoringSessionRecord } from '@lodariq/database';
import type { AuthoringSessionResponse } from '../support';

export function toAuthoringSessionResponse(
  session: AuthoringSessionRecord,
): AuthoringSessionResponse {
  const response: AuthoringSessionResponse = {
    id: session.id,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment: session.environment,
    documentId: session.documentId,
    correlationId: session.correlationId,
    iframeSrc: session.iframeSrc,
    createdByUserId: session.createdByUserId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
  if (session.revokedAt !== undefined) response.revokedAt = session.revokedAt;
  if (session.compilerVersion !== undefined) response.compilerVersion = session.compilerVersion;
  if (session.rendererContractVersion !== undefined) {
    response.rendererContractVersion = session.rendererContractVersion;
  }
  if (session.themeContractVersion !== undefined) {
    response.themeContractVersion = session.themeContractVersion;
  }
  if (session.themeVersionId !== undefined) response.themeVersionId = session.themeVersionId;
  return response;
}
