import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type {
  AccessibilityFinding,
  AccessibilityFindingQuery,
  AccessibilitySweep,
} from '@lodariq/schema/accessibility-governance';
import {
  AccessibilityFindingConflictError,
  assertAccessibilitySweepInput,
  type CreateAccessibilitySweepInput,
  type ResolveAccessibilityFindingInput,
} from '../domains/accessibility-governance';
import {
  accessibilityFindingEvents,
  accessibilityFindings,
  accessibilitySweeps,
  workspaceMemberships,
} from '../schema';
import { DrizzleRepositoryGovernanceChangeHistory } from './governance-change-history';
import { toIsoString } from './helpers';
import type { LodariqTransaction } from './types';

export class DrizzleRepositoryAccessibilityGovernance extends DrizzleRepositoryGovernanceChangeHistory {
  async createAccessibilitySweep(input: CreateAccessibilitySweepInput) {
    assertAccessibilitySweepInput(input);
    return this.actorScoped(input.workspaceId, input.sweep.requestedByUserId, async (tx) => {
      const [membership] = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.sweep.requestedByUserId),
          ),
        )
        .limit(1);
      if (!membership || membership.role === 'viewer') {
        throw new Error('Accessibility sweep requires a current authoring workspace member');
      }

      const [existing] = await tx
        .select()
        .from(accessibilitySweeps)
        .where(
          and(
            eq(accessibilitySweeps.workspaceId, input.workspaceId),
            eq(accessibilitySweeps.id, input.sweep.id),
          ),
        )
        .limit(1);
      if (existing) {
        const replay = await this.readSweepResult(tx, input.workspaceId, input.sweep.id);
        if (!replay) throw new Error('Accessibility sweep replay became unavailable');
        return replay;
      }

      await tx.insert(accessibilitySweeps).values({
        id: input.sweep.id,
        workspaceId: input.workspaceId,
        status: 'completed',
        requestedByUserId: input.sweep.requestedByUserId,
        documentCount: input.sweep.documentCount,
        localeCount: input.sweep.localeCount,
        blockerCount: input.sweep.blockerCount,
        warningCount: input.sweep.warningCount,
        startedAt: new Date(input.sweep.startedAt),
        completedAt: new Date(input.sweep.completedAt),
      });
      if (input.findings.length > 0) {
        await tx.insert(accessibilityFindings).values(
          input.findings.map((finding) => ({
            id: finding.id,
            workspaceId: input.workspaceId,
            sweepId: finding.sweepId,
            documentId: finding.documentId,
            documentVersionId: finding.documentVersionId,
            artifactId: finding.artifactId,
            contentHash: finding.contentHash,
            code: finding.code,
            severity: finding.severity,
            status: finding.status,
            locale: finding.locale,
            stepId: finding.stepId,
            nodeId: finding.nodeId,
            measuredRatio: finding.measuredRatio === null ? null : String(finding.measuredRatio),
            requiredRatio: finding.requiredRatio === null ? null : String(finding.requiredRatio),
            revision: finding.revision,
            resolvedByUserId: null,
            resolutionNote: null,
            resolvedAt: null,
            createdAt: new Date(finding.createdAt),
          })),
        );
        await tx.insert(accessibilityFindingEvents).values(
          input.findings.map((finding) => ({
            id: `a11yevent_${randomUUID()}`,
            workspaceId: input.workspaceId,
            findingId: finding.id,
            eventType: 'opened' as const,
            actorUserId: input.sweep.requestedByUserId,
            findingRevision: 1,
            occurredAt: new Date(finding.createdAt),
          })),
        );
      }
      return { sweep: structuredClone(input.sweep), findings: structuredClone(input.findings) };
    });
  }

  async listAccessibilitySweeps(workspaceId: string, limit = 100) {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(accessibilitySweeps)
        .where(eq(accessibilitySweeps.workspaceId, workspaceId))
        .orderBy(desc(accessibilitySweeps.completedAt), desc(accessibilitySweeps.id))
        .limit(limit);
      return rows.map(toAccessibilitySweep);
    });
  }

  async getAccessibilitySweep(workspaceId: string, sweepId: string) {
    return this.scoped(workspaceId, (tx) => this.readSweepResult(tx, workspaceId, sweepId));
  }

  async listAccessibilityFindings(workspaceId: string, query: AccessibilityFindingQuery) {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(accessibilityFindings)
        .where(
          and(
            eq(accessibilityFindings.workspaceId, workspaceId),
            query.documentId ? eq(accessibilityFindings.documentId, query.documentId) : undefined,
            query.documentVersionId
              ? eq(accessibilityFindings.documentVersionId, query.documentVersionId)
              : undefined,
            query.sweepId ? eq(accessibilityFindings.sweepId, query.sweepId) : undefined,
            query.severity ? eq(accessibilityFindings.severity, query.severity) : undefined,
            query.status ? eq(accessibilityFindings.status, query.status) : undefined,
          ),
        )
        .orderBy(desc(accessibilityFindings.createdAt), desc(accessibilityFindings.id))
        .limit(query.limit ?? 1_000);
      return rows.map(toAccessibilityFinding);
    });
  }

  async resolveAccessibilityFinding(input: ResolveAccessibilityFindingInput) {
    return this.actorScoped(input.workspaceId, input.actorUserId, async (tx) => {
      const [membership] = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .limit(1);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        throw new Error('Accessibility finding resolution requires an admin or owner');
      }
      const resolutionNote = input.resolutionNote.trim();
      if (!resolutionNote || resolutionNote.length > 500) {
        throw new Error('Accessibility finding resolution note is invalid');
      }
      const [resolved] = await tx
        .update(accessibilityFindings)
        .set({
          status: 'resolved',
          revision: input.expectedRevision + 1,
          resolvedByUserId: input.actorUserId,
          resolutionNote,
          resolvedAt: new Date(input.resolvedAt),
        })
        .where(
          and(
            eq(accessibilityFindings.workspaceId, input.workspaceId),
            eq(accessibilityFindings.id, input.findingId),
            eq(accessibilityFindings.status, 'open'),
            eq(accessibilityFindings.revision, input.expectedRevision),
          ),
        )
        .returning();
      if (!resolved) {
        const [existing] = await tx
          .select({ id: accessibilityFindings.id })
          .from(accessibilityFindings)
          .where(
            and(
              eq(accessibilityFindings.workspaceId, input.workspaceId),
              eq(accessibilityFindings.id, input.findingId),
            ),
          )
          .limit(1);
        if (!existing) return null;
        throw new AccessibilityFindingConflictError();
      }
      await tx.insert(accessibilityFindingEvents).values({
        id: input.eventId,
        workspaceId: input.workspaceId,
        findingId: input.findingId,
        eventType: 'resolved',
        actorUserId: input.actorUserId,
        findingRevision: resolved.revision,
        occurredAt: new Date(input.resolvedAt),
      });
      return toAccessibilityFinding(resolved);
    });
  }

  async listOpenAccessibilityBlockers(workspaceId: string, documentVersionId: string) {
    return this.listAccessibilityFindings(workspaceId, {
      documentVersionId,
      severity: 'blocker',
      status: 'open',
      limit: 10_000,
    });
  }

  private async readSweepResult(tx: LodariqTransaction, workspaceId: string, sweepId: string) {
    const [row] = await tx
      .select()
      .from(accessibilitySweeps)
      .where(
        and(eq(accessibilitySweeps.workspaceId, workspaceId), eq(accessibilitySweeps.id, sweepId)),
      )
      .limit(1);
    if (!row) return null;
    const findingRows = await tx
      .select()
      .from(accessibilityFindings)
      .where(
        and(
          eq(accessibilityFindings.workspaceId, workspaceId),
          eq(accessibilityFindings.sweepId, sweepId),
        ),
      )
      .orderBy(desc(accessibilityFindings.createdAt), desc(accessibilityFindings.id));
    return { sweep: toAccessibilitySweep(row), findings: findingRows.map(toAccessibilityFinding) };
  }
}

function toAccessibilitySweep(row: typeof accessibilitySweeps.$inferSelect): AccessibilitySweep {
  return {
    schemaVersion: '2026-08-22.1',
    id: row.id,
    status: 'completed',
    requestedByUserId: row.requestedByUserId,
    documentCount: row.documentCount,
    localeCount: row.localeCount,
    blockerCount: row.blockerCount,
    warningCount: row.warningCount,
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoString(row.completedAt),
  };
}

function toAccessibilityFinding(
  row: typeof accessibilityFindings.$inferSelect,
): AccessibilityFinding {
  return {
    schemaVersion: '2026-08-22.1',
    id: row.id,
    sweepId: row.sweepId,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    artifactId: row.artifactId,
    contentHash: row.contentHash,
    code: row.code,
    severity: row.severity,
    status: row.status,
    locale: row.locale,
    stepId: row.stepId,
    nodeId: row.nodeId,
    measuredRatio: row.measuredRatio === null ? null : Number(row.measuredRatio),
    requiredRatio: row.requiredRatio === null ? null : Number(row.requiredRatio),
    revision: row.revision,
    resolvedByUserId: row.resolvedByUserId,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt ? toIsoString(row.resolvedAt) : null,
    createdAt: toIsoString(row.createdAt),
  };
}
