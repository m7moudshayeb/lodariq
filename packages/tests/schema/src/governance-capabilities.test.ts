import { describe, expect, it } from 'vitest';
import {
  DashboardEnvironmentsResponse,
  DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES,
  GOVERNANCE_CAPABILITIES_BY_BASE_ROLE,
  resolveEnvironmentGovernanceCapabilities,
  resolveWorkspaceGovernanceCapabilities,
  validate,
  validateGovernanceCapabilityProfileGrant,
} from '@lodariq/schema';

describe('governance capability profiles', () => {
  it('dereferences governance capabilities in non-empty dashboard environment responses', () => {
    const response = {
      environments: [
        {
          id: 'env_development',
          workspaceId: 'wk_a',
          kind: 'development' as const,
          name: 'Development',
          originAllowlist: ['https://dev.example.com'],
          governanceCapabilities: [...DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.development],
          createdAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
        },
      ],
    };

    expect(validate(DashboardEnvironmentsResponse, response)).toEqual({
      valid: true,
      value: response,
    });
  });

  it('keeps viewer authority fail closed even when a forged profile requests grants', () => {
    expect(
      resolveEnvironmentGovernanceCapabilities({
        role: 'viewer',
        environmentCapabilities: DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.staging,
        profile: { baseRole: 'viewer', capabilities: ['authoring:write', 'release:publish'] },
      }),
    ).toEqual([]);
    expect(resolveWorkspaceGovernanceCapabilities('viewer')).toEqual([]);
    expect(validateGovernanceCapabilityProfileGrant('viewer', ['authoring:read'])).toBe(false);
  });

  it('allows a profile to narrow but never expand its fixed base role', () => {
    expect(
      resolveEnvironmentGovernanceCapabilities({
        role: 'member',
        environmentCapabilities: DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.staging,
        profile: {
          baseRole: 'member',
          capabilities: ['authoring:read', 'authoring:write', 'release:verify'],
        },
      }),
    ).toEqual(['authoring:read', 'authoring:write', 'release:verify']);
    expect(validateGovernanceCapabilityProfileGrant('member', ['release:approve'])).toBe(false);
    expect(validateGovernanceCapabilityProfileGrant('admin', ['release:approve'])).toBe(true);
  });

  it('intersects the role and profile with explicit environment capabilities', () => {
    expect(
      resolveEnvironmentGovernanceCapabilities({
        role: 'admin',
        environmentCapabilities: DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.production,
        profile: {
          baseRole: 'admin',
          capabilities: [...GOVERNANCE_CAPABILITIES_BY_BASE_ROLE.admin],
        },
      }),
    ).toEqual(DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.production);
    expect(DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.production).not.toContain('authoring:write');
    expect(DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.production).not.toContain('release:publish');
  });

  it('fails closed when the assigned profile base role no longer matches membership', () => {
    expect(
      resolveEnvironmentGovernanceCapabilities({
        role: 'member',
        environmentCapabilities: DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES.staging,
        profile: { baseRole: 'admin', capabilities: ['release:approve'] },
      }),
    ).toEqual([]);
    expect(
      resolveWorkspaceGovernanceCapabilities('member', {
        baseRole: 'admin',
        capabilities: ['audit:export'],
      }),
    ).toEqual([]);
  });
});
