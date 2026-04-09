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

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

const integrationDir = path.join(process.cwd(), 'test', 'integration')
const files = readdirSync(integrationDir)
  .filter(file => file.endsWith('.test.ts'))
  .sort()
  .map(file => path.join(integrationDir, file))

if (files.length === 0) {
  throw new Error('No integration test files found')
}

execFileSync(process.execPath, ['--import', 'tsx', '--test-concurrency=1', '--test', ...files], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})
