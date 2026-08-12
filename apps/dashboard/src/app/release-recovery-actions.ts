'use server';

import {
  ReleaseRecoveryRequest as ReleaseRecoveryRequestSchema,
  isEnvironmentPolicyId,
  validate,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  DashboardApiError,
  loadDocumentReleaseRecoveryState,
  recoverDocumentRelease,
} from '../lib/api';
import { revalidatePath } from '../lib/revalidation';
import { requireDashboardActionRole } from '../lib/action-auth';
import { DASHBOARD_ACTION_MESSAGES } from '../i18n/messages';
import { serverMessage } from '../i18n/server-message';

export type ReleaseRecoveryStateActionResult =
  { status: 'success'; state: ReleaseRecoveryStateResponse } | { status: 'error'; error: string };

export type ReleaseRecoveryMutationActionResult =
  | { status: 'result'; result: ReleaseRecoveryResult }
  | { status: 'error'; error: string; retryExact: boolean };

interface ReleaseRecoveryScopeActionInput {
  documentId: string;
  environmentId: string;
}

export async function loadReleaseRecoveryStateAction(
  input: ReleaseRecoveryScopeActionInput,
): Promise<ReleaseRecoveryStateActionResult> {
  if (!isValidRecoveryScope(input)) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseReleaseScope),
    };
  }
  try {
    const context = await requireDashboardActionRole('viewer');
    return {
      status: 'success',
      state: await loadDocumentReleaseRecoveryState({ ...input, workspaceId: context.workspaceId }),
    };
  } catch (error) {
    return { status: 'error', error: await releaseRecoveryReadError(error) };
  }
}

export async function recoverDocumentReleaseAction(input: {
  documentId: string;
  environmentId: string;
  request: ReleaseRecoveryRequest;
}): Promise<ReleaseRecoveryMutationActionResult> {
  const request = validate(ReleaseRecoveryRequestSchema, input.request);
  if (!isValidRecoveryScope(input) || !request.valid) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.releaseRecoveryInvalid),
      retryExact: false,
    };
  }
  try {
    await requireDashboardActionRole('admin');
    const result = await recoverDocumentRelease({ ...input, request: request.value });
    if (result.ok) revalidatePath('/');
    return { status: 'result', result };
  } catch (error) {
    if (
      error instanceof DashboardApiError &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.releaseRecoveryForbidden),
        retryExact: false,
      };
    }
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.releaseRecoveryUncertain),
      retryExact: true,
    };
  }
}

function isValidRecoveryScope(input: ReleaseRecoveryScopeActionInput): boolean {
  return (
    isReleaseRecoveryDocumentId(input.documentId) && isEnvironmentPolicyId(input.environmentId)
  );
}

function isReleaseRecoveryDocumentId(value: string): boolean {
  return value.length >= 1 && value.length <= 256;
}

async function releaseRecoveryReadError(error: unknown): Promise<string> {
  if (error instanceof DashboardApiError) {
    if (error.statusCode === 404) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.releaseHistoryMissing);
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.releaseHistoryForbidden);
    }
    if (error.statusCode === 500) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.releaseHistoryIncomplete);
    }
  }
  return serverMessage(DASHBOARD_ACTION_MESSAGES.releaseHistoryUnavailable);
}
