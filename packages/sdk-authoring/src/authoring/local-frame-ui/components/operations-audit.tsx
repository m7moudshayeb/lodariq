import type { AuthoringAuditEvent, TenantAuditEventType } from '@lodariq/schema';
import { useEffect, useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { Download, History } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';

const PAGE_SIZE = 50;

const AUDIT_EVENT_LABELS: Record<TenantAuditEventType, string> = {
  invitation_created: authoringText('Invitation created'),
  invitation_revoked: authoringText('Invitation revoked'),
  invitation_accepted: authoringText('Invitation accepted'),
  membership_role_changed: authoringText('Member role changed'),
  membership_removed: authoringText('Member removed'),
  ownership_transferred: authoringText('Ownership transferred'),
  workspace_deletion_scheduled: authoringText('Workspace deletion scheduled'),
  workspace_deletion_cancelled: authoringText('Workspace deletion cancelled'),
  capability_profile_created: authoringText('Capability profile created'),
  capability_profile_updated: authoringText('Capability profile updated'),
  capability_profile_deleted: authoringText('Capability profile deleted'),
  capability_profile_assigned: authoringText('Capability profile assigned'),
  capability_profile_unassigned: authoringText('Capability profile unassigned'),
  webhook_endpoint_created: authoringText('Webhook endpoint created'),
  webhook_endpoint_disabled: authoringText('Webhook endpoint disabled'),
  webhook_endpoint_secret_rotated: authoringText('Webhook endpoint secret rotated'),
  webhook_delivery_replayed: authoringText('Webhook delivery replayed'),
  residency_migration_requested: authoringText('Residency migration requested'),
  residency_migration_transitioned: authoringText('Residency migration updated'),
};

export function OperationsAudit({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const events = snapshot.auditEvents ?? [];
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [events]);
  const visibleEvents = events.slice(0, visibleCount);

  return (
    <section className="operations-audit" aria-label={authoringText('Audit log')}>
      <div className="ops-box">
        <h3>
          <History size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Workspace changes')}
          <span className="ops-box-actions">
            <button
              className="ops-btn"
              data-size="sm"
              disabled={!snapshot.auditExportAvailable}
              onClick={() => controller.exportAuditCsv()}
              type="button"
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              {authoringText('Export CSV')}
            </button>
          </span>
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'Membership, invitations, ownership, and workspace deletion changes are retained here.',
          )}
        </p>
        {events.length ? (
          <div className="operations-audit-table">
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">{authoringText('When')}</th>
                  <th scope="col">{authoringText('Change')}</th>
                  <th scope="col">{authoringText('Actor')}</th>
                  <th scope="col">{authoringText('Details')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((event) => (
                  <AuditRow event={event} key={event.id} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ops-box-body" role="status">
            {snapshot.operationsUnavailable
              ? authoringText('Audit data is unavailable right now.')
              : authoringText('No workspace changes have been recorded yet.')}
          </p>
        )}
        {visibleCount < events.length ? (
          <button
            className="ops-btn operations-audit-more"
            data-size="sm"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            type="button"
          >
            {authoringText('Show older')}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AuditRow({ event }: { event: AuthoringAuditEvent }): ReactNode {
  const details = auditDetails(event);
  return (
    <tr>
      <td>
        <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
      </td>
      <td className="ops-table-key">{AUDIT_EVENT_LABELS[event.eventType]}</td>
      <td>{event.actorName ?? event.actorUserId}</td>
      <td>{details || '—'}</td>
    </tr>
  );
}

function auditDetails(event: AuthoringAuditEvent): string {
  const target = event.targetName ?? event.targetUserId;
  const role =
    event.previousRole && event.nextRole
      ? authoringText('{previous} → {next}', {
          previous: event.previousRole,
          next: event.nextRole,
        })
      : event.nextRole;
  return [target, role, event.environmentId, event.resourceId].filter(Boolean).join(' · ');
}
