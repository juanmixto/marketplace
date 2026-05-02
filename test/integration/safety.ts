/**
 * Safety check for `resetIntegrationDatabase` and any other helper that
 * issues a destructive TRUNCATE / DELETE against the database the test
 * process is connected to.
 *
 * Background. Every worktree in the multi-agent setup shares the same
 * `.env.local` with `DATABASE_URL` pointing at the dev database
 * `marketplace`. The integration runner
 * (`scripts/run-integration-tests.mjs`) overrides this with
 * `DATABASE_URL_TEST` before forking the test process — so when tests
 * are invoked through the runner, `DATABASE_URL` is the test DB. But
 * a test invoked OUTSIDE that runner — e.g. `node --test
 * test/integration/foo.test.ts` from a normal shell, an IDE Test
 * Explorer, or a stray `tsx` invocation — inherits the dev URL and
 * truncates every row in the live dev database. The 2026-04-29
 * incident was exactly this: the dev DB went from a full seed to a
 * single row left over from one e2e test.
 *
 * The check is two-factor on purpose:
 *
 *   1. `NODE_ENV === 'test'` — both the integration runner and the
 *      Playwright webServer set this; `next dev` never does. Catches
 *      "agent ran a test from a normal dev shell".
 *
 *   2. The database name must end in `_test`. Catches "agent set
 *      NODE_ENV=test by hand but forgot to point DATABASE_URL at the
 *      test DB", which would defeat (1) on its own.
 *
 * Either alone is bypassable; together they make accidental dev-DB
 * truncation structurally impossible (modulo someone intentionally
 * naming a non-test database `*_test`, which is on them).
 */

export function assertSafeToTruncate(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error(
      `[resetIntegrationDatabase] refusing to TRUNCATE: NODE_ENV is "${env.NODE_ENV ?? '<unset>'}", expected "test". ` +
        `Run integration tests via \`npm run test:integration\` (which sets NODE_ENV=test and DATABASE_URL=$DATABASE_URL_TEST), ` +
        `not directly with \`node --test\`.`,
    )
  }

  const url = env.DATABASE_URL ?? ''
  const dbName = parseDatabaseName(url)
  if (!dbName || !/_test$/.test(dbName)) {
    throw new Error(
      `[resetIntegrationDatabase] refusing to TRUNCATE non-test database "${dbName ?? '<unparseable>'}". ` +
        `The database name must end in "_test". ` +
        `Set DATABASE_URL_TEST to a *_test database and invoke via \`npm run test:integration\`.`,
    )
  }
}

export function parseDatabaseName(connectionString: string): string | null {
  try {
    const u = new URL(connectionString)
    const name = u.pathname.replace(/^\//, '')
    return name || null
  } catch {
    return null
  }
}
