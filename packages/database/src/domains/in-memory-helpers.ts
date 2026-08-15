import { createHash } from 'node:crypto';
import { isAuthoringControlPlaneRole } from '@lodariq/schema';
import type {
  AcknowledgeAuthEmailRowInput,
  AuthOutboxRecord,
  IdentityWorkspaceRecord,
  SetPasswordOutboxRecord,
  WorkspaceInvitationOutboxRecord,
} from './identity';
import type { AccountEmailChangeOutboxRecord } from './account-management';
import type {
  PublicSdkInstallationOriginRecord,
  PublicSdkInstallationRecord,
} from './sdk-authoring';
import type {
  VisualCheckRunRecord,
  WorkspaceThemeImpactRecord,
  WorkspaceThemeRecord,
} from './themes';
import type {
  PersistedCompiledArtifact,
  PersistedDocumentDeployment,
  PersistedPublication,
} from './releases';

export function compareArtifactsNewestFirst(
  left: PersistedCompiledArtifact,
  right: PersistedCompiledArtifact,
): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function compareWorkspaceThemes(
  left: WorkspaceThemeRecord,
  right: WorkspaceThemeRecord,
): number {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}

export function compareWorkspaceThemeImpact(
  left: WorkspaceThemeImpactRecord,
  right: WorkspaceThemeImpactRecord,
): number {
  return left.title.localeCompare(right.title) || left.documentId.localeCompare(right.documentId);
}

export function compareVisualCheckRuns(
  left: VisualCheckRunRecord,
  right: VisualCheckRunRecord,
): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function compareAppendOnlyRecordsNewestFirst(
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string },
): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function comparePublicationsNewestFirst(
  left: PersistedPublication,
  right: PersistedPublication,
): number {
  return right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id);
}

export function compareDeployments(
  left: PersistedDocumentDeployment,
  right: PersistedDocumentDeployment,
): number {
  return (
    left.environmentId.localeCompare(right.environmentId) ||
    left.documentId.localeCompare(right.documentId)
  );
}

export function comparePublicSdkInstallations(
  left: PublicSdkInstallationRecord,
  right: PublicSdkInstallationRecord,
): number {
  const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
  return updatedOrder || left.installationId.localeCompare(right.installationId);
}

export function comparePublicSdkInstallationOrigins(
  left: PublicSdkInstallationOriginRecord,
  right: PublicSdkInstallationOriginRecord,
): number {
  const environmentOrder = left.environmentId.localeCompare(right.environmentId);
  return environmentOrder || left.exactOrigin.localeCompare(right.exactOrigin);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function normalizeIdentityEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashIdentityEmailLookup(emailNormalized: string): string {
  return createHash('sha256').update(emailNormalized, 'utf8').digest('hex');
}

export type InMemoryAuthEmailRow =
  | { purpose: 'email_verification'; record: AuthOutboxRecord }
  | { purpose: 'set_password'; record: SetPasswordOutboxRecord }
  | { purpose: 'workspace_invitation'; record: WorkspaceInvitationOutboxRecord }
  | { purpose: 'account_email_change_current'; record: AccountEmailChangeOutboxRecord }
  | { purpose: 'account_email_change_new'; record: AccountEmailChangeOutboxRecord };

export function compareInMemoryAuthEmailRows(
  left: InMemoryAuthEmailRow,
  right: InMemoryAuthEmailRow,
): number {
  return (
    Date.parse(left.record.availableAt) - Date.parse(right.record.availableAt) ||
    Date.parse(left.record.createdAt) - Date.parse(right.record.createdAt) ||
    left.purpose.localeCompare(right.purpose) ||
    left.record.id.localeCompare(right.record.id)
  );
}

export function isValidAuthEmailLeaseMutation(
  input: Pick<AcknowledgeAuthEmailRowInput, 'id' | 'purpose' | 'leaseVersion'>,
  timestampMs?: number,
): boolean {
  return (
    /^outbox_[A-Za-z0-9_-]{20,200}$/u.test(input.id) &&
    (input.purpose === 'email_verification' ||
      input.purpose === 'set_password' ||
      input.purpose === 'workspace_invitation' ||
      input.purpose === 'account_email_change_current' ||
      input.purpose === 'account_email_change_new') &&
    Number.isSafeInteger(input.leaseVersion) &&
    input.leaseVersion >= 1 &&
    input.leaseVersion < 2_147_483_647 &&
    (timestampMs === undefined || Number.isFinite(timestampMs))
  );
}

export function isCurrentAuthEmailLease(
  record:
    | AuthOutboxRecord
    | SetPasswordOutboxRecord
    | WorkspaceInvitationOutboxRecord
    | AccountEmailChangeOutboxRecord
    | undefined,
  leaseVersion: number,
  mutationAtMs?: number,
): record is
  | AuthOutboxRecord
  | SetPasswordOutboxRecord
  | WorkspaceInvitationOutboxRecord
  | AccountEmailChangeOutboxRecord {
  return Boolean(
    record &&
    record.processedAt === null &&
    (record.terminalAt ?? null) === null &&
    (record.leaseVersion ?? 0) === leaseVersion &&
    (mutationAtMs === undefined || Date.parse(record.availableAt) > mutationAtMs),
  );
}

export function hasAuthoringWorkspaceRole(role: string): boolean {
  return isAuthoringControlPlaneRole(role);
}

export function identityWorkspaceRole(role: string): IdentityWorkspaceRecord['role'] | null {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}
