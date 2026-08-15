import type {
  ControlPlaneRole,
  TenantAuditEventType,
  WorkspaceInvitationRole,
} from '@lodariq/schema';

export const MAX_ACTIVE_WORKSPACES_PER_USER = 5;
export const WORKSPACE_DELETION_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export interface TenantWorkspaceRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  retentionExpiresAt: string | null;
}

export interface WorkspaceMemberRecord {
  workspaceId: string;
  userId: string;
  name: string | null;
  email: string;
  role: ControlPlaneRole;
  joinedAt: string;
}

export interface WorkspaceInvitationSummaryRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInvitationRole;
  expiresAt: string;
  createdAt: string;
}

export interface TenantAuditEventRecord {
  id: string;
  workspaceId: string;
  actorUserId: string;
  eventType: TenantAuditEventType;
  targetUserId: string | null;
  invitationId: string | null;
  previousRole: ControlPlaneRole | null;
  nextRole: ControlPlaneRole | null;
  occurredAt: string;
}

export interface CreateWorkspaceInvitationInput {
  invitation: {
    id: string;
    workspaceId: string;
    emailNormalized: string;
    emailLookupHash: string;
    tokenHash: string;
    role: WorkspaceInvitationRole;
    invitedByUserId: string;
    expiresAt: string;
    acceptedAt: null;
    revokedAt: null;
    createdAt: string;
  };
  outbox: {
    id: string;
    keyId: string;
    acceptancePath: string;
  };
  eventId: string;
}

export type CreateWorkspaceInvitationResult =
  | { status: 'created'; invitationId: string }
  | { status: 'forbidden' | 'not_found' | 'conflict' | 'invalid_input' };

export interface AcceptWorkspaceInvitationInput {
  invitationId: string;
  tokenHash: string;
  userId: string;
  acceptedAt: string;
  eventId: string;
}

export type AcceptWorkspaceInvitationResult =
  | { status: 'accepted'; workspaceId: string; role: WorkspaceInvitationRole }
  | { status: 'invalid_or_expired' | 'email_mismatch' | 'membership_conflict' };

export interface RevokeWorkspaceInvitationInput {
  workspaceId: string;
  invitationId: string;
  actorUserId: string;
  revokedAt: string;
  eventId: string;
}

export interface UpdateWorkspaceMemberRoleInput {
  workspaceId: string;
  targetUserId: string;
  actorUserId: string;
  nextRole: WorkspaceInvitationRole;
  changedAt: string;
  eventId: string;
}

export interface RemoveWorkspaceMemberInput {
  workspaceId: string;
  targetUserId: string;
  actorUserId: string;
  removedAt: string;
  eventId: string;
}

export interface TransferWorkspaceOwnershipInput {
  workspaceId: string;
  actorUserId: string;
  targetUserId: string;
  transferredAt: string;
  eventId: string;
}

export interface WorkspaceDeletionInput {
  workspaceId: string;
  actorUserId: string;
  changedAt: string;
  retentionExpiresAt: string;
  eventId: string;
}

export interface CancelWorkspaceDeletionInput {
  workspaceId: string;
  actorUserId: string;
  changedAt: string;
  eventId: string;
}

export type TenantMutationResult =
  'completed' | 'not_found' | 'forbidden' | 'final_owner' | 'conflict';

export interface WorkspaceDeletionRecord {
  workspaceId: string;
  deletedAt: string;
  retentionExpiresAt: string;
}

export type TenantReadResult<T> =
  { status: 'ok'; value: T } | { status: 'not_found' | 'forbidden' };

export type ScheduleWorkspaceDeletionResult =
  | { status: 'completed'; deletion: WorkspaceDeletionRecord }
  | { status: 'not_found' | 'forbidden' | 'conflict' };

export interface TenantAdministrationRepository {
  listWorkspaceMembers(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<WorkspaceMemberRecord[]>>;
  listWorkspaceInvitations(
    workspaceId: string,
    actorUserId: string,
    now: string,
  ): Promise<TenantReadResult<WorkspaceInvitationSummaryRecord[]>>;
  createWorkspaceInvitation(
    input: CreateWorkspaceInvitationInput,
  ): Promise<CreateWorkspaceInvitationResult>;
  acceptWorkspaceInvitation(
    input: AcceptWorkspaceInvitationInput,
  ): Promise<AcceptWorkspaceInvitationResult>;
  revokeWorkspaceInvitation(input: RevokeWorkspaceInvitationInput): Promise<TenantMutationResult>;
  updateWorkspaceMemberRole(input: UpdateWorkspaceMemberRoleInput): Promise<TenantMutationResult>;
  removeWorkspaceMember(input: RemoveWorkspaceMemberInput): Promise<TenantMutationResult>;
  transferWorkspaceOwnership(input: TransferWorkspaceOwnershipInput): Promise<TenantMutationResult>;
  scheduleWorkspaceDeletion(
    input: WorkspaceDeletionInput,
  ): Promise<ScheduleWorkspaceDeletionResult>;
  cancelWorkspaceDeletion(input: CancelWorkspaceDeletionInput): Promise<TenantMutationResult>;
  listTenantAuditEvents(
    workspaceId: string,
    actorUserId: string,
  ): Promise<TenantReadResult<TenantAuditEventRecord[]>>;
}
