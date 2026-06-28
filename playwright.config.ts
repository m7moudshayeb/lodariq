import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './packages/tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @talmeh/fixture-host exec vite --host 127.0.0.1 --port 4177',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
