import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1 --port 3000',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // E2E tests below mock the browser-facing APIs. These URLs only satisfy
      // server-side imports if a Next route is accidentally compiled during dev.
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable',
      DIRECT_URL:
        process.env.DIRECT_URL ??
        'postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable',
      DASHSCOPE_MODEL: process.env.DASHSCOPE_MODEL ?? 'ci-model',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'playwright-auth-secret',
      AUTH_URL: process.env.AUTH_URL ?? baseURL,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? baseURL,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
