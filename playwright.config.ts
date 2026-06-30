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

export default defineConfig({
  testDir: './packages/tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @lodariq/api run dev:e2e',
      url: 'http://127.0.0.1:3001/healthz',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        HOST: '127.0.0.1',
        PORT: '3001',
        LODARIQ_DEV_WORKSPACE_ID: 'wk_dashboard_e2e',
        LODARIQ_DEV_USER_ID: 'user_dashboard_e2e',
      },
    },
    {
      command: 'pnpm --filter @lodariq/dashboard run dev:e2e',
      url: 'http://127.0.0.1:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        LODARIQ_API_BASE_URL: 'http://127.0.0.1:3001',
        LODARIQ_WORKSPACE_ID: 'wk_dashboard_e2e',
        LODARIQ_DASHBOARD_USER_ID: 'user_dashboard_e2e',
      },
    },
    {
      command: 'pnpm --filter @lodariq/fixture-host exec vite --host 127.0.0.1 --port 4177',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @lodariq/customer-like-host exec vite --host 127.0.0.1 --port 4188',
      url: 'http://127.0.0.1:4188',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects,
});
