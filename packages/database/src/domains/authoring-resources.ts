import type {
  AuthoringDraftCheckpointResource,
  AuthoringMediaAssetKind,
  AuthoringMediaAssetResource,
  AuthoringStepStyleRecipeResource,
} from '@lodariq/schema';

export interface PersistedAuthoringMediaAsset extends AuthoringMediaAssetResource {
  workspaceId: string;
  contentBase64: string;
  publishedAt: string | null;
}

export interface SaveAuthoringResourcesInput {
  workspaceId: string;
  documentId: string;
  actorUserId: string;
  recipes: readonly AuthoringStepStyleRecipeResource[];
  checkpoints: readonly AuthoringDraftCheckpointResource[];
}

export interface CreateAuthoringMediaAssetInput {
  workspaceId: string;
  actorUserId: string;
  kind: AuthoringMediaAssetKind;
  filename: string;
  contentType: string;
  contentBase64: string;
  byteLength: number;
  contentHash: string;
  savedToLibrary: boolean;
}
