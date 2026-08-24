import type {
  AuthoringRoadmapRecord,
  AuthoringRoadmapRecordKind,
  CreateAuthoringRoadmapRecordInput,
  UpdateAuthoringRoadmapRecordInput,
  AuthoringCopyRecord,
  AuthoringCopyRecordKind,
  CreateAuthoringCopyRecordInput,
} from '../domains/authoring-roadmap';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryGovernance } from './governance';

export class InMemoryRepositoryAuthoringRoadmap extends InMemoryRepositoryGovernance {
  async createAuthoringCopyRecord(
    input: CreateAuthoringCopyRecordInput,
  ): Promise<AuthoringCopyRecord> {
    const record = clone(input.record);
    const key = this.key(record.workspaceId, record.id);
    if (this.authoringCopyRecords.has(key)) throw new Error('authoring copy record already exists');
    this.authoringCopyRecords.set(key, record);
    return clone(record);
  }

  async getAuthoringCopyRecord(
    workspaceId: string,
    id: string,
  ): Promise<AuthoringCopyRecord | null> {
    const record = this.authoringCopyRecords.get(this.key(workspaceId, id));
    return record ? clone(record) : null;
  }

  async listAuthoringCopyRecords(
    workspaceId: string,
    documentId: string,
    kind?: AuthoringCopyRecordKind,
  ): Promise<AuthoringCopyRecord[]> {
    return [...this.authoringCopyRecords.values()]
      .filter(
        (record) =>
          record.workspaceId === workspaceId &&
          record.documentId === documentId &&
          (!kind || record.kind === kind),
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async createAuthoringRoadmapRecord(
    input: CreateAuthoringRoadmapRecordInput,
  ): Promise<AuthoringRoadmapRecord> {
    const record = clone(input.record);
    const key = this.key(record.workspaceId, record.id);
    if (this.authoringRoadmapRecords.has(key)) {
      throw new Error('authoring roadmap record already exists');
    }
    this.authoringRoadmapRecords.set(key, record);
    return clone(record);
  }

  async getAuthoringRoadmapRecord(
    workspaceId: string,
    id: string,
  ): Promise<AuthoringRoadmapRecord | null> {
    const record = this.authoringRoadmapRecords.get(this.key(workspaceId, id));
    return record ? clone(record) : null;
  }

  async getAuthoringRoadmapRecordById(id: string): Promise<AuthoringRoadmapRecord | null> {
    const record = [...this.authoringRoadmapRecords.values()].find(
      (candidate) =>
        candidate.id === id && candidate.kind === 'demo_link' && candidate.status === 'active',
    );
    return record ? clone(record) : null;
  }

  async listAuthoringRoadmapRecords(
    workspaceId: string,
    kind?: AuthoringRoadmapRecordKind,
    documentId?: string,
  ): Promise<AuthoringRoadmapRecord[]> {
    return [...this.authoringRoadmapRecords.values()]
      .filter(
        (record) =>
          record.workspaceId === workspaceId &&
          (!kind || record.kind === kind) &&
          (!documentId || record.documentId === documentId),
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
      )
      .map(clone);
  }

  async updateAuthoringRoadmapRecord(
    input: UpdateAuthoringRoadmapRecordInput,
  ): Promise<AuthoringRoadmapRecord | null> {
    const key = this.key(input.workspaceId, input.id);
    const current = this.authoringRoadmapRecords.get(key);
    if (!current) return null;
    const next: AuthoringRoadmapRecord = {
      ...current,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.payload === undefined ? {} : { payload: clone(input.payload) }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
      updatedAt: input.updatedAt,
    };
    this.authoringRoadmapRecords.set(key, next);
    return clone(next);
  }
}
