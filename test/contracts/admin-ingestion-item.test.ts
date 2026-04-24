import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('admin ingestion item detail page keeps the compact review layout', () => {
  const source = read('src/app/(admin)/admin/ingestion/[itemId]/page.tsx')
  assert.match(source, /Draft de producto/)
  assert.match(source, /Mensaje original/)
  assert.match(source, /Estado de extracción/)
  assert.match(source, /Trazabilidad/)
  assert.match(source, /Acciones/)
  assert.match(source, /Posibles duplicados/)
  assert.match(source, /MiniStat/)
})
