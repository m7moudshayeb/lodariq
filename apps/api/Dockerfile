# syntax=docker/dockerfile:1

FROM node:24-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lodariq/api build
RUN pnpm --filter @lodariq/api deploy --prod /out

FROM node:24-slim AS runtime

ENV HOST="0.0.0.0"
ENV NODE_ENV="production"
ENV PORT="3001"

WORKDIR /app

COPY --from=build /out ./

EXPOSE 3001

CMD ["node", "dist/server.js"]
