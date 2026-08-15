import { Type, type Static } from '@sinclair/typebox';
import {
  CONTROL_PLANE_ROLES,
  ControlPlaneRole,
  type ControlPlaneRole as Role,
} from './control-plane';

export const TENANT_ADMIN_CAPABILITIES = [
  'members:read',
  'invitations:manage',
  'members:manage',
  'ownership:transfer',
  'workspace:delete',
] as const;
export type TenantAdminCapability = (typeof TENANT_ADMIN_CAPABILITIES)[number];

export const TENANT_ADMIN_CAPABILITIES_BY_ROLE = {
  viewer: ['members:read'],
  member: ['members:read'],
  admin: ['members:read', 'invitations:manage', 'members:manage'],
  owner: TENANT_ADMIN_CAPABILITIES,
} as const satisfies Readonly<Record<Role, readonly TenantAdminCapability[]>>;

export const TENANT_ROLE_RANK_BY_ROLE = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const satisfies Readonly<Record<Role, number>>;

export function tenantRoleHasCapability(role: Role, capability: TenantAdminCapability): boolean {
  const capabilities: readonly TenantAdminCapability[] = TENANT_ADMIN_CAPABILITIES_BY_ROLE[role];
  return capabilities.includes(capability);
}

export function isTenantRoleDowngrade(previousRole: Role, nextRole: Role): boolean {
  return TENANT_ROLE_RANK_BY_ROLE[nextRole] < TENANT_ROLE_RANK_BY_ROLE[previousRole];
}

export const WORKSPACE_INVITATION_ROLES = [
  CONTROL_PLANE_ROLES.admin,
  CONTROL_PLANE_ROLES.member,
  CONTROL_PLANE_ROLES.viewer,
] as const;
export type WorkspaceInvitationRole = (typeof WORKSPACE_INVITATION_ROLES)[number];

export const TENANT_AUDIT_EVENT_TYPES = [
  'invitation_created',
  'invitation_revoked',
  'invitation_accepted',
  'membership_role_changed',
  'membership_removed',
  'ownership_transferred',
  'workspace_deletion_scheduled',
  'workspace_deletion_cancelled',
] as const;
export type TenantAuditEventType = (typeof TENANT_AUDIT_EVENT_TYPES)[number];

const WorkspaceId = Type.String({ minLength: 1, maxLength: 256 });
const UserId = Type.String({ minLength: 1, maxLength: 256 });
const InvitationId = Type.String({
  minLength: 27,
  maxLength: 128,
  pattern: '^invite_[A-Za-z0-9_-]{20,}$',
});
const InvitationToken = Type.String({
  minLength: 42,
  maxLength: 256,
  pattern: '^lq_invite_[A-Za-z0-9_-]{32,}$',
});
const Timestamp = Type.String({ minLength: 20, maxLength: 40, format: 'date-time' });
const Email = Type.String({
  minLength: 3,
  maxLength: 320,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
});
const InvitationRole = Type.Union(WORKSPACE_INVITATION_ROLES.map((role) => Type.Literal(role)));

export const WorkspaceParams = Type.Object(
  { workspaceId: WorkspaceId },
  { $id: 'WorkspaceParams', additionalProperties: false },
);
export type WorkspaceParams = Static<typeof WorkspaceParams>;

export const WorkspaceMemberParams = Type.Object(
  { workspaceId: WorkspaceId, userId: UserId },
  { $id: 'WorkspaceMemberParams', additionalProperties: false },
);
export type WorkspaceMemberParams = Static<typeof WorkspaceMemberParams>;

export const WorkspaceInvitationParams = Type.Object(
  { workspaceId: WorkspaceId, invitationId: InvitationId },
  { $id: 'WorkspaceInvitationParams', additionalProperties: false },
);
export type WorkspaceInvitationParams = Static<typeof WorkspaceInvitationParams>;

export const CreateWorkspaceInvitationRequest = Type.Object(
  { email: Email, role: InvitationRole },
  { $id: 'CreateWorkspaceInvitationRequest', additionalProperties: false },
);
export type CreateWorkspaceInvitationRequest = Static<typeof CreateWorkspaceInvitationRequest>;

export const WorkspaceInvitationResult = Type.Object(
  {
    id: InvitationId,
    workspaceId: WorkspaceId,
    role: InvitationRole,
    expiresAt: Timestamp,
    // Development-only diagnostic escape hatch. Production delivery never exposes
    // the raw secret to the inviting administrator's browser.
    invitationToken: Type.Optional(InvitationToken),
  },
  { $id: 'WorkspaceInvitationResult', additionalProperties: false },
);
export type WorkspaceInvitationResult = Static<typeof WorkspaceInvitationResult>;

export const WorkspaceInvitationSummary = Type.Object(
  {
    id: InvitationId,
    email: Email,
    role: InvitationRole,
    expiresAt: Timestamp,
    createdAt: Timestamp,
  },
  { $id: 'WorkspaceInvitationSummary', additionalProperties: false },
);
export type WorkspaceInvitationSummary = Static<typeof WorkspaceInvitationSummary>;

export const WorkspaceInvitationList = Type.Object(
  { invitations: Type.Array(Type.Ref(WorkspaceInvitationSummary), { maxItems: 10_000 }) },
  { $id: 'WorkspaceInvitationList', additionalProperties: false },
);
export type WorkspaceInvitationList = Static<typeof WorkspaceInvitationList>;

export const AcceptWorkspaceInvitationRequest = Type.Object(
  { invitationId: InvitationId, token: InvitationToken },
  { $id: 'AcceptWorkspaceInvitationRequest', additionalProperties: false },
);
export type AcceptWorkspaceInvitationRequest = Static<typeof AcceptWorkspaceInvitationRequest>;

export const UpdateWorkspaceMemberRoleRequest = Type.Object(
  { role: InvitationRole },
  { $id: 'UpdateWorkspaceMemberRoleRequest', additionalProperties: false },
);
export type UpdateWorkspaceMemberRoleRequest = Static<typeof UpdateWorkspaceMemberRoleRequest>;

export const TransferWorkspaceOwnershipRequest = Type.Object(
  { targetUserId: UserId },
  { $id: 'TransferWorkspaceOwnershipRequest', additionalProperties: false },
);
export type TransferWorkspaceOwnershipRequest = Static<typeof TransferWorkspaceOwnershipRequest>;

export const WorkspaceMember = Type.Object(
  {
    userId: UserId,
    name: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    email: Email,
    role: Type.Ref(ControlPlaneRole),
    joinedAt: Timestamp,
  },
  { $id: 'WorkspaceMember', additionalProperties: false },
);
export type WorkspaceMember = Static<typeof WorkspaceMember>;

export const WorkspaceMemberList = Type.Object(
  { members: Type.Array(Type.Ref(WorkspaceMember), { maxItems: 10_000 }) },
  { $id: 'WorkspaceMemberList', additionalProperties: false },
);
export type WorkspaceMemberList = Static<typeof WorkspaceMemberList>;

export const WorkspaceDeletionResult = Type.Object(
  { workspaceId: WorkspaceId, deletedAt: Timestamp, retentionExpiresAt: Timestamp },
  { $id: 'WorkspaceDeletionResult', additionalProperties: false },
);
export type WorkspaceDeletionResult = Static<typeof WorkspaceDeletionResult>;

export const TenantAuditEvent = Type.Object(
  {
    id: Type.String({ minLength: 27, maxLength: 128, pattern: '^tenevt_[A-Za-z0-9_-]{20,}$' }),
    workspaceId: WorkspaceId,
    actorUserId: UserId,
    eventType: Type.Union(TENANT_AUDIT_EVENT_TYPES.map((event) => Type.Literal(event))),
    targetUserId: Type.Union([UserId, Type.Null()]),
    invitationId: Type.Union([InvitationId, Type.Null()]),
    previousRole: Type.Union([Type.Ref(ControlPlaneRole), Type.Null()]),
    nextRole: Type.Union([Type.Ref(ControlPlaneRole), Type.Null()]),
    occurredAt: Timestamp,
  },
  { $id: 'TenantAuditEvent', additionalProperties: false },
);
export type TenantAuditEvent = Static<typeof TenantAuditEvent>;

export const TenantAuditEventList = Type.Object(
  { events: Type.Array(Type.Ref(TenantAuditEvent), { maxItems: 10_000 }) },
  { $id: 'TenantAuditEventList', additionalProperties: false },
);
export type TenantAuditEventList = Static<typeof TenantAuditEventList>;
