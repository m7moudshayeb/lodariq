import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const workflow = read('.github/workflows/deploy-fly.yml');

describe('manual Fly deployment workflow', () => {
  it('can only be dispatched manually for an explicit staging or production target', () => {
    const trigger = section('on:', 'permissions:');
    const triggerNames = [...trigger.matchAll(/^ {2}([a-z_]+):$/gmu)].map((match) => match[1]);

    expect(triggerNames).toEqual(['workflow_dispatch']);
    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).toContain('type: choice');
    expect(trigger).toContain('options:\n          - staging\n          - production');
  });

  it('requires typed production confirmation and scopes approval and concurrency by target', () => {
    expect(workflow).toContain('production_confirmation:');
    expect(workflow).toContain('if [[ "$PRODUCTION_CONFIRMATION" != "DEPLOY PRODUCTION" ]]');
    expect(workflow).toContain('name: fly-${{ inputs.target }}');
    expect(workflow).toContain('group: fly-deploy-${{ inputs.target }}');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('contents: read');
  });

  it('maps both targets to their exact existing apps, configs, and canonical origins', () => {
    const expectedMappings = [
      'editor_app=lodariq-editor-staging',
      'editor_config=apps/editor/fly.staging.toml',
      'editor_origin=https://staging-editor.lodariq.io',
      'api_app=lodariq-api-staging',
      'api_config=apps/api/fly.staging.toml',
      'api_origin=https://staging-api.lodariq.io',
      'dashboard_app=lodariq-dashboard-staging',
      'dashboard_config=apps/dashboard/fly.staging.toml',
      'dashboard_origin=https://staging-app.lodariq.io',
      'cdn_origin=https://staging-cdn.lodariq.io',
      'r2_bucket=lodariq-assets-staging',
      'editor_app=lodariq-editor',
      'editor_config=apps/editor/fly.toml',
      'editor_origin=https://editor.lodariq.io',
      'api_app=lodariq-api',
      'api_config=apps/api/fly.toml',
      'api_origin=https://api.lodariq.io',
      'dashboard_app=lodariq-dashboard',
      'dashboard_config=apps/dashboard/fly.toml',
      'dashboard_origin=https://app.lodariq.io',
      'cdn_origin=https://cdn.lodariq.io',
      'r2_bucket=lodariq-assets-production',
    ];

    for (const mapping of expectedMappings) {
      expect(workflow).toContain(mapping);
    }
  });

  it('pins every action and the Fly CLI while using Node 24 and frozen pnpm 9 installs', () => {
    const actionReferences = [...workflow.matchAll(/^\s*uses:\s+[^@\s]+@([^\s]+)$/gmu)].map(
      (match) => match[1],
    );

    expect(actionReferences).toHaveLength(4);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^[a-f0-9]{40}$/u);
    }
    expect(workflow).toContain('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803');
    expect(workflow).toContain('pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86');
    expect(workflow).toContain('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
    expect(workflow).toContain(
      'superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1',
    );
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('version: 9.15.9');
    expect(workflow).toContain('version: 0.4.80');
    expect(workflow).toContain('pnpm install --frozen-lockfile --ignore-scripts');
  });

  it('runs the complete gate before SDK assets, editor, API, then dashboard', () => {
    const verifyIndex = position('run: pnpm verify');
    const assetsIndex = position('- name: Publish verified SDK assets to existing R2 bucket');
    const editorIndex = position('- name: Deploy editor');
    const apiIndex = position('- name: Deploy API');
    const dashboardIndex = position('- name: Deploy dashboard');
    const probesIndex = position('- name: Probe deployed services');

    expect(verifyIndex).toBeLessThan(editorIndex);
    expect(verifyIndex).toBeLessThan(assetsIndex);
    expect(assetsIndex).toBeLessThan(editorIndex);
    expect(editorIndex).toBeLessThan(apiIndex);
    expect(apiIndex).toBeLessThan(dashboardIndex);
    expect(dashboardIndex).toBeLessThan(probesIndex);
    expect(
      workflow.match(
        /flyctl deploy --local-only --update-only --no-public-ips --skip-release-command/gmu,
      ),
    ).toHaveLength(3);
    expect(workflow.match(/--app "\$FLY_APP"/gmu)).toHaveLength(3);
    expect(workflow.match(/--config "\$FLY_CONFIG"/gmu)).toHaveLength(3);
  });

  it('fails closed without a token or already-provisioned apps and Machines', () => {
    const verifyIndex = position('run: pnpm verify');
    const preflightIndex = position('- name: Require token and existing Fly resources');
    const editorIndex = position('- name: Deploy editor');

    expect(workflow).toContain('FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}');
    expect(workflow).toContain('if [[ -z "${FLY_API_TOKEN:-}" ]]');
    expect(workflow).toContain('flyctl status --app "$app_name"');
    expect(workflow).toContain('flyctl machine list --app "$app_name" --json');
    expect(workflow).toContain('machines.length === 0');
    expect(verifyIndex).toBeLessThan(preflightIndex);
    expect(preflightIndex).toBeLessThan(editorIndex);
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

    for (const command of forbiddenCommands) {
      expect(workflow).not.toMatch(command);
    }
  });

  it('publishes reviewed SDK assets only to the selected existing R2 bucket', () => {
    const uploadSection = section(
      '- name: Publish verified SDK assets to existing R2 bucket',
      '- name: Deploy editor',
    );
    const publisher = read('scripts/publish-sdk-assets.mjs');

    expect(uploadSection).toContain('pnpm sdk:prepare-assets');
    expect(uploadSection).toContain('node scripts/publish-sdk-assets.mjs');
    expect(uploadSection).toContain('R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}');
    expect(uploadSection).toContain('AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}');
    expect(uploadSection).toContain('AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}');
    expect(publisher).toContain("'head-bucket'");
    expect(publisher).toContain("'put-object'");
    expect(publisher).toContain("'head-object'");
    expect(publisher).toContain('Uploaded SDK asset metadata does not match');
    expect(publisher).not.toMatch(/delete-object|delete-bucket|create-bucket/iu);
    expect(workflow).toContain('--env "LODARIQ_CREATOR_MODULE_URL=$CREATOR_MODULE_URL"');
    expect(workflow).toContain('--env "LODARIQ_CREATOR_MODULE_VERSION=$CREATOR_MODULE_VERSION"');
    expect(workflow).toContain(
      '--env "LODARIQ_CREATOR_MODULE_INTEGRITY=$CREATOR_MODULE_INTEGRITY"',
    );
  });

  it('probes every exact public endpoint and validates the returned contracts', () => {
    const probeSection = workflow.slice(position('- name: Probe deployed services'));

    expect(probeSection).toContain('"$EDITOR_ORIGIN/healthz"');
    expect(probeSection).toContain('"$API_ORIGIN/readyz"');
    expect(probeSection).toContain('"$DASHBOARD_ORIGIN/healthz"');
    expect(probeSection).toContain('response.ok !== true');
    expect(probeSection).toContain('Object.keys(response).length !== 1');
    expect(probeSection).toContain('"$API_ORIGIN/openapi.json"');
    expect(probeSection).toContain("document.openapi !== '3.0.3'");
    expect(probeSection).toContain("document.info?.title !== 'Lodariq Control API'");
    expect(probeSection).toContain('"$EDITOR_ORIGIN/authoring.html"');
    expect(probeSection).toContain('<div id="authoring" data-state="waiting">');
    expect(probeSection).toContain("--proto '=https'");
    expect(probeSection).not.toContain('FLY_API_TOKEN');
    expect(workflow).toContain('echo "- Commit: $GITHUB_SHA"');
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
