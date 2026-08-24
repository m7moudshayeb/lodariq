import { Type, type Static } from '@sinclair/typebox';
import { TourStepStyleSnapshot } from './authoring-style';
import { LodariqDocument } from './document';

const RESOURCE_ID = Type.String({
  minLength: 1,
  maxLength: 160,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
});
const RESOURCE_NAME = Type.String({ minLength: 1, maxLength: 80 });
const TIMESTAMP = Type.String({ format: 'date-time' });

export const AUTHORING_RESOURCE_LIMITS = {
  recipes: 100,
  checkpoints: 100,
  assets: 250,
  /** Admission ceiling; the workspace entitlement supplies the lower effective limit. */
  assetBytes: 104_857_600,
  /** JSON/base64 envelope ceiling for the admission limit. */
  uploadBodyBytes: 140_100_000,
} as const;

export const AuthoringStepStyleRecipeResource = Type.Object(
  {
    id: RESOURCE_ID,
    name: RESOURCE_NAME,
    revision: Type.Integer({ minimum: 1, maximum: 2_147_483_647 }),
    contentHash: Type.String({ pattern: '^[0-9a-f]{16}$' }),
    snapshot: Type.Ref(TourStepStyleSnapshot),
    thumbnail: Type.Object(
      {
        surfaceColor: Type.Optional(Type.String({ maxLength: 32 })),
        textColor: Type.Optional(Type.String({ maxLength: 32 })),
        actionColor: Type.Optional(Type.String({ maxLength: 32 })),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'AuthoringStepStyleRecipeResource', additionalProperties: false },
);
export type AuthoringStepStyleRecipeResource = Static<typeof AuthoringStepStyleRecipeResource>;

export const AuthoringDraftCheckpointResource = Type.Object(
  {
    id: RESOURCE_ID,
    name: RESOURCE_NAME,
    createdAt: TIMESTAMP,
    document: Type.Ref(LodariqDocument),
  },
  { $id: 'AuthoringDraftCheckpointResource', additionalProperties: false },
);
export type AuthoringDraftCheckpointResource = Static<typeof AuthoringDraftCheckpointResource>;

export const AUTHORING_MEDIA_ASSET_KINDS = ['image', 'video', 'captions', 'audio'] as const;
export const AuthoringMediaAssetKind = Type.Union(
  AUTHORING_MEDIA_ASSET_KINDS.map((kind) => Type.Literal(kind)),
  { $id: 'AuthoringMediaAssetKind' },
);
export type AuthoringMediaAssetKind = Static<typeof AuthoringMediaAssetKind>;

export const AuthoringMediaAssetResource = Type.Object(
  {
    id: RESOURCE_ID,
    kind: Type.Ref(AuthoringMediaAssetKind),
    filename: Type.String({ minLength: 1, maxLength: 180 }),
    contentType: Type.String({ minLength: 1, maxLength: 100 }),
    byteLength: Type.Integer({ minimum: 1, maximum: AUTHORING_RESOURCE_LIMITS.assetBytes }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
    savedToLibrary: Type.Optional(Type.Boolean({ default: false })),
    createdAt: TIMESTAMP,
    downloadPath: Type.String({ pattern: '^/v1/authoring/media-assets/[A-Za-z0-9._:-]+$' }),
  },
  { $id: 'AuthoringMediaAssetResource', additionalProperties: false },
);
export type AuthoringMediaAssetResource = Static<typeof AuthoringMediaAssetResource>;

export const AuthoringResourceLibrary = Type.Object(
  {
    recipes: Type.Array(Type.Ref(AuthoringStepStyleRecipeResource), {
      maxItems: AUTHORING_RESOURCE_LIMITS.recipes,
    }),
    checkpoints: Type.Array(Type.Ref(AuthoringDraftCheckpointResource), {
      maxItems: AUTHORING_RESOURCE_LIMITS.checkpoints,
    }),
    assets: Type.Array(Type.Ref(AuthoringMediaAssetResource), {
      maxItems: AUTHORING_RESOURCE_LIMITS.assets,
    }),
  },
  { $id: 'AuthoringResourceLibrary', additionalProperties: false },
);
export type AuthoringResourceLibrary = Static<typeof AuthoringResourceLibrary>;

export const SaveAuthoringResourceLibraryRequest = Type.Object(
  {
    recipes: Type.Array(Type.Ref(AuthoringStepStyleRecipeResource), {
      maxItems: AUTHORING_RESOURCE_LIMITS.recipes,
    }),
    checkpoints: Type.Array(Type.Ref(AuthoringDraftCheckpointResource), {
      maxItems: AUTHORING_RESOURCE_LIMITS.checkpoints,
    }),
  },
  { $id: 'SaveAuthoringResourceLibraryRequest', additionalProperties: false },
);
export type SaveAuthoringResourceLibraryRequest = Static<
  typeof SaveAuthoringResourceLibraryRequest
>;

export const UploadAuthoringMediaAssetRequest = Type.Object(
  {
    kind: Type.Ref(AuthoringMediaAssetKind),
    filename: Type.String({ minLength: 1, maxLength: 180 }),
    contentType: Type.String({ minLength: 1, maxLength: 100 }),
    contentBase64: Type.String({ minLength: 4, maxLength: 140_000_000 }),
    savedToLibrary: Type.Optional(Type.Boolean({ default: false })),
  },
  { $id: 'UploadAuthoringMediaAssetRequest', additionalProperties: false },
);
export type UploadAuthoringMediaAssetRequest = Static<typeof UploadAuthoringMediaAssetRequest>;
