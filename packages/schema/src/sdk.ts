import { Type, type Static } from '@sinclair/typebox';
import { Environment } from './common';
import { ManifestPointer } from './compiled';

/**
 * Public SDK bootstrap contract used by the dashboard snippet and browser
 * loader. The environment token is transported in the Authorization header,
 * not in this payload, so it does not leak through URLs.
 */
export const SdkBootstrapRequest = Type.Object(
  {
    environment: Environment,
    href: Type.Optional(Type.String()),
    origin: Type.Optional(Type.String()),
  },
  { $id: 'SdkBootstrapRequest', additionalProperties: false },
);
export type SdkBootstrapRequest = Static<typeof SdkBootstrapRequest>;

export const SdkInstallContext = Type.Object(
  {
    workspaceId: Type.String(),
    environment: Environment,
    correlationId: Type.Optional(Type.String()),
    manifest: ManifestPointer,
    currentDocumentUrl: Type.String(),
    ingestUrl: Type.String(),
    authoring: Type.Optional(
      Type.Object(
        {
          enabled: Type.Boolean(),
          iframeSrc: Type.Optional(Type.String()),
          sessionId: Type.Optional(Type.String()),
          correlationId: Type.Optional(Type.String()),
          expiresAt: Type.Optional(Type.String()),
          documentUrl: Type.Optional(Type.String()),
          saveDocumentUrl: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'SdkInstallContext', additionalProperties: false },
);
export type SdkInstallContext = Static<typeof SdkInstallContext>;
