import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const testDir = join(root, 'test')

const dbBackedTests = new Set([
  'email-verification.test.ts',
  'gdpr-compliance.test.ts',
  'settlement-calculation.test.ts',
  'stock-availability.test.ts',
  'stock-concurrency.test.ts',
])

const args = process.argv.slice(2)
const runDbTests = args.includes('--db')
const runParallel = args.includes('--parallel')
const testTimeoutMs = runDbTests ? 30000 : 10000

const testFiles = readdirSync(testDir)
  .filter(file => file.endsWith('.test.ts'))
  .filter(file => runDbTests ? dbBackedTests.has(file) : !dbBackedTests.has(file))
  .sort()
  .map(file => join('test', file))

if (testFiles.length === 0) {
  console.error('[tests] No matching test files found.')
  process.exit(1)
}

const nodeArgs = []
const childEnv = {
  ...process.env,
}

if (runDbTests) {
  if (!process.env.DATABASE_URL_TEST) {
    console.error('[tests] DATABASE_URL_TEST is required for DB-backed tests.')
    process.exit(1)
  }

  childEnv.NODE_ENV = 'test'
  childEnv.DATABASE_URL = process.env.DATABASE_URL_TEST

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
  })
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
