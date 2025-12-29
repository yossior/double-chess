import { devices } from '@playwright/test';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  use: {
    headless: true,
    actionTimeout: 5000,
    trace: 'on-first-retry',
    baseURL: 'http://localhost:5173'
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 60 * 1000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
};