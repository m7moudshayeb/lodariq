import { and, eq } from 'drizzle-orm';
import { type ControlPlaneRole } from '@lodariq/schema';
import { type ReleaseRecoveryScopeInput, type WorkspaceEnvironment } from '../repository';
import {
  documentDeployments,
  documents,
  environments,
  publicSdkInstallations,
  workspaceMemberships,
} from '../schema';
import type { LodariqTransaction } from './types';
import { identityWorkspaceRole, toWorkspaceEnvironment } from './helpers';
import { DrizzleRepositoryGenericHelpers } from './generic-helpers';

export class DrizzleRepositorySdkHelpers extends DrizzleRepositoryGenericHelpers {
  protected async findPublicSdkInstallation(
    tx: LodariqTransaction,
    workspaceId: string,
    installationId: string,
  ): Promise<typeof publicSdkInstallations.$inferSelect | null> {
    const [installation] = await tx
      .select()
      .from(publicSdkInstallations)
      .where(
        and(
          eq(publicSdkInstallations.workspaceId, workspaceId),
          eq(publicSdkInstallations.id, installationId),
        ),
      )
      .limit(1);
    return installation ?? null;
  }

  protected async findDocumentDeployment(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .select()
      .from(documentDeployments)
      .where(
        and(
          eq(documentDeployments.workspaceId, workspaceId),
          eq(documentDeployments.environmentId, environmentId),
          eq(documentDeployments.documentId, documentId),
        ),
      )
      .limit(1);
    return deployment ?? null;
  }

  protected async findDocumentDeploymentForUpdate(
    tx: LodariqTransaction,
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .select()
      .from(documentDeployments)
      .where(
        and(
          eq(documentDeployments.workspaceId, input.workspaceId),
          eq(documentDeployments.environmentId, input.environmentId),
          eq(documentDeployments.documentId, input.documentId),
        ),
      )
      .limit(1)
      .for('update');
    return deployment ?? null;
  }

  protected async loadReleaseRecoveryScope(
    tx: LodariqTransaction,
    input: ReleaseRecoveryScopeInput,
    lock: boolean,
  ): Promise<{
    environment: WorkspaceEnvironment;
    membershipRole: ControlPlaneRole;
  } | null> {
    const environmentQuery = tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.id, input.environmentId),
        ),
      )
      .limit(1);
    const documentQuery = tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)))
      .limit(1);
    const membershipQuery = tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, input.workspaceId),
          eq(workspaceMemberships.userId, input.actorUserId),
        ),
      )
      .limit(1);
    const [environmentRows, documentRows, membershipRows] = lock
      ? await Promise.all([
          environmentQuery.for('share'),
          documentQuery.for('share'),
          membershipQuery.for('share'),
        ])
      : await Promise.all([environmentQuery, documentQuery, membershipQuery]);
    const environment = environmentRows[0];
    const membershipRole = identityWorkspaceRole(membershipRows[0]?.role ?? '');
    if (!environment || !documentRows[0] || !membershipRole) return null;
    return {
      environment: toWorkspaceEnvironment(environment),
      membershipRole,
    };
  }
}
