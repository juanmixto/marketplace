import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST is required to run integration tests')
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: process.env.DATABASE_URL_TEST,
}

// Migrations are applied by the caller (CI step or local `test:db`
// script) before invoking this runner. Skipping the redundant
// `prisma migrate deploy` here saves ~2s per shard on every PR.
if (process.env.SKIP_MIGRATE !== '1' && !process.env.CI) {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })
}

const integrationDir = path.join(process.cwd(), 'test', 'integration')
const allFiles = readdirSync(integrationDir)
  .filter(file => file.endsWith('.test.ts'))
  .sort()
  .map(file => path.join(integrationDir, file))

if (allFiles.length === 0) {
  throw new Error('No integration test files found')
}

// Optional CI-only sharding. Each shard runs a disjoint subset of the
// sorted test file list. Matrix jobs in .github/workflows/ci.yml set
// TEST_SHARD_INDEX (0-based) and TEST_SHARD_TOTAL, giving each runner
// its own isolated postgres service and its own set of tests.
// When neither env var is set (local dev, nightly, any historical
// caller), the runner executes every test file in the same process.
const shardTotal = parseInt(process.env.TEST_SHARD_TOTAL ?? '1', 10)
const shardIndex = parseInt(process.env.TEST_SHARD_INDEX ?? '0', 10)

if (shardTotal < 1 || Number.isNaN(shardTotal)) {
  throw new Error(`TEST_SHARD_TOTAL must be a positive integer, got ${process.env.TEST_SHARD_TOTAL}`)
}
if (shardIndex < 0 || shardIndex >= shardTotal || Number.isNaN(shardIndex)) {
  throw new Error(`TEST_SHARD_INDEX (${process.env.TEST_SHARD_INDEX}) must satisfy 0 <= index < TEST_SHARD_TOTAL (${shardTotal})`)
}

// Round-robin distribution so file-name ordering does not bias one
// shard. Test files tend to be named by domain (order-*, stripe-*,
// vendor-*) — a contiguous chunk-split would put all stripe tests on
// one shard and starve the other.
const files = allFiles.filter((_, idx) => idx % shardTotal === shardIndex)

if (files.length === 0) {
  console.error(
    `[integration] shard ${shardIndex}/${shardTotal} has no files to run; exiting cleanly.`,
  )
  process.exit(0)
}

if (shardTotal > 1) {
  console.log(
    `[integration] running shard ${shardIndex + 1}/${shardTotal} — ${files.length} of ${allFiles.length} files`,
  )
}

// Two cohorts, run as separate `node --test` invocations:
//
//   1. Shared-isolation cohort (fast): files that reset the DB in a
//      top-level `beforeEach` and do not rely on long-lived fixtures.
//      Because their teardown is per-test, sharing a process is
//      safe — module cache (tsx transform + Prisma client + @/...
//      imports) stays hot across files, saving ~10s per file.
//
//   2. Default-isolation cohort: files that build fixtures in a
//      top-level `describe` + `beforeAll`. In shared mode the other
//      cohort's globally-registered `beforeEach(resetDB)` would fire
//      before every `it()` here and wipe those fixtures. Keeping
//      these on the default (process-per-file) runner is cheap —
//      there are only a handful.
//
// Detection is a cheap source scan: a file is a "fixture" file iff
// it calls `describe(` AND registers a `before(` / `beforeAll(` hook.
// This matches settlement-calculation, stock-concurrency,
// stock-availability, email-verification, gdpr-compliance today.
function classifyFile(filePath) {
  const src = readFileSync(filePath, 'utf8')
  const usesDescribe = /^describe\(/m.test(src)
  const usesBeforeAll = /^\s*(beforeAll|before)\(/m.test(src)
  return usesDescribe && usesBeforeAll ? 'isolated' : 'shared'
}

const cohorts = { shared: [], isolated: [] }
for (const file of files) {
  cohorts[classifyFile(file)].push(file)
}

// Shared-isolation is stable in Node 24, experimental in 22. Fall
// back to the default on older majors (local dev on 20).
const nodeMajor = Number(process.versions.node.split('.')[0])
const sharedIsolationFlag =
  nodeMajor >= 24 ? '--test-isolation=none'
  : nodeMajor === 22 ? '--experimental-test-isolation=none'
  : null

function runCohort(cohortName, cohortFiles) {
  if (cohortFiles.length === 0) return
  const extraFlags = []
  // Both cohorts use shared-process isolation when the runtime
  // supports it. Safe because:
  //   - shared cohort: every file truncates in its own top-level
  //     beforeEach, so cross-file state leakage is impossible.
  //   - isolated cohort: no file registers a top-level beforeEach,
  //     so the shared cohort's globally-registered reset hooks are
  //     NOT present in this invocation (it's a separate process),
  //     and the isolated files use disjoint fixture tables with
  //     Date.now()-suffixed identifiers to avoid collision.
  if (sharedIsolationFlag) {
    extraFlags.push(sharedIsolationFlag)
  }
  console.log(
    `[integration] cohort=${cohortName} files=${cohortFiles.length}${
      extraFlags.length ? ` flags=${extraFlags.join(',')}` : ''
    }`,
  )
  execFileSync(
    process.execPath,
    ['--import', 'tsx', '--test-concurrency=1', ...extraFlags, '--test', ...cohortFiles],
    { cwd: process.cwd(), env, stdio: 'inherit' },
  )
}

runCohort('shared', cohorts.shared)
runCohort('isolated', cohorts.isolated)
