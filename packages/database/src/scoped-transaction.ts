import { sql, type SQL } from 'drizzle-orm';
import {
  setAuthoringSessionLookupStatement,
  setEnvironmentTokenLookupStatement,
  setWorkspaceScopeStatement,
} from './rls';

export const LODARIQ_PUBLIC_INSTALLATION_SETTING = 'lodariq.public_installation_id';
export const LODARIQ_PUBLIC_ORIGIN_SETTING = 'lodariq.public_origin';
export const LODARIQ_BOOTSTRAP_GRANT_HASH_SETTING = 'lodariq.bootstrap_grant_hash';
export const LODARIQ_AUTH_SESSION_HASH_SETTING = 'lodariq.auth_session_hash';
export const LODARIQ_AUTH_USER_ID_SETTING = 'lodariq.auth_user_id';
export const LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING = 'lodariq.auth_email_lookup_hash';
export const LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING = 'lodariq.auth_email_normalized';
export const LODARIQ_EMAIL_VERIFICATION_ID_SETTING = 'lodariq.email_verification_id';
export const LODARIQ_EMAIL_VERIFICATION_HASH_SETTING = 'lodariq.email_verification_hash';
export const LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING = 'lodariq.set_password_challenge_id';
export const LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING = 'lodariq.set_password_challenge_hash';
export const LODARIQ_AUTH_RATE_BUCKET_HASH_SETTING = 'lodariq.auth_rate_bucket_hash';
export const LODARIQ_AUTH_RATE_PRUNE_BEFORE_SETTING = 'lodariq.auth_rate_prune_before';
export const LODARIQ_AUTH_OUTBOX_WORKER_SETTING = 'lodariq.auth_outbox_worker';

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

export async function runWithAuthSessionLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  tokenHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!tokenHash.trim()) throw new Error('tokenHash is required before resolving an auth session');
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_SESSION_HASH_SETTING}, ${tokenHash}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAuthUserScope<TTransaction extends WorkspaceScopeExecutor, TResult>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  userId: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!userId.trim()) throw new Error('userId is required before running a user-scoped operation');
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${userId}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAuthEmailLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  emailLookupHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!emailLookupHash.trim()) {
    throw new Error('emailLookupHash is required before resolving a password credential');
  }
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${emailLookupHash}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithSetPasswordChallengeLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  challengeId: string,
  tokenHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!challengeId.trim() || !tokenHash.trim()) {
    throw new Error('challengeId and tokenHash are required before resolving set-password');
  }
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING}, ${challengeId}, true),
        set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING}, ${tokenHash}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAuthOutboxWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_OUTBOX_WORKER_SETTING}, 'true', true)`,
    );
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

export async function runWithAuthoringSessionLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  tokenHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!tokenHash.trim()) {
    throw new Error('tokenHash is required before resolving an authoring session');
  }

  return runner.transaction(async (transaction) => {
    await transaction.execute(setAuthoringSessionLookupStatement(tokenHash));
    return operation(transaction);
  });
}

export async function runWithPublicSdkInstallationLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  installationId: string,
  exactOrigin: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  assertPublicLookupInput(installationId, exactOrigin);

  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config(${LODARIQ_PUBLIC_INSTALLATION_SETTING}, ${installationId}, true),
        set_config(${LODARIQ_PUBLIC_ORIGIN_SETTING}, ${exactOrigin}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithPublicSdkBootstrapGrantLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  installationId: string,
  exactOrigin: string,
  grantHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  assertPublicLookupInput(installationId, exactOrigin);
  if (!grantHash.trim()) {
    throw new Error('grantHash is required before consuming a public SDK bootstrap grant');
  }

  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config(${LODARIQ_PUBLIC_INSTALLATION_SETTING}, ${installationId}, true),
        set_config(${LODARIQ_PUBLIC_ORIGIN_SETTING}, ${exactOrigin}, true),
        set_config(${LODARIQ_BOOTSTRAP_GRANT_HASH_SETTING}, ${grantHash}, true)`,
    );
    return operation(transaction);
  });
}

function assertPublicLookupInput(installationId: string, exactOrigin: string): void {
  if (!installationId.trim()) {
    throw new Error('installationId is required before resolving a public SDK installation');
  }
  if (!exactOrigin.trim()) {
    throw new Error('exactOrigin is required before resolving a public SDK installation');
  }
}
