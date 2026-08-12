import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import {
  type BrandDriftRunRecord,
  type CreateBrandDriftRunInput,
  type CreateStyleSourceInput,
  type StyleSourceRecord,
  type SetDefaultWorkspaceThemeInput,
  type ApproveWorkspaceThemeInput,
  type WorkspaceThemeApprovalResult,
  type WorkspaceThemeImpactRecord,
  type WorkspaceThemeRecord,
  WorkspaceThemeApprovalRequiredError,
  assertSafeStyleSource,
  hashCanonicalJson,
  assertBrandDriftReport,
  assertWorkspaceThemeMutationGuard,
  createWorkspaceThemeVersion,
  normalizeThemeGuardUpdatedAt,
  themeImpactBinding,
} from '../repository';
import {
  documentDeployments,
  documents,
  environments,
  themes,
  themeVersions,
  styleSources,
  brandDriftRuns,
} from '../schema';
import {
  toStyleSourceRecord,
  toBrandDriftRunRecord,
  toWorkspaceThemeRecord,
  workspaceThemeVersionValues,
} from './helpers';
import { DrizzleRepositoryThemeDrafts } from './theme-drafts';

export class DrizzleRepositoryThemePolicy extends DrizzleRepositoryThemeDrafts {
  async approveWorkspaceTheme(
    input: ApproveWorkspaceThemeInput,
  ): Promise<WorkspaceThemeApprovalResult | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext('workspace-theme-default'))`,
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext(${input.themeId}))`,
      );
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      const [latest] = await tx
        .select({ version: sql<number>`coalesce(max(${themeVersions.version}), 0)::int` })
        .from(themeVersions)
        .where(
          and(
            eq(themeVersions.workspaceId, input.workspaceId),
            eq(themeVersions.themeId, input.themeId),
          ),
        );
      const now = new Date();
      const approvedVersion = createWorkspaceThemeVersion(
        toWorkspaceThemeRecord(current, null),
        Number(latest?.version ?? 0) + 1,
        input.actorUserId,
        now.toISOString(),
      );
      await tx.insert(themeVersions).values(workspaceThemeVersionValues(approvedVersion));
      const [approvedDefault] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.isDefault, true),
            isNotNull(themes.activeVersionId),
          ),
        )
        .limit(1);
      const makeDefault = !approvedDefault;
      if (makeDefault) {
        await tx
          .update(themes)
          .set({
            isDefault: false,
            revision: sql`${themes.revision} + 1`,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(
            and(
              eq(themes.workspaceId, input.workspaceId),
              eq(themes.isDefault, true),
              ne(themes.id, input.themeId),
            ),
          );
      }
      const [updated] = await tx
        .update(themes)
        .set({
          activeVersionId: approvedVersion.id,
          isDefault: makeDefault || current.isDefault,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
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
        throw new Error('workspace theme approval failed');
      }
      return {
        theme: toWorkspaceThemeRecord(updated, approvedVersion),
        approvedVersion,
      };
    });
  }

  async setDefaultWorkspaceTheme(
    input: SetDefaultWorkspaceThemeInput,
  ): Promise<WorkspaceThemeRecord | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext('workspace-theme-default'))`,
      );
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      if (!current.activeVersionId) {
        throw new WorkspaceThemeApprovalRequiredError(current.id);
      }
      if (current.isDefault) return this.hydrateWorkspaceTheme(tx, current);

      const now = new Date();
      await tx
        .update(themes)
        .set({
          isDefault: false,
          revision: sql`${themes.revision} + 1`,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(and(eq(themes.workspaceId, input.workspaceId), eq(themes.isDefault, true)));
      const [updated] = await tx
        .update(themes)
        .set({
          isDefault: true,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
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
        if (actual) {
          assertWorkspaceThemeMutationGuard(
            toWorkspaceThemeRecord(actual, null),
            input.expectedRevision,
            expectedUpdatedAt,
          );
        }
        throw new Error('workspace theme default change failed');
      }
      return this.hydrateWorkspaceTheme(tx, updated);
    });
  }

  async listWorkspaceThemeImpact(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeImpactRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const documentRows = await tx
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId));
      const activeDeployments = await tx
        .select({
          documentId: documentDeployments.documentId,
          environmentId: documentDeployments.environmentId,
        })
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.state, 'active'),
          ),
        );
      const environmentsByDocument = new Map<string, string[]>();
      for (const deployment of activeDeployments) {
        const ids = environmentsByDocument.get(deployment.documentId) ?? [];
        ids.push(deployment.environmentId);
        environmentsByDocument.set(deployment.documentId, ids);
      }

      const impacts: WorkspaceThemeImpactRecord[] = [];
      for (const document of documentRows) {
        const binding = themeImpactBinding(document.canonical, themeId);
        if (!binding) continue;
        const latestArtifact = await this.getLatestArtifact(tx, workspaceId, document.id);
        impacts.push({
          documentId: document.id,
          title: document.title,
          status: document.canonical.status,
          ...binding,
          latestArtifactThemeVersionId: latestArtifact?.themeVersionId ?? null,
          activeEnvironmentIds: (environmentsByDocument.get(document.id) ?? []).sort(),
        });
      }
      return impacts.sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.documentId.localeCompare(right.documentId),
      );
    });
  }

  async createStyleSource(input: CreateStyleSourceInput): Promise<StyleSourceRecord> {
    assertSafeStyleSource(input.source);
    return this.scoped(input.workspaceId, async (tx) => {
      const [theme] = await tx
        .select({ id: themes.id, revision: themes.revision })
        .from(themes)
        .where(and(eq(themes.workspaceId, input.workspaceId), eq(themes.id, input.themeId)))
        .limit(1);
      if (!theme) throw new Error('theme not found in workspace');
      const [environment] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      const id = `style_source_${randomUUID()}`;
      const [source] = await tx
        .insert(styleSources)
        .values({
          id,
          workspaceId: input.workspaceId,
          themeId: input.themeId,
          environmentId: input.environmentId,
          proposalId: `standalone.${id}`,
          proposalHash: hashCanonicalJson({
            themeId: input.themeId,
            environmentId: input.environmentId,
            source: input.source,
          }),
          sourceOrdinal: 0,
          sourceCount: 1,
          appliedThemeRevision: theme.revision,
          draftChanged: false,
          source: input.source,
          sourceHash: hashCanonicalJson(input.source),
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!source) throw new Error('failed to create style source');
      return toStyleSourceRecord(source);
    });
  }

  async listStyleSources(workspaceId: string, themeId?: string): Promise<StyleSourceRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const condition = themeId
        ? and(eq(styleSources.workspaceId, workspaceId), eq(styleSources.themeId, themeId))
        : eq(styleSources.workspaceId, workspaceId);
      const rows = await tx
        .select()
        .from(styleSources)
        .where(condition)
        .orderBy(
          desc(styleSources.createdAt),
          desc(styleSources.proposalId),
          asc(styleSources.sourceOrdinal),
          desc(styleSources.id),
        );
      return rows.map(toStyleSourceRecord);
    });
  }

  async createBrandDriftRun(input: CreateBrandDriftRunInput): Promise<BrandDriftRunRecord> {
    assertBrandDriftReport(input.report);
    if (
      input.report.themeId !== input.themeId ||
      input.report.baselineThemeVersionId !== input.baselineThemeVersionId
    ) {
      throw new Error('Brand drift report theme identity does not match its persistence scope');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const [run] = await tx
        .insert(brandDriftRuns)
        .values({
          id: input.report.checkId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          themeId: input.themeId,
          baselineThemeVersionId: input.baselineThemeVersionId,
          trigger: input.report.trigger,
          classification: input.report.classification,
          confidence: input.report.confidence,
          report: input.report,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!run) throw new Error('failed to persist Brand drift evidence');
      return toBrandDriftRunRecord(run);
    });
  }

  async listBrandDriftRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<BrandDriftRunRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(brandDriftRuns)
        .where(
          and(
            eq(brandDriftRuns.workspaceId, workspaceId),
            eq(brandDriftRuns.documentId, documentId),
          ),
        )
        .orderBy(desc(brandDriftRuns.createdAt), desc(brandDriftRuns.id));
      return rows.map(toBrandDriftRunRecord);
    });
  }
}
