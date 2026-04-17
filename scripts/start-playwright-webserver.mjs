import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'

function readEnvFile(relativePath) {
  const filePath = resolve(process.cwd(), relativePath)
  if (!existsSync(filePath)) return {}

  const out = {}
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }

  return out
}

const fileEnv = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...readEnvFile('.env.test'),
}

const explicitTestDatabaseUrl = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST
const databaseUrl =
  explicitTestDatabaseUrl ?? process.env.DATABASE_URL ?? fileEnv.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'Playwright web server requires DATABASE_URL or DATABASE_URL_TEST (process env or .env files).',
  )
}

const sharedEnv = {
  ...fileEnv,
  ...process.env,
  DATABASE_URL: databaseUrl,
  DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST ?? databaseUrl,
  AUTH_SECRET: process.env.AUTH_SECRET ?? fileEnv.AUTH_SECRET ?? 'test-auth-secret',
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ?? fileEnv.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? fileEnv.PAYMENT_PROVIDER ?? 'mock',
  SUBSCRIPTIONS_BUYER_BETA:
    process.env.SUBSCRIPTIONS_BUYER_BETA ?? fileEnv.SUBSCRIPTIONS_BUYER_BETA ?? 'true',
}

if (explicitTestDatabaseUrl) {
  execFileSync(
    process.execPath,
    [
      './node_modules/prisma/build/index.js',
      'migrate',
      'reset',
      '--force',
    ],
    {
      cwd: process.cwd(),
      env: sharedEnv,
      stdio: 'inherit',
    },
  )
} else {
  execFileSync(
    process.execPath,
    ['./node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      cwd: process.cwd(),
      env: sharedEnv,
      stdio: 'inherit',
    },
  )
}

execFileSync(
  process.execPath,
  ['--import', 'tsx', 'prisma/seed.ts'],
  {
    cwd: process.cwd(),
    env: sharedEnv,
    stdio: 'inherit',
  },
)

const useProdServer = process.argv.includes('--prod')
const child = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', useProdServer ? 'start' : 'dev'],
  {
    cwd: process.cwd(),
    env: {
      ...sharedEnv,
      NODE_ENV: useProdServer ? 'production' : 'test',
    },
    stdio: 'inherit',
  },
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('exit', code => {
  process.exit(code ?? 0)
})
