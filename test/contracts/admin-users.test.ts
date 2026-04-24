import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('admin sidebar exposes the users entry', () => {
  const source = read('src/components/admin/AdminSidebar.tsx')
  assert.match(source, /\/admin\/usuarios/)
})

test('admin users list page is a compact overview with filters', () => {
  const source = read('src/app/(admin)/admin/usuarios/page.tsx')
  assert.match(source, /getAdminUsersCopy/)
  assert.match(source, /copy\.search/)
  assert.match(source, /copy\.statuses/)
  assert.match(source, /copy\.roles/)
  assert.match(source, /statusBadge/)
})

test('admin user detail page surfaces the main account summary', () => {
  const source = read('src/app/(admin)/admin/usuarios/\[id\]/page.tsx')
  assert.match(source, /getAdminUsersCopy/)
  assert.match(source, /detail\.back/)
  assert.match(source, /detail\.accountState/)
  assert.match(source, /detail\.relationships/)
  assert.match(source, /MiniStat/)
})
