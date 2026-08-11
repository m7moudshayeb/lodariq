import { describe, expect, it } from 'vitest';
import { AUTHORING_CONTROL_PLANE_ROLES, isAuthoringControlPlaneRole } from '@lodariq/schema';

describe('control-plane authoring roles', () => {
  it('treats member as the creator tier and keeps viewers read-only', () => {
    expect(AUTHORING_CONTROL_PLANE_ROLES).toEqual(['member', 'admin', 'owner']);
    expect(isAuthoringControlPlaneRole('member')).toBe(true);
    expect(isAuthoringControlPlaneRole('admin')).toBe(true);
    expect(isAuthoringControlPlaneRole('owner')).toBe(true);
    expect(isAuthoringControlPlaneRole('viewer')).toBe(false);
  });
});
