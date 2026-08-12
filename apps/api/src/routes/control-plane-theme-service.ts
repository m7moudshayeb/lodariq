import {
  ProductStyleProposalConflictError,
  WorkspaceThemeApprovalRequiredError,
  WorkspaceThemeChangedError,
  type ControlPlaneRepository,
  type StyleSourceRecord,
  type WorkspaceThemeRecord,
} from '@lodariq/database';
import {
  AuthoringProductMatchApplyResult,
  validate,
  type ProductStyleProposal,
} from '@lodariq/schema';
import type { FastifyReply } from 'fastify';
import { mergeProductStyleTokensIntoDraft } from '../product-style-theme';

interface ApplyProductStyleProposalInput {
  repository: ControlPlaneRepository;
  workspaceId: string;
  environmentId: string;
  theme: WorkspaceThemeRecord;
  proposal: ProductStyleProposal;
  actorUserId: string;
}

export async function applyProductStyleProposal(input: ApplyProductStyleProposalInput) {
  const nextDraft = mergeProductStyleTokensIntoDraft(input.theme.draft, input.proposal);
  const applied = await input.repository.applyProductStyleProposal({
    workspaceId: input.workspaceId,
    themeId: input.theme.id,
    environmentId: input.environmentId,
    proposal: input.proposal,
    draft: nextDraft,
    expectedRevision: input.theme.revision,
    expectedUpdatedAt: input.theme.updatedAt,
    actorUserId: input.actorUserId,
  });
  if (!applied) throw new Error('workspace Brand theme disappeared during Product match');
  const source = applied.sources[0];
  if (!source) throw new Error('Product match did not persist a provenance source');
  const { receipt } = applied.application;
  const productMatchValidation = validate(AuthoringProductMatchApplyResult, {
    ...receipt,
    replayed: applied.replayed,
  });
  if (!productMatchValidation.valid) {
    throw new Error('persisted Product match result failed canonical schema validation');
  }
  return {
    source,
    sources: applied.sources,
    theme: withLatestStyleSource(applied.theme, source),
    previewTheme: receipt.previewTheme,
    draftChanged: receipt.draftChanged,
    replayed: applied.replayed,
    productMatch: productMatchValidation.value,
  };
}

export function withLatestStyleSource(
  theme: WorkspaceThemeRecord,
  record: StyleSourceRecord | null,
) {
  return {
    ...theme,
    latestStyleSource: record
      ? {
          ...record.source,
          recordId: record.id,
          sourceHash: record.sourceHash,
          environmentId: record.environmentId,
          recordedAt: record.createdAt,
        }
      : null,
  };
}

export function sendWorkspaceThemeMutationError(error: unknown, reply: FastifyReply) {
  if (error instanceof ProductStyleProposalConflictError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      proposalId: error.proposalId,
    });
  }
  if (error instanceof WorkspaceThemeApprovalRequiredError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      themeId: error.themeId,
    });
  }
  if (error instanceof WorkspaceThemeChangedError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      expectedRevision: error.expectedRevision,
      actualRevision: error.actualRevision,
      expectedUpdatedAt: error.expectedUpdatedAt,
      actualUpdatedAt: error.actualUpdatedAt,
    });
  }
  throw error;
}
