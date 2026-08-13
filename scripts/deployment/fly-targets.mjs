export const FLY_TARGETS = Object.freeze({
  development: Object.freeze({
    editor_app: 'lodariq-editor-dev',
    editor_config: 'apps/editor/fly.development.toml',
    editor_origin: 'https://dev-editor.lodariq.io',
    api_app: 'lodariq-api-dev',
    api_config: 'apps/api/fly.development.toml',
    api_origin: 'https://dev-api.lodariq.io',
    dashboard_app: 'lodariq-dashboard-dev',
    dashboard_config: 'apps/dashboard/fly.development.toml',
    dashboard_origin: 'https://dev-app.lodariq.io',
    cdn_origin: 'https://dev-cdn.lodariq.io',
    r2_bucket: 'lodariq-assets-development',
    r2_jurisdiction: 'eu',
  }),
  staging: Object.freeze({
    editor_app: 'lodariq-editor-staging',
    editor_config: 'apps/editor/fly.staging.toml',
    editor_origin: 'https://staging-editor.lodariq.io',
    api_app: 'lodariq-api-staging',
    api_config: 'apps/api/fly.staging.toml',
    api_origin: 'https://staging-api.lodariq.io',
    dashboard_app: 'lodariq-dashboard-staging',
    dashboard_config: 'apps/dashboard/fly.staging.toml',
    dashboard_origin: 'https://staging-app.lodariq.io',
    cdn_origin: 'https://staging-cdn.lodariq.io',
    r2_bucket: 'lodariq-assets-staging',
    r2_jurisdiction: 'eu',
  }),
  production: Object.freeze({
    editor_app: 'lodariq-editor',
    editor_config: 'apps/editor/fly.toml',
    editor_origin: 'https://editor.lodariq.io',
    api_app: 'lodariq-api',
    api_config: 'apps/api/fly.toml',
    api_origin: 'https://api.lodariq.io',
    dashboard_app: 'lodariq-dashboard',
    dashboard_config: 'apps/dashboard/fly.toml',
    dashboard_origin: 'https://app.lodariq.io',
    cdn_origin: 'https://cdn.lodariq.io',
    r2_bucket: 'lodariq-assets-production',
    r2_jurisdiction: 'default',
  }),
});

export function getFlyTarget(targetName) {
  const target = FLY_TARGETS[targetName];
  if (target === undefined) {
    throw new Error(`Unsupported deployment target: ${targetName || '(empty)'}.`);
  }
  return target;
}
