import { createHash } from 'node:crypto';
import {
  AUTHORING_RESOURCE_LIMITS,
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringResourceLibrary,
  AuthoringMediaAssetResource,
  SaveAuthoringResourceLibraryRequest,
  UploadAuthoringMediaAssetRequest,
  validate,
  type AuthoringMediaAssetKind,
} from '@lodariq/schema';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import { ApiErrorResponse } from '../control-plane-contracts';
import {
  authenticateHostedEditorSession,
  deploymentOriginsForApiBaseUrl,
  requireAuthoringSessionCapability,
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
} from './helpers';

const AssetParams = Type.Object(
  { assetId: Type.String({ minLength: 1, maxLength: 160 }) },
  { additionalProperties: false },
);

const ALLOWED_CONTENT_TYPES: Readonly<Record<AuthoringMediaAssetKind, ReadonlySet<string>>> = {
  image: new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']),
  video: new Set(['video/mp4', 'video/webm']),
  captions: new Set(['text/vtt']),
};

export function registerAuthoringResourceRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const editorOrigin = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl).editor;
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, editorOrigin);

  fastify.get(
    '/v1/sdk/media-assets/:assetId',
    { schema: { params: AssetParams, response: { 404: ApiErrorResponse } } },
    async (request, reply) => {
      const { assetId } = request.params as { assetId: string };
      const asset = await options.repository.getPublishedMediaAsset(assetId);
      if (!asset) {
        return reply.code(404).send({ error: 'not_found', message: 'Media asset not found' });
      }
      reply.header('content-type', asset.contentType);
      reply.header('content-length', String(asset.byteLength));
      reply.header('cache-control', 'public, max-age=31536000, immutable');
      reply.header('access-control-allow-origin', '*');
      reply.header('cross-origin-resource-policy', 'cross-origin');
      reply.header('x-content-type-options', 'nosniff');
      return reply.send(Buffer.from(asset.contentBase64, 'base64'));
    },
  );

  fastify.get(
    '/v1/authoring/resources',
    { schema: { response: { 200: AuthoringResourceLibrary, 403: ApiErrorResponse } } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
          reply,
        )
      ) {
        return;
      }
      const [recipes, checkpoints, assets] = await Promise.all([
        options.repository.listAuthoringStyleRecipes(session.workspaceId),
        options.repository.listAuthoringDraftCheckpoints(session.workspaceId, session.documentId),
        options.repository.listAuthoringMediaAssets(session.workspaceId),
      ]);
      return { recipes, checkpoints, assets };
    },
  );

  fastify.put(
    '/v1/authoring/resources',
    {
      schema: {
        body: SaveAuthoringResourceLibraryRequest,
        response: { 200: AuthoringResourceLibrary, 400: ApiErrorResponse, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          reply,
        )
      ) {
        return;
      }
      const parsed = validate(SaveAuthoringResourceLibraryRequest, request.body);
      if (!parsed.valid) {
        return reply
          .code(400)
          .send({ error: 'invalid_resources', message: 'Authoring resources are invalid' });
      }
      if (
        parsed.value.checkpoints.some(
          (checkpoint) =>
            checkpoint.document.workspaceId !== session.workspaceId ||
            checkpoint.document.id !== session.documentId,
        )
      ) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Checkpoint scope does not match the authoring session',
        });
      }
      await options.repository.saveAuthoringResources({
        workspaceId: session.workspaceId,
        documentId: session.documentId,
        actorUserId: session.createdByUserId,
        recipes: parsed.value.recipes,
        checkpoints: parsed.value.checkpoints,
      });
      return {
        recipes: await options.repository.listAuthoringStyleRecipes(session.workspaceId),
        checkpoints: await options.repository.listAuthoringDraftCheckpoints(
          session.workspaceId,
          session.documentId,
        ),
        assets: await options.repository.listAuthoringMediaAssets(session.workspaceId),
      };
    },
  );

  fastify.post(
    '/v1/authoring/media-assets',
    {
      bodyLimit: 7_100_000,
      schema: {
        body: UploadAuthoringMediaAssetRequest,
        response: {
          201: AuthoringMediaAssetResource,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          reply,
        )
      ) {
        return;
      }
      const parsed = validate(UploadAuthoringMediaAssetRequest, request.body);
      if (!parsed.valid) {
        return reply
          .code(400)
          .send({ error: 'invalid_asset', message: 'Media asset upload is invalid' });
      }
      if (!ALLOWED_CONTENT_TYPES[parsed.value.kind].has(parsed.value.contentType)) {
        return reply
          .code(400)
          .send({ error: 'invalid_asset_type', message: 'Media content type is not allowed' });
      }
      const content = decodeBase64(parsed.value.contentBase64);
      if (!content || content.byteLength > AUTHORING_RESOURCE_LIMITS.assetBytes) {
        return reply
          .code(400)
          .send({ error: 'invalid_asset_size', message: 'Media asset size is invalid' });
      }
      if (!contentMatchesDeclaredType(content, parsed.value.contentType)) {
        return reply.code(400).send({
          error: 'invalid_asset_content',
          message: 'Media content does not match its declared type',
        });
      }
      const filename = parsed.value.filename.trim();
      if (!filename) {
        return reply
          .code(400)
          .send({ error: 'invalid_asset_filename', message: 'Media filename is required' });
      }
      const contentHash = `sha256-${createHash('sha256').update(content).digest('hex')}`;
      const asset = await options.repository.createAuthoringMediaAsset({
        workspaceId: session.workspaceId,
        actorUserId: session.createdByUserId,
        kind: parsed.value.kind,
        filename,
        contentType: parsed.value.contentType,
        contentBase64: content.toString('base64'),
        byteLength: content.byteLength,
        contentHash,
        savedToLibrary: parsed.value.savedToLibrary ?? false,
      });
      return reply.code(201).send(asset);
    },
  );

  fastify.get(
    '/v1/authoring/media-assets/:assetId',
    { schema: { params: AssetParams, response: { 403: ApiErrorResponse, 404: ApiErrorResponse } } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
          reply,
        )
      ) {
        return;
      }
      const { assetId } = request.params as { assetId: string };
      const asset = await options.repository.getAuthoringMediaAsset(session.workspaceId, assetId);
      if (!asset)
        return reply.code(404).send({ error: 'not_found', message: 'Media asset not found' });
      reply.header('content-type', asset.contentType);
      reply.header('content-length', String(asset.byteLength));
      reply.header('cache-control', 'private, max-age=300');
      reply.header('x-content-type-options', 'nosniff');
      return reply.send(Buffer.from(asset.contentBase64, 'base64'));
    },
  );
}

function contentMatchesDeclaredType(content: Buffer, contentType: string): boolean {
  if (contentType === 'image/png') {
    return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === 'image/jpeg') {
    return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (contentType === 'image/gif') {
    const signature = content.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (contentType === 'image/webp') {
    return (
      content.subarray(0, 4).toString('ascii') === 'RIFF' &&
      content.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (contentType === 'video/mp4') {
    return content.subarray(4, 8).toString('ascii') === 'ftyp';
  }
  if (contentType === 'video/webm') {
    return content.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (contentType === 'text/vtt') {
    return content
      .subarray(0, 64)
      .toString('utf8')
      .replace(/^\uFEFF/u, '')
      .startsWith('WEBVTT');
  }
  return false;
}

function decodeBase64(value: string): Buffer | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return null;
  }
  const content = Buffer.from(value, 'base64');
  return content.byteLength > 0 && content.toString('base64') === value ? content : null;
}
