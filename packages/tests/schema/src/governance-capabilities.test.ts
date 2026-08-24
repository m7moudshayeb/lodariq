import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENVIRONMENT_GOVERNANCE_CAPABILITIES,
  GOVERNANCE_CAPABILITIES_BY_BASE_ROLE,
  resolveEnvironmentGovernanceCapabilities,
  resolveWorkspaceGovernanceCapabilities,
  validateGovernanceCapabilityProfileGrant,
} from '@lodariq/schema';

describe('governance capability profiles', () => {
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
