import { authoringText } from '../../../i18n';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ReleaseRecoveryRequest } from '@lodariq/schema';
import {
  authoringReleaseRecoveryReasonFailure,
  createAuthoringReleaseRecoveryIntent,
  prepareAuthoringReleaseRecoveryRequest,
  type AuthoringRollbackTarget,
  type AuthoringReleaseHistoryItem,
  type AuthoringReleaseRecoveryIntent,
  type AuthoringReleaseRecoveryPreparationFailure,
  type AuthoringReleaseRecoveryRequestIdentity,
  type AuthoringReleaseRecoveryViewModel,
} from '../../release-recovery-model';
import { AuthoringButton } from '../design-system';
import { useOptionalPanelModeStyles } from '../optional-panel-styles';

const PREPARATION_FAILURE_MESSAGES: Record<AuthoringReleaseRecoveryPreparationFailure, string> = {
  reason_required: authoringText('Enter a reason for this recovery action.'),
  reason_not_trimmed: authoringText('Remove leading or trailing whitespace from the reason.'),
  reason_too_long: authoringText('Keep the reason to 500 characters or fewer.'),
  rollback_target_required: authoringText('Select one exact prior publication.'),
  rollback_target_invalid: authoringText('Select a prior publication from this release history.'),
  idempotency_key_invalid: authoringText(
    'This recovery confirmation is missing a valid request identity.',
  ),
  correlation_id_invalid: authoringText(
    'This recovery confirmation is missing a valid correlation identity.',
  ),
};

export interface ReleaseHistoryPanelProps {
  model: AuthoringReleaseRecoveryViewModel;
  onStartRecovery: (intent: AuthoringReleaseRecoveryIntent) => void;
}

/** Contextual, append-only history; recovery starts from server-issued publication IDs only. */
export function ReleaseHistoryPanelImplementation({
  model,
  onStartRecovery,
}: ReleaseHistoryPanelProps) {
  useOptionalPanelModeStyles();
  const titleId = useId();
  const rollbackIntent = createAuthoringReleaseRecoveryIntent(model, 'rollback');
  const unpublishIntent = createAuthoringReleaseRecoveryIntent(model, 'unpublish');

  return (
    <section className="panel-mode-section release-history-panel" aria-labelledby={titleId}>
      <div className="panel-mode-section-heading">
        <span>
          <small>{authoringText('Immutable release truth')}</small>
          <strong id={titleId}>{authoringText('Release history')}</strong>
        </span>
      </div>

      <p className="panel-mode-help" role="status">
        {deploymentSummary(model)}
      </p>

      {model.historyItems.length > 0 ? (
        <ol className="release-history-list" aria-label={authoringText('Release history')}>
          {model.historyItems.map((item, index) => (
            <ReleaseHistoryRow item={item} key={item.id} labelId={`${titleId}-${index}`} />
          ))}
        </ol>
      ) : (
        <p className="panel-mode-inline-note">
          {authoringText('No release history is available for this document.')}
        </p>
      )}

      <div
        className="panel-mode-primary-actions"
        aria-label={authoringText('Release recovery actions')}
      >
        <AuthoringButton
          data-panel-entry="release-recovery-rollback"
          disabled={!rollbackIntent}
          onClick={() => startRecovery(rollbackIntent, onStartRecovery)}
        >
          {authoringText('Roll back…')}
        </AuthoringButton>
        <AuthoringButton
          data-panel-entry="release-recovery-unpublish"
          disabled={!unpublishIntent}
          onClick={() => startRecovery(unpublishIntent, onStartRecovery)}
          tone="danger"
        >
          {authoringText('Unpublish…')}
        </AuthoringButton>
      </div>
      {!model.canRollback && model.guard ? (
        <small>
          {authoringText(
            'No compatible earlier successful publication is available to roll back to.',
          )}
        </small>
      ) : null}
    </section>
  );
}

export interface ReleaseRecoveryConfirmationProps {
  intent: AuthoringReleaseRecoveryIntent;
  requestIdentity: AuthoringReleaseRecoveryRequestIdentity;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (request: ReleaseRecoveryRequest) => void | Promise<void>;
}

export type ReleaseRecoveryComponentProps =
  | { component: 'history'; props: ReleaseHistoryPanelProps }
  | { component: 'confirmation'; props: ReleaseRecoveryConfirmationProps };

export function ReleaseRecoveryComponentImplementation(input: ReleaseRecoveryComponentProps) {
  return input.component === 'history' ? (
    <ReleaseHistoryPanelImplementation {...input.props} />
  ) : (
    <ReleaseRecoveryConfirmationImplementation {...input.props} />
  );
}

/**
 * A modeless in-panel confirmation. It submits only an existing rollback or
 * unpublish request and has no artifact compilation or publication callback.
 */
export function ReleaseRecoveryConfirmationImplementation({
  intent,
  requestIdentity,
  pending = false,
  error = null,
  onCancel,
  onConfirm,
}: ReleaseRecoveryConfirmationProps) {
  useOptionalPanelModeStyles();
  const titleId = useId();
  const detailId = useId();
  const targetId = useId();
  const targetErrorId = useId();
  const reasonId = useId();
  const reasonHelpId = useId();
  const formErrorId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [reason, setReason] = useState('');
  const [targetPublicationId, setTargetPublicationId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setReason('');
    setTargetPublicationId('');
    setSubmitted(false);
  }, [intent.confirmationKey]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [intent.confirmationKey]);

  const preparation = prepareAuthoringReleaseRecoveryRequest(intent, {
    reason,
    identity: requestIdentity,
    ...(intent.action === 'rollback' ? { targetPublicationId } : {}),
  });
  const reasonFailure = authoringReleaseRecoveryReasonFailure(reason);
  const targetFailure = rollbackTargetFailure(intent, targetPublicationId);
  const configurationFailure = preparation.ok ? null : requestIdentityFailure(preparation.code);
  const canConfirm = preparation.ok && !pending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSubmitted(true);
    if (!preparation.ok || pending) return;
    void onConfirm(preparation.request);
  };

  return (
    <section
      ref={dialogRef}
      aria-describedby={detailId}
      aria-labelledby={titleId}
      aria-modal="false"
      className="panel-mode-section release-recovery-confirmation"
      role="dialog"
      tabIndex={-1}
    >
      <div className="panel-mode-section-heading">
        <span>
          <small>{authoringText('Confirm release recovery')}</small>
          <strong id={titleId}>{confirmationTitle(intent)}</strong>
        </span>
      </div>
      <p className="panel-mode-help" id={detailId}>
        {confirmationDetail(intent)}
      </p>

      <form aria-busy={pending} onSubmit={handleSubmit}>
        {intent.action === 'rollback' ? (
          <label className="panel-mode-field" htmlFor={targetId}>
            <span>{authoringText('Exact prior publication')}</span>
            <select
              aria-describedby={submitted && targetFailure ? targetErrorId : undefined}
              aria-invalid={submitted && Boolean(targetFailure)}
              aria-required="true"
              disabled={pending}
              id={targetId}
              onChange={(event) => setTargetPublicationId(event.currentTarget.value)}
              required
              value={targetPublicationId}
            >
              <option value="">{authoringText('Select a prior publication')}</option>
              {intent.targets.map((target) => (
                <option key={target.publicationId} value={target.publicationId}>
                  {rollbackTargetLabel(target)}
                </option>
              ))}
            </select>
            {submitted && targetFailure ? (
              <small id={targetErrorId}>{PREPARATION_FAILURE_MESSAGES[targetFailure]}</small>
            ) : null}
          </label>
        ) : null}

        <label className="panel-mode-field" htmlFor={reasonId}>
          <span>{authoringText('Reason')}</span>
          <textarea
            aria-describedby={`${reasonHelpId}${submitted && reasonFailure ? ` ${formErrorId}` : ''}`}
            aria-invalid={submitted && Boolean(reasonFailure)}
            disabled={pending}
            id={reasonId}
            maxLength={500}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setReason(event.currentTarget.value)
            }
            required
            rows={4}
            value={reason}
          />
          <small id={reasonHelpId}>
            {authoringText(
              'Required, 500 characters or fewer, with no leading or trailing whitespace.',
            )}
          </small>
        </label>

        <dl
          aria-label={authoringText('Recovery compare-and-swap guard')}
          className="release-recovery-guard"
        >
          <div>
            <dt>{authoringText('Expected generation')}</dt>
            <dd>{intent.guard.expectedGeneration}</dd>
          </div>
          <div>
            <dt>{authoringText('Expected active publication')}</dt>
            <dd>{intent.guard.expectedActivePublicationId}</dd>
          </div>
        </dl>

        {submitted && reasonFailure ? (
          <p id={formErrorId} role="alert">
            {PREPARATION_FAILURE_MESSAGES[reasonFailure]}
          </p>
        ) : null}
        {configurationFailure ? <p role="alert">{configurationFailure}</p> : null}
        {error ? <p role="alert">{error}</p> : null}

        <div className="panel-mode-primary-actions">
          <AuthoringButton disabled={pending} onClick={onCancel}>
            {authoringText('Cancel')}
          </AuthoringButton>
          <AuthoringButton disabled={!canConfirm} tone="danger" type="submit">
            {pending ? pendingLabel(intent) : confirmLabel(intent)}
          </AuthoringButton>
        </div>
      </form>
    </section>
  );
}

function ReleaseHistoryRow({
  item,
  labelId,
}: {
  item: AuthoringReleaseHistoryItem;
  labelId: string;
}) {
  return (
    <li className={`release-history-item ${item.state}`} data-current={item.isCurrent || undefined}>
      <article aria-labelledby={labelId}>
        <header>
          <strong id={labelId}>{item.actionLabel}</strong>
          <span>{item.stateLabel}</span>
          {item.isCurrent ? <span>{authoringText('Current publication')}</span> : null}
          {item.rollbackAvailability === 'available' ? (
            <span>{authoringText('Rollback available')}</span>
          ) : null}
          {item.rollbackAvailability === 'unavailable' ? (
            <span>{authoringText('Rollback unavailable')}</span>
          ) : null}
        </header>
        <p>{item.summary}</p>
        <dl>
          <div>
            <dt>{authoringText('Generation')}</dt>
            <dd>{item.generation}</dd>
          </div>
          <div>
            <dt>{authoringText('Occurred')}</dt>
            <dd>
              <time dateTime={item.occurredAt}>{item.occurredAt}</time>
            </dd>
          </div>
          <div>
            <dt>{authoringText('Actor')}</dt>
            <dd>{item.actorUserId ?? authoringText('System')}</dd>
          </div>
          {item.artifact ? (
            <div>
              <dt>{authoringText('Immutable artifact')}</dt>
              <dd>{item.artifact.compiledArtifactId}</dd>
            </div>
          ) : null}
          {item.reason ? (
            <div>
              <dt>{authoringText('Reason')}</dt>
              <dd>{item.reason}</dd>
            </div>
          ) : null}
          {item.failureMessage ? (
            <div>
              <dt>{authoringText('Failure')}</dt>
              <dd>{item.failureMessage}</dd>
            </div>
          ) : null}
        </dl>
      </article>
    </li>
  );
}

function deploymentSummary(model: AuthoringReleaseRecoveryViewModel): string {
  if (model.deploymentState === 'active') {
    return authoringText('Active publication {publication} at generation {generation}.', {
      publication: model.activePublicationId ?? '',
      generation: model.deploymentGeneration ?? '',
    });
  }
  if (model.deploymentState === 'inactive') {
    return authoringText('Delivery is inactive at generation {generation}.', {
      generation: model.deploymentGeneration ?? '',
    });
  }
  return authoringText('Release deployment state is unavailable for this document.');
}

function startRecovery(
  intent: AuthoringReleaseRecoveryIntent | null,
  onStartRecovery: ReleaseHistoryPanelProps['onStartRecovery'],
): void {
  if (intent) onStartRecovery(intent);
}

function rollbackTargetFailure(
  intent: AuthoringReleaseRecoveryIntent,
  targetPublicationId: string,
): Extract<
  AuthoringReleaseRecoveryPreparationFailure,
  'rollback_target_required' | 'rollback_target_invalid'
> | null {
  if (intent.action !== 'rollback') return null;
  if (!targetPublicationId) return 'rollback_target_required';
  if (!intent.targets.some((target) => target.publicationId === targetPublicationId)) {
    return 'rollback_target_invalid';
  }
  return null;
}

function requestIdentityFailure(
  failure: AuthoringReleaseRecoveryPreparationFailure,
): string | null {
  if (failure !== 'idempotency_key_invalid' && failure !== 'correlation_id_invalid') return null;
  return PREPARATION_FAILURE_MESSAGES[failure];
}

function confirmationTitle(intent: AuthoringReleaseRecoveryIntent): string {
  return intent.action === 'rollback'
    ? authoringText('Roll back this release?')
    : authoringText('Unpublish this release?');
}

function confirmationDetail(intent: AuthoringReleaseRecoveryIntent): string {
  if (intent.action === 'rollback') {
    return authoringText(
      'Select one exact prior successful publication. Lodariq will reuse its immutable artifact and advance only the active release pointer.',
    );
  }
  return authoringText(
    'Delivery will become inactive. Immutable publications and append-only release history remain available.',
  );
}

function rollbackTargetLabel(target: AuthoringRollbackTarget): string {
  return authoringText('{publication} · generation {generation} · {action}', {
    publication: target.publicationId,
    generation: target.generation,
    action: target.actionLabel,
  });
}

function confirmLabel(intent: AuthoringReleaseRecoveryIntent): string {
  return intent.action === 'rollback'
    ? authoringText('Roll back publication')
    : authoringText('Unpublish release');
}

function pendingLabel(intent: AuthoringReleaseRecoveryIntent): string {
  return intent.action === 'rollback'
    ? authoringText('Rolling back…')
    : authoringText('Unpublishing…');
}
