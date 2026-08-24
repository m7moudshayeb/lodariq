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
export const LODARIQ_WORKSPACE_ID_SETTING = 'lodariq.workspace_id';
export const LODARIQ_AUTH_RECOVERY_MUTATION_AT_SETTING = 'lodariq.auth_recovery_mutation_at';
export const LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING = 'lodariq.auth_email_lookup_hash';
export const LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING = 'lodariq.auth_email_normalized';
export const LODARIQ_AUTH_IDENTIFIER_NORMALIZED_SETTING = 'lodariq.auth_identifier_normalized';
export const LODARIQ_AUTH_IDENTITY_ISSUER_SETTING = 'lodariq.auth_identity_issuer';
export const LODARIQ_AUTH_IDENTITY_SUBJECT_SETTING = 'lodariq.auth_identity_subject';
export const LODARIQ_EMAIL_VERIFICATION_ID_SETTING = 'lodariq.email_verification_id';
export const LODARIQ_EMAIL_VERIFICATION_HASH_SETTING = 'lodariq.email_verification_hash';
export const LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING = 'lodariq.set_password_challenge_id';
export const LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING = 'lodariq.set_password_challenge_hash';
export const LODARIQ_AUTH_RATE_BUCKET_HASH_SETTING = 'lodariq.auth_rate_bucket_hash';
export const LODARIQ_AUTH_RATE_PRUNE_BEFORE_SETTING = 'lodariq.auth_rate_prune_before';
export const LODARIQ_AUTH_OUTBOX_WORKER_SETTING = 'lodariq.auth_outbox_worker';
export const LODARIQ_DELIVERY_WORKER_SETTING = 'lodariq.delivery_worker';
export const LODARIQ_ANALYTICS_EXPORT_WORKER_SETTING = 'lodariq.analytics_export_worker';
export const LODARIQ_WEBHOOK_WORKER_SETTING = 'lodariq.webhook_worker';
export const LODARIQ_BILLING_WORKER_SETTING = 'lodariq.billing_worker';
export const LODARIQ_DATA_RESIDENCY_WORKER_SETTING = 'lodariq.residency_worker';
export const LODARIQ_ANALYTICS_WAREHOUSE_WORKER_SETTING = 'lodariq.warehouse_worker';
export const LODARIQ_AUTH_MAINTENANCE_SETTING = 'lodariq.auth_maintenance_worker';
export const LODARIQ_AUTH_DELIVERY_OUTBOX_ID_SETTING = 'lodariq.auth_delivery_outbox_id';
export const LODARIQ_WORKSPACE_INVITATION_TOKEN_HASH_SETTING =
  'lodariq.workspace_invitation_token_hash';
export const LODARIQ_OIDC_STATE_HASH_SETTING = 'lodariq.oidc_state_hash';
export const LODARIQ_DEMO_PUBLIC_SETTING = 'lodariq.demo_public';

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

export async function runWithDemoPublicScope<TTransaction extends WorkspaceScopeExecutor, TResult>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config(${LODARIQ_DEMO_PUBLIC_SETTING}, 'true', true)`);
    return operation(transaction);
  });
}

export async function runWithDeliveryWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_DELIVERY_WORKER_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAnalyticsExportWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_ANALYTICS_EXPORT_WORKER_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithWebhookWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_WEBHOOK_WORKER_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithBillingWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_BILLING_WORKER_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithDataResidencyWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_DATA_RESIDENCY_WORKER_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAnalyticsWarehouseWorkerScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_ANALYTICS_WAREHOUSE_WORKER_SETTING}, 'true', true)`,
    );
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

export async function runWithTenantActorScope<TTransaction extends WorkspaceScopeExecutor, TResult>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  workspaceId: string,
  actorUserId: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!workspaceId.trim() || !actorUserId.trim()) {
    throw new Error('workspaceId and actorUserId are required for tenant administration');
  }
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config(${LODARIQ_WORKSPACE_ID_SETTING}, ${workspaceId}, true),
        set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${actorUserId}, true)`,
    );
    return operation(transaction);
  });
}

export async function runWithWorkspaceInvitationScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  userId: string,
  tokenHash: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!userId.trim() || !/^[0-9a-f]{64}$/u.test(tokenHash)) {
    throw new Error('userId and a SHA-256 token digest are required for invitation acceptance');
  }
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select
        set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${userId}, true),
        set_config(${LODARIQ_WORKSPACE_INVITATION_TOKEN_HASH_SETTING}, ${tokenHash}, true)`,
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

export async function runWithAuthMaintenanceScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_MAINTENANCE_SETTING}, 'true', true)`,
    );
    return operation(transaction);
  });
}

export async function runWithAuthDeliveryLookupScope<
  TTransaction extends WorkspaceScopeExecutor,
  TResult,
>(
  runner: WorkspaceScopedTransactionRunner<TTransaction>,
  outboxId: string,
  operation: (transaction: TTransaction) => Promise<TResult>,
): Promise<TResult> {
  if (!/^outbox_[A-Za-z0-9_-]{20,200}$/u.test(outboxId)) {
    throw new Error('A valid outboxId is required before inspecting auth delivery');
  }
  return runner.transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config(${LODARIQ_AUTH_DELIVERY_OUTBOX_ID_SETTING}, ${outboxId}, true)`,
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
