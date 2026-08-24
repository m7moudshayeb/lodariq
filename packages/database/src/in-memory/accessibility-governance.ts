import { randomUUID } from 'node:crypto';
import type { AccessibilityFindingQuery } from '@lodariq/schema/accessibility-governance';
import {
  AccessibilityFindingConflictError,
  applyAccessibilityFindingQuery,
  assertAccessibilitySweepInput,
  type CreateAccessibilitySweepInput,
  type ResolveAccessibilityFindingInput,
} from '../domains/accessibility-governance';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryGovernanceChangeHistory } from './governance-change-history';

export class InMemoryRepositoryAccessibilityGovernance extends InMemoryRepositoryGovernanceChangeHistory {
  async createAccessibilitySweep(input: CreateAccessibilitySweepInput) {
    assertAccessibilitySweepInput(input);
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.sweep.requestedByUserId),
    );
    if (!membership || membership.role === 'viewer') {
      throw new Error('Accessibility sweep requires a current authoring workspace member');
    }
    const key = this.key(input.workspaceId, input.sweep.id);
    const existing = this.accessibilitySweeps.get(key);
    if (existing) {
      return {
        sweep: clone(existing),
        findings: await this.listAccessibilityFindings(input.workspaceId, {
          sweepId: existing.id,
          limit: 10_000,
        }),
      };
    }

    this.accessibilitySweeps.set(key, clone(input.sweep));
    for (const finding of input.findings) {
      this.accessibilityFindings.set(this.key(input.workspaceId, finding.id), clone(finding));
      this.accessibilityFindingEvents.push({
        id: `a11yevent_${randomUUID()}`,
        workspaceId: input.workspaceId,
        findingId: finding.id,
        eventType: 'opened',
        actorUserId: input.sweep.requestedByUserId,
        findingRevision: 1,
        occurredAt: finding.createdAt,
      });
    }
    return { sweep: clone(input.sweep), findings: clone(input.findings) };
  }

  async listAccessibilitySweeps(workspaceId: string, limit = 100) {
    return [...this.accessibilitySweeps.entries()]
      .filter(([key]) => key.startsWith(`${workspaceId}\u0000`))
      .map(([, sweep]) => clone(sweep))
      .sort(
        (left, right) =>
          right.completedAt.localeCompare(left.completedAt) || right.id.localeCompare(left.id),
      )
      .slice(0, limit);
  }

  async getAccessibilitySweep(workspaceId: string, sweepId: string) {
    const sweep = this.accessibilitySweeps.get(this.key(workspaceId, sweepId));
    if (!sweep) return null;
    const findings = await this.listAccessibilityFindings(workspaceId, {
      sweepId,
      limit: 10_000,
    });
    return { sweep: clone(sweep), findings };
  }

  async listAccessibilityFindings(workspaceId: string, query: AccessibilityFindingQuery) {
    const findings = [...this.accessibilityFindings.entries()]
      .filter(([key]) => key.startsWith(`${workspaceId}\u0000`))
      .map(([, finding]) => finding);
    return applyAccessibilityFindingQuery(findings, query);
  }

  async resolveAccessibilityFinding(input: ResolveAccessibilityFindingInput) {
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new Error('Accessibility finding resolution requires an admin or owner');
    }
    const key = this.key(input.workspaceId, input.findingId);
    const finding = this.accessibilityFindings.get(key);
    if (!finding) return null;
    if (finding.status !== 'open' || finding.revision !== input.expectedRevision) {
      throw new AccessibilityFindingConflictError();
    }
    const resolutionNote = input.resolutionNote.trim();
    if (!resolutionNote || resolutionNote.length > 500) {
      throw new Error('Accessibility finding resolution note is invalid');
    }
    const resolved = {
      ...finding,
      status: 'resolved' as const,
      revision: finding.revision + 1,
      resolvedByUserId: input.actorUserId,
      resolutionNote,
      resolvedAt: input.resolvedAt,
    };
    this.accessibilityFindings.set(key, resolved);
    this.accessibilityFindingEvents.push({
      id: input.eventId,
      workspaceId: input.workspaceId,
      findingId: input.findingId,
      eventType: 'resolved',
      actorUserId: input.actorUserId,
      findingRevision: resolved.revision,
      occurredAt: input.resolvedAt,
    });
    return clone(resolved);
  }

  async listOpenAccessibilityBlockers(workspaceId: string, documentVersionId: string) {
    return this.listAccessibilityFindings(workspaceId, {
      documentVersionId,
      severity: 'blocker',
      status: 'open',
      limit: 10_000,
    });
  }
}
