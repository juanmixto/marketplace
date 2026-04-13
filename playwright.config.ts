import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for marketplace E2E tests (#41).
 *
 * Run with:
 *   npm run test:e2e
 *
 * Required env:
 *   DATABASE_URL_TEST  Postgres URL for an isolated DB seeded by `npm run db:seed`.
 *
 * The dev server is started by Playwright via `webServer`, talking to the
 * test DB. Tests assume the seed data is present (admin@marketplace.com,
 * productor@test.com, cliente@test.com — see prisma/seed.ts).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '',
          NODE_ENV: 'test',
          PAYMENT_PROVIDER: 'mock',
        },
      },
})
