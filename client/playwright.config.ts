import { defineConfig, devices } from '@playwright/test';

/**
 * Real E2E config for the power-stats screen. Runs against a real deployed
 * environment (staging by default — https://dev.blockminer.space) rather than
 * spinning up a local dev server, since the app needs a real backend + DB +
 * session/auth stack behind it. NEVER point BASE_URL at production for a test
 * suite that creates accounts.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://dev.blockminer.space',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
