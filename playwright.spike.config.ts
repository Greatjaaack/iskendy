import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.cache/ms-playwright');

export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-spike', open: 'never' }],
  ],
  outputDir: 'test-results-spike',
  use: {
    baseURL: 'http://127.0.0.1:8099',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
});
