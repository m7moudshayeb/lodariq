import { describe, expect, it } from 'vitest';
import {
  AcceptWorkspaceInvitationRequest,
  CreateWorkspaceInvitationRequest,
  TENANT_ADMIN_CAPABILITIES_BY_ROLE,
  TenantAuditEvent,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceInvitationResult,
  isTenantRoleDowngrade,
  tenantRoleHasCapability,
  validate,
} from '@lodariq/schema';

describe('@lodariq/schema tenant administration contracts', () => {
  it('centralizes the least-privilege role capability matrix', () => {
    expect(TENANT_ADMIN_CAPABILITIES_BY_ROLE.viewer).toEqual(['members:read']);
    expect(TENANT_ADMIN_CAPABILITIES_BY_ROLE.member).toEqual(['members:read']);
    expect(tenantRoleHasCapability('admin', 'members:manage')).toBe(true);
    expect(tenantRoleHasCapability('admin', 'ownership:transfer')).toBe(false);
    expect(tenantRoleHasCapability('owner', 'workspace:delete')).toBe(true);
    expect(isTenantRoleDowngrade('owner', 'admin')).toBe(true);
    expect(isTenantRoleDowngrade('member', 'admin')).toBe(false);
  });

  it('accepts bounded invitation and audit payloads', () => {
    expect(
      validate(CreateWorkspaceInvitationRequest, {
        email: 'member@example.com',
        role: 'member',
      }).valid,
    ).toBe(true);
    expect(
      validate(AcceptWorkspaceInvitationRequest, {
        invitationId: 'invite_abcdefghijklmnopqrstuvwxyz',
        token: `lq_invite_${'a'.repeat(43)}`,
      }).valid,
    ).toBe(true);
    expect(
      validate(WorkspaceInvitationResult, {
        id: 'invite_abcdefghijklmnopqrstuvwxyz',
        workspaceId: 'wk_tenant',
        role: 'viewer',
        expiresAt: '2026-08-22T00:00:00.000Z',
        invitationToken: `lq_invite_${'a'.repeat(43)}`,
      }).valid,
    ).toBe(true);
    expect(
      validate(TenantAuditEvent, {
        id: 'tenevt_abcdefghijklmnopqrstuvwxyz',
        workspaceId: 'wk_tenant',
        actorUserId: 'usr_owner',
        eventType: 'membership_role_changed',
        targetUserId: 'usr_member',
        invitationId: null,
        previousRole: 'member',
        nextRole: 'viewer',
        occurredAt: '2026-08-15T00:00:00.000Z',
      }).valid,
    ).toBe(true);
  });

  it('rejects owner escalation, token substitution, and extra browser claims', () => {
    expect(validate(UpdateWorkspaceMemberRoleRequest, { role: 'owner' }).valid).toBe(false);
    expect(
      validate(CreateWorkspaceInvitationRequest, {
        email: 'member@example.com',
        role: 'member',
        actorRole: 'owner',
      }).valid,
    ).toBe(false);
    expect(
      validate(AcceptWorkspaceInvitationRequest, {
        invitationId: 'invite_abcdefghijklmnopqrstuvwxyz',
        token: 'lq_invite_too_short',
      }).valid,
    ).toBe(false);
    expect(
      validate(TenantAuditEvent, {
        id: 'tenevt_abcdefghijklmnopqrstuvwxyz',
        workspaceId: 'wk_tenant',
        actorUserId: 'usr_owner',
        eventType: 'membership_role_changed',
        targetUserId: 'usr_member',
        invitationId: null,
        previousRole: 'member',
        nextRole: 'superadmin',
        occurredAt: '2026-08-15T00:00:00.000Z',
      }).valid,
    ).toBe(false);
  });
});
