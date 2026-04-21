import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('admin users detail page emits a low-cardinality view audit event', () => {
  const source = read('src/app/(admin)/admin/usuarios/[id]/page.tsx')
  assert.match(source, /ADMIN_USER_DETAIL_VIEWED/)
  assert.match(source, /createAuditLog\(/)
  assert.match(source, /getAuditRequestIp\(/)
})

test('admin users password reset action records a dedicated audit event', () => {
  const source = read('src/domains/admin/users/actions.ts')
  assert.match(source, /ADMIN_USER_PASSWORD_RESET_REQUESTED/)
  assert.match(source, /createAuditLog\(/)
})
