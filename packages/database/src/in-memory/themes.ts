import { randomUUID } from 'node:crypto';
import {
  WorkspaceThemeApprovalRequiredError,
  type ApplyProductStyleProposalInput,
  type ApproveWorkspaceThemeInput,
  type BrandDriftRunRecord,
  type CreateBrandDriftRunInput,
  type CreateStyleSourceInput,
  type CreateWorkspaceThemeInput,
  type ProductStyleProposalApplicationResult,
  type SetDefaultWorkspaceThemeInput,
  type StyleSourceRecord,
  type UpdateWorkspaceThemeDraftInput,
  type WorkspaceThemeApprovalResult,
  type WorkspaceThemeImpactRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
} from '../domains/themes';
import {
  assertProductStyleProposalReplay,
  assertSafeProductStyleProposal,
  assertSafeStyleSource,
  compareStyleSourceOrdinal,
  compareStyleSourceHistory,
  createProductStyleApplicationRecord,
  productStyleProposalRequestHash,
} from '../domains/product-style';
import {
  assertBrandDriftReport,
  assertWorkspaceThemeDraft,
  assertWorkspaceThemeMutationGuard,
  createWorkspaceThemeVersion,
  hashCanonicalJson,
  normalizeThemeGuardUpdatedAt,
  normalizeWorkspaceThemeName,
  themeImpactBinding,
} from '../domains/theme-policy';
import { assertCommercialFeature } from '../domains/commercial-entitlements';
import {
  clone,
  compareWorkspaceThemeImpact,
  compareWorkspaceThemes,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryEnterpriseIdentity } from './enterprise-identity';

export class InMemoryRepositoryThemes extends InMemoryRepositoryEnterpriseIdentity {
  async listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeRecord[]> {
    return [...this.themes.values()]
      .filter((theme) => theme.workspaceId === workspaceId)
      .map((theme) => this.hydrateTheme(theme))
      .sort(compareWorkspaceThemes);
  }

  async getWorkspaceTheme(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeRecord | null> {
    const theme = this.themes.get(this.key(workspaceId, themeId));
    return theme ? this.hydrateTheme(theme) : null;
  }

  async getDefaultWorkspaceTheme(workspaceId: string): Promise<WorkspaceThemeRecord | null> {
    const theme = [...this.themes.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.isDefault &&
        candidate.activeVersionId !== null,
    );
    return theme ? this.hydrateTheme(theme) : null;
  }

  async listWorkspaceThemeVersions(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeVersionRecord[]> {
    return (this.themeVersions.get(this.key(workspaceId, themeId)) ?? [])
      .map((version) => clone(version))
      .sort((left, right) => right.version - left.version);
  }

  async createWorkspaceTheme(input: CreateWorkspaceThemeInput): Promise<WorkspaceThemeRecord> {
    const name = normalizeWorkspaceThemeName(input.name);
    assertWorkspaceThemeDraft(input.draft);
    const existingThemeCount = [...this.themes.values()].filter(
      (theme) => theme.workspaceId === input.workspaceId,
    ).length;
    if (existingThemeCount > 0) {
      assertCommercialFeature(
        this.resolveWorkspaceEntitlements(input.workspaceId).entitlements,
        'multiple-themes',
      );
    }
    const now = new Date().toISOString();
    const theme: WorkspaceThemeRecord = {
      id: `theme_${randomUUID()}`,
      workspaceId: input.workspaceId,
      name,
      draft: clone(input.draft),
      revision: 1,
      isDefault: false,
      activeVersionId: null,
      activeVersion: null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.themes.set(this.key(input.workspaceId, theme.id), theme);
    return clone(theme);
  }

  async updateWorkspaceThemeDraft(
    input: UpdateWorkspaceThemeDraftInput,
  ): Promise<WorkspaceThemeRecord | null> {
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    const updated: WorkspaceThemeRecord = {
      ...current,
      name: input.name === undefined ? current.name : normalizeWorkspaceThemeName(input.name),
      draft: clone(input.draft),
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: new Date().toISOString(),
    };
    this.themes.set(key, updated);
    return this.hydrateTheme(updated);
  }

  async applyProductStyleProposal(
    input: ApplyProductStyleProposalInput,
  ): Promise<ProductStyleProposalApplicationResult | null> {
    assertSafeProductStyleProposal(input.proposal);
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const proposalHash = productStyleProposalRequestHash(input);
    const key = this.key(input.workspaceId, input.themeId);
    const applicationKey = this.productStyleApplicationKey(
      input.workspaceId,
      input.themeId,
      input.proposal.proposalId,
    );
    const existingApplication = this.productStyleApplications.get(applicationKey);
    if (existingApplication) {
      const existingSources = (this.styleSources.get(key) ?? [])
        .filter((source) => source.proposalId === input.proposal.proposalId)
        .sort(compareStyleSourceOrdinal);
      assertProductStyleProposalReplay(input, proposalHash, existingApplication, existingSources);
      const current = this.themes.get(key);
      if (!current) return null;
      return {
        theme: this.hydrateTheme(current),
        sources: existingSources.map((source) => clone(source)),
        application: clone(existingApplication),
        draftChanged: existingApplication.receipt.draftChanged,
        replayed: true,
      };
    }

    const orphanedSources = (this.styleSources.get(key) ?? []).some(
      (source) => source.proposalId === input.proposal.proposalId,
    );
    if (orphanedSources) {
      throw new Error('Product match provenance exists without its canonical application receipt');
    }

    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('Product match actor is not a workspace member');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('environment not found in workspace');
    }

    const draftChanged = hashCanonicalJson(current.draft) !== hashCanonicalJson(input.draft);
    const now = new Date().toISOString();
    const appliedTheme: WorkspaceThemeRecord = draftChanged
      ? {
          ...current,
          draft: clone(input.draft),
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        }
      : current;
    const appliedThemeRevision = appliedTheme.revision;
    const sourceCount = input.proposal.sources.length;
    const sources = input.proposal.sources.map((source, sourceOrdinal): StyleSourceRecord => ({
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
      source: clone(source),
      sourceHash: hashCanonicalJson(source),
      createdByUserId: input.actorUserId,
      createdAt: now,
    }));
    const application = createProductStyleApplicationRecord({
      id: `product_style_application_${randomUUID()}`,
      input,
      requestHash: proposalHash,
      appliedTheme,
      sources,
      createdAt: now,
    });

    // Build every next collection before committing any map. This mirrors the
    // theme -> receipt -> provenance PostgreSQL transaction while keeping the
    // in-memory implementation all-or-nothing.
    const nextSources = [
      ...(this.styleSources.get(key) ?? []).map((source) => clone(source)),
      ...sources.map((source) => clone(source)),
    ];
    if (draftChanged) this.themes.set(key, appliedTheme);
    this.productStyleApplications.set(applicationKey, clone(application));
    this.styleSources.set(key, nextSources);
    return {
      theme: this.hydrateTheme(appliedTheme),
      sources: sources.map((source) => clone(source)),
      application: clone(application),
      draftChanged,
      replayed: false,
    };
  }

  async approveWorkspaceTheme(
    input: ApproveWorkspaceThemeInput,
  ): Promise<WorkspaceThemeApprovalResult | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    const versions = this.themeVersions.get(key) ?? [];
    const nextVersion = Math.max(0, ...versions.map((version) => version.version)) + 1;
    const now = new Date().toISOString();
    const approvedVersion = createWorkspaceThemeVersion(
      current,
      nextVersion,
      input.actorUserId,
      now,
    );
    this.appendThemeVersion(approvedVersion);
    const hasApprovedDefault = [...this.themes.values()].some(
      (theme) =>
        theme.workspaceId === input.workspaceId &&
        theme.isDefault &&
        theme.activeVersionId !== null,
    );
    const makeDefault = !hasApprovedDefault;
    if (makeDefault) {
      this.clearWorkspaceThemeDefault(input.workspaceId, input.actorUserId, now);
    }
    const updated: WorkspaceThemeRecord = {
      ...current,
      isDefault: makeDefault || current.isDefault,
      activeVersionId: approvedVersion.id,
      activeVersion: clone(approvedVersion),
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.themes.set(key, updated);
    return { theme: clone(updated), approvedVersion: clone(approvedVersion) };
  }

  async setDefaultWorkspaceTheme(
    input: SetDefaultWorkspaceThemeInput,
  ): Promise<WorkspaceThemeRecord | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    if (!current.activeVersionId) {
      throw new WorkspaceThemeApprovalRequiredError(current.id);
    }
    if (current.isDefault) return this.hydrateTheme(current);

    const now = new Date().toISOString();
    this.clearWorkspaceThemeDefault(input.workspaceId, input.actorUserId, now);
    const updated: WorkspaceThemeRecord = {
      ...current,
      isDefault: true,
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.themes.set(key, updated);
    return this.hydrateTheme(updated);
  }

  async listWorkspaceThemeImpact(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeImpactRecord[]> {
    const impacts: WorkspaceThemeImpactRecord[] = [];
    for (const entry of this.documents.values()) {
      if (entry.document.workspaceId !== workspaceId) continue;
      const binding = themeImpactBinding(entry.document, themeId);
      if (!binding) continue;
      const activeEnvironmentIds = [...this.documentDeployments.values()]
        .filter(
          (deployment) =>
            deployment.workspaceId === workspaceId &&
            deployment.documentId === entry.document.id &&
            deployment.state === 'active',
        )
        .map((deployment) => deployment.environmentId)
        .sort();
      impacts.push({
        documentId: entry.document.id,
        title: entry.document.title,
        status: entry.document.status,
        ...binding,
        latestArtifactThemeVersionId: entry.latestArtifact?.themeVersionId ?? null,
        activeEnvironmentIds,
      });
    }
    return impacts.sort(compareWorkspaceThemeImpact);
  }

  async createStyleSource(input: CreateStyleSourceInput): Promise<StyleSourceRecord> {
    assertSafeStyleSource(input.source);
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('style source creator is not a workspace member');
    }
    if (!this.themes.has(this.key(input.workspaceId, input.themeId))) {
      throw new Error('theme not found in workspace');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('environment not found in workspace');
    }
    const id = `style_source_${randomUUID()}`;
    const source: StyleSourceRecord = {
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
      appliedThemeRevision:
        this.themes.get(this.key(input.workspaceId, input.themeId))?.revision ?? 1,
      draftChanged: false,
      source: clone(input.source),
      sourceHash: hashCanonicalJson(input.source),
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendStyleSource(source);
    return clone(source);
  }

  async listStyleSources(workspaceId: string, themeId?: string): Promise<StyleSourceRecord[]> {
    return [...this.styleSources.values()]
      .flat()
      .filter(
        (source) => source.workspaceId === workspaceId && (!themeId || source.themeId === themeId),
      )
      .map((source) => clone(source))
      .sort(compareStyleSourceHistory);
  }

  async createBrandDriftRun(input: CreateBrandDriftRunInput): Promise<BrandDriftRunRecord> {
    assertBrandDriftReport(input.report);
    if (
      input.report.themeId !== input.themeId ||
      input.report.baselineThemeVersionId !== input.baselineThemeVersionId
    ) {
      throw new Error('Brand drift report theme identity does not match its persistence scope');
    }
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('Brand drift creator is not a workspace member');
    }
    if (!this.documents.has(this.key(input.workspaceId, input.documentId))) {
      throw new Error('Brand drift document not found in workspace');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('Brand drift environment not found in workspace');
    }
    if (!this.findThemeVersion(input.workspaceId, input.themeId, input.baselineThemeVersionId)) {
      throw new Error('Brand drift baseline theme version not found in workspace');
    }
    const existing = (
      this.brandDriftRuns.get(this.key(input.workspaceId, input.documentId)) ?? []
    ).find((run) => run.id === input.report.checkId);
    if (existing) throw new Error('Brand drift check identity already exists');
    const run: BrandDriftRunRecord = {
      id: input.report.checkId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      themeId: input.themeId,
      baselineThemeVersionId: input.baselineThemeVersionId,
      trigger: input.report.trigger,
      classification: input.report.classification,
      confidence: input.report.confidence,
      report: clone(input.report),
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendBrandDriftRun(run);
    return clone(run);
  }

  async listBrandDriftRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<BrandDriftRunRecord[]> {
    return (this.brandDriftRuns.get(this.key(workspaceId, documentId)) ?? [])
      .map((run) => clone(run))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
  }
}
