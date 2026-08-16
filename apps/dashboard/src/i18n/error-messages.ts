import type { MessageDescriptor } from '@lingui/core';
import { AUTH_FORM_MESSAGES, DASHBOARD_SERVER_MESSAGES } from './messages';

const DASHBOARD_ERROR_BY_CODE: Readonly<Record<string, MessageDescriptor>> = {
  authentication_required: DASHBOARD_SERVER_MESSAGES.authenticationRequired,
  capability_denied: DASHBOARD_SERVER_MESSAGES.capabilityDenied,
  conflict: DASHBOARD_SERVER_MESSAGES.conflict,
  control_plane_timeout: DASHBOARD_SERVER_MESSAGES.unavailable,
  control_plane_unavailable: DASHBOARD_SERVER_MESSAGES.unavailable,
  dashboard_request_failed: DASHBOARD_SERVER_MESSAGES.requestFailed,
  dashboard_unavailable: DASHBOARD_SERVER_MESSAGES.unavailable,
  invalid_dashboard_response: DASHBOARD_SERVER_MESSAGES.invalidResponse,
  invalid_request: DASHBOARD_SERVER_MESSAGES.invalidRequest,
  not_found: DASHBOARD_SERVER_MESSAGES.notFound,
  rate_limited: DASHBOARD_SERVER_MESSAGES.rateLimited,
  request_failed: DASHBOARD_SERVER_MESSAGES.requestFailed,
  workspace_required: DASHBOARD_SERVER_MESSAGES.conflict,
};

const AUTH_ERROR_BY_CODE: Readonly<Record<string, MessageDescriptor>> = {
  auth_request_failed: AUTH_FORM_MESSAGES.pleaseTryAgain,
  auth_service_unavailable: AUTH_FORM_MESSAGES.serviceUnavailable,
  invalid_credentials: AUTH_FORM_MESSAGES.invalidCredentials,
  onboarding_incomplete: AUTH_FORM_MESSAGES.onboardingIncomplete,
  password_recovery_unavailable: AUTH_FORM_MESSAGES.recoveryUnavailable,
  rate_limited: AUTH_FORM_MESSAGES.rateLimited,
  signup_unavailable: AUTH_FORM_MESSAGES.signupUnavailable,
  verification_invalid: AUTH_FORM_MESSAGES.invalidVerificationLink,
  password_reset_invalid: AUTH_FORM_MESSAGES.invalidPasswordLink,
};

export function dashboardErrorMessageDescriptor(
  code: string | undefined,
  statusCode: number,
): MessageDescriptor {
  if (code && DASHBOARD_ERROR_BY_CODE[code]) return DASHBOARD_ERROR_BY_CODE[code];
  if (statusCode === 400) return DASHBOARD_SERVER_MESSAGES.invalidRequest;
  if (statusCode === 401) return DASHBOARD_SERVER_MESSAGES.authenticationRequired;
  if (statusCode === 403) return DASHBOARD_SERVER_MESSAGES.capabilityDenied;
  if (statusCode === 404) return DASHBOARD_SERVER_MESSAGES.notFound;
  if (statusCode === 409) return DASHBOARD_SERVER_MESSAGES.conflict;
  if (statusCode === 429) return DASHBOARD_SERVER_MESSAGES.rateLimited;
  return DASHBOARD_SERVER_MESSAGES.unavailable;
}

export function authErrorMessageDescriptor(
  code: string | undefined,
  statusCode: number,
): MessageDescriptor {
  if (code && AUTH_ERROR_BY_CODE[code]) return AUTH_ERROR_BY_CODE[code];
  if (statusCode === 401) return AUTH_FORM_MESSAGES.invalidCredentials;
  if (statusCode === 429) return AUTH_FORM_MESSAGES.rateLimited;
  if (statusCode >= 500) return AUTH_FORM_MESSAGES.serviceUnavailable;
  return AUTH_FORM_MESSAGES.pleaseTryAgain;
}
