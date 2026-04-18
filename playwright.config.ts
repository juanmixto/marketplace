import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for marketplace E2E tests.
 *
 * Run with:
 *   npm run test:e2e         — full suite (all specs)
 *   npm run test:e2e:smoke   — smoke only (specs tagged @smoke)
 *
 * Required env:
 *   DATABASE_URL_TEST  Postgres URL for an isolated DB seeded by `npm run db:seed`.
 *
 * webServer mode (which Next.js command to run under Playwright):
 *   - Local default:           `next dev`  (fast reload, forgiving)
 *   - CI / any prod verification: `next start` — the real production
 *     server after a completed `next build`. Triggered by setting
 *     `PLAYWRIGHT_USE_PROD=1`. Catches prod-only bugs (minification,
 *     revalidatePath timing, React.cache semantics) that dev mode
 *     silently masks. See #379 and docs/ci-testing-strategy.md §2.
 *
 * The dev/start server is started by Playwright via `webServer`, talking
 * to the test DB. Tests assume the seed data is present
 * (admin@marketplace.com, productor@test.com, cliente@test.com —
 * see prisma/seed.ts).
 *
 * Parallelism: fullyParallel is enabled so specs across files can run
 * concurrently, but workers are capped at 2 in CI because all tests share
 * one seeded Postgres instance. Per-worker data isolation is tracked in
 * #380.
 */
const useProdServer = process.env.PLAYWRIGHT_USE_PROD === '1'
const webServerUrl = 'http://localhost:3001'
const webServerDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  process.env.DATABASE_URL ??
  'postgresql://mp_user:mp_pass@localhost:5432/marketplace_test'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
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
        // Prod mode (`next start`) requires a prior `next build`. The CI
        // job arranges that by depending on the `build` job and
        // downloading its `.next` artifact before Playwright runs.
        command: useProdServer ? 'npm run start' : 'npm run dev',
        url: webServerUrl,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: webServerDatabaseUrl,
          DATABASE_URL_TEST: webServerDatabaseUrl,
          AUTH_URL: webServerUrl,
          NEXT_PUBLIC_APP_URL: webServerUrl,
          PORT: '3001',
          // `next start` refuses to run with NODE_ENV=test. Dev mode is
          // forgiving. Use production for the prod path, test for dev.
          NODE_ENV: useProdServer ? 'production' : 'test',
          PAYMENT_PROVIDER: 'mock',
          // Phase 4b-β: enable the buyer-side subscribe CTA + mutations so
          // the subscriptions smoke can exercise the full mock checkout
          // flow. No-op if the running server already has it set.
          SUBSCRIPTIONS_BUYER_BETA: 'true',
        },
      },
})
