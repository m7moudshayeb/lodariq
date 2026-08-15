import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('Fly deployment packaging', () => {
  it('uses explicit monorepo Dockerfiles for the API and dashboard services', () => {
    for (const path of [
      'apps/api/fly.toml',
      'apps/api/fly.development.toml',
      'apps/api/fly.staging.toml',
      'apps/dashboard/fly.toml',
      'apps/dashboard/fly.development.toml',
      'apps/dashboard/fly.staging.toml',
      'apps/editor/fly.toml',
      'apps/editor/fly.development.toml',
      'apps/editor/fly.staging.toml',
    ]) {
      expect(read(path)).toContain('dockerfile = "Dockerfile"');
    }
  });

  it('does not run declaration workers while packaging verified deployment images', () => {
    for (const path of [
      'apps/api/Dockerfile',
      'apps/dashboard/Dockerfile',
      'apps/editor/Dockerfile',
    ]) {
      const dockerfile = read(path);
      expect(dockerfile).toContain('LODARIQ_BUILD_DECLARATIONS="false"');
      expect(dockerfile).not.toContain('LODARIQ_BUILD_DECLARATIONS=true');
      expect(dockerfile).not.toContain('NODE_OPTIONS');
    }
  });

  it('builds deployment images from pre-verified JavaScript bundles without declaration workers', () => {
    const deploymentImages: ReadonlyArray<readonly [string, string]> = [
      ['apps/api/Dockerfile', '@lodariq/api'],
      ['apps/dashboard/Dockerfile', '@lodariq/dashboard'],
      ['apps/editor/Dockerfile', '@lodariq/editor'],
    ];
    for (const [path, packageName] of deploymentImages) {
      const dockerfile = read(path);
      expect(dockerfile).toContain('LODARIQ_BUILD_DECLARATIONS="false"');
      expect(dockerfile).toContain(`pnpm --filter ${packageName}... build:deploy`);
      expect(dockerfile.match(/RUN pnpm .*build(?::deploy)?/gu)).toHaveLength(1);
    }

    for (const path of [
      'apps/api/package.json',
      'apps/dashboard/package.json',
      'apps/editor/package.json',
      'packages/schema/package.json',
      'packages/i18n/package.json',
      'packages/compiler/package.json',
      'packages/database/package.json',
      'packages/sdk-runtime/package.json',
      'packages/sdk-authoring/package.json',
    ]) {
      expect(JSON.parse(read(path)).scripts['build:deploy']).toBeTruthy();
    }
  });

  it('keeps Development, Staging, and Production Fly apps and public origins separate', () => {
    expect(read('apps/api/fly.development.toml')).toContain('app = "lodariq-api-dev"');
    expect(read('apps/api/fly.development.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/api/fly.development.toml')).toContain(
      'LODARIQ_PUBLIC_API_BASE_URL = "https://dev-api.lodariq.io"',
    );
    expect(read('apps/api/fly.development.toml')).toContain(
      'LODARIQ_LOADER_SRC = "https://dev-cdn.lodariq.io/sdk/lodariq-loader.js"',
    );
    expect(read('apps/api/fly.development.toml')).toContain(
      'LODARIQ_PUBLIC_LOADER_SRC = "https://dev-cdn.lodariq.io/sdk/lodariq-public-bootstrap.js"',
    );
    expect(read('apps/api/fly.development.toml')).toContain(
      'LODARIQ_CREATOR_LOADER_SRC = "https://dev-cdn.lodariq.io/sdk/lodariq-creator.js"',
    );

    expect(read('apps/api/fly.toml')).toContain('app = "lodariq-api"');
    expect(read('apps/api/fly.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_PUBLIC_API_BASE_URL = "https://api.lodariq.io"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_LOADER_SRC = "https://cdn.lodariq.io/sdk/lodariq-loader.js"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_PUBLIC_LOADER_SRC = "https://cdn.lodariq.io/sdk/lodariq-public-bootstrap.js"',
    );
    expect(read('apps/api/fly.toml')).toContain(
      'LODARIQ_CREATOR_LOADER_SRC = "https://cdn.lodariq.io/sdk/lodariq-creator.js"',
    );

    expect(read('apps/api/fly.staging.toml')).toContain('app = "lodariq-api-staging"');
    expect(read('apps/api/fly.staging.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_PUBLIC_API_BASE_URL = "https://staging-api.lodariq.io"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_LOADER_SRC = "https://staging-cdn.lodariq.io/sdk/lodariq-loader.js"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_PUBLIC_LOADER_SRC = "https://staging-cdn.lodariq.io/sdk/lodariq-public-bootstrap.js"',
    );
    expect(read('apps/api/fly.staging.toml')).toContain(
      'LODARIQ_CREATOR_LOADER_SRC = "https://staging-cdn.lodariq.io/sdk/lodariq-creator.js"',
    );

    expect(read('apps/dashboard/fly.toml')).toContain('app = "lodariq-dashboard"');
    expect(read('apps/dashboard/fly.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/dashboard/fly.toml')).toContain(
      'LODARIQ_API_BASE_URL = "https://api.lodariq.io"',
    );

    expect(read('apps/dashboard/fly.development.toml')).toContain('app = "lodariq-dashboard-dev"');
    expect(read('apps/dashboard/fly.development.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/dashboard/fly.development.toml')).toContain(
      'LODARIQ_API_BASE_URL = "https://dev-api.lodariq.io"',
    );

    expect(read('apps/dashboard/fly.staging.toml')).toContain('app = "lodariq-dashboard-staging"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain('LODARIQ_AUTH_MODE = "lodariq"');
    expect(read('apps/dashboard/fly.staging.toml')).toContain(
      'LODARIQ_API_BASE_URL = "https://staging-api.lodariq.io"',
    );

    expect(read('apps/editor/fly.toml')).toContain('app = "lodariq-editor"');
    expect(read('apps/editor/fly.development.toml')).toContain('app = "lodariq-editor-dev"');
    expect(read('apps/editor/fly.staging.toml')).toContain('app = "lodariq-editor-staging"');
  });

  it('does not configure Clerk or a signing secret for opaque owned sessions', () => {
    const ownedAuthFlyConfigs = [
      'apps/api/fly.toml',
      'apps/api/fly.development.toml',
      'apps/api/fly.staging.toml',
      'apps/dashboard/fly.toml',
      'apps/dashboard/fly.development.toml',
      'apps/dashboard/fly.staging.toml',
    ];

    for (const path of ownedAuthFlyConfigs) {
      const config = read(path);
      expect(config).toContain('LODARIQ_AUTH_MODE = "lodariq"');
      expect(config).not.toMatch(/CLERK_|AUTH_SECRET|SESSION_SECRET/u);
    }
  });

  it('keeps Production public auth fail-closed and enables full Development and Staging auth', () => {
    for (const path of ['apps/api/fly.toml', 'apps/dashboard/fly.toml']) {
      const config = read(path);
      expect(config).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "disabled"');
      expect(config).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "disabled"');
    }

    const developmentApi = read('apps/api/fly.development.toml');
    expect(developmentApi).toContain('LODARIQ_APP_BASE_URL = "https://dev-app.lodariq.io"');
    expect(developmentApi).toContain(
      'LODARIQ_AUTH_EMAIL_FROM = "Lodariq Development <access@dev.lodariq.io>"',
    );
    expect(developmentApi).toContain('LODARIQ_EMAIL_DELIVERY_MODE = "resend"');
    expect(developmentApi).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "email-verification"');
    expect(developmentApi).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "email"');

    const developmentDashboard = read('apps/dashboard/fly.development.toml');
    expect(developmentDashboard).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "email-verification"');
    expect(developmentDashboard).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "email"');

    const stagingApi = read('apps/api/fly.staging.toml');
    expect(stagingApi).toContain('LODARIQ_APP_BASE_URL = "https://staging-app.lodariq.io"');
    expect(stagingApi).toContain(
      'LODARIQ_AUTH_EMAIL_FROM = "Lodariq Staging <access@staging.lodariq.io>"',
    );
    expect(stagingApi).toContain('LODARIQ_EMAIL_DELIVERY_MODE = "resend"');
    expect(stagingApi).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "email-verification"');
    expect(stagingApi).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "email"');

    const stagingDashboard = read('apps/dashboard/fly.staging.toml');
    expect(stagingDashboard).toContain('LODARIQ_PUBLIC_SIGNUP_MODE = "email-verification"');
    expect(stagingDashboard).toContain('LODARIQ_PASSWORD_RECOVERY_MODE = "email"');
  });

  it('routes Fly traffic only to services whose explicit health endpoint is ready', () => {
    const apiFlyConfigs = [
      'apps/api/fly.toml',
      'apps/api/fly.development.toml',
      'apps/api/fly.staging.toml',
    ];
    const livenessFlyConfigs = [
      'apps/dashboard/fly.toml',
      'apps/dashboard/fly.development.toml',
      'apps/dashboard/fly.staging.toml',
      'apps/editor/fly.toml',
      'apps/editor/fly.development.toml',
      'apps/editor/fly.staging.toml',
    ];

    for (const path of [...apiFlyConfigs, ...livenessFlyConfigs]) {
      const config = read(path);
      expect(config).toContain('cpu_kind = "shared"');
      expect(config).toContain('cpus = 1');
      // Development API needs 512 MB: Argon2id (64 MB) plus Node/Neon OOM'd the 256 MB box.
      expect(config).toContain(path === 'apps/api/fly.development.toml' ? 'memory = "512mb"' : 'memory = "256mb"');
      expect(config).toContain('[[http_service.checks]]');
      expect(config).toContain('method = "GET"');
      expect(config).toContain('timeout = "3s"');
    }
    for (const path of apiFlyConfigs) expect(read(path)).toContain('path = "/readyz"');
    for (const path of livenessFlyConfigs) expect(read(path)).toContain('path = "/healthz"');
    expect(read('apps/api/src/routes/control-plane/register-health-and-cors.ts')).toContain(
      'await options.repository.checkReadiness()',
    );
    expect(read('apps/dashboard/src/app/healthz/route.ts')).toContain('{ ok: true }');
    expect(read('apps/dashboard/src/proxy.ts')).toContain("'/healthz'");
    expect(read('apps/editor/scripts/serve-static.mjs')).toContain(
      "requestPathname(request.url) === '/healthz'",
    );
  });

  it('allows non-production to scale to zero while Production keeps one warm Machine', () => {
    const scaleToZeroConfigs = [
      'apps/api/fly.development.toml',
      'apps/dashboard/fly.development.toml',
      'apps/editor/fly.development.toml',
      'apps/api/fly.staging.toml',
      'apps/dashboard/fly.staging.toml',
      'apps/editor/fly.staging.toml',
    ];
    const productionConfigs = [
      'apps/api/fly.toml',
      'apps/dashboard/fly.toml',
      'apps/editor/fly.toml',
    ];

    for (const path of scaleToZeroConfigs) {
      expect(read(path)).toContain('auto_stop_machines = "stop"');
      expect(read(path)).toContain('auto_start_machines = true');
      expect(read(path)).toContain('min_machines_running = 0');
    }
    for (const path of productionConfigs) {
      expect(read(path)).toContain('min_machines_running = 1');
    }
  });

  it('runs push verification on the actual default branch', () => {
    const workflow = read('.github/workflows/verify.yml');
    expect(workflow).toContain('branches: [master]');
    expect(workflow).not.toContain('branches: [main]');
    const actionReferences = [...workflow.matchAll(/^\s*-?\s*uses:\s+[^@\s]+@([^\s]+)$/gmu)].map(
      (match) => match[1] ?? '',
    );
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /^[a-f0-9]{40}$/u.test(reference))).toBe(true);
  });

  it('packages the API with pnpm deploy after building the Fastify app', () => {
    const dockerfile = read('apps/api/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).not.toContain("--filter '@lodariq/api^...' build");
    expect(dockerfile).not.toContain('@lodariq/api... typecheck');
    expect(dockerfile).toContain('pnpm --filter @lodariq/api... build:deploy');
    expect(dockerfile).toContain('pnpm --filter @lodariq/api deploy --prod /out');
    expect(dockerfile).toContain('apps/api/scripts/check-runtime-env.mjs');
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "node check-runtime-env.mjs && exec node dist/server.js"]',
    );
  });

  it('packages the Next standalone dashboard server without Vercel assumptions', () => {
    const dockerfile = read('apps/dashboard/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).not.toContain("--filter '@lodariq/dashboard^...' build");
    expect(dockerfile).not.toContain('@lodariq/dashboard... typecheck');
    expect(dockerfile).toContain('pnpm --filter @lodariq/dashboard... build:deploy');
    expect(dockerfile).toContain('LODARIQ_DEPLOYMENT_BUNDLE="true"');
    expect(dockerfile).toContain('.next/standalone');
    expect(dockerfile).toContain('apps/dashboard/scripts/check-runtime-env.mjs');
    expect(dockerfile).toContain(
      'CMD ["sh", "-c", "node check-runtime-env.mjs && exec node server.js"]',
    );
    expect(read('apps/dashboard/next.config.mjs')).toContain(
      "ignoreBuildErrors: process.env.LODARIQ_DEPLOYMENT_BUNDLE === 'true'",
    );
  });

  it('packages the hosted editor iframe as a separate static Fly service', () => {
    const dockerfile = read('apps/editor/Dockerfile');
    expect(dockerfile).toContain('FROM node:24-slim AS build');
    expect(dockerfile).not.toContain("--filter '@lodariq/editor^...' build");
    expect(dockerfile).not.toContain('@lodariq/editor... typecheck');
    expect(dockerfile).toContain('pnpm --filter @lodariq/editor... build:deploy');
    expect(dockerfile).toContain('COPY --from=build /repo/apps/editor/dist ./dist');
    expect(dockerfile).toContain('CMD ["node", "scripts/serve-static.mjs"]');
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}
