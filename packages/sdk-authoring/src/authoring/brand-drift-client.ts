import {
  AuthoringBrandDriftCheckResult as AuthoringBrandDriftCheckResultSchema,
  AuthoringBrandThemeAcknowledgementRequest as AuthoringBrandThemeAcknowledgementRequestSchema,
  AuthoringBrandThemeAcknowledgementResult as AuthoringBrandThemeAcknowledgementResultSchema,
  BrandDriftCheckRequest as BrandDriftCheckRequestSchema,
  validate,
  type AuthoringBrandDriftCheckResult,
  type AuthoringBrandThemeAcknowledgementRequest,
  type AuthoringBrandThemeAcknowledgementResult,
  type BrandDriftCheckRequest,
} from '@lodariq/schema';

export interface AuthoringBrandDriftRequestOptions {
  request: BrandDriftCheckRequest;
  expectedDocumentId: string;
  expectedThemeId: string;
  expectedThemeVersionId: string;
  fetchAuthorized: (body: string) => Promise<Response>;
}

export class AuthoringBrandDriftRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthoringBrandDriftRequestError';
  }
}

export interface AuthoringBrandThemeAcknowledgementOptions {
  request: AuthoringBrandThemeAcknowledgementRequest;
  expectedWorkspaceId: string;
  expectedDocumentId: string;
  expectedThemeId: string;
  fetchAuthorized: (body: string) => Promise<Response>;
}

/** Shared hosted/direct response validation; credential ownership stays outside this module. */
export async function requestAuthoringBrandDrift(
  options: AuthoringBrandDriftRequestOptions,
): Promise<AuthoringBrandDriftCheckResult> {
  const request = validate(BrandDriftCheckRequestSchema, options.request);
  if (!request.valid) {
    throw new AuthoringBrandDriftRequestError(
      'invalid_brand_drift_check',
      400,
      'Brand drift evidence is invalid',
    );
  }
  const response = await options.fetchAuthorized(
    JSON.stringify({ trigger: request.value.trigger, proposal: request.value.proposal }),
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new AuthoringBrandDriftRequestError(
      boundedErrorCode(payload),
      response.status,
      'Brand drift could not be checked',
    );
  }
  const result = validate(AuthoringBrandDriftCheckResultSchema, payload);
  if (!result.valid || !resultMatchesExpectedScope(result.value, options)) {
    throw new AuthoringBrandDriftRequestError(
      'invalid_brand_drift_response',
      502,
      'Brand drift response did not match this authoring session',
    );
  }
  return structuredClone(result.value);
}

export async function requestAuthoringBrandThemeAcknowledgement(
  options: AuthoringBrandThemeAcknowledgementOptions,
): Promise<AuthoringBrandThemeAcknowledgementResult> {
  const request = validate(AuthoringBrandThemeAcknowledgementRequestSchema, options.request);
  if (!request.valid) {
    throw new AuthoringBrandDriftRequestError(
      'invalid_brand_theme_acknowledgement',
      400,
      'Brand acknowledgement guards are invalid',
    );
  }
  const response = await options.fetchAuthorized(JSON.stringify(request.value));
  const payload = await readJson(response);
  if (!response.ok) {
    throw new AuthoringBrandDriftRequestError(
      boundedErrorCode(payload),
      response.status,
      'The reviewed Brand version could not be acknowledged',
    );
  }
  const result = validate(AuthoringBrandThemeAcknowledgementResultSchema, payload);
  if (!result.valid || !acknowledgementMatchesScope(result.value, options)) {
    throw new AuthoringBrandDriftRequestError(
      'invalid_brand_theme_acknowledgement_response',
      502,
      'Brand acknowledgement response did not match this authoring session',
    );
  }
  return structuredClone(result.value);
}

function resultMatchesExpectedScope(
  result: AuthoringBrandDriftCheckResult,
  expected: Pick<
    AuthoringBrandDriftRequestOptions,
    'expectedDocumentId' | 'expectedThemeId' | 'expectedThemeVersionId'
  >,
): boolean {
  if (
    result.documentId !== expected.expectedDocumentId ||
    result.drift.themeId !== expected.expectedThemeId ||
    result.drift.baselineThemeVersionId !== expected.expectedThemeVersionId
  ) {
    return false;
  }
  const review = result.documentThemeReview;
  if (review && review.themeId !== expected.expectedThemeId) return false;
  const runtimePreview = result.runtimePreview;
  return (
    !runtimePreview ||
    (runtimePreview.currentTheme.themeId === expected.expectedThemeId &&
      runtimePreview.currentTheme.themeVersionId === expected.expectedThemeVersionId &&
      runtimePreview.proposedTheme.themeId === expected.expectedThemeId)
  );
}

function acknowledgementMatchesScope(
  result: AuthoringBrandThemeAcknowledgementResult,
  expected: AuthoringBrandThemeAcknowledgementOptions,
): boolean {
  const binding = result.document.themeBinding;
  return (
    result.document.workspaceId === expected.expectedWorkspaceId &&
    result.document.id === expected.expectedDocumentId &&
    result.theme.themeId === expected.expectedThemeId &&
    result.theme.themeVersionId === expected.request.reviewedThemeVersionId &&
    binding?.policy === 'workspace-current' &&
    binding.themeId === expected.expectedThemeId &&
    binding.acknowledgedThemeVersionId === expected.request.reviewedThemeVersionId &&
    result.documentThemeReview.policy === 'workspace-current' &&
    result.documentThemeReview.reviewState === 'current' &&
    result.documentThemeReview.approvedThemeVersionId === expected.request.reviewedThemeVersionId &&
    result.documentThemeReview.acknowledgedThemeVersionId ===
      expected.request.reviewedThemeVersionId
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AuthoringBrandDriftRequestError(
      'invalid_brand_drift_response',
      response.status,
      'Brand drift response was not JSON',
    );
  }
}

function boundedErrorCode(payload: unknown): string {
  if (!isRecord(payload)) return 'brand_drift_check_failed';
  const value = payload['error'];
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    return 'brand_drift_check_failed';
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
