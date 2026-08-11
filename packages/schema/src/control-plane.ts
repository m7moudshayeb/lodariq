import { Type, type Static } from '@sinclair/typebox';

export const CONTROL_PLANE_ROLES = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  viewer: 'viewer',
} as const;

/** Roles allowed to enter creator authoring. `member` is the current creator tier. */
export const AUTHORING_CONTROL_PLANE_ROLES = [
  CONTROL_PLANE_ROLES.member,
  CONTROL_PLANE_ROLES.admin,
  CONTROL_PLANE_ROLES.owner,
] as const;
export type AuthoringControlPlaneRole = (typeof AUTHORING_CONTROL_PLANE_ROLES)[number];

export function isAuthoringControlPlaneRole(value: unknown): value is AuthoringControlPlaneRole {
  return (AUTHORING_CONTROL_PLANE_ROLES as readonly unknown[]).includes(value);
}

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
