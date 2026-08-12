# syntax=docker/dockerfile:1

FROM node:24-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lodariq/dashboard build

FROM node:24-slim AS runtime

ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV="production"
ENV PORT="3000"

WORKDIR /app

COPY --from=build /workspace/apps/dashboard/.next/standalone ./
COPY --from=build /workspace/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /workspace/apps/dashboard/scripts/check-runtime-env.mjs ./apps/dashboard/check-runtime-env.mjs

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["sh", "-c", "node check-runtime-env.mjs && exec node server.js"]
