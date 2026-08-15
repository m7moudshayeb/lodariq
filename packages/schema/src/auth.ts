import { FormatRegistry, Type, type Static } from '@sinclair/typebox';
import { ControlPlaneRole } from './control-plane';

export const AUTH_EMAIL_MIN_LENGTH = 3;
export const AUTH_EMAIL_MAX_LENGTH = 320;
export const AUTH_EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
export const AUTH_PROFILE_NAME_MIN_LENGTH = 1;
export const AUTH_PROFILE_NAME_MAX_LENGTH = 120;
export const AUTH_WORKSPACE_NAME_MIN_LENGTH = 1;
export const AUTH_WORKSPACE_NAME_MAX_LENGTH = 120;
export const AUTH_LOGIN_IDENTIFIER_MIN_LENGTH = 3;
export const AUTH_LOGIN_IDENTIFIER_MAX_LENGTH = 320;
export const AUTH_LOGIN_IDENTIFIER_PATTERN = '^\\S+$';
export const AUTH_USERNAME_MIN_LENGTH = 3;
export const AUTH_USERNAME_MAX_LENGTH = 32;
export const AUTH_USERNAME_PATTERN = '^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$';

export const AUTH_IDENTITY_KINDS = ['password', 'passkey', 'oidc', 'saml'] as const;
export const AUTHENTICATION_METHODS = ['password', 'passkey', 'oidc', 'saml', 'recovery'] as const;
export const AUTH_ASSURANCE_LEVELS = ['aal1', 'aal2', 'aal3'] as const;
export const AUTH_SESSION_DURATION_POLICIES = ['standard', 'remembered', 'managed'] as const;
export const SSO_PROTOCOLS = ['oidc', 'saml'] as const;
export const SSO_CONNECTION_STATUSES = ['draft', 'verified', 'disabled'] as const;
export const AUTH_ONBOARDING_INTENTS = [
  'create_workspace',
  'accept_invitation',
  'request_access',
] as const;
export const AUTH_ONBOARDING_STATUSES = [
  'pending_identity',
  'pending_destination',
  'completed',
  'cancelled',
] as const;
export const AUTH_IDENTITY_MUTATION_AUTHORIZATIONS = [
  'authenticated_session',
  'strong_recovery',
] as const;

export const AuthIdentityKind = Type.Union(AUTH_IDENTITY_KINDS.map((value) => Type.Literal(value)));
export type AuthIdentityKind = (typeof AUTH_IDENTITY_KINDS)[number];
export const AuthenticationMethod = Type.Union(
  AUTHENTICATION_METHODS.map((value) => Type.Literal(value)),
);
export type AuthenticationMethod = (typeof AUTHENTICATION_METHODS)[number];
export const AuthAssuranceLevel = Type.Union(
  AUTH_ASSURANCE_LEVELS.map((value) => Type.Literal(value)),
  { $id: 'AuthAssuranceLevel' },
);
export type AuthAssuranceLevel = (typeof AUTH_ASSURANCE_LEVELS)[number];
export const AuthSessionDurationPolicy = Type.Union(
  AUTH_SESSION_DURATION_POLICIES.map((value) => Type.Literal(value)),
);
export type AuthSessionDurationPolicy = (typeof AUTH_SESSION_DURATION_POLICIES)[number];
export const SsoProtocol = Type.Union(SSO_PROTOCOLS.map((value) => Type.Literal(value)), {
  $id: 'SsoProtocol',
});
export type SsoProtocol = (typeof SSO_PROTOCOLS)[number];
export const SsoConnectionStatus = Type.Union(
  SSO_CONNECTION_STATUSES.map((value) => Type.Literal(value)),
);
export type SsoConnectionStatus = (typeof SSO_CONNECTION_STATUSES)[number];
export const AuthOnboardingIntent = Type.Union(
  AUTH_ONBOARDING_INTENTS.map((value) => Type.Literal(value)),
);
export type AuthOnboardingIntent = (typeof AUTH_ONBOARDING_INTENTS)[number];
export const AuthOnboardingStatus = Type.Union(
  AUTH_ONBOARDING_STATUSES.map((value) => Type.Literal(value)),
);
export type AuthOnboardingStatus = (typeof AUTH_ONBOARDING_STATUSES)[number];
export const AuthIdentityMutationAuthorization = Type.Union(
  AUTH_IDENTITY_MUTATION_AUTHORIZATIONS.map((value) => Type.Literal(value)),
);
export type AuthIdentityMutationAuthorization =
  (typeof AUTH_IDENTITY_MUTATION_AUTHORIZATIONS)[number];

const EmailAddress = Type.String({
  minLength: AUTH_EMAIL_MIN_LENGTH,
  maxLength: AUTH_EMAIL_MAX_LENGTH,
  pattern: AUTH_EMAIL_PATTERN,
});

export const AuthUsername = Type.String({
  minLength: AUTH_USERNAME_MIN_LENGTH,
  maxLength: AUTH_USERNAME_MAX_LENGTH,
  pattern: AUTH_USERNAME_PATTERN,
});
export type AuthUsername = Static<typeof AuthUsername>;

const LoginIdentifier = Type.String({
  minLength: AUTH_LOGIN_IDENTIFIER_MIN_LENGTH,
  maxLength: AUTH_LOGIN_IDENTIFIER_MAX_LENGTH,
  pattern: AUTH_LOGIN_IDENTIFIER_PATTERN,
});

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;
export const AUTH_PASSWORD_FORMAT = 'lodariq-auth-password';
export const AUTH_CORRELATION_HEADER = 'x-lodariq-auth-correlation-id';
export const AUTH_VERIFICATION_RESEND_COOLDOWN_MS = 30_000;

export function isAuthPassword(value: string): boolean {
  const characterLength = Array.from(value).length;
  return characterLength >= AUTH_PASSWORD_MIN_LENGTH && characterLength <= AUTH_PASSWORD_MAX_LENGTH;
}

FormatRegistry.Set(AUTH_PASSWORD_FORMAT, isAuthPassword);

const Password = Type.String({
  format: AUTH_PASSWORD_FORMAT,
  $comment: `lodariq-unicode-character-length:${AUTH_PASSWORD_MIN_LENGTH}:${AUTH_PASSWORD_MAX_LENGTH}`,
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
    username: Type.Optional(Type.Union([AuthUsername, Type.Null()])),
  },
  { $id: 'AuthUserSummary', additionalProperties: false },
);
export type AuthUserSummary = Static<typeof AuthUserSummary>;

export const AuthWorkspaceSummary = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    name: Type.String({
      minLength: AUTH_PROFILE_NAME_MIN_LENGTH,
      maxLength: AUTH_PROFILE_NAME_MAX_LENGTH,
    }),
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
    name: Type.String({
      minLength: AUTH_PROFILE_NAME_MIN_LENGTH,
      maxLength: AUTH_PROFILE_NAME_MAX_LENGTH,
    }),
    workspaceName: Type.String({
      minLength: AUTH_WORKSPACE_NAME_MIN_LENGTH,
      maxLength: AUTH_WORKSPACE_NAME_MAX_LENGTH,
    }),
  },
  { $id: 'SignUpRequest', additionalProperties: false },
);
export type SignUpRequest = Static<typeof SignUpRequest>;

export const SignInRequest = Type.Object(
  {
    identifier: LoginIdentifier,
    password: Password,
    rememberMe: Type.Optional(Type.Boolean()),
  },
  { $id: 'SignInRequest', additionalProperties: false },
);
export type SignInRequest = Static<typeof SignInRequest>;

export const ChangePasswordRequest = Type.Object(
  { currentPassword: Password, newPassword: Password },
  { $id: 'ChangePasswordRequest', additionalProperties: false },
);
export type ChangePasswordRequest = Static<typeof ChangePasswordRequest>;

export const StartEmailChangeRequest = Type.Object(
  { newEmail: EmailAddress, currentPassword: Password },
  { $id: 'StartEmailChangeRequest', additionalProperties: false },
);
export type StartEmailChangeRequest = Static<typeof StartEmailChangeRequest>;

export const VerifyEmailChangeRequest = Type.Object(
  {
    challengeId: Type.String({
      minLength: 31,
      maxLength: 128,
      pattern: '^emailchange_[A-Za-z0-9_-]{20,}$',
    }),
    proof: Type.Union([Type.Literal('current_email'), Type.Literal('new_email')]),
    token: Type.String({
      minLength: 48,
      maxLength: 256,
      pattern: '^lq_email_change_[A-Za-z0-9_-]{32,}$',
    }),
  },
  { $id: 'VerifyEmailChangeRequest', additionalProperties: false },
);
export type VerifyEmailChangeRequest = Static<typeof VerifyEmailChangeRequest>;

export const EmailChangeSnapshot = Type.Object(
  {
    id: Type.String({ minLength: 31, maxLength: 128 }),
    newEmail: EmailAddress,
    currentEmailVerified: Type.Boolean(),
    newEmailVerified: Type.Boolean(),
    expiresAt: AuthTimestamp,
  },
  { $id: 'EmailChangeSnapshot', additionalProperties: false },
);
export type EmailChangeSnapshot = Static<typeof EmailChangeSnapshot>;

export const AuthSessionSummary = Type.Object(
  {
    id: Type.String({ minLength: 29, maxLength: 256 }),
    deviceLabel: Type.String({ minLength: 1, maxLength: 120 }),
    authenticationMethod: AuthenticationMethod,
    assuranceLevel: AuthAssuranceLevel,
    durationPolicy: AuthSessionDurationPolicy,
    createdAt: AuthTimestamp,
    lastSeenAt: AuthTimestamp,
    expiresAt: AuthTimestamp,
    current: Type.Boolean(),
  },
  { $id: 'AuthSessionSummary', additionalProperties: false },
);
export type AuthSessionSummary = Static<typeof AuthSessionSummary>;

export const AuthSessionListResponse = Type.Object(
  { sessions: Type.Array(Type.Ref(AuthSessionSummary), { maxItems: 100 }) },
  { $id: 'AuthSessionListResponse', additionalProperties: false },
);
export type AuthSessionListResponse = Static<typeof AuthSessionListResponse>;

export const AuthSessionParams = Type.Object(
  { sessionId: Type.String({ minLength: 29, maxLength: 256 }) },
  { $id: 'AuthSessionParams', additionalProperties: false },
);
export type AuthSessionParams = Static<typeof AuthSessionParams>;

export const AuthIdentitySummary = Type.Object(
  {
    id: Type.String({ minLength: 27, maxLength: 256 }),
    kind: AuthIdentityKind,
    issuer: Type.String({ minLength: 1, maxLength: 2048 }),
    providerTenantId: Type.Union([Type.String({ minLength: 1, maxLength: 1024 }), Type.Null()]),
    createdAt: AuthTimestamp,
    lastAuthenticatedAt: Type.Union([AuthTimestamp, Type.Null()]),
  },
  { $id: 'AuthIdentitySummary', additionalProperties: false },
);
export type AuthIdentitySummary = Static<typeof AuthIdentitySummary>;

export const AuthIdentityListResponse = Type.Object(
  { identities: Type.Array(Type.Ref(AuthIdentitySummary), { maxItems: 50 }) },
  { $id: 'AuthIdentityListResponse', additionalProperties: false },
);
export type AuthIdentityListResponse = Static<typeof AuthIdentityListResponse>;

export const AuthIdentityParams = Type.Object(
  { identityId: Type.String({ minLength: 27, maxLength: 256 }) },
  { $id: 'AuthIdentityParams', additionalProperties: false },
);
export type AuthIdentityParams = Static<typeof AuthIdentityParams>;

const WebAuthnBase64Url = Type.String({
  minLength: 1,
  maxLength: 262_144,
  pattern: '^[A-Za-z0-9_-]+$',
});
const WebAuthnClientExtensions = Type.Record(
  Type.String({ minLength: 1, maxLength: 128 }),
  Type.Unknown(),
  { maxProperties: 32 },
);

export const WebAuthnRegistrationCredential = Type.Object(
  {
    id: Type.String({ minLength: 16, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' }),
    rawId: Type.String({ minLength: 16, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' }),
    response: Type.Object(
      {
        clientDataJSON: Type.String({ minLength: 1, maxLength: 16_384 }),
        attestationObject: WebAuthnBase64Url,
        authenticatorData: Type.Optional(WebAuthnBase64Url),
        publicKey: Type.Optional(WebAuthnBase64Url),
        publicKeyAlgorithm: Type.Optional(Type.Integer({ minimum: -65_536, maximum: 65_536 })),
        transports: Type.Optional(
          Type.Array(Type.String({ minLength: 2, maxLength: 32 }), {
            maxItems: 8,
            uniqueItems: true,
          }),
        ),
      },
      { additionalProperties: false },
    ),
    authenticatorAttachment: Type.Optional(
      Type.Union([Type.Literal('cross-platform'), Type.Literal('platform')]),
    ),
    clientExtensionResults: WebAuthnClientExtensions,
    type: Type.Literal('public-key'),
  },
  { $id: 'WebAuthnRegistrationCredential', additionalProperties: false },
);
export type WebAuthnRegistrationCredential = Static<typeof WebAuthnRegistrationCredential>;

export const WebAuthnAuthenticationCredential = Type.Object(
  {
    id: Type.String({ minLength: 16, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' }),
    rawId: Type.String({ minLength: 16, maxLength: 2048, pattern: '^[A-Za-z0-9_-]+$' }),
    response: Type.Object(
      {
        clientDataJSON: Type.String({ minLength: 1, maxLength: 16_384 }),
        authenticatorData: WebAuthnBase64Url,
        signature: WebAuthnBase64Url,
        userHandle: Type.Optional(Type.String({ maxLength: 2048 })),
      },
      { additionalProperties: false },
    ),
    authenticatorAttachment: Type.Optional(
      Type.Union([Type.Literal('cross-platform'), Type.Literal('platform')]),
    ),
    clientExtensionResults: WebAuthnClientExtensions,
    type: Type.Literal('public-key'),
  },
  { $id: 'WebAuthnAuthenticationCredential', additionalProperties: false },
);
export type WebAuthnAuthenticationCredential = Static<typeof WebAuthnAuthenticationCredential>;

export const BeginPasskeyRegistrationRequest = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { $id: 'BeginPasskeyRegistrationRequest', additionalProperties: false },
);
export type BeginPasskeyRegistrationRequest = Static<typeof BeginPasskeyRegistrationRequest>;

export const CompletePasskeyRegistrationRequest = Type.Object(
  {
    challengeId: Type.String({ minLength: 29, maxLength: 128 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    response: Type.Ref(WebAuthnRegistrationCredential),
  },
  { $id: 'CompletePasskeyRegistrationRequest', additionalProperties: false },
);
export type CompletePasskeyRegistrationRequest = Static<typeof CompletePasskeyRegistrationRequest>;

export const BeginPasskeyAuthenticationRequest = Type.Object(
  { purpose: Type.Union([Type.Literal('sign_in'), Type.Literal('step_up')]) },
  { $id: 'BeginPasskeyAuthenticationRequest', additionalProperties: false },
);
export type BeginPasskeyAuthenticationRequest = Static<typeof BeginPasskeyAuthenticationRequest>;

export const CompletePasskeyAuthenticationRequest = Type.Object(
  {
    challengeId: Type.String({ minLength: 29, maxLength: 128 }),
    purpose: Type.Union([Type.Literal('sign_in'), Type.Literal('step_up')]),
    rememberMe: Type.Optional(Type.Boolean({ default: false })),
    response: Type.Ref(WebAuthnAuthenticationCredential),
  },
  { $id: 'CompletePasskeyAuthenticationRequest', additionalProperties: false },
);
export type CompletePasskeyAuthenticationRequest = Static<
  typeof CompletePasskeyAuthenticationRequest
>;

export const PasskeySummary = Type.Object(
  {
    id: Type.String({ minLength: 28, maxLength: 128 }),
    identityId: Type.String({ minLength: 27, maxLength: 256 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    deviceType: Type.Union([Type.Literal('singleDevice'), Type.Literal('multiDevice')]),
    backedUp: Type.Boolean(),
    createdAt: AuthTimestamp,
    lastUsedAt: Type.Union([AuthTimestamp, Type.Null()]),
  },
  { $id: 'PasskeySummary', additionalProperties: false },
);
export type PasskeySummary = Static<typeof PasskeySummary>;

export const PasskeyListResponse = Type.Object(
  { passkeys: Type.Array(Type.Ref(PasskeySummary), { maxItems: 50 }) },
  { $id: 'PasskeyListResponse', additionalProperties: false },
);
export type PasskeyListResponse = Static<typeof PasskeyListResponse>;

export const RecoveryCode = Type.String({
  minLength: 20,
  maxLength: 64,
  pattern: '^[A-Za-z0-9-]+$',
});
export const GenerateRecoveryCodesRequest = Type.Object(
  { currentPassword: Type.Optional(Password) },
  { $id: 'GenerateRecoveryCodesRequest', additionalProperties: false },
);
export const ConfirmRecoveryCodesRequest = Type.Object(
  { setId: Type.String({ minLength: 32, maxLength: 128 }), code: RecoveryCode },
  { $id: 'ConfirmRecoveryCodesRequest', additionalProperties: false },
);
export const RecoveryCodeSignInRequest = Type.Object(
  {
    identifier: LoginIdentifier,
    code: RecoveryCode,
    rememberMe: Type.Optional(Type.Boolean({ default: false })),
  },
  { $id: 'RecoveryCodeSignInRequest', additionalProperties: false },
);
export const RecoveryCodeStatus = Type.Object(
  {
    setId: Type.String({ minLength: 32, maxLength: 128 }),
    confirmed: Type.Boolean(),
    remaining: Type.Integer({ minimum: 0, maximum: 10 }),
    createdAt: AuthTimestamp,
  },
  { $id: 'RecoveryCodeStatus', additionalProperties: false },
);

export const UnlinkAuthIdentityRequest = Type.Object(
  { currentPassword: Type.Optional(Password) },
  { $id: 'UnlinkAuthIdentityRequest', additionalProperties: false },
);
export type UnlinkAuthIdentityRequest = Static<typeof UnlinkAuthIdentityRequest>;

export const DeleteAccountRequest = Type.Object(
  {
    currentPassword: Password,
    confirmation: Type.Literal('DELETE'),
  },
  { $id: 'DeleteAccountRequest', additionalProperties: false },
);
export type DeleteAccountRequest = Static<typeof DeleteAccountRequest>;

export const AccountDeletionResponse = Type.Object(
  { deletedAt: AuthTimestamp, retentionExpiresAt: AuthTimestamp },
  { $id: 'AccountDeletionResponse', additionalProperties: false },
);
export type AccountDeletionResponse = Static<typeof AccountDeletionResponse>;

export const AccountExportResponse = Type.Object(
  {
    generatedAt: AuthTimestamp,
    profile: Type.Ref(AuthUserSummary),
    emails: Type.Array(
      Type.Object(
        {
          email: EmailAddress,
          primary: Type.Boolean(),
          verifiedAt: Type.Union([AuthTimestamp, Type.Null()]),
        },
        { additionalProperties: false },
      ),
    ),
    identities: Type.Array(Type.Ref(AuthIdentitySummary)),
    workspaces: Type.Array(Type.Ref(AuthWorkspaceSummary)),
  },
  { $id: 'AccountExportResponse', additionalProperties: false },
);
export type AccountExportResponse = Static<typeof AccountExportResponse>;

export const SetUsernameRequest = Type.Object(
  {
    username: AuthUsername,
    password: Password,
  },
  { $id: 'SetUsernameRequest', additionalProperties: false },
);
export type SetUsernameRequest = Static<typeof SetUsernameRequest>;

export const AuthUsernameResponse = Type.Object(
  { username: Type.Union([AuthUsername, Type.Null()]) },
  { $id: 'AuthUsernameResponse', additionalProperties: false },
);
export type AuthUsernameResponse = Static<typeof AuthUsernameResponse>;

export const AuthOnboardingSnapshot = Type.Object(
  {
    id: Type.String({ minLength: 28, maxLength: 128, pattern: '^onboard_[A-Za-z0-9_-]{20,}$' }),
    intent: AuthOnboardingIntent,
    status: AuthOnboardingStatus,
    targetWorkspaceId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    invitationId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    completedWorkspaceId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]),
    expiresAt: AuthTimestamp,
  },
  { $id: 'AuthOnboardingSnapshot', additionalProperties: false },
);
export type AuthOnboardingSnapshot = Static<typeof AuthOnboardingSnapshot>;

export const OIDC_PROVIDER_IDS = ['google', 'microsoft'] as const;
export const OIDC_AUTHORIZATION_ACTIONS = ['sign_in', 'sign_up', 'link'] as const;
export const OidcProviderId = Type.Union(OIDC_PROVIDER_IDS.map((value) => Type.Literal(value)));
export type OidcProviderId = (typeof OIDC_PROVIDER_IDS)[number];
export const OidcAuthorizationAction = Type.Union(
  OIDC_AUTHORIZATION_ACTIONS.map((value) => Type.Literal(value)),
);
export type OidcAuthorizationAction = (typeof OIDC_AUTHORIZATION_ACTIONS)[number];

export const IdentityProviderBeginRequest = Type.Object(
  {
    provider: OidcProviderId,
    action: OidcAuthorizationAction,
    returnTo: Type.String({ minLength: 1, maxLength: 2048, pattern: '^/(?!/)' }),
    workspaceName: Type.Optional(
      Type.String({ minLength: AUTH_WORKSPACE_NAME_MIN_LENGTH, maxLength: AUTH_WORKSPACE_NAME_MAX_LENGTH }),
    ),
    rememberMe: Type.Optional(Type.Boolean()),
  },
  { $id: 'IdentityProviderBeginRequest', additionalProperties: false },
);
export type IdentityProviderBeginRequest = Static<typeof IdentityProviderBeginRequest>;

export const IdentityProviderBeginResult = Type.Object(
  {
    authorizationUrl: Type.String({ format: 'uri', maxLength: 4096 }),
    expiresAt: AuthTimestamp,
  },
  { $id: 'IdentityProviderBeginResult', additionalProperties: false },
);
export type IdentityProviderBeginResult = Static<typeof IdentityProviderBeginResult>;

const OidcState = Type.String({ minLength: 43, maxLength: 256, pattern: '^[A-Za-z0-9_-]+$' });

export const IdentityProviderCallbackInput = Type.Union(
  [
    Type.Object(
      { state: OidcState, code: Type.String({ minLength: 1, maxLength: 4096 }) },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        state: OidcState,
        error: Type.String({ minLength: 1, maxLength: 256 }),
        errorDescription: Type.Optional(Type.String({ minLength: 1, maxLength: 1024 })),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'IdentityProviderCallbackInput' },
);
export type IdentityProviderCallbackInput = Static<typeof IdentityProviderCallbackInput>;

export const IdentityProviderCallbackResult = Type.Object(
  {
    status: Type.Union([Type.Literal('authenticated'), Type.Literal('linked')]),
    returnTo: Type.String({ minLength: 1, maxLength: 2048, pattern: '^/(?!/)' }),
    session: Type.Optional(Type.Ref(AuthSessionSnapshot)),
  },
  { $id: 'IdentityProviderCallbackResult', additionalProperties: false },
);
export type IdentityProviderCallbackResult = Static<typeof IdentityProviderCallbackResult>;

export const IdentityProviderListResponse = Type.Object(
  {
    providers: Type.Array(
      Type.Object(
        { id: OidcProviderId, label: Type.String({ minLength: 1, maxLength: 64 }) },
        { additionalProperties: false },
      ),
      { maxItems: OIDC_PROVIDER_IDS.length },
    ),
  },
  { $id: 'IdentityProviderListResponse', additionalProperties: false },
);
export type IdentityProviderListResponse = Static<typeof IdentityProviderListResponse>;

export const VerifiedExternalIdentity = Type.Object(
  {
    kind: AuthIdentityKind,
    issuer: Type.String({ minLength: 1, maxLength: 2048 }),
    subject: Type.String({ minLength: 1, maxLength: 1024 }),
    providerTenantId: Type.Union([Type.String({ minLength: 1, maxLength: 1024 }), Type.Null()]),
    assuranceLevel: AuthAssuranceLevel,
    email: Type.Optional(EmailAddress),
    emailVerified: Type.Optional(Type.Boolean()),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { $id: 'VerifiedExternalIdentity', additionalProperties: false },
);
export type VerifiedExternalIdentity = Static<typeof VerifiedExternalIdentity>;

export const IdentityEnrollmentInput = Type.Object(
  {
    userId: Type.String({ minLength: 1, maxLength: 256 }),
    identity: Type.Ref(VerifiedExternalIdentity),
  },
  { $id: 'IdentityEnrollmentInput', additionalProperties: false },
);
export type IdentityEnrollmentInput = Static<typeof IdentityEnrollmentInput>;

export const IdentityLinkInput = Type.Object(
  {
    authenticatedUserId: Type.String({ minLength: 1, maxLength: 256 }),
    identity: Type.Ref(VerifiedExternalIdentity),
    authorization: AuthIdentityMutationAuthorization,
  },
  { $id: 'IdentityLinkInput', additionalProperties: false },
);
export type IdentityLinkInput = Static<typeof IdentityLinkInput>;

export const IdentityUnlinkInput = Type.Object(
  {
    authenticatedUserId: Type.String({ minLength: 1, maxLength: 256 }),
    identityId: Type.String({ minLength: 1, maxLength: 256 }),
    authorization: AuthIdentityMutationAuthorization,
  },
  { $id: 'IdentityUnlinkInput', additionalProperties: false },
);
export type IdentityUnlinkInput = Static<typeof IdentityUnlinkInput>;

export const VerifyEmailRequest = Type.Object(
  {
    challengeId: VerifyEmailChallengeId,
    token: VerifyEmailToken,
    password: Password,
  },
  { $id: 'VerifyEmailRequest', additionalProperties: false },
);
export type VerifyEmailRequest = Static<typeof VerifyEmailRequest>;

export const ResendEmailVerificationRequest = Type.Object(
  { email: EmailAddress },
  { $id: 'ResendEmailVerificationRequest', additionalProperties: false },
);
export type ResendEmailVerificationRequest = Static<typeof ResendEmailVerificationRequest>;

const EmailVerificationResendAccepted = Type.Object(
  { status: Type.Literal('accepted') },
  { additionalProperties: false },
);

const DevelopmentEmailVerificationResendAccepted = Type.Object(
  {
    status: Type.Literal('accepted'),
    challengeId: VerifyEmailChallengeId,
    expiresAt: AuthTimestamp,
    verificationToken: VerifyEmailToken,
  },
  { additionalProperties: false },
);

export const EmailVerificationResendAcceptedResponse = Type.Union(
  [EmailVerificationResendAccepted, DevelopmentEmailVerificationResendAccepted],
  { $id: 'EmailVerificationResendAcceptedResponse' },
);
export type EmailVerificationResendAcceptedResponse = Static<
  typeof EmailVerificationResendAcceptedResponse
>;

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

const EmailVerificationRequired = Type.Object(
  { status: Type.Literal('verification_required') },
  { additionalProperties: false },
);

const DevelopmentEmailVerificationRequired = Type.Object(
  {
    status: Type.Literal('verification_required'),
    challengeId: VerifyEmailChallengeId,
    expiresAt: AuthTimestamp,
    verificationToken: VerifyEmailToken,
  },
  { additionalProperties: false },
);

export const EmailVerificationRequiredResponse = Type.Union(
  [EmailVerificationRequired, DevelopmentEmailVerificationRequired],
  { $id: 'EmailVerificationRequiredResponse' },
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
