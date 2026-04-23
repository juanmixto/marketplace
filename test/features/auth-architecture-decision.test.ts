import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('auth architecture decision documents why PrismaAdapter + JWT stays in place', () => {
  const adr = readSource('../../docs/adr/001-nextauth-prismaadapter-jwt.md')
  const auth = readSource('../../src/lib/auth.ts')
  const authConfig = readSource('../../src/lib/auth-config.ts')

  assert.match(adr, /\*\*Status:\*\*\s+Accepted/)
  assert.match(adr, /PrismaAdapter\(db\)/)
  assert.match(adr, /session:\s*\{\s*strategy:\s*'jwt'\s*\}/i)
  assert.match(adr, /credential login/i)
  assert.match(adr, /JWT/)
  assert.match(adr, /role propagation/i)
  assert.match(adr, /host-only cookie/i)
  assert.match(auth, /docs\/adr\/001-nextauth-prismaadapter-jwt\.md/)
  assert.match(auth, /PrismaAdapter\(db\)/)
  assert.match(auth, /session:\s+\{ strategy: 'jwt' \}/)
  assert.match(authConfig, /authorized\(/)
  assert.match(authConfig, /isAdminRoute/)
  assert.match(authConfig, /isVendorRoute/)
})
