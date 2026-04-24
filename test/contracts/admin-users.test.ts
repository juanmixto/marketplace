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
  assert.match(source, /Usuarios/)
  assert.match(source, /Buscar/)
  assert.match(source, /Estado/)
  assert.match(source, /roleLabel/)
  assert.match(source, /statusBadge/)
})

test('admin user detail page surfaces the main account summary', () => {
  const source = read('src/app/(admin)/admin/usuarios/\[id\]/page.tsx')
  assert.match(source, /Volver a usuarios/)
  assert.match(source, /Estado de cuenta/)
  assert.match(source, /Relaciones/)
  assert.match(source, /MiniStat/)
})
