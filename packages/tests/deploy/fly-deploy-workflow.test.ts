import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const workflow = read('.github/workflows/deploy-fly.yml');
const ciWorkflow = read('.github/workflows/verify.yml');
const e2eWorkflow = read('.github/workflows/e2e.yml');
const deployAction = read('.github/actions/deploy-fly/action.yml');
const rootPackage = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const prepareScript = read('scripts/deployment/prepare-fly-deployment.mjs');
const targetsScript = read('scripts/deployment/fly-targets.mjs');
const preflightScript = read('scripts/deployment/check-fly-resources.mjs');
const sdkOutputsScript = read('scripts/deployment/write-sdk-outputs.mjs');
const probesScript = read('scripts/deployment/probe-fly-services.mjs');
const deploymentSources = [
  workflow,
  deployAction,
  prepareScript,
  targetsScript,
  preflightScript,
  probesScript,
].join('\n');

describe('Fly deployment workflow', () => {
  it('keeps manual deployments separate while CI deploys Development in its own run', () => {
    const trigger = section(workflow, 'on:', 'permissions:');
    const triggerNames = [...trigger.matchAll(/^ {2}([a-z_]+):$/gmu)].map((match) => match[1]);

    expect(triggerNames).toEqual(['workflow_dispatch']);
    expect(trigger).not.toContain('push:');
    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).toContain(
      'options:\n          - development\n          - staging\n          - production',
    );
    expect(workflow).toContain('uses: ./.github/actions/deploy-fly');
    expect(ciWorkflow).toContain('uses: ./.github/actions/deploy-fly');
    expect(ciWorkflow).not.toContain('uses: ./.github/workflows/deploy-fly.yml');
    expect(ciWorkflow).toContain('target: development');
    expect(ciWorkflow).toContain("build_verified: 'true'");
    expect(ciWorkflow).toContain('name: fly-development');
  });

  it('keeps manual E2E independent from deployment while retaining selectable browser coverage', () => {
    const trigger = section(e2eWorkflow, 'on:', 'permissions:');
    const triggerNames = [...trigger.matchAll(/^ {2}([a-z_]+):$/gmu)].map((match) => match[1]);

    expect(triggerNames).toEqual(['workflow_dispatch']);
    expect(trigger).not.toContain('pull_request:');
    expect(trigger).not.toContain('push:');
    expect(trigger).not.toContain('workflow_run:');
    expect(e2eWorkflow).toContain('default: chromium');
    expect(e2eWorkflow).toContain(
      'options:\n          - chromium\n          - firefox\n          - webkit\n          - all',
    );
    expect(e2eWorkflow).toContain('pnpm run test:e2e -- --project="$SELECTED_BROWSER"');
    expect(e2eWorkflow).toContain('if: ${{ always() }}');
    expect(ciWorkflow).not.toContain('  end-to-end-tests:');
    expect(rootPackage.scripts['verify']).not.toContain('test:e2e');
    expect(rootPackage.scripts['test:e2e']).toContain('playwright test');
  });

  it('starts Development after static checks, build, and audit without waiting for unit tests', () => {
    const deployment = ciWorkflow.slice(ciWorkflow.indexOf('  deploy-development:'));

    for (const prerequisite of ['static-checks', 'build', 'dependency-audit']) {
      expect(deployment).toContain(`- ${prerequisite}`);
    }
    expect(deployment).not.toContain('- unit-tests');
    expect(deployment).not.toContain('- end-to-end-tests');
    expect(deployment).toContain('!cancelled()');
    expect(deployment).toContain("needs.static-checks.result == 'success'");
    expect(deployment).toContain("needs.build.result == 'success'");
    expect(deployment).toContain("needs.dependency-audit.result == 'success'");
    expect(deployment).not.toContain('needs.unit-tests.result');
    expect(deployment).not.toContain('needs.end-to-end-tests.result');
  });

  it('requires a successful build for manual deployment without running tests as gates', () => {
    const buildIndex = position(deployAction, '- name: Build and bundle deployment inputs');
    const prepareIndex = position(deployAction, '- name: Prepare manually built SDK assets');
    const assetsIndex = position(
      deployAction,
      '- name: Publish verified SDK assets to existing R2 bucket',
    );

    expect(deployAction).toContain("if: ${{ inputs.build_verified != 'true' }}");
    expect(deployAction).toContain('pnpm run build');
    expect(deployAction).toContain('pnpm run size');
    expect(deployAction).not.toContain('pnpm verify');
    expect(deployAction).not.toContain('test:e2e');
    expect(deployAction).not.toContain('pnpm run test');
    expect(deployAction).not.toContain('playwright install');
    expect(deployAction).not.toContain('image: postgres:');
    expect(prepareIndex).toBeGreaterThan(buildIndex);
    expect(buildIndex).toBeLessThan(assetsIndex);
  });

  it('transfers the exact Development SDK assets from the successful build job', () => {
    expect(ciWorkflow).toContain('name: Preserve verified Development SDK assets');
    expect(ciWorkflow).toContain('LODARIQ_CDN_ORIGIN: https://dev-cdn.lodariq.io');
    expect(ciWorkflow).toContain('path: dist/sdk-assets');
    expect(ciWorkflow).toContain('if-no-files-found: error');
    expect(ciWorkflow).toContain('retention-days: 1');
    expect(deployAction).toContain('name: Restore SDK assets from the verified build');
    expect(deployAction).toContain("if: ${{ inputs.build_verified == 'true' }}");

    const artifactName = 'name: lodariq-sdk-assets-${{ github.sha }}';
    expect(ciWorkflow).toContain(artifactName);
    expect(deployAction).toContain(artifactName);
  });

  it('validates automatic, branch-selected, Staging, and Production trigger policy', () => {
    expect(prepareScript).toContain(
      'Automatic Development deployment requires a successful master build.',
    );
    expect(prepareScript).toContain('Unverified deployments must be started manually.');
    expect(prepareScript).toContain('requires a manual dispatch from master.');
    expect(prepareScript).toContain('Production requires the exact confirmation phrase.');
    expect(prepareScript).toContain("const PRODUCTION_CONFIRMATION = 'DEPLOY PRODUCTION'");

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lodariq-deploy-test-'));
    const outputPath = join(temporaryDirectory, 'outputs');
    try {
      const result = spawnSync(
        process.execPath,
        ['scripts/deployment/prepare-fly-deployment.mjs'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'push',
            GITHUB_REF_NAME: 'master',
            REQUESTED_TARGET: 'development',
            BUILD_VERIFIED: 'true',
            PRODUCTION_CONFIRMATION: '',
            GITHUB_OUTPUT: outputPath,
          },
        },
      );

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(readFileSync(outputPath, 'utf8')).toContain('target=development');
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('maps all targets to their exact existing apps, configs, and canonical origins', () => {
    const expectedValues = [
      'lodariq-editor-dev',
      'apps/editor/fly.development.toml',
      'https://dev-editor.lodariq.io',
      'lodariq-api-dev',
      'apps/api/fly.development.toml',
      'https://dev-api.lodariq.io',
      'lodariq-dashboard-dev',
      'apps/dashboard/fly.development.toml',
      'https://dev-app.lodariq.io',
      'https://dev-cdn.lodariq.io',
      'lodariq-assets-development',
      'lodariq-editor-staging',
      'apps/editor/fly.staging.toml',
      'https://staging-editor.lodariq.io',
      'lodariq-api-staging',
      'apps/api/fly.staging.toml',
      'https://staging-api.lodariq.io',
      'lodariq-dashboard-staging',
      'apps/dashboard/fly.staging.toml',
      'https://staging-app.lodariq.io',
      'https://staging-cdn.lodariq.io',
      'lodariq-assets-staging',
      'https://editor.lodariq.io',
      'https://api.lodariq.io',
      'https://app.lodariq.io',
      'https://cdn.lodariq.io',
      'lodariq-assets-production',
    ];

    for (const value of expectedValues) expect(targetsScript).toContain(`'${value}'`);
    expect(prepareScript).toContain('validateTargetConfigs(target)');
    expect(prepareScript).toContain('configuredApps[0] !== expectedApp');
  });

  it('pins every action and the Fly CLI while using Node 24 and frozen pnpm 9 installs', () => {
    const actionReferences = [workflow, ciWorkflow, e2eWorkflow, deployAction].flatMap((source) =>
      [...source.matchAll(/^\s*uses:\s+[^@\s]+@([^\s]+)$/gmu)].map((match) => match[1]),
    );

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) expect(reference).toMatch(/^[a-f0-9]{40}$/u);
    expect(deployAction).toContain('node-version: 24');
    expect(deployAction).toContain('version: 9.15.9');
    expect(deployAction).toContain('version: 0.4.80');
    expect(deployAction).toContain('pnpm install --frozen-lockfile --ignore-scripts');
  });

  it('keeps the mutation sequence visible after the build gate', () => {
    const buildIndex = position(deployAction, '- name: Build and bundle deployment inputs');
    const assetsIndex = position(
      deployAction,
      '- name: Publish verified SDK assets to existing R2 bucket',
    );
    const editorIndex = position(deployAction, '- name: Deploy editor');
    const apiIndex = position(deployAction, '- name: Deploy API');
    const dashboardIndex = position(deployAction, '- name: Deploy dashboard');
    const probesIndex = position(deployAction, '- name: Probe deployed services');

    expect(buildIndex).toBeLessThan(assetsIndex);
    expect(assetsIndex).toBeLessThan(editorIndex);
    expect(editorIndex).toBeLessThan(apiIndex);
    expect(apiIndex).toBeLessThan(dashboardIndex);
    expect(dashboardIndex).toBeLessThan(probesIndex);
    expect(
      deployAction.match(
        /flyctl deploy --local-only --update-only --no-public-ips --skip-release-command/gmu,
      ),
    ).toHaveLength(3);
  });

  it('fails closed without a token or already-provisioned apps and Machines', () => {
    expect(workflow).toContain('fly_api_token: ${{ secrets.FLY_API_TOKEN }}');
    expect(ciWorkflow).toContain('fly_api_token: ${{ secrets.FLY_API_TOKEN }}');
    expect(deployAction).toContain('FLY_API_TOKEN: ${{ inputs.fly_api_token }}');
    expect(deployAction).toContain('node scripts/deployment/check-fly-resources.mjs');
    expect(preflightScript).toContain('if (!environment.FLY_API_TOKEN)');
    expect(preflightScript).toContain("['status', '--app', appName]");
    expect(preflightScript).toContain("['machine', 'list', '--app', appName, '--json']");
    expect(preflightScript).toContain('machines.length === 0');
  });

  it('contains no database, resource-provisioning, secret, or network-control mutation', () => {
    const forbiddenCommands = [
      /flyctl\s+launch\b/iu,
      /flyctl\s+apps?\s+create\b/iu,
      /flyctl\s+machines?\s+(?:create|clone|run)\b/iu,
      /flyctl\s+(?:postgres|redis|volumes?|ips?|certs?|secrets?)\b/iu,
      /flyctl\s+deploy[^\n]*(?:--ha|--vm-|--volume-initial-size)/iu,
      /flyctl\s+deploy[^\n]*--remote-only/iu,
      /(?:drizzle|migrat\w*)\s+(?:apply|deploy|push|run|up)\b/iu,
      /(?:psql|createdb)\b/iu,
      /(?:cloudflare|dns|cdn)\s+(?:create|update|delete|mutate|purge)\b/iu,
    ];

    for (const command of forbiddenCommands) expect(deploymentSources).not.toMatch(command);
  });

  it('publishes reviewed SDK assets only to the selected existing R2 bucket', () => {
    const uploadSection = section(
      deployAction,
      '- name: Publish verified SDK assets to existing R2 bucket',
      '- name: Deploy editor',
    );
    const publisher = read('scripts/publish-sdk-assets.mjs');

    expect(uploadSection).toContain('node scripts/publish-sdk-assets.mjs');
    expect(uploadSection).toContain('node scripts/deployment/write-sdk-outputs.mjs');
    expect(uploadSection).not.toContain('pnpm sdk:prepare-assets');
    expect(workflow).toContain('r2_account_id: ${{ secrets.R2_ACCOUNT_ID }}');
    expect(workflow).toContain('r2_access_key_id: ${{ secrets.R2_ACCESS_KEY_ID }}');
    expect(workflow).toContain('r2_secret_access_key: ${{ secrets.R2_SECRET_ACCESS_KEY }}');
    expect(uploadSection).toContain('R2_ACCOUNT_ID: ${{ inputs.r2_account_id }}');
    expect(uploadSection).toContain('AWS_ACCESS_KEY_ID: ${{ inputs.r2_access_key_id }}');
    expect(uploadSection).toContain('AWS_SECRET_ACCESS_KEY: ${{ inputs.r2_secret_access_key }}');
    expect(publisher).toContain("'head-bucket'");
    expect(publisher).toContain("'put-object'");
    expect(publisher).toContain("'head-object'");
    expect(publisher).not.toMatch(/delete-object|delete-bucket|create-bucket/iu);
    expect(sdkOutputsScript).toContain('Prepared SDK manifest has no creator module identity.');
    expect(deployAction).toContain('--env "LODARIQ_CREATOR_MODULE_URL=$CREATOR_MODULE_URL"');
    // Without this the API has no digest to pin and every issued snippet ships
    // unpinned, which is the state ADR-0027 closed.
    expect(sdkOutputsScript).toContain('Prepared SDK manifest has no public loader identity.');
    expect(sdkOutputsScript).toContain('public_loader_integrity=');
    // Pinning the loader must stay opt-in. It is served from a stable URL whose
    // bytes change every deploy, so an always-on digest would break every page
    // still carrying a previously issued snippet.
    expect(deployAction).toContain("default: 'false'");
    expect(deployAction).toContain("inputs.pin_public_loader_integrity == 'true'");
    expect(deployAction).toContain(
      '--env "LODARIQ_PUBLIC_LOADER_INTEGRITY=$PUBLIC_LOADER_INTEGRITY"',
    );
  });

  it('probes every exact public endpoint and validates the returned contracts', () => {
    expect(deployAction).toContain('node scripts/deployment/probe-fly-services.mjs');
    expect(probesScript).toContain("new URL('/healthz', editorOrigin)");
    expect(probesScript).toContain("new URL('/readyz', apiOrigin)");
    expect(probesScript).toContain("new URL('/healthz', dashboardOrigin)");
    expect(probesScript).toContain("new URL('/v1/openapi.json', apiOrigin)");
    expect(probesScript).toContain("value?.openapi !== '3.0.3'");
    expect(probesScript).toContain('Lodariq Control API');
    expect(probesScript).toContain("new URL('/authoring.html', editorOrigin)");
    expect(probesScript).toContain('<div id="authoring" data-state="waiting">');
    expect(probesScript).toContain("url.protocol !== 'https:'");
    expect(probesScript).toContain("redirect: 'manual'");
    expect(probesScript).toContain("redirectedUrl.protocol !== 'https:'");
    expect(deployAction).toContain('echo "- Ref: $GITHUB_REF_NAME"');
    expect(deployAction).toContain('echo "- Commit: $GITHUB_SHA"');
  });

  it('keeps the orchestration workflow compact', () => {
    expect(workflow.split('\n').length).toBeLessThan(80);
    expect(deployAction.split('\n').length).toBeLessThan(190);
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function section(source: string, start: string, end: string): string {
  return source.slice(position(source, start), position(source, end));
}

function position(source: string, value: string): number {
  const index = source.indexOf(value);
  expect(index, `Expected workflow to contain ${value}`).toBeGreaterThanOrEqual(0);
  return index;
}
