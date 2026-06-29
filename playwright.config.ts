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

if (process.env.TALMEH_E2E_EDGE === '1') {
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
      command: 'pnpm --filter @talmeh/fixture-host exec vite --host 127.0.0.1 --port 4177',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @talmeh/customer-like-host exec vite --host 127.0.0.1 --port 4188',
      url: 'http://127.0.0.1:4188',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects,
});
