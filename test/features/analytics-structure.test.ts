import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ANALYTICS_DIR = join(process.cwd(), 'src/domains/analytics')

function walkTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

test('analytics domain keeps files small and delegates report computation through report modules', () => {
  const files = walkTsFiles(ANALYTICS_DIR)

  for (const file of files) {
    const lines = readSource(file).split('\n').length
    assert.ok(lines < 250, `${file} is too large (${lines} lines)`)
  }

  const serviceSource = readSource(join(ANALYTICS_DIR, 'service.ts'))
  assert.match(serviceSource, /from '\.\/reports\/kpis'/)
  assert.match(serviceSource, /from '\.\/reports\/sales'/)
  assert.match(serviceSource, /from '\.\/reports\/rankings'/)
  assert.match(serviceSource, /from '\.\/reports\/breakdowns'/)
  assert.match(serviceSource, /from '\.\/reports\/orders'/)
  assert.match(serviceSource, /from '\.\/reports\/options'/)
  assert.doesNotMatch(serviceSource, /\bdb\./)
  assert.doesNotMatch(serviceSource, /\$queryRaw/)
})
