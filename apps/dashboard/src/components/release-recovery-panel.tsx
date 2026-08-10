'use client';

import * as React from 'react';
import { Ban, History, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import {
  type ReleaseArtifactPins,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  loadReleaseRecoveryStateAction,
  recoverDocumentReleaseAction,
} from '../app/release-recovery-actions';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export interface ReleaseRecoveryEnvironmentOption {
  id: string;
  kind: 'staging' | 'production';
  name: string;
  enabled: boolean;
}

interface ReleaseRecoveryPanelProps {
  documentId: string;
  documentTitle: string;
  environments: ReleaseRecoveryEnvironmentOption[];
}

interface RecoveryConfirmationState {
  action: ReleaseRecoveryRequest['action'];
  environmentId: string;
  environmentName: string;
  expectedGeneration: number;
  expectedActivePublicationId: string;
  targetPublicationId: string;
  rollbackTargetPublicationIds: string[];
  reason: string;
  idempotencyKey: string;
  correlationId: string;
  submitted: boolean;
  error?: string;
}

const RECOVERY_ACTION_LABELS = {
  rollback: 'Roll back',
  unpublish: 'Unpublish',
} as const;

export function ReleaseRecoveryPanel({
  documentId,
  documentTitle,
  environments,
}: ReleaseRecoveryPanelProps): React.ReactElement {
  const [selectedEnvironmentId, setSelectedEnvironmentId] = React.useState(
    () => environments[0]?.id ?? '',
  );
  const [state, setState] = React.useState<ReleaseRecoveryStateResponse | null>(null);
  const [loadError, setLoadError] = React.useState('');
  const [feedback, setFeedback] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<RecoveryConfirmationState | null>(null);
  const [loadingEnvironmentId, setLoadingEnvironmentId] = React.useState('');
  const [loadPending, startLoadTransition] = React.useTransition();
  const [mutationPending, startMutationTransition] = React.useTransition();
  const loadSequence = React.useRef(0);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const restoreFocusAfterConfirmation = React.useRef(false);
  const reasonInput = React.useRef<HTMLTextAreaElement | null>(null);

  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  );

  const loadState = React.useCallback(
    (environmentId: string): Promise<void> =>
      new Promise((resolve) => {
        const sequence = loadSequence.current + 1;
        loadSequence.current = sequence;
        setLoadingEnvironmentId(environmentId);
        setLoadError('');
        startLoadTransition(async () => {
          try {
            const result = await loadReleaseRecoveryStateAction({ documentId, environmentId });
            if (loadSequence.current !== sequence) return;
            if (result.status === 'error') {
              setState(null);
              setLoadError(result.error);
              return;
            }
            setState(result.state);
          } finally {
            if (loadSequence.current === sequence) setLoadingEnvironmentId('');
            resolve();
          }
        });
      }),
    [documentId],
  );

  React.useEffect(() => {
    if (environments.some((environment) => environment.id === selectedEnvironmentId)) return;
    setSelectedEnvironmentId(environments[0]?.id ?? '');
  }, [environments, selectedEnvironmentId]);

  React.useEffect(() => {
    setState(null);
    setLoadError('');
    setFeedback('');
    setConfirmation(null);
    if (selectedEnvironmentId) void loadState(selectedEnvironmentId);
  }, [loadState, selectedEnvironmentId]);

  React.useEffect(() => {
    if (!confirmation) return;
    reasonInput.current?.focus();
  }, [confirmation?.idempotencyKey]);

  React.useEffect(() => {
    if (confirmation || mutationPending || !restoreFocusAfterConfirmation.current) return;
    restoreFocusAfterConfirmation.current = false;
    returnFocus.current?.focus();
  }, [confirmation, mutationPending]);

  const closeConfirmation = React.useCallback((): void => {
    restoreFocusAfterConfirmation.current = true;
    setConfirmation(null);
  }, []);

  const beginRecovery = (
    action: ReleaseRecoveryRequest['action'],
    trigger: HTMLElement,
  ): void => {
    if (!state || state.deployment?.state !== 'active' || !selectedEnvironment) return;
    const permission = action === 'rollback' ? state.permissions.rollback : state.permissions.unpublish;
    if (!permission) return;
    returnFocus.current = trigger;
    setFeedback('');
    setConfirmation({
      action,
      environmentId: selectedEnvironment.id,
      environmentName: selectedEnvironment.name,
      expectedGeneration: state.deployment.generation,
      expectedActivePublicationId: state.deployment.activePublicationId,
      targetPublicationId: '',
      rollbackTargetPublicationIds: [...state.rollbackTargetPublicationIds],
      reason: '',
      idempotencyKey: `dashboard.${action}.${crypto.randomUUID()}`,
      correlationId: `dashboard.${action}.${crypto.randomUUID()}`,
      submitted: false,
    });
  };

  const submitRecovery = (): void => {
    if (!confirmation || !confirmationIsValid(confirmation) || mutationPending) return;
    const request = recoveryRequestFromConfirmation(confirmation);
    startMutationTransition(async () => {
      const result = await recoverDocumentReleaseAction({
        documentId,
        environmentId: confirmation.environmentId,
        request,
      });
      if (result.status === 'error') {
        setFeedback(result.retryExact ? '' : result.error);
        if (result.retryExact) {
          setConfirmation((current) =>
            current && current.idempotencyKey === confirmation.idempotencyKey
              ? { ...current, submitted: true, error: result.error }
              : current,
          );
        } else {
          closeConfirmation();
        }
        await loadState(confirmation.environmentId);
        return;
      }

      setFeedback(recoveryResultMessage(result.result));
      closeConfirmation();
      await loadState(confirmation.environmentId);
    });
  };

  if (!environments.length) {
    return (
      <section className="mt-4 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">
          Staging and production release environments are not configured.
        </p>
      </section>
    );
  }

  const selectedState = state?.environmentId === selectedEnvironmentId ? state : null;
  const deploymentActive = selectedState?.deployment?.state === 'active';
  const canRollback = Boolean(
    deploymentActive &&
      selectedState?.permissions.rollback &&
      selectedState.rollbackTargetPublicationIds.length,
  );
  const canUnpublish = Boolean(deploymentActive && selectedState?.permissions.unpublish);

  return (
    <section
      aria-label={`Release recovery for ${documentTitle}`}
      className="mt-4 rounded-lg border border-border bg-[var(--surface-subtle)] p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Release history &amp; recovery</h3>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Rollback reuses a server-vetted immutable artifact. Unpublish only deactivates the
            current pointer; history remains available.
          </p>
        </div>
        <Button
          className="h-9 shrink-0"
          disabled={loadPending || !selectedEnvironmentId}
          onClick={() => selectedEnvironmentId && void loadState(selectedEnvironmentId)}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Refresh
        </Button>
      </div>

      <div aria-label="Release environment" className="mt-4 flex flex-wrap gap-2" role="tablist">
        {environments.map((environment) => (
          <Button
            aria-controls={`release-recovery-${documentId}-${environment.id}`}
            aria-selected={environment.id === selectedEnvironmentId}
            className="h-9"
            key={environment.id}
            onClick={() => setSelectedEnvironmentId(environment.id)}
            role="tab"
            type="button"
            variant={environment.id === selectedEnvironmentId ? 'default' : 'outline'}
          >
            {environment.name}
            {!environment.enabled ? <Badge variant="outline">Disabled</Badge> : null}
          </Button>
        ))}
      </div>

      <div
        aria-live="polite"
        className="mt-4 grid gap-4"
        id={`release-recovery-${documentId}-${selectedEnvironmentId}`}
        role="tabpanel"
      >
        {loadingEnvironmentId === selectedEnvironmentId ? (
          <p className="text-sm text-muted-foreground">Loading complete release history…</p>
        ) : null}
        {loadError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>{loadError}</p>
          </div>
        ) : null}
        {feedback ? (
          <p className="rounded-md border border-border bg-background p-3 text-sm" role="status">
            {feedback}
          </p>
        ) : null}
        {selectedState ? (
          <>
            <DeploymentSummary state={selectedState} />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canRollback || mutationPending}
                onClick={(event) => beginRecovery('rollback', event.currentTarget)}
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Roll back…
              </Button>
              <Button
                disabled={!canUnpublish || mutationPending}
                onClick={(event) => beginRecovery('unpublish', event.currentTarget)}
                type="button"
                variant="outline"
              >
                <Ban aria-hidden="true" className="size-4" />
                Unpublish…
              </Button>
            </div>
            {!selectedState.permissions.rollback && !selectedState.permissions.unpublish ? (
              <p className="text-xs text-muted-foreground">
                Your current role or this environment policy does not allow release recovery.
              </p>
            ) : null}
            <ReleaseHistoryList entries={selectedState.history} />
          </>
        ) : null}
      </div>

      {confirmation ? (
        <RecoveryConfirmation
          confirmation={confirmation}
          pending={mutationPending}
          reasonInput={reasonInput}
          setConfirmation={setConfirmation}
          onCancel={closeConfirmation}
          onSubmit={submitRecovery}
        />
      ) : null}
    </section>
  );
}

function DeploymentSummary({ state }: { state: ReleaseRecoveryStateResponse }): React.ReactElement {
  const deployment = state.deployment;
  if (!deployment) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        This document has no deployment in the selected environment.
      </p>
    );
  }
  if (deployment.state === 'inactive') {
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Inactive</Badge>
          <span className="text-sm font-semibold">Generation {deployment.generation}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivery is inactive. Immutable publications and release history are retained.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Active</Badge>
        <span className="text-sm font-semibold">Generation {deployment.generation}</span>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        Active publication: {deployment.activePublicationId}
      </p>
      {deployment.pendingReleaseOperationId ? (
        <p className="mt-1 break-all text-xs text-destructive">
          Pending release operation: {deployment.pendingReleaseOperationId}
        </p>
      ) : null}
    </div>
  );
}

function ReleaseHistoryList({ entries }: { entries: ReleaseHistoryEntry[] }): React.ReactElement {
  return (
    <div className="grid gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Complete history</h4>
        <Badge variant="outline">{entries.length}</Badge>
      </div>
      {entries.length ? (
        <ol className="grid gap-2">
          {entries.map((entry) => (
            <ReleaseHistoryRow entry={entry} key={entry.id} />
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No release operations have been recorded for this environment.
        </p>
      )}
    </div>
  );
}

function ReleaseHistoryRow({ entry }: { entry: ReleaseHistoryEntry }): React.ReactElement {
  const artifact = historyArtifact(entry);
  return (
    <li className="grid gap-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={entry.state === 'failed' ? 'destructive' : 'outline'}>
            {historyActionLabel(entry)}
          </Badge>
          <span className="text-xs font-semibold">{historyGenerationLabel(entry)}</span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>
          {formatTimestamp(entry.occurredAt)}
        </time>
      </div>
      <p className="break-all text-xs text-muted-foreground">{historyIdentityLabel(entry)}</p>
      {'reason' in entry ? <p className="text-xs leading-5">Reason: {entry.reason}</p> : null}
      {entry.state === 'failed' ? (
        <p className="text-xs text-destructive">{entry.failure.message}</p>
      ) : null}
      {artifact ? <ArtifactPinsSummary artifact={artifact} /> : null}
      <p className="break-all text-[11px] text-muted-foreground">
        Operation {entry.releaseOperationId} · Actor {entry.actorUserId ?? 'System'}
      </p>
    </li>
  );
}

function ArtifactPinsSummary({ artifact }: { artifact: ReleaseArtifactPins }): React.ReactElement {
  return (
    <dl className="grid gap-1 rounded-md bg-[var(--surface-subtle)] p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
      <div>
        <dt className="font-semibold">Immutable artifact</dt>
        <dd className="break-all">{artifact.compiledArtifactId}</dd>
      </div>
      <div>
        <dt className="font-semibold">Content hash</dt>
        <dd className="break-all">{artifact.contentHash}</dd>
      </div>
      <div>
        <dt className="font-semibold">Renderer</dt>
        <dd>{artifact.rendererContractVersion}</dd>
      </div>
      <div>
        <dt className="font-semibold">Brand theme</dt>
        <dd className="break-all">{artifact.themeVersionId}</dd>
      </div>
    </dl>
  );
}

function RecoveryConfirmation({
  confirmation,
  pending,
  reasonInput,
  setConfirmation,
  onCancel,
  onSubmit,
}: {
  confirmation: RecoveryConfirmationState;
  pending: boolean;
  reasonInput: React.RefObject<HTMLTextAreaElement | null>;
  setConfirmation: React.Dispatch<React.SetStateAction<RecoveryConfirmationState | null>>;
  onCancel: () => void;
  onSubmit: () => void;
}): React.ReactElement {
  const inputsLocked = pending || confirmation.submitted;
  const actionLabel = RECOVERY_ACTION_LABELS[confirmation.action];
  return (
    <div
      aria-label={`${actionLabel} ${confirmation.environmentName} release`}
      aria-modal="false"
      className="mt-4 grid gap-4 rounded-lg border border-destructive/30 bg-background p-4 shadow-sm"
      role="dialog"
    >
      <div className="grid gap-1">
        <h4 className="font-semibold">Confirm exact {confirmation.action}</h4>
        <p className="text-xs leading-5 text-muted-foreground">
          Environment {confirmation.environmentName} · generation{' '}
          {confirmation.expectedGeneration} · active publication{' '}
          <span className="break-all">{confirmation.expectedActivePublicationId}</span>
        </p>
      </div>
      {confirmation.action === 'rollback' ? (
        <label className="grid gap-1.5 text-xs font-medium">
          Prior server-vetted publication
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            disabled={inputsLocked}
            onChange={(event) =>
              setConfirmation((current) =>
                current ? { ...current, targetPublicationId: event.target.value } : current,
              )
            }
            value={confirmation.targetPublicationId}
          >
            <option value="">Choose a prior publication</option>
            {confirmation.rollbackTargetPublicationIds.map((publicationId) => (
              <option key={publicationId} value={publicationId}>
                {publicationId}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="rounded-md border border-border bg-[var(--surface-subtle)] p-3 text-xs leading-5 text-muted-foreground">
          Delivery will become inactive. Immutable publications and append-only history will not be
          deleted.
        </p>
      )}
      <label className="grid gap-1.5 text-xs font-medium">
        Reason
        <textarea
          className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={inputsLocked}
          maxLength={500}
          onChange={(event) =>
            setConfirmation((current) =>
              current ? { ...current, reason: event.target.value } : current,
            )
          }
          ref={reasonInput}
          value={confirmation.reason}
        />
        <span className="text-muted-foreground">Use 1–500 characters with no outer spaces.</span>
      </label>
      {confirmation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {confirmation.error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          disabled={!confirmationIsValid(confirmation) || pending}
          onClick={onSubmit}
          type="button"
          variant="destructive"
        >
          {recoverySubmitLabel(confirmation, pending)}
        </Button>
      </div>
    </div>
  );
}

function confirmationIsValid(confirmation: RecoveryConfirmationState): boolean {
  const reasonValid =
    confirmation.reason.length >= 1 &&
    confirmation.reason.length <= 500 &&
    confirmation.reason.trim() === confirmation.reason;
  const targetValid =
    confirmation.action === 'unpublish' ||
    confirmation.rollbackTargetPublicationIds.includes(confirmation.targetPublicationId);
  return reasonValid && targetValid;
}

function recoveryRequestFromConfirmation(
  confirmation: RecoveryConfirmationState,
): ReleaseRecoveryRequest {
  const shared = {
    reason: confirmation.reason,
    expectedGeneration: confirmation.expectedGeneration,
    expectedActivePublicationId: confirmation.expectedActivePublicationId,
    idempotencyKey: confirmation.idempotencyKey,
    correlationId: confirmation.correlationId,
  };
  if (confirmation.action === 'rollback') {
    return { action: 'rollback', targetPublicationId: confirmation.targetPublicationId, ...shared };
  }
  return { action: 'unpublish', ...shared };
}

function recoverySubmitLabel(
  confirmation: RecoveryConfirmationState,
  pending: boolean,
): string {
  if (pending) return 'Checking exact release…';
  if (confirmation.submitted) return 'Retry exact request';
  return confirmation.action === 'rollback' ? 'Roll back publication' : 'Unpublish release';
}

function recoveryResultMessage(result: ReleaseRecoveryResult): string {
  if (!result.ok) return result.message;
  const replay = result.replayed ? ' Exact request replayed safely.' : '';
  if (result.action === 'rollback') {
    return `Rolled back to ${result.targetPublicationId} at generation ${result.generation}.${replay}`;
  }
  return `Release unpublished at generation ${result.generation}.${replay}`;
}

function historyActionLabel(entry: ReleaseHistoryEntry): string {
  if (entry.state === 'failed') return `Failed ${entry.action}`;
  if (entry.action === 'publish') return 'Published';
  if (entry.action === 'promote') return 'Promoted';
  if (entry.action === 'rollback') return 'Rolled back';
  return 'Unpublished';
}

function historyGenerationLabel(entry: ReleaseHistoryEntry): string {
  if ('generation' in entry) return `Generation ${entry.generation}`;
  if (entry.actualGeneration !== undefined) return `Actual generation ${entry.actualGeneration}`;
  return `Expected generation ${entry.expectedGeneration}`;
}

function historyIdentityLabel(entry: ReleaseHistoryEntry): string {
  if (entry.action === 'rollback') {
    return entry.state === 'failed'
      ? `Requested target: ${entry.targetPublicationId}`
      : `Publication: ${entry.publicationId} · target: ${entry.targetPublicationId}`;
  }
  if (entry.action === 'unpublish') {
    if (entry.state !== 'failed') return `Previous publication: ${entry.previousPublicationId}`;
    return entry.actualActivePublicationId
      ? `Active publication at attempt: ${entry.actualActivePublicationId}`
      : 'No active publication at attempt';
  }
  if (entry.action === 'promote') {
    return `Publication: ${entry.publicationId} · source: ${entry.sourcePublicationId}`;
  }
  return `Publication: ${entry.publicationId}`;
}

function historyArtifact(entry: ReleaseHistoryEntry): ReleaseArtifactPins | null {
  if ('artifact' in entry) return entry.artifact;
  if ('deactivatedArtifact' in entry) return entry.deactivatedArtifact;
  return null;
}

function formatTimestamp(value: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString() : value;
}
