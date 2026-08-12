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
    return { status: 'error', error: 'Choose a valid document and release environment.' };
  }
  try {
    const context = await requireDashboardActionRole('viewer');
    return {
      status: 'success',
      state: await loadDocumentReleaseRecoveryState({ ...input, workspaceId: context.workspaceId }),
    };
  } catch (error) {
    return { status: 'error', error: releaseRecoveryReadError(error) };
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
      error: 'The release recovery request is invalid.',
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
        error: 'Your current workspace access cannot perform this release recovery action.',
        retryExact: false,
      };
    }
    return {
      status: 'error',
      error:
        'The recovery result is uncertain. Retry the exact request or refresh release history.',
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

function releaseRecoveryReadError(error: unknown): string {
  if (error instanceof DashboardApiError) {
    if (error.statusCode === 404) return 'Release history is not available for this document.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'Your current workspace access cannot read this release history.';
    }
    if (error.statusCode === 500) {
      return 'Complete release history is temporarily unavailable. Nothing was truncated.';
    }
  }
  return 'Unable to load complete release history.';
}
