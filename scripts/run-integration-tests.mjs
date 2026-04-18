import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
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

// Default `node --test` isolation mode runs every file in its own
// subprocess, which pays a ~10s cold-start cost per file (tsx
// transform + Prisma client init + module graph). On Node 22.8+ we
// can opt into shared-process isolation, which keeps the module
// cache hot across files and cuts each shard by ~60-80s. Falls back
// transparently on older Node versions (local dev on 20).
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
const supportsSharedIsolation =
  nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 8)

const nodeArgs = ['--import', 'tsx', '--test-concurrency=1']
if (supportsSharedIsolation) {
  nodeArgs.push('--test-isolation=none')
}
nodeArgs.push('--test', ...files)

execFileSync(process.execPath, nodeArgs, {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})
