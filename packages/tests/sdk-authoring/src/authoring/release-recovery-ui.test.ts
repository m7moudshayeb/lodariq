// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseArtifactPins,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  createAuthoringReleaseRecoveryIntent,
  createAuthoringReleaseRecoveryViewModel,
} from '../../../../../packages/sdk-authoring/src/authoring/release-recovery-model';
import {
  ReleaseHistoryPanel,
  ReleaseRecoveryConfirmation,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/release-recovery';

const SCOPE = {
  workspaceId: 'workspace_recovery_ui',
  environmentId: 'environment_production',
  documentId: 'document_tour',
} as const;

describe('authoring release history and recovery confirmation', () => {
  beforeEach(() => {
    reactActEnvironment().IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    reactActEnvironment().IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('renders exact contextual history with textual state and no compile action', () => {
    const markup = renderToStaticMarkup(
      createElement(ReleaseHistoryPanel, {
        model: releaseModel(),
        onStartRecovery: () => undefined,
      }),
    );

    for (const expected of [
      'Release history',
      'Active publication publication_current_4 at generation 4.',
      'Current publication',
      'Rollback available',
      'Rollback unavailable',
      'publication_prior_1',
      'publication_legacy_2',
      'Immutable artifact',
      'artifact_1',
      'artifact_2',
      'user_owner',
      'System',
      'Failed',
      RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
      'Roll back…',
      'Unpublish…',
    ]) {
      expect(markup).toContain(expected);
    }
    expect(markup).not.toMatch(/<button[^>]*>[^<]*Compile/i);
    expect(markup).not.toContain('artifact bytes');
  });

  it('starts recovery only with the captured active deployment guard', async () => {
    const onStartRecovery = vi.fn();
    const { root, rootElement } = await render(
      createElement(ReleaseHistoryPanel, { model: releaseModel(), onStartRecovery }),
    );

    buttonByText(rootElement, 'Roll back…').click();
    expect(onStartRecovery).toHaveBeenCalledOnce();
    expect(onStartRecovery.mock.calls[0]?.[0]).toMatchObject({
      action: 'rollback',
      workspaceId: SCOPE.workspaceId,
      environmentId: SCOPE.environmentId,
      documentId: SCOPE.documentId,
      guard: {
        expectedGeneration: 4,
        expectedActivePublicationId: 'publication_current_4',
      },
      targets: [expect.objectContaining({ publicationId: 'publication_prior_1', generation: 1 })],
    });

    await act(async () => root.unmount());
  });

  it('requires an exact prior selection and an already-trimmed reason before rollback', async () => {
    const intent = createAuthoringReleaseRecoveryIntent(releaseModel(), 'rollback');
    if (!intent || intent.action !== 'rollback') throw new Error('Rollback intent is unavailable');
    const onConfirm = vi.fn<(request: ReleaseRecoveryRequest) => void>();
    const { root, rootElement } = await render(
      createElement(ReleaseRecoveryConfirmation, {
        intent,
        requestIdentity: {
          idempotencyKey: 'rollback.request_ui',
          correlationId: 'rollback.correlation_ui',
        },
        onCancel: vi.fn(),
        onConfirm,
      }),
    );

    const dialog = rootElement.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('false');
    expect(dialog?.textContent).toContain('Expected generation4');
    expect(dialog?.textContent).toContain('Expected active publicationpublication_current_4');
    const select = rootElement.querySelector('select');
    const textarea = rootElement.querySelector('textarea');
    if (!select || !textarea) throw new Error('Rollback controls are missing');
    expect([...select.options].map((option) => option.value)).toEqual(['', 'publication_prior_1']);
    expect(buttonByText(rootElement, 'Roll back publication').disabled).toBe(true);

    await changeSelect(select, 'publication_prior_1');
    await changeTextarea(textarea, 'Restore the stable release ');
    expect(buttonByText(rootElement, 'Roll back publication').disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    await changeTextarea(textarea, 'Restore the stable release');
    const confirm = buttonByText(rootElement, 'Roll back publication');
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith({
      action: 'rollback',
      targetPublicationId: 'publication_prior_1',
      reason: 'Restore the stable release',
      expectedGeneration: 4,
      expectedActivePublicationId: 'publication_current_4',
      idempotencyKey: 'rollback.request_ui',
      correlationId: 'rollback.correlation_ui',
    });
    expect(JSON.stringify(onConfirm.mock.calls[0]?.[0])).not.toContain('artifact');

    await act(async () => root.unmount());
  });

  it('confirms unpublish with the exact guard while retaining immutable history truth', async () => {
    const intent = createAuthoringReleaseRecoveryIntent(releaseModel(), 'unpublish');
    if (!intent || intent.action !== 'unpublish') {
      throw new Error('Unpublish intent is unavailable');
    }
    const onConfirm = vi.fn<(request: ReleaseRecoveryRequest) => void>();
    const { root, rootElement } = await render(
      createElement(ReleaseRecoveryConfirmation, {
        intent,
        requestIdentity: {
          idempotencyKey: 'unpublish.request_ui',
          correlationId: 'unpublish.correlation_ui',
        },
        error: 'The active deployment changed. Refresh release history.',
        onCancel: vi.fn(),
        onConfirm,
      }),
    );

    expect(rootElement.querySelector('select')).toBeNull();
    expect(rootElement.textContent).toContain(
      'Immutable publications and append-only release history remain available.',
    );
    expect(rootElement.querySelector('[role="alert"]')?.textContent).toContain(
      'The active deployment changed.',
    );
    const textarea = rootElement.querySelector('textarea');
    if (!textarea) throw new Error('Unpublish reason is missing');
    await changeTextarea(textarea, 'Pause delivery during incident review');
    const confirm = buttonByText(rootElement, 'Unpublish release');
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());

    expect(onConfirm).toHaveBeenCalledWith({
      action: 'unpublish',
      reason: 'Pause delivery during incident review',
      expectedGeneration: 4,
      expectedActivePublicationId: 'publication_current_4',
      idempotencyKey: 'unpublish.request_ui',
      correlationId: 'unpublish.correlation_ui',
    });

    await act(async () => root.unmount());
  });
});

async function render(element: ReturnType<typeof createElement>) {
  const rootElement = document.createElement('div');
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await act(async () => root.render(element));
  return { root, rootElement };
}

async function changeSelect(select: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    setNativeFormValue(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function changeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    setNativeFormValue(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setNativeFormValue(element: HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('Native form value setter is unavailable');
  setter.call(element, value);
}

function reactActEnvironment(): typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean } {
  return globalThis;
}

function buttonByText(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function releaseModel() {
  return createAuthoringReleaseRecoveryViewModel({
    ...SCOPE,
    state: recoveryState(),
  });
}

function recoveryState(): ReleaseRecoveryStateResponse {
  return {
    ...SCOPE,
    permissions: { rollback: true, unpublish: true },
    deployment: {
      ...SCOPE,
      state: 'active',
      generation: 4,
      activePublicationId: 'publication_current_4',
      updatedAt: '2026-08-09T12:04:00.000Z',
    },
    history: releaseHistory(),
    rollbackTargetPublicationIds: ['publication_prior_1'],
  };
}

function releaseHistory(): ReleaseHistoryEntry[] {
  return [
    {
      ...historyIdentity('history_prior_1', 1),
      action: 'publish',
      state: 'active',
      publicationId: 'publication_prior_1',
      previousPublicationId: null,
      artifact: artifact('1'),
    },
    {
      ...historyIdentity('history_current_4', 4),
      action: 'promote',
      state: 'active',
      publicationId: 'publication_current_4',
      sourcePublicationId: 'publication_staging_4',
      previousPublicationId: 'publication_prior_1',
      artifact: artifact('4'),
    },
    {
      ...historyIdentity('history_legacy_2', 2),
      action: 'publish',
      state: 'active',
      publicationId: 'publication_legacy_2',
      previousPublicationId: 'publication_prior_1',
      artifact: artifact('2'),
    },
    {
      id: 'history_failed_5',
      ...SCOPE,
      releaseOperationId: 'operation_failed_5',
      idempotencyKey: 'rollback.failed_5',
      correlationId: 'rollback.failed.correlation_5',
      actorUserId: 'user_owner',
      occurredAt: '2026-08-09T12:05:00.000Z',
      action: 'rollback',
      state: 'failed',
      targetPublicationId: 'publication_invalid',
      reason: 'Investigate a bad target',
      expectedGeneration: 4,
      actualGeneration: 4,
      expectedActivePublicationId: 'publication_current_4',
      actualActivePublicationId: 'publication_current_4',
      failure: {
        code: 'rollback_target_invalid',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
      },
    },
  ];
}

function historyIdentity(id: string, generation: number) {
  return {
    id,
    ...SCOPE,
    releaseOperationId: `operation_${generation}`,
    generation,
    idempotencyKey: `release.request_${generation}`,
    correlationId: `release.correlation_${generation}`,
    actorUserId: generation === 1 ? null : 'user_owner',
    occurredAt: `2026-08-09T12:0${generation}:00.000Z`,
  } as const;
}

function artifact(version: string): ReleaseArtifactPins {
  return {
    compiledArtifactId: `artifact_${version}`,
    artifactSchemaVersion: '1',
    contentHash: `sha256-${version.repeat(64)}`,
    compilerVersion: '1.0.0',
    rendererContractVersion: '1',
    themeContractVersion: '1',
    themeVersionId: `theme_version_${version}`,
    themeContentHash: `sha256-${version.repeat(64)}`,
  };
}
