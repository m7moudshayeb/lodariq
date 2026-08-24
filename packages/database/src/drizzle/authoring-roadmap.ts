import { and, asc, desc, eq } from 'drizzle-orm';
import type {
  AuthoringRoadmapRecord,
  AuthoringRoadmapRecordKind,
  CreateAuthoringRoadmapRecordInput,
  UpdateAuthoringRoadmapRecordInput,
  AuthoringCopyRecord,
  AuthoringCopyRecordKind,
  CreateAuthoringCopyRecordInput,
} from '../domains/authoring-roadmap';
import { authoringCopyRecords, authoringRoadmapRecords } from '../schema';
import { runWithDemoPublicScope } from '../scoped-transaction';
import { toIsoString } from './helpers';
import { DrizzleRepositoryWebhooks } from './webhooks';

export class DrizzleRepositoryAuthoringRoadmap extends DrizzleRepositoryWebhooks {
  async createAuthoringCopyRecord(
    input: CreateAuthoringCopyRecordInput,
  ): Promise<AuthoringCopyRecord> {
    const record = input.record;
    const [created] = await this.scoped(record.workspaceId, (tx) =>
      tx
        .insert(authoringCopyRecords)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          environmentId: record.environmentId,
          documentId: record.documentId,
          kind: record.kind,
          payload: record.payload,
          createdByUserId: record.createdByUserId,
          createdAt: new Date(record.createdAt),
        })
        .returning(),
    );
    if (!created) throw new Error('authoring copy record was not created');
    return copyRecord(created);
  }

  async getAuthoringCopyRecord(
    workspaceId: string,
    id: string,
  ): Promise<AuthoringCopyRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [record] = await tx
        .select()
        .from(authoringCopyRecords)
        .where(
          and(eq(authoringCopyRecords.workspaceId, workspaceId), eq(authoringCopyRecords.id, id)),
        )
        .limit(1);
      return record ? copyRecord(record) : null;
    });
  }

  async listAuthoringCopyRecords(
    workspaceId: string,
    documentId: string,
    kind?: AuthoringCopyRecordKind,
  ): Promise<AuthoringCopyRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(authoringCopyRecords)
        .where(
          and(
            eq(authoringCopyRecords.workspaceId, workspaceId),
            eq(authoringCopyRecords.documentId, documentId),
            ...(kind ? [eq(authoringCopyRecords.kind, kind)] : []),
          ),
        )
        .orderBy(desc(authoringCopyRecords.createdAt), asc(authoringCopyRecords.id));
      return rows.map(copyRecord);
    });
  }

  async createAuthoringRoadmapRecord(
    input: CreateAuthoringRoadmapRecordInput,
  ): Promise<AuthoringRoadmapRecord> {
    const record = input.record;
    const [created] = await this.scoped(record.workspaceId, (tx) =>
      tx
        .insert(authoringRoadmapRecords)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          environmentId: record.environmentId,
          documentId: record.documentId,
          kind: record.kind,
          status: record.status,
          payload: record.payload,
          createdByUserId: record.createdByUserId,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
          revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
        })
        .returning(),
    );
    if (!created) throw new Error('authoring roadmap record was not created');
    return roadmapRecord(created);
  }

  async getAuthoringRoadmapRecord(
    workspaceId: string,
    id: string,
  ): Promise<AuthoringRoadmapRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [record] = await tx
        .select()
        .from(authoringRoadmapRecords)
        .where(
          and(
            eq(authoringRoadmapRecords.workspaceId, workspaceId),
            eq(authoringRoadmapRecords.id, id),
          ),
        )
        .limit(1);
      return record ? roadmapRecord(record) : null;
    });
  }

  async getAuthoringRoadmapRecordById(id: string): Promise<AuthoringRoadmapRecord | null> {
    return runWithDemoPublicScope(this.database, async (tx) => {
      const [record] = await tx
        .select()
        .from(authoringRoadmapRecords)
        .where(
          and(
            eq(authoringRoadmapRecords.id, id),
            eq(authoringRoadmapRecords.kind, 'demo_link'),
            eq(authoringRoadmapRecords.status, 'active'),
          ),
        )
        .limit(1);
      return record ? roadmapRecord(record) : null;
    });
  }

  async listAuthoringRoadmapRecords(
    workspaceId: string,
    kind?: AuthoringRoadmapRecordKind,
    documentId?: string,
  ): Promise<AuthoringRoadmapRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(authoringRoadmapRecords)
        .where(
          and(
            eq(authoringRoadmapRecords.workspaceId, workspaceId),
            ...(kind ? [eq(authoringRoadmapRecords.kind, kind)] : []),
            ...(documentId ? [eq(authoringRoadmapRecords.documentId, documentId)] : []),
          ),
        )
        .orderBy(desc(authoringRoadmapRecords.createdAt), asc(authoringRoadmapRecords.id));
      return rows.map(roadmapRecord);
    });
  }

  async updateAuthoringRoadmapRecord(
    input: UpdateAuthoringRoadmapRecordInput,
  ): Promise<AuthoringRoadmapRecord | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [updated] = await tx
        .update(authoringRoadmapRecords)
        .set({
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.payload === undefined ? {} : { payload: input.payload }),
          ...(input.expiresAt === undefined
            ? {}
            : { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }),
          ...(input.revokedAt === undefined
            ? {}
            : { revokedAt: input.revokedAt ? new Date(input.revokedAt) : null }),
          updatedAt: new Date(input.updatedAt),
        })
        .where(
          and(
            eq(authoringRoadmapRecords.workspaceId, input.workspaceId),
            eq(authoringRoadmapRecords.id, input.id),
          ),
        )
        .returning();
      return updated ? roadmapRecord(updated) : null;
    });
  }
}

function roadmapRecord(row: typeof authoringRoadmapRecords.$inferSelect): AuthoringRoadmapRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    expiresAt: row.expiresAt ? toIsoString(row.expiresAt) : null,
    revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
  };
}

function copyRecord(row: typeof authoringCopyRecords.$inferSelect): AuthoringCopyRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    environmentId: row.environmentId,
    documentId: row.documentId,
    kind: row.kind,
    payload: row.payload,
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt),
  };
}
