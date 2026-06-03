import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite e2e/fixtures --host 127.0.0.1 --port 4300',
    url: 'http://127.0.0.1:4300/google-forms.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
