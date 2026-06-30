'use server';

import { createEnvironmentToken, loadDocumentDebug, revokeEnvironmentToken } from '../lib/api';
import type { DocumentDebugActionState } from './document-debug-action-state';
import type { AuthoringLaunchActionState } from './authoring-launch-action-state';
import type { TokenRevokeActionState } from './token-revoke-action-state';
import type { TokenActionState } from './token-action-state';

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
    return { status: 'error', error: 'Token name is required.' };
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

export async function createAuthoringLaunchAction(
  _state: AuthoringLaunchActionState,
  formData: FormData,
): Promise<AuthoringLaunchActionState> {
  const environmentId = formData.get('environmentId');
  const documentId = formData.get('documentId');
  const name = formData.get('name');

  if (typeof environmentId !== 'string' || !environmentId.trim()) {
    return { status: 'error', error: 'Choose a staging environment.' };
  }
  if (typeof documentId !== 'string' || !documentId.trim()) {
    return { status: 'error', error: 'Choose a document.' };
  }
  if (typeof name !== 'string' || !name.trim()) {
    return { status: 'error', error: 'Launch name is required.' };
  }

  try {
    const response = await createEnvironmentToken({
      environmentId,
      name,
      authoringDocumentId: documentId,
    });

    if (!response.authoringSession || !response.authoringSdkSnippet) {
      return { status: 'error', error: 'API did not return an authoring launch snippet.' };
    }

    return {
      status: 'success',
      sdkSnippet: response.authoringSdkSnippet,
      token: response.token,
      authoringSession: response.authoringSession,
      bootstrapHeaderName: response.bootstrapHeaderName,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to create authoring launch.',
    };
  }
}

export async function loadDocumentDebugAction(
  _state: DocumentDebugActionState,
  formData: FormData,
): Promise<DocumentDebugActionState> {
  const documentId = formData.get('documentId');

  if (typeof documentId !== 'string' || !documentId.trim()) {
    return { status: 'error', error: 'Choose a document.' };
  }

  try {
    const debug = await loadDocumentDebug(documentId);
    const latestVersion = debug.versions[0];

    return {
      status: 'success',
      documentId,
      canonicalJson: stableDebugJson(debug.canonical),
      compiledJson: stableDebugJson(debug.latestArtifact?.compiled ?? null),
      latestContentHash: debug.latestArtifact?.contentHash ?? 'Not compiled',
      compilerVersion: debug.latestArtifact?.compilerVersion ?? 'No compiler artifact',
      versionCount: debug.versions.length,
      latestVersionLabel: latestVersion ? `v${latestVersion.version}` : 'No versions',
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to load document JSON.',
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
