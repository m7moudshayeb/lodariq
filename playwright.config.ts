import { defineConfig, devices } from '@playwright/test';

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
];

if (process.env.LODARIQ_E2E_EDGE === '1') {
  projects.push({
    name: 'edge',
    use: { ...devices['Desktop Edge'], channel: 'msedge' },
  });
}

const apiPort = process.env.LODARIQ_E2E_API_PORT ?? '3001';
const dashboardPort = process.env.LODARIQ_E2E_DASHBOARD_PORT ?? '3002';
const fixtureHostPort = process.env.LODARIQ_E2E_FIXTURE_HOST_PORT ?? '4177';
const customerLikeHostPort = process.env.LODARIQ_E2E_CUSTOMER_LIKE_HOST_PORT ?? '4188';
const apiBaseURL = `http://127.0.0.1:${apiPort}`;
const dashboardBaseURL = `http://127.0.0.1:${dashboardPort}`;
const fixtureHostBaseURL = `http://127.0.0.1:${fixtureHostPort}`;
const customerLikeHostBaseURL = `http://127.0.0.1:${customerLikeHostPort}`;
const requestedWebServers = new Set(
  (process.env.LODARIQ_E2E_WEB_SERVERS ?? 'api,dashboard,fixture-host,customer-like-host')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);
const shouldStartWebServer = (name: string): boolean => requestedWebServers.has(name);

export default defineConfig({
  testDir: './packages/tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: fixtureHostBaseURL,
    trace: 'retain-on-failure',
  },
  webServer: [
    ...(shouldStartWebServer('api')
      ? [
          {
            command: 'pnpm --filter @lodariq/api run dev:e2e',
            url: `${apiBaseURL}/healthz`,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
            env: {
              HOST: '127.0.0.1',
              PORT: apiPort,
              LODARIQ_DEV_WORKSPACE_ID: 'wk_dashboard_e2e',
              LODARIQ_DEV_USER_ID: 'user_dashboard_e2e',
            },
          },
        ]
      : []),
    ...(shouldStartWebServer('dashboard')
      ? [
          {
            command:
              `pnpm --filter @lodariq/dashboard exec next dev --hostname 127.0.0.1 --port ${dashboardPort}`,
            url: dashboardBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
            env: {
              LODARIQ_API_BASE_URL: apiBaseURL,
              LODARIQ_WORKSPACE_ID: 'wk_dashboard_e2e',
              LODARIQ_DASHBOARD_USER_ID: 'user_dashboard_e2e',
            },
          },
        ]
      : []),
    ...(shouldStartWebServer('fixture-host')
      ? [
          {
            command:
              `pnpm --filter @lodariq/fixture-host exec vite --host 127.0.0.1 --port ${fixtureHostPort}`,
            url: fixtureHostBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]
      : []),
    ...(shouldStartWebServer('customer-like-host')
      ? [
          {
            command:
              `pnpm --filter @lodariq/customer-like-host exec vite --host 127.0.0.1 --port ${customerLikeHostPort}`,
            url: customerLikeHostBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
        ]
      : []),
  ],
  projects,
});
