'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { DEFAULT_LOCALE, isSupportedLocale } from '@lodariq/i18n';
import { Ban, History, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import {
  type ReleaseArtifactPins,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import { useReleaseRecovery } from '../hooks/use-release-recovery';
import { dashboardRecoveryFailureMessage } from '../i18n/server-feedback';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
  workspaceId: string;
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

type Translate = ReturnType<typeof useLingui>['_'];

const RECOVERY_ACTION_LABELS = {
  rollback: msg({ id: 'dashboard.recovery.action.rollback', message: 'Roll back' }),
  unpublish: msg({ id: 'dashboard.recovery.action.unpublish', message: 'Unpublish' }),
} as const;

const COPY = {
  historyUnavailable: msg({
    id: 'dashboard.recovery.historyUnavailable',
    message: 'Release history is temporarily unavailable for this environment.',
  }),
  requestFailed: msg({
    id: 'dashboard.recovery.requestFailed',
    message: 'The release recovery request could not be completed.',
  }),
  noEnvironments: msg({
    id: 'dashboard.recovery.noEnvironments',
    message: 'Staging and production release environments are not configured.',
  }),
  regionLabel: msg({
    id: 'dashboard.recovery.regionLabel',
    message: 'Release recovery for {document}',
  }),
  title: msg({ id: 'dashboard.recovery.title', message: 'Release history & recovery' }),
  description: msg({
    id: 'dashboard.recovery.description',
    message:
      'Rollback reuses a server-vetted immutable artifact. Unpublish only deactivates the current pointer; history remains available.',
  }),
  refresh: msg({ id: 'dashboard.recovery.refresh', message: 'Refresh' }),
  environment: msg({ id: 'dashboard.recovery.environment', message: 'Release environment' }),
  disabled: msg({ id: 'dashboard.recovery.disabled', message: 'Disabled' }),
  loading: msg({
    id: 'dashboard.recovery.loading',
    message: 'Loading complete release history…',
  }),
  rollbackEllipsis: msg({ id: 'dashboard.recovery.rollbackEllipsis', message: 'Roll back…' }),
  unpublishEllipsis: msg({ id: 'dashboard.recovery.unpublishEllipsis', message: 'Unpublish…' }),
  notAllowed: msg({
    id: 'dashboard.recovery.notAllowed',
    message: 'Your current role or this environment policy does not allow release recovery.',
  }),
  noDeployment: msg({
    id: 'dashboard.recovery.noDeployment',
    message: 'This document has no deployment in the selected environment.',
  }),
  inactive: msg({ id: 'dashboard.recovery.inactive', message: 'Inactive' }),
  active: msg({ id: 'dashboard.recovery.active', message: 'Active' }),
  generation: msg({ id: 'dashboard.recovery.generation', message: 'Generation {generation}' }),
  inactiveDescription: msg({
    id: 'dashboard.recovery.inactiveDescription',
    message: 'Delivery is inactive. Immutable publications and release history are retained.',
  }),
  activePublication: msg({
    id: 'dashboard.recovery.activePublication',
    message: 'Active publication: {publication}',
  }),
  pendingOperation: msg({
    id: 'dashboard.recovery.pendingOperation',
    message: 'Pending release operation: {operation}',
  }),
  completeHistory: msg({ id: 'dashboard.recovery.completeHistory', message: 'Complete history' }),
  noOperations: msg({
    id: 'dashboard.recovery.noOperations',
    message: 'No release operations have been recorded for this environment.',
  }),
  reason: msg({ id: 'dashboard.recovery.reason', message: 'Reason: {reason}' }),
  operationActor: msg({
    id: 'dashboard.recovery.operationActor',
    message: 'Operation {operation} · Actor {actor}',
  }),
  system: msg({ id: 'dashboard.recovery.system', message: 'System' }),
  immutableArtifact: msg({
    id: 'dashboard.recovery.immutableArtifact',
    message: 'Immutable artifact',
  }),
  contentHash: msg({ id: 'dashboard.recovery.contentHash', message: 'Content hash' }),
  renderer: msg({ id: 'dashboard.recovery.renderer', message: 'Renderer' }),
  brandTheme: msg({ id: 'dashboard.recovery.brandTheme', message: 'Brand theme' }),
  dialogLabel: msg({
    id: 'dashboard.recovery.dialogLabel',
    message: '{action} {environment} release',
  }),
  confirmExact: msg({
    id: 'dashboard.recovery.confirmExact',
    message: 'Confirm: {action}',
  }),
  confirmationDetails: msg({
    id: 'dashboard.recovery.confirmationDetails',
    message:
      'Environment {environment} · generation {generation} · active publication {publication}',
  }),
  priorPublication: msg({
    id: 'dashboard.recovery.priorPublication',
    message: 'Prior server-vetted publication',
  }),
  choosePublication: msg({
    id: 'dashboard.recovery.choosePublication',
    message: 'Choose a prior publication',
  }),
  unpublishDescription: msg({
    id: 'dashboard.recovery.unpublishDescription',
    message:
      'Delivery will become inactive. Immutable publications and append-only history will not be deleted.',
  }),
  reasonLabel: msg({ id: 'dashboard.recovery.reasonLabel', message: 'Reason' }),
  reasonHelp: msg({
    id: 'dashboard.recovery.reasonHelp',
    message: 'Use 1–500 characters with no outer spaces.',
  }),
  cancel: msg({ id: 'dashboard.recovery.cancel', message: 'Cancel' }),
  checking: msg({
    id: 'dashboard.recovery.checking',
    message: 'Checking exact release…',
  }),
  retryExact: msg({ id: 'dashboard.recovery.retryExact', message: 'Retry exact request' }),
  rollbackPublication: msg({
    id: 'dashboard.recovery.rollbackPublication',
    message: 'Roll back publication',
  }),
  unpublishRelease: msg({
    id: 'dashboard.recovery.unpublishRelease',
    message: 'Unpublish release',
  }),
  replayed: msg({
    id: 'dashboard.recovery.replayed',
    message: ' Exact request replayed safely.',
  }),
  rolledBack: msg({
    id: 'dashboard.recovery.rolledBack',
    message: 'Rolled back to {publication} at generation {generation}.{replay}',
  }),
  unpublishedAt: msg({
    id: 'dashboard.recovery.unpublishedAt',
    message: 'Release unpublished at generation {generation}.{replay}',
  }),
  failedAction: msg({ id: 'dashboard.recovery.failedAction', message: 'Failed {action}' }),
  published: msg({ id: 'dashboard.recovery.published', message: 'Published' }),
  promoted: msg({ id: 'dashboard.recovery.promoted', message: 'Promoted' }),
  rolledBackAction: msg({ id: 'dashboard.recovery.rolledBackAction', message: 'Rolled back' }),
  unpublished: msg({ id: 'dashboard.recovery.unpublished', message: 'Unpublished' }),
  actualGeneration: msg({
    id: 'dashboard.recovery.actualGeneration',
    message: 'Actual generation {generation}',
  }),
  expectedGeneration: msg({
    id: 'dashboard.recovery.expectedGeneration',
    message: 'Expected generation {generation}',
  }),
  requestedTarget: msg({
    id: 'dashboard.recovery.requestedTarget',
    message: 'Requested target: {target}',
  }),
  publicationTarget: msg({
    id: 'dashboard.recovery.publicationTarget',
    message: 'Publication: {publication} · target: {target}',
  }),
  previousPublication: msg({
    id: 'dashboard.recovery.previousPublication',
    message: 'Previous publication: {publication}',
  }),
  activeAtAttempt: msg({
    id: 'dashboard.recovery.activeAtAttempt',
    message: 'Active publication at attempt: {publication}',
  }),
  noActiveAtAttempt: msg({
    id: 'dashboard.recovery.noActiveAtAttempt',
    message: 'No active publication at attempt',
  }),
  publicationSource: msg({
    id: 'dashboard.recovery.publicationSource',
    message: 'Publication: {publication} · source: {source}',
  }),
  publicationIdentity: msg({
    id: 'dashboard.recovery.publicationIdentity',
    message: 'Publication: {publication}',
  }),
} as const;

export function ReleaseRecoveryPanel({
  documentId,
  documentTitle,
  environments,
  workspaceId,
}: ReleaseRecoveryPanelProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const locale = isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
  const [selectedEnvironmentId, setSelectedEnvironmentId] = React.useState(
    () => environments[0]?.id ?? '',
  );
  const [feedback, setFeedback] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<RecoveryConfirmationState | null>(null);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const restoreFocusAfterConfirmation = React.useRef(false);
  const reasonInput = React.useRef<HTMLTextAreaElement | null>(null);

  const selectedEnvironment = environments.find(
    (environment) => environment.id === selectedEnvironmentId,
  );
  const recovery = useReleaseRecovery(workspaceId, documentId, selectedEnvironmentId);
  const state = recovery.query.data ?? null;
  const mutationPending = recovery.mutation.isPending;
  const loadError = recovery.query.error ? _(COPY.historyUnavailable) : '';

  React.useEffect(() => {
    if (environments.some((environment) => environment.id === selectedEnvironmentId)) return;
    setSelectedEnvironmentId(environments[0]?.id ?? '');
  }, [environments, selectedEnvironmentId]);

  React.useEffect(() => {
    setFeedback('');
    setConfirmation(null);
  }, [selectedEnvironmentId]);

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

  const beginRecovery = (action: ReleaseRecoveryRequest['action'], trigger: HTMLElement): void => {
    if (!state || state.deployment?.state !== 'active' || !selectedEnvironment) return;
    const permission =
      action === 'rollback' ? state.permissions.rollback : state.permissions.unpublish;
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
    void recovery.mutation
      .mutateAsync({
        environmentId: confirmation.environmentId,
        request,
      })
      .then((result) => {
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
          return;
        }

        setFeedback(recoveryResultMessage(result.result, _));
        closeConfirmation();
      })
      .catch(() => {
        setFeedback(_(COPY.requestFailed));
        closeConfirmation();
      });
  };

  if (!environments.length) {
    return (
      <section className="mt-4 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">{_(COPY.noEnvironments)}</p>
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
      aria-label={_({ ...COPY.regionLabel, values: { document: documentTitle } })}
      className="mt-4 rounded-lg border border-border bg-[var(--surface-subtle)] p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">{_(COPY.title)}</h3>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{_(COPY.description)}</p>
        </div>
        <Button
          className="h-9 shrink-0"
          disabled={recovery.query.isFetching || !selectedEnvironmentId}
          onClick={() => void recovery.query.refetch()}
          type="button"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {_(COPY.refresh)}
        </Button>
      </div>

      <div aria-label={_(COPY.environment)} className="mt-4 flex flex-wrap gap-2" role="tablist">
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
            {!environment.enabled ? <Badge variant="outline">{_(COPY.disabled)}</Badge> : null}
          </Button>
        ))}
      </div>

      <div
        aria-live="polite"
        className="mt-4 grid gap-4"
        id={`release-recovery-${documentId}-${selectedEnvironmentId}`}
        role="tabpanel"
      >
        {recovery.query.isFetching ? (
          <p className="text-sm text-muted-foreground">{_(COPY.loading)}</p>
        ) : null}
        {loadError ? (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
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
                {_(COPY.rollbackEllipsis)}
              </Button>
              <Button
                disabled={!canUnpublish || mutationPending}
                onClick={(event) => beginRecovery('unpublish', event.currentTarget)}
                type="button"
                variant="outline"
              >
                <Ban aria-hidden="true" className="size-4" />
                {_(COPY.unpublishEllipsis)}
              </Button>
            </div>
            {!selectedState.permissions.rollback && !selectedState.permissions.unpublish ? (
              <p className="text-xs text-muted-foreground">{_(COPY.notAllowed)}</p>
            ) : null}
            <ReleaseHistoryList entries={selectedState.history} locale={locale} />
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
  const { _ } = useLingui();
  const deployment = state.deployment;
  if (!deployment) {
    return (
      <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
        {_(COPY.noDeployment)}
      </p>
    );
  }
  if (deployment.state === 'inactive') {
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{_(COPY.inactive)}</Badge>
          <span className="text-sm font-semibold">
            {_({ ...COPY.generation, values: { generation: deployment.generation } })}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{_(COPY.inactiveDescription)}</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{_(COPY.active)}</Badge>
        <span className="text-sm font-semibold">
          {_({ ...COPY.generation, values: { generation: deployment.generation } })}
        </span>
      </div>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {_({
          ...COPY.activePublication,
          values: { publication: deployment.activePublicationId },
        })}
      </p>
      {deployment.pendingReleaseOperationId ? (
        <p className="mt-1 break-all text-xs text-destructive">
          {_({
            ...COPY.pendingOperation,
            values: { operation: deployment.pendingReleaseOperationId },
          })}
        </p>
      ) : null}
    </div>
  );
}

function ReleaseHistoryList({
  entries,
  locale,
}: {
  entries: ReleaseHistoryEntry[];
  locale: string;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <div className="grid gap-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{_(COPY.completeHistory)}</h4>
        <Badge variant="outline">{entries.length}</Badge>
      </div>
      {entries.length ? (
        <ol className="grid gap-2">
          {entries.map((entry) => (
            <ReleaseHistoryRow entry={entry} key={entry.id} locale={locale} />
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          {_(COPY.noOperations)}
        </p>
      )}
    </div>
  );
}

function ReleaseHistoryRow({
  entry,
  locale,
}: {
  entry: ReleaseHistoryEntry;
  locale: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const artifact = historyArtifact(entry);
  return (
    <li className="grid gap-2 rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={entry.state === 'failed' ? 'destructive' : 'outline'}>
            {historyActionLabel(entry, _)}
          </Badge>
          <span className="text-xs font-semibold">{historyGenerationLabel(entry, _)}</span>
        </div>
        <time className="text-xs text-muted-foreground" dateTime={entry.occurredAt}>
          {formatTimestamp(entry.occurredAt, locale)}
        </time>
      </div>
      <p className="break-all text-xs text-muted-foreground">{historyIdentityLabel(entry, _)}</p>
      {'reason' in entry ? (
        <p className="text-xs leading-5">
          {_({ ...COPY.reason, values: { reason: entry.reason } })}
        </p>
      ) : null}
      {entry.state === 'failed' ? (
        <p className="text-xs text-destructive">
          {_(dashboardRecoveryFailureMessage(entry.failure.code))}
        </p>
      ) : null}
      {artifact ? <ArtifactPinsSummary artifact={artifact} /> : null}
      <p className="break-all text-[11px] text-muted-foreground">
        {_({
          ...COPY.operationActor,
          values: {
            operation: entry.releaseOperationId,
            actor: entry.actorUserId ?? _(COPY.system),
          },
        })}
      </p>
    </li>
  );
}

function ArtifactPinsSummary({ artifact }: { artifact: ReleaseArtifactPins }): React.ReactElement {
  const { _ } = useLingui();
  return (
    <dl className="grid gap-1 rounded-md bg-[var(--surface-subtle)] p-2 text-[11px] text-muted-foreground sm:grid-cols-2">
      <div>
        <dt className="font-semibold">{_(COPY.immutableArtifact)}</dt>
        <dd className="break-all">{artifact.compiledArtifactId}</dd>
      </div>
      <div>
        <dt className="font-semibold">{_(COPY.contentHash)}</dt>
        <dd className="break-all">{artifact.contentHash}</dd>
      </div>
      <div>
        <dt className="font-semibold">{_(COPY.renderer)}</dt>
        <dd>{artifact.rendererContractVersion}</dd>
      </div>
      <div>
        <dt className="font-semibold">{_(COPY.brandTheme)}</dt>
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
  const { _ } = useLingui();
  const inputsLocked = pending || confirmation.submitted;
  const actionLabel = _(RECOVERY_ACTION_LABELS[confirmation.action]);
  return (
    <div
      aria-label={_({
        ...COPY.dialogLabel,
        values: { action: actionLabel, environment: confirmation.environmentName },
      })}
      aria-modal="false"
      className="mt-4 grid gap-4 rounded-lg border border-destructive/30 bg-background p-4 shadow-sm"
      role="dialog"
    >
      <div className="grid gap-1">
        <h4 className="font-semibold">
          {_({ ...COPY.confirmExact, values: { action: actionLabel } })}
        </h4>
        <p className="text-xs leading-5 text-muted-foreground">
          {_({
            ...COPY.confirmationDetails,
            values: {
              environment: confirmation.environmentName,
              generation: confirmation.expectedGeneration,
              publication: confirmation.expectedActivePublicationId,
            },
          })}
        </p>
      </div>
      {confirmation.action === 'rollback' ? (
        <div className="grid gap-1.5 text-xs font-medium">
          <span>{_(COPY.priorPublication)}</span>
          <Select
            disabled={inputsLocked}
            onValueChange={(value) =>
              setConfirmation((current) =>
                current
                  ? { ...current, targetPublicationId: value === 'none' ? '' : value }
                  : current,
              )
            }
            value={confirmation.targetPublicationId || 'none'}
          >
            <SelectTrigger aria-label={_(COPY.priorPublication)} className="h-10">
              <SelectValue placeholder={_(COPY.choosePublication)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{_(COPY.choosePublication)}</SelectItem>
              {confirmation.rollbackTargetPublicationIds.map((publicationId) => (
                <SelectItem key={publicationId} value={publicationId}>
                  {publicationId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="rounded-md border border-border bg-[var(--surface-subtle)] p-3 text-xs leading-5 text-muted-foreground">
          {_(COPY.unpublishDescription)}
        </p>
      )}
      <label className="grid gap-1.5 text-xs font-medium">
        {_(COPY.reasonLabel)}
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
        <span className="text-muted-foreground">{_(COPY.reasonHelp)}</span>
      </label>
      {confirmation.error ? (
        <p className="text-sm text-destructive" role="alert">
          {confirmation.error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} onClick={onCancel} type="button" variant="ghost">
          {_(COPY.cancel)}
        </Button>
        <Button
          disabled={!confirmationIsValid(confirmation) || pending}
          onClick={onSubmit}
          type="button"
          variant="destructive"
        >
          {recoverySubmitLabel(confirmation, pending, _)}
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
  translate: Translate,
): string {
  if (pending) return translate(COPY.checking);
  if (confirmation.submitted) return translate(COPY.retryExact);
  return confirmation.action === 'rollback'
    ? translate(COPY.rollbackPublication)
    : translate(COPY.unpublishRelease);
}

function recoveryResultMessage(result: ReleaseRecoveryResult, translate: Translate): string {
  if (!result.ok) return translate(dashboardRecoveryFailureMessage(result.code));
  const replay = result.replayed ? translate(COPY.replayed) : '';
  if (result.action === 'rollback') {
    return translate({
      ...COPY.rolledBack,
      values: {
        publication: result.targetPublicationId,
        generation: result.generation,
        replay,
      },
    });
  }
  return translate({
    ...COPY.unpublishedAt,
    values: { generation: result.generation, replay },
  });
}

function historyActionLabel(entry: ReleaseHistoryEntry, translate: Translate): string {
  if (entry.state === 'failed') {
    const descriptor = RECOVERY_ACTION_LABELS[entry.action];
    return translate({ ...COPY.failedAction, values: { action: translate(descriptor) } });
  }
  if (entry.action === 'publish') return translate(COPY.published);
  if (entry.action === 'promote') return translate(COPY.promoted);
  if (entry.action === 'rollback') return translate(COPY.rolledBackAction);
  return translate(COPY.unpublished);
}

function historyGenerationLabel(entry: ReleaseHistoryEntry, translate: Translate): string {
  if ('generation' in entry) {
    return translate({ ...COPY.generation, values: { generation: entry.generation } });
  }
  if (entry.actualGeneration !== undefined) {
    return translate({
      ...COPY.actualGeneration,
      values: { generation: entry.actualGeneration },
    });
  }
  return translate({
    ...COPY.expectedGeneration,
    values: { generation: entry.expectedGeneration },
  });
}

function historyIdentityLabel(entry: ReleaseHistoryEntry, translate: Translate): string {
  if (entry.action === 'rollback') {
    return entry.state === 'failed'
      ? translate({ ...COPY.requestedTarget, values: { target: entry.targetPublicationId } })
      : translate({
          ...COPY.publicationTarget,
          values: { publication: entry.publicationId, target: entry.targetPublicationId },
        });
  }
  if (entry.action === 'unpublish') {
    if (entry.state !== 'failed') {
      return translate({
        ...COPY.previousPublication,
        values: { publication: entry.previousPublicationId },
      });
    }
    return entry.actualActivePublicationId
      ? translate({
          ...COPY.activeAtAttempt,
          values: { publication: entry.actualActivePublicationId },
        })
      : translate(COPY.noActiveAtAttempt);
  }
  if (entry.action === 'promote') {
    return translate({
      ...COPY.publicationSource,
      values: { publication: entry.publicationId, source: entry.sourcePublicationId },
    });
  }
  return translate({ ...COPY.publicationIdentity, values: { publication: entry.publicationId } });
}

function historyArtifact(entry: ReleaseHistoryEntry): ReleaseArtifactPins | null {
  if ('artifact' in entry) return entry.artifact;
  if ('deactivatedArtifact' in entry) return entry.deactivatedArtifact;
  return null;
}

function formatTimestamp(value: string, locale: string): string {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString(locale) : value;
}
