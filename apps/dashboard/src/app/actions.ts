'use server';

import {
  BrandThemeDefinition as BrandThemeDefinitionSchema,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  validate,
  type BrandThemeDefinition,
} from '@lodariq/schema';
import { revalidatePath } from 'next/cache';
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
  revokeEnvironmentToken,
  setDefaultWorkspaceTheme,
  setDocumentThemeBinding,
  syncPublicSdkInstallationOrigins,
  updateEnvironmentReleasePolicy,
  updateWorkspaceThemeDraft,
  DashboardApiError,
  type PublicSdkInstallationOriginDto,
  type WorkspaceEnvironmentDto,
} from '../lib/api';
import type { BrandSystemActionState } from './brand-system-action-state';
import type { DocumentDebugActionState } from './document-debug-action-state';
import type { SdkInstallationActionState } from './sdk-installation-action-state';
import type { TokenRevokeActionState } from './token-revoke-action-state';
import type { TokenActionState } from './token-action-state';

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
    !isSafeRecordId(input.environmentId) ||
    !input.expectedUpdatedAt ||
    input.expectedUpdatedAt.length > 64 ||
    (input.requiredApprovalCount !== 0 && input.requiredApprovalCount !== 1)
  ) {
    return { status: 'error', error: 'The production approval policy is invalid.' };
  }
  try {
    const response = await updateEnvironmentReleasePolicy(input);
    revalidatePath('/');
    return {
      status: 'success',
      message:
        response.environment.requiredApprovalCount === 1
          ? 'One approval is now required before production promotion.'
          : 'Production promotion no longer requires a separate approval.',
      environment: response.environment,
    };
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 409) {
      return {
        status: 'error',
        error: 'The production environment changed in another session. Refresh and try again.',
      };
    }
    if (error instanceof DashboardApiError && error.statusCode === 403) {
      return {
        status: 'error',
        error: 'Your workspace role does not allow release-policy changes.',
      };
    }
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to update release approval.',
    };
  }
}

export async function createAccessibleBrandThemeAction(): Promise<BrandSystemActionState> {
  try {
    const response = await createWorkspaceTheme({
      name: 'Product brand',
      draft: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition,
    });
    revalidatePath('/');
    return {
      status: 'success',
      message: 'Brand system created. Review the essentials, then approve the first version.',
      theme: response.theme,
    };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to create the Brand system.');
  }
}

export async function loadBrandThemeImpactAction(themeId: string): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(themeId)) return { status: 'error', error: 'Choose a Brand theme.' };
  try {
    return {
      status: 'success',
      message: 'Impact refreshed.',
      detail: await loadWorkspaceTheme(themeId),
    };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to load Brand impact.');
  }
}

export async function saveBrandThemeDraftAction(
  input: SaveBrandThemeDraftInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isSafeThemeName(input.name)) {
    return { status: 'error', error: 'Theme name or identifier is invalid.' };
  }
  if (!isThemeMutationGuard(input) || !validate(BrandThemeDefinitionSchema, input.draft).valid) {
    return { status: 'error', error: 'Theme values are invalid. Review the highlighted controls.' };
  }
  try {
    const response = await updateWorkspaceThemeDraft(input);
    revalidatePath('/');
    return { status: 'success', message: 'Draft saved.', theme: response.theme };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to save this Brand draft.');
  }
}

export async function approveBrandThemeAction(
  input: BrandThemeGuardInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isThemeMutationGuard(input)) {
    return { status: 'error', error: 'Theme approval request is invalid.' };
  }
  try {
    const response = await approveWorkspaceTheme(input);
    revalidatePath('/');
    return {
      status: 'success',
      message: `Version ${response.approvedVersion.version} approved. Live artifacts stay unchanged until an experience explicitly adopts and publishes it.`,
      theme: response.theme,
      approvedVersion: response.approvedVersion,
    };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to approve this Brand version.');
  }
}

export async function makeDefaultBrandThemeAction(
  input: BrandThemeGuardInput,
): Promise<BrandSystemActionState> {
  if (!isSafeRecordId(input.themeId) || !isThemeMutationGuard(input)) {
    return { status: 'error', error: 'Default theme request is invalid.' };
  }
  try {
    const response = await setDefaultWorkspaceTheme(input);
    revalidatePath('/');
    return { status: 'success', message: 'Workspace default updated.', theme: response.theme };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to make this the workspace default.');
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
    return { status: 'error', error: 'Theme acknowledgement request is invalid.' };
  }
  try {
    await setDocumentThemeBinding(input.documentId, {
      policy: 'workspace-current',
      themeId: input.themeId,
      acknowledgedThemeVersionId: input.themeVersionId,
    });
    const detail = await loadWorkspaceTheme(input.themeId);
    revalidatePath('/');
    return {
      status: 'success',
      message: 'Experience now uses the approved Brand version in its next compiled artifact.',
      detail,
      acknowledgedDocumentId: input.documentId,
    };
  } catch (error) {
    return brandSystemActionError(error, 'Unable to update this experience.');
  }
}

export async function createEnvironmentTokenAction(
  _state: TokenActionState,
  formData: FormData,
): Promise<TokenActionState> {
  const environmentId = formData.get('environmentId');
  const name = formData.get('name');

  if (typeof environmentId !== 'string' || !environmentId.trim()) {
    return { status: 'error', error: 'Choose an environment.' };
  }
  if (typeof name !== 'string' || !name.trim()) {
    return { status: 'error', error: 'Site label is required.' };
  }

  try {
    const response = await createEnvironmentToken({
      environmentId,
      name,
    });

    return {
      status: 'success',
      sdkSnippet: response.sdkSnippet,
      token: response.token,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to create token.',
    };
  }
}

export async function createPublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) {
    return { status: 'error', error: 'Application name is required.' };
  }

  try {
    const created = await createPublicSdkInstallation(name.trim());
    let configured: Awaited<ReturnType<typeof configureInstallationOrigins>>;
    try {
      configured = await configureInstallationOrigins(created.installation.installationId);
    } catch {
      configured = {
        origins: [],
        warning:
          'The installation was created, but trusted origins could not be synced. Retry the origin sync before using it.',
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
      error: error instanceof Error ? error.message : 'Unable to prepare the SDK installation.',
    };
  }
}

export async function syncPublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const installationId = readRequiredFormValue(formData, 'installationId');
  if (!installationId) return { status: 'error', error: 'Choose an SDK installation.' };

  try {
    const installations = await loadPublicSdkInstallations();
    const installation = installations.find(
      (candidate) => candidate.installationId === installationId && !candidate.revokedAt,
    );
    if (!installation) return { status: 'error', error: 'SDK installation was not found.' };
    const configured = await configureInstallationOrigins(installationId);
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
      error: error instanceof Error ? error.message : 'Unable to sync trusted origins.',
    };
  }
}

export async function revokePublicSdkInstallationAction(
  _state: SdkInstallationActionState,
  formData: FormData,
): Promise<SdkInstallationActionState> {
  const installationId = readRequiredFormValue(formData, 'installationId');
  if (!installationId) return { status: 'error', error: 'Choose an SDK installation.' };

  try {
    const installations = await loadPublicSdkInstallations();
    const current = installations.find((candidate) => candidate.installationId === installationId);
    if (!current) return { status: 'error', error: 'SDK installation was not found.' };
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
      error: error instanceof Error ? error.message : 'Unable to revoke the SDK installation.',
    };
  }
}

export async function loadDocumentDebugAction(
  _state: DocumentDebugActionState,
  formData: FormData,
): Promise<DocumentDebugActionState> {
  const documentId = formData.get('documentId');

  if (typeof documentId !== 'string' || !documentId.trim()) {
    return { status: 'error', error: 'Choose an experience.' };
  }

  try {
    const debug = await loadDocumentDebug(documentId);
    const latestVersion = debug.versions[0];

    return {
      status: 'success',
      documentId,
      canonicalJson: stableDebugJson(debug.canonical),
      compiledJson: stableDebugJson(debug.latestArtifact?.compiled ?? null),
      latestContentHash: debug.latestArtifact?.contentHash ?? 'Not prepared',
      compilerVersion: debug.latestArtifact?.compilerVersion ?? 'No delivery record',
      versionCount: debug.versions.length,
      latestVersionLabel: latestVersion ? `v${latestVersion.version}` : 'No versions',
      publishReadinessIssues: debug.publishReadinessIssues,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to load support details.',
    };
  }
}

export async function revokeEnvironmentTokenAction(
  _state: TokenRevokeActionState,
  formData: FormData,
): Promise<TokenRevokeActionState> {
  const tokenId = formData.get('tokenId');

  if (typeof tokenId !== 'string' || !tokenId.trim()) {
    return { status: 'error', error: 'Choose a token.' };
  }

  try {
    const response = await revokeEnvironmentToken(tokenId);
    return { status: 'success', token: response.token };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to revoke token.',
    };
  }
}

function stableDebugJson(value: unknown): string {
  return JSON.stringify(redactDebugValue(value), null, 2);
}

async function configureInstallationOrigins(
  installationId: string,
): Promise<{ origins: PublicSdkInstallationOriginDto[]; warning?: string }> {
  const environments = await loadWorkspaceEnvironments();
  const candidates = environments.flatMap((environment) =>
    environment.originAllowlist.flatMap((value) => {
      const origin = normalizeExactOrigin(value);
      return origin
        ? [
            {
              environmentId: environment.id,
              origin,
              authoringEnabled: environment.kind !== 'production',
            },
          ]
        : [];
    }),
  );
  const occurrenceCount = new Map<string, number>();
  for (const candidate of candidates) {
    occurrenceCount.set(candidate.origin, (occurrenceCount.get(candidate.origin) ?? 0) + 1);
  }
  const uniqueCandidates = candidates.filter(
    (candidate) => occurrenceCount.get(candidate.origin) === 1,
  );
  const synced = await syncPublicSdkInstallationOrigins(installationId, uniqueCandidates);
  const ambiguousCount = candidates.length - uniqueCandidates.length;
  const warnings = [
    environments.length > 0 && candidates.length === 0
      ? 'No canonical product origins are configured yet.'
      : '',
    ambiguousCount > 0
      ? `${ambiguousCount} origin mapping${ambiguousCount === 1 ? ' was' : 's were'} skipped because the same origin belongs to more than one environment.`
      : '',
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

function brandSystemActionError(error: unknown, fallback: string): BrandSystemActionState {
  if (error instanceof DashboardApiError && error.statusCode === 409) {
    return {
      status: 'error',
      error: 'This Brand theme changed in another session. Refresh its impact before trying again.',
    };
  }
  if (error instanceof DashboardApiError && error.statusCode === 403) {
    return {
      status: 'error',
      error: 'Your workspace role does not allow this Brand action.',
    };
  }
  return { status: 'error', error: error instanceof Error ? error.message : fallback };
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
