import {
  DashboardThemeApprovalResponse,
  DashboardThemeMutationError,
  DashboardThemeMutationResponse,
  DashboardThemesResponse,
  DashboardWorkspaceThemeDetail,
  type BrandThemeDefinition,
  type ProductStyleProposal,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import {
  authenticate,
  requireEnvironmentReleaseCapability,
  requireRole,
} from './control-plane-access';
import {
  ApiErrorResponse,
  CreateDashboardStyleSourceBody,
  CreateWorkspaceThemeBody,
  ThemeParams,
  UpdateWorkspaceThemeBody,
  WorkspaceThemeMutationGuardBody,
} from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';
import {
  applyProductStyleProposal,
  sendWorkspaceThemeMutationError,
  withLatestStyleSource,
} from './control-plane-theme-service';

export function registerControlPlaneThemeRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/themes',
    { schema: { response: { 200: DashboardThemesResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const [themes, sources] = await Promise.all([
        options.repository.listWorkspaceThemes(auth.workspaceId),
        options.repository.listStyleSources(auth.workspaceId),
      ]);
      return {
        themes: themes.map((theme) =>
          withLatestStyleSource(
            theme,
            sources.find((source) => source.themeId === theme.id) ?? null,
          ),
        ),
      };
    },
  );

  fastify.post(
    '/v1/themes',
    {
      schema: {
        body: CreateWorkspaceThemeBody,
        response: { 201: DashboardThemeMutationResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const body = request.body as { name: string; draft: BrandThemeDefinition };
      const theme = await options.repository.createWorkspaceTheme({
        workspaceId: auth.workspaceId,
        name: body.name,
        draft: body.draft,
        actorUserId: auth.userId,
      });
      return reply.code(201).send({ theme });
    },
  );

  fastify.get(
    '/v1/themes/:themeId',
    {
      schema: {
        params: ThemeParams,
        response: { 200: DashboardWorkspaceThemeDetail, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { themeId } = request.params as { themeId: string };
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme)
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      const [versions, impact, sources] = await Promise.all([
        options.repository.listWorkspaceThemeVersions(auth.workspaceId, themeId),
        options.repository.listWorkspaceThemeImpact(auth.workspaceId, themeId),
        options.repository.listStyleSources(auth.workspaceId, themeId),
      ]);
      return {
        theme: withLatestStyleSource(theme, sources[0] ?? null),
        versions,
        impact,
      };
    },
  );

  fastify.get(
    '/v1/themes/:themeId/style-sources',
    { schema: { params: ThemeParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { themeId } = request.params as { themeId: string };
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme)
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      return { sources: await options.repository.listStyleSources(auth.workspaceId, themeId) };
    },
  );

  fastify.post(
    '/v1/themes/:themeId/style-sources',
    { schema: { params: ThemeParams, body: CreateDashboardStyleSourceBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as { environmentId: string; proposal: ProductStyleProposal };
      if (
        !(await requireEnvironmentReleaseCapability(
          options.repository,
          auth,
          body.environmentId,
          'sample-product-style',
          reply,
        ))
      )
        return;
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment)
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      if (environment.kind === 'production') {
        return reply.code(409).send({
          error: 'authoring_environment_required',
          message: 'Product styles can be sampled only from development or staging',
        });
      }
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme)
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      try {
        const applied = await applyProductStyleProposal({
          repository: options.repository,
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          theme,
          proposal: body.proposal,
          actorUserId: auth.userId,
        });
        return reply.code(201).send(applied);
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.patch(
    '/v1/themes/:themeId',
    {
      schema: {
        params: ThemeParams,
        body: UpdateWorkspaceThemeBody,
        response: {
          200: DashboardThemeMutationResponse,
          404: ApiErrorResponse,
          409: DashboardThemeMutationError,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as {
        name?: string;
        draft: BrandThemeDefinition;
        expectedRevision: number;
        expectedUpdatedAt: string;
      };
      try {
        const theme = await options.repository.updateWorkspaceThemeDraft({
          workspaceId: auth.workspaceId,
          themeId,
          draft: body.draft,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
          ...(body.name === undefined ? {} : { name: body.name }),
        });
        return theme
          ? { theme }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  registerThemePromotionRoutes(fastify, options);
}

function registerThemePromotionRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.post(
    '/v1/themes/:themeId/approve',
    {
      schema: {
        params: ThemeParams,
        body: WorkspaceThemeMutationGuardBody,
        response: {
          200: DashboardThemeApprovalResponse,
          404: ApiErrorResponse,
          409: DashboardThemeMutationError,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as { expectedRevision: number; expectedUpdatedAt: string };
      try {
        const approved = await options.repository.approveWorkspaceTheme({
          workspaceId: auth.workspaceId,
          themeId,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return approved
          ? { theme: approved.theme, approvedVersion: approved.approvedVersion }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.post(
    '/v1/themes/:themeId/default',
    {
      schema: {
        params: ThemeParams,
        body: WorkspaceThemeMutationGuardBody,
        response: {
          200: DashboardThemeMutationResponse,
          404: ApiErrorResponse,
          409: DashboardThemeMutationError,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as { expectedRevision: number; expectedUpdatedAt: string };
      try {
        const theme = await options.repository.setDefaultWorkspaceTheme({
          workspaceId: auth.workspaceId,
          themeId,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return theme
          ? { theme }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );
}
