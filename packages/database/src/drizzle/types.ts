import { type ReleaseRecoveryPublicationSnapshot } from '@lodariq/schema';
import {
  type ClaimedAuthEmailOutboxRow,
  type PromotionResult,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type ReleaseActivationResult,
} from '../repository';
import type { LodariqDatabase } from '../neon';

export type LodariqTransaction = Parameters<Parameters<LodariqDatabase['transaction']>[0]>[0];

export const AUTHORING_REQUEST_ID_SETTING = 'lodariq.authorization_request_id';

export const AUTHORING_STATE_HASH_SETTING = 'lodariq.authorization_state_hash';

export const AUTHORING_CODE_HASH_SETTING = 'lodariq.authorization_code_hash';

export const ACTIVATION_GRANT_HASH_SETTING = 'lodariq.activation_grant_hash';

export class AuthoringAtomicWriteRejected extends Error {}

export class SetPasswordAtomicWriteRejected extends Error {}

export class EmailVerificationAtomicWriteRejected extends Error {}

export interface AuthEmailOutboxCandidate {
  id: string;
  recipientEmail: string;
  purpose: ClaimedAuthEmailOutboxRow['purpose'];
  challengeId: string;
  keyId: string;
  availableAt: Date;
  createdAt: Date;
  attempts: number;
  leaseVersion: number;
}

export type ReleaseOutcome =
  | { kind: 'success'; result: ReleaseActivationResult }
  | { kind: 'idempotency_conflict' }
  | { kind: 'in_progress' }
  | { kind: 'deployment_changed'; expectedGeneration: number; actualGeneration: number }
  | { kind: 'failed'; errorCode: string };

export type PromotionOutcome =
  | { kind: 'success'; result: PromotionResult }
  | { kind: 'idempotency_conflict' }
  | { kind: 'in_progress' }
  | { kind: 'active_publication_changed'; actualPublicationId: string | null }
  | { kind: 'verification_required' }
  | { kind: 'approval_rejected'; operationId: string }
  | { kind: 'deployment_changed'; expectedGeneration: number; actualGeneration: number }
  | { kind: 'failed'; errorCode: string };

export interface DrizzleReleaseRecoveryPublicationMaterial {
  publication: PersistedPublication;
  operation: PersistedReleaseOperation;
  snapshot: ReleaseRecoveryPublicationSnapshot;
}
