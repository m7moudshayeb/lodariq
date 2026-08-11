import {
  FIXTURE_WORKSPACE_ENVIRONMENT_POLICY_IDS,
  createDefaultWorkspaceEnvironmentPolicy,
} from '@lodariq/schema';
import type { WorkspaceEnvironment } from './repository';

export function createDefaultControlPlaneEnvironments(workspaceId: string): WorkspaceEnvironment[] {
  const now = new Date().toISOString();
  const originsByKind = {
    development: ['http://localhost:5175', 'http://127.0.0.1:5175'],
    staging: ['https://staging.lodariq.io'],
    production: [],
  } as const;
  return createDefaultWorkspaceEnvironmentPolicy(
    workspaceId,
    FIXTURE_WORKSPACE_ENVIRONMENT_POLICY_IDS,
  ).environments.map((environment) => ({
    id: environment.id,
    workspaceId: environment.workspaceId,
    kind: environment.kind,
    name: environment.displayName,
    originAllowlist: [...originsByKind[environment.kind]],
    requiredApprovalCount: environment.releasePolicy.requiredApprovalCount,
    enabled: environment.enabled,
    pipelinePosition: environment.pipelinePosition,
    authoringEnabled: environment.authoringEnabled,
    ...(environment.promotionSourceEnvironmentId
      ? { promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId }
      : {}),
    releasePolicy: environment.releasePolicy,
    createdAt: now,
    updatedAt: now,
  }));
}
