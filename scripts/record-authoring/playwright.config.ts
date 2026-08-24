import { defineConfig, devices } from '@playwright/test';

/**
 * A recording rig, not a test suite.
 *
 * It lives outside `packages/tests/e2e` on purpose: the root Playwright config
 * globs that directory, and a 20-second video capture has no business running
 * in CI. Nothing here asserts product behaviour — the assertions exist only so
 * that a missing control fails loudly instead of producing a silently broken clip.
 *
 * Only fixture-host is started. The authoring surface is entirely local
 * (`mountLocalAuthoringDevFrame` + `lodariq-local-dev`), so no API and no
 * database are involved.
 */
const port = process.env.LODARIQ_RECORD_PORT ?? '4180';

export default defineConfig({
  testDir: '.',
  testMatch: /authoring-clip\.spec\.ts/,
  timeout: 180_000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  outputDir: 'artifacts',
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    // Playwright scales the capture to `size`; keeping it equal to the viewport
    // avoids a resample before ffmpeg gets it.
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    launchOptions: {
      // The clip is about the product, not about a browser deciding to animate
      // its own scrollbars differently on one machine than another.
      args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
    },
  },
  webServer: {
    // `run dev -- --port` forwards the `--` itself under pnpm 9, so vite ignores
    // the port and binds its default; `exec` passes the flags through cleanly.
    // `--host 127.0.0.1` because vite's default bind answers on ::1 only, which
    // the IPv4 `url` below can never reach.
    command: `pnpm --filter @lodariq/fixture-host exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    cwd: '../..',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
