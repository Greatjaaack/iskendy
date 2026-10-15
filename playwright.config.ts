import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.cache/ms-playwright');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/*kit.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'kit-webkit',
      testMatch: '**/*kit.spec.ts',
      testIgnore: [],
      use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'kit',
      testMatch: '**/*kit.spec.ts',
      testIgnore: [],
      use: {
        ...devices['Desktop Chrome'],
        ...chromium,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'android',
      use: {
        ...devices['Pixel 5'],
        ...chromium,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        ...chromium,
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'desktop-1024',
      use: {
        ...devices['Desktop Chrome'],
        ...chromium,
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        ...chromium,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:mock -- --port 5176',
      url: 'http://127.0.0.1:5176/dev/scenarios.html',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command:
        'npm run build && npm run preview -- --host 127.0.0.1 --port 4181',
      url: 'http://127.0.0.1:4181',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:mock -- --e2e',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:kit',
      url: 'http://127.0.0.1:5174/dev/kit.html',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
