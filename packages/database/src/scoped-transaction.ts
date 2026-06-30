import type { SQL } from 'drizzle-orm';
import { setEnvironmentTokenLookupStatement, setWorkspaceScopeStatement } from './rls';

export interface WorkspaceScopeExecutor {
  execute(statement: SQL): Promise<unknown>;
}

export interface WorkspaceScopedTransactionRunner<TTransaction extends WorkspaceScopeExecutor> {
  transaction<T>(operation: (transaction: TTransaction) => Promise<T>): Promise<T>;
}

export async function runWithWorkspaceScope<TTransaction extends WorkspaceScopeExecutor, TResult>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  workspaceId: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!workspaceId.trim()) {
    throw new Error('workspaceId is required before running a tenant-scoped transaction');
  }

  return runner.transaction(async (transaction) => {
    await transaction.execute(setWorkspaceScopeStatement(workspaceId));
    return operation(transaction);
  });
}

export async function runWithEnvironmentTokenLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  tokenHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!tokenHash.trim()) {
    throw new Error('tokenHash is required before running an environment token lookup');
  }

  return runner.transaction(async (transaction) => {
    await transaction.execute(setEnvironmentTokenLookupStatement(tokenHash));
    return operation(transaction);
  });
}
