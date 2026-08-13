import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const workflow = read('.github/workflows/deploy-fly.yml');
const ciWorkflow = read('.github/workflows/verify.yml');
const prepareScript = read('scripts/deployment/prepare-fly-deployment.mjs');
const targetsScript = read('scripts/deployment/fly-targets.mjs');
const preflightScript = read('scripts/deployment/check-fly-resources.mjs');
const sdkOutputsScript = read('scripts/deployment/write-sdk-outputs.mjs');
const probesScript = read('scripts/deployment/probe-fly-services.mjs');
const deploymentSources = [
  workflow,
  prepareScript,
  targetsScript,
  preflightScript,
  probesScript,
].join('\n');

describe('Fly deployment workflow', () => {
  it('is called by CI for automatic Development and exposes every target manually', () => {
    const trigger = section('on:', 'permissions:');
    const triggerNames = [...trigger.matchAll(/^ {2}([a-z_]+):$/gmu)].map((match) => match[1]);

    expect(triggerNames).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(trigger).not.toContain('push:');
    expect(trigger).toContain('build_verified:');
    expect(trigger).toContain('type: boolean');
    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).toContain(
      'options:\n          - development\n          - staging\n          - production',
    );
    expect(ciWorkflow).toContain('uses: ./.github/workflows/deploy-fly.yml');
    expect(ciWorkflow).toContain('target: development');
    expect(ciWorkflow).toContain('build_verified: true');
  });

  it('waits for all CI signals but blocks Development only on build failure or cancellation', () => {
    const deployment = ciWorkflow.slice(ciWorkflow.indexOf('  deploy-development:'));

    for (const prerequisite of [
      'static-checks',
      'unit-tests',
      'build',
      'end-to-end-tests',
      'dependency-audit',
    ]) {
      expect(deployment).toContain(`- ${prerequisite}`);
    }
    expect(deployment).toContain('!cancelled()');
    expect(deployment).toContain("needs.build.result == 'success'");
    expect(deployment).not.toContain('needs.unit-tests.result');
    expect(deployment).not.toContain('needs.end-to-end-tests.result');
    expect(deployment).not.toContain('needs.static-checks.result');
    expect(deployment).not.toContain('needs.dependency-audit.result');
  });

  it('requires a successful build for manual deployment without running tests as gates', () => {
    const buildIndex = position('- name: Build and bundle deployment inputs');
    const assetsIndex = position('- name: Publish verified SDK assets to existing R2 bucket');

    expect(workflow).toContain('if: ${{ inputs.build_verified != true }}');
    expect(workflow).toContain('pnpm run build');
    expect(workflow).toContain('pnpm run size');
    expect(workflow).not.toContain('pnpm verify');
    expect(workflow).not.toContain('test:e2e');
    expect(workflow).not.toContain('pnpm run test');
    expect(workflow).not.toContain('playwright install');
    expect(workflow).not.toContain('image: postgres:');
    expect(buildIndex).toBeLessThan(assetsIndex);
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
    const actionReferences = [...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s]+)$/gmu)].map(
      (match) => match[1],
    );

    expect(actionReferences).toHaveLength(4);
    for (const reference of actionReferences) expect(reference).toMatch(/^[a-f0-9]{40}$/u);
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('version: 9.15.9');
    expect(workflow).toContain('version: 0.4.80');
    expect(workflow).toContain('pnpm install --frozen-lockfile --ignore-scripts');
  });

  it('keeps the mutation sequence visible after the build gate', () => {
    const buildIndex = position('- name: Build and bundle deployment inputs');
    const assetsIndex = position('- name: Publish verified SDK assets to existing R2 bucket');
    const editorIndex = position('- name: Deploy editor');
    const apiIndex = position('- name: Deploy API');
    const dashboardIndex = position('- name: Deploy dashboard');
    const probesIndex = position('- name: Probe deployed services');

    expect(buildIndex).toBeLessThan(assetsIndex);
    expect(assetsIndex).toBeLessThan(editorIndex);
    expect(editorIndex).toBeLessThan(apiIndex);
    expect(apiIndex).toBeLessThan(dashboardIndex);
    expect(dashboardIndex).toBeLessThan(probesIndex);
    expect(
      workflow.match(
        /flyctl deploy --local-only --update-only --no-public-ips --skip-release-command/gmu,
      ),
    ).toHaveLength(3);
  });

  it('fails closed without a token or already-provisioned apps and Machines', () => {
    expect(workflow).toContain('FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}');
    expect(workflow).toContain('node scripts/deployment/check-fly-resources.mjs');
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
      '- name: Publish verified SDK assets to existing R2 bucket',
      '- name: Deploy editor',
    );
    const publisher = read('scripts/publish-sdk-assets.mjs');

    expect(uploadSection).toContain('pnpm sdk:prepare-assets');
    expect(uploadSection).toContain('node scripts/publish-sdk-assets.mjs');
    expect(uploadSection).toContain('node scripts/deployment/write-sdk-outputs.mjs');
    expect(uploadSection).toContain('R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}');
    expect(uploadSection).toContain('AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}');
    expect(uploadSection).toContain('AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}');
    expect(publisher).toContain("'head-bucket'");
    expect(publisher).toContain("'put-object'");
    expect(publisher).toContain("'head-object'");
    expect(publisher).not.toMatch(/delete-object|delete-bucket|create-bucket/iu);
    expect(sdkOutputsScript).toContain('Prepared SDK manifest has no creator module identity.');
    expect(workflow).toContain('--env "LODARIQ_CREATOR_MODULE_URL=$CREATOR_MODULE_URL"');
  });

  it('probes every exact public endpoint and validates the returned contracts', () => {
    expect(workflow).toContain('node scripts/deployment/probe-fly-services.mjs');
    expect(probesScript).toContain("new URL('/healthz', editorOrigin)");
    expect(probesScript).toContain("new URL('/readyz', apiOrigin)");
    expect(probesScript).toContain("new URL('/healthz', dashboardOrigin)");
    expect(probesScript).toContain("new URL('/openapi.json', apiOrigin)");
    expect(probesScript).toContain("value?.openapi !== '3.0.3'");
    expect(probesScript).toContain('Lodariq Control API');
    expect(probesScript).toContain("new URL('/authoring.html', editorOrigin)");
    expect(probesScript).toContain('<div id="authoring" data-state="waiting">');
    expect(probesScript).toContain("url.protocol !== 'https:'");
    expect(probesScript).toContain("redirect: 'manual'");
    expect(probesScript).toContain("redirectedUrl.protocol !== 'https:'");
    expect(workflow).toContain('echo "- Ref: $GITHUB_REF_NAME"');
    expect(workflow).toContain('echo "- Commit: $GITHUB_SHA"');
  });

  it('keeps the orchestration workflow compact', () => {
    expect(workflow.split('\n').length).toBeLessThan(230);
  });
});

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function section(start: string, end: string): string {
  return workflow.slice(position(start), position(end));
}

function position(value: string): number {
  const index = workflow.indexOf(value);
  expect(index, `Expected workflow to contain ${value}`).toBeGreaterThanOrEqual(0);
  return index;
}
