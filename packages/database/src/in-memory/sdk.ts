import { createDefaultEnvironmentReleasePolicy } from '@lodariq/schema';
import {
  EnvironmentReleasePolicyChangedError,
  assertValidWorkspaceEnvironmentPolicy,
  normalizeExactOrigin,
  normalizeIsoTimestamp,
  normalizeWorkspaceEnvironments,
  type UpdateEnvironmentReleasePolicyInput,
  type UpdateWorkspaceEnvironmentPolicyInput,
  type WorkspaceEnvironment,
} from '../domains/environments';
import {
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
  type PublicSdkInstallationWithOrigins,
  type ResolvedPublicSdkInstallation,
  type SetPublicSdkInstallationSuspensionInput,
} from '../domains/sdk-authoring';
import {
  type ConsumePublicSdkBootstrapGrantInput,
  type CreatePublicSdkBootstrapGrantInput,
  type GetOrCreatePublicSdkInstallationInput,
  type SetPublicSdkInstallationOriginInput,
  type SyncPublicSdkInstallationOriginsInput,
} from '../domains/documents';
import {
  assertPublicSdkBootstrapGrantHash,
  assertPublicSdkBootstrapGrantLifetime,
  assertPublicSdkInstallationEnvironmentOrigin,
  assertPublicSdkInstallationEnvironmentPolicy,
  assertPublicSdkInstallationId,
  assertPublicSdkInstallationOriginPolicy,
  isPublicSdkBootstrapGrantHash,
  requireExactHttpOrigin,
} from '../domains/authoring-policy';
import { assertRequiredApprovalCount } from '../domains/theme-policy';
import {
  clone,
  comparePublicSdkInstallationOrigins,
  comparePublicSdkInstallations,
} from '../domains/in-memory-helpers';
import { InMemoryRepositoryReleasePromotion } from './release-promotion';

export class InMemoryRepositorySdk extends InMemoryRepositoryReleasePromotion {
  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    const normalized = normalizeWorkspaceEnvironments(
      [...this.environments.values()].filter(
        (environment) => environment.workspaceId === workspaceId,
      ),
    );
    if (normalized.length > 0 && this.workspaces.has(workspaceId)) {
      assertValidWorkspaceEnvironmentPolicy(workspaceId, normalized);
    }
    return normalized.map((environment) => clone(environment));
  }

  async updateEnvironmentReleasePolicy(
    input: UpdateEnvironmentReleasePolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    assertRequiredApprovalCount(input.requiredApprovalCount);
    const key = this.key(input.workspaceId, input.environmentId);
    const current = this.environments.get(key);
    if (!current) return null;
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'environment release policy expectedUpdatedAt',
    );
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, current.updatedAt);
    }
    const updated: WorkspaceEnvironment = {
      ...current,
      requiredApprovalCount: input.requiredApprovalCount,
      releasePolicy: {
        ...(current.releasePolicy ?? createDefaultEnvironmentReleasePolicy(current.kind)),
        requiredApprovalCount: input.requiredApprovalCount,
      },
      updatedAt: new Date().toISOString(),
    };
    this.environments.set(key, updated);
    return (
      normalizeWorkspaceEnvironments([updated]).map((environment) => clone(environment))[0] ?? null
    );
  }

  async updateWorkspaceEnvironmentPolicy(
    input: UpdateWorkspaceEnvironmentPolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    const key = this.key(input.workspaceId, input.environmentId);
    const current = this.environments.get(key);
    if (!current) return null;
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'workspace environment policy expectedUpdatedAt',
    );
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, current.updatedAt);
    }
    const candidate: WorkspaceEnvironment = {
      ...current,
      name: input.name,
      originAllowlist: [...input.originAllowlist],
      requiredApprovalCount: input.releasePolicy.requiredApprovalCount,
      enabled: input.enabled,
      pipelinePosition: input.pipelinePosition,
      authoringEnabled: input.authoringEnabled,
      releasePolicy: clone(input.releasePolicy),
      updatedAt: new Date().toISOString(),
    };
    if (input.promotionSourceEnvironmentId) {
      candidate.promotionSourceEnvironmentId = input.promotionSourceEnvironmentId;
    } else {
      delete candidate.promotionSourceEnvironmentId;
    }
    const workspaceRows = [...this.environments.values()].filter(
      (environment) => environment.workspaceId === input.workspaceId,
    );
    const candidates = workspaceRows.map((environment) =>
      environment.id === input.environmentId ? candidate : environment,
    );
    assertValidWorkspaceEnvironmentPolicy(input.workspaceId, candidates);
    this.environments.set(key, candidate);
    return (
      normalizeWorkspaceEnvironments(candidates)
        .filter((environment) => environment.id === input.environmentId)
        .map((environment) => clone(environment))[0] ?? null
    );
  }

  async listPublicSdkInstallations(
    workspaceId: string,
  ): Promise<PublicSdkInstallationWithOrigins[]> {
    return [...this.publicSdkInstallations.values()]
      .filter((installation) => installation.workspaceId === workspaceId)
      .map((installation) => ({
        ...clone(installation),
        origins: this.publicSdkInstallationOrigins
          .filter(
            (origin) =>
              origin.workspaceId === workspaceId &&
              origin.installationId === installation.installationId,
          )
          .map((origin) => clone(origin))
          .sort(comparePublicSdkInstallationOrigins),
      }))
      .sort(comparePublicSdkInstallations);
  }

  async getOrCreatePublicSdkInstallation(
    input: GetOrCreatePublicSdkInstallationInput,
  ): Promise<PublicSdkInstallationRecord> {
    assertPublicSdkInstallationId(input.installationId);
    const existing = this.publicSdkInstallations.get(input.installationId);
    if (existing?.workspaceId === input.workspaceId && !existing.revokedAt) {
      return clone(existing);
    }
    if (existing) {
      throw new Error('public SDK installation id already exists');
    }

    const now = new Date().toISOString();
    const installation: PublicSdkInstallationRecord = {
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      name: input.name,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      suspendedAt: null,
    };
    this.publicSdkInstallations.set(installation.installationId, installation);
    return clone(installation);
  }

  async setPublicSdkInstallationOrigin(
    input: SetPublicSdkInstallationOriginInput,
  ): Promise<PublicSdkInstallationOriginRecord> {
    const installation = this.publicSdkInstallations.get(input.installationId);
    if (!installation || installation.workspaceId !== input.workspaceId || installation.revokedAt) {
      throw new Error('active public SDK installation not found in workspace');
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) throw new Error('environment not found in workspace');
    assertPublicSdkInstallationEnvironmentPolicy(environment, input.authoringEnabled);
    const exactOrigin = requireExactHttpOrigin(input.origin);
    assertPublicSdkInstallationOriginPolicy(environment.kind, exactOrigin, input.authoringEnabled);
    assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);
    const now = new Date().toISOString();
    const existingIndex = this.publicSdkInstallationOrigins.findIndex(
      (candidate) =>
        candidate.installationId === input.installationId && candidate.exactOrigin === exactOrigin,
    );
    const existing = this.publicSdkInstallationOrigins[existingIndex];
    if (
      existing &&
      (existing.environmentId !== input.environmentId ||
        existing.authoringEnabled !== input.authoringEnabled)
    ) {
      this.invalidateAuthoringSessionsForInstallationOrigin(
        input.workspaceId,
        input.installationId,
        exactOrigin,
      );
    }
    const mapping: PublicSdkInstallationOriginRecord = {
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      exactOrigin,
      authoringEnabled: input.authoringEnabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingIndex === -1) {
      this.publicSdkInstallationOrigins.push(mapping);
    } else {
      this.publicSdkInstallationOrigins.splice(existingIndex, 1, mapping);
    }
    return clone(mapping);
  }

  async syncPublicSdkInstallationOrigins(
    input: SyncPublicSdkInstallationOriginsInput,
  ): Promise<PublicSdkInstallationOriginRecord[]> {
    if (input.origins.length > 100) {
      throw new Error('public SDK installation origin sync exceeds the maximum mapping count');
    }
    const installation = this.publicSdkInstallations.get(input.installationId);
    if (!installation || installation.workspaceId !== input.workspaceId || installation.revokedAt) {
      throw new Error('active public SDK installation not found in workspace');
    }

    const now = new Date().toISOString();
    const existingOrigins = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.workspaceId === input.workspaceId &&
        candidate.installationId === input.installationId,
    );
    const existingByOrigin = new Map(
      existingOrigins.map((candidate) => [candidate.exactOrigin, candidate] as const),
    );
    const desiredOrigins: PublicSdkInstallationOriginRecord[] = [];
    const seenOrigins = new Set<string>();
    for (const candidate of input.origins) {
      const environment = this.environments.get(
        this.key(input.workspaceId, candidate.environmentId),
      );
      if (!environment) throw new Error('environment not found in workspace');
      assertPublicSdkInstallationEnvironmentPolicy(environment, candidate.authoringEnabled);
      const exactOrigin = requireExactHttpOrigin(candidate.origin);
      assertPublicSdkInstallationOriginPolicy(
        environment.kind,
        exactOrigin,
        candidate.authoringEnabled,
      );
      assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);
      if (seenOrigins.has(exactOrigin)) {
        throw new Error('public SDK origin mappings must use unique exact origins');
      }
      seenOrigins.add(exactOrigin);
      desiredOrigins.push({
        installationId: input.installationId,
        workspaceId: input.workspaceId,
        environmentId: candidate.environmentId,
        exactOrigin,
        authoringEnabled: candidate.authoringEnabled,
        createdAt: existingByOrigin.get(exactOrigin)?.createdAt ?? now,
        updatedAt: now,
      });
    }

    const desiredByOrigin = new Map(
      desiredOrigins.map((candidate) => [candidate.exactOrigin, candidate] as const),
    );
    for (const existing of existingOrigins) {
      const replacement = desiredByOrigin.get(existing.exactOrigin);
      if (
        replacement?.environmentId === existing.environmentId &&
        replacement.authoringEnabled === existing.authoringEnabled
      ) {
        continue;
      }
      this.invalidateAuthoringSessionsForInstallationOrigin(
        input.workspaceId,
        input.installationId,
        existing.exactOrigin,
      );
    }

    const retainedOrigins = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.workspaceId !== input.workspaceId ||
        candidate.installationId !== input.installationId,
    );
    this.publicSdkInstallationOrigins.splice(
      0,
      this.publicSdkInstallationOrigins.length,
      ...retainedOrigins,
      ...desiredOrigins,
    );
    return desiredOrigins.map((origin) => clone(origin)).sort(comparePublicSdkInstallationOrigins);
  }

  async resolvePublicSdkInstallation(
    installationId: string,
    origin: string,
  ): Promise<ResolvedPublicSdkInstallation | null> {
    const exactOrigin = normalizeExactOrigin(origin);
    if (!exactOrigin) return null;
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.revokedAt) return null;

    const mappings = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.installationId === installationId &&
        candidate.workspaceId === installation.workspaceId &&
        candidate.exactOrigin === exactOrigin,
    );
    if (mappings.length !== 1) return null;
    const [mapping] = mappings;
    if (!mapping) return null;
    const environment = this.environments.get(this.key(mapping.workspaceId, mapping.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      !environment.originAllowlist.includes(exactOrigin)
    ) {
      return null;
    }

    return clone({
      installation,
      environment,
      exactOrigin,
      authoringEnabled:
        environment.kind === 'production'
          ? false
          : environment.authoringEnabled !== false && mapping.authoringEnabled,
    });
  }

  async revokePublicSdkInstallation(
    workspaceId: string,
    installationId: string,
    _actorUserId: string,
  ): Promise<PublicSdkInstallationRecord | null> {
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.workspaceId !== workspaceId) return null;
    const revokedInstallation: PublicSdkInstallationRecord = {
      ...installation,
      revokedAt: installation.revokedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.publicSdkInstallations.set(installationId, revokedInstallation);
    return clone(revokedInstallation);
  }

  async setPublicSdkInstallationSuspension(
    input: SetPublicSdkInstallationSuspensionInput,
  ): Promise<PublicSdkInstallationRecord | null> {
    const installation = this.publicSdkInstallations.get(input.installationId);
    if (!installation || installation.workspaceId !== input.workspaceId || installation.revokedAt) {
      return null;
    }
    const now = new Date().toISOString();
    const updated: PublicSdkInstallationRecord = {
      ...installation,
      // Re-suspending keeps the original timestamp so the pause reads as one
      // continuous incident rather than restarting on every dashboard click.
      suspendedAt: input.suspended ? (installation.suspendedAt ?? now) : null,
      updatedAt: now,
    };
    this.publicSdkInstallations.set(input.installationId, updated);
    return clone(updated);
  }

  async createPublicSdkBootstrapGrant(
    input: CreatePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord> {
    assertPublicSdkBootstrapGrantLifetime(input.expiresAt);
    assertPublicSdkBootstrapGrantHash(input.grantHash);
    if (
      [...this.publicSdkBootstrapGrants.values()].some(
        (candidate) => candidate.grantHash === input.grantHash,
      )
    ) {
      throw new Error('bootstrap grant hash already exists');
    }
    const resolved = await this.resolvePublicSdkInstallation(
      input.installationId,
      input.exactOrigin,
    );
    if (
      !resolved ||
      !resolved.authoringEnabled ||
      resolved.installation.workspaceId !== input.workspaceId ||
      resolved.environment.id !== input.environmentId
    ) {
      throw new Error('authoring-enabled public SDK installation origin not found');
    }

    const createdAt = new Date().toISOString();
    const grant: PublicSdkBootstrapGrantRecord = {
      id: `sdkboot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      exactOrigin: resolved.exactOrigin,
      grantHash: input.grantHash,
      createdAt,
      expiresAt: input.expiresAt,
      consumedAt: null,
      revokedAt: null,
    };
    this.publicSdkBootstrapGrants.set(grant.id, grant);
    return clone(grant);
  }

  async consumePublicSdkBootstrapGrant(
    input: ConsumePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isPublicSdkBootstrapGrantHash(input.grantHash)) return null;
    const candidates = [...this.publicSdkBootstrapGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.grantHash &&
        !candidate.consumedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant) return null;
    const resolved = await this.resolvePublicSdkInstallation(input.installationId, exactOrigin);
    if (
      !resolved ||
      !resolved.authoringEnabled ||
      resolved.installation.workspaceId !== grant.workspaceId ||
      resolved.environment.id !== grant.environmentId
    ) {
      return null;
    }

    const consumedGrant = { ...grant, consumedAt: new Date().toISOString() };
    this.publicSdkBootstrapGrants.set(consumedGrant.id, consumedGrant);
    return clone(consumedGrant);
  }
}
