import {
  applyGovernanceChangeHistoryQuery,
  governanceChangeEvent,
  type ListGovernanceChangeHistoryInput,
} from '../domains/governance-change-history';
import { InMemoryRepositoryAnalyticsWarehouse } from './analytics-warehouse';

export class InMemoryRepositoryGovernanceChangeHistory extends InMemoryRepositoryAnalyticsWarehouse {
  async listGovernanceChangeHistory(input: ListGovernanceChangeHistoryInput) {
    const events = [
      ...[...this.documentVersions.values()].flat().flatMap((version) =>
        version.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'document-version',
                sourceId: version.id,
                category: 'document',
                action: 'document.version_saved',
                actorUserId: version.createdByUserId,
                documentId: version.documentId,
                resourceId: version.id,
                occurredAt: version.createdAt,
                details: { version: version.version },
              }),
            ]
          : [],
      ),
      ...[...this.experienceCommentAuditEvents.values()].flatMap((event) =>
        event.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'review',
                sourceId: event.id,
                category: 'review',
                action: `review.${event.eventType}`,
                actorUserId: event.actorUserId,
                documentId: event.documentId,
                resourceId: event.threadId,
                occurredAt: event.occurredAt,
                details: { commentId: event.commentId },
              }),
            ]
          : [],
      ),
      ...[...this.releaseOperations.values()].flatMap((operation) =>
        operation.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'release-operation',
                sourceId: operation.id,
                category: 'release',
                action: `release.${operation.action}.${operation.status}`,
                actorUserId: operation.requestedByUserId,
                documentId: operation.documentId,
                environmentId: operation.environmentId,
                resourceId: operation.id,
                occurredAt: operation.completedAt ?? operation.createdAt,
                details: {
                  expectedGeneration: operation.expectedGeneration,
                  resultGeneration: operation.resultGeneration,
                  resultPublicationId: operation.resultPublicationId,
                  errorCode: operation.errorCode,
                },
              }),
            ]
          : [],
      ),
      ...[...this.publications.values()].flat().flatMap((publication) =>
        publication.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'publication',
                sourceId: publication.id,
                category: 'release',
                action: `publication.${publication.action ?? 'publish'}`,
                actorUserId: publication.publishedByUserId,
                documentId: publication.documentId,
                environmentId: publication.environmentId,
                resourceId: publication.id,
                occurredAt: publication.publishedAt,
                details: {
                  contentHash: publication.contentHash,
                  previousPublicationId: publication.previousPublicationId,
                  sourcePublicationId: publication.sourcePublicationId,
                },
              }),
            ]
          : [],
      ),
      ...[...this.releaseApprovals.values()].flat().flatMap((approval) =>
        approval.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'approval',
                sourceId: approval.id,
                category: 'review',
                action: `release.approval_${approval.decision}`,
                actorUserId: approval.decidedByUserId,
                resourceId: approval.releaseOperationId,
                occurredAt: approval.createdAt,
                details: { decision: approval.decision },
              }),
            ]
          : [],
      ),
      ...[...this.publicationVerifications.values()].flat().flatMap((verification) =>
        verification.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'verification',
                sourceId: verification.id,
                category: 'review',
                action: `release.verification_${verification.result}`,
                actorUserId: verification.verifiedByUserId,
                documentId: verification.documentId,
                environmentId: verification.environmentId,
                resourceId: verification.publicationId,
                occurredAt: verification.createdAt,
                details: { result: verification.result },
              }),
            ]
          : [],
      ),
      ...[...this.documentDeployments.values()].flatMap((deployment) =>
        deployment.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'deployment',
                sourceId: `${deployment.environmentId}:${deployment.documentId}:${deployment.generation}`,
                category: 'deployment',
                action: 'deployment.pointer_state',
                documentId: deployment.documentId,
                environmentId: deployment.environmentId,
                resourceId: deployment.activePublicationId ?? deployment.documentId,
                occurredAt: deployment.updatedAt,
                details: {
                  state: deployment.state,
                  generation: deployment.generation,
                  activePublicationId: deployment.activePublicationId,
                  pendingReleaseOperationId: deployment.pendingReleaseOperationId ?? null,
                },
              }),
            ]
          : [],
      ),
      /*
       * One map here, two tables in drizzle. Change history labels the event by
       * the table it came from, so the split has to be reproduced or a source
       * assertion passes in a unit test and is wrong against Postgres.
       */
      ...[...this.tenantAuditEvents.values()].flatMap((event) => {
        if (event.workspaceId !== input.workspaceId) return [];
        return this.platformGovernanceAuditEventIds.has(event.id)
          ? [
              governanceChangeEvent({
                source: 'platform-governance',
                sourceId: event.id,
                category: 'governance',
                action: `governance.${event.eventType}`,
                actorUserId: event.actorUserId,
                environmentId: event.environmentId,
                resourceId: event.resourceId ?? event.targetUserId ?? event.id,
                occurredAt: event.occurredAt,
                details: { eventType: event.eventType, targetUserId: event.targetUserId },
              }),
            ]
          : [
              governanceChangeEvent({
                source: 'tenant-governance',
                sourceId: event.id,
                category: 'governance',
                action: `governance.${event.eventType}`,
                actorUserId: event.actorUserId,
                environmentId: event.environmentId,
                resourceId:
                  event.resourceId ?? event.targetUserId ?? event.invitationId ?? event.id,
                occurredAt: event.occurredAt,
                details: {
                  eventType: event.eventType,
                  targetUserId: event.targetUserId,
                  previousRole: event.previousRole,
                  nextRole: event.nextRole,
                },
              }),
            ];
      }),
      /*
       * Residency was written but never read back: the drizzle reader has this
       * source and the in-memory one did not, so a change-history assertion
       * could pass in a unit test and be wrong against Postgres.
       */
      ...[...this.dataResidencyMigrationHistory.values()].flatMap((entry) =>
        entry.workspaceId === input.workspaceId
          ? [
              governanceChangeEvent({
                source: 'residency',
                sourceId: entry.id,
                category: 'governance',
                action: `governance.residency_${entry.nextStatus}`,
                actorUserId: entry.actorId.startsWith('system:') ? null : entry.actorId,
                resourceId: entry.migrationId,
                occurredAt: entry.occurredAt,
                details: {
                  previousStatus: entry.previousStatus,
                  nextStatus: entry.nextStatus,
                  failureCode: entry.failureCode,
                },
              }),
            ]
          : [],
      ),
      ...this.accessibilityFindingEvents.flatMap((event) => {
        if (event.workspaceId !== input.workspaceId) return [];
        const finding = this.accessibilityFindings.get(
          this.key(event.workspaceId, event.findingId),
        );
        if (!finding) return [];
        return [
          governanceChangeEvent({
            source: 'accessibility',
            sourceId: event.id,
            category: 'governance',
            action: `governance.accessibility_${event.eventType}`,
            actorUserId: event.actorUserId,
            documentId: finding.documentId,
            resourceId: event.findingId,
            occurredAt: event.occurredAt,
            details: {
              findingRevision: event.findingRevision,
              code: finding.code,
              severity: finding.severity,
            },
          }),
        ];
      }),
    ];
    return applyGovernanceChangeHistoryQuery(events, input.query);
  }
}
