export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  workspace: (workspaceId: string) => ['dashboard', 'workspace', workspaceId] as const,
  analytics: (workspaceId: string, environmentId: string) =>
    ['dashboard', 'workspace', workspaceId, 'analytics', environmentId] as const,
  releaseRecovery: (workspaceId: string, documentId: string, environmentId: string) =>
    ['dashboard', 'workspace', workspaceId, 'release-recovery', documentId, environmentId] as const,
  experience: (workspaceId: string, documentId: string, environmentId: string) =>
    ['dashboard', 'workspace', workspaceId, 'experience', documentId, environmentId] as const,
  applications: (workspaceId: string) =>
    ['dashboard', 'workspace', workspaceId, 'applications'] as const,
  billing: (workspaceId: string) => ['dashboard', 'workspace', workspaceId, 'billing'] as const,
  documentDebug: (workspaceId: string) =>
    ['dashboard', 'workspace', workspaceId, 'document-debug'] as const,
} as const;
