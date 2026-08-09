import { Type, type Static } from '@sinclair/typebox';

export const CONTROL_PLANE_ROLES = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  viewer: 'viewer',
} as const;

function controlPlaneRoleVariants() {
  return [
    Type.Literal(CONTROL_PLANE_ROLES.owner),
    Type.Literal(CONTROL_PLANE_ROLES.admin),
    Type.Literal(CONTROL_PLANE_ROLES.member),
    Type.Literal(CONTROL_PLANE_ROLES.viewer),
  ];
}

/** Workspace role resolved by the control plane after authentication. */
export const ControlPlaneRole = Type.Union(controlPlaneRoleVariants(), {
  $id: 'ControlPlaneRole',
});
export type ControlPlaneRole = Static<typeof ControlPlaneRole>;

/** Exact, provider-neutral identity and membership context exposed to first-party clients. */
export const ControlPlaneAuthContext = Type.Object(
  {
    userId: Type.String({ minLength: 1, maxLength: 256 }),
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    role: Type.Union(controlPlaneRoleVariants()),
  },
  { $id: 'ControlPlaneAuthContext', additionalProperties: false },
);
export type ControlPlaneAuthContext = Static<typeof ControlPlaneAuthContext>;
