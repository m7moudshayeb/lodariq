import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  applyGovernanceChangeHistoryQuery,
  governanceChangeEvent,
  type ListGovernanceChangeHistoryInput,
} from '../domains/governance-change-history';
import {
  accessibilityFindingEvents,
  accessibilityFindings,
  dataResidencyMigrationHistory,
  documentDeployments,
  documentVersions,
  experienceCommentAuditEvents,
  governanceAuditEvents,
  publicationVerifications,
  publications,
  releaseApprovals,
  releaseOperations,
  tenantAuditEvents,
} from '../schema';
import { DrizzleRepositoryAnalyticsWarehouse } from './analytics-warehouse';
import { toIsoString } from './helpers';

const SOURCE_QUERY_LIMIT = 10_000;

/**
 * The requested window, as SQL predicates. The merge already applies these in
 * JavaScript; applying them here too means the rows never leave Postgres.
 */
function occurredWithin(
  column: AnyPgColumn,
  query: { from?: string; to?: string },
): ReturnType<typeof gte>[] {
  const bounds: ReturnType<typeof gte>[] = [];
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if (from && Number.isFinite(from.getTime())) bounds.push(gte(column, from));
  if (to && Number.isFinite(to.getTime())) bounds.push(lte(column, to));
  return bounds;
}

export class DrizzleRepositoryGovernanceChangeHistory extends DrizzleRepositoryAnalyticsWarehouse {
  async listGovernanceChangeHistory(input: ListGovernanceChangeHistoryInput) {
    return this.scoped(input.workspaceId, async (tx) => {
      const [
        versionRows,
        commentRows,
        operationRows,
        publicationRows,
        approvalRows,
        verificationRows,
        deploymentRows,
        tenantRows,
        governanceRows,
        residencyRows,
        accessibilityRows,
      ] = await Promise.all([
        /*
         * A projection, and the time window pushed into SQL. `canonical` is the
         * whole authored document as jsonb; selecting it for 10,000 versions to
         * read an id, a document id, an author, a timestamp and a version
         * number moved gigabytes per request — and `?documentId=X&limit=1` paid
         * exactly the same cost, because the filtering happens after the fetch.
         */
        tx
          .select({
            id: documentVersions.id,
            documentId: documentVersions.documentId,
            createdByUserId: documentVersions.createdByUserId,
            createdAt: documentVersions.createdAt,
            version: documentVersions.version,
          })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.workspaceId, input.workspaceId),
              ...(input.query.documentId
                ? [eq(documentVersions.documentId, input.query.documentId)]
                : []),
              ...occurredWithin(documentVersions.createdAt, input.query),
            ),
          )
          .orderBy(desc(documentVersions.createdAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(experienceCommentAuditEvents)
          .where(
            and(
              eq(experienceCommentAuditEvents.workspaceId, input.workspaceId),
              ...occurredWithin(experienceCommentAuditEvents.occurredAt, input.query),
            ),
          )
          .orderBy(desc(experienceCommentAuditEvents.occurredAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(releaseOperations)
          .where(
            and(
              eq(releaseOperations.workspaceId, input.workspaceId),
              ...occurredWithin(releaseOperations.createdAt, input.query),
            ),
          )
          .orderBy(desc(releaseOperations.createdAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(publications)
          .where(
            and(
              eq(publications.workspaceId, input.workspaceId),
              ...occurredWithin(publications.publishedAt, input.query),
            ),
          )
          .orderBy(desc(publications.publishedAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(releaseApprovals)
          .where(
            and(
              eq(releaseApprovals.workspaceId, input.workspaceId),
              ...occurredWithin(releaseApprovals.createdAt, input.query),
            ),
          )
          .orderBy(desc(releaseApprovals.createdAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(publicationVerifications)
          .where(
            and(
              eq(publicationVerifications.workspaceId, input.workspaceId),
              ...occurredWithin(publicationVerifications.createdAt, input.query),
            ),
          )
          .orderBy(desc(publicationVerifications.createdAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(documentDeployments)
          .where(
            and(
              eq(documentDeployments.workspaceId, input.workspaceId),
              ...occurredWithin(documentDeployments.updatedAt, input.query),
            ),
          )
          .orderBy(desc(documentDeployments.updatedAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(tenantAuditEvents)
          .where(
            and(
              eq(tenantAuditEvents.workspaceId, input.workspaceId),
              ...occurredWithin(tenantAuditEvents.occurredAt, input.query),
            ),
          )
          .orderBy(desc(tenantAuditEvents.occurredAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(governanceAuditEvents)
          .where(
            and(
              eq(governanceAuditEvents.workspaceId, input.workspaceId),
              ...occurredWithin(governanceAuditEvents.occurredAt, input.query),
            ),
          )
          .orderBy(desc(governanceAuditEvents.occurredAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select()
          .from(dataResidencyMigrationHistory)
          .where(
            and(
              eq(dataResidencyMigrationHistory.workspaceId, input.workspaceId),
              ...occurredWithin(dataResidencyMigrationHistory.occurredAt, input.query),
            ),
          )
          .orderBy(desc(dataResidencyMigrationHistory.occurredAt))
          .limit(SOURCE_QUERY_LIMIT),
        tx
          .select({
            event: accessibilityFindingEvents,
            documentId: accessibilityFindings.documentId,
            code: accessibilityFindings.code,
            severity: accessibilityFindings.severity,
          })
          .from(accessibilityFindingEvents)
          .innerJoin(
            accessibilityFindings,
            and(
              eq(accessibilityFindings.workspaceId, accessibilityFindingEvents.workspaceId),
              eq(accessibilityFindings.id, accessibilityFindingEvents.findingId),
            ),
          )
          .where(
            and(
              eq(accessibilityFindingEvents.workspaceId, input.workspaceId),
              ...occurredWithin(accessibilityFindingEvents.occurredAt, input.query),
            ),
          )
          .orderBy(desc(accessibilityFindingEvents.occurredAt))
          .limit(SOURCE_QUERY_LIMIT),
      ]);
      const operationById = new Map(operationRows.map((row) => [row.id, row]));
      const events = [
        ...versionRows.map((row) =>
          governanceChangeEvent({
            source: 'document-version',
            sourceId: row.id,
            category: 'document',
            action: 'document.version_saved',
            actorUserId: row.createdByUserId,
            documentId: row.documentId,
            resourceId: row.id,
            occurredAt: toIsoString(row.createdAt),
            details: { version: row.version },
          }),
        ),
        ...commentRows.map((row) =>
          governanceChangeEvent({
            source: 'review',
            sourceId: row.id,
            category: 'review',
            action: `review.${row.eventType}`,
            actorUserId: row.actorUserId,
            documentId: row.documentId,
            resourceId: row.threadId,
            occurredAt: toIsoString(row.occurredAt),
            details: { commentId: row.commentId },
          }),
        ),
        ...operationRows.map((row) =>
          governanceChangeEvent({
            source: 'release-operation',
            sourceId: row.id,
            category: 'release',
            action: `release.${row.action}.${row.status}`,
            actorUserId: row.requestedByUserId,
            documentId: row.documentId,
            environmentId: row.environmentId,
            resourceId: row.id,
            occurredAt: toIsoString(row.completedAt ?? row.createdAt),
            details: {
              expectedGeneration: row.expectedGeneration,
              resultGeneration: row.resultGeneration,
              resultPublicationId: row.resultPublicationId,
              errorCode: row.errorCode,
            },
          }),
        ),
        ...publicationRows.map((row) =>
          governanceChangeEvent({
            source: 'publication',
            sourceId: row.id,
            category: 'release',
            action: `publication.${row.action ?? 'publish'}`,
            actorUserId: row.publishedByUserId,
            documentId: row.documentId,
            environmentId: row.environmentId,
            resourceId: row.id,
            occurredAt: toIsoString(row.publishedAt),
            details: {
              contentHash: row.contentHash,
              previousPublicationId: row.previousPublicationId,
              sourcePublicationId: row.sourcePublicationId,
            },
          }),
        ),
        ...approvalRows.map((row) => {
          const operation = operationById.get(row.releaseOperationId);
          return governanceChangeEvent({
            source: 'approval',
            sourceId: row.id,
            category: 'review',
            action: `release.approval_${row.decision}`,
            actorUserId: row.decidedByUserId,
            documentId: operation?.documentId,
            environmentId: operation?.environmentId,
            resourceId: row.releaseOperationId,
            occurredAt: toIsoString(row.createdAt),
            details: { decision: row.decision },
          });
        }),
        ...verificationRows.map((row) =>
          governanceChangeEvent({
            source: 'verification',
            sourceId: row.id,
            category: 'review',
            action: `release.verification_${row.result}`,
            actorUserId: row.verifiedByUserId,
            documentId: row.documentId,
            environmentId: row.environmentId,
            resourceId: row.publicationId,
            occurredAt: toIsoString(row.createdAt),
            details: { result: row.result },
          }),
        ),
        ...deploymentRows.map((row) =>
          governanceChangeEvent({
            source: 'deployment',
            sourceId: `${row.environmentId}:${row.documentId}:${row.generation}`,
            category: 'deployment',
            action: 'deployment.pointer_state',
            documentId: row.documentId,
            environmentId: row.environmentId,
            resourceId: row.activePublicationId ?? row.documentId,
            occurredAt: toIsoString(row.updatedAt),
            details: {
              state: row.state,
              generation: row.generation,
              activePublicationId: row.activePublicationId,
              pendingReleaseOperationId: row.pendingReleaseOperationId,
            },
          }),
        ),
        ...tenantRows.map((row) =>
          governanceChangeEvent({
            source: 'tenant-governance',
            sourceId: row.id,
            category: 'governance',
            action: `governance.${row.eventType}`,
            actorUserId: row.actorUserId,
            environmentId: row.environmentId,
            resourceId: row.resourceId ?? row.targetUserId ?? row.invitationId ?? row.id,
            occurredAt: toIsoString(row.occurredAt),
            details: {
              eventType: row.eventType,
              targetUserId: row.targetUserId,
              previousRole: row.previousRole,
              nextRole: row.nextRole,
            },
          }),
        ),
        ...governanceRows.map((row) =>
          governanceChangeEvent({
            source: 'platform-governance',
            sourceId: row.id,
            category: 'governance',
            action: `governance.${row.eventType}`,
            actorUserId: row.actorUserId,
            environmentId: row.environmentId,
            resourceId: row.resourceId ?? row.targetUserId ?? row.id,
            occurredAt: toIsoString(row.occurredAt),
            details: { eventType: row.eventType, targetUserId: row.targetUserId },
          }),
        ),
        ...residencyRows.map((row) =>
          governanceChangeEvent({
            source: 'residency',
            sourceId: row.id,
            category: 'governance',
            action: `governance.residency_${row.nextStatus}`,
            actorUserId: row.actorId.startsWith('system:') ? null : row.actorId,
            resourceId: row.migrationId,
            occurredAt: toIsoString(row.occurredAt),
            details: {
              previousStatus: row.previousStatus,
              nextStatus: row.nextStatus,
              failureCode: row.failureCode,
            },
          }),
        ),
        ...accessibilityRows.map((row) =>
          governanceChangeEvent({
            source: 'accessibility',
            sourceId: row.event.id,
            category: 'governance',
            action: `governance.accessibility_${row.event.eventType}`,
            actorUserId: row.event.actorUserId,
            documentId: row.documentId,
            resourceId: row.event.findingId,
            occurredAt: toIsoString(row.event.occurredAt),
            details: {
              findingRevision: row.event.findingRevision,
              code: row.code,
              severity: row.severity,
            },
          }),
        ),
      ];
      return applyGovernanceChangeHistoryQuery(events, input.query);
    });
  }
}
