import { describe, expect, it } from 'vitest';
import {
  AuthSessionSnapshot,
  EmailVerificationRequiredResponse,
  PasswordRecoveryAcceptedResponse,
  PasswordRecoveryRequest,
  SetPasswordRequest,
  SetPasswordResponse,
  SignUpRequest,
  VerifyEmailRequest,
  validate,
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
        challengeId: 'verify_abcdefghijklmnopqrstuvwxyz',
        expiresAt: '2026-08-08T00:00:00.000Z',
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
});
