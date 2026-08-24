import type { AnalyticsPartitionMaintenanceResult } from '../domains/analytics-partitions';
import { createHash, randomUUID } from 'node:crypto';
import { type AnalyticsEventAggregate } from '@lodariq/schema';
import { assertWorkspaceScope } from '../rls';
import { getAuthoringDocumentSessionCapabilities } from '../domains/authoring-policy';
import { type CreateVisualCheckRunInput, type VisualCheckRunRecord } from '../domains/themes';
import {
  type AcknowledgeDocumentThemeInput,
  type AuthoringSessionRecord,
  type EnvironmentTokenRecord,
} from '../domains/sdk-authoring';
import {
  type CreateAuthoringSessionInput,
  type CreateEnvironmentTokenInput,
  type PersistedDocument,
  type RevokeAuthoringSessionInput,
} from '../domains/documents';
import {
  DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT,
  analyticsAggregateKey,
  analyticsContentLocale,
  analyticsTargetResolutionStatus,
  assertAnalyticsEnvironmentQuery,
  assertAuthoritativeAnalyticsBatch,
  compareAnalyticsAggregates,
  compareAnalyticsEventsNewestFirst,
  type IngestAuthoritativeEventsInput,
  type IngestEventsInput,
  type PersistedAnalyticsEventRecord,
  type QueryAnalyticsEventsInput,
  type ResolvedEnvironmentToken,
} from '../domains/analytics';
import { assertArtifactMatchesDocument, isSha256Hash } from '../domains/authoring-policy';
import { assertCommercialFeature } from '../domains/commercial-entitlements';
import { assertVisualCheckReport } from '../domains/theme-policy';
import { clone, compareVisualCheckRuns } from '../domains/in-memory-helpers';
import { InMemoryRepositoryAuthoringActivation } from './authoring-activation';

export class InMemoryRepositoryAnalytics extends InMemoryRepositoryAuthoringActivation {
  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return [...this.environmentTokens.values()]
      .filter((token) => token.workspaceId === workspaceId)
      .map((token) => clone(token))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    const token = [...this.environmentTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash && !candidate.revokedAt,
    );
    if (!token) return null;
    const environment = this.environments.get(this.key(token.workspaceId, token.environmentId));
    if (!environment || environment.enabled === false) return null;
    return clone({
      ...token,
      environment: environment.kind,
      originAllowlist: environment.originAllowlist,
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment || environment.enabled === false) {
      throw new Error('environment not found in workspace');
    }
    const token: EnvironmentTokenRecord = {
      id: `envtok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      name: input.name,
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      ...(input.clientToken ? { clientToken: input.clientToken } : {}),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.environmentTokens.set(this.key(token.workspaceId, token.id), token);
    return clone(token);
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    const key = this.key(workspaceId, tokenId);
    const token = this.environmentTokens.get(key);
    if (!token) return null;

    const revokedAt = token.revokedAt ?? new Date().toISOString();
    const revokedToken = { ...token, revokedAt };
    this.environmentTokens.set(key, revokedToken);
    return clone(revokedToken);
  }

  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      environment.kind === 'production'
    ) {
      throw new Error('environment not found in workspace');
    }
    if (!this.hasAuthoringMembership(input.workspaceId, input.actorUserId)) {
      throw new Error('authoring session creator is not an active workspace member');
    }
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!document) {
      throw new Error('document not found in workspace');
    }
    const compatibility = this.resolveAuthoringSessionCompatibility(document.document);
    if (!compatibility) {
      throw new Error('document theme is unavailable for an authoring session');
    }
    const session: AuthoringSessionRecord = {
      id: `authsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: input.documentId,
      correlationId: input.correlationId,
      tokenHash: input.tokenHash,
      iframeSrc: input.iframeSrc,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      // Never leave this unset: an absent list grants nothing, so a session
      // created without one would be inert rather than permissive.
      capabilities: getAuthoringDocumentSessionCapabilities(environment.kind),
      ...compatibility,
    };
    this.authoringSessions.set(this.key(session.workspaceId, session.id), session);
    return clone(session);
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!session) return null;
    const environment = this.environments.get(this.key(session.workspaceId, session.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      environment.kind === 'production'
    ) {
      return null;
    }
    if (!this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)) return null;
    return clone(session);
  }

  async resolveAuthoringSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    if (!isSha256Hash(tokenHash)) return null;
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (session) {
      const environment = this.environments.get(
        this.key(session.workspaceId, session.environmentId),
      );
      if (
        !environment ||
        environment.enabled === false ||
        environment.authoringEnabled === false ||
        environment.kind === 'production'
      ) {
        return null;
      }
      if (!this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)) return null;
    }
    if (session?.installationId && session.customerOrigin) {
      const scope = this.resolveActiveAuthoringScope(
        session.installationId,
        session.customerOrigin,
      );
      if (
        !scope ||
        scope.installation.workspaceId !== session.workspaceId ||
        scope.environment.id !== session.environmentId
      ) {
        return null;
      }
    }
    return session ? clone(session) : null;
  }

  async acknowledgeDocumentTheme(
    input: AcknowledgeDocumentThemeInput,
  ): Promise<PersistedDocument | null> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);
    const key = this.key(input.workspaceId, input.sessionId);
    const session = this.authoringSessions.get(key);
    const documentKey = this.key(input.workspaceId, input.documentId);
    const current = this.documents.get(documentKey);
    const binding = current?.document.themeBinding;
    const nextBinding = input.document.themeBinding;
    const theme = binding
      ? this.themes.get(this.key(input.workspaceId, binding.themeId))
      : undefined;
    if (
      !session ||
      !current ||
      current.updatedAt !== input.expectedDocumentUpdatedAt ||
      !binding ||
      binding.policy !== 'workspace-current' ||
      binding.acknowledgedThemeVersionId !== input.expectedThemeVersionId ||
      !nextBinding ||
      nextBinding.policy !== 'workspace-current' ||
      nextBinding.themeId !== binding.themeId ||
      nextBinding.acknowledgedThemeVersionId !== input.reviewedThemeVersionId ||
      input.document.id !== input.documentId ||
      theme?.activeVersionId !== input.reviewedThemeVersionId ||
      session.documentId !== input.documentId ||
      session.createdByUserId !== input.actorUserId ||
      session.themeVersionId !== input.expectedThemeVersionId ||
      session.revokedAt ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const documentVersion = this.createDocumentVersion(input, now);
    const latestArtifact = this.persistCompiledArtifact(
      input.workspaceId,
      input.documentId,
      documentVersion.id,
      input.artifact,
      now,
    );
    const saved: PersistedDocument = {
      document: clone(input.document),
      createdByUserId: current.createdByUserId,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      latestArtifact: clone(latestArtifact),
    };
    this.documents.set(documentKey, saved);
    this.authoringSessions.set(key, {
      ...session,
      themeVersionId: input.reviewedThemeVersionId,
    });
    return clone(saved);
  }

  async revokeAuthoringSession(
    input: RevokeAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord | null> {
    if (!input.sessionId.trim() || !isSha256Hash(input.tokenHash)) return null;
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.id === input.sessionId &&
        candidate.tokenHash === input.tokenHash &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!session) return null;

    if (session.installationId && session.customerOrigin) {
      const scope = this.resolveActiveAuthoringScope(
        session.installationId,
        session.customerOrigin,
      );
      if (
        !scope ||
        scope.installation.workspaceId !== session.workspaceId ||
        scope.environment.id !== session.environmentId ||
        !this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)
      ) {
        return null;
      }
    }

    const revoked = { ...session, revokedAt: session.revokedAt ?? new Date().toISOString() };
    this.authoringSessions.set(this.key(revoked.workspaceId, revoked.id), revoked);
    return clone(revoked);
  }

  /** Partitions are a PostgreSQL storage detail; there is nothing to maintain here. */
  async maintainAnalyticsEventPartitions(): Promise<AnalyticsPartitionMaintenanceResult> {
    return { created: [], dropped: [] };
  }

  async createVisualCheckRun(input: CreateVisualCheckRunInput): Promise<VisualCheckRunRecord> {
    assertVisualCheckReport(input.report);
    if (!/^sha256-[0-9a-f]{64}$/u.test(input.contentHash)) {
      throw new Error('visual check contentHash must be a SHA-256 content hash');
    }
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!document) throw new Error('visual check document not found in workspace');
    const documentVersion = (
      this.documentVersions.get(this.key(input.workspaceId, input.documentId)) ?? []
    ).find((version) => version.id === input.documentVersionId);
    if (!documentVersion) {
      throw new Error('visual check document version not found in workspace');
    }
    const artifact = this.compiledArtifactsById.get(
      this.key(input.workspaceId, input.compiledArtifactId),
    );
    if (
      !artifact ||
      artifact.documentId !== input.documentId ||
      artifact.documentVersionId !== input.documentVersionId ||
      artifact.contentHash !== input.contentHash
    ) {
      throw new Error('visual check compiled artifact identity mismatch');
    }
    if (artifact.themeVersionId !== input.themeVersionId) {
      throw new Error('visual check theme version does not match compiled artifact');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('visual check environment not found in workspace');
    }

    const run: VisualCheckRunRecord = {
      id: `vcheck_${randomUUID()}`,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      compiledArtifactId: input.compiledArtifactId,
      themeVersionId: input.themeVersionId,
      environmentId: input.environmentId,
      contentHash: input.contentHash,
      report: clone(input.report),
      status: input.report.status,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendVisualCheckRun(run);
    return clone(run);
  }

  async listVisualCheckRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<VisualCheckRunRecord[]> {
    return (this.visualCheckRuns.get(this.key(workspaceId, documentId)) ?? [])
      .map((run) => clone(run))
      .sort(compareVisualCheckRuns);
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    for (const event of input.events) {
      this.events.push({ workspaceId: input.workspaceId, event: clone(event) });
    }
    return input.events.length;
  }

  async ingestAuthoritativeEvents(input: IngestAuthoritativeEventsInput): Promise<number> {
    assertAuthoritativeAnalyticsBatch(input);
    const ingestedAt = new Date().toISOString();
    const records = input.events.map((event) => {
      return {
        ...clone(event),
        id: `aevt_${randomUUID()}`,
        ingestedAt,
        ...(input.adaptiveVisitorKeyHash
          ? { adaptiveVisitorKeyHash: input.adaptiveVisitorKeyHash }
          : {}),
      } satisfies PersistedAnalyticsEventRecord;
    });

    this.analyticsEvents.push(...records);
    for (const event of input.events) {
      if (event.name !== 'experience_shown' || !event.engagementKey) continue;
      const period = calendarMonthPeriod(event.timestamp);
      const dedupeKeyHash = engagementDedupeHash(
        input.workspaceId,
        input.environmentId,
        event.engagementKey,
      );
      const key = this.key(
        input.workspaceId,
        input.environmentId,
        'engaged-users',
        period.start.toISOString(),
        dedupeKeyHash,
      );
      if (this.workspaceUsageLedger.has(key)) continue;
      this.workspaceUsageLedger.set(key, {
        id: `usage_${randomUUID()}`,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        scopeKey: input.environmentId,
        metric: 'engaged-users',
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        quantity: 1,
        dedupeKeyHash,
        occurredAt: new Date(event.timestamp).toISOString(),
        createdAt: ingestedAt,
      });
    }
    return records.length;
  }

  async listAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
    if (input.query.audienceSegmentId) {
      assertCommercialFeature(entitlements, 'audience-segment-results');
    }
    return this.matchingAnalyticsEvents(input)
      .sort(compareAnalyticsEventsNewestFirst)
      .slice(0, input.query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT)
      .map(({ adaptiveVisitorKeyHash: _internalHash, audienceSegment, ...event }) =>
        clone(includeAudienceSegments && audienceSegment ? { ...event, audienceSegment } : event),
      );
  }

  async aggregateAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<AnalyticsEventAggregate[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    const entitlements = this.resolveWorkspaceEntitlements(input.workspaceId).entitlements;
    const includeAudienceSegments = entitlements.features.includes('audience-segment-results');
    if (input.query.audienceSegmentId) {
      assertCommercialFeature(entitlements, 'audience-segment-results');
    }
    const aggregates = new Map<string, AnalyticsEventAggregate>();
    for (const event of this.matchingAnalyticsEvents(input)) {
      const key = analyticsAggregateKey(event, includeAudienceSegments);
      const timestamp = new Date(event.timestamp).toISOString();
      const current = aggregates.get(key);
      if (current) {
        current.count += 1;
        if (timestamp < current.firstTimestamp) current.firstTimestamp = timestamp;
        if (timestamp > current.lastTimestamp) current.lastTimestamp = timestamp;
        continue;
      }
      const contentLocale = analyticsContentLocale(event);
      const dimensions = {
        workspaceId: event.workspaceId,
        environmentId: event.environmentId,
        documentId: event.documentId,
        publicationId: event.publicationId,
        contentHash: event.contentHash,
        pointerGeneration: event.pointerGeneration,
        ...(event.experimentId
          ? {
              experimentId: event.experimentId,
              armId: event.armId!,
              experimentAllocationRevision: event.experimentAllocationRevision!,
            }
          : {}),
        ...(includeAudienceSegments && event.audienceSegment
          ? { audienceSegment: structuredClone(event.audienceSegment) }
          : {}),
        ...(contentLocale ? { locale: contentLocale } : {}),
        count: 1,
        firstTimestamp: timestamp,
        lastTimestamp: timestamp,
      };
      aggregates.set(
        key,
        event.name === 'target_resolution'
          ? {
              ...dimensions,
              name: 'target_resolution',
              targetResolutionStatus: analyticsTargetResolutionStatus(event),
            }
          : { ...dimensions, name: event.name },
      );
    }
    return [...aggregates.values()]
      .sort(compareAnalyticsAggregates)
      .slice(0, input.query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT)
      .map((aggregate) => clone(aggregate));
  }
}

function calendarMonthPeriod(at: string): { start: Date; end: Date } {
  const date = new Date(at);
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
  };
}

function engagementDedupeHash(
  workspaceId: string,
  environmentId: string,
  engagementKey: string,
): string {
  return `sha256-${createHash('sha256')
    .update(`${workspaceId}\0${environmentId}\0${engagementKey}`)
    .digest('hex')}`;
}
