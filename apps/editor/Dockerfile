FROM node:24-slim AS build
WORKDIR /repo

ENV LODARIQ_BUILD_DECLARATIONS="false"

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/editor ./apps/editor
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lodariq/editor... build:deploy

FROM node:24-slim AS runtime
WORKDIR /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3003

COPY --from=build /repo/apps/editor/dist ./dist
COPY --from=build /repo/apps/editor/scripts/serve-static.mjs ./scripts/serve-static.mjs

CMD ["node", "scripts/serve-static.mjs"]
