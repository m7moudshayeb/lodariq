import { sql, type SQL } from 'drizzle-orm';

export const LODARIQ_WORKSPACE_SETTING = 'lodariq.workspace_id';
export const LODARIQ_ENVIRONMENT_TOKEN_HASH_SETTING = 'lodariq.environment_token_hash';

export function setWorkspaceScopeStatement(workspaceId: string): SQL {
  if (!workspaceId.trim()) {
    throw new Error('workspaceId is required before setting a tenant scope');
  }
  return sql`select set_config(${LODARIQ_WORKSPACE_SETTING}, ${workspaceId}, true)`;
}

export function setEnvironmentTokenLookupStatement(tokenHash: string): SQL {
  if (!tokenHash.trim()) {
    throw new Error('tokenHash is required before resolving an environment token');
  }
  return sql`select set_config(${LODARIQ_ENVIRONMENT_TOKEN_HASH_SETTING}, ${tokenHash}, true)`;
}

export function assertWorkspaceScope(recordWorkspaceId: string, authWorkspaceId: string): void {
  if (recordWorkspaceId !== authWorkspaceId) {
    throw new Error('workspace scope mismatch');
  }
}
