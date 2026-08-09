import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('Fly deployment packaging', () => {
  it('uses explicit monorepo Dockerfiles for the API and dashboard services', () => {
    expect(read('apps/api/fly.toml')).toContain('dockerfile = "apps/api/Dockerfile"');
    expect(read('apps/api/fly.staging.toml')).toContain('dockerfile = "apps/api/Dockerfile"');
    expect(read('apps/dashboard/fly.toml')).toContain('dockerfile = "apps/dashboard/Dockerfile"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain(
      'dockerfile = "apps/dashboard/Dockerfile"',
    );
    expect(read('apps/editor/fly.toml')).toContain('dockerfile = "apps/editor/Dockerfile"');
    expect(read('apps/editor/fly.staging.toml')).toContain('dockerfile = "apps/editor/Dockerfile"');
  });

  it('keeps staging and production Fly apps and public origins separate', () => {
    expect(read('apps/api/fly.toml')).toContain('app = "lodariq-api"');
    expect(read('apps/api/fly.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_PUBLIC_API_BASE_URL = "https://api.lodariq.com"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_LOADER_SRC = "https://cdn.lodariq.com/sdk/lodariq-loader.js"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_PUBLIC_LOADER_SRC = "https://cdn.lodariq.com/sdk/lodariq-public-bootstrap.js"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_CREATOR_LOADER_SRC = "https://cdn.lodariq.com/sdk/lodariq-creator.js"',
    );

    expect(read('apps/api/fly.staging.toml')).toContain('app = "lodariq-api-staging"');
    expect(read('apps/api/fly.staging.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_PUBLIC_API_BASE_URL = "https://staging-api.lodariq.com"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_LOADER_SRC = "https://staging-cdn.lodariq.com/sdk/lodariq-loader.js"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_PUBLIC_LOADER_SRC = "https://staging-cdn.lodariq.com/sdk/lodariq-public-bootstrap.js"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_CREATOR_LOADER_SRC = "https://staging-cdn.lodariq.com/sdk/lodariq-creator.js"',
    );

    expect(read('apps/dashboard/fly.toml')).toContain('app = "lodariq-dashboard"');
    expect(read('apps/dashboard/fly.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/dashboard/fly.toml')).toContain(
      'LODARIQ_API_BASE_URL = "https://api.lodariq.com"',
    );

    expect(read('apps/dashboard/fly.staging.toml')).toContain('app = "lodariq-dashboard-staging"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain(
      'LODARIQ_API_BASE_URL = "https://staging-api.lodariq.com"',
    );

    expect(read('apps/editor/fly.toml')).toContain('app = "lodariq-editor"');
    expect(read('apps/editor/fly.staging.toml')).toContain('app = "lodariq-editor-staging"');
  });

  it('does not configure Clerk or a signing secret for opaque owned sessions', () => {
    const ownedAuthFlyConfigs = [
      'apps/api/fly.toml',
      'apps/api/fly.staging.toml',
      'apps/dashboard/fly.toml',
      'apps/dashboard/fly.staging.toml',
    ];

    for (const path of ownedAuthFlyConfigs) {
      const config = read(path);
      expect(config).toContain('LODARIQ_AUTH_MODE = "lodariq"');
      expect(config).not.toMatch(/CLERK_|AUTH_SECRET|SESSION_SECRET/u);
    }
  });

  it('keeps public auth capabilities fail-closed at both API and dashboard boundaries', () => {
    const ownedAuthFlyConfigs = [
      'apps/api/fly.toml',
      'apps/api/fly.staging.toml',
      'apps/dashboard/fly.toml',
      'apps/dashboard/fly.staging.toml',
    ];

    for (const path of ownedAuthFlyConfigs) {
      const config = read(path);
      expect(config).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "disabled"');
      expect(config).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "disabled"');
    }
  });

  it('packages the API with pnpm deploy after building the Fastify app', () => {
    const dockerfile = read('apps/api/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).toContain('pnpm --filter @lodariq/api build');
    expect(dockerfile).toContain('pnpm --filter @lodariq/api deploy --prod /out');
    expect(dockerfile).toContain('CMD ["node", "dist/server.js"]');
  });

  it('packages the Next standalone dashboard server without Vercel assumptions', () => {
    const dockerfile = read('apps/dashboard/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).toContain('pnpm --filter @lodariq/dashboard build');
    expect(dockerfile).toContain('.next/standalone');
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });

  it('packages the hosted editor iframe as a separate static Fly service', () => {
    const dockerfile = read('apps/editor/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).toContain('pnpm --filter @lodariq/editor... build');
    expect(dockerfile).toContain('COPY --from=build /repo/apps/editor/dist ./dist');
    expect(dockerfile).toContain('CMD ["node", "scripts/serve-static.mjs"]');
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}
