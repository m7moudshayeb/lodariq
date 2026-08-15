import { describe, expect, it } from 'vitest';
import {
  AuthSessionSnapshot,
  AuthOnboardingSnapshot,
  EmailVerificationRequiredResponse,
  EmailVerificationResendAcceptedResponse,
  PasswordRecoveryAcceptedResponse,
  PasswordRecoveryRequest,
  ResendEmailVerificationRequest,
  SetPasswordRequest,
  SetPasswordResponse,
  SetUsernameRequest,
  SignInRequest,
  SignUpRequest,
  VerifyEmailRequest,
  validate,
  AuthIdentityKind,
  AuthAssuranceLevel,
  IdentityLinkInput,
  IdentityUnlinkInput,
  VerifiedExternalIdentity,
  AccountDeletionResponse,
  AccountExportResponse,
  AuthIdentityListResponse,
  AuthSessionListResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
  EmailChangeSnapshot,
  StartEmailChangeRequest,
  VerifyEmailChangeRequest,
  CompletePasskeyRegistrationRequest,
  CompletePasskeyAuthenticationRequest,
  ConfirmRecoveryCodesRequest,
  RecoveryCodeSignInRequest,
  RecoveryCodeStatus,
  IdentityProviderBeginRequest,
  IdentityProviderCallbackInput,
} from '@lodariq/schema';

describe('@lodariq/schema auth contracts', () => {
  it('accepts the owned signup, verification, and provider-neutral session shapes', () => {
    expect(
      validate(SignUpRequest, {
        email: 'creator@example.com',
        name: 'Creator',
        workspaceName: 'Workspace',
      }).valid,
    ).toBe(true);
    expect(
      validate(VerifyEmailRequest, {
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        token: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789',
        password: 'a-strong-password',
      }).valid,
    ).toBe(true);
    expect(
      validate(EmailVerificationRequiredResponse, {
        status: 'verification_required',
      }).valid,
    ).toBe(true);
    expect(
      validate(EmailVerificationRequiredResponse, {
        status: 'verification_required',
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        expiresAt: '2026-08-08T00:00:00.000Z',
        verificationToken: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthSessionSnapshot, {
        user: { id: 'usr_a', email: 'creator@example.com', name: null },
        activeWorkspaceId: null,
        workspaces: [],
      }).valid,
    ).toBe(true);
  });

  it('accepts only server-issued onboarding snapshots', () => {
    const snapshot = {
      id: 'onboard_abcdefghijklmnopqrstuvwxyz',
      intent: 'create_workspace',
      status: 'pending_destination',
      targetWorkspaceId: 'wk_server_owned',
      invitationId: null,
      completedWorkspaceId: null,
      expiresAt: '2026-08-22T00:00:00.000Z',
    } as const;
    expect(validate(AuthOnboardingSnapshot, snapshot).valid).toBe(true);
    expect(
      validate(AuthOnboardingSnapshot, { ...snapshot, targetWorkspaceName: 'Leaked' }).valid,
    ).toBe(false);
    expect(validate(AuthOnboardingSnapshot, { ...snapshot, status: 'invented' }).valid).toBe(false);
    expect(validate(AuthOnboardingSnapshot, { ...snapshot, id: 'onboard_too_short' }).valid).toBe(
      false,
    );
  });

  it('rejects short passwords and extra credential fields', () => {
    expect(
      validate(SignUpRequest, {
        email: 'creator@example.com',
        name: 'Creator',
        workspaceName: 'Workspace',
        password: 'must-not-be-stored-before-verification',
      }).valid,
    ).toBe(false);
    expect(
      validate(VerifyEmailRequest, {
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        token: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789',
        password: 'short',
      }).valid,
    ).toBe(false);
    expect(
      validate(VerifyEmailRequest, {
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        token: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789',
        password: 'a-strong-password',
        workspaceId: 'wk_client_claim_must_not_exist',
      }).valid,
    ).toBe(false);
  });

  it('accepts email-or-username sign-in and provider-neutral identity contracts', () => {
    expect(
      validate(SignInRequest, {
        identifier: 'Creator.Handle',
        password: 'a-strong-password',
      }).valid,
    ).toBe(true);
    expect(
      validate(SignInRequest, {
        email: 'creator@example.com',
        password: 'a-strong-password',
      }).valid,
    ).toBe(false);
    expect(
      validate(SetUsernameRequest, {
        username: 'Creator.Handle',
        password: 'a-strong-password',
      }).valid,
    ).toBe(true);
    expect(validate(AuthIdentityKind, 'passkey').valid).toBe(true);
    expect(validate(AuthAssuranceLevel, 'aal2').valid).toBe(true);
    expect(
      validate(VerifiedExternalIdentity, {
        kind: 'oidc',
        issuer: 'https://accounts.example.test',
        subject: 'stable-provider-subject',
        providerTenantId: 'tenant-a',
        assuranceLevel: 'aal1',
        email: 'creator@example.com',
        emailVerified: true,
      }).valid,
    ).toBe(true);

    const externalIdentity = {
      kind: 'oidc',
      issuer: 'https://accounts.example.test',
      subject: 'stable-provider-subject',
      providerTenantId: 'tenant-a',
      assuranceLevel: 'aal1',
      email: 'creator@example.com',
      emailVerified: true,
    } as const;
    expect(
      validate(IdentityLinkInput, {
        authenticatedUserId: 'usr_creator',
        identity: externalIdentity,
        authorization: 'authenticated_session',
      }).valid,
    ).toBe(true);
    expect(
      validate(IdentityLinkInput, {
        authenticatedUserId: 'usr_creator',
        identity: externalIdentity,
        recoveryAuthorized: true,
      }).valid,
    ).toBe(false);
    expect(
      validate(IdentityUnlinkInput, {
        authenticatedUserId: 'usr_creator',
        identityId: 'ident_provider',
        authorization: 'strong_recovery',
      }).valid,
    ).toBe(true);
  });

  it('keeps OIDC begin and callback inputs exact and mutually exclusive', () => {
    expect(
      validate(IdentityProviderBeginRequest, {
        provider: 'google',
        action: 'sign_up',
        returnTo: '/authoring/activate',
        workspaceName: 'OIDC Workspace',
        rememberMe: true,
      }).valid,
    ).toBe(true);
    expect(
      validate(IdentityProviderBeginRequest, {
        provider: 'attacker',
        action: 'sign_in',
        returnTo: 'https://attacker.example',
      }).valid,
    ).toBe(false);
    const state = 's'.repeat(43);
    expect(validate(IdentityProviderCallbackInput, { state, code: 'code' }).valid).toBe(true);
    expect(
      validate(IdentityProviderCallbackInput, { state, error: 'access_denied' }).valid,
    ).toBe(true);
    expect(
      validate(IdentityProviderCallbackInput, {
        state,
        code: 'code',
        error: 'access_denied',
      }).valid,
    ).toBe(false);
    expect(validate(IdentityProviderCallbackInput, { state, accessToken: 'secret' }).valid).toBe(
      false,
    );
  });

  it('counts password length as Unicode characters', () => {
    const baseRequest = {
      challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
      token: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789',
    };
    expect(validate(VerifyEmailRequest, { ...baseRequest, password: '🔐'.repeat(11) }).valid).toBe(
      false,
    );
    expect(validate(VerifyEmailRequest, { ...baseRequest, password: '🔐'.repeat(12) }).valid).toBe(
      true,
    );
    expect(validate(VerifyEmailRequest, { ...baseRequest, password: '🔐'.repeat(65) }).valid).toBe(
      true,
    );
    expect(validate(VerifyEmailRequest, { ...baseRequest, password: '🔐'.repeat(129) }).valid).toBe(
      false,
    );
  });

  it('validates account-management boundaries and rejects secret or policy claims', () => {
    expect(
      validate(SignInRequest, {
        identifier: 'creator@example.com',
        password: 'a-strong-password',
        rememberMe: true,
      }).valid,
    ).toBe(true);
    expect(
      validate(SignInRequest, {
        identifier: 'creator@example.com',
        password: 'a-strong-password',
        durationPolicy: 'remembered',
      }).valid,
    ).toBe(false);
    expect(
      validate(ChangePasswordRequest, {
        currentPassword: 'a-strong-password',
        newPassword: 'another-strong-password',
      }).valid,
    ).toBe(true);
    expect(
      validate(StartEmailChangeRequest, {
        newEmail: 'new@example.com',
        currentPassword: 'a-strong-password',
      }).valid,
    ).toBe(true);
    expect(
      validate(VerifyEmailChangeRequest, {
        challengeId: 'emailchange_abcdefghijklmnopqrstuvwxyz',
        proof: 'new_email',
        token: `lq_email_change_${'x'.repeat(43)}`,
      }).valid,
    ).toBe(true);
    expect(
      validate(VerifyEmailChangeRequest, {
        challengeId: 'emailchange_abcdefghijklmnopqrstuvwxyz',
        proof: 'both',
        token: `lq_email_change_${'x'.repeat(43)}`,
      }).valid,
    ).toBe(false);
    expect(
      validate(DeleteAccountRequest, {
        currentPassword: 'a-strong-password',
        confirmation: 'delete',
      }).valid,
    ).toBe(false);

    const timestamp = '2026-08-15T12:00:00.000Z';
    expect(
      validate(AuthSessionListResponse, {
        sessions: [
          {
            id: 'authsess_abcdefghijklmnopqrstuvwxyz',
            deviceLabel: 'Chrome on desktop',
            authenticationMethod: 'password',
            assuranceLevel: 'aal1',
            durationPolicy: 'standard',
            createdAt: timestamp,
            lastSeenAt: timestamp,
            expiresAt: timestamp,
            current: true,
          },
        ],
      }).valid,
    ).toBe(true);
    expect(validate(AuthIdentityListResponse, { identities: [] }).valid).toBe(true);
    expect(
      validate(EmailChangeSnapshot, {
        id: 'emailchange_abcdefghijklmnopqrstuvwxyz',
        newEmail: 'new@example.com',
        currentEmailVerified: false,
        newEmailVerified: true,
        expiresAt: timestamp,
      }).valid,
    ).toBe(true);
    expect(
      validate(AccountDeletionResponse, {
        deletedAt: timestamp,
        retentionExpiresAt: '2026-09-14T12:00:00.000Z',
      }).valid,
    ).toBe(true);
    expect(
      validate(AccountExportResponse, {
        generatedAt: timestamp,
        profile: { id: 'usr_export', email: 'creator@example.com', name: null, username: null },
        emails: [{ email: 'creator@example.com', primary: true, verifiedAt: timestamp }],
        identities: [],
        workspaces: [],
      }).valid,
    ).toBe(true);
  });

  it('keeps password recovery generic while supporting complete local challenge parity', () => {
    expect(validate(PasswordRecoveryRequest, { email: 'creator@example.com' }).valid).toBe(true);
    expect(validate(PasswordRecoveryAcceptedResponse, { status: 'accepted' }).valid).toBe(true);
    expect(
      validate(PasswordRecoveryAcceptedResponse, {
        status: 'accepted',
        challengeId: 'reset_abcdefghijklmnopqrstuvwxyz',
        expiresAt: '2026-08-08T00:00:00.000Z',
        resetToken: 'lq_reset_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      }).valid,
    ).toBe(true);
    expect(
      validate(PasswordRecoveryAcceptedResponse, {
        status: 'accepted',
        challengeId: 'reset_abcdefghijklmnopqrstuvwxyz',
      }).valid,
    ).toBe(false);
  });

  it('keeps verification resend generic and rejects partial development tuples', () => {
    expect(validate(ResendEmailVerificationRequest, { email: 'creator@example.com' }).valid).toBe(
      true,
    );
    expect(validate(ResendEmailVerificationRequest, { email: 'not-an-email' }).valid).toBe(false);
    expect(validate(EmailVerificationResendAcceptedResponse, { status: 'accepted' }).valid).toBe(
      true,
    );
    expect(
      validate(EmailVerificationResendAcceptedResponse, {
        status: 'accepted',
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
      }).valid,
    ).toBe(false);
    expect(
      validate(EmailVerificationResendAcceptedResponse, {
        status: 'accepted',
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        expiresAt: '2026-08-08T00:00:00.000Z',
        verificationToken: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      }).valid,
    ).toBe(true);
  });

  it('domain-separates reset tokens and returns the authenticated session snapshot', () => {
    const request = {
      challengeId: 'reset_abcdefghijklmnopqrstuvwxyz',
      token: 'lq_reset_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      password: 'a-new-strong-password',
    };
    expect(validate(SetPasswordRequest, request).valid).toBe(true);
    expect(
      validate(SetPasswordRequest, {
        ...request,
        token: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
      }).valid,
    ).toBe(false);
    expect(
      validate(SetPasswordResponse, {
        status: 'password_updated',
        session: {
          user: { id: 'usr_a', email: 'creator@example.com', name: null },
          activeWorkspaceId: null,
          workspaces: [],
        },
      }).valid,
    ).toBe(true);
  });

  it('strictly validates RFC3339 email-verification timestamps', () => {
    const validResponse = {
      status: 'verification_required',
      challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
      verificationToken: 'lq_verify_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
    } as const;
    expect(
      validate(EmailVerificationRequiredResponse, {
        ...validResponse,
        expiresAt: '2026-08-08T00:00:00Z',
      }).valid,
    ).toBe(true);
    expect(
      validate(EmailVerificationRequiredResponse, {
        ...validResponse,
        expiresAt: '2026-02-30T00:00:00Z',
      }).valid,
    ).toBe(false);
    expect(
      validate(EmailVerificationRequiredResponse, {
        ...validResponse,
        expiresAt: '2026-00-01T00:00:00Z',
      }).valid,
    ).toBe(false);
    expect(
      validate(EmailVerificationRequiredResponse, {
        ...validResponse,
        expiresAt: '2026-08-08 00:00:00',
      }).valid,
    ).toBe(false);
  });

  it('bounds WebAuthn credentials and recovery-code inputs at the HTTP boundary', () => {
    const registration = {
      id: 'credential_identifier_1234',
      rawId: 'credential_identifier_1234',
      response: {
        clientDataJSON: 'client-data',
        attestationObject: 'attestation_value',
      },
      clientExtensionResults: {},
      type: 'public-key',
    } as const;
    expect(
      validate(CompletePasskeyRegistrationRequest, {
        challengeId: 'authchal_abcdefghijklmnopqrstuvwxyz',
        name: 'MacBook passkey',
        response: registration,
      }).valid,
    ).toBe(true);
    expect(
      validate(CompletePasskeyRegistrationRequest, {
        challengeId: 'authchal_abcdefghijklmnopqrstuvwxyz',
        name: 'MacBook passkey',
        response: { ...registration, credentialSecret: 'must-not-cross-the-boundary' },
      }).valid,
    ).toBe(false);

    const authentication = {
      id: 'credential_identifier_1234',
      rawId: 'credential_identifier_1234',
      response: {
        clientDataJSON: 'client-data',
        authenticatorData: 'authenticator_data',
        signature: 'signed_assertion',
      },
      clientExtensionResults: {},
      type: 'public-key',
    } as const;
    expect(
      validate(CompletePasskeyAuthenticationRequest, {
        challengeId: 'authchal_abcdefghijklmnopqrstuvwxyz',
        purpose: 'step_up',
        response: authentication,
      }).valid,
    ).toBe(true);
    expect(
      validate(CompletePasskeyAuthenticationRequest, {
        challengeId: 'authchal_abcdefghijklmnopqrstuvwxyz',
        purpose: 'admin_override',
        response: authentication,
      }).valid,
    ).toBe(false);

    const code = 'LQRC-23456-ABCDE-FGHJK-MNPQR';
    expect(
      validate(ConfirmRecoveryCodesRequest, {
        setId: 'recoveryset_abcdefghijklmnopqrstuvwxyz',
        code,
      }).valid,
    ).toBe(true);
    expect(
      validate(RecoveryCodeSignInRequest, {
        identifier: 'creator@example.com',
        code,
        rememberMe: true,
      }).valid,
    ).toBe(true);
    expect(
      validate(RecoveryCodeStatus, {
        setId: 'recoveryset_abcdefghijklmnopqrstuvwxyz',
        confirmed: true,
        remaining: 11,
        createdAt: '2026-08-15T12:00:00.000Z',
      }).valid,
    ).toBe(false);
  });
});
