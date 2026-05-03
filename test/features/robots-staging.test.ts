import test from 'node:test'
import assert from 'node:assert/strict'
import robots from '@/app/robots'
import { resetServerEnvCache } from '@/lib/env'

/**
 * Staging deploys must never appear in search results — `appEnv === 'staging'`
 * collapses /robots.txt to a single `Disallow: /`. Production and development
 * keep the granular allow/disallow shape with sitemap link.
 */

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key]
    const value = overrides[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetServerEnvCache()
  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    resetServerEnvCache()
  }
}

test('robots: staging returns Disallow: / and no sitemap', () => {
  withEnv(
    {
      APP_ENV: 'staging',
      NEXT_PUBLIC_APP_URL: 'https://staging.raizdirecta.es',
    },
    () => {
      const result = robots()
      assert.deepEqual(result.rules, { userAgent: '*', disallow: '/' })
      assert.equal(result.sitemap, undefined)
    }
  )
})

test('robots: production keeps granular disallow list and sitemap link', () => {
  withEnv(
    {
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://raizdirecta.es',
    },
    () => {
      const result = robots()
      const rules = result.rules as { userAgent: string; allow: string; disallow: string[] }
      assert.equal(rules.userAgent, '*')
      assert.equal(rules.allow, '/')
      assert.ok(Array.isArray(rules.disallow))
      assert.ok(rules.disallow.includes('/admin'))
      assert.equal(result.sitemap, 'https://raizdirecta.es/sitemap.xml')
    }
  )
})

test('robots: development also returns Disallow: / and no sitemap', () => {
  withEnv(
    {
      APP_ENV: 'development',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
    () => {
      const result = robots()
      assert.deepEqual(result.rules, { userAgent: '*', disallow: '/' })
      assert.equal(result.sitemap, undefined)
    }
  )
})
