import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const testDir = join(root, 'test')

// After issue #231, top-level `test/` is split into:
//   - test/contracts/   — cross-cutting invariants (no DB)
//   - test/features/    — unit & feature tests (no DB)
//   - test/integration/ — DB-backed and end-to-end (run by run-integration-tests.mjs)
// This script runs contracts + features. Integration is its own runner.
const includedDirs = ['contracts', 'features']

const args = process.argv.slice(2)
// `--db` is preserved as a no-op alias for backwards compatibility with the
// `npm run test:db` script (now redundant — DB tests live in test/integration/
// and run via `npm run test:integration`). The flag exits cleanly so existing
// CI workflows that still call `test:db:parallel` keep passing.
const runDbAlias = args.includes('--db')
const runParallel = args.includes('--parallel')
const testTimeoutMs = 10000

if (runDbAlias) {
  // The DB-backed tests have moved to test/integration/ and run via the
  // dedicated integration runner. The legacy `--db` flag still applies
  // migrations to the test database (so a downstream seed step in the
  // same CI job can rely on the schema being present), then exits cleanly.
  if (!process.env.DATABASE_URL_TEST) {
    console.error('[tests] DATABASE_URL_TEST is required when invoking with --db.')
    process.exit(1)
  }
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: process.env.DATABASE_URL_TEST },
    stdio: 'inherit',
  })
  console.log('[tests] --db: migrations applied. DB tests now live in test/integration/.')
  process.exit(0)
}

function collectTestFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      out.push(...collectTestFiles(fullPath))
    } else if (entry.endsWith('.test.ts')) {
      out.push(fullPath)
    }
  }
  return out
}

const testFiles = includedDirs
  .flatMap(sub => collectTestFiles(join(testDir, sub)))
  .map(file => relative(root, file))
  .sort()

if (testFiles.length === 0) {
  console.error('[tests] No matching test files found.')
  process.exit(1)
}

const nodeArgs = []
const childEnv = {
  ...process.env,
}

nodeArgs.push('--import', 'tsx', '--test', `--test-timeout=${testTimeoutMs}`)

if (runParallel) {
  nodeArgs.push('--test-concurrency=8')
}

nodeArgs.push(...testFiles)

const result = spawnSync(process.execPath, nodeArgs, {
  cwd: root,
  stdio: 'inherit',
  env: childEnv,
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
