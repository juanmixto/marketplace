import test from 'node:test'
import assert from 'node:assert/strict'
import { authConfig } from '@/lib/auth-config'

const redirect = authConfig.callbacks!.redirect!
const baseUrl = 'https://app.example.com'

async function call(url: string): Promise<string> {
  return redirect({ url, baseUrl })
}

test('redirect: relative path in allow-list is preserved', async () => {
  const result = await call('/checkout')
  assert.equal(result, `${baseUrl}/checkout`)
})

test('redirect: relative path with query is preserved', async () => {
  const result = await call('/productos?cat=verduras')
  assert.equal(result, `${baseUrl}/productos?cat=verduras`)
})

test('redirect: same-origin absolute URL keeps allow-listed path', async () => {
  const result = await call(`${baseUrl}/vendor/dashboard`)
  assert.equal(result, `${baseUrl}/vendor/dashboard`)
})

test('redirect: cross-origin absolute URL falls back to baseUrl', async () => {
  const result = await call('https://evil.com/foo')
  assert.equal(result, baseUrl)
})

test('redirect: protocol-relative URL falls back to baseUrl', async () => {
  const result = await call('//evil.com/foo')
  assert.equal(result, baseUrl)
})

test('redirect: /api/* path is rejected (not in allow-list)', async () => {
  const result = await call('/api/users')
  assert.equal(result, baseUrl)
})

test('redirect: /login itself is rejected (loop guard)', async () => {
  const result = await call('/login')
  assert.equal(result, baseUrl)
})

test('redirect: malformed URL falls back to baseUrl', async () => {
  const result = await call('not-a-url')
  assert.equal(result, baseUrl)
})
