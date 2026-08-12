import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  type AcknowledgeAuthEmailRowInput,
  type AuthRateLimitResult,
  type ClaimedAuthEmailOutboxRow,
  type ClaimDueAuthEmailRowsInput,
  type ConsumeAuthRateLimitInput,
  type RetryAuthEmailRowInput,
  normalizeAuthEmailClaimInput,
  sanitizeAuthEmailFailureCode,
} from '../repository';
import { authOutbox, authRateLimits, setPasswordOutbox } from '../schema';
import {
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

      const candidates: AuthEmailOutboxCandidate[] = [
        ...emailRows.map((row) => ({
          id: row.id,
          recipientEmail: row.recipientEmail,
          purpose: 'email_verification' as const,
          challengeId: row.payload.challengeId,
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
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
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
            attempt: row.attempts,
            leaseVersion: row.leaseVersion,
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
