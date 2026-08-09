import type { WorkspaceEnvironment } from './repository';

export function createDefaultControlPlaneEnvironments(workspaceId: string): WorkspaceEnvironment[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'env_development',
      workspaceId,
      kind: 'development',
      name: 'Development',
      originAllowlist: ['http://localhost:5175', 'http://127.0.0.1:5175'],
      requiredApprovalCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'env_staging',
      workspaceId,
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      requiredApprovalCount: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
