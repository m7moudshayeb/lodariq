import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
  type CompiledDocument,
  type LodariqDocument,
  type QueryAuthoringDocumentsResult,
} from '@lodariq/schema';
import {
  type ActivateCompiledArtifactInput,
  type ActivatedAuthoringDocumentSessionRecord,
  type AcknowledgeAuthEmailRowInput,
  type ApproveAuthoringAuthorizationRequestInput,
  type AuthoringActivationGrantRecord,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringCodeExchangeRecord,
  type AuthoringDocumentSessionRecord,
  type AuthoringSessionRecord,
  authoringSessionThemeReference,
  type AuthSessionRecord,
  type AuthRateLimitResult,
  type ClaimedAuthEmailOutboxRow,
  type ClaimDueAuthEmailRowsInput,
  type ConsumeAuthRateLimitInput,
  type ConsumeEmailVerificationChallengeInput,
  type ConsumeSetPasswordChallengeInput,
  type ConsumeAuthoringActivationGrantInput,
  type ControlPlaneRepository,
  type CreateAuthoringAuthorizationRequestInput,
  type CreateAuthoringDocumentSessionFromActivationInput,
  type CreateAuthoringSessionInput,
  type CreateEnvironmentTokenInput,
  type CreateIdentityAccountInput,
  type CreateCredentialBoundAuthSessionInput,
  type CreateIdentityWorkspaceInput,
  type CreatePublicSdkBootstrapGrantInput,
  type CreateVisualCheckRunInput,
  type CreateStyleSourceInput,
  type StyleSourceRecord,
  type CreatePublicationVerificationInput,
  type PublicationVerificationRecord,
  type CreateReleaseApprovalInput,
  type ReleaseApprovalRecord,
  type PromoteVerifiedPublicationInput,
  type PromotionResult,
  type UpdateEnvironmentReleasePolicyInput,
  type CreateWorkspaceThemeInput,
  createAuthoringSessionCompatibilityPins,
  type ConsumePublicSdkBootstrapGrantInput,
  type ExchangeAuthoringAuthorizationCodeInput,
  type DocumentPublicationSummary,
  type DocumentSummary,
  type EnvironmentTokenRecord,
  type IngestEventsInput,
  type IdentityWorkspaceRecord,
  type GetOrCreatePublicSdkInstallationInput,
  AmbiguousCurrentPublicationError,
  ActivePublicationChangedError,
  ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  EnvironmentReleasePolicyChangedError,
  IdempotencyConflictError,
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocument,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type PublishCompiledArtifactInput,
  type QueryAuthoringDocumentsFromActivationInput,
  type RequestSetPasswordChallengeInput,
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
  type PublicSdkInstallationWithOrigins,
  type ResolvedEnvironmentToken,
  type ResolvedEmailVerificationChallenge,
  type ResolvedSetPasswordChallenge,
  type ResolvedAuthoringAuthorizationForUser,
  type ResolvedPublicSdkInstallation,
  type RetryAuthEmailRowInput,
  type ReleaseActivationResult,
  type RevokeAuthoringSessionInput,
  type RotateAuthSessionInput,
  ReleaseOperationInProgressError,
  PublicationVerificationRequiredError,
  ReleaseApprovalRejectedError,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  type SaveDocumentInput,
  type SetPublicSdkInstallationOriginInput,
  type SyncPublicSdkInstallationOriginsInput,
  type SetDefaultWorkspaceThemeInput,
  type UpdateWorkspaceThemeDraftInput,
  type ApproveWorkspaceThemeInput,
  type WorkspaceThemeApprovalResult,
  type WorkspaceThemeImpactRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
  WorkspaceThemeApprovalRequiredError,
  type VisualCheckRunRecord,
  type WorkspaceMembershipRecord,
  type WorkspaceEnvironment,
  type PasswordCredentialRecord,
  type UserRecord,
  assertReleaseMutationGuardInput,
  assertBrowserVerificationReport,
  assertRequiredApprovalCount,
  assertSafeStyleSource,
  hashCanonicalJson,
  normalizeIsoTimestamp,
  normalizeReleaseApprovalReason,
  assertVisualCheckReport,
  assertWorkspaceThemeDraft,
  assertWorkspaceThemeMutationGuard,
  assertPublicSdkBootstrapGrantHash,
  assertPublicSdkBootstrapGrantLifetime,
  assertPublicSdkInstallationId,
  assertPublicSdkInstallationOriginPolicy,
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
  AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS,
  canActivateDocumentIntent,
  createWorkspaceThemeVersion,
  createServerOwnedTourDraft,
  getAuthoringDocumentSessionCapabilities,
  hasValidBoundedFutureTtl,
  hasValidFutureTtl,
  isAuthoringPkceChallenge,
  isAuthoringDocumentQueryScope,
  normalizeAuthEmailClaimInput,
  normalizeThemeGuardUpdatedAt,
  normalizeWorkspaceThemeName,
  themeImpactBinding,
  sanitizeAuthEmailFailureCode,
  isSha256Hash,
  isTrustedEditorIframeSrc,
  isValidAuthoringCapabilities,
  isValidAuthoringDocumentIntent,
  matchesAuthoringPageContext,
  normalizeAuthoringPathname,
  normalizeExactOrigin,
  isPublicSdkBootstrapGrantHash,
  requireExactHttpOrigin,
} from './repository';
import { assertWorkspaceScope } from './rls';
import {
  authoringActivationGrants,
  authoringAuthorizationRequests,
  authSessions,
  authOutbox,
  authRateLimits,
  compiledArtifacts,
  authoringSessions,
  documentDeployments,
  documents,
  documentVersions,
  environments,
  environmentTokens,
  events,
  emailVerificationChallenges,
  passwordCredentials,
  publicSdkBootstrapGrants,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
  publications,
  publicationVerifications,
  releaseOperations,
  releaseApprovals,
  setPasswordChallenges,
  setPasswordOutbox,
  themes,
  themeVersions,
  styleSources,
  users,
  visualCheckRuns,
  workspaces,
  workspaceMemberships,
} from './schema';
import { verifyAuthoringPkceS256Challenge } from './tokens';
import type { LodariqDatabase } from './neon';
import {
  runWithAuthoringSessionLookupScope,
  runWithAuthEmailLookupScope,
  runWithAuthOutboxWorkerScope,
  runWithAuthSessionLookupScope,
  runWithAuthUserScope,
  runWithEnvironmentTokenLookupScope,
  runWithPublicSdkBootstrapGrantLookupScope,
  runWithPublicSdkInstallationLookupScope,
  runWithSetPasswordChallengeLookupScope,
  runWithWorkspaceScope,
  LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING,
  LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING,
  LODARIQ_AUTH_USER_ID_SETTING,
  LODARIQ_AUTH_RATE_BUCKET_HASH_SETTING,
  LODARIQ_AUTH_RATE_PRUNE_BEFORE_SETTING,
  LODARIQ_EMAIL_VERIFICATION_HASH_SETTING,
  LODARIQ_EMAIL_VERIFICATION_ID_SETTING,
  LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING,
  LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING,
} from './scoped-transaction';

type LodariqTransaction = Parameters<Parameters<LodariqDatabase['transaction']>[0]>[0];

const AUTHORING_REQUEST_ID_SETTING = 'lodariq.authorization_request_id';
const AUTHORING_STATE_HASH_SETTING = 'lodariq.authorization_state_hash';
const AUTHORING_CODE_HASH_SETTING = 'lodariq.authorization_code_hash';
const ACTIVATION_GRANT_HASH_SETTING = 'lodariq.activation_grant_hash';

class AuthoringAtomicWriteRejected extends Error {}
class SetPasswordAtomicWriteRejected extends Error {}
class EmailVerificationAtomicWriteRejected extends Error {}

interface AuthEmailOutboxCandidate {
  id: string;
  recipientEmail: string;
  purpose: ClaimedAuthEmailOutboxRow['purpose'];
  challengeId: string;
  availableAt: Date;
  createdAt: Date;
  attempts: number;
  leaseVersion: number;
}

type ReleaseOutcome =
  | { kind: 'success'; result: ReleaseActivationResult }
  | { kind: 'idempotency_conflict' }
  | { kind: 'in_progress' }
  | { kind: 'deployment_changed'; expectedGeneration: number; actualGeneration: number }
  | { kind: 'failed'; errorCode: string };

type PromotionOutcome =
  | { kind: 'success'; result: PromotionResult }
  | { kind: 'idempotency_conflict' }
  | { kind: 'in_progress' }
  | { kind: 'active_publication_changed'; actualPublicationId: string | null }
  | { kind: 'verification_required' }
  | { kind: 'approval_rejected'; operationId: string }
  | { kind: 'deployment_changed'; expectedGeneration: number; actualGeneration: number }
  | { kind: 'failed'; errorCode: string };

export function createDrizzleControlPlaneRepository(
  database: LodariqDatabase,
): ControlPlaneRepository {
  return new DrizzleControlPlaneRepository(database);
}

class DrizzleControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly database: LodariqDatabase) {}

  async findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null> {
    return runWithAuthEmailLookupScope(this.database, emailLookupHash, async (tx) => {
      const [row] = await tx
        .select()
        .from(passwordCredentials)
        .where(
          and(
            eq(passwordCredentials.emailNormalized, emailNormalized),
            eq(passwordCredentials.emailLookupHash, emailLookupHash),
          ),
        )
        .limit(1);
      return row ? toPasswordCredentialRecord(row) : null;
    });
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      return row ? toUserRecord(row) : null;
    });
  }

  async createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean> {
    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.user.id}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.credential.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${input.credential.emailLookupHash}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.emailVerificationChallenge.id}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.emailVerificationChallenge.tokenHash}, true),
            set_config('lodariq.workspace_id', ${input.workspace.id}, true)`,
        );
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.credential.emailLookupHash}, 0))`,
        );
        const [existingIdentity] = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(btrim(${users.email})) = ${input.credential.emailNormalized}`)
          .limit(1);
        if (existingIdentity) return false;
        await tx.insert(users).values({
          id: input.user.id,
          legacyIdentityId: input.user.legacyIdentityId,
          email: input.user.email,
          name: input.user.name ?? null,
          emailVerifiedAt: input.user.emailVerifiedAt ? new Date(input.user.emailVerifiedAt) : null,
          createdAt: new Date(input.user.createdAt),
        });
        await tx.insert(passwordCredentials).values(passwordCredentialValues(input.credential));
        await tx.insert(workspaces).values({
          id: input.workspace.id,
          name: input.workspace.name,
          createdAt: new Date(input.workspace.createdAt),
          updatedAt: new Date(input.workspace.updatedAt),
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId: input.membership.workspaceId,
          userId: input.membership.userId,
          role: input.membership.role,
          createdAt: new Date(input.membership.createdAt),
        });
        await tx.insert(environments).values(input.environments.map(environmentValues));
        await tx.insert(emailVerificationChallenges).values({
          id: input.emailVerificationChallenge.id,
          userId: input.emailVerificationChallenge.userId,
          tokenHash: input.emailVerificationChallenge.tokenHash,
          expiresAt: new Date(input.emailVerificationChallenge.expiresAt),
          usedAt: input.emailVerificationChallenge.usedAt
            ? new Date(input.emailVerificationChallenge.usedAt)
            : null,
          createdAt: new Date(input.emailVerificationChallenge.createdAt),
        });
        await tx.insert(authOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: input.outboxMessage.userId,
          recipientEmail: input.outboxMessage.recipientEmail,
          payload: input.outboxMessage.payload,
          availableAt: new Date(input.outboxMessage.availableAt),
          processedAt: input.outboxMessage.processedAt
            ? new Date(input.outboxMessage.processedAt)
            : null,
          attempts: input.outboxMessage.attempts,
          leaseVersion: input.outboxMessage.leaseVersion ?? 0,
          lastError: input.outboxMessage.lastError,
          terminalAt: input.outboxMessage.terminalAt
            ? new Date(input.outboxMessage.terminalAt)
            : null,
          createdAt: new Date(input.outboxMessage.createdAt),
        });
        if (input.session) {
          await tx.insert(authSessions).values(authSessionValues(input.session));
        }
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null> {
    return this.database.transaction(async (tx) => {
      const timestamp = new Date(now);
      await tx.execute(
        sql`select
          set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${challengeId}, true),
          set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${tokenHash}, true)`,
      );
      const [challenge] = await tx
        .select()
        .from(emailVerificationChallenges)
        .where(
          and(
            eq(emailVerificationChallenges.id, challengeId),
            eq(emailVerificationChallenges.tokenHash, tokenHash),
            isNull(emailVerificationChallenges.usedAt),
            sql`${emailVerificationChallenges.expiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      if (!challenge) return null;

      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true)`,
      );
      const [user] = await tx
        .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
        .from(users)
        .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
        .limit(1);
      return user ? { userId: user.id, emailNormalized: user.email.trim().toLowerCase() } : null;
    });
  }

  async consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const usedAt = new Date(input.usedAt);
        await tx.execute(
          sql`select
            set_config(${LODARIQ_EMAIL_VERIFICATION_ID_SETTING}, ${input.challengeId}, true),
            set_config(${LODARIQ_EMAIL_VERIFICATION_HASH_SETTING}, ${input.tokenHash}, true)`,
        );
        const [challenge] = await tx
          .select()
          .from(emailVerificationChallenges)
          .where(
            and(
              eq(emailVerificationChallenges.id, input.challengeId),
              eq(emailVerificationChallenges.tokenHash, input.tokenHash),
              isNull(emailVerificationChallenges.usedAt),
              sql`${emailVerificationChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .limit(1);
        if (!challenge) return null;

        await tx.execute(
          sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true)`,
        );
        const [user] = await tx
          .select()
          .from(users)
          .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
          .limit(1);
        if (!user) return null;
        const emailNormalized = user.email.trim().toLowerCase();
        const [pendingCredential] = await tx
          .select()
          .from(passwordCredentials)
          .where(
            and(
              eq(passwordCredentials.userId, user.id),
              eq(passwordCredentials.emailNormalized, emailNormalized),
            ),
          )
          .limit(1)
          .for('update');
        if (!pendingCredential) return null;

        const consumed = await tx
          .update(emailVerificationChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(emailVerificationChallenges.id, challenge.id),
              eq(emailVerificationChallenges.tokenHash, input.tokenHash),
              isNull(emailVerificationChallenges.usedAt),
              sql`${emailVerificationChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .returning({ userId: emailVerificationChallenges.userId });
        if (consumed.length !== 1) return null;

        const [replacedCredential] = await tx
          .update(passwordCredentials)
          .set({
            algorithm: input.credential.algorithm,
            passwordHash: input.credential.passwordHash,
            updatedAt: new Date(input.credential.updatedAt),
          })
          .where(
            and(
              eq(passwordCredentials.userId, user.id),
              eq(passwordCredentials.emailNormalized, emailNormalized),
              eq(passwordCredentials.emailLookupHash, pendingCredential.emailLookupHash),
            ),
          )
          .returning({ userId: passwordCredentials.userId });
        if (!replacedCredential) throw new EmailVerificationAtomicWriteRejected();

        const [verified] = await tx
          .update(users)
          .set({ emailVerifiedAt: usedAt })
          .where(and(eq(users.id, challenge.userId), isNull(users.emailVerifiedAt)))
          .returning();
        if (!verified) throw new EmailVerificationAtomicWriteRejected();

        await tx
          .update(authSessions)
          .set({ revokedAt: usedAt })
          .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
        return toUserRecord(verified);
      });
    } catch (error) {
      if (
        error instanceof EmailVerificationAtomicWriteRejected ||
        isUniqueConstraintViolation(error)
      ) {
        return null;
      }
      throw error;
    }
  }

  async requestSetPasswordChallenge(input: RequestSetPasswordChallengeInput): Promise<boolean> {
    if (
      input.emailNormalized !== input.emailNormalized.trim().toLowerCase() ||
      input.challenge.emailNormalized !== input.emailNormalized ||
      input.challenge.emailLookupHash !== input.emailLookupHash ||
      input.challenge.usedAt !== null ||
      input.outboxMessage.type !== 'set_password' ||
      input.outboxMessage.payload.purpose !== 'set_password' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id
    ) {
      return false;
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${input.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${input.emailLookupHash}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING}, ${input.challenge.id}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING}, ${input.challenge.tokenHash}, true)`,
        );
        // Serialize replacement for one normalized address without requiring a
        // pre-challenge UPDATE policy on the users table.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${input.emailLookupHash}, 0))`,
        );
        const matchingUsers = await tx
          .select()
          .from(users)
          .where(sql`lower(btrim(${users.email})) = ${input.emailNormalized}`)
          .limit(2);
        if (matchingUsers.length !== 1) return false;
        const [user] = matchingUsers;
        if (!user) return false;

        await tx.execute(sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${user.id}, true)`);
        const createdAt = new Date(input.challenge.createdAt);
        await tx
          .update(setPasswordOutbox)
          .set({ terminalAt: createdAt, lastError: 'superseded' })
          .where(
            and(
              eq(setPasswordOutbox.userId, user.id),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
            ),
          );
        await tx
          .update(setPasswordChallenges)
          .set({ usedAt: createdAt })
          .where(
            and(eq(setPasswordChallenges.userId, user.id), isNull(setPasswordChallenges.usedAt)),
          );
        await tx.insert(setPasswordChallenges).values({
          id: input.challenge.id,
          userId: user.id,
          tokenHash: input.challenge.tokenHash,
          emailNormalized: input.challenge.emailNormalized,
          emailLookupHash: input.challenge.emailLookupHash,
          expiresAt: new Date(input.challenge.expiresAt),
          usedAt: null,
          createdAt,
        });
        await tx.insert(setPasswordOutbox).values({
          id: input.outboxMessage.id,
          type: input.outboxMessage.type,
          userId: user.id,
          recipientEmail: input.emailNormalized,
          payload: input.outboxMessage.payload,
          availableAt: new Date(input.outboxMessage.availableAt),
          processedAt: input.outboxMessage.processedAt
            ? new Date(input.outboxMessage.processedAt)
            : null,
          attempts: input.outboxMessage.attempts,
          leaseVersion: input.outboxMessage.leaseVersion ?? 0,
          lastError: input.outboxMessage.lastError,
          terminalAt: input.outboxMessage.terminalAt
            ? new Date(input.outboxMessage.terminalAt)
            : null,
          createdAt: new Date(input.outboxMessage.createdAt),
        });
        return true;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null> {
    return runWithSetPasswordChallengeLookupScope(
      this.database,
      challengeId,
      tokenHash,
      async (tx) => {
        const [challenge] = await tx
          .select()
          .from(setPasswordChallenges)
          .where(
            and(
              eq(setPasswordChallenges.id, challengeId),
              eq(setPasswordChallenges.tokenHash, tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${new Date(now)}`,
            ),
          )
          .limit(1);
        return challenge
          ? { userId: challenge.userId, emailNormalized: challenge.emailNormalized }
          : null;
      },
    );
  }

  async consumeSetPasswordChallenge(
    input: ConsumeSetPasswordChallengeInput,
  ): Promise<UserRecord | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const usedAt = new Date(input.usedAt);
        await tx.execute(
          sql`select
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_ID_SETTING}, ${input.challengeId}, true),
            set_config(${LODARIQ_SET_PASSWORD_CHALLENGE_HASH_SETTING}, ${input.tokenHash}, true)`,
        );
        const [challenge] = await tx
          .select()
          .from(setPasswordChallenges)
          .where(
            and(
              eq(setPasswordChallenges.id, input.challengeId),
              eq(setPasswordChallenges.tokenHash, input.tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .limit(1);
        if (!challenge) return null;

        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${challenge.userId}, true),
            set_config(${LODARIQ_AUTH_EMAIL_NORMALIZED_SETTING}, ${challenge.emailNormalized}, true),
            set_config(${LODARIQ_AUTH_EMAIL_LOOKUP_HASH_SETTING}, ${challenge.emailLookupHash}, true)`,
        );
        const [user] = await tx
          .select()
          .from(users)
          .where(
            and(
              eq(users.id, challenge.userId),
              sql`lower(btrim(${users.email})) = ${challenge.emailNormalized}`,
            ),
          )
          .limit(1);
        if (!user) return null;

        const consumed = await tx
          .update(setPasswordChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(setPasswordChallenges.id, input.challengeId),
              eq(setPasswordChallenges.tokenHash, input.tokenHash),
              isNull(setPasswordChallenges.usedAt),
              sql`${setPasswordChallenges.expiresAt} > ${usedAt}`,
            ),
          )
          .returning({ userId: setPasswordChallenges.userId });
        if (consumed.length !== 1) return null;

        await tx
          .insert(passwordCredentials)
          .values({
            userId: user.id,
            emailNormalized: challenge.emailNormalized,
            emailLookupHash: challenge.emailLookupHash,
            algorithm: input.credential.algorithm,
            passwordHash: input.credential.passwordHash,
            createdAt: new Date(input.credential.createdAt),
            updatedAt: new Date(input.credential.updatedAt),
          })
          .onConflictDoUpdate({
            target: passwordCredentials.userId,
            set: {
              emailNormalized: challenge.emailNormalized,
              emailLookupHash: challenge.emailLookupHash,
              algorithm: input.credential.algorithm,
              passwordHash: input.credential.passwordHash,
              updatedAt: new Date(input.credential.updatedAt),
            },
          });

        const [verified] = await tx
          .update(users)
          .set({
            emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${usedAt})`,
          })
          .where(eq(users.id, user.id))
          .returning();
        if (!verified) throw new SetPasswordAtomicWriteRejected();

        await tx
          .update(authSessions)
          .set({ revokedAt: usedAt })
          .where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt)));
        await tx
          .update(emailVerificationChallenges)
          .set({ usedAt })
          .where(
            and(
              eq(emailVerificationChallenges.userId, user.id),
              isNull(emailVerificationChallenges.usedAt),
            ),
          );
        await tx
          .update(setPasswordChallenges)
          .set({ usedAt })
          .where(
            and(eq(setPasswordChallenges.userId, user.id), isNull(setPasswordChallenges.usedAt)),
          );
        await tx
          .update(authOutbox)
          .set({ terminalAt: usedAt, lastError: 'challenge_consumed' })
          .where(
            and(
              eq(authOutbox.userId, user.id),
              isNull(authOutbox.processedAt),
              isNull(authOutbox.terminalAt),
            ),
          );
        await tx
          .update(setPasswordOutbox)
          .set({ terminalAt: usedAt, lastError: 'challenge_consumed' })
          .where(
            and(
              eq(setPasswordOutbox.userId, user.id),
              isNull(setPasswordOutbox.processedAt),
              isNull(setPasswordOutbox.terminalAt),
            ),
          );
        return toUserRecord(verified);
      });
    } catch (error) {
      if (error instanceof SetPasswordAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
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

  async createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    return runWithAuthUserScope(this.database, session.userId, async (tx) => {
      if (
        session.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, session.userId, session.activeWorkspaceId))
      ) {
        throw new Error('Auth session active workspace requires membership');
      }
      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(session))
        .returning();
      if (!created) throw new Error('Unable to create auth session');
      return toAuthSessionRecord(created);
    });
  }

  async createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null> {
    if (input.session.revokedAt !== null) return null;
    return runWithAuthUserScope(this.database, input.session.userId, async (tx) => {
      const [credential] = await tx
        .select({
          algorithm: passwordCredentials.algorithm,
          passwordHash: passwordCredentials.passwordHash,
        })
        .from(passwordCredentials)
        .where(eq(passwordCredentials.userId, input.session.userId))
        .limit(1)
        .for('update');
      if (
        !credential ||
        credential.algorithm !== 'argon2id-v1' ||
        credential.passwordHash !== input.expectedPasswordHash
      ) {
        return null;
      }

      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.session.userId), isNotNull(users.emailVerifiedAt)))
        .limit(1);
      if (!user) return null;
      if (
        input.session.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, input.session.userId, input.session.activeWorkspaceId))
      ) {
        return null;
      }

      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(input.session))
        .returning();
      return created ? toAuthSessionRecord(created) : null;
    });
  }

  async resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const timestamp = new Date(now);
      const [row] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${timestamp}`,
            sql`${authSessions.absoluteExpiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      return row ? toAuthSessionRecord(row) : null;
    });
  }

  async touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const timestamp = new Date(now);
      const [current] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, tokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${timestamp}`,
            sql`${authSessions.absoluteExpiresAt} > ${timestamp}`,
          ),
        )
        .limit(1);
      if (!current) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      const nextIdle = new Date(
        Math.min(new Date(idleExpiresAt).getTime(), current.absoluteExpiresAt.getTime()),
      );
      const [updated] = await tx
        .update(authSessions)
        .set({ lastSeenAt: timestamp, idleExpiresAt: nextIdle })
        .where(and(eq(authSessions.id, current.id), isNull(authSessions.revokedAt)))
        .returning();
      return updated ? toAuthSessionRecord(updated) : null;
    });
  }

  async rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null> {
    return runWithAuthSessionLookupScope(this.database, input.currentTokenHash, async (tx) => {
      const now = new Date(input.nextSession.createdAt);
      const [current] = await tx
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, input.currentTokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${now}`,
            sql`${authSessions.absoluteExpiresAt} > ${now}`,
          ),
        )
        .limit(1);
      if (!current || current.userId !== input.nextSession.userId) return null;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      if (
        input.nextSession.activeWorkspaceId &&
        !(await hasIdentityMembership(tx, current.userId, input.nextSession.activeWorkspaceId))
      ) {
        return null;
      }
      const revoked = await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(authSessions.id, current.id),
            eq(authSessions.tokenHash, input.currentTokenHash),
            isNull(authSessions.revokedAt),
            sql`${authSessions.idleExpiresAt} > ${now}`,
            sql`${authSessions.absoluteExpiresAt} > ${now}`,
          ),
        )
        .returning({ id: authSessions.id });
      // Compare-and-swap: only the request that revokes the live source row may
      // mint its replacement. A concurrent loser returns without inserting.
      if (revoked.length !== 1) return null;
      const [created] = await tx
        .insert(authSessions)
        .values(authSessionValues(input.nextSession))
        .returning();
      return created ? toAuthSessionRecord(created) : null;
    });
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean> {
    return runWithAuthSessionLookupScope(this.database, tokenHash, async (tx) => {
      const [current] = await tx
        .select({ id: authSessions.id, userId: authSessions.userId })
        .from(authSessions)
        .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)))
        .limit(1);
      if (!current) return false;
      await tx.execute(
        sql`select set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${current.userId}, true)`,
      );
      const updated = await tx
        .update(authSessions)
        .set({ revokedAt: new Date(revokedAt) })
        .where(and(eq(authSessions.id, current.id), isNull(authSessions.revokedAt)))
        .returning({ id: authSessions.id });
      return updated.length === 1;
    });
  }

  async listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]> {
    return runWithAuthUserScope(this.database, userId, async (tx) => {
      const rows = await tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          role: workspaceMemberships.role,
          createdAt: workspaces.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(eq(workspaceMemberships.userId, userId))
        .orderBy(asc(workspaces.createdAt));
      return rows.flatMap((row) => {
        const role = identityWorkspaceRole(row.role);
        return role
          ? [{ id: row.id, name: row.name, role, createdAt: toIsoString(row.createdAt) }]
          : [];
      });
    });
  }

  async createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean> {
    try {
      await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select
            set_config(${LODARIQ_AUTH_USER_ID_SETTING}, ${input.userId}, true),
            set_config('lodariq.workspace_id', ${input.workspace.id}, true)`,
        );
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!user) throw new Error('Identity user not found');
        await tx.insert(workspaces).values({
          id: input.workspace.id,
          name: input.workspace.name,
          createdAt: new Date(input.workspace.createdAt),
          updatedAt: new Date(input.workspace.updatedAt),
        });
        await tx.insert(workspaceMemberships).values({
          workspaceId: input.membership.workspaceId,
          userId: input.membership.userId,
          role: input.membership.role,
          createdAt: new Date(input.membership.createdAt),
        });
        await tx.insert(environments).values(input.environments.map(environmentValues));
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          userId: workspaceMemberships.userId,
          role: workspaceMemberships.role,
          createdAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.userId, userId),
          ),
        )
        .limit(1);

      return row ? { ...row, createdAt: toIsoString(row.createdAt) } : null;
    });
  }

  async listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(themes)
        .where(eq(themes.workspaceId, workspaceId))
        .orderBy(desc(themes.isDefault), desc(themes.updatedAt), asc(themes.id));
      return Promise.all(rows.map((row) => this.hydrateWorkspaceTheme(tx, row)));
    });
  }

  async getWorkspaceTheme(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const row = await this.findWorkspaceTheme(tx, workspaceId, themeId);
      return row ? this.hydrateWorkspaceTheme(tx, row) : null;
    });
  }

  async getDefaultWorkspaceTheme(workspaceId: string): Promise<WorkspaceThemeRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(themes)
        .where(
          and(
            eq(themes.workspaceId, workspaceId),
            eq(themes.isDefault, true),
            isNotNull(themes.activeVersionId),
          ),
        )
        .limit(1);
      return row ? this.hydrateWorkspaceTheme(tx, row) : null;
    });
  }

  async listWorkspaceThemeVersions(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeVersionRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(themeVersions)
        .where(and(eq(themeVersions.workspaceId, workspaceId), eq(themeVersions.themeId, themeId)))
        .orderBy(desc(themeVersions.version));
      return rows.map(toWorkspaceThemeVersionRecord);
    });
  }

  async createWorkspaceTheme(input: CreateWorkspaceThemeInput): Promise<WorkspaceThemeRecord> {
    const name = normalizeWorkspaceThemeName(input.name);
    assertWorkspaceThemeDraft(input.draft);
    return this.scoped(input.workspaceId, async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(themes)
        .values({
          id: `theme_${randomUUID()}`,
          workspaceId: input.workspaceId,
          name,
          draft: input.draft,
          revision: 1,
          isDefault: false,
          activeVersionId: null,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error('failed to create workspace theme');
      return toWorkspaceThemeRecord(created, null);
    });
  }

  async updateWorkspaceThemeDraft(
    input: UpdateWorkspaceThemeDraftInput,
  ): Promise<WorkspaceThemeRecord | null> {
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      const [updated] = await tx
        .update(themes)
        .set({
          name: input.name === undefined ? current.name : normalizeWorkspaceThemeName(input.name),
          draft: input.draft,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.id, input.themeId),
            eq(themes.revision, input.expectedRevision),
            eq(themes.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (!updated) {
        const actual = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (!actual) return null;
        assertWorkspaceThemeMutationGuard(
          toWorkspaceThemeRecord(actual, null),
          input.expectedRevision,
          expectedUpdatedAt,
        );
        throw new Error('workspace theme draft update failed');
      }
      return this.hydrateWorkspaceTheme(tx, updated);
    });
  }

  async approveWorkspaceTheme(
    input: ApproveWorkspaceThemeInput,
  ): Promise<WorkspaceThemeApprovalResult | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext('workspace-theme-default'))`,
      );
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext(${input.themeId}))`,
      );
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      const [latest] = await tx
        .select({ version: sql<number>`coalesce(max(${themeVersions.version}), 0)::int` })
        .from(themeVersions)
        .where(
          and(
            eq(themeVersions.workspaceId, input.workspaceId),
            eq(themeVersions.themeId, input.themeId),
          ),
        );
      const now = new Date();
      const approvedVersion = createWorkspaceThemeVersion(
        toWorkspaceThemeRecord(current, null),
        Number(latest?.version ?? 0) + 1,
        input.actorUserId,
        now.toISOString(),
      );
      await tx.insert(themeVersions).values(workspaceThemeVersionValues(approvedVersion));
      const [approvedDefault] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.isDefault, true),
            isNotNull(themes.activeVersionId),
          ),
        )
        .limit(1);
      const makeDefault = !approvedDefault;
      if (makeDefault) {
        await tx
          .update(themes)
          .set({
            isDefault: false,
            revision: sql`${themes.revision} + 1`,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(
            and(
              eq(themes.workspaceId, input.workspaceId),
              eq(themes.isDefault, true),
              ne(themes.id, input.themeId),
            ),
          );
      }
      const [updated] = await tx
        .update(themes)
        .set({
          activeVersionId: approvedVersion.id,
          isDefault: makeDefault || current.isDefault,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.id, input.themeId),
            eq(themes.revision, input.expectedRevision),
            eq(themes.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (!updated) {
        const actual = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (!actual) return null;
        assertWorkspaceThemeMutationGuard(
          toWorkspaceThemeRecord(actual, null),
          input.expectedRevision,
          expectedUpdatedAt,
        );
        throw new Error('workspace theme approval failed');
      }
      return {
        theme: toWorkspaceThemeRecord(updated, approvedVersion),
        approvedVersion,
      };
    });
  }

  async setDefaultWorkspaceTheme(
    input: SetDefaultWorkspaceThemeInput,
  ): Promise<WorkspaceThemeRecord | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    return this.scoped(input.workspaceId, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.workspaceId}), hashtext('workspace-theme-default'))`,
      );
      const current = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
      if (!current) return null;
      assertWorkspaceThemeMutationGuard(
        toWorkspaceThemeRecord(current, null),
        input.expectedRevision,
        expectedUpdatedAt,
      );
      if (!current.activeVersionId) {
        throw new WorkspaceThemeApprovalRequiredError(current.id);
      }
      if (current.isDefault) return this.hydrateWorkspaceTheme(tx, current);

      const now = new Date();
      await tx
        .update(themes)
        .set({
          isDefault: false,
          revision: sql`${themes.revision} + 1`,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(and(eq(themes.workspaceId, input.workspaceId), eq(themes.isDefault, true)));
      const [updated] = await tx
        .update(themes)
        .set({
          isDefault: true,
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(themes.workspaceId, input.workspaceId),
            eq(themes.id, input.themeId),
            eq(themes.revision, input.expectedRevision),
            eq(themes.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (!updated) {
        const actual = await this.findWorkspaceTheme(tx, input.workspaceId, input.themeId);
        if (actual) {
          assertWorkspaceThemeMutationGuard(
            toWorkspaceThemeRecord(actual, null),
            input.expectedRevision,
            expectedUpdatedAt,
          );
        }
        throw new Error('workspace theme default change failed');
      }
      return this.hydrateWorkspaceTheme(tx, updated);
    });
  }

  async listWorkspaceThemeImpact(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeImpactRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const documentRows = await tx
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId));
      const activeDeployments = await tx
        .select({
          documentId: documentDeployments.documentId,
          environmentId: documentDeployments.environmentId,
        })
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.state, 'active'),
          ),
        );
      const environmentsByDocument = new Map<string, string[]>();
      for (const deployment of activeDeployments) {
        const ids = environmentsByDocument.get(deployment.documentId) ?? [];
        ids.push(deployment.environmentId);
        environmentsByDocument.set(deployment.documentId, ids);
      }

      const impacts: WorkspaceThemeImpactRecord[] = [];
      for (const document of documentRows) {
        const binding = themeImpactBinding(document.canonical, themeId);
        if (!binding) continue;
        const latestArtifact = await this.getLatestArtifact(tx, workspaceId, document.id);
        impacts.push({
          documentId: document.id,
          title: document.title,
          status: document.canonical.status,
          ...binding,
          latestArtifactThemeVersionId: latestArtifact?.themeVersionId ?? null,
          activeEnvironmentIds: (environmentsByDocument.get(document.id) ?? []).sort(),
        });
      }
      return impacts.sort(
        (left, right) =>
          left.title.localeCompare(right.title) || left.documentId.localeCompare(right.documentId),
      );
    });
  }

  async createStyleSource(input: CreateStyleSourceInput): Promise<StyleSourceRecord> {
    assertSafeStyleSource(input.source);
    return this.scoped(input.workspaceId, async (tx) => {
      const [theme] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.workspaceId, input.workspaceId), eq(themes.id, input.themeId)))
        .limit(1);
      if (!theme) throw new Error('theme not found in workspace');
      const [environment] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      const [source] = await tx
        .insert(styleSources)
        .values({
          id: `style_source_${randomUUID()}`,
          workspaceId: input.workspaceId,
          themeId: input.themeId,
          environmentId: input.environmentId,
          source: input.source,
          sourceHash: hashCanonicalJson(input.source),
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!source) throw new Error('failed to create style source');
      return toStyleSourceRecord(source);
    });
  }

  async listStyleSources(workspaceId: string, themeId?: string): Promise<StyleSourceRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const condition = themeId
        ? and(eq(styleSources.workspaceId, workspaceId), eq(styleSources.themeId, themeId))
        : eq(styleSources.workspaceId, workspaceId);
      const rows = await tx
        .select()
        .from(styleSources)
        .where(condition)
        .orderBy(desc(styleSources.createdAt), desc(styleSources.id));
      return rows.map(toStyleSourceRecord);
    });
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId))
        .orderBy(desc(documents.updatedAt));

      const summaries: DocumentSummary[] = [];
      for (const row of rows) {
        const latestArtifact = await this.getLatestArtifact(tx, workspaceId, row.id);
        summaries.push({
          id: row.id,
          workspaceId: row.workspaceId,
          type: row.canonical.type,
          status: row.canonical.status,
          title: row.title,
          schemaVersion: row.schemaVersion,
          createdByUserId: row.createdByUserId,
          updatedByUserId: row.updatedByUserId,
          updatedAt: toIsoString(row.updatedAt),
          ...(latestArtifact ? { latestContentHash: latestArtifact.contentHash } : {}),
          publications: await this.getLatestPublicationsForDocument(tx, workspaceId, row.id),
        });
      }
      return summaries;
    });
  }

  async getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [document] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
        .limit(1);

      if (!document) return null;
      const latestArtifact = await this.getLatestArtifact(tx, workspaceId, documentId);
      return {
        document: document.canonical,
        createdByUserId: document.createdByUserId,
        updatedByUserId: document.updatedByUserId,
        updatedAt: toIsoString(document.updatedAt),
        ...(latestArtifact ? { latestArtifact } : {}),
      };
    });
  }

  async listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
          ),
        )
        .orderBy(desc(documentVersions.version));

      return rows.map(toPersistedDocumentVersion);
    });
  }

  async getDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedDocumentVersion | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [version] = await tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.id, documentVersionId),
          ),
        )
        .limit(1);
      return version ? toPersistedDocumentVersion(version) : null;
    });
  }

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);

    return this.scoped(input.workspaceId, async (tx) => {
      const now = new Date();
      const [savedDocument] = await tx
        .insert(documents)
        .values({
          id: input.document.id,
          workspaceId: input.workspaceId,
          type: input.document.type,
          status: input.document.status,
          title: input.document.title,
          schemaVersion: input.document.schemaVersion,
          canonical: input.document,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            type: input.document.type,
            status: input.document.status,
            title: input.document.title,
            schemaVersion: input.document.schemaVersion,
            canonical: input.document,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          },
          setWhere: eq(documents.workspaceId, input.workspaceId),
        })
        .returning();

      const persistedDocument = savedDocument ?? (await this.requireDocument(tx, input));
      const documentVersion = await this.insertDocumentVersion(tx, input, now);
      const latestArtifact = input.artifact
        ? await this.persistCompiledArtifact(
            tx,
            input.workspaceId,
            documentVersion.id,
            input.artifact,
            now,
          )
        : await this.getLatestArtifact(tx, input.workspaceId, input.document.id);

      return {
        document: persistedDocument.canonical,
        createdByUserId: persistedDocument.createdByUserId,
        updatedByUserId: persistedDocument.updatedByUserId,
        updatedAt: toIsoString(persistedDocument.updatedAt),
        ...(latestArtifact ? { latestArtifact } : {}),
      };
    });
  }

  async getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(eq(compiledArtifacts.workspaceId, workspaceId))
        .orderBy(desc(compiledArtifacts.createdAt))
        .limit(1);

      return artifact ? toPersistedArtifact(artifact) : null;
    });
  }

  async getCompiledArtifact(
    workspaceId: string,
    documentId: string,
    artifactId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, workspaceId),
            eq(compiledArtifacts.documentId, documentId),
            eq(compiledArtifacts.id, artifactId),
          ),
        )
        .limit(1);
      return artifact ? toPersistedArtifact(artifact) : null;
    });
  }

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication?.artifact ?? null;
  }

  async getReleaseOperation(
    workspaceId: string,
    environmentId: string,
    documentId: string,
    idempotencyKey: string,
  ): Promise<PersistedReleaseOperation | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, workspaceId),
            eq(releaseOperations.environmentId, environmentId),
            eq(releaseOperations.documentId, documentId),
            eq(releaseOperations.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return operation ? toPersistedReleaseOperation(operation) : null;
    });
  }

  async getReleaseOperationById(
    workspaceId: string,
    operationId: string,
  ): Promise<PersistedReleaseOperation | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, workspaceId),
            eq(releaseOperations.id, operationId),
          ),
        )
        .limit(1);
      return operation ? toPersistedReleaseOperation(operation) : null;
    });
  }

  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, async (tx) => {
      const deploymentRows = await tx
        .select()
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.environmentId, environmentId),
          ),
        )
        .orderBy(asc(documentDeployments.documentId));

      if (deploymentRows.length === 0) {
        const legacyPublication = await this.getLatestLegacyPublication(
          tx,
          workspaceId,
          environmentId,
        );
        return legacyPublication
          ? this.loadPublication(tx, workspaceId, legacyPublication.id)
          : null;
      }

      const activeDeployments = deploymentRows.filter(
        (deployment) => deployment.state === 'active',
      );
      if (activeDeployments.length === 0) return null;
      if (activeDeployments.length > 1) {
        throw new AmbiguousCurrentPublicationError(
          workspaceId,
          environmentId,
          activeDeployments.map((deployment) => deployment.documentId),
        );
      }

      const [activeDeployment] = activeDeployments;
      if (!activeDeployment?.activePublicationId) {
        throw new Error('active document deployment has no publication');
      }
      return this.loadDeploymentPublication(tx, activeDeployment);
    });
  }

  async getDocumentDeployment(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDocumentDeployment | null> {
    return this.scoped(workspaceId, async (tx) => {
      const row = await this.findDocumentDeployment(tx, workspaceId, environmentId, documentId);
      return row ? toPersistedDocumentDeployment(row) : null;
    });
  }

  async listDocumentDeployments(
    workspaceId: string,
    environmentId?: string,
  ): Promise<PersistedDocumentDeployment[]> {
    return this.scoped(workspaceId, async (tx) => {
      const condition = environmentId
        ? and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.environmentId, environmentId),
          )
        : eq(documentDeployments.workspaceId, workspaceId);
      const rows = await tx
        .select()
        .from(documentDeployments)
        .where(condition)
        .orderBy(asc(documentDeployments.environmentId), asc(documentDeployments.documentId));
      return rows.map(toPersistedDocumentDeployment);
    });
  }

  async listDocumentPublications(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedPublication[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          publication: publications,
          environment: environments.kind,
          artifact: compiledArtifacts,
        })
        .from(publications)
        .innerJoin(
          environments,
          and(
            eq(publications.workspaceId, environments.workspaceId),
            eq(publications.environmentId, environments.id),
          ),
        )
        .innerJoin(
          compiledArtifacts,
          and(
            eq(publications.workspaceId, compiledArtifacts.workspaceId),
            eq(publications.documentId, compiledArtifacts.documentId),
            eq(publications.compiledArtifactId, compiledArtifacts.id),
          ),
        )
        .where(
          and(eq(publications.workspaceId, workspaceId), eq(publications.documentId, documentId)),
        )
        .orderBy(desc(publications.publishedAt), desc(publications.id));
      return rows.map((row) =>
        toPersistedPublication(row.publication, row.environment, toPersistedArtifact(row.artifact)),
      );
    });
  }

  async getPublicationById(
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, (tx) => this.loadPublication(tx, workspaceId, publicationId));
  }

  async getCurrentPublicationForDocument(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, async (tx) => {
      const deployment = await this.findDocumentDeployment(
        tx,
        workspaceId,
        environmentId,
        documentId,
      );
      if (!deployment || deployment.state === 'inactive') return null;
      return this.loadDeploymentPublication(tx, deployment);
    });
  }

  async publishCompiledArtifact(
    input: PublishCompiledArtifactInput,
  ): Promise<PersistedPublication> {
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);

    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error('environment not found in workspace');
      }

      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.id, input.artifact.id),
          ),
        )
        .limit(1);

      if (!artifact) {
        throw new Error('compiled artifact not found in workspace');
      }
      if (artifact.compiled.documentId !== artifact.documentId) {
        throw new Error('compiled artifact document mismatch');
      }

      const now = new Date();
      const [publication] = await tx
        .insert(publications)
        .values({
          id: `pub_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: artifact.documentId,
          documentVersionId: artifact.documentVersionId,
          compiledArtifactId: artifact.id,
          contentHash: artifact.contentHash,
          action: 'publish',
          sourcePublicationId: null,
          previousPublicationId: null,
          releaseOperationId: null,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();

      if (!publication) {
        throw new Error('failed to create publication');
      }

      return toPersistedPublication(publication, environment.kind, toPersistedArtifact(artifact));
    });
  }

  async activateCompiledArtifact(
    input: ActivateCompiledArtifactInput,
  ): Promise<ReleaseActivationResult> {
    assertReleaseMutationGuardInput(input);
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);

    const outcome = await this.scoped(input.workspaceId, async (tx): Promise<ReleaseOutcome> => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');

      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.id, input.artifact.id),
            eq(compiledArtifacts.documentId, input.artifact.documentId),
          ),
        )
        .limit(1);
      if (!artifact) throw new Error('compiled artifact not found in workspace');
      if (artifact.compiled.documentId !== artifact.documentId) {
        throw new Error('compiled artifact document mismatch');
      }

      const now = new Date();
      const action = input.action ?? 'publish';
      const sourcePublicationId = input.sourcePublicationId ?? null;
      const [insertedOperation] = await tx
        .insert(releaseOperations)
        .values({
          id: `relop_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: artifact.documentId,
          action,
          requestedArtifactId: artifact.id,
          sourcePublicationId,
          expectedGeneration: input.expectedGeneration,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          status: 'activating',
          correlationId: input.correlationId,
          requestedByUserId: input.actorUserId,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            releaseOperations.workspaceId,
            releaseOperations.environmentId,
            releaseOperations.documentId,
            releaseOperations.idempotencyKey,
          ],
        })
        .returning();

      if (!insertedOperation) {
        const existingOperation = await this.findReleaseOperation(tx, input);
        if (!existingOperation) throw new Error('failed to resolve idempotent release operation');
        return this.resolveExistingReleaseOperation(tx, input, existingOperation);
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtext(${`${input.workspaceId}:${input.environmentId}`}),
          hashtext(${artifact.documentId})
        )`,
      );

      const currentDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.environmentId,
        artifact.documentId,
      );
      const actualGeneration = currentDeployment?.generation ?? 0;
      if (actualGeneration !== input.expectedGeneration) {
        const [failedOperation] = await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: actualGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, insertedOperation.id))
          .returning();
        if (!failedOperation) throw new Error('failed to record deployment conflict');
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration,
        };
      }

      const [publication] = await tx
        .insert(publications)
        .values({
          id: `pub_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: artifact.documentId,
          documentVersionId: artifact.documentVersionId,
          compiledArtifactId: artifact.id,
          contentHash: artifact.contentHash,
          action,
          sourcePublicationId,
          previousPublicationId:
            currentDeployment?.state === 'active' ? currentDeployment.activePublicationId : null,
          releaseOperationId: insertedOperation.id,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();
      if (!publication) throw new Error('failed to create release publication');

      const deployment = currentDeployment
        ? await this.advanceExistingDeployment(
            tx,
            currentDeployment,
            publication.id,
            insertedOperation.id,
            now,
          )
        : await this.createInitialDeployment(
            tx,
            input,
            artifact.documentId,
            publication.id,
            insertedOperation.id,
            now,
          );
      if (!deployment) {
        throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
      }

      const [completedOperation] = await tx
        .update(releaseOperations)
        .set({
          status: 'completed',
          resultPublicationId: publication.id,
          resultGeneration: deployment.generation,
          errorCode: null,
          completedAt: now,
        })
        .where(eq(releaseOperations.id, insertedOperation.id))
        .returning();
      if (!completedOperation) throw new Error('failed to complete release operation');

      return {
        kind: 'success',
        result: {
          operation: toPersistedReleaseOperation(completedOperation),
          publication: toPersistedPublication(
            publication,
            environment.kind,
            toPersistedArtifact(artifact),
          ),
          deployment: toPersistedDocumentDeployment(deployment),
          replayed: false,
        },
      };
    });

    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'idempotency_conflict') {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    if (outcome.kind === 'in_progress') {
      throw new ReleaseOperationInProgressError(input.idempotencyKey);
    }
    if (outcome.kind === 'deployment_changed') {
      throw new DeploymentChangedError(outcome.expectedGeneration, outcome.actualGeneration);
    }
    throw new Error(outcome.errorCode);
  }

  async createPublicationVerification(
    input: CreatePublicationVerificationInput,
  ): Promise<PublicationVerificationRecord> {
    assertBrowserVerificationReport(input.report);
    const verifiedOrigin = requireExactHttpOrigin(input.verifiedOrigin);
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('share');
      if (!environment || environment.kind !== 'staging') {
        throw new Error('publication verification requires a staging environment');
      }
      if (!environment.originAllowlist.includes(verifiedOrigin)) {
        throw new Error('publication verification origin is not allowlisted for the environment');
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtext(${`${input.workspaceId}:${input.environmentId}`}),
          hashtext(${input.documentId})
        )`,
      );
      const deployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.environmentId,
        input.documentId,
      );
      const actualPublicationId =
        deployment?.state === 'active' ? deployment.activePublicationId : null;
      if (actualPublicationId !== input.expectedPublicationId) {
        throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
      }
      const publication = deployment ? await this.loadDeploymentPublication(tx, deployment) : null;
      if (!publication || publication.id !== input.expectedPublicationId) {
        throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
      }
      const [verification] = await tx
        .insert(publicationVerifications)
        .values({
          id: `pubverify_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          publicationId: publication.id,
          result: input.report.status === 'failed' ? 'failed' : 'passed',
          report: input.report,
          verifiedOrigin,
          verifiedByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!verification) throw new Error('failed to create publication verification');
      return toPublicationVerificationRecord(verification);
    });
  }

  async listPublicationVerifications(
    workspaceId: string,
    publicationId: string,
  ): Promise<PublicationVerificationRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(publicationVerifications)
        .where(
          and(
            eq(publicationVerifications.workspaceId, workspaceId),
            eq(publicationVerifications.publicationId, publicationId),
          ),
        )
        .orderBy(desc(publicationVerifications.createdAt), desc(publicationVerifications.id));
      return rows.map(toPublicationVerificationRecord);
    });
  }

  async createReleaseApproval(input: CreateReleaseApprovalInput): Promise<ReleaseApprovalRecord> {
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new Error('release approval decision must be approved or rejected');
    }
    const reason = normalizeReleaseApprovalReason(input.reason);
    return this.scoped(input.workspaceId, async (tx) => {
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, input.workspaceId),
            eq(releaseOperations.id, input.releaseOperationId),
          ),
        )
        .limit(1);
      if (!operation || operation.action !== 'promote') {
        throw new Error('promotion release operation not found in workspace');
      }
      if (operation.status !== 'awaiting_approval') {
        throw new Error('release operation is not awaiting approval');
      }
      const [approval] = await tx
        .insert(releaseApprovals)
        .values({
          id: `relapproval_${randomUUID()}`,
          workspaceId: input.workspaceId,
          releaseOperationId: operation.id,
          decision: input.decision,
          reason,
          decidedByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            releaseApprovals.workspaceId,
            releaseApprovals.releaseOperationId,
            releaseApprovals.decidedByUserId,
          ],
        })
        .returning();
      if (!approval) throw new Error('release approver already recorded an immutable decision');
      return toReleaseApprovalRecord(approval);
    });
  }

  async listReleaseApprovals(
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<ReleaseApprovalRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(releaseApprovals)
        .where(
          and(
            eq(releaseApprovals.workspaceId, workspaceId),
            eq(releaseApprovals.releaseOperationId, releaseOperationId),
          ),
        )
        .orderBy(desc(releaseApprovals.createdAt), desc(releaseApprovals.id));
      return rows.map(toReleaseApprovalRecord);
    });
  }

  async promoteVerifiedPublication(
    input: PromoteVerifiedPublicationInput,
  ): Promise<PromotionResult> {
    assertReleaseMutationGuardInput(input);
    if (!input.expectedSourcePublicationId.trim()) {
      throw new Error('promotion requires an expected source publication');
    }
    const outcome = await this.scoped(input.workspaceId, async (tx): Promise<PromotionOutcome> => {
      const environmentRows = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            inArray(environments.id, [input.sourceEnvironmentId, input.targetEnvironmentId]),
          ),
        )
        .for('share');
      const sourceEnvironment = environmentRows.find(
        (environment) => environment.id === input.sourceEnvironmentId,
      );
      const targetEnvironment = environmentRows.find(
        (environment) => environment.id === input.targetEnvironmentId,
      );
      if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
        throw new Error('production promotion source must be staging');
      }
      if (!targetEnvironment || targetEnvironment.kind !== 'production') {
        throw new Error('production promotion target must be production');
      }

      for (const environmentId of [input.sourceEnvironmentId, input.targetEnvironmentId].sort()) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(
              hashtext(${`${input.workspaceId}:${environmentId}`}),
              hashtext(${input.documentId})
            )`,
        );
      }

      let operation = await this.findPromotionOperation(tx, input);
      const replayedRequest = Boolean(operation);
      if (operation) {
        const requestChanged =
          operation.action !== 'promote' ||
          operation.sourcePublicationId !== input.expectedSourcePublicationId ||
          operation.expectedGeneration !== input.expectedGeneration ||
          operation.requestHash !== input.requestHash;
        if (requestChanged) return { kind: 'idempotency_conflict' };
        if (operation.status === 'completed') {
          if (!operation.sourcePublicationId || !operation.resultPublicationId) {
            return { kind: 'failed', errorCode: 'promotion_result_missing' };
          }
          const sourcePublication = await this.loadPublication(
            tx,
            input.workspaceId,
            operation.sourcePublicationId,
          );
          const publication = await this.loadPublication(
            tx,
            input.workspaceId,
            operation.resultPublicationId,
          );
          if (
            !sourcePublication ||
            !publication ||
            operation.resultGeneration === null ||
            operation.requestedArtifactId !== sourcePublication.compiledArtifactId
          ) {
            return { kind: 'failed', errorCode: 'promotion_result_missing' };
          }
          const approvals = await this.findReleaseApprovals(tx, input.workspaceId, operation.id);
          return {
            kind: 'success',
            result: {
              operation: toPersistedReleaseOperation(operation),
              sourcePublication,
              publication,
              deployment: {
                workspaceId: operation.workspaceId,
                environmentId: operation.environmentId,
                documentId: operation.documentId,
                state: 'active',
                activePublicationId: publication.id,
                pendingReleaseOperationId: null,
                generation: operation.resultGeneration,
                updatedAt: toIsoString(operation.completedAt ?? operation.createdAt),
              },
              approvalCount: approvals.filter((approval) => approval.decision === 'approved')
                .length,
              requiredApprovalCount: targetEnvironment.requiredApprovalCount,
              replayed: true,
            },
          };
        }
        if (operation.status === 'activating') return { kind: 'in_progress' };
        if (operation.status === 'failed') {
          if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
            return {
              kind: 'deployment_changed',
              expectedGeneration: operation.expectedGeneration,
              actualGeneration: operation.resultGeneration ?? 0,
            };
          }
          if (operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE) {
            return { kind: 'approval_rejected', operationId: operation.id };
          }
          if (operation.errorCode === ACTIVE_PUBLICATION_CHANGED_ERROR_CODE) {
            return { kind: 'active_publication_changed', actualPublicationId: null };
          }
          return {
            kind: 'failed',
            errorCode: operation.errorCode ?? 'promotion_operation_failed',
          };
        }
      }

      const sourceDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.sourceEnvironmentId,
        input.documentId,
      );
      const activeSourcePublicationId =
        sourceDeployment?.state === 'active' ? sourceDeployment.activePublicationId : null;
      if (activeSourcePublicationId !== input.expectedSourcePublicationId) {
        if (operation) {
          await this.failPendingPromotionOperation(
            tx,
            operation,
            ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
          );
        }
        return {
          kind: 'active_publication_changed',
          actualPublicationId: activeSourcePublicationId,
        };
      }
      const sourcePublication = sourceDeployment
        ? await this.loadDeploymentPublication(tx, sourceDeployment)
        : null;
      if (!sourcePublication || sourcePublication.id !== input.expectedSourcePublicationId) {
        if (operation) {
          await this.failPendingPromotionOperation(
            tx,
            operation,
            ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
          );
        }
        return {
          kind: 'active_publication_changed',
          actualPublicationId: activeSourcePublicationId,
        };
      }
      if (operation && operation.requestedArtifactId !== sourcePublication.compiledArtifactId) {
        await this.failPendingPromotionOperation(tx, operation, 'promotion_artifact_pin_mismatch');
        return { kind: 'failed', errorCode: 'promotion_artifact_pin_mismatch' };
      }
      const [latestVerification] = await tx
        .select()
        .from(publicationVerifications)
        .where(
          and(
            eq(publicationVerifications.workspaceId, input.workspaceId),
            eq(publicationVerifications.publicationId, sourcePublication.id),
          ),
        )
        .orderBy(desc(publicationVerifications.createdAt), desc(publicationVerifications.id))
        .limit(1);
      if (!latestVerification || latestVerification.result !== 'passed') {
        return { kind: 'verification_required' };
      }

      const targetDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.targetEnvironmentId,
        input.documentId,
      );
      const actualGeneration = targetDeployment?.generation ?? 0;
      const now = new Date();
      if (!operation && targetDeployment?.pendingReleaseOperationId) {
        const [pendingOperation] = await tx
          .select()
          .from(releaseOperations)
          .where(
            and(
              eq(releaseOperations.workspaceId, input.workspaceId),
              eq(releaseOperations.id, targetDeployment.pendingReleaseOperationId),
            ),
          )
          .limit(1);
        const staleSource =
          pendingOperation?.status === 'awaiting_approval' &&
          pendingOperation.sourcePublicationId !== sourcePublication.id;
        if (!pendingOperation || !staleSource) return { kind: 'in_progress' };
        await this.failPendingPromotionOperation(
          tx,
          pendingOperation,
          ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
        );
      }
      if (!operation) {
        const status =
          targetEnvironment.requiredApprovalCount > 0 ? 'awaiting_approval' : 'activating';
        const [insertedOperation] = await tx
          .insert(releaseOperations)
          .values({
            id: `relop_${randomUUID()}`,
            workspaceId: input.workspaceId,
            environmentId: input.targetEnvironmentId,
            documentId: input.documentId,
            action: 'promote',
            requestedArtifactId: sourcePublication.compiledArtifactId,
            sourcePublicationId: sourcePublication.id,
            expectedGeneration: input.expectedGeneration,
            resultGeneration:
              actualGeneration === input.expectedGeneration ? null : actualGeneration,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            status: actualGeneration === input.expectedGeneration ? status : 'failed',
            correlationId: input.correlationId,
            requestedByUserId: input.actorUserId,
            errorCode:
              actualGeneration === input.expectedGeneration ? null : DEPLOYMENT_CHANGED_ERROR_CODE,
            createdAt: now,
            completedAt: actualGeneration === input.expectedGeneration ? null : now,
          })
          .returning();
        if (!insertedOperation) throw new Error('failed to create promotion operation');
        operation = insertedOperation;
        if (actualGeneration !== input.expectedGeneration) {
          return {
            kind: 'deployment_changed',
            expectedGeneration: input.expectedGeneration,
            actualGeneration,
          };
        }
      }

      const approvals = await this.findReleaseApprovals(tx, input.workspaceId, operation.id);
      if (approvals.some((approval) => approval.decision === 'rejected')) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        await this.clearPendingReleaseOperation(tx, operation.id);
        return { kind: 'approval_rejected', operationId: operation.id };
      }
      const approvalCount = approvals.filter((approval) => approval.decision === 'approved').length;
      if (approvalCount < targetEnvironment.requiredApprovalCount) {
        const pendingDeployment = await this.setPendingPromotionDeployment(
          tx,
          input,
          operation.id,
          targetDeployment,
          now,
        );
        if (!pendingDeployment) return { kind: 'in_progress' };
        const [awaitingOperation] = await tx
          .update(releaseOperations)
          .set({ status: 'awaiting_approval', errorCode: null })
          .where(eq(releaseOperations.id, operation.id))
          .returning();
        if (!awaitingOperation) throw new Error('failed to await promotion approval');
        return {
          kind: 'success',
          result: {
            operation: toPersistedReleaseOperation(awaitingOperation),
            sourcePublication,
            publication: null,
            deployment: null,
            approvalCount,
            requiredApprovalCount: targetEnvironment.requiredApprovalCount,
            replayed: replayedRequest,
          },
        };
      }

      const currentTargetDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.targetEnvironmentId,
        input.documentId,
      );
      const currentGeneration = currentTargetDeployment?.generation ?? 0;
      if (currentGeneration !== input.expectedGeneration) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: currentGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration: currentGeneration,
        };
      }
      await tx
        .update(releaseOperations)
        .set({ status: 'activating', errorCode: null })
        .where(eq(releaseOperations.id, operation.id));
      const [publication] = await tx
        .insert(publications)
        .values({
          id: `pub_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.targetEnvironmentId,
          documentId: sourcePublication.documentId,
          documentVersionId: sourcePublication.documentVersionId,
          compiledArtifactId: sourcePublication.compiledArtifactId,
          contentHash: sourcePublication.contentHash,
          action: 'promote',
          sourcePublicationId: sourcePublication.id,
          previousPublicationId:
            currentTargetDeployment?.state === 'active'
              ? currentTargetDeployment.activePublicationId
              : null,
          releaseOperationId: operation.id,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();
      if (!publication) throw new Error('failed to create promotion publication');
      const deployment = currentTargetDeployment
        ? await this.advanceExistingDeployment(
            tx,
            currentTargetDeployment,
            publication.id,
            operation.id,
            now,
          )
        : await this.createInitialPromotionDeployment(tx, input, publication.id, now);
      if (!deployment) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: currentGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration: currentGeneration,
        };
      }
      const [completedOperation] = await tx
        .update(releaseOperations)
        .set({
          status: 'completed',
          resultPublicationId: publication.id,
          resultGeneration: deployment.generation,
          errorCode: null,
          completedAt: now,
        })
        .where(eq(releaseOperations.id, operation.id))
        .returning();
      if (!completedOperation) throw new Error('failed to complete promotion operation');
      return {
        kind: 'success',
        result: {
          operation: toPersistedReleaseOperation(completedOperation),
          sourcePublication,
          publication: toPersistedPublication(
            publication,
            targetEnvironment.kind,
            sourcePublication.artifact,
          ),
          deployment: toPersistedDocumentDeployment(deployment),
          approvalCount,
          requiredApprovalCount: targetEnvironment.requiredApprovalCount,
          replayed: false,
        },
      };
    });

    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'idempotency_conflict') {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    if (outcome.kind === 'in_progress') {
      throw new ReleaseOperationInProgressError(input.idempotencyKey);
    }
    if (outcome.kind === 'active_publication_changed') {
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        outcome.actualPublicationId,
      );
    }
    if (outcome.kind === 'verification_required') {
      throw new PublicationVerificationRequiredError(input.expectedSourcePublicationId);
    }
    if (outcome.kind === 'approval_rejected') {
      throw new ReleaseApprovalRejectedError(outcome.operationId);
    }
    if (outcome.kind === 'deployment_changed') {
      throw new DeploymentChangedError(outcome.expectedGeneration, outcome.actualGeneration);
    }
    throw new Error(outcome.errorCode);
  }

  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, workspaceId))
        .orderBy(environments.kind);

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        kind: row.kind,
        name: row.name,
        originAllowlist: row.originAllowlist,
        requiredApprovalCount: normalizeRequiredApprovalCount(row.requiredApprovalCount),
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
      }));
    });
  }

  async updateEnvironmentReleasePolicy(
    input: UpdateEnvironmentReleasePolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    assertRequiredApprovalCount(input.requiredApprovalCount);
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'environment release policy expectedUpdatedAt',
    );
    return this.scoped(input.workspaceId, async (tx) => {
      const [current] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('update');
      if (!current) return null;
      const actualUpdatedAt = toIsoString(current.updatedAt);
      if (actualUpdatedAt !== expectedUpdatedAt) {
        throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, actualUpdatedAt);
      }
      const [updated] = await tx
        .update(environments)
        .set({
          requiredApprovalCount: input.requiredApprovalCount,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
            eq(environments.updatedAt, current.updatedAt),
          ),
        )
        .returning();
      if (!updated) throw new Error('environment release policy update failed');
      return toWorkspaceEnvironment(updated);
    });
  }

  async listPublicSdkInstallations(
    workspaceId: string,
  ): Promise<PublicSdkInstallationWithOrigins[]> {
    return this.scoped(workspaceId, async (tx) => {
      const installationRows = await tx
        .select()
        .from(publicSdkInstallations)
        .where(eq(publicSdkInstallations.workspaceId, workspaceId))
        .orderBy(desc(publicSdkInstallations.updatedAt), asc(publicSdkInstallations.id));
      const originRows = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(eq(publicSdkInstallationOrigins.workspaceId, workspaceId))
        .orderBy(
          asc(publicSdkInstallationOrigins.installationId),
          asc(publicSdkInstallationOrigins.environmentId),
          asc(publicSdkInstallationOrigins.exactOrigin),
        );
      const originsByInstallation = new Map<string, PublicSdkInstallationOriginRecord[]>();
      for (const origin of originRows) {
        const records = originsByInstallation.get(origin.installationId) ?? [];
        records.push(toPublicSdkInstallationOriginRecord(origin));
        originsByInstallation.set(origin.installationId, records);
      }

      return installationRows.map((installation) => ({
        ...toPublicSdkInstallationRecord(installation),
        origins: originsByInstallation.get(installation.id) ?? [],
      }));
    });
  }

  async getOrCreatePublicSdkInstallation(
    input: GetOrCreatePublicSdkInstallationInput,
  ): Promise<PublicSdkInstallationRecord> {
    assertPublicSdkInstallationId(input.installationId);
    return this.scoped(input.workspaceId, async (tx) => {
      const existing = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (existing) {
        if (existing.revokedAt) throw new Error('public SDK installation id already exists');
        return toPublicSdkInstallationRecord(existing);
      }

      const now = new Date();
      const [inserted] = await tx
        .insert(publicSdkInstallations)
        .values({
          id: input.installationId,
          workspaceId: input.workspaceId,
          name: input.name,
          createdByUserId: input.actorUserId,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return toPublicSdkInstallationRecord(inserted);

      const raced = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!raced || raced.revokedAt) {
        throw new Error('public SDK installation id already exists');
      }
      return toPublicSdkInstallationRecord(raced);
    });
  }

  async setPublicSdkInstallationOrigin(
    input: SetPublicSdkInstallationOriginInput,
  ): Promise<PublicSdkInstallationOriginRecord> {
    const exactOrigin = requireExactHttpOrigin(input.origin);
    return this.scoped(input.workspaceId, async (tx) => {
      const installation = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!installation || installation.revokedAt) {
        throw new Error('active public SDK installation not found in workspace');
      }
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('environment not found in workspace');
      assertPublicSdkInstallationOriginPolicy(
        environment.kind,
        exactOrigin,
        input.authoringEnabled,
      );

      const [existingMapping] = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(
          and(
            eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, input.installationId),
            eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
          ),
        )
        .limit(1);
      if (
        existingMapping &&
        (existingMapping.environmentId !== input.environmentId ||
          existingMapping.authoringEnabled !== input.authoringEnabled)
      ) {
        await tx
          .delete(authoringSessions)
          .where(
            and(
              eq(authoringSessions.workspaceId, input.workspaceId),
              eq(authoringSessions.installationId, input.installationId),
              eq(authoringSessions.customerOrigin, exactOrigin),
            ),
          );
        await tx
          .delete(publicSdkInstallationOrigins)
          .where(
            and(
              eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
              eq(publicSdkInstallationOrigins.installationId, input.installationId),
              eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
            ),
          );
      }

      const now = new Date();
      const [mapping] = await tx
        .insert(publicSdkInstallationOrigins)
        .values({
          installationId: input.installationId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          exactOrigin,
          authoringEnabled: input.authoringEnabled,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            publicSdkInstallationOrigins.installationId,
            publicSdkInstallationOrigins.exactOrigin,
          ],
          set: {
            environmentId: input.environmentId,
            authoringEnabled: input.authoringEnabled,
            updatedAt: now,
          },
        })
        .returning();
      if (!mapping) throw new Error('failed to persist public SDK installation origin');
      return toPublicSdkInstallationOriginRecord(mapping);
    });
  }

  async syncPublicSdkInstallationOrigins(
    input: SyncPublicSdkInstallationOriginsInput,
  ): Promise<PublicSdkInstallationOriginRecord[]> {
    if (input.origins.length > 100) {
      throw new Error('public SDK installation origin sync exceeds the maximum mapping count');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const installation = await this.findPublicSdkInstallation(
        tx,
        input.workspaceId,
        input.installationId,
      );
      if (!installation || installation.revokedAt) {
        throw new Error('active public SDK installation not found in workspace');
      }

      const environmentRows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, input.workspaceId));
      const environmentById = new Map(
        environmentRows.map((environment) => [environment.id, environment] as const),
      );
      const desired = new Map<
        string,
        { environmentId: string; exactOrigin: string; authoringEnabled: boolean }
      >();
      for (const candidate of input.origins) {
        const environment = environmentById.get(candidate.environmentId);
        if (!environment) throw new Error('environment not found in workspace');
        const exactOrigin = requireExactHttpOrigin(candidate.origin);
        if (desired.has(exactOrigin)) {
          throw new Error('public SDK origin mappings must use unique exact origins');
        }
        assertPublicSdkInstallationOriginPolicy(
          environment.kind,
          exactOrigin,
          candidate.authoringEnabled,
        );
        desired.set(exactOrigin, {
          environmentId: candidate.environmentId,
          exactOrigin,
          authoringEnabled: candidate.authoringEnabled,
        });
      }

      const existing = await tx
        .select()
        .from(publicSdkInstallationOrigins)
        .where(
          and(
            eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, input.installationId),
          ),
        );
      for (const current of existing) {
        const replacement = desired.get(current.exactOrigin);
        if (
          replacement?.environmentId === current.environmentId &&
          replacement.authoringEnabled === current.authoringEnabled
        ) {
          continue;
        }
        await tx
          .delete(authoringSessions)
          .where(
            and(
              eq(authoringSessions.workspaceId, input.workspaceId),
              eq(authoringSessions.installationId, input.installationId),
              eq(authoringSessions.customerOrigin, current.exactOrigin),
            ),
          );
        await tx
          .delete(publicSdkInstallationOrigins)
          .where(
            and(
              eq(publicSdkInstallationOrigins.workspaceId, input.workspaceId),
              eq(publicSdkInstallationOrigins.installationId, input.installationId),
              eq(publicSdkInstallationOrigins.exactOrigin, current.exactOrigin),
            ),
          );
      }

      const now = new Date();
      const synchronized: PublicSdkInstallationOriginRecord[] = [];
      for (const candidate of desired.values()) {
        const [mapping] = await tx
          .insert(publicSdkInstallationOrigins)
          .values({
            installationId: input.installationId,
            workspaceId: input.workspaceId,
            environmentId: candidate.environmentId,
            exactOrigin: candidate.exactOrigin,
            authoringEnabled: candidate.authoringEnabled,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              publicSdkInstallationOrigins.installationId,
              publicSdkInstallationOrigins.exactOrigin,
            ],
            set: {
              environmentId: candidate.environmentId,
              authoringEnabled: candidate.authoringEnabled,
              updatedAt: now,
            },
          })
          .returning();
        if (!mapping) throw new Error('failed to synchronize public SDK installation origin');
        synchronized.push(toPublicSdkInstallationOriginRecord(mapping));
      }

      return synchronized.sort(comparePublicSdkInstallationOriginRecords);
    });
  }

  async resolvePublicSdkInstallation(
    installationId: string,
    origin: string,
  ): Promise<ResolvedPublicSdkInstallation | null> {
    const exactOrigin = normalizeExactOrigin(origin);
    if (!exactOrigin) return null;
    return runWithPublicSdkInstallationLookupScope(
      this.database,
      installationId,
      exactOrigin,
      async (tx) => {
        const rows = await tx
          .select({
            installation: publicSdkInstallations,
            mapping: publicSdkInstallationOrigins,
            environment: environments,
          })
          .from(publicSdkInstallationOrigins)
          .innerJoin(
            publicSdkInstallations,
            eq(publicSdkInstallationOrigins.installationId, publicSdkInstallations.id),
          )
          .innerJoin(
            environments,
            and(
              eq(publicSdkInstallationOrigins.workspaceId, environments.workspaceId),
              eq(publicSdkInstallationOrigins.environmentId, environments.id),
            ),
          )
          .where(
            and(
              eq(publicSdkInstallations.id, installationId),
              isNull(publicSdkInstallations.revokedAt),
              eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
            ),
          )
          .limit(2);
        if (rows.length !== 1) return null;
        const [row] = rows;
        if (!row) return null;
        return {
          installation: toPublicSdkInstallationRecord(row.installation),
          environment: toWorkspaceEnvironment(row.environment),
          exactOrigin: row.mapping.exactOrigin,
          authoringEnabled:
            row.environment.kind === 'production' ? false : row.mapping.authoringEnabled,
        };
      },
    );
  }

  async revokePublicSdkInstallation(
    workspaceId: string,
    installationId: string,
    _actorUserId: string,
  ): Promise<PublicSdkInstallationRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const existing = await this.findPublicSdkInstallation(tx, workspaceId, installationId);
      if (!existing) return null;
      const now = new Date();
      const [revoked] = await tx
        .update(publicSdkInstallations)
        .set({ revokedAt: existing.revokedAt ?? now, updatedAt: now })
        .where(
          and(
            eq(publicSdkInstallations.workspaceId, workspaceId),
            eq(publicSdkInstallations.id, installationId),
          ),
        )
        .returning();
      return revoked ? toPublicSdkInstallationRecord(revoked) : null;
    });
  }

  async createPublicSdkBootstrapGrant(
    input: CreatePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord> {
    assertPublicSdkBootstrapGrantLifetime(input.expiresAt);
    assertPublicSdkBootstrapGrantHash(input.grantHash);
    const exactOrigin = requireExactHttpOrigin(input.exactOrigin);
    return this.scoped(input.workspaceId, async (tx) => {
      const contexts = await tx
        .select({
          installation: publicSdkInstallations,
          mapping: publicSdkInstallationOrigins,
          environment: environments,
        })
        .from(publicSdkInstallationOrigins)
        .innerJoin(
          publicSdkInstallations,
          and(
            eq(publicSdkInstallationOrigins.workspaceId, publicSdkInstallations.workspaceId),
            eq(publicSdkInstallationOrigins.installationId, publicSdkInstallations.id),
          ),
        )
        .innerJoin(
          environments,
          and(
            eq(publicSdkInstallationOrigins.workspaceId, environments.workspaceId),
            eq(publicSdkInstallationOrigins.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(publicSdkInstallations.workspaceId, input.workspaceId),
            eq(publicSdkInstallations.id, input.installationId),
            isNull(publicSdkInstallations.revokedAt),
            eq(publicSdkInstallationOrigins.environmentId, input.environmentId),
            eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
            eq(publicSdkInstallationOrigins.authoringEnabled, true),
            sql`${environments.kind} <> 'production'`,
          ),
        )
        .limit(2);
      if (contexts.length !== 1) {
        throw new Error('authoring-enabled public SDK installation origin not found');
      }

      const now = new Date();
      const [grant] = await tx
        .insert(publicSdkBootstrapGrants)
        .values({
          id: `sdkboot_${randomUUID()}`,
          installationId: input.installationId,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          exactOrigin,
          grantHash: input.grantHash,
          createdAt: now,
          expiresAt: new Date(input.expiresAt),
          consumedAt: null,
          revokedAt: null,
        })
        .returning();
      if (!grant) throw new Error('failed to persist public SDK bootstrap grant');
      return toPublicSdkBootstrapGrantRecord(grant);
    });
  }

  async consumePublicSdkBootstrapGrant(
    input: ConsumePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isPublicSdkBootstrapGrantHash(input.grantHash)) return null;
    return runWithPublicSdkBootstrapGrantLookupScope(
      this.database,
      input.installationId,
      exactOrigin,
      input.grantHash,
      async (tx) => {
        const now = new Date();
        const [consumed] = await tx
          .update(publicSdkBootstrapGrants)
          .set({ consumedAt: now })
          .where(
            and(
              eq(publicSdkBootstrapGrants.installationId, input.installationId),
              eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
              eq(publicSdkBootstrapGrants.grantHash, input.grantHash),
              isNull(publicSdkBootstrapGrants.consumedAt),
              isNull(publicSdkBootstrapGrants.revokedAt),
              sql`${publicSdkBootstrapGrants.expiresAt} > ${now}`,
              sql`exists (
                select 1
                from public_sdk_installations installation
                inner join public_sdk_installation_origins origin_mapping
                  on origin_mapping.workspace_id = installation.workspace_id
                  and origin_mapping.installation_id = installation.id
                inner join environments environment
                  on environment.workspace_id = origin_mapping.workspace_id
                  and environment.id = origin_mapping.environment_id
                where installation.id = ${publicSdkBootstrapGrants.installationId}
                  and installation.workspace_id = ${publicSdkBootstrapGrants.workspaceId}
                  and installation.revoked_at is null
                  and origin_mapping.exact_origin = ${publicSdkBootstrapGrants.exactOrigin}
                  and origin_mapping.environment_id = ${publicSdkBootstrapGrants.environmentId}
                  and origin_mapping.authoring_enabled = true
                  and environment.kind <> 'production'
              )`,
            ),
          )
          .returning();
        return consumed ? toPublicSdkBootstrapGrantRecord(consumed) : null;
      },
    );
  }

  async createAuthoringAuthorizationRequest(
    input: CreateAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isAuthoringPkceChallenge(input.codeChallenge) ||
      !isValidAuthoringCapabilities(input.requestedCapabilities) ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS)
    ) {
      return null;
    }

    try {
      return await runWithPublicSdkBootstrapGrantLookupScope(
        this.database,
        input.installationId,
        exactOrigin,
        input.bootstrapGrantHash,
        async (tx) => {
          const now = new Date();
          const [bootstrapGrant] = await tx
            .update(publicSdkBootstrapGrants)
            .set({ consumedAt: now })
            .where(
              and(
                eq(publicSdkBootstrapGrants.installationId, input.installationId),
                eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
                eq(publicSdkBootstrapGrants.grantHash, input.bootstrapGrantHash),
                isNull(publicSdkBootstrapGrants.consumedAt),
                isNull(publicSdkBootstrapGrants.revokedAt),
                sql`${publicSdkBootstrapGrants.expiresAt} > ${now}`,
                sql`exists (
                select 1
                from public_sdk_installations installation
                inner join public_sdk_installation_origins origin_mapping
                  on origin_mapping.workspace_id = installation.workspace_id
                  and origin_mapping.installation_id = installation.id
                inner join environments environment
                  on environment.workspace_id = origin_mapping.workspace_id
                  and environment.id = origin_mapping.environment_id
                where installation.id = ${publicSdkBootstrapGrants.installationId}
                  and installation.workspace_id = ${publicSdkBootstrapGrants.workspaceId}
                  and installation.revoked_at is null
                  and origin_mapping.exact_origin = ${publicSdkBootstrapGrants.exactOrigin}
                  and origin_mapping.environment_id = ${publicSdkBootstrapGrants.environmentId}
                  and origin_mapping.authoring_enabled = true
                  and environment.kind <> 'production'
              )`,
              ),
            )
            .returning();
          if (!bootstrapGrant) return null;

          await this.setWorkspaceScope(tx, bootstrapGrant.workspaceId);
          const environment = await this.findAuthoringEnvironment(
            tx,
            bootstrapGrant.workspaceId,
            bootstrapGrant.environmentId,
          );
          if (!environment) throw new AuthoringAtomicWriteRejected();
          if (
            !(await this.isResolvedAuthoringDocumentIntent(
              tx,
              bootstrapGrant.workspaceId,
              input.documentIntent,
            ))
          ) {
            throw new AuthoringAtomicWriteRejected();
          }

          const [request] = await tx
            .insert(authoringAuthorizationRequests)
            .values({
              id: `authreq_${randomUUID()}`,
              bootstrapGrantId: bootstrapGrant.id,
              bootstrapGrantHash: bootstrapGrant.grantHash,
              installationId: bootstrapGrant.installationId,
              workspaceId: bootstrapGrant.workspaceId,
              environmentId: bootstrapGrant.environmentId,
              exactOrigin: bootstrapGrant.exactOrigin,
              stateHash: input.stateHash,
              codeChallenge: input.codeChallenge,
              codeChallengeMethod: 'S256',
              requestedCapabilities: [...input.requestedCapabilities],
              documentIntent: input.documentIntent ?? null,
              creatorId: null,
              authorizationCodeHash: null,
              expiresAt: new Date(input.expiresAt),
              approvedAt: null,
              authorizationCodeExpiresAt: null,
              authorizationCodeUsedAt: null,
              createdAt: now,
            })
            .onConflictDoNothing()
            .returning();
          if (!request) throw new AuthoringAtomicWriteRejected();
          return toAuthoringAuthorizationRequestRecord(request, environment);
        },
      );
    } catch (error) {
      if (error instanceof AuthoringAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async getAuthoringAuthorizationRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .select({ request: authoringAuthorizationRequests, environment: environments.kind })
        .from(authoringAuthorizationRequests)
        .innerJoin(
          environments,
          and(
            eq(authoringAuthorizationRequests.workspaceId, environments.workspaceId),
            eq(authoringAuthorizationRequests.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(authoringAuthorizationRequests.workspaceId, workspaceId),
            eq(authoringAuthorizationRequests.id, requestId),
            sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
            sql`${environments.kind} <> 'production'`,
            this.activeAuthorizationRequestScopeCondition(),
          ),
        )
        .limit(1);
      return row && isAuthoringEnvironmentKind(row.environment)
        ? toAuthoringAuthorizationRequestRecord(row.request, row.environment)
        : null;
    });
  }

  async getAuthoringAuthorizationRequestForUser(
    userId: string,
    requestId: string,
  ): Promise<ResolvedAuthoringAuthorizationForUser | null> {
    const candidate = await runWithAuthUserScope(this.database, userId, async (tx) => {
      await tx.execute(sql`select set_config(${AUTHORING_REQUEST_ID_SETTING}, ${requestId}, true)`);
      const [row] = await tx
        .select({
          workspaceId: authoringAuthorizationRequests.workspaceId,
          membership: workspaceMemberships,
        })
        .from(authoringAuthorizationRequests)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, authoringAuthorizationRequests.workspaceId),
            eq(workspaceMemberships.userId, userId),
            or(
              eq(workspaceMemberships.role, 'member'),
              eq(workspaceMemberships.role, 'admin'),
              eq(workspaceMemberships.role, 'owner'),
            ),
          ),
        )
        .where(
          and(
            eq(authoringAuthorizationRequests.id, requestId),
            sql`${authoringAuthorizationRequests.expiresAt} > now()`,
          ),
        )
        .limit(1);
      return row;
    });
    if (!candidate) return null;

    const request = await this.getAuthoringAuthorizationRequest(candidate.workspaceId, requestId);
    const membership = await this.resolveWorkspaceMembership(candidate.workspaceId, userId);
    if (!request || !membership || !hasAuthoringWorkspaceRole(membership.role)) return null;
    return {
      request,
      membership,
    };
  }

  async approveAuthoringAuthorizationRequest(
    input: ApproveAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    if (
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !hasValidBoundedFutureTtl(
        input.authorizationCodeExpiresAt,
        AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
        AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
      )
    ) {
      return null;
    }

    try {
      return await this.scoped(input.workspaceId, async (tx) => {
        const now = new Date();
        const [candidate] = await tx
          .select({ request: authoringAuthorizationRequests, environment: environments.kind })
          .from(authoringAuthorizationRequests)
          .innerJoin(
            environments,
            and(
              eq(authoringAuthorizationRequests.workspaceId, environments.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, environments.id),
            ),
          )
          .innerJoin(
            workspaceMemberships,
            and(
              eq(authoringAuthorizationRequests.workspaceId, workspaceMemberships.workspaceId),
              eq(workspaceMemberships.userId, input.creatorId),
              or(
                eq(workspaceMemberships.role, 'member'),
                eq(workspaceMemberships.role, 'admin'),
                eq(workspaceMemberships.role, 'owner'),
              ),
            ),
          )
          .where(
            and(
              eq(authoringAuthorizationRequests.workspaceId, input.workspaceId),
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              isNull(authoringAuthorizationRequests.creatorId),
              isNull(authoringAuthorizationRequests.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.approvedAt),
              isNull(authoringAuthorizationRequests.authorizationCodeExpiresAt),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${environments.kind} <> 'production'`,
              this.activeAuthorizationRequestScopeCondition(),
            ),
          )
          .limit(1);
        if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;

        const [approved] = await tx
          .update(authoringAuthorizationRequests)
          .set({
            creatorId: input.creatorId,
            authorizationCodeHash: input.authorizationCodeHash,
            approvedAt: now,
            authorizationCodeExpiresAt: new Date(input.authorizationCodeExpiresAt),
          })
          .where(
            and(
              eq(authoringAuthorizationRequests.workspaceId, input.workspaceId),
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              isNull(authoringAuthorizationRequests.creatorId),
              isNull(authoringAuthorizationRequests.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.approvedAt),
              isNull(authoringAuthorizationRequests.authorizationCodeExpiresAt),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
            ),
          )
          .returning();
        return approved
          ? toAuthoringAuthorizationRequestRecord(approved, candidate.environment)
          : null;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) return null;
      throw error;
    }
  }

  async exchangeAuthoringAuthorizationCode(
    input: ExchangeAuthoringAuthorizationCodeInput,
  ): Promise<AuthoringCodeExchangeRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !isSha256Hash(input.activationGrantHash) ||
      !hasValidFutureTtl(input.activationGrantExpiresAt, AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS)
    ) {
      return null;
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select
          set_config('lodariq.public_installation_id', ${input.installationId}, true),
          set_config('lodariq.public_origin', ${exactOrigin}, true),
          set_config('lodariq.bootstrap_grant_hash', ${input.bootstrapGrantHash}, true),
          set_config(${AUTHORING_REQUEST_ID_SETTING}, ${input.requestId}, true),
          set_config(${AUTHORING_STATE_HASH_SETTING}, ${input.stateHash}, true),
          set_config(${AUTHORING_CODE_HASH_SETTING}, ${input.authorizationCodeHash}, true),
          set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);

        const now = new Date();
        const [candidate] = await tx
          .select({ request: authoringAuthorizationRequests, environment: environments.kind })
          .from(authoringAuthorizationRequests)
          .innerJoin(
            environments,
            and(
              eq(authoringAuthorizationRequests.workspaceId, environments.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, environments.id),
            ),
          )
          .where(
            and(
              eq(authoringAuthorizationRequests.id, input.requestId),
              eq(authoringAuthorizationRequests.installationId, input.installationId),
              eq(authoringAuthorizationRequests.exactOrigin, exactOrigin),
              eq(authoringAuthorizationRequests.bootstrapGrantHash, input.bootstrapGrantHash),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              eq(authoringAuthorizationRequests.authorizationCodeHash, input.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${authoringAuthorizationRequests.authorizationCodeExpiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (
          !candidate ||
          !candidate.request.creatorId ||
          !candidate.request.approvedAt ||
          !candidate.request.authorizationCodeExpiresAt ||
          !isAuthoringEnvironmentKind(candidate.environment) ||
          !verifyAuthoringPkceS256Challenge(input.codeVerifier, candidate.request.codeChallenge)
        ) {
          return null;
        }

        const [bootstrapGrant] = await tx
          .select()
          .from(publicSdkBootstrapGrants)
          .where(
            and(
              eq(publicSdkBootstrapGrants.id, candidate.request.bootstrapGrantId),
              eq(publicSdkBootstrapGrants.installationId, input.installationId),
              eq(publicSdkBootstrapGrants.exactOrigin, exactOrigin),
              eq(publicSdkBootstrapGrants.grantHash, input.bootstrapGrantHash),
              sql`${publicSdkBootstrapGrants.consumedAt} is not null`,
              isNull(publicSdkBootstrapGrants.revokedAt),
              sql`${publicSdkBootstrapGrants.expiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (!bootstrapGrant) return null;

        await this.setWorkspaceScope(tx, candidate.request.workspaceId);
        if (
          !(await this.hasActiveAuthoringScope(
            tx,
            candidate.request.workspaceId,
            candidate.request.environmentId,
            candidate.request.installationId,
            candidate.request.exactOrigin,
          )) ||
          !(await this.hasAuthoringMembership(
            tx,
            candidate.request.workspaceId,
            candidate.request.creatorId,
          ))
        ) {
          return null;
        }

        const [consumedRequest] = await tx
          .update(authoringAuthorizationRequests)
          .set({ authorizationCodeUsedAt: now })
          .where(
            and(
              eq(authoringAuthorizationRequests.id, candidate.request.id),
              eq(authoringAuthorizationRequests.workspaceId, candidate.request.workspaceId),
              eq(authoringAuthorizationRequests.environmentId, candidate.request.environmentId),
              eq(authoringAuthorizationRequests.installationId, input.installationId),
              eq(authoringAuthorizationRequests.exactOrigin, exactOrigin),
              eq(authoringAuthorizationRequests.bootstrapGrantHash, input.bootstrapGrantHash),
              eq(authoringAuthorizationRequests.stateHash, input.stateHash),
              eq(authoringAuthorizationRequests.authorizationCodeHash, input.authorizationCodeHash),
              isNull(authoringAuthorizationRequests.authorizationCodeUsedAt),
              sql`${authoringAuthorizationRequests.expiresAt} > ${now}`,
              sql`${authoringAuthorizationRequests.authorizationCodeExpiresAt} > ${now}`,
            ),
          )
          .returning();
        if (!consumedRequest || !consumedRequest.creatorId) return null;

        const [activationGrant] = await tx
          .insert(authoringActivationGrants)
          .values({
            id: `authgrant_${randomUUID()}`,
            requestId: consumedRequest.id,
            installationId: consumedRequest.installationId,
            workspaceId: consumedRequest.workspaceId,
            environmentId: consumedRequest.environmentId,
            exactOrigin: consumedRequest.exactOrigin,
            creatorId: consumedRequest.creatorId,
            capabilities: [...consumedRequest.requestedCapabilities],
            documentIntent: consumedRequest.documentIntent,
            grantHash: input.activationGrantHash,
            expiresAt: new Date(input.activationGrantExpiresAt),
            usedAt: null,
            revokedAt: null,
            createdAt: now,
          })
          .returning();
        if (!activationGrant) throw new AuthoringAtomicWriteRejected();

        return {
          authorizationRequest: toAuthoringAuthorizationRequestRecord(
            consumedRequest,
            candidate.environment,
          ),
          activationGrant: toAuthoringActivationGrantRecord(activationGrant, candidate.environment),
        };
      });
    } catch (error) {
      if (error instanceof AuthoringAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async consumeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'consume');
  }

  async revokeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'revoke');
  }

  async queryAuthoringDocumentsFromActivation(
    input: QueryAuthoringDocumentsFromActivationInput,
  ): Promise<QueryAuthoringDocumentsResult | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isSha256Hash(input.activationGrantHash) ||
      !isAuthoringDocumentQueryScope(input.scope)
    ) {
      return null;
    }

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('lodariq.public_installation_id', ${input.installationId}, true),
        set_config('lodariq.public_origin', ${exactOrigin}, true),
        set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);
      const now = new Date();
      const candidates = await tx
        .select({ grant: authoringActivationGrants, environment: environments.kind })
        .from(authoringActivationGrants)
        .innerJoin(
          environments,
          and(
            eq(authoringActivationGrants.workspaceId, environments.workspaceId),
            eq(authoringActivationGrants.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(authoringActivationGrants.installationId, input.installationId),
            eq(authoringActivationGrants.exactOrigin, exactOrigin),
            eq(authoringActivationGrants.grantHash, input.activationGrantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .limit(2);
      if (candidates.length !== 1) return null;
      const [candidate] = candidates;
      if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;
      const grant = toAuthoringActivationGrantRecord(candidate.grant, candidate.environment);
      if (!grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)) {
        return null;
      }

      await this.setWorkspaceScope(tx, grant.workspaceId);
      if (
        !(await this.hasActiveAuthoringScope(
          tx,
          grant.workspaceId,
          grant.environmentId,
          grant.installationId,
          grant.exactOrigin,
        )) ||
        !(await this.hasAuthoringMembership(tx, grant.workspaceId, grant.creatorId))
      ) {
        return null;
      }

      const pageContext = { pathname };
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, grant.workspaceId), eq(documents.type, 'tour')))
        .orderBy(desc(documents.updatedAt));
      const matchingRows = rows.filter(
        (row) =>
          row.canonical.type === 'tour' &&
          (input.scope === 'workspace' ||
            matchesAuthoringPageContext(row.canonical, exactOrigin, pageContext)),
      );
      const summaries: QueryAuthoringDocumentsResult['documents'] = [];
      for (const row of matchingRows) {
        summaries.push({
          id: row.id,
          title: row.canonical.title,
          type: 'tour' as const,
          status: row.canonical.status,
          updatedAt: toIsoString(row.updatedAt),
          releases: await this.getLatestPublicationsForDocument(tx, grant.workspaceId, row.id),
        });
      }

      return { scope: input.scope, pageContext, documents: summaries };
    });
  }

  async createAuthoringDocumentSessionFromActivation(
    input: CreateAuthoringDocumentSessionFromActivationInput,
  ): Promise<ActivatedAuthoringDocumentSessionRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isAuthoringDocumentQueryScope(input.selectionScope) ||
      !input.documentIntent ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      (input.documentIntent.kind === 'new-draft' && input.selectionScope !== 'page') ||
      !isSha256Hash(input.activationGrantHash) ||
      !isSha256Hash(input.sessionTokenHash) ||
      !input.correlationId.trim() ||
      !isTrustedEditorIframeSrc(input.iframeSrc) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS)
    ) {
      return null;
    }

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(sql`select
          set_config('lodariq.public_installation_id', ${input.installationId}, true),
          set_config('lodariq.public_origin', ${exactOrigin}, true),
          set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.activationGrantHash}, true)`);
        const now = new Date();
        const [candidate] = await tx
          .select({ grant: authoringActivationGrants, environment: environments.kind })
          .from(authoringActivationGrants)
          .innerJoin(
            environments,
            and(
              eq(authoringActivationGrants.workspaceId, environments.workspaceId),
              eq(authoringActivationGrants.environmentId, environments.id),
            ),
          )
          .where(
            and(
              eq(authoringActivationGrants.installationId, input.installationId),
              eq(authoringActivationGrants.exactOrigin, exactOrigin),
              eq(authoringActivationGrants.grantHash, input.activationGrantHash),
              isNull(authoringActivationGrants.usedAt),
              isNull(authoringActivationGrants.revokedAt),
              sql`${authoringActivationGrants.expiresAt} > ${now}`,
            ),
          )
          .limit(1);
        if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) {
          return null;
        }
        const grant = toAuthoringActivationGrantRecord(candidate.grant, candidate.environment);
        if (
          !canActivateDocumentIntent(grant, input.documentIntent) ||
          (input.selectionScope === 'workspace' &&
            !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS))
        ) {
          return null;
        }

        await this.setWorkspaceScope(tx, candidate.grant.workspaceId);
        if (
          !(await this.hasActiveAuthoringScope(
            tx,
            candidate.grant.workspaceId,
            candidate.grant.environmentId,
            candidate.grant.installationId,
            candidate.grant.exactOrigin,
          )) ||
          !(await this.hasAuthoringMembership(
            tx,
            candidate.grant.workspaceId,
            candidate.grant.creatorId,
          ))
        ) {
          return null;
        }

        const [consumedGrant] = await tx
          .update(authoringActivationGrants)
          .set({ usedAt: now })
          .where(
            and(
              eq(authoringActivationGrants.id, candidate.grant.id),
              eq(authoringActivationGrants.installationId, input.installationId),
              eq(authoringActivationGrants.exactOrigin, exactOrigin),
              eq(authoringActivationGrants.grantHash, input.activationGrantHash),
              isNull(authoringActivationGrants.usedAt),
              isNull(authoringActivationGrants.revokedAt),
              sql`${authoringActivationGrants.expiresAt} > ${now}`,
            ),
          )
          .returning();
        if (!consumedGrant) return null;

        let documentId: string;
        let sessionDocument: LodariqDocument;
        let documentCreated = false;
        if (input.documentIntent.kind === 'existing') {
          const [document] = await tx
            .select({ id: documents.id, canonical: documents.canonical })
            .from(documents)
            .where(
              and(
                eq(documents.workspaceId, consumedGrant.workspaceId),
                eq(documents.id, input.documentIntent.documentId),
                eq(documents.type, 'tour'),
              ),
            )
            .limit(1);
          if (
            !document ||
            document.canonical.type !== 'tour' ||
            (input.selectionScope === 'page' &&
              !matchesAuthoringPageContext(document.canonical, exactOrigin, { pathname }))
          ) {
            throw new AuthoringAtomicWriteRejected();
          }
          documentId = document.id;
          sessionDocument = document.canonical;
        } else {
          const [defaultTheme] = await tx
            .select({ id: themes.id, activeVersionId: themes.activeVersionId })
            .from(themes)
            .where(
              and(
                eq(themes.workspaceId, consumedGrant.workspaceId),
                eq(themes.isDefault, true),
                sql`${themes.activeVersionId} is not null`,
              ),
            )
            .limit(1);
          const draft = createServerOwnedTourDraft(
            consumedGrant.workspaceId,
            candidate.environment,
            exactOrigin,
            { pathname },
            defaultTheme ?? null,
          );
          const [document] = await tx
            .insert(documents)
            .values({
              id: draft.id,
              workspaceId: draft.workspaceId,
              type: draft.type,
              status: draft.status,
              title: draft.title,
              schemaVersion: draft.schemaVersion,
              canonical: draft,
              createdByUserId: consumedGrant.creatorId,
              updatedByUserId: consumedGrant.creatorId,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: documents.id });
          if (!document) throw new AuthoringAtomicWriteRejected();
          const [version] = await tx
            .insert(documentVersions)
            .values({
              id: `${draft.id}_v_1`,
              workspaceId: draft.workspaceId,
              documentId: draft.id,
              version: 1,
              canonical: draft,
              createdByUserId: consumedGrant.creatorId,
              createdAt: now,
            })
            .returning({ id: documentVersions.id });
          if (!version) throw new AuthoringAtomicWriteRejected();
          documentId = document.id;
          sessionDocument = draft;
          documentCreated = true;
        }

        const themeReference = authoringSessionThemeReference(sessionDocument);
        if (!themeReference) throw new AuthoringAtomicWriteRejected();
        if (themeReference.source === 'workspace') {
          const [resolvedThemeVersion] = await tx
            .select({
              id: themeVersions.id,
              contractVersion: themeVersions.contractVersion,
            })
            .from(themeVersions)
            .where(
              and(
                eq(themeVersions.workspaceId, consumedGrant.workspaceId),
                eq(themeVersions.themeId, themeReference.themeId),
                eq(themeVersions.id, themeReference.themeVersionId),
              ),
            )
            .limit(1);
          if (
            !resolvedThemeVersion ||
            resolvedThemeVersion.contractVersion !== BRAND_THEME_CONTRACT_VERSION
          ) {
            throw new AuthoringAtomicWriteRejected();
          }
        }
        const compatibility = createAuthoringSessionCompatibilityPins(
          themeReference.themeVersionId,
        );
        const capabilities = getAuthoringDocumentSessionCapabilities(candidate.environment);
        const [session] = await tx
          .insert(authoringSessions)
          .values({
            id: `authsess_${randomUUID()}`,
            correlationId: input.correlationId,
            workspaceId: consumedGrant.workspaceId,
            environmentId: consumedGrant.environmentId,
            documentId,
            installationId: consumedGrant.installationId,
            activationGrantId: consumedGrant.id,
            customerOrigin: consumedGrant.exactOrigin,
            capabilities,
            ...compatibility,
            tokenHash: input.sessionTokenHash,
            iframeSrc: input.iframeSrc,
            createdByUserId: consumedGrant.creatorId,
            expiresAt: new Date(input.expiresAt),
            revokedAt: null,
            createdAt: now,
          })
          .returning();
        if (!session) throw new AuthoringAtomicWriteRejected();

        return {
          activationGrant: toAuthoringActivationGrantRecord(consumedGrant, candidate.environment),
          session: toAuthoringDocumentSessionRecord(session, candidate.environment),
          documentCreated,
        };
      });
    } catch (error) {
      if (error instanceof AuthoringAtomicWriteRejected || isUniqueConstraintViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(eq(environmentTokens.workspaceId, workspaceId))
        .orderBy(desc(environmentTokens.createdAt));

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
      }));
    });
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    return runWithEnvironmentTokenLookupScope(this.database, tokenHash, async (tx) => {
      const [row] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenHash: environmentTokens.tokenHash,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
          originAllowlist: environments.originAllowlist,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(and(eq(environmentTokens.tokenHash, tokenHash), isNull(environmentTokens.revokedAt)))
        .limit(1);

      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenHash: row.tokenHash,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
        originAllowlist: row.originAllowlist,
      };
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error('environment not found in workspace');
      }

      const [token] = await tx
        .insert(environmentTokens)
        .values({
          id: `envtok_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          name: input.name,
          tokenHash: input.tokenHash,
          tokenPrefix: input.tokenPrefix,
          createdByUserId: input.actorUserId,
        })
        .returning();

      if (!token) throw new Error('failed to create environment token');

      return {
        id: token.id,
        workspaceId: token.workspaceId,
        environmentId: token.environmentId,
        environment: environment.kind,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        createdAt: toIsoString(token.createdAt),
        revokedAt: token.revokedAt ? toIsoString(token.revokedAt) : null,
      };
    });
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [current] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(
          and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
        )
        .limit(1);

      if (!current) return null;

      let revokedAt = current.revokedAt;
      if (!revokedAt) {
        const [updated] = await tx
          .update(environmentTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
          )
          .returning({ revokedAt: environmentTokens.revokedAt });
        revokedAt = updated?.revokedAt ?? new Date();
      }

      return {
        id: current.id,
        workspaceId: current.workspaceId,
        environmentId: current.environmentId,
        environment: current.environment,
        name: current.name,
        tokenPrefix: current.tokenPrefix,
        createdAt: toIsoString(current.createdAt),
        revokedAt: toIsoString(revokedAt),
      };
    });
  }

  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error('environment not found in workspace');
      }

      const [document] = await tx
        .select({ id: documents.id, canonical: documents.canonical })
        .from(documents)
        .where(
          and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)),
        )
        .limit(1);

      if (!document) {
        throw new Error('document not found in workspace');
      }

      const themeReference = authoringSessionThemeReference(document.canonical);
      if (!themeReference) {
        throw new Error('document theme is unavailable for an authoring session');
      }
      if (themeReference.source === 'workspace') {
        const [resolvedThemeVersion] = await tx
          .select({
            id: themeVersions.id,
            contractVersion: themeVersions.contractVersion,
          })
          .from(themeVersions)
          .where(
            and(
              eq(themeVersions.workspaceId, input.workspaceId),
              eq(themeVersions.themeId, themeReference.themeId),
              eq(themeVersions.id, themeReference.themeVersionId),
            ),
          )
          .limit(1);
        if (
          !resolvedThemeVersion ||
          resolvedThemeVersion.contractVersion !== BRAND_THEME_CONTRACT_VERSION
        ) {
          throw new Error('document theme is unavailable for an authoring session');
        }
      }
      const compatibility = createAuthoringSessionCompatibilityPins(themeReference.themeVersionId);

      const [session] = await tx
        .insert(authoringSessions)
        .values({
          id: `authsess_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          tokenHash: input.tokenHash,
          iframeSrc: input.iframeSrc,
          createdByUserId: input.actorUserId,
          expiresAt: new Date(input.expiresAt),
          ...compatibility,
        })
        .returning();

      if (!session) throw new Error('failed to create authoring session');
      return toAuthoringSessionRecord(session, environment.kind);
    });
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          id: authoringSessions.id,
          workspaceId: authoringSessions.workspaceId,
          environmentId: authoringSessions.environmentId,
          environment: environments.kind,
          documentId: authoringSessions.documentId,
          installationId: authoringSessions.installationId,
          activationGrantId: authoringSessions.activationGrantId,
          customerOrigin: authoringSessions.customerOrigin,
          capabilities: authoringSessions.capabilities,
          compilerVersion: authoringSessions.compilerVersion,
          rendererContractVersion: authoringSessions.rendererContractVersion,
          themeContractVersion: authoringSessions.themeContractVersion,
          themeVersionId: authoringSessions.themeVersionId,
          correlationId: authoringSessions.correlationId,
          tokenHash: authoringSessions.tokenHash,
          iframeSrc: authoringSessions.iframeSrc,
          createdByUserId: authoringSessions.createdByUserId,
          createdAt: authoringSessions.createdAt,
          expiresAt: authoringSessions.expiresAt,
          revokedAt: authoringSessions.revokedAt,
        })
        .from(authoringSessions)
        .innerJoin(environments, eq(authoringSessions.environmentId, environments.id))
        .where(
          and(
            eq(authoringSessions.workspaceId, workspaceId),
            eq(authoringSessions.tokenHash, tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);

      return row ? toAuthoringSessionRecord(row, row.environment) : null;
    });
  }

  async resolveAuthoringSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    if (!isSha256Hash(tokenHash)) return null;
    return runWithAuthoringSessionLookupScope(this.database, tokenHash, async (tx) => {
      const [session] = await tx
        .select()
        .from(authoringSessions)
        .where(
          and(
            eq(authoringSessions.tokenHash, tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);
      if (!session) return null;

      await this.setWorkspaceScope(tx, session.workspaceId);
      const [environment] = await tx
        .select({ kind: environments.kind })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, session.workspaceId),
            eq(environments.id, session.environmentId),
          ),
        )
        .limit(1);
      if (!environment) return null;
      if (
        session.installationId &&
        session.customerOrigin &&
        (!(await this.hasActiveAuthoringScope(
          tx,
          session.workspaceId,
          session.environmentId,
          session.installationId,
          session.customerOrigin,
        )) ||
          !(await this.hasAuthoringMembership(tx, session.workspaceId, session.createdByUserId)))
      ) {
        return null;
      }
      return toAuthoringSessionRecord(session, environment.kind);
    });
  }

  async revokeAuthoringSession(
    input: RevokeAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord | null> {
    if (!input.sessionId.trim() || !isSha256Hash(input.tokenHash)) return null;
    return runWithAuthoringSessionLookupScope(this.database, input.tokenHash, async (tx) => {
      const [session] = await tx
        .select()
        .from(authoringSessions)
        .where(
          and(
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.tokenHash, input.tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);
      if (!session) return null;

      await this.setWorkspaceScope(tx, session.workspaceId);
      const [environment] = await tx
        .select({ kind: environments.kind })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, session.workspaceId),
            eq(environments.id, session.environmentId),
          ),
        )
        .limit(1);
      if (!environment) return null;
      if (
        session.installationId &&
        session.customerOrigin &&
        (!(await this.hasActiveAuthoringScope(
          tx,
          session.workspaceId,
          session.environmentId,
          session.installationId,
          session.customerOrigin,
        )) ||
          !(await this.hasAuthoringMembership(tx, session.workspaceId, session.createdByUserId)))
      ) {
        return null;
      }

      const [revoked] = await tx
        .update(authoringSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(authoringSessions.workspaceId, session.workspaceId),
            eq(authoringSessions.id, input.sessionId),
            eq(authoringSessions.tokenHash, input.tokenHash),
            isNull(authoringSessions.revokedAt),
          ),
        )
        .returning();
      return revoked ? toAuthoringSessionRecord(revoked, environment.kind) : null;
    });
  }

  async createVisualCheckRun(input: CreateVisualCheckRunInput): Promise<VisualCheckRunRecord> {
    assertVisualCheckReport(input.report);
    if (!/^sha256-[0-9a-f]{64}$/u.test(input.contentHash)) {
      throw new Error('visual check contentHash must be a SHA-256 content hash');
    }
    return this.scoped(input.workspaceId, async (tx) => {
      const [documentVersion] = await tx
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, input.workspaceId),
            eq(documentVersions.documentId, input.documentId),
            eq(documentVersions.id, input.documentVersionId),
          ),
        )
        .limit(1);
      if (!documentVersion) {
        throw new Error('visual check document version not found in workspace');
      }
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.documentId, input.documentId),
            eq(compiledArtifacts.id, input.compiledArtifactId),
            eq(compiledArtifacts.documentVersionId, input.documentVersionId),
            eq(compiledArtifacts.contentHash, input.contentHash),
          ),
        )
        .limit(1);
      if (!artifact) throw new Error('visual check compiled artifact identity mismatch');
      if (artifact.themeVersionId !== input.themeVersionId) {
        throw new Error('visual check theme version does not match compiled artifact');
      }
      const [environment] = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);
      if (!environment) throw new Error('visual check environment not found in workspace');

      const [created] = await tx
        .insert(visualCheckRuns)
        .values({
          id: `vcheck_${randomUUID()}`,
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          documentVersionId: input.documentVersionId,
          compiledArtifactId: input.compiledArtifactId,
          themeVersionId: input.themeVersionId,
          environmentId: input.environmentId,
          contentHash: input.contentHash,
          report: input.report,
          status: input.report.status,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        })
        .returning();
      if (!created) throw new Error('failed to persist visual check run');
      return toVisualCheckRunRecord(created);
    });
  }

  async listVisualCheckRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<VisualCheckRunRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(visualCheckRuns)
        .where(
          and(
            eq(visualCheckRuns.workspaceId, workspaceId),
            eq(visualCheckRuns.documentId, documentId),
          ),
        )
        .orderBy(desc(visualCheckRuns.createdAt), desc(visualCheckRuns.id));
      return rows.map(toVisualCheckRunRecord);
    });
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    return this.scoped(input.workspaceId, async (tx) => {
      if (!input.events.length) return 0;

      await tx.insert(events).values(
        input.events.map((event) => ({
          id: `evt_${randomUUID()}`,
          workspaceId: input.workspaceId,
          documentId: event.documentId ?? null,
          name: event.name,
          payload: event,
        })),
      );

      return input.events.length;
    });
  }

  private async findWorkspaceTheme(
    tx: LodariqTransaction,
    workspaceId: string,
    themeId: string,
  ): Promise<typeof themes.$inferSelect | null> {
    const [theme] = await tx
      .select()
      .from(themes)
      .where(and(eq(themes.workspaceId, workspaceId), eq(themes.id, themeId)))
      .limit(1);
    return theme ?? null;
  }

  private async hydrateWorkspaceTheme(
    tx: LodariqTransaction,
    theme: typeof themes.$inferSelect,
  ): Promise<WorkspaceThemeRecord> {
    if (!theme.activeVersionId) return toWorkspaceThemeRecord(theme, null);
    const [activeVersion] = await tx
      .select()
      .from(themeVersions)
      .where(
        and(
          eq(themeVersions.workspaceId, theme.workspaceId),
          eq(themeVersions.themeId, theme.id),
          eq(themeVersions.id, theme.activeVersionId),
        ),
      )
      .limit(1);
    if (!activeVersion) {
      throw new Error('workspace theme active version not found in workspace');
    }
    return toWorkspaceThemeRecord(theme, toWorkspaceThemeVersionRecord(activeVersion));
  }

  private scoped<TResult>(
    workspaceId: string,
    operation: (transaction: LodariqTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return runWithWorkspaceScope(this.database, workspaceId, operation);
  }

  private async setWorkspaceScope(tx: LodariqTransaction, workspaceId: string): Promise<void> {
    await tx.execute(sql`select set_config('lodariq.workspace_id', ${workspaceId}, true)`);
  }

  private async findAuthoringEnvironment(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
  ): Promise<'development' | 'staging' | null> {
    const [environment] = await tx
      .select({ kind: environments.kind })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId),
          sql`${environments.kind} <> 'production'`,
        ),
      )
      .limit(1);
    return environment && isAuthoringEnvironmentKind(environment.kind) ? environment.kind : null;
  }

  private async isResolvedAuthoringDocumentIntent(
    tx: LodariqTransaction,
    workspaceId: string,
    documentIntent: CreateAuthoringAuthorizationRequestInput['documentIntent'],
  ): Promise<boolean> {
    if (!documentIntent || documentIntent.kind === 'new-draft') return true;
    const [document] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.id, documentIntent.documentId),
          eq(documents.type, 'tour'),
        ),
      )
      .limit(1);
    return Boolean(document);
  }

  private async hasAuthoringMembership(
    tx: LodariqTransaction,
    workspaceId: string,
    creatorId: string,
  ): Promise<boolean> {
    const [membership] = await tx
      .select({ role: workspaceMemberships.role })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, creatorId),
        ),
      )
      .limit(1);
    return Boolean(membership && hasAuthoringWorkspaceRole(membership.role));
  }

  private async hasActiveAuthoringScope(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
    installationId: string,
    exactOrigin: string,
  ): Promise<boolean> {
    const [scope] = await tx
      .select({ installationId: publicSdkInstallations.id })
      .from(publicSdkInstallationOrigins)
      .innerJoin(
        publicSdkInstallations,
        and(
          eq(publicSdkInstallationOrigins.workspaceId, publicSdkInstallations.workspaceId),
          eq(publicSdkInstallationOrigins.installationId, publicSdkInstallations.id),
        ),
      )
      .innerJoin(
        environments,
        and(
          eq(publicSdkInstallationOrigins.workspaceId, environments.workspaceId),
          eq(publicSdkInstallationOrigins.environmentId, environments.id),
        ),
      )
      .where(
        and(
          eq(publicSdkInstallationOrigins.workspaceId, workspaceId),
          eq(publicSdkInstallationOrigins.environmentId, environmentId),
          eq(publicSdkInstallationOrigins.installationId, installationId),
          eq(publicSdkInstallationOrigins.exactOrigin, exactOrigin),
          eq(publicSdkInstallationOrigins.authoringEnabled, true),
          isNull(publicSdkInstallations.revokedAt),
          sql`${environments.kind} <> 'production'`,
        ),
      )
      .limit(2);
    return Boolean(scope);
  }

  private activeAuthorizationRequestScopeCondition() {
    return sql`exists (
      select 1
      from public_sdk_installations installation
      inner join public_sdk_installation_origins origin_mapping
        on origin_mapping.workspace_id = installation.workspace_id
        and origin_mapping.installation_id = installation.id
      inner join environments environment
        on environment.workspace_id = origin_mapping.workspace_id
        and environment.id = origin_mapping.environment_id
      where installation.workspace_id = ${authoringAuthorizationRequests.workspaceId}
        and installation.id = ${authoringAuthorizationRequests.installationId}
        and installation.revoked_at is null
        and origin_mapping.environment_id = ${authoringAuthorizationRequests.environmentId}
        and origin_mapping.exact_origin = ${authoringAuthorizationRequests.exactOrigin}
        and origin_mapping.authoring_enabled = true
        and environment.kind <> 'production'
    )`;
  }

  private async mutateAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
    operation: 'consume' | 'revoke',
  ): Promise<AuthoringActivationGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isSha256Hash(input.grantHash)) return null;

    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select
        set_config('lodariq.public_installation_id', ${input.installationId}, true),
        set_config('lodariq.public_origin', ${exactOrigin}, true),
        set_config(${ACTIVATION_GRANT_HASH_SETTING}, ${input.grantHash}, true)`);
      const now = new Date();
      const [candidate] = await tx
        .select({ grant: authoringActivationGrants, environment: environments.kind })
        .from(authoringActivationGrants)
        .innerJoin(
          environments,
          and(
            eq(authoringActivationGrants.workspaceId, environments.workspaceId),
            eq(authoringActivationGrants.environmentId, environments.id),
          ),
        )
        .where(
          and(
            eq(authoringActivationGrants.installationId, input.installationId),
            eq(authoringActivationGrants.exactOrigin, exactOrigin),
            eq(authoringActivationGrants.grantHash, input.grantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .limit(1);
      if (!candidate || !isAuthoringEnvironmentKind(candidate.environment)) return null;

      await this.setWorkspaceScope(tx, candidate.grant.workspaceId);
      if (
        !(await this.hasActiveAuthoringScope(
          tx,
          candidate.grant.workspaceId,
          candidate.grant.environmentId,
          candidate.grant.installationId,
          candidate.grant.exactOrigin,
        )) ||
        !(await this.hasAuthoringMembership(
          tx,
          candidate.grant.workspaceId,
          candidate.grant.creatorId,
        ))
      ) {
        return null;
      }

      const mutation = operation === 'consume' ? { usedAt: now } : { revokedAt: now };
      const [mutated] = await tx
        .update(authoringActivationGrants)
        .set(mutation)
        .where(
          and(
            eq(authoringActivationGrants.id, candidate.grant.id),
            eq(authoringActivationGrants.installationId, input.installationId),
            eq(authoringActivationGrants.exactOrigin, exactOrigin),
            eq(authoringActivationGrants.grantHash, input.grantHash),
            isNull(authoringActivationGrants.usedAt),
            isNull(authoringActivationGrants.revokedAt),
            sql`${authoringActivationGrants.expiresAt} > ${now}`,
          ),
        )
        .returning();
      return mutated ? toAuthoringActivationGrantRecord(mutated, candidate.environment) : null;
    });
  }

  private async findPublicSdkInstallation(
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

  private async findDocumentDeployment(
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

  private async findReleaseOperation(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
  ): Promise<typeof releaseOperations.$inferSelect | null> {
    const [operation] = await tx
      .select()
      .from(releaseOperations)
      .where(
        and(
          eq(releaseOperations.workspaceId, input.workspaceId),
          eq(releaseOperations.environmentId, input.environmentId),
          eq(releaseOperations.documentId, input.artifact.documentId),
          eq(releaseOperations.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return operation ?? null;
  }

  private async findPromotionOperation(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
  ): Promise<typeof releaseOperations.$inferSelect | null> {
    const [operation] = await tx
      .select()
      .from(releaseOperations)
      .where(
        and(
          eq(releaseOperations.workspaceId, input.workspaceId),
          eq(releaseOperations.environmentId, input.targetEnvironmentId),
          eq(releaseOperations.documentId, input.documentId),
          eq(releaseOperations.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return operation ?? null;
  }

  private async findReleaseApprovals(
    tx: LodariqTransaction,
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<Array<typeof releaseApprovals.$inferSelect>> {
    return tx
      .select()
      .from(releaseApprovals)
      .where(
        and(
          eq(releaseApprovals.workspaceId, workspaceId),
          eq(releaseApprovals.releaseOperationId, releaseOperationId),
        ),
      )
      .orderBy(asc(releaseApprovals.createdAt), asc(releaseApprovals.id));
  }

  private async clearPendingReleaseOperation(
    tx: LodariqTransaction,
    releaseOperationId: string,
  ): Promise<void> {
    await tx
      .update(documentDeployments)
      .set({ pendingReleaseOperationId: null, updatedAt: new Date() })
      .where(eq(documentDeployments.pendingReleaseOperationId, releaseOperationId));
  }

  private async failPendingPromotionOperation(
    tx: LodariqTransaction,
    operation: typeof releaseOperations.$inferSelect,
    errorCode: string,
  ): Promise<void> {
    await tx
      .update(releaseOperations)
      .set({ status: 'failed', errorCode, completedAt: new Date() })
      .where(eq(releaseOperations.id, operation.id));
    await this.clearPendingReleaseOperation(tx, operation.id);
  }

  private async setPendingPromotionDeployment(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
    releaseOperationId: string,
    current: typeof documentDeployments.$inferSelect | null,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    if (current) {
      const [deployment] = await tx
        .update(documentDeployments)
        .set({ pendingReleaseOperationId: releaseOperationId, updatedAt })
        .where(
          and(
            eq(documentDeployments.workspaceId, input.workspaceId),
            eq(documentDeployments.environmentId, input.targetEnvironmentId),
            eq(documentDeployments.documentId, input.documentId),
            eq(documentDeployments.generation, input.expectedGeneration),
            or(
              isNull(documentDeployments.pendingReleaseOperationId),
              eq(documentDeployments.pendingReleaseOperationId, releaseOperationId),
            ),
          ),
        )
        .returning();
      return deployment ?? null;
    }
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        documentId: input.documentId,
        state: 'inactive',
        activePublicationId: null,
        pendingReleaseOperationId: releaseOperationId,
        generation: 0,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  private async createInitialPromotionDeployment(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
    publicationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        documentId: input.documentId,
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  private async resolveExistingReleaseOperation(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
    operation: typeof releaseOperations.$inferSelect,
  ): Promise<ReleaseOutcome> {
    const requestChanged =
      operation.requestHash !== input.requestHash ||
      operation.action !== (input.action ?? 'publish') ||
      operation.requestedArtifactId !== input.artifact.id ||
      operation.sourcePublicationId !== (input.sourcePublicationId ?? null) ||
      operation.expectedGeneration !== input.expectedGeneration;
    if (requestChanged) return { kind: 'idempotency_conflict' };
    if (operation.status === 'activating' || operation.status === 'awaiting_approval') {
      return { kind: 'in_progress' };
    }
    if (operation.status === 'failed') {
      if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
        return {
          kind: 'deployment_changed',
          expectedGeneration: operation.expectedGeneration,
          actualGeneration: operation.resultGeneration ?? 0,
        };
      }
      return { kind: 'failed', errorCode: operation.errorCode ?? 'release_operation_failed' };
    }
    if (!operation.resultPublicationId || operation.resultGeneration === null) {
      return { kind: 'failed', errorCode: 'release_operation_result_missing' };
    }
    const publication = await this.loadPublication(
      tx,
      operation.workspaceId,
      operation.resultPublicationId,
    );
    if (!publication) {
      return { kind: 'failed', errorCode: 'release_operation_publication_missing' };
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration,
      updatedAt: toIsoString(operation.completedAt ?? operation.createdAt),
    };
    return {
      kind: 'success',
      result: {
        operation: toPersistedReleaseOperation(operation),
        publication,
        deployment,
        replayed: true,
      },
    };
  }

  private async advanceExistingDeployment(
    tx: LodariqTransaction,
    current: typeof documentDeployments.$inferSelect,
    publicationId: string,
    _releaseOperationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .update(documentDeployments)
      .set({
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: current.generation + 1,
        updatedAt,
      })
      .where(
        and(
          eq(documentDeployments.workspaceId, current.workspaceId),
          eq(documentDeployments.environmentId, current.environmentId),
          eq(documentDeployments.documentId, current.documentId),
          eq(documentDeployments.generation, current.generation),
        ),
      )
      .returning();
    return deployment ?? null;
  }

  private async createInitialDeployment(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
    documentId: string,
    publicationId: string,
    _releaseOperationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId,
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  private async getLatestLegacyPublication(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
  ): Promise<typeof publications.$inferSelect | null> {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.workspaceId, workspaceId),
          eq(publications.environmentId, environmentId),
        ),
      )
      .orderBy(desc(publications.publishedAt), desc(publications.id))
      .limit(1);
    return publication ?? null;
  }

  private async loadDeploymentPublication(
    tx: LodariqTransaction,
    deployment: typeof documentDeployments.$inferSelect,
  ): Promise<PersistedPublication> {
    if (deployment.state !== 'active' || !deployment.activePublicationId) {
      throw new Error('inactive document deployment has no current publication');
    }
    const publication = await this.loadPublication(
      tx,
      deployment.workspaceId,
      deployment.activePublicationId,
    );
    if (!publication) {
      throw new Error('active document deployment publication not found in workspace');
    }
    if (
      publication.environmentId !== deployment.environmentId ||
      publication.documentId !== deployment.documentId
    ) {
      throw new Error('active document deployment publication scope mismatch');
    }
    return publication;
  }

  private async loadPublication(
    tx: LodariqTransaction,
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(and(eq(publications.workspaceId, workspaceId), eq(publications.id, publicationId)))
      .limit(1);
    if (!publication) return null;

    const [environment] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, publication.environmentId),
        ),
      )
      .limit(1);
    if (!environment) {
      throw new Error('published environment not found in workspace');
    }

    const [artifact] = await tx
      .select()
      .from(compiledArtifacts)
      .where(
        and(
          eq(compiledArtifacts.workspaceId, workspaceId),
          eq(compiledArtifacts.id, publication.compiledArtifactId),
        ),
      )
      .limit(1);
    if (!artifact) {
      throw new Error('published compiled artifact not found in workspace');
    }
    return toPersistedPublication(publication, environment.kind, toPersistedArtifact(artifact));
  }

  private async getLatestArtifact(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const [artifact] = await tx
      .select()
      .from(compiledArtifacts)
      .where(
        and(
          eq(compiledArtifacts.workspaceId, workspaceId),
          eq(compiledArtifacts.documentId, documentId),
        ),
      )
      .orderBy(desc(compiledArtifacts.createdAt))
      .limit(1);

    return artifact ? toPersistedArtifact(artifact) : null;
  }

  private async requireDocument(
    tx: LodariqTransaction,
    input: SaveDocumentInput,
  ): Promise<typeof documents.$inferSelect> {
    const [document] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.document.id)))
      .limit(1);

    if (!document) {
      throw new Error('document upsert failed in workspace scope');
    }
    return document;
  }

  private async getLatestPublicationsForDocument(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentPublicationSummary[]> {
    const rows = await tx
      .select({
        environmentId: publications.environmentId,
        environment: environments.kind,
        contentHash: publications.contentHash,
        publishedAt: publications.publishedAt,
      })
      .from(publications)
      .innerJoin(
        environments,
        and(
          eq(publications.workspaceId, environments.workspaceId),
          eq(publications.environmentId, environments.id),
        ),
      )
      .where(
        and(eq(publications.workspaceId, workspaceId), eq(publications.documentId, documentId)),
      )
      .orderBy(desc(publications.publishedAt));

    const latestByEnvironment = new Map<string, DocumentPublicationSummary>();
    for (const row of rows) {
      if (latestByEnvironment.has(row.environmentId)) continue;
      latestByEnvironment.set(row.environmentId, {
        environmentId: row.environmentId,
        environment: row.environment,
        contentHash: row.contentHash,
        publishedAt: toIsoString(row.publishedAt),
      });
    }

    return [...latestByEnvironment.values()].sort((a, b) =>
      a.environment.localeCompare(b.environment),
    );
  }

  private async insertDocumentVersion(
    tx: LodariqTransaction,
    input: SaveDocumentInput,
    createdAt: Date,
  ): Promise<typeof documentVersions.$inferSelect> {
    const [latest] = await tx
      .select({
        version: sql<number>`coalesce(max(${documentVersions.version}), 0)::int`,
      })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, input.workspaceId),
          eq(documentVersions.documentId, input.document.id),
        ),
      );

    const version = Number(latest?.version ?? 0) + 1;
    const [documentVersion] = await tx
      .insert(documentVersions)
      .values({
        id: `${input.document.id}_v_${version}`,
        workspaceId: input.workspaceId,
        documentId: input.document.id,
        version,
        canonical: input.document,
        createdByUserId: input.actorUserId,
        createdAt,
      })
      .returning();

    if (!documentVersion) {
      throw new Error('failed to create document version');
    }
    return documentVersion;
  }

  private async persistCompiledArtifact(
    tx: LodariqTransaction,
    workspaceId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: Date,
  ): Promise<PersistedCompiledArtifact> {
    const metadata = compiledArtifactMetadata(compiled);
    const [artifact] = await tx
      .insert(compiledArtifacts)
      .values({
        id: createArtifactId(compiled.documentId, compiled.contentHash),
        workspaceId,
        documentId: compiled.documentId,
        documentVersionId,
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        themeVersionId: metadata.themeVersionId,
        themeContentHash: metadata.themeContentHash,
        rendererContractVersion: metadata.rendererContractVersion,
        compiled,
        createdAt,
      })
      .onConflictDoNothing({
        target: [
          compiledArtifacts.workspaceId,
          compiledArtifacts.documentId,
          compiledArtifacts.contentHash,
        ],
      })
      .returning();

    if (!artifact) {
      const [existingArtifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, workspaceId),
            eq(compiledArtifacts.documentId, compiled.documentId),
            eq(compiledArtifacts.contentHash, compiled.contentHash),
          ),
        )
        .limit(1);
      if (existingArtifact) return toPersistedArtifact(existingArtifact);
      throw new Error('failed to persist or resolve immutable compiled artifact');
    }

    return toPersistedArtifact(artifact);
  }
}

function passwordCredentialValues(credential: PasswordCredentialRecord) {
  return {
    userId: credential.userId,
    emailNormalized: credential.emailNormalized,
    emailLookupHash: credential.emailLookupHash,
    algorithm: credential.algorithm,
    passwordHash: credential.passwordHash,
    createdAt: new Date(credential.createdAt),
    updatedAt: new Date(credential.updatedAt),
  };
}

function compareAuthEmailCandidates(
  left: AuthEmailOutboxCandidate,
  right: AuthEmailOutboxCandidate,
): number {
  return (
    left.availableAt.getTime() - right.availableAt.getTime() ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.purpose.localeCompare(right.purpose) ||
    left.id.localeCompare(right.id)
  );
}

function authEmailOutboxKey(purpose: ClaimedAuthEmailOutboxRow['purpose'], id: string): string {
  return `${purpose}\0${id}`;
}

function isValidAuthEmailLeaseMutation(
  id: string,
  purpose: ClaimedAuthEmailOutboxRow['purpose'],
  leaseVersion: number,
  timestamp?: Date,
): boolean {
  return (
    /^outbox_[A-Za-z0-9_-]{20,200}$/u.test(id) &&
    (purpose === 'email_verification' || purpose === 'set_password') &&
    Number.isSafeInteger(leaseVersion) &&
    leaseVersion >= 1 &&
    leaseVersion < 2_147_483_647 &&
    (!timestamp || Number.isFinite(timestamp.getTime()))
  );
}

function authSessionValues(session: AuthSessionRecord) {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    activeWorkspaceId: session.activeWorkspaceId,
    createdAt: new Date(session.createdAt),
    lastSeenAt: new Date(session.lastSeenAt),
    idleExpiresAt: new Date(session.idleExpiresAt),
    absoluteExpiresAt: new Date(session.absoluteExpiresAt),
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  };
}

function environmentValues(environment: WorkspaceEnvironment) {
  return {
    id: environment.id,
    workspaceId: environment.workspaceId,
    kind: environment.kind,
    name: environment.name,
    originAllowlist: environment.originAllowlist,
    requiredApprovalCount: environment.requiredApprovalCount ?? 0,
    createdAt: new Date(environment.createdAt),
    updatedAt: new Date(environment.updatedAt),
  };
}

function toPasswordCredentialRecord(
  credential: typeof passwordCredentials.$inferSelect,
): PasswordCredentialRecord {
  return {
    userId: credential.userId,
    emailNormalized: credential.emailNormalized,
    emailLookupHash: credential.emailLookupHash,
    algorithm: 'argon2id-v1',
    passwordHash: credential.passwordHash,
    createdAt: toIsoString(credential.createdAt),
    updatedAt: toIsoString(credential.updatedAt),
  };
}

function toAuthSessionRecord(session: typeof authSessions.$inferSelect): AuthSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    activeWorkspaceId: session.activeWorkspaceId,
    createdAt: toIsoString(session.createdAt),
    lastSeenAt: toIsoString(session.lastSeenAt),
    idleExpiresAt: toIsoString(session.idleExpiresAt),
    absoluteExpiresAt: toIsoString(session.absoluteExpiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
  };
}

function toUserRecord(user: typeof users.$inferSelect): UserRecord {
  return {
    id: user.id,
    legacyIdentityId: user.legacyIdentityId,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt ? toIsoString(user.emailVerifiedAt) : null,
    createdAt: toIsoString(user.createdAt),
  };
}

async function hasIdentityMembership(
  tx: LodariqTransaction,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const [membership] = await tx
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

function identityWorkspaceRole(role: string): IdentityWorkspaceRecord['role'] | null {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  return null;
}

function toPublicSdkInstallationRecord(
  installation: typeof publicSdkInstallations.$inferSelect,
): PublicSdkInstallationRecord {
  return {
    installationId: installation.id,
    workspaceId: installation.workspaceId,
    name: installation.name,
    createdByUserId: installation.createdByUserId,
    createdAt: toIsoString(installation.createdAt),
    updatedAt: toIsoString(installation.updatedAt),
    revokedAt: installation.revokedAt ? toIsoString(installation.revokedAt) : null,
  };
}

function toPublicSdkInstallationOriginRecord(
  origin: typeof publicSdkInstallationOrigins.$inferSelect,
): PublicSdkInstallationOriginRecord {
  return {
    installationId: origin.installationId,
    workspaceId: origin.workspaceId,
    environmentId: origin.environmentId,
    exactOrigin: origin.exactOrigin,
    authoringEnabled: origin.authoringEnabled,
    createdAt: toIsoString(origin.createdAt),
    updatedAt: toIsoString(origin.updatedAt),
  };
}

function toPublicSdkBootstrapGrantRecord(
  grant: typeof publicSdkBootstrapGrants.$inferSelect,
): PublicSdkBootstrapGrantRecord {
  return {
    id: grant.id,
    installationId: grant.installationId,
    workspaceId: grant.workspaceId,
    environmentId: grant.environmentId,
    exactOrigin: grant.exactOrigin,
    grantHash: grant.grantHash,
    createdAt: toIsoString(grant.createdAt),
    expiresAt: toIsoString(grant.expiresAt),
    consumedAt: grant.consumedAt ? toIsoString(grant.consumedAt) : null,
    revokedAt: grant.revokedAt ? toIsoString(grant.revokedAt) : null,
  };
}

function toAuthoringAuthorizationRequestRecord(
  request: typeof authoringAuthorizationRequests.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringAuthorizationRequestRecord {
  return {
    requestId: request.id,
    bootstrapGrantId: request.bootstrapGrantId,
    installationId: request.installationId,
    workspaceId: request.workspaceId,
    environmentId: request.environmentId,
    environment,
    exactOrigin: request.exactOrigin,
    stateHash: request.stateHash,
    bootstrapGrantHash: request.bootstrapGrantHash,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: 'S256',
    requestedCapabilities: [...request.requestedCapabilities],
    ...(request.documentIntent ? { documentIntent: request.documentIntent } : {}),
    creatorId: request.creatorId,
    authorizationCodeHash: request.authorizationCodeHash,
    createdAt: toIsoString(request.createdAt),
    expiresAt: toIsoString(request.expiresAt),
    approvedAt: request.approvedAt ? toIsoString(request.approvedAt) : null,
    authorizationCodeExpiresAt: request.authorizationCodeExpiresAt
      ? toIsoString(request.authorizationCodeExpiresAt)
      : null,
    authorizationCodeUsedAt: request.authorizationCodeUsedAt
      ? toIsoString(request.authorizationCodeUsedAt)
      : null,
  };
}

function toAuthoringActivationGrantRecord(
  grant: typeof authoringActivationGrants.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringActivationGrantRecord {
  return {
    grantId: grant.id,
    requestId: grant.requestId,
    installationId: grant.installationId,
    workspaceId: grant.workspaceId,
    environmentId: grant.environmentId,
    environment,
    exactOrigin: grant.exactOrigin,
    creatorId: grant.creatorId,
    capabilities: [...grant.capabilities],
    ...(grant.documentIntent ? { documentIntent: grant.documentIntent } : {}),
    grantHash: grant.grantHash,
    createdAt: toIsoString(grant.createdAt),
    expiresAt: toIsoString(grant.expiresAt),
    usedAt: grant.usedAt ? toIsoString(grant.usedAt) : null,
    revokedAt: grant.revokedAt ? toIsoString(grant.revokedAt) : null,
  };
}

function toAuthoringDocumentSessionRecord(
  session: typeof authoringSessions.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringDocumentSessionRecord {
  if (
    !session.installationId ||
    !session.activationGrantId ||
    !session.customerOrigin ||
    !session.capabilities ||
    session.compilerVersion !== COMPILER_VERSION ||
    session.rendererContractVersion !== RENDERER_CONTRACT_VERSION ||
    session.themeContractVersion !== BRAND_THEME_CONTRACT_VERSION ||
    !session.themeVersionId
  ) {
    throw new Error('activated authoring session is missing its exact scope');
  }
  return {
    sessionId: session.id,
    correlationId: session.correlationId ?? `corr_${session.id}`,
    installationId: session.installationId,
    activationGrantId: session.activationGrantId,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment,
    documentId: session.documentId,
    customerOrigin: session.customerOrigin,
    creatorId: session.createdByUserId,
    capabilities: [...session.capabilities],
    compilerVersion: session.compilerVersion,
    rendererContractVersion: session.rendererContractVersion,
    themeContractVersion: session.themeContractVersion,
    themeVersionId: session.themeVersionId,
    tokenHash: session.tokenHash,
    iframeSrc: session.iframeSrc,
    createdAt: toIsoString(session.createdAt),
    expiresAt: toIsoString(session.expiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
  };
}

function isAuthoringEnvironmentKind(environment: string): environment is 'development' | 'staging' {
  return environment === 'development' || environment === 'staging';
}

function isUniqueConstraintViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') return false;
    if ('code' in current && current.code === '23505') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

function toWorkspaceEnvironment(
  environment: typeof environments.$inferSelect,
): WorkspaceEnvironment {
  return {
    id: environment.id,
    workspaceId: environment.workspaceId,
    kind: environment.kind,
    name: environment.name,
    originAllowlist: environment.originAllowlist,
    requiredApprovalCount: normalizeRequiredApprovalCount(environment.requiredApprovalCount),
    createdAt: toIsoString(environment.createdAt),
    updatedAt: toIsoString(environment.updatedAt),
  };
}

function normalizeRequiredApprovalCount(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

function toStyleSourceRecord(source: typeof styleSources.$inferSelect): StyleSourceRecord {
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    themeId: source.themeId,
    environmentId: source.environmentId,
    source: source.source,
    sourceHash: source.sourceHash,
    createdByUserId: source.createdByUserId,
    createdAt: toIsoString(source.createdAt),
  };
}

function toPublicationVerificationRecord(
  verification: typeof publicationVerifications.$inferSelect,
): PublicationVerificationRecord {
  return {
    id: verification.id,
    workspaceId: verification.workspaceId,
    environmentId: verification.environmentId,
    documentId: verification.documentId,
    publicationId: verification.publicationId,
    result: verification.result,
    report: verification.report,
    verifiedOrigin: verification.verifiedOrigin,
    verifiedByUserId: verification.verifiedByUserId,
    createdAt: toIsoString(verification.createdAt),
  };
}

function toReleaseApprovalRecord(
  approval: typeof releaseApprovals.$inferSelect,
): ReleaseApprovalRecord {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    releaseOperationId: approval.releaseOperationId,
    decision: approval.decision,
    reason: approval.reason,
    decidedByUserId: approval.decidedByUserId,
    createdAt: toIsoString(approval.createdAt),
  };
}

function toWorkspaceThemeRecord(
  theme: typeof themes.$inferSelect,
  activeVersion: WorkspaceThemeVersionRecord | null,
): WorkspaceThemeRecord {
  return {
    id: theme.id,
    workspaceId: theme.workspaceId,
    name: theme.name,
    draft: theme.draft,
    revision: theme.revision,
    isDefault: theme.isDefault,
    activeVersionId: theme.activeVersionId,
    activeVersion,
    createdByUserId: theme.createdByUserId,
    updatedByUserId: theme.updatedByUserId,
    createdAt: toIsoString(theme.createdAt),
    updatedAt: toIsoString(theme.updatedAt),
  };
}

function toWorkspaceThemeVersionRecord(
  version: typeof themeVersions.$inferSelect,
): WorkspaceThemeVersionRecord {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    themeId: version.themeId,
    version: version.version,
    schemaVersion: version.snapshot.schemaVersion,
    contractVersion: version.snapshot.contractVersion,
    snapshot: version.snapshot,
    contentHash: version.contentHash,
    approvedByUserId: version.approvedByUserId,
    approvedAt: toIsoString(version.approvedAt),
    createdAt: toIsoString(version.createdAt),
  };
}

function workspaceThemeVersionValues(version: WorkspaceThemeVersionRecord) {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    themeId: version.themeId,
    version: version.version,
    schemaVersion: version.schemaVersion,
    contractVersion: version.contractVersion,
    snapshot: version.snapshot,
    contentHash: version.contentHash,
    approvedByUserId: version.approvedByUserId,
    approvedAt: new Date(version.approvedAt),
    createdAt: new Date(version.createdAt),
  };
}

function toVisualCheckRunRecord(run: typeof visualCheckRuns.$inferSelect): VisualCheckRunRecord {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    documentId: run.documentId,
    documentVersionId: run.documentVersionId,
    compiledArtifactId: run.compiledArtifactId,
    themeVersionId: run.themeVersionId,
    environmentId: run.environmentId,
    contentHash: run.contentHash,
    report: run.report,
    status: run.status,
    createdByUserId: run.createdByUserId,
    createdAt: toIsoString(run.createdAt),
  };
}

function createArtifactId(documentId: string, contentHash: string): string {
  return `artifact_${documentId}_${contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function toPersistedArtifact(
  artifact: typeof compiledArtifacts.$inferSelect,
): PersistedCompiledArtifact {
  return {
    id: artifact.id,
    workspaceId: artifact.workspaceId,
    documentId: artifact.documentId,
    documentVersionId: artifact.documentVersionId,
    contentHash: artifact.contentHash,
    compilerVersion: artifact.compilerVersion,
    themeVersionId: artifact.themeVersionId,
    themeContentHash: artifact.themeContentHash,
    rendererContractVersion: artifact.rendererContractVersion,
    compiled: artifact.compiled,
    createdAt: toIsoString(artifact.createdAt),
  };
}

function assertArtifactMatchesDocument(input: SaveDocumentInput): void {
  if (input.artifact && input.artifact.documentId !== input.document.id) {
    throw new Error('compiled artifact document mismatch');
  }
}

function compiledArtifactMetadata(compiled: CompiledDocument): {
  themeVersionId: string | null;
  themeContentHash: string | null;
  rendererContractVersion: string | null;
} {
  if (compiled.artifactSchemaVersion !== '2') {
    return {
      themeVersionId: null,
      themeContentHash: null,
      rendererContractVersion: null,
    };
  }
  return {
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

function toPersistedPublication(
  publication: typeof publications.$inferSelect,
  environment: PersistedPublication['environment'],
  artifact: PersistedCompiledArtifact,
): PersistedPublication {
  return {
    id: publication.id,
    workspaceId: publication.workspaceId,
    correlationId: publication.correlationId ?? `corr_${publication.id}`,
    environmentId: publication.environmentId,
    environment,
    documentId: publication.documentId,
    documentVersionId: publication.documentVersionId,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    action: toPersistedPublicationAction(publication.action),
    sourcePublicationId: publication.sourcePublicationId,
    previousPublicationId: publication.previousPublicationId,
    releaseOperationId: publication.releaseOperationId,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: toIsoString(publication.publishedAt),
    artifact,
  };
}

function toPersistedPublicationAction(
  action: 'publish' | 'promote' | 'rollback' | 'unpublish' | null,
): PersistedPublication['action'] {
  if (action === 'unpublish') {
    throw new Error('unpublish release operations do not create publications');
  }
  return action;
}

function toPersistedDocumentDeployment(
  deployment: typeof documentDeployments.$inferSelect,
): PersistedDocumentDeployment {
  const shared = {
    workspaceId: deployment.workspaceId,
    environmentId: deployment.environmentId,
    documentId: deployment.documentId,
    generation: deployment.generation,
    updatedAt: toIsoString(deployment.updatedAt),
    pendingReleaseOperationId: deployment.pendingReleaseOperationId,
  };
  if (deployment.state === 'active') {
    if (!deployment.activePublicationId) {
      throw new Error('active document deployment has no publication');
    }
    return {
      ...shared,
      state: 'active',
      activePublicationId: deployment.activePublicationId,
    };
  }
  if (deployment.activePublicationId) {
    throw new Error('inactive document deployment has an active publication');
  }
  return {
    ...shared,
    state: 'inactive',
    activePublicationId: null,
  };
}

function toPersistedReleaseOperation(
  operation: typeof releaseOperations.$inferSelect,
): PersistedReleaseOperation {
  if (operation.action !== 'publish' && operation.action !== 'promote') {
    throw new Error(`unsupported release operation action: ${operation.action}`);
  }
  if (
    operation.status !== 'awaiting_approval' &&
    operation.status !== 'activating' &&
    operation.status !== 'completed' &&
    operation.status !== 'failed'
  ) {
    throw new Error(`unsupported release operation status: ${operation.status}`);
  }
  if (!operation.requestedArtifactId) {
    throw new Error('publish release operation has no requested artifact');
  }
  return {
    id: operation.id,
    workspaceId: operation.workspaceId,
    environmentId: operation.environmentId,
    documentId: operation.documentId,
    action: operation.action,
    requestedArtifactId: operation.requestedArtifactId,
    sourcePublicationId: operation.sourcePublicationId,
    expectedGeneration: operation.expectedGeneration,
    resultGeneration: operation.resultGeneration,
    idempotencyKey: operation.idempotencyKey,
    requestHash: operation.requestHash,
    status: operation.status,
    correlationId: operation.correlationId,
    requestedByUserId: operation.requestedByUserId,
    resultPublicationId: operation.resultPublicationId,
    errorCode: operation.errorCode,
    createdAt: toIsoString(operation.createdAt),
    completedAt: operation.completedAt ? toIsoString(operation.completedAt) : null,
  };
}

function toPersistedDocumentVersion(
  version: typeof documentVersions.$inferSelect,
): PersistedDocumentVersion {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    version: version.version,
    canonical: version.canonical,
    createdByUserId: version.createdByUserId,
    createdAt: toIsoString(version.createdAt),
  };
}

function toAuthoringSessionRecord(
  session:
    | typeof authoringSessions.$inferSelect
    | (Pick<
        typeof authoringSessions.$inferSelect,
        | 'id'
        | 'workspaceId'
        | 'environmentId'
        | 'documentId'
        | 'installationId'
        | 'activationGrantId'
        | 'customerOrigin'
        | 'capabilities'
        | 'compilerVersion'
        | 'rendererContractVersion'
        | 'themeContractVersion'
        | 'themeVersionId'
        | 'correlationId'
        | 'tokenHash'
        | 'iframeSrc'
        | 'createdByUserId'
        | 'createdAt'
        | 'expiresAt'
        | 'revokedAt'
      > & { environment: AuthoringSessionRecord['environment'] }),
  environment: AuthoringSessionRecord['environment'],
): AuthoringSessionRecord {
  const activatedScope =
    'installationId' in session && session.installationId
      ? {
          installationId: session.installationId,
          activationGrantId: session.activationGrantId,
          customerOrigin: session.customerOrigin,
          capabilities: session.capabilities ? [...session.capabilities] : null,
        }
      : {};
  const compatibilityPins =
    'compilerVersion' in session
      ? {
          compilerVersion: session.compilerVersion,
          rendererContractVersion: session.rendererContractVersion,
          themeContractVersion: session.themeContractVersion,
          themeVersionId: session.themeVersionId,
        }
      : {};
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment,
    documentId: session.documentId,
    correlationId: session.correlationId ?? `corr_${session.id}`,
    tokenHash: session.tokenHash,
    iframeSrc: session.iframeSrc,
    createdByUserId: session.createdByUserId,
    createdAt: toIsoString(session.createdAt),
    expiresAt: toIsoString(session.expiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
    ...activatedScope,
    ...compatibilityPins,
  };
}

function comparePublicSdkInstallationOriginRecords(
  left: PublicSdkInstallationOriginRecord,
  right: PublicSdkInstallationOriginRecord,
): number {
  const environmentOrder = left.environmentId.localeCompare(right.environmentId);
  return environmentOrder || left.exactOrigin.localeCompare(right.exactOrigin);
}

function hasAuthoringWorkspaceRole(role: string): boolean {
  return role === 'member' || role === 'admin' || role === 'owner';
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
