import { FormatRegistry, Type, type Static } from '@sinclair/typebox';
import { ControlPlaneRole } from './control-plane';

const EmailAddress = Type.String({
  minLength: 3,
  maxLength: 320,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
});

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;
export const AUTH_PASSWORD_FORMAT = 'lodariq-auth-password';

export function isAuthPassword(value: string): boolean {
  const characterLength = Array.from(value).length;
  return characterLength >= AUTH_PASSWORD_MIN_LENGTH && characterLength <= AUTH_PASSWORD_MAX_LENGTH;
}

FormatRegistry.Set(AUTH_PASSWORD_FORMAT, isAuthPassword);

const Password = Type.String({
  format: AUTH_PASSWORD_FORMAT,
});

const VerifyEmailChallengeId = Type.String({
  minLength: 27,
  maxLength: 128,
  pattern: '^verify_[A-Za-z0-9_-]{20,}$',
});

const VerifyEmailToken = Type.String({
  minLength: 43,
  maxLength: 256,
  pattern: '^lq_verify_[A-Za-z0-9_-]{32,}$',
});

const SetPasswordChallengeId = Type.String({
  minLength: 26,
  maxLength: 128,
  pattern: '^reset_[A-Za-z0-9_-]{20,}$',
});

const SetPasswordToken = Type.String({
  minLength: 42,
  maxLength: 256,
  pattern: '^lq_reset_[A-Za-z0-9_-]{32,}$',
});

const AuthTimestamp = Type.String({
  minLength: 20,
  maxLength: 40,
  format: 'date-time',
});

export const AuthUserSummary = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    email: EmailAddress,
    name: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  },
  { $id: 'AuthUserSummary', additionalProperties: false },
);
export type AuthUserSummary = Static<typeof AuthUserSummary>;

export const AuthWorkspaceSummary = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    role: Type.Ref(ControlPlaneRole),
  },
  { $id: 'AuthWorkspaceSummary', additionalProperties: false },
);
export type AuthWorkspaceSummary = Static<typeof AuthWorkspaceSummary>;

export const AuthSessionSnapshot = Type.Object(
  {
    user: Type.Ref(AuthUserSummary),
    activeWorkspaceId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    workspaces: Type.Array(Type.Ref(AuthWorkspaceSummary)),
  },
  { $id: 'AuthSessionSnapshot', additionalProperties: false },
);
export type AuthSessionSnapshot = Static<typeof AuthSessionSnapshot>;

export const SignUpRequest = Type.Object(
  {
    email: EmailAddress,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    workspaceName: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { $id: 'SignUpRequest', additionalProperties: false },
);
export type SignUpRequest = Static<typeof SignUpRequest>;

export const SignInRequest = Type.Object(
  {
    email: EmailAddress,
    password: Password,
  },
  { $id: 'SignInRequest', additionalProperties: false },
);
export type SignInRequest = Static<typeof SignInRequest>;

export const VerifyEmailRequest = Type.Object(
  {
    challengeId: VerifyEmailChallengeId,
    token: VerifyEmailToken,
    password: Password,
  },
  { $id: 'VerifyEmailRequest', additionalProperties: false },
);
export type VerifyEmailRequest = Static<typeof VerifyEmailRequest>;

export const PasswordRecoveryRequest = Type.Object(
  { email: EmailAddress },
  { $id: 'PasswordRecoveryRequest', additionalProperties: false },
);
export type PasswordRecoveryRequest = Static<typeof PasswordRecoveryRequest>;

const PasswordRecoveryAccepted = Type.Object(
  { status: Type.Literal('accepted') },
  { additionalProperties: false },
);

const DevelopmentPasswordRecoveryAccepted = Type.Object(
  {
    status: Type.Literal('accepted'),
    challengeId: SetPasswordChallengeId,
    expiresAt: AuthTimestamp,
    resetToken: SetPasswordToken,
  },
  { additionalProperties: false },
);

/**
 * A schema-valid recovery request always receives the same accepted result.
 * Local development may expose the complete generated challenge tuple for
 * every request; production omits it. Partial tuples are deliberately invalid.
 */
export const PasswordRecoveryAcceptedResponse = Type.Union(
  [PasswordRecoveryAccepted, DevelopmentPasswordRecoveryAccepted],
  { $id: 'PasswordRecoveryAcceptedResponse' },
);
export type PasswordRecoveryAcceptedResponse = Static<typeof PasswordRecoveryAcceptedResponse>;

export const SetPasswordRequest = Type.Object(
  {
    challengeId: SetPasswordChallengeId,
    token: SetPasswordToken,
    password: Password,
  },
  { $id: 'SetPasswordRequest', additionalProperties: false },
);
export type SetPasswordRequest = Static<typeof SetPasswordRequest>;

export const SetPasswordResponse = Type.Object(
  {
    status: Type.Literal('password_updated'),
    session: Type.Ref(AuthSessionSnapshot),
  },
  { $id: 'SetPasswordResponse', additionalProperties: false },
);
export type SetPasswordResponse = Static<typeof SetPasswordResponse>;

export const EmailVerificationRequiredResponse = Type.Object(
  {
    status: Type.Literal('verification_required'),
    challengeId: Type.String({ minLength: 27, maxLength: 128 }),
    expiresAt: AuthTimestamp,
    verificationToken: Type.Optional(Type.String({ minLength: 32, maxLength: 256 })),
  },
  { $id: 'EmailVerificationRequiredResponse', additionalProperties: false },
);
export type EmailVerificationRequiredResponse = Static<typeof EmailVerificationRequiredResponse>;

export const WorkspaceListResponse = Type.Object(
  {
    activeWorkspaceId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    workspaces: Type.Array(Type.Ref(AuthWorkspaceSummary)),
  },
  { $id: 'WorkspaceListResponse', additionalProperties: false },
);
export type WorkspaceListResponse = Static<typeof WorkspaceListResponse>;

export const CreateWorkspaceRequest = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { $id: 'CreateWorkspaceRequest', additionalProperties: false },
);
export type CreateWorkspaceRequest = Static<typeof CreateWorkspaceRequest>;

export const SelectWorkspaceParams = Type.Object(
  { workspaceId: Type.String({ minLength: 1, maxLength: 256 }) },
  { $id: 'SelectWorkspaceParams', additionalProperties: false },
);
export type SelectWorkspaceParams = Static<typeof SelectWorkspaceParams>;
