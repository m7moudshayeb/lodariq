'use server';

import {
  BrandThemeDefinition as BrandThemeDefinitionSchema,
  EnvironmentReleasePolicy as EnvironmentReleasePolicySchema,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  isEnvironmentPolicyId,
  validate,
  type BrandThemeDefinition,
  type EnvironmentReleasePolicy,
} from '@lodariq/schema';
import { revalidatePath } from '../lib/revalidation';
import {
  approveWorkspaceTheme,
  createWorkspaceTheme,
  createPublicSdkInstallation,
  createEnvironmentToken,
  loadWorkspaceTheme,
  loadPublicSdkInstallations,
  loadWorkspaceEnvironments,
  loadDocumentDebug,
  revokePublicSdkInstallation,
  setPublicSdkInstallationSuspension,
  revokeEnvironmentToken,
  setDefaultWorkspaceTheme,
  setDocumentThemeBinding,
  syncPublicSdkInstallationOrigins,
  updateEnvironmentReleasePolicy,
  updateWorkspaceEnvironmentPolicy,
  updateWorkspaceThemeDraft,
  assertDashboardWorkspaceScope,
  DashboardApiError,
  type PublicSdkInstallationOriginDto,
  type WorkspaceEnvironmentDto,
} from '../lib/api';
import type { BrandSystemActionState } from './brand-system-action-state';
import type { DocumentDebugActionState } from './document-debug-action-state';
import type { SdkInstallationActionState } from './sdk-installation-action-state';
import type { TokenRevokeActionState } from './token-revoke-action-state';
import type { TokenActionState } from './token-action-state';
import { requireDashboardActionRole } from '../lib/action-auth';
import { DASHBOARD_ACTION_MESSAGES } from '../i18n/messages';
import { serverDashboardErrorMessage, serverMessage } from '../i18n/server-message';
import type { MessageDescriptor } from '@lingui/core';

export interface SaveBrandThemeDraftInput {
  themeId: string;
  name: string;
  draft: BrandThemeDefinition;
  expectedRevision: number;
  expectedUpdatedAt: string;
}

export interface BrandThemeGuardInput {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
}

export interface AcknowledgeBrandThemeInput {
  documentId: string;
  themeId: string;
  themeVersionId: string;
}

export type EnvironmentReleasePolicyActionState =
  | {
      status: 'success';
      message: string;
      environment: WorkspaceEnvironmentDto;
    }
  | { status: 'error'; error: string };

export async function updateEnvironmentReleasePolicyAction(input: {
  environmentId: string;
  requiredApprovalCount: 0 | 1;
  expectedUpdatedAt: string;
}): Promise<EnvironmentReleasePolicyActionState> {
  if (
    !isEnvironmentPolicyId(input.environmentId) ||
    !input.expectedUpdatedAt ||
    input.expectedUpdatedAt.length > 64 ||
    (input.requiredApprovalCount !== 0 && input.requiredApprovalCount !== 1)
  ) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.productionApprovalInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('admin');
    const response = await updateEnvironmentReleasePolicy(input);
    assertDashboardWorkspaceScope(context.workspaceId, response.environment);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(
        response.environment.requiredApprovalCount === 1
          ? DASHBOARD_ACTION_MESSAGES.approvalRequired
          : DASHBOARD_ACTION_MESSAGES.approvalNotRequired,
      ),
      environment: response.environment,
    };
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 409) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.productionChanged),
      };
    }
    if (error instanceof DashboardApiError && error.statusCode === 403) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.releasePolicyForbidden),
      };
    }
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(
        error,
        DASHBOARD_ACTION_MESSAGES.updateReleaseApprovalFailed,
      ),
    };
  }
}

export async function updateWorkspaceEnvironmentPolicyAction(input: {
  environmentId: string;
  name: string;
  originAllowlist: string[];
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy: EnvironmentReleasePolicy;
  expectedUpdatedAt: string;
}): Promise<EnvironmentReleasePolicyActionState> {
  const policy = validate(EnvironmentReleasePolicySchema, input.releasePolicy);
  const originsAreBounded =
    input.originAllowlist.length <= 100 &&
    input.originAllowlist.every(
      (origin) => typeof origin === 'string' && origin.length > 0 && origin.length <= 2048,
    );
  if (
    !isEnvironmentPolicyId(input.environmentId) ||
    !input.name.trim() ||
    input.name !== input.name.trim() ||
    input.name.length > 120 ||
    !originsAreBounded ||
    !policy.valid ||
    !Number.isInteger(input.pipelinePosition) ||
    input.pipelinePosition < 0 ||
    input.pipelinePosition > 2 ||
    (input.promotionSourceEnvironmentId !== undefined &&
      !isEnvironmentPolicyId(input.promotionSourceEnvironmentId)) ||
    !input.expectedUpdatedAt ||
    input.expectedUpdatedAt.length > 64
  ) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.environmentPolicyInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('admin');
    const response = await updateWorkspaceEnvironmentPolicy({
      ...input,
      releasePolicy: policy.value,
    });
    assertDashboardWorkspaceScope(context.workspaceId, response.environment);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.environmentPolicyUpdated),
      environment: response.environment,
    };
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 409) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.environmentPolicyChanged),
      };
    }
    if (error instanceof DashboardApiError && error.statusCode === 403) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.environmentPolicyForbidden),
      };
    }
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(
        error,
        DASHBOARD_ACTION_MESSAGES.updateEnvironmentPolicyFailed,
      ),
    };
  }
}

export async function createAccessibleBrandThemeAction(): Promise<BrandSystemActionState> {
  try {
    const context = await requireDashboardActionRole('member');
    const response = await createWorkspaceTheme({
      name: 'Product brand',
      draft: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition,
    });
    assertDashboardWorkspaceScope(context.workspaceId, response.theme);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.brandCreated),
      theme: response.theme,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.createBrandFailed);
  }
}

export async function loadBrandThemeImpactAction(themeId: string): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(themeId)) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseBrandTheme),
    };
  }
  try {
    const context = await requireDashboardActionRole('viewer');
    const detail = await loadWorkspaceTheme(themeId);
    assertDashboardWorkspaceScope(context.workspaceId, detail.theme, ...detail.versions);
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.impactRefreshed),
      detail,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.loadBrandImpactFailed);
  }
}

export async function saveBrandThemeDraftAction(
  input: SaveBrandThemeDraftInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isSafeThemeName(input.name)) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.themeIdentityInvalid),
    };
  }
  if (!isThemeMutationGuard(input) || !validate(BrandThemeDefinitionSchema, input.draft).valid) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.themeValuesInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('member');
    const response = await updateWorkspaceThemeDraft(input);
    assertDashboardWorkspaceScope(context.workspaceId, response.theme);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.draftSaved),
      theme: response.theme,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.saveBrandDraftFailed);
  }
}

export async function approveBrandThemeAction(
  input: BrandThemeGuardInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isThemeMutationGuard(input)) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.themeApprovalInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('admin');
    const response = await approveWorkspaceTheme(input);
    assertDashboardWorkspaceScope(context.workspaceId, response.theme, response.approvedVersion);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.versionApproved, {
        version: response.approvedVersion.version,
      }),
      theme: response.theme,
      approvedVersion: response.approvedVersion,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.approveBrandFailed);
  }
}

export async function makeDefaultBrandThemeAction(
  input: BrandThemeGuardInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isThemeMutationGuard(input)) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.defaultThemeInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('admin');
    const response = await setDefaultWorkspaceTheme(input);
    assertDashboardWorkspaceScope(context.workspaceId, response.theme);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.workspaceDefaultUpdated),
      theme: response.theme,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.setWorkspaceDefaultFailed);
  }
}

export async function acknowledgeApprovedBrandThemeAction(
  input: AcknowledgeBrandThemeInput,
): Promise<BrandSystemActionState> {
  if (
    !isSafeRecordId(input.documentId) ||
    !isSafeRecordId(input.themeId) ||
    !isSafeRecordId(input.themeVersionId)
  ) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.themeAcknowledgementInvalid),
    };
  }
  try {
    const context = await requireDashboardActionRole('member');
    await setDocumentThemeBinding(input.documentId, {
      policy: 'workspace-current',
      themeId: input.themeId,
      acknowledgedThemeVersionId: input.themeVersionId,
    });
    const detail = await loadWorkspaceTheme(input.themeId);
    assertDashboardWorkspaceScope(context.workspaceId, detail.theme, ...detail.versions);
    revalidatePath('/');
    return {
      status: 'success',
      message: await serverMessage(DASHBOARD_ACTION_MESSAGES.experienceBrandUpdated),
      detail,
      acknowledgedDocumentId: input.documentId,
    };
  } catch (error) {
    return await brandSystemActionError(error, DASHBOARD_ACTION_MESSAGES.updateExperienceFailed);
  }
}

export async function createEnvironmentTokenAction(
  _state: TokenActionState,
  formData: FormData,
): Promise<TokenActionState> {
  const environmentId = formData.get('environmentId');
  const name = formData.get('name');

  if (typeof environmentId !== 'string' || !environmentId.trim()) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseEnvironment),
    };
  }
  if (typeof name !== 'string' || !name.trim()) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.siteLabelRequired),
    };
  }

  try {
    const context = await requireDashboardActionRole('member');
    const response = await createEnvironmentToken({
      environmentId,
      name,
    });
    assertDashboardWorkspaceScope(context.workspaceId, response.token);

    return {
      status: 'success',
      sdkSnippet: response.sdkSnippet,
      token: response.token,
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(error, DASHBOARD_ACTION_MESSAGES.createTokenFailed),
    };
  }
}

export async function createPublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.applicationNameRequired),
    };
  }

  try {
    const context = await requireDashboardActionRole('admin');
    const created = await createPublicSdkInstallation(name.trim());
    assertDashboardWorkspaceScope(context.workspaceId, created.installation);
    let configured: Awaited<ReturnType<typeof configureInstallationOrigins>>;
    try {
      configured = await configureInstallationOrigins(
        context.workspaceId,
        created.installation.installationId,
      );
    } catch {
      configured = {
        origins: [],
        warning: await serverMessage(DASHBOARD_ACTION_MESSAGES.originsNotSynced),
      };
    }
    revalidatePath('/');
    return {
      status: 'success',
      installation: {
        ...created.installation,
        origins: configured.origins,
        sdkSnippet: created.sdkSnippet,
      },
      ...(configured.warning ? { warning: configured.warning } : {}),
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(
        error,
        DASHBOARD_ACTION_MESSAGES.prepareInstallationFailed,
      ),
    };
  }
}

export async function syncPublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const installationId = readRequiredFormValue(formData, 'installationId');
  if (!installationId) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseInstallation),
    };
  }

  try {
    const context = await requireDashboardActionRole('admin');
    const installations = await loadPublicSdkInstallations();
    for (const installation of installations) {
      assertDashboardWorkspaceScope(context.workspaceId, installation, ...installation.origins);
    }
    const installation = installations.find(
      (candidate) => candidate.installationId === installationId && !candidate.revokedAt,
    );
    if (!installation) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.installationNotFound),
      };
    }
    const configured = await configureInstallationOrigins(context.workspaceId, installationId);
    revalidatePath('/');
    return {
      status: 'success',
      installation: {
        ...installation,
        origins: configured.origins,
      },
      ...(configured.warning ? { warning: configured.warning } : {}),
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(error, DASHBOARD_ACTION_MESSAGES.syncOriginsFailed),
    };
  }
}

export async function revokePublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const installationId = readRequiredFormValue(formData, 'installationId');
  if (!installationId) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseInstallation),
    };
  }

  try {
    const context = await requireDashboardActionRole('admin');
    const installations = await loadPublicSdkInstallations();
    for (const installation of installations) {
      assertDashboardWorkspaceScope(context.workspaceId, installation, ...installation.origins);
    }
    const current = installations.find((candidate) => candidate.installationId === installationId);
    if (!current) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.installationNotFound),
      };
    }
    const revoked = await revokePublicSdkInstallation(installationId);
    revalidatePath('/');
    return {
      status: 'success',
      installation: {
        ...current,
        ...revoked.installation,
        origins: current.origins,
        sdkSnippet: current.sdkSnippet,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(
        error,
        DASHBOARD_ACTION_MESSAGES.revokeInstallationFailed,
      ),
    };
  }
}

/**
 * Engage or release the SDK kill switch for one installation (ADR-0027).
 *
 * `suspended` arrives as a form value rather than being derived from current
 * state so the control is idempotent: two clicks racing on a slow connection
 * settle on what the user asked for, not on whatever they toggled past.
 */
export async function setPublicSdkInstallationSuspensionAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const installationId = readRequiredFormValue(formData, 'installationId');
  if (!installationId) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseInstallation),
    };
  }
  const suspended = formData.get('suspended') === 'true';

  try {
    const context = await requireDashboardActionRole('admin');
    const installations = await loadPublicSdkInstallations();
    for (const installation of installations) {
      assertDashboardWorkspaceScope(context.workspaceId, installation, ...installation.origins);
    }
    const current = installations.find((candidate) => candidate.installationId === installationId);
    if (!current) {
      return {
        status: 'error',
        error: await serverMessage(DASHBOARD_ACTION_MESSAGES.installationNotFound),
      };
    }
    const updated = await setPublicSdkInstallationSuspension(installationId, suspended);
    revalidatePath('/');
    return {
      status: 'success',
      installation: {
        ...current,
        ...updated.installation,
        origins: current.origins,
        sdkSnippet: current.sdkSnippet,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(
        error,
        suspended
          ? DASHBOARD_ACTION_MESSAGES.pauseInstallationFailed
          : DASHBOARD_ACTION_MESSAGES.resumeInstallationFailed,
      ),
    };
  }
}

export async function loadDocumentDebugAction(
  _state: DocumentDebugActionState,
  formData: FormData,
): Promise<DocumentDebugActionState> {
  const documentId = formData.get('documentId');

  if (typeof documentId !== 'string' || !documentId.trim()) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseExperience),
    };
  }

  try {
    const context = await requireDashboardActionRole('member');
    const debug = await loadDocumentDebug(documentId);
    assertDashboardWorkspaceScope(context.workspaceId, debug.latestArtifact, ...debug.versions);
    const latestVersion = debug.versions[0];

    return {
      status: 'success',
      documentId,
      canonicalJson: stableDebugJson(debug.canonical),
      compiledJson: stableDebugJson(debug.latestArtifact?.compiled ?? null),
      latestContentHash:
        debug.latestArtifact?.contentHash ??
        (await serverMessage(DASHBOARD_ACTION_MESSAGES.notPrepared)),
      compilerVersion:
        debug.latestArtifact?.compilerVersion ??
        (await serverMessage(DASHBOARD_ACTION_MESSAGES.noDeliveryRecord)),
      versionCount: debug.versions.length,
      latestVersionLabel: latestVersion
        ? `v${latestVersion.version}`
        : await serverMessage(DASHBOARD_ACTION_MESSAGES.noVersions),
      publishReadinessIssues: debug.publishReadinessIssues,
    };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(error, DASHBOARD_ACTION_MESSAGES.loadSupportFailed),
    };
  }
}

export async function revokeEnvironmentTokenAction(
  _state: TokenRevokeActionState,
  formData: FormData,
): Promise<TokenRevokeActionState> {
  const tokenId = formData.get('tokenId');

  if (typeof tokenId !== 'string' || !tokenId.trim()) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseToken),
    };
  }

  try {
    const context = await requireDashboardActionRole('member');
    const response = await revokeEnvironmentToken(tokenId);
    assertDashboardWorkspaceScope(context.workspaceId, response.token);
    return { status: 'success', token: response.token };
  } catch (error) {
    return {
      status: 'error',
      error: await dashboardActionErrorMessage(error, DASHBOARD_ACTION_MESSAGES.revokeTokenFailed),
    };
  }
}

function stableDebugJson(value: unknown): string {
  return JSON.stringify(redactDebugValue(value), null, 2);
}

async function configureInstallationOrigins(
  workspaceId: string,
  installationId: string,
): Promise<{ origins: PublicSdkInstallationOriginDto[]; warning?: string }> {
  const environments = await loadWorkspaceEnvironments(workspaceId);
  const candidates = environments.flatMap((environment) => {
    if (environment.enabled === false) return [];
    return environment.originAllowlist.flatMap((value) => {
      const origin = normalizeExactOrigin(value);
      return origin
        ? [
            {
              environmentId: environment.id,
              origin,
              authoringEnabled:
                environment.kind !== 'production' && environment.authoringEnabled !== false,
            },
          ]
        : [];
    });
  });
  const occurrenceCount = new Map<string, number>();
  for (const candidate of candidates) {
    occurrenceCount.set(candidate.origin, (occurrenceCount.get(candidate.origin) ?? 0) + 1);
  }
  const uniqueCandidates = candidates.filter(
    (candidate) => occurrenceCount.get(candidate.origin) === 1,
  );
  const synced = await syncPublicSdkInstallationOrigins(installationId, uniqueCandidates);
  assertDashboardWorkspaceScope(workspaceId, ...synced.origins);
  const ambiguousCount = candidates.length - uniqueCandidates.length;
  let ambiguousWarning = '';
  if (ambiguousCount === 1) {
    ambiguousWarning = await serverMessage(DASHBOARD_ACTION_MESSAGES.ambiguousOrigin);
  } else if (ambiguousCount > 1) {
    ambiguousWarning = await serverMessage(DASHBOARD_ACTION_MESSAGES.ambiguousOrigins, {
      count: ambiguousCount,
    });
  }
  const warnings = [
    environments.length > 0 && candidates.length === 0
      ? await serverMessage(DASHBOARD_ACTION_MESSAGES.noProductOrigins)
      : '',
    ambiguousWarning,
  ].filter(Boolean);
  return {
    origins: synced.origins,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  };
}

function normalizeExactOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '' && url.pathname !== '/')
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function readRequiredFormValue(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isSafeRecordId(value: string): boolean {
  return value.length > 0 && value.length <= 256 && /^[a-zA-Z0-9_-]+$/u.test(value);
}

function isSafeThemeName(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 120;
}

function isThemeMutationGuard(input: {
  expectedRevision: number;
  expectedUpdatedAt: string;
}): boolean {
  return (
    Number.isInteger(input.expectedRevision) &&
    input.expectedRevision >= 1 &&
    input.expectedUpdatedAt.length > 0 &&
    input.expectedUpdatedAt.length <= 64
  );
}

async function brandSystemActionError(
  error: unknown,
  fallback: MessageDescriptor,
): Promise<BrandSystemActionState> {
  if (error instanceof DashboardApiError && error.statusCode === 409) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.brandChanged),
    };
  }
  if (error instanceof DashboardApiError && error.statusCode === 403) {
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.brandForbidden),
    };
  }
  return { status: 'error', error: await dashboardActionErrorMessage(error, fallback) };
}

async function dashboardActionErrorMessage(
  error: unknown,
  fallback: MessageDescriptor,
): Promise<string> {
  return error instanceof DashboardApiError
    ? serverDashboardErrorMessage(error)
    : serverMessage(fallback);
}

function redactDebugValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactDebugValue);

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveDebugKey(key)) {
      next[key] = '<redacted>';
    } else {
      next[key] = redactDebugValue(item);
    }
  }
  return next;
}

function isSensitiveDebugKey(key: string): boolean {
  return /(authorization|cookie|password|secret|session|token)/i.test(key);
}
