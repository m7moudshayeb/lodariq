// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';

const mocks = vi.hoisted(() => ({
  loadReleaseRecoveryStateAction: vi.fn(),
  recoverDocumentReleaseAction: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/app/release-recovery-actions', () => ({
  loadReleaseRecoveryStateAction: mocks.loadReleaseRecoveryStateAction,
  recoverDocumentReleaseAction: mocks.recoverDocumentReleaseAction,
}));
vi.mock('../../../../apps/dashboard/src/lib/client-dashboard-api', () => ({
  loadDashboardReleaseRecovery: async (
    _workspaceId: string,
    documentId: string,
    environmentId: string,
  ) => {
    const result = await mocks.loadReleaseRecoveryStateAction({ documentId, environmentId });
    if (result.status === 'success') return result.state;
    throw new Error(result.error);
  },
}));

import { ReleaseRecoveryPanel } from '../../../../apps/dashboard/src/components/release-recovery-panel';

const DOCUMENT_ID = 'doc.dashboard:release';
const STAGING_ID = 'env.staging:dashboard';
const PRODUCTION_ID = 'env.production:dashboard';
const PRIOR_PUBLICATION_ID = 'pub.dashboard:prior';
const CURRENT_PUBLICATION_ID = 'pub.dashboard:current';

describe('@lodariq/dashboard release recovery UI', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let identitySequence = 0;
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: vi.fn(
        () => `00000000-0000-4000-8000-${String(++identitySequence).padStart(12, '0')}`,
      ),
    });
    mocks.loadReleaseRecoveryStateAction.mockImplementation(
      async ({ environmentId }: { environmentId: string }) => ({
        status: 'success',
        state: recoveryState(environmentId),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('renders staging and production truth and submits only an exact vetted rollback', async () => {
    mocks.recoverDocumentReleaseAction.mockImplementation(
      async ({ request }: { request: ReleaseRecoveryRequest }) => ({
        status: 'result',
        result: rollbackSuccess(request),
      }),
    );
    const mounted = await mountPanel();
    await waitForHistory(mounted.container, STAGING_ID);

    expect(mounted.container.textContent).toContain('Complete history');
    expect(mounted.container.textContent).toContain(PRIOR_PUBLICATION_ID);
    expect(mounted.container.textContent).toContain(CURRENT_PUBLICATION_ID);
    expect(mounted.container.textContent).toContain('Failed rollback');
    expect(buttonByText(mounted.container, 'Staging').getAttribute('aria-selected')).toBe('true');

    await click(buttonByText(mounted.container, 'Production'));
    await waitForHistory(mounted.container, PRODUCTION_ID);
    expect(mocks.loadReleaseRecoveryStateAction).toHaveBeenLastCalledWith({
      documentId: DOCUMENT_ID,
      environmentId: PRODUCTION_ID,
    });

    const rollbackButton = buttonByText(mounted.container, 'Roll back…');
    await click(rollbackButton);
    const dialog = requiredElement<HTMLElement>(mounted.container, '[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(dialog.textContent).toContain('generation 2');
    expect(dialog.textContent).toContain(CURRENT_PUBLICATION_ID);
    const select = requiredElement<HTMLSelectElement>(dialog, 'select');
    expect([...select.options].map((option) => option.value)).toEqual(['', PRIOR_PUBLICATION_ID]);
    expect([...select.options].map((option) => option.value)).not.toContain(
      'pub.dashboard:historical-incompatible',
    );

    await changeSelect(select, PRIOR_PUBLICATION_ID);
    const reason = requiredElement<HTMLTextAreaElement>(dialog, 'textarea');
    await changeTextarea(reason, ' Restore stable production ');
    expect(buttonByText(dialog, 'Roll back publication').disabled).toBe(true);
    await changeTextarea(reason, 'Restore stable production');
    await click(buttonByText(dialog, 'Roll back publication'));
    await vi.waitFor(() => expect(mocks.recoverDocumentReleaseAction).toHaveBeenCalledOnce());

    const submitted = mocks.recoverDocumentReleaseAction.mock.calls[0]?.[0] as {
      documentId: string;
      environmentId: string;
      request: Extract<ReleaseRecoveryRequest, { action: 'rollback' }>;
    };
    expect(submitted).toMatchObject({
      documentId: DOCUMENT_ID,
      environmentId: PRODUCTION_ID,
      request: {
        action: 'rollback',
        targetPublicationId: PRIOR_PUBLICATION_ID,
        reason: 'Restore stable production',
        expectedGeneration: 2,
        expectedActivePublicationId: CURRENT_PUBLICATION_ID,
      },
    });
    expect(submitted.request.idempotencyKey).toMatch(/^dashboard\.rollback\./u);
    expect(submitted.request.correlationId).toMatch(/^dashboard\.rollback\./u);
    expect(submitted.request).not.toHaveProperty('artifact');
    await vi.waitFor(() => expect(mounted.container.querySelector('[role="dialog"]')).toBeNull());
    expect(mounted.container.textContent).toContain(
      `Rolled back to ${PRIOR_PUBLICATION_ID} at generation 3.`,
    );
    await vi.waitFor(() => expect(document.activeElement).toBe(rollbackButton));

    await unmount(mounted);
  });

  it('locks an uncertain unpublish request and retries the identical identity and CAS guard', async () => {
    mocks.recoverDocumentReleaseAction
      .mockResolvedValueOnce({
        status: 'error',
        error:
          'The recovery result is uncertain. Retry the exact request or refresh release history.',
        retryExact: true,
      })
      .mockImplementationOnce(async ({ request }: { request: ReleaseRecoveryRequest }) => ({
        status: 'result',
        result: unpublishSuccess(request),
      }));
    const mounted = await mountPanel();
    await waitForHistory(mounted.container, STAGING_ID);

    await click(buttonByText(mounted.container, 'Unpublish…'));
    const dialog = requiredElement<HTMLElement>(mounted.container, '[role="dialog"]');
    const reason = requiredElement<HTMLTextAreaElement>(dialog, 'textarea');
    await changeTextarea(reason, 'Pause staging delivery during incident review');
    await click(buttonByText(dialog, 'Unpublish release'));
    await vi.waitFor(() =>
      expect(buttonByText(mounted.container, 'Retry exact request')).toBeTruthy(),
    );
    expect(reason.disabled).toBe(true);
    const firstRequest = structuredClone(
      (mocks.recoverDocumentReleaseAction.mock.calls[0]?.[0] as { request: ReleaseRecoveryRequest })
        .request,
    );

    await click(buttonByText(mounted.container, 'Retry exact request'));
    await vi.waitFor(() => expect(mocks.recoverDocumentReleaseAction).toHaveBeenCalledTimes(2));
    const secondRequest = (
      mocks.recoverDocumentReleaseAction.mock.calls[1]?.[0] as { request: ReleaseRecoveryRequest }
    ).request;
    expect(secondRequest).toEqual(firstRequest);
    expect(firstRequest).toMatchObject({
      action: 'unpublish',
      reason: 'Pause staging delivery during incident review',
      expectedGeneration: 2,
      expectedActivePublicationId: CURRENT_PUBLICATION_ID,
    });
    await vi.waitFor(() => expect(mounted.container.querySelector('[role="dialog"]')).toBeNull());
    expect(mounted.container.textContent).toContain('Release unpublished at generation 3.');

    await unmount(mounted);
  });
});

async function mountPanel(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ReleaseRecoveryPanel, {
          documentId: DOCUMENT_ID,
          documentTitle: 'Checkout onboarding',
          environments: [
            { id: STAGING_ID, kind: 'staging', name: 'Staging', enabled: true },
            { id: PRODUCTION_ID, kind: 'production', name: 'Production', enabled: true },
          ],
          workspaceId: 'wk.dashboard:release',
        }),
      ),
    );
  });
  return { container, root };
}

async function unmount(mounted: { root: Root }): Promise<void> {
  await act(async () => mounted.root.unmount());
}

async function waitForHistory(container: HTMLElement, environmentId: string): Promise<void> {
  await vi.waitFor(() => {
    expect(mocks.loadReleaseRecoveryStateAction).toHaveBeenCalledWith({
      documentId: DOCUMENT_ID,
      environmentId,
    });
    expect(container.textContent).toContain('Complete history');
  });
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => button.click());
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    setNativeValue(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    setNativeValue(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setNativeValue(element: HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('native value setter is unavailable');
  setter.call(element, value);
}

function buttonByText(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);
  return element;
}

function recoveryState(environmentId: string): ReleaseRecoveryStateResponse {
  const scope = {
    workspaceId: 'wk.dashboard:release',
    environmentId,
    documentId: DOCUMENT_ID,
  };
  return {
    ...scope,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      ...scope,
      state: 'active',
      generation: 2,
      activePublicationId: CURRENT_PUBLICATION_ID,
      pendingReleaseOperationId: null,
      updatedAt: '2026-08-09T12:02:00.000Z',
    },
    history: [
      {
        ...historyIdentity(scope, 'relop.dashboard:prior', 1),
        action: 'publish',
        state: 'active',
        publicationId: PRIOR_PUBLICATION_ID,
        previousPublicationId: null,
        artifact: artifactPins('prior'),
      },
      {
        ...historyIdentity(scope, 'relop.dashboard:current', 2),
        action: 'promote',
        state: 'active',
        publicationId: CURRENT_PUBLICATION_ID,
        sourcePublicationId: 'pub.dashboard:staging-source',
        previousPublicationId: PRIOR_PUBLICATION_ID,
        artifact: artifactPins('current'),
      },
      {
        id: 'relop.dashboard:failed',
        ...scope,
        releaseOperationId: 'relop.dashboard:failed',
        idempotencyKey: 'dashboard.rollback.failed:history',
        correlationId: 'dashboard.rollback.failed:history',
        actorUserId: 'user.dashboard:owner',
        occurredAt: '2026-08-09T12:03:00.000Z',
        action: 'rollback',
        state: 'failed',
        targetPublicationId: 'pub.dashboard:historical-incompatible',
        reason: 'Investigate an incompatible historical release',
        expectedGeneration: 2,
        actualGeneration: 2,
        actualActivePublicationId: CURRENT_PUBLICATION_ID,
        failure: {
          code: 'artifact_incompatible',
          message: 'The rollback target artifact is not supported by the current runtime',
        },
      },
    ],
    rollbackTargetPublicationIds: [PRIOR_PUBLICATION_ID],
  };
}

function historyIdentity(
  scope: { workspaceId: string; environmentId: string; documentId: string },
  releaseOperationId: string,
  generation: number,
) {
  return {
    id: releaseOperationId,
    ...scope,
    releaseOperationId,
    generation,
    idempotencyKey: `dashboard.release.history:${generation}`,
    correlationId: `dashboard.release.history:${generation}`,
    actorUserId: 'user.dashboard:owner',
    occurredAt: `2026-08-09T12:0${generation}:00.000Z`,
  };
}

function artifactPins(label: string) {
  return {
    compiledArtifactId: `artifact.dashboard:${label}`,
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: `sha256-${label === 'prior' ? 'a' : 'b'}`.padEnd(
      71,
      label === 'prior' ? 'a' : 'b',
    ),
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: `themev.dashboard:${label}`,
    themeContentHash: `sha256-${label === 'prior' ? 'c' : 'd'}`.padEnd(
      71,
      label === 'prior' ? 'c' : 'd',
    ),
  };
}

function rollbackSuccess(request: ReleaseRecoveryRequest) {
  if (request.action !== 'rollback') throw new Error('rollback request expected');
  return {
    ok: true,
    action: 'rollback',
    state: 'active',
    replayed: false,
    releaseOperationId: 'relop.dashboard:rollback-success',
    publicationId: 'pub.dashboard:rollback-success',
    targetPublicationId: request.targetPublicationId,
    previousPublicationId: request.expectedActivePublicationId!,
    generation: request.expectedGeneration + 1,
    artifact: artifactPins('prior'),
    completedAt: '2026-08-09T12:04:00.000Z',
  } as const;
}

function unpublishSuccess(request: ReleaseRecoveryRequest) {
  if (request.action !== 'unpublish') throw new Error('unpublish request expected');
  return {
    ok: true,
    action: 'unpublish',
    state: 'inactive',
    replayed: false,
    releaseOperationId: 'relop.dashboard:unpublish-success',
    previousPublicationId: request.expectedActivePublicationId!,
    generation: request.expectedGeneration + 1,
    deactivatedArtifact: artifactPins('current'),
    completedAt: '2026-08-09T12:04:00.000Z',
  } as const;
}
