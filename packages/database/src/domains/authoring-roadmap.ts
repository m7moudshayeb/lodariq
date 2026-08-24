export const AUTHORING_ROADMAP_RECORD_KINDS = ['demo_link', 'demo_analytics'] as const;
export type AuthoringRoadmapRecordKind = (typeof AUTHORING_ROADMAP_RECORD_KINDS)[number];

export const AUTHORING_ROADMAP_RECORD_STATUSES = ['active', 'revoked', 'expired', 'event'] as const;
export type AuthoringRoadmapRecordStatus = (typeof AUTHORING_ROADMAP_RECORD_STATUSES)[number];

/**
 * Generic storage envelope for the roadmap's document-scoped resources.
 * Payloads are validated against their @lodariq/schema contract before they
 * cross the API boundary; the database keeps the envelope tenant-scoped so a
 * future roadmap feature does not need a new table for every reviewable object.
 */
export interface AuthoringRoadmapRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  kind: AuthoringRoadmapRecordKind;
  status: AuthoringRoadmapRecordStatus;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface CreateAuthoringRoadmapRecordInput {
  record: AuthoringRoadmapRecord;
}

export interface UpdateAuthoringRoadmapRecordInput {
  workspaceId: string;
  id: string;
  status?: AuthoringRoadmapRecordStatus;
  payload?: Record<string, unknown>;
  expiresAt?: string | null;
  revokedAt?: string | null;
  updatedAt: string;
}

export const AUTHORING_COPY_RECORD_KINDS = ['suggestion', 'decision'] as const;
export type AuthoringCopyRecordKind = (typeof AUTHORING_COPY_RECORD_KINDS)[number];

export interface AuthoringCopyRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  kind: AuthoringCopyRecordKind;
  payload: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: string;
}

export interface CreateAuthoringCopyRecordInput {
  record: AuthoringCopyRecord;
}
