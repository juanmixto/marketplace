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
        // Prod mode (`next start`) requires a prior `next build`. The CI
        // job arranges that by depending on the `build` job and
        // downloading its `.next` artifact before Playwright runs.
        command: useProdServer
          ? 'node ./scripts/start-playwright-webserver.mjs --prod'
          : 'node ./scripts/start-playwright-webserver.mjs',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
