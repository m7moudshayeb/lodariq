import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  type ApplyProductStyleProposalInput,
  type ProductStyleProposalApplicationResult,
  type StyleSourceRecord,
  type CreateWorkspaceThemeInput,
  type UpdateWorkspaceThemeDraftInput,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
  assertSafeProductStyleProposal,
  assertProductStyleApplicationIntegrity,
  assertProductStyleProposalReplay,
  createProductStyleApplicationRecord,
  hashCanonicalJson,
  assertWorkspaceThemeDraft,
  assertWorkspaceThemeMutationGuard,
  normalizeThemeGuardUpdatedAt,
  normalizeWorkspaceThemeName,
  productStyleProposalRequestHash,
} from '../repository';
import {
  environments,
  productStyleApplications,
  themes,
  themeVersions,
  styleSources,
  workspaceMemberships,
} from '../schema';
import {
  toStyleSourceRecord,
  toProductStyleApplicationRecord,
  compareStyleSourceRecords,
  toWorkspaceThemeRecord,
  toWorkspaceThemeVersionRecord,
} from './helpers';
import { DrizzleRepositoryIdentitySessions } from './identity-sessions';

export class DrizzleRepositoryThemeDrafts extends DrizzleRepositoryIdentitySessions {
  async listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(themes)
        .where(eq(themes.workspaceId, workspaceId))
        .orderBy(desc(themes.isDefault), desc(themes.updatedAt), asc(themes.id));
      return Promise.all(rows.map((row) => this.hydrateWorkspaceTheme(tx, row)));
    });
  }

  async getWorkspaceTheme(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const row = await this.findWorkspaceTheme(tx, workspaceId, themeId);
      return row ? this.hydrateWorkspaceTheme(tx, row) : null;
    });
  }

  async getDefaultWorkspaceTheme(workspaceId: string): Promise<WorkspaceThemeRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(themes)
        .where(
          and(
            eq(themes.workspaceId, workspaceId),
            eq(themes.isDefault, true),
            isNotNull(themes.activeVersionId),
          ),
        )
        .limit(1);
      return row ? this.hydrateWorkspaceTheme(tx, row) : null;
    });
  }

  async listWorkspaceThemeVersions(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeVersionRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(themeVersions)
        .where(and(eq(themeVersions.workspaceId, workspaceId), eq(themeVersions.themeId, themeId)))
        .orderBy(desc(themeVersions.version));
      return rows.map(toWorkspaceThemeVersionRecord);
    });
  }

  async createWorkspaceTheme(input: CreateWorkspaceThemeInput): Promise<WorkspaceThemeRecord> {
    const name = normalizeWorkspaceThemeName(input.name);
    assertWorkspaceThemeDraft(input.draft);
    return this.scoped(input.workspaceId, async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(themes)
        .values({
          id: `theme_${randomUUID()}`,
          workspaceId: input.workspaceId,
          name,
          draft: input.draft,
          revision: 1,
          isDefault: false,
          activeVersionId: null,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error('failed to create workspace theme');
      return toWorkspaceThemeRecord(created, null);
    });
  }

  async updateWorkspaceThemeDraft(
    input: UpdateWorkspaceThemeDraftInput,
  ): Promise<WorkspaceThemeRecord | null> {
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      const [updated] = await tx
        .update(themes)
        .set({
          name: input.name === undefined ? current.name : normalizeWorkspaceThemeName(input.name),
          draft: input.draft,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.id, input.themeId),
            eq(themes.revision, input.expectedRevision),
            eq(themes.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (!updated) {
        const actual = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (!actual) return null;
        assertWorkspaceThemeMutationGuard(
          toWorkspaceThemeRecord(actual, null),
          input.expectedRevision,
          expectedUpdatedAt,
        );
        throw new Error('workspace theme draft update failed');
      }
      return this.hydrateWorkspaceTheme(tx, updated);
    });
  }

  async applyProductStyleProposal(
    input: ApplyProductStyleProposalInput,
  ): Promise<ProductStyleProposalApplicationResult | null> {
    // Validate the complete closed contract before opening a transaction or
    // attempting any write. Only bounded schema-owned provenance reaches SQL.
    assertSafeProductStyleProposal(input.proposal);
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const proposalHash = productStyleProposalRequestHash(input);

    return this.scoped(input.workspaceId, async (tx) => {
      // Serialize proposal replays and Product-match draft updates for this
      // theme. The row CAS below remains authoritative for writers that do not
      // participate in this advisory-lock protocol.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext(${input.themeId}))`,
      );

      const [existingApplicationRow] = await tx
        .select()
        .from(productStyleApplications)
        .where(
          and(
            eq(productStyleApplications.workspaceId, input.workspaceId),
            eq(productStyleApplications.themeId, input.themeId),
            eq(productStyleApplications.proposalId, input.proposal.proposalId),
          ),
        )
        .limit(1);
      if (existingApplicationRow) {
        const existingRows = await tx
          .select()
          .from(styleSources)
          .where(
            and(
              eq(styleSources.workspaceId, input.workspaceId),
              eq(styleSources.themeId, input.themeId),
              eq(styleSources.proposalId, input.proposal.proposalId),
            ),
          )
          .orderBy(asc(styleSources.sourceOrdinal), asc(styleSources.id));
        const existingSources = existingRows.map(toStyleSourceRecord);
        const application = toProductStyleApplicationRecord(existingApplicationRow);
        assertProductStyleProposalReplay(input, proposalHash, application, existingSources);
        const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (!current) return null;
        return {
          theme: await this.hydrateWorkspaceTheme(tx, current),
          sources: existingSources,
          application,
          draftChanged: application.receipt.draftChanged,
          replayed: true,
        };
      }

      const [orphanedSource] = await tx
        .select({ id: styleSources.id })
        .from(styleSources)
        .where(
          and(
            eq(styleSources.workspaceId, input.workspaceId),
            eq(styleSources.themeId, input.themeId),
            eq(styleSources.proposalId, input.proposal.proposalId),
          ),
        )
        .limit(1);
      if (orphanedSource) {
        throw new Error(
          'Product match provenance exists without its canonical application receipt',
        );
      }

      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      const [environment] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.enabled, true),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      const [membership] = await tx
        .select({ userId: workspaceMemberships.userId })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .limit(1);
      if (!membership) throw new Error('Product match actor is not a workspace member');

      const draftChanged = hashCanonicalJson(current.draft) !== hashCanonicalJson(input.draft);
      const now = new Date();
      const appliedThemeRevision = current.revision + (draftChanged ? 1 : 0);
      const [updated] = await tx
        .update(themes)
        .set(
          draftChanged
            ? {
                draft: input.draft,
                revision: appliedThemeRevision,
                updatedByUserId: input.actorUserId,
                updatedAt: now,
              }
            : { draft: input.draft },
        )
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.id, input.themeId),
            eq(themes.revision, input.expectedRevision),
            eq(themes.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (!updated) {
        const actual = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (!actual) return null;
        assertWorkspaceThemeMutationGuard(
          toWorkspaceThemeRecord(actual, null),
          input.expectedRevision,
          expectedUpdatedAt,
        );
        throw new Error('workspace theme Product match update failed');
      }

      const appliedTheme = await this.hydrateWorkspaceTheme(tx, updated);
      const sourceCount = input.proposal.sources.length;
      const sourceRecords = input.proposal.sources.map(
        (source, sourceOrdinal): StyleSourceRecord => ({
          id: `style_source_${randomUUID()}`,
          workspaceId: input.workspaceId,
          themeId: input.themeId,
          environmentId: input.environmentId,
          proposalId: input.proposal.proposalId,
          proposalHash,
          sourceOrdinal,
          sourceCount,
          appliedThemeRevision,
          draftChanged,
          source,
          sourceHash: hashCanonicalJson(source),
          createdByUserId: input.actorUserId,
          createdAt: now.toISOString(),
        }),
      );
      const applicationCandidate = createProductStyleApplicationRecord({
        id: `product_style_application_${randomUUID()}`,
        input,
        requestHash: proposalHash,
        appliedTheme,
        sources: sourceRecords,
        createdAt: now.toISOString(),
      });
      const [insertedApplicationRow] = await tx
        .insert(productStyleApplications)
        .values({
          id: applicationCandidate.id,
          workspaceId: applicationCandidate.workspaceId,
          themeId: applicationCandidate.themeId,
          environmentId: applicationCandidate.environmentId,
          proposalId: applicationCandidate.receipt.proposalId,
          requestHash: applicationCandidate.requestHash,
          sourceSetHash: applicationCandidate.sourceSetHash,
          draftRevision: applicationCandidate.receipt.draftRevision,
          draftUpdatedAt: new Date(applicationCandidate.receipt.draftUpdatedAt),
          previewTheme: applicationCandidate.receipt.previewTheme,
          previewThemeHash: applicationCandidate.receipt.previewTheme.contentHash,
          sourceReceipts: applicationCandidate.receipt.sources,
          draftChanged: applicationCandidate.receipt.draftChanged,
          createdByUserId: applicationCandidate.createdByUserId,
          createdAt: new Date(applicationCandidate.createdAt),
        })
        .returning();
      if (!insertedApplicationRow) {
        throw new Error('failed to persist the canonical Product match application receipt');
      }
      const insertedRows = await tx
        .insert(styleSources)
        .values(
          sourceRecords.map((source) => ({
            id: source.id,
            workspaceId: source.workspaceId,
            themeId: source.themeId,
            environmentId: source.environmentId,
            proposalId: source.proposalId,
            proposalHash: source.proposalHash,
            sourceOrdinal: source.sourceOrdinal,
            sourceCount: source.sourceCount,
            appliedThemeRevision: source.appliedThemeRevision,
            draftChanged: source.draftChanged,
            source: source.source,
            sourceHash: source.sourceHash,
            createdByUserId: source.createdByUserId,
            createdAt: new Date(source.createdAt),
          })),
        )
        .returning();
      if (insertedRows.length !== sourceCount) {
        throw new Error('failed to persist the complete Product match provenance set');
      }
      const application = toProductStyleApplicationRecord(insertedApplicationRow);
      const persistedSources = insertedRows
        .map(toStyleSourceRecord)
        .sort(compareStyleSourceRecords);
      assertProductStyleApplicationIntegrity(application, persistedSources);
      return {
        theme: appliedTheme,
        sources: persistedSources,
        application,
        draftChanged,
        replayed: false,
      };
    });
  }
}
