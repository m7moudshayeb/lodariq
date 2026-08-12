import { and, asc, desc, eq } from 'drizzle-orm';
import {
  type GetOrCreatePublicSdkInstallationInput,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
  type PublicSdkInstallationWithOrigins,
  type SetPublicSdkInstallationOriginInput,
  type SyncPublicSdkInstallationOriginsInput,
  assertPublicSdkInstallationId,
  assertPublicSdkInstallationOriginPolicy,
  assertPublicSdkInstallationEnvironmentPolicy,
  assertPublicSdkInstallationEnvironmentOrigin,
  requireExactHttpOrigin,
} from '../repository';
import {
  authoringSessions,
  environments,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
} from '../schema';
import {
  toPublicSdkInstallationRecord,
  toPublicSdkInstallationOriginRecord,
  comparePublicSdkInstallationOriginRecords,
} from './helpers';
import { DrizzleRepositoryEnvironments } from './environments';

export class DrizzleRepositorySdkOrigins extends DrizzleRepositoryEnvironments {
  async listPublicSdkInstallations(
    workspaceId: string,
  ): Promise<PublicSdkInstallationWithOrigins[]> {
    return this.scoped(workspaceId, async (tx) => {
      const installationRows = await tx
        .select()
        .from(publicSdkInstallations)
        .where(eq(publicSdkInstallations.workspaceId, workspaceId))
        .orderBy(desc(publicSdkInstallations.updatedAt), asc(publicSdkInstallations.id));
      const originRows = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(eq(publicSdkInstallationOrigins.workspaceId, workspaceId))
        .orderBy(
          asc(publicSdkInstallationOrigins.installationId),
          asc(publicSdkInstallationOrigins.environmentId),
          asc(publicSdkInstallationOrigins.exactOrigin),
        );
      const originsByInstallation = new Map<string, PublicSdkInstallationOriginRecord[]>();
      for (const origin of originRows) {
        const records = originsByInstallation.get(origin.installationId) ?? [];
        records.push(toPublicSdkInstallationOriginRecord(origin));
        originsByInstallation.set(origin.installationId, records);
      }

      return installationRows.map((installation) => ({
        ...toPublicSdkInstallationRecord(installation),
        origins: originsByInstallation.get(installation.id) ?? [],
      }));
    });
  }

  async getOrCreatePublicSdkInstallation(
    input: GetOrCreatePublicSdkInstallationInput,
  ): Promise<PublicSdkInstallationRecord> {
    assertPublicSdkInstallationId(input.installationId);
    return this.scoped(input.workspaceId, async (tx) => {
      const existing = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (existing) {
        if (existing.revokedAt) throw new Error('public SDK installation id already exists');
        return toPublicSdkInstallationRecord(existing);
      }

      const now = new Date();
      const [inserted] = await tx
        .insert(publicSdkInstallations)
        .values({
          id: input.installationId,
          workspaceId: input.workspaceId,
          name: input.name,
          createdByUserId: input.actorUserId,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return toPublicSdkInstallationRecord(inserted);

      const raced = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!raced || raced.revokedAt) {
        throw new Error('public SDK installation id already exists');
      }
      return toPublicSdkInstallationRecord(raced);
    });
  }

  async setPublicSdkInstallationOrigin(
    input: SetPublicSdkInstallationOriginInput,
  ): Promise<PublicSdkInstallationOriginRecord> {
    const exactOrigin = requireExactHttpOrigin(input.origin);
    return this.scoped(input.workspaceId, async (tx) => {
      const installation = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!installation || installation.revokedAt) {
        throw new Error('active public SDK installation not found in workspace');
      }
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      assertPublicSdkInstallationEnvironmentPolicy(environment, input.authoringEnabled);
      assertPublicSdkInstallationOriginPolicy(
        environment.kind,
        exactOrigin,
        input.authoringEnabled,
      );
      assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);

      const [existingMapping] = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(
          and(
            eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, input.installationId),
            eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
          ),
        )
        .limit(1);
      if (
        existingMapping &&
        (existingMapping.environmentId !== input.environmentId ||
          existingMapping.authoringEnabled !== input.authoringEnabled)
      ) {
        await tx
          .delete(authoringSessions)
          .where(
            and(
              eq(authoringSessions.workspaceId, input.workspaceId),
              eq(authoringSessions.installationId, input.installationId),
              eq(authoringSessions.customerOrigin, exactOrigin),
            ),
          );
        await tx
          .delete(publicSdkInstallationOrigins)
          .where(
            and(
              eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
              eq(publicSdkInstallationOrigins.installationId, input.installationId),
              eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
            ),
          );
      }

      const now = new Date();
      const [mapping] = await tx
        .insert(publicSdkInstallationOrigins)
        .values({
          installationId: input.installationId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          exactOrigin,
          authoringEnabled: input.authoringEnabled,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            publicSdkInstallationOrigins.installationId,
            publicSdkInstallationOrigins.exactOrigin,
          ],
          set: {
            environmentId: input.environmentId,
            authoringEnabled: input.authoringEnabled,
            updatedAt: now,
          },
        })
        .returning();
      if (!mapping) throw new Error('failed to persist public SDK installation origin');
      return toPublicSdkInstallationOriginRecord(mapping);
    });
  }

  async syncPublicSdkInstallationOrigins(
    input: SyncPublicSdkInstallationOriginsInput,
  ): Promise<PublicSdkInstallationOriginRecord[]> {
    if (input.origins.length > 100) {
      throw new Error('public SDK installation origin sync exceeds the maximum mapping count');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const installation = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!installation || installation.revokedAt) {
        throw new Error('active public SDK installation not found in workspace');
      }

      const environmentRows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, input.workspaceId));
      const environmentById = new Map(
        environmentRows.map((environment) => [environment.id, environment] as const),
      );
      const desired = new Map<
        string,
        { environmentId: string; exactOrigin: string; authoringEnabled: boolean }
      >();
      for (const candidate of input.origins) {
        const environment = environmentById.get(candidate.environmentId);
        if (!environment) throw new Error('environment not found in workspace');
        assertPublicSdkInstallationEnvironmentPolicy(environment, candidate.authoringEnabled);
        const exactOrigin = requireExactHttpOrigin(candidate.origin);
        assertPublicSdkInstallationOriginPolicy(
          environment.kind,
          exactOrigin,
          candidate.authoringEnabled,
        );
        assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);
        if (desired.has(exactOrigin)) {
          throw new Error('public SDK origin mappings must use unique exact origins');
        }
        desired.set(exactOrigin, {
          environmentId: candidate.environmentId,
          exactOrigin,
          authoringEnabled: candidate.authoringEnabled,
        });
      }

      const existing = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(
          and(
            eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, input.installationId),
          ),
        );
      for (const current of existing) {
        const replacement = desired.get(current.exactOrigin);
        if (
          replacement?.environmentId === current.environmentId &&
          replacement.authoringEnabled === current.authoringEnabled
        ) {
          continue;
        }
        await tx
          .delete(authoringSessions)
          .where(
            and(
              eq(authoringSessions.workspaceId, input.workspaceId),
              eq(authoringSessions.installationId, input.installationId),
              eq(authoringSessions.customerOrigin, current.exactOrigin),
            ),
          );
        await tx
          .delete(publicSdkInstallationOrigins)
          .where(
            and(
              eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
              eq(publicSdkInstallationOrigins.installationId, input.installationId),
              eq(publicSdkInstallationOrigins.exactOrigin, current.exactOrigin),
            ),
          );
      }

      const now = new Date();
      const synchronized: PublicSdkInstallationOriginRecord[] = [];
      for (const candidate of desired.values()) {
        const [mapping] = await tx
          .insert(publicSdkInstallationOrigins)
          .values({
            installationId: input.installationId,
            workspaceId: input.workspaceId,
            environmentId: candidate.environmentId,
            exactOrigin: candidate.exactOrigin,
            authoringEnabled: candidate.authoringEnabled,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              publicSdkInstallationOrigins.installationId,
              publicSdkInstallationOrigins.exactOrigin,
            ],
            set: {
              environmentId: candidate.environmentId,
              authoringEnabled: candidate.authoringEnabled,
              updatedAt: now,
            },
          })
          .returning();
        if (!mapping) throw new Error('failed to synchronize public SDK installation origin');
        synchronized.push(toPublicSdkInstallationOriginRecord(mapping));
      }

      return synchronized.sort(comparePublicSdkInstallationOriginRecords);
    });
  }
}
