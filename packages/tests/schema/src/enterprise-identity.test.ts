import { describe, expect, it } from 'vitest';
import {
  CreateEnterpriseSsoConnectionRequest,
  EnterpriseSsoDiscoveryResult,
  ScimCreateUserRequest,
  ScimPatchUserRequest,
  ScimUserListQuery,
  UpdateWorkspaceAuthPolicyRequest,
  UpsertEnterpriseGroupRoleMappingRequest,
  validate,
} from '@lodariq/schema';

describe('@lodariq/schema enterprise identity contracts', () => {
  it('keeps connection creation strict and credential-free', () => {
    const valid = {
      provider: 'okta',
      protocol: 'oidc',
      issuer: 'https://example.okta.com/oauth2/default',
      clientId: 'public-client-id',
      provisioningMode: 'invitation_only',
    } as const;
    expect(validate(CreateEnterpriseSsoConnectionRequest, valid).valid).toBe(true);
    expect(
      validate(CreateEnterpriseSsoConnectionRequest, {
        ...valid,
        clientSecret: 'must-never-enter-the-contract',
      }).valid,
    ).toBe(false);
    expect(
      validate(CreateEnterpriseSsoConnectionRequest, {
        ...valid,
        issuer: 'http://metadata.internal/latest',
      }).valid,
    ).toBe(false);
  });

  it('returns domain routing metadata without account or email identity data', () => {
    const result = {
      available: true,
      connectionId: `sso_${'a'.repeat(20)}`,
      protocol: 'oidc',
      provider: 'entra',
    } as const;
    expect(validate(EnterpriseSsoDiscoveryResult, result).valid).toBe(true);
    expect(
      validate(EnterpriseSsoDiscoveryResult, {
        ...result,
        userId: 'usr_account_enumeration',
      }).valid,
    ).toBe(false);
  });

  it('never admits owner as an IdP-managed role', () => {
    expect(
      validate(UpsertEnterpriseGroupRoleMappingRequest, {
        groupId: '00g-secure-admins',
        role: 'admin',
      }).valid,
    ).toBe(true);
    expect(
      validate(UpsertEnterpriseGroupRoleMappingRequest, {
        groupId: '00g-owners',
        role: 'owner',
      }).valid,
    ).toBe(false);
  });

  it('accepts bounded SCIM provider fields and rejects arbitrary privilege input', () => {
    const create = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      externalId: '00u-stable-id',
      userName: 'managed@example.com',
      active: true,
      name: { givenName: 'Managed', familyName: 'Creator' },
      emails: [{ value: 'managed@example.com', primary: true, type: 'work' }],
      groups: [{ value: '00g-members' }],
    } as const;
    expect(validate(ScimCreateUserRequest, create).valid).toBe(true);
    expect(validate(ScimCreateUserRequest, { ...create, role: 'owner' }).valid).toBe(false);
    expect(
      validate(ScimUserListQuery, {
        filter: 'userName eq "managed@example.com"',
        startIndex: 1,
      }).valid,
    ).toBe(true);
    expect(validate(ScimUserListQuery, { filter: '*' }).valid).toBe(false);
    expect(
      validate(ScimPatchUserRequest, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        Operations: [{ op: 'Replace', path: 'active', value: 'False' }],
      }).valid,
    ).toBe(true);
  });

  it('rejects extra workspace-policy authority fields', () => {
    const policy = { ssoRequired: true, minimumAssurance: 'aal2', passwordAllowed: false };
    expect(validate(UpdateWorkspaceAuthPolicyRequest, policy).valid).toBe(true);
    expect(
      validate(UpdateWorkspaceAuthPolicyRequest, {
        ...policy,
        skipBreakGlass: true,
      }).valid,
    ).toBe(false);
  });
});
