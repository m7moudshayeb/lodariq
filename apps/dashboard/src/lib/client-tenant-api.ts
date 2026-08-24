'use client';

import {
  WorkspaceInvitationList,
  WorkspaceInvitationResult,
  WorkspaceMemberList,
  EnterpriseWorkspaceConfiguration,
  EnterpriseSsoConnection,
  EnterpriseDomain,
  EnterpriseGroupRoleMapping,
  CreateScimTokenResult,
  EnterpriseBreakGlassRecord,
  isValid,
  type ControlPlaneRole,
  type WorkspaceInvitationRole,
  type WorkspaceInvitationSummary,
  type WorkspaceMember,
  type AuthAssuranceLevel,
  type EnterpriseIdentityProvider,
  type EnterpriseProvisioningMode,
  type EnterpriseManagedRole,
  type EnterpriseWorkspaceConfiguration as EnterpriseConfiguration,
  type EnterpriseSsoConnection as EnterpriseConnection,
  type EnterpriseDomain as EnterpriseDomainResult,
  type EnterpriseGroupRoleMapping as EnterpriseMapping,
  type CreateScimTokenResult as ScimTokenResult,
  type EnterpriseBreakGlassRecord as BreakGlassResult,
} from '@lodariq/schema';
import { ClientAuthError } from './client-auth-api';

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const payload = await tenantRequest(`/v1/workspaces/${encodeURIComponent(workspaceId)}/members`);
  if (!isValid(WorkspaceMemberList, payload)) throw invalidTenantResponse();
  return payload.members;
}

export async function listWorkspaceInvitations(
  workspaceId: string,
): Promise<WorkspaceInvitationSummary[]> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
  );
  if (!isValid(WorkspaceInvitationList, payload)) throw invalidTenantResponse();
  return payload.invitations;
}

export async function createWorkspaceInvitation(
  workspaceId: string,
  email: string,
  role: WorkspaceInvitationRole,
): Promise<void> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
    { method: 'POST', body: JSON.stringify({ email, role }) },
  );
  if (!isValid(WorkspaceInvitationResult, payload)) throw invalidTenantResponse();
}

export async function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
    { method: 'DELETE', body: '{}' },
    true,
  );
}

export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceInvitationRole,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    true,
  );
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE', body: '{}' },
    true,
  );
}

export async function transferWorkspaceOwnership(
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/ownership-transfer`,
    { method: 'POST', body: JSON.stringify({ targetUserId }) },
    true,
  );
}

export async function scheduleWorkspaceDeletion(workspaceId: string): Promise<void> {
  await tenantRequest(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
    body: '{}',
  });
}

export async function getEnterpriseConfiguration(
  workspaceId: string,
): Promise<EnterpriseConfiguration> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/configuration`,
  );
  if (!isValid(EnterpriseWorkspaceConfiguration, payload)) throw invalidTenantResponse();
  return payload;
}

export async function createEnterpriseSsoConnection(
  workspaceId: string,
  input: {
    provider: EnterpriseIdentityProvider;
    protocol: 'oidc' | 'saml';
    issuer: string;
    clientId: string;
    provisioningMode: EnterpriseProvisioningMode;
  },
): Promise<EnterpriseConnection> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/sso-connections`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (!isValid(EnterpriseSsoConnection, payload)) throw invalidTenantResponse();
  return payload;
}

export async function disableEnterpriseSsoConnection(
  workspaceId: string,
  connectionId: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/sso-connections/${encodeURIComponent(connectionId)}`,
    { method: 'DELETE', body: '{}' },
    true,
  );
}

export async function createEnterpriseDomain(
  workspaceId: string,
  connectionId: string,
  domain: string,
): Promise<EnterpriseDomainResult> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/domains`,
    { method: 'POST', body: JSON.stringify({ connectionId, domain }) },
  );
  if (!isValid(EnterpriseDomain, payload)) throw invalidTenantResponse();
  return payload;
}

export async function verifyEnterpriseDomain(
  workspaceId: string,
  domainId: string,
  proof: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/domains/${encodeURIComponent(domainId)}/verify`,
    {
      method: 'POST',
      body: '{}',
      headers: {
        'x-lodariq-domain-verification': proof,
      },
    },
    true,
  );
}

export async function updateEnterpriseAuthPolicy(
  workspaceId: string,
  input: {
    ssoRequired: boolean;
    minimumAssurance: AuthAssuranceLevel;
    passwordAllowed: boolean;
  },
  breakGlassRequestId?: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/auth-policy`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
      headers: breakGlassRequestId
        ? { 'x-lodariq-break-glass-request-id': breakGlassRequestId }
        : undefined,
    },
    true,
  );
}

export async function upsertEnterpriseGroupRoleMapping(
  workspaceId: string,
  connectionId: string,
  groupId: string,
  role: EnterpriseManagedRole,
): Promise<EnterpriseMapping> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/sso-connections/${encodeURIComponent(connectionId)}/group-role-mappings`,
    { method: 'PUT', body: JSON.stringify({ groupId, role }) },
  );
  if (!isValid(EnterpriseGroupRoleMapping, payload)) throw invalidTenantResponse();
  return payload;
}

export async function createEnterpriseScimToken(
  workspaceId: string,
  connectionId: string,
): Promise<ScimTokenResult> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/scim-tokens`,
    { method: 'POST', body: JSON.stringify({ connectionId }) },
  );
  if (!isValid(CreateScimTokenResult, payload)) throw invalidTenantResponse();
  return payload;
}

export async function disableEnterpriseScimToken(
  workspaceId: string,
  scimConnectionId: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/scim-tokens/${encodeURIComponent(scimConnectionId)}`,
    { method: 'DELETE', body: '{}' },
    true,
  );
}

export async function createEnterpriseBreakGlassRequest(
  workspaceId: string,
  reason: string,
): Promise<BreakGlassResult> {
  const payload = await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/break-glass`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  if (!isValid(EnterpriseBreakGlassRecord, payload)) throw invalidTenantResponse();
  return payload;
}

export async function approveEnterpriseBreakGlassRequest(
  workspaceId: string,
  requestId: string,
): Promise<void> {
  await tenantRequest(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/enterprise/break-glass/${encodeURIComponent(requestId)}/approve`,
    { method: 'POST', body: '{}' },
    true,
  );
}

interface TenantRequestInit extends RequestInit {
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
}

async function tenantRequest(
  path: string,
  init: TenantRequestInit = {},
  allowEmpty = false,
): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(init.method && init.method !== 'GET' ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw await tenantError(response);
  if (response.status === 204 || allowEmpty) return null;
  return response.json();
}

async function tenantError(response: Response): Promise<ClientAuthError> {
  let code: string | undefined;
  let message = 'The workspace operation could not be completed.';
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof payload.error === 'string') code = payload.error;
    if (typeof payload.message === 'string') message = payload.message;
  } catch {
    // The BFF intentionally suppresses non-JSON upstream errors.
  }
  return new ClientAuthError(response.status, message, code);
}

function invalidTenantResponse(): ClientAuthError {
  return new ClientAuthError(502, 'Lodariq returned an invalid workspace response.');
}

export type TenantMemberRole = ControlPlaneRole;
