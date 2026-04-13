import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

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
  console.log('[tests] --db is now a no-op; DB-backed tests live in test/integration. Skipping.')
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
