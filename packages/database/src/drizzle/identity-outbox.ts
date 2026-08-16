import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  type AcknowledgeAuthEmailRowInput,
  type AuthDeliveryStatusRecord,
  type AuthEmailPurpose,
  type AuthRateLimitResult,
  type ClaimedAuthEmailOutboxRow,
  type ClaimDueAuthEmailRowsInput,
  type ConsumeAuthRateLimitInput,
  type RetryAuthEmailRowInput,
  normalizeAuthEmailClaimInput,
  sanitizeAuthEmailFailureCode,
} from '../repository';
import {
  accountEmailChangeOutbox,
  authOutbox,
  authRateLimits,
  setPasswordOutbox,
  workspaceInvitationOutbox,
} from '../schema';
import {
  runWithAuthDeliveryLookupScope,
  runWithAuthOutboxWorkerScope,
  LODARIQ_AUTH_RATE_BUCKET_HASH_SETTING,
  LODARIQ_AUTH_RATE_PRUNE_BEFORE_SETTING,
} from '../scoped-transaction';
import type { AuthEmailOutboxCandidate } from './types';
import {
  compareAuthEmailCandidates,
  authEmailOutboxKey,
  isValidAuthEmailLeaseMutation,
} from './helpers';
import { DrizzleRepositoryIdentityPassword } from './identity-password';

export class DrizzleRepositoryIdentityOutbox extends DrizzleRepositoryIdentityPassword {
  async getAuthDeliveryStatus(
    purpose: AuthEmailPurpose,
    outboxId: string,
  ): Promise<AuthDeliveryStatusRecord | null> {
    return runWithAuthDeliveryLookupScope(this.database, outboxId, async (tx) => {
      if (purpose === 'email_verification') {
        const [row] = await tx
          .select()
          .from(authOutbox)
          .where(eq(authOutbox.id, outboxId))
          .limit(1);
        return row
          ? toAuthDeliveryStatus(
              purpose,
              row.id,
              row.payload.challengeId,
              row.payload.keyId ?? 'legacy',
              row.attempts,
              row.lastError,
              row.createdAt,
              row.availableAt,
              row.processedAt,
              row.terminalAt,
            )
          : null;
      }
      if (purpose === 'workspace_invitation') {
        const [row] = await tx
          .select()
          .from(workspaceInvitationOutbox)
          .where(eq(workspaceInvitationOutbox.id, outboxId))
          .limit(1);
        return row
          ? toAuthDeliveryStatus(
              purpose,
              row.id,
              row.payload.invitationId,
              row.payload.keyId,
              row.attempts,
              row.lastError,
              row.createdAt,
              row.availableAt,
              row.processedAt,
              row.terminalAt,
            )
          : null;
      }
      if (
        purpose === 'account_email_change_current' ||
        purpose === 'account_email_change_new'
      ) {
        const [row] = await tx
          .select()
          .from(accountEmailChangeOutbox)
          .where(eq(accountEmailChangeOutbox.id, outboxId))
          .limit(1);
        return row && accountEmailPurpose(row.payload.proof) === purpose
          ? toAuthDeliveryStatus(
              purpose,
              row.id,
              row.payload.challengeId,
              row.payload.keyId,
              row.attempts,
              row.lastError,
              row.createdAt,
              row.availableAt,
              row.processedAt,
              row.terminalAt,
            )
          : null;
      }
      const [row] = await tx
        .select()
        .from(setPasswordOutbox)
        .where(eq(setPasswordOutbox.id, outboxId))
        .limit(1);
      return row
        ? toAuthDeliveryStatus(
            purpose,
            row.id,
            row.payload.challengeId,
            row.payload.keyId ?? 'legacy',
            row.attempts,
            row.lastError,
            row.createdAt,
            row.availableAt,
            row.processedAt,
            row.terminalAt,
          )
        : null;
    });
  }

  async claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]> {
    const normalized = normalizeAuthEmailClaimInput(input);
    if (!normalized) return [];
    return runWithAuthOutboxWorkerScope(this.database, async (tx) => {
      const now = new Date(normalized.now);
      const emailRows = await tx
        .select()
        .from(authOutbox)
        .where(
          and(
            isNull(authOutbox.processedAt),
            isNull(authOutbox.terminalAt),
            sql`${authOutbox.availableAt} <= ${now}`,
            lt(authOutbox.attempts, 20),
            lt(authOutbox.leaseVersion, 2_147_483_647),
          ),
        )
        .orderBy(asc(authOutbox.availableAt), asc(authOutbox.createdAt), asc(authOutbox.id))
        .limit(normalized.limit)
        .for('update', { skipLocked: true });
      const resetRows = await tx
        .select()
        .from(setPasswordOutbox)
        .where(
          and(
            isNull(setPasswordOutbox.processedAt),
            isNull(setPasswordOutbox.terminalAt),
            sql`${setPasswordOutbox.availableAt} <= ${now}`,
            lt(setPasswordOutbox.attempts, 20),
            lt(setPasswordOutbox.leaseVersion, 2_147_483_647),
          ),
        )
        .orderBy(
          asc(setPasswordOutbox.availableAt),
          asc(setPasswordOutbox.createdAt),
          asc(setPasswordOutbox.id),
        )
        .limit(normalized.limit)
        .for('update', { skipLocked: true });
      const invitationRows = await tx
        .select()
        .from(workspaceInvitationOutbox)
        .where(
          and(
            isNull(workspaceInvitationOutbox.processedAt),
            isNull(workspaceInvitationOutbox.terminalAt),
            sql`${workspaceInvitationOutbox.availableAt} <= ${now}`,
            lt(workspaceInvitationOutbox.attempts, 20),
            lt(workspaceInvitationOutbox.leaseVersion, 2_147_483_647),
          ),
        )
        .orderBy(
          asc(workspaceInvitationOutbox.availableAt),
          asc(workspaceInvitationOutbox.createdAt),
          asc(workspaceInvitationOutbox.id),
        )
        .limit(normalized.limit)
        .for('update', { skipLocked: true });
      const accountEmailRows = await tx
        .select()
        .from(accountEmailChangeOutbox)
        .where(
          and(
            isNull(accountEmailChangeOutbox.processedAt),
            isNull(accountEmailChangeOutbox.terminalAt),
            sql`${accountEmailChangeOutbox.availableAt} <= ${now}`,
            lt(accountEmailChangeOutbox.attempts, 20),
            lt(accountEmailChangeOutbox.leaseVersion, 2_147_483_647),
          ),
        )
        .orderBy(
          asc(accountEmailChangeOutbox.availableAt),
          asc(accountEmailChangeOutbox.createdAt),
          asc(accountEmailChangeOutbox.id),
        )
        .limit(normalized.limit)
        .for('update', { skipLocked: true });

      const candidates: AuthEmailOutboxCandidate[] = [
        ...emailRows.map((row) => ({
          id: row.id,
          recipientEmail: row.recipientEmail,
          purpose: 'email_verification' as const,
          challengeId: row.payload.challengeId,
          keyId: row.payload.keyId ?? 'legacy',
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          attempts: row.attempts,
          leaseVersion: row.leaseVersion,
        })),
        ...resetRows.map((row) => ({
          id: row.id,
          recipientEmail: row.recipientEmail,
          purpose: 'set_password' as const,
          challengeId: row.payload.challengeId,
          keyId: row.payload.keyId ?? 'legacy',
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          attempts: row.attempts,
          leaseVersion: row.leaseVersion,
        })),
        ...invitationRows.map((row) => ({
          id: row.id,
          recipientEmail: row.recipientEmail,
          purpose: 'workspace_invitation' as const,
          challengeId: row.payload.invitationId,
          keyId: row.payload.keyId,
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          attempts: row.attempts,
          leaseVersion: row.leaseVersion,
        })),
        ...accountEmailRows.map((row) => ({
          id: row.id,
          recipientEmail: row.recipientEmail,
          purpose: accountEmailPurpose(row.payload.proof),
          challengeId: row.payload.challengeId,
          keyId: row.payload.keyId,
          availableAt: row.availableAt,
          createdAt: row.createdAt,
          attempts: row.attempts,
          leaseVersion: row.leaseVersion,
        })),
      ]
        .sort(compareAuthEmailCandidates)
        .slice(0, normalized.limit);
      if (!candidates.length) return [];

      const emailIds = candidates
        .filter((candidate) => candidate.purpose === 'email_verification')
        .map(({ id }) => id);
      const resetIds = candidates
        .filter((candidate) => candidate.purpose === 'set_password')
        .map(({ id }) => id);
      const invitationIds = candidates
        .filter((candidate) => candidate.purpose === 'workspace_invitation')
        .map(({ id }) => id);
      const accountEmailIds = candidates
        .filter(
          (candidate) =>
            candidate.purpose === 'account_email_change_current' ||
            candidate.purpose === 'account_email_change_new',
        )
        .map(({ id }) => id);
      const claimedByKey = new Map<string, ClaimedAuthEmailOutboxRow>();
      if (emailIds.length) {
        const claimed = await tx
          .update(authOutbox)
          .set({
            attempts: sql`${authOutbox.attempts} + 1`,
            leaseVersion: sql`${authOutbox.leaseVersion} + 1`,
            availableAt: new Date(normalized.leaseExpiresAt),
          })
          .where(
            and(
              inArray(authOutbox.id, emailIds),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
              sql`${authOutbox.availableAt} <= ${now}`,
              lt(authOutbox.attempts, 20),
              lt(authOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning();
        for (const row of claimed) {
          claimedByKey.set(authEmailOutboxKey('email_verification', row.id), {
            id: row.id,
            recipientEmail: row.recipientEmail,
            purpose: 'email_verification',
            challengeId: row.payload.challengeId,
            keyId: row.payload.keyId ?? 'legacy',
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }
      if (resetIds.length) {
        const claimed = await tx
          .update(setPasswordOutbox)
          .set({
            attempts: sql`${setPasswordOutbox.attempts} + 1`,
            leaseVersion: sql`${setPasswordOutbox.leaseVersion} + 1`,
            availableAt: new Date(normalized.leaseExpiresAt),
          })
          .where(
            and(
              inArray(setPasswordOutbox.id, resetIds),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
              sql`${setPasswordOutbox.availableAt} <= ${now}`,
              lt(setPasswordOutbox.attempts, 20),
              lt(setPasswordOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning();
        for (const row of claimed) {
          claimedByKey.set(authEmailOutboxKey('set_password', row.id), {
            id: row.id,
            recipientEmail: row.recipientEmail,
            purpose: 'set_password',
            challengeId: row.payload.challengeId,
            keyId: row.payload.keyId ?? 'legacy',
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }
      if (invitationIds.length) {
        const claimed = await tx
          .update(workspaceInvitationOutbox)
          .set({
            attempts: sql`${workspaceInvitationOutbox.attempts} + 1`,
            leaseVersion: sql`${workspaceInvitationOutbox.leaseVersion} + 1`,
            availableAt: new Date(normalized.leaseExpiresAt),
          })
          .where(
            and(
              inArray(workspaceInvitationOutbox.id, invitationIds),
              isNull(workspaceInvitationOutbox.processedAt),
              isNull(workspaceInvitationOutbox.terminalAt),
              sql`${workspaceInvitationOutbox.availableAt} <= ${now}`,
              lt(workspaceInvitationOutbox.attempts, 20),
              lt(workspaceInvitationOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning();
        for (const row of claimed) {
          claimedByKey.set(authEmailOutboxKey('workspace_invitation', row.id), {
            id: row.id,
            recipientEmail: row.recipientEmail,
            purpose: 'workspace_invitation',
            challengeId: row.payload.invitationId,
            keyId: row.payload.keyId,
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }
      if (accountEmailIds.length) {
        const claimed = await tx
          .update(accountEmailChangeOutbox)
          .set({
            attempts: sql`${accountEmailChangeOutbox.attempts} + 1`,
            leaseVersion: sql`${accountEmailChangeOutbox.leaseVersion} + 1`,
            availableAt: new Date(normalized.leaseExpiresAt),
          })
          .where(
            and(
              inArray(accountEmailChangeOutbox.id, accountEmailIds),
              isNull(accountEmailChangeOutbox.processedAt),
              isNull(accountEmailChangeOutbox.terminalAt),
              sql`${accountEmailChangeOutbox.availableAt} <= ${now}`,
              lt(accountEmailChangeOutbox.attempts, 20),
              lt(accountEmailChangeOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning();
        for (const row of claimed) {
          const purpose = accountEmailPurpose(row.payload.proof);
          claimedByKey.set(authEmailOutboxKey(purpose, row.id), {
            id: row.id,
            recipientEmail: row.recipientEmail,
            purpose,
            challengeId: row.payload.challengeId,
            keyId: row.payload.keyId,
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
            createdAt: row.createdAt.toISOString(),
          });
        }
      }
      return candidates.flatMap((candidate) => {
        const claimed = claimedByKey.get(authEmailOutboxKey(candidate.purpose, candidate.id));
        return claimed ? [claimed] : [];
      });
    });
  }

  async acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean> {
    const processedAt = new Date(input.processedAt);
    if (!isValidAuthEmailLeaseMutation(input.id, input.purpose, input.leaseVersion, processedAt)) {
      return false;
    }
    return runWithAuthOutboxWorkerScope(this.database, async (tx) => {
      if (input.purpose === 'email_verification') {
        const updated = await tx
          .update(authOutbox)
          .set({ processedAt })
          .where(
            and(
              eq(authOutbox.id, input.id),
              eq(authOutbox.leaseVersion, input.leaseVersion),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
              sql`${authOutbox.availableAt} > ${processedAt}`,
            ),
          )
          .returning({ id: authOutbox.id });
        return updated.length === 1;
      }
      if (input.purpose === 'workspace_invitation') {
        const updated = await tx
          .update(workspaceInvitationOutbox)
          .set({ processedAt })
          .where(
            and(
              eq(workspaceInvitationOutbox.id, input.id),
              eq(workspaceInvitationOutbox.leaseVersion, input.leaseVersion),
              isNull(workspaceInvitationOutbox.processedAt),
              isNull(workspaceInvitationOutbox.terminalAt),
              sql`${workspaceInvitationOutbox.availableAt} > ${processedAt}`,
            ),
          )
          .returning({ id: workspaceInvitationOutbox.id });
        return updated.length === 1;
      }
      if (
        input.purpose === 'account_email_change_current' ||
        input.purpose === 'account_email_change_new'
      ) {
        const updated = await tx
          .update(accountEmailChangeOutbox)
          .set({ processedAt })
          .where(
            and(
              eq(accountEmailChangeOutbox.id, input.id),
              eq(accountEmailChangeOutbox.leaseVersion, input.leaseVersion),
              isNull(accountEmailChangeOutbox.processedAt),
              isNull(accountEmailChangeOutbox.terminalAt),
              sql`${accountEmailChangeOutbox.availableAt} > ${processedAt}`,
            ),
          )
          .returning({ id: accountEmailChangeOutbox.id });
        return updated.length === 1;
      }
      const updated = await tx
        .update(setPasswordOutbox)
        .set({ processedAt })
        .where(
          and(
            eq(setPasswordOutbox.id, input.id),
            eq(setPasswordOutbox.leaseVersion, input.leaseVersion),
            isNull(setPasswordOutbox.processedAt),
            isNull(setPasswordOutbox.terminalAt),
            sql`${setPasswordOutbox.availableAt} > ${processedAt}`,
          ),
        )
        .returning({ id: setPasswordOutbox.id });
      return updated.length === 1;
    });
  }

  async retry(input: RetryAuthEmailRowInput): Promise<boolean> {
    const failureCode = sanitizeAuthEmailFailureCode(input.failureCode);
    const availableAt = input.availableAt ? new Date(input.availableAt) : null;
    if (
      !isValidAuthEmailLeaseMutation(input.id, input.purpose, input.leaseVersion) ||
      input.terminal !== (availableAt === null) ||
      (availableAt !== null && !Number.isFinite(availableAt.getTime()))
    ) {
      return false;
    }
    return runWithAuthOutboxWorkerScope(this.database, async (tx) => {
      const terminalAt = input.terminal ? sql`now()` : null;
      if (input.purpose === 'email_verification') {
        const updated = await tx
          .update(authOutbox)
          .set({
            leaseVersion: sql`${authOutbox.leaseVersion} + 1`,
            lastError: failureCode,
            ...(availableAt ? { availableAt } : {}),
            terminalAt,
          })
          .where(
            and(
              eq(authOutbox.id, input.id),
              eq(authOutbox.leaseVersion, input.leaseVersion),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
              lt(authOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning({ id: authOutbox.id });
        return updated.length === 1;
      }
      if (input.purpose === 'workspace_invitation') {
        const updated = await tx
          .update(workspaceInvitationOutbox)
          .set({
            leaseVersion: sql`${workspaceInvitationOutbox.leaseVersion} + 1`,
            lastError: failureCode,
            ...(availableAt ? { availableAt } : {}),
            terminalAt,
          })
          .where(
            and(
              eq(workspaceInvitationOutbox.id, input.id),
              eq(workspaceInvitationOutbox.leaseVersion, input.leaseVersion),
              isNull(workspaceInvitationOutbox.processedAt),
              isNull(workspaceInvitationOutbox.terminalAt),
              lt(workspaceInvitationOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning({ id: workspaceInvitationOutbox.id });
        return updated.length === 1;
      }
      if (
        input.purpose === 'account_email_change_current' ||
        input.purpose === 'account_email_change_new'
      ) {
        const updated = await tx
          .update(accountEmailChangeOutbox)
          .set({
            leaseVersion: sql`${accountEmailChangeOutbox.leaseVersion} + 1`,
            lastError: failureCode,
            ...(availableAt ? { availableAt } : {}),
            terminalAt,
          })
          .where(
            and(
              eq(accountEmailChangeOutbox.id, input.id),
              eq(accountEmailChangeOutbox.leaseVersion, input.leaseVersion),
              isNull(accountEmailChangeOutbox.processedAt),
              isNull(accountEmailChangeOutbox.terminalAt),
              lt(accountEmailChangeOutbox.leaseVersion, 2_147_483_647),
            ),
          )
          .returning({ id: accountEmailChangeOutbox.id });
        return updated.length === 1;
      }
      const updated = await tx
        .update(setPasswordOutbox)
        .set({
          leaseVersion: sql`${setPasswordOutbox.leaseVersion} + 1`,
          lastError: failureCode,
          ...(availableAt ? { availableAt } : {}),
          terminalAt,
        })
        .where(
          and(
            eq(setPasswordOutbox.id, input.id),
            eq(setPasswordOutbox.leaseVersion, input.leaseVersion),
            isNull(setPasswordOutbox.processedAt),
            isNull(setPasswordOutbox.terminalAt),
            lt(setPasswordOutbox.leaseVersion, 2_147_483_647),
          ),
        )
        .returning({ id: setPasswordOutbox.id });
      return updated.length === 1;
    });
  }

  async consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult> {
    return this.database.transaction(async (tx) => {
      const now = new Date(input.now);
      const windowCutoff = new Date(now.getTime() - input.windowMs);
      const nextBlockedUntil = new Date(now.getTime() + input.blockMs);
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_RATE_BUCKET_HASH_SETTING}, ${input.bucketHash}, true)`,
      );
      const [row] = await tx
        .insert(authRateLimits)
        .values({
          bucketHash: input.bucketHash,
          scope: input.scope,
          windowStartedAt: now,
          attempts: 1,
          blockedUntil: null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: authRateLimits.bucketHash,
          set: {
            scope: input.scope,
            windowStartedAt: sql`case
              when ${authRateLimits.blockedUntil} > ${now} then ${authRateLimits.windowStartedAt}
              when ${authRateLimits.windowStartedAt} <= ${windowCutoff} then ${now}
              else ${authRateLimits.windowStartedAt}
            end`,
            attempts: sql`case
              when ${authRateLimits.blockedUntil} > ${now} then ${authRateLimits.attempts}
              when ${authRateLimits.windowStartedAt} <= ${windowCutoff} then 1
              else ${authRateLimits.attempts} + 1
            end`,
            blockedUntil: sql`case
              when ${authRateLimits.blockedUntil} > ${now} then ${authRateLimits.blockedUntil}
              when ${authRateLimits.windowStartedAt} <= ${windowCutoff} then null
              when ${authRateLimits.attempts} + 1 > ${input.maxAttempts} then ${nextBlockedUntil}
              else null
            end`,
            updatedAt: now,
          },
        })
        .returning();
      if (!row) throw new Error('Unable to consume auth rate-limit bucket');
      const blockedUntil = row.blockedUntil?.getTime() ?? 0;
      return {
        allowed: blockedUntil <= now.getTime(),
        retryAfterSeconds:
          blockedUntil > now.getTime()
            ? Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1_000))
            : 0,
      };
    });
  }

  async pruneAuthRateLimits(before: string, limit: number): Promise<number> {
    const boundedLimit = Math.max(0, Math.min(Math.trunc(limit), 100));
    if (boundedLimit === 0) return 0;
    return this.database.transaction(async (tx) => {
      const cutoff = new Date(before);
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_RATE_PRUNE_BEFORE_SETTING}, ${before}, true)`,
      );
      const candidates = await tx
        .select({ bucketHash: authRateLimits.bucketHash })
        .from(authRateLimits)
        .where(lt(authRateLimits.updatedAt, cutoff))
        .orderBy(asc(authRateLimits.updatedAt))
        .limit(boundedLimit);
      if (!candidates.length) return 0;
      const removed = await tx
        .delete(authRateLimits)
        .where(
          inArray(
            authRateLimits.bucketHash,
            candidates.map(({ bucketHash }) => bucketHash),
          ),
        )
        .returning({ bucketHash: authRateLimits.bucketHash });
      return removed.length;
    });
  }
}

function accountEmailPurpose(
  proof: 'current_email' | 'new_email',
): 'account_email_change_current' | 'account_email_change_new' {
  return proof === 'current_email'
    ? 'account_email_change_current'
    : 'account_email_change_new';
}

function toAuthDeliveryStatus(
  purpose: AuthEmailPurpose,
  outboxId: string,
  challengeId: string,
  keyId: string,
  attempts: number,
  lastFailureCode: string | null,
  createdAt: Date,
  availableAt: Date,
  processedAt: Date | null,
  terminalAt: Date | null,
): AuthDeliveryStatusRecord {
  const state = authDeliveryState(attempts, processedAt, terminalAt);
  return {
    outboxId,
    challengeId,
    keyId,
    purpose,
    state,
    attempts,
    lastFailureCode,
    createdAt: createdAt.toISOString(),
    nextAttemptAt:
      state === 'queued' || state === 'retry_scheduled' ? availableAt.toISOString() : null,
    providerAcceptedAt: processedAt?.toISOString() ?? null,
    terminalAt: terminalAt?.toISOString() ?? null,
  };
}

function authDeliveryState(
  attempts: number,
  processedAt: Date | null,
  terminalAt: Date | null,
): AuthDeliveryStatusRecord['state'] {
  if (processedAt) return 'provider_accepted';
  if (terminalAt) return 'terminal';
  return attempts > 0 ? 'retry_scheduled' : 'queued';
}
